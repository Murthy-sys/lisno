import { spawn } from "node:child_process";
import { request } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TIMING = Object.freeze({
  readinessMs: 10_000,
  probeMs: 500,
  pollMs: 250,
  restartMs: [1_000, 3_000, 5_000],
  // Leave time for Python shutdown within Render's default 30-second grace.
  nodeDrainMs: 25_000,
  pythonStopMs: 2_000,
});

export function createLaunchConfig(env = process.env, repoRoot = REPO_ROOT) {
  const backendEnv = { ...env };
  const portText = env.ASSISTANT_RULES_PORT ?? "8080";
  const port = /^\d{1,5}$/.test(portText) ? Number(portText) : 0;
  const token = env.ASSISTANT_SERVICE_TOKEN ?? "";
  const drainText = env.LISNO_NODE_DRAIN_MS;
  const requestedDrain = drainText && /^\d{5,6}$/.test(drainText) ? Number(drainText) : 0;
  // Longer drain times require a separately extended platform shutdown grace.
  const validDrain = requestedDrain >= 25_000 && requestedDrain <= 295_000;
  const valid = env.ASSISTANT_MODE === "rules"
    && port >= 1024 && port <= 65535
    && Number(env.PORT ?? 3000) !== port
    && env.ASSISTANT_SERVICE_URL === `http://127.0.0.1:${port}`
    && /^[\x21-\x7e]{32,512}$/.test(token);

  if (!valid) {
    // Do not forward a mistakenly configured remote destination to the backend.
    backendEnv.ASK_LISNO_ENABLED = "false";
    backendEnv.PROJECT_CHAT_AI_ENABLED = "false";
    backendEnv.ASSISTANT_SERVICE_URL = "";
    backendEnv.ASSISTANT_SERVICE_TOKEN = "";
  }

  const serviceRoot = join(repoRoot, "assistant-service");
  const venv = join(serviceRoot, "dist", "rules-venv");
  return {
    rulesEnabled: valid,
    modeRequested: env.ASSISTANT_MODE === "rules",
    port,
    token: valid ? token : "",
    nodeDrainMs: validDrain ? requestedDrain : DEFAULT_TIMING.nodeDrainMs,
    invalidDrainOverride: drainText !== undefined && !validDrain,
    node: { command: process.execPath, args: ["dist/server.js"], cwd: join(repoRoot, "backend"), env: backendEnv },
    python: {
      command: join(venv, "bin", "python"),
      args: ["-m", "lisno_assistant.rules_main"],
      cwd: serviceRoot,
      // Construct this environment instead of filtering a list of known secrets.
      env: {
        PATH: `${join(venv, "bin")}:/usr/local/bin:/usr/bin:/bin`,
        LANG: "C.UTF-8",
        PYTHONPATH: join(serviceRoot, "src"),
        PYTHONUNBUFFERED: "1",
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONNOUSERSITE: "1",
        VIRTUAL_ENV: venv,
        ASSISTANT_SERVICE_TOKEN: valid ? token : "",
        ASSISTANT_RULES_PORT: String(port),
      },
    },
  };
}

// Core HTTP on a literal loopback address deliberately ignores proxy settings.
export function probeRulesReady({ port, token, signal, timeoutMs = 500 }) {
  return new Promise((resolveReady) => {
    let settled = false;
    let req;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolveReady(ready);
      req?.destroy();
    };
    const deadline = setTimeout(() => finish(false), timeoutMs);
    req = request({
      hostname: "127.0.0.1", port, path: "/health/ready", method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      agent: false, signal,
    }, (response) => {
      if (response.statusCode !== 200) return finish(false);
      let body = "";
      response.on("error", () => finish(false));
      response.on("data", (chunk) => {
        body += chunk.toString("utf8");
        if (Buffer.byteLength(body) > 1_024) finish(false);
      });
      response.on("end", () => {
        try {
          const payload = JSON.parse(body);
          finish(payload.status === "ready" && payload.mode === "rules" && payload.protocolVersion === 1);
        } catch { finish(false); }
      });
    });
    req.on("error", () => finish(false));
    req.end();
  });
}

function delay(ms, signal) {
  return new Promise((resolveDelay) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolveDelay();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

export function startSupervisor({
  config = createLaunchConfig(),
  spawnProcess = spawn,
  probe = probeRulesReady,
  log = (event) => process.stdout.write(`[lisno-launcher] ${event}\n`),
  timing = {},
} = {}) {
  const limits = { ...DEFAULT_TIMING, nodeDrainMs: config.nodeDrainMs ?? DEFAULT_TIMING.nodeDrainMs, ...timing };
  const shutdownController = new AbortController();
  let node;
  let python;
  let stopping = false;
  let finished = false;
  let restartCount = 0;
  let exitCode = 0;
  let resolveDone;
  const done = new Promise((resolveExit) => { resolveDone = resolveExit; });

  function complete() {
    if (finished || !stopping || (node && !node.closed) || (python && !python.closed)) return;
    finished = true;
    log("stopped");
    resolveDone(exitCode);
  }

  function stopChild(record, signal, graceMs) {
    if (!record || record.closed || record.stopping) return;
    record.stopping = true;
    record.stopSignal = signal;
    record.controller.abort();
    record.child?.kill(signal);
    record.killTimer = setTimeout(() => {
      if (!record.closed) {
        if (record.kind === "node") {
          exitCode = exitCode || 1;
          log("backend-drain-timeout");
        }
        record.child?.kill("SIGKILL");
      }
    }, graceMs);
  }

  function stopPython() {
    stopChild(python, "SIGTERM", limits.pythonStopMs);
    complete();
  }

  function stop(signal = "SIGTERM", code = 0) {
    if (stopping) return done;
    stopping = true;
    exitCode = code;
    shutdownController.abort();
    // Keep Python available while the backend drains already admitted requests.
    if (node && !node.closed) stopChild(node, signal, limits.nodeDrainMs);
    else stopPython();
    complete();
    return done;
  }

  function launch(kind, settings) {
    const record = { kind, child: undefined, closed: false, stopping: false, stopSignal: undefined, controller: new AbortController(), killTimer: undefined };
    const onClose = (code, signal) => {
      if (record.closed) return;
      record.closed = true;
      record.controller.abort();
      clearTimeout(record.killTimer);
      if (kind === "node") {
        const childExitCode = Number.isInteger(code) && code >= 0 && code <= 255
          ? code
          : signal && signal === record.stopSignal ? 0 : 1;
        if (!stopping) {
          log("backend-exited");
          stop("SIGTERM", childExitCode);
        } else if (childExitCode !== 0) exitCode = childExitCode;
        stopPython();
      } else if (!stopping) {
        log("rules-exited");
        if (restartCount < limits.restartMs.length) {
          const backoff = limits.restartMs[restartCount++];
          log(`rules-restart-${restartCount}`);
          void delay(backoff, shutdownController.signal).then(() => {
            if (!stopping) startPython();
          });
        } else log("rules-restarts-exhausted");
      }
      complete();
    };
    try {
      record.child = spawnProcess(settings.command, settings.args, {
        cwd: settings.cwd, env: settings.env,
        // Raw Python diagnostics can contain request/config details. Emit only
        // the launcher's fixed operational events; preserve existing Node logs.
        stdio: kind === "node" ? ["ignore", "inherit", "inherit"] : "ignore",
        detached: false,
      });
      record.child.once("error", () => {
        log(`${kind === "node" ? "backend" : "rules"}-spawn-failed`);
        // Failed spawn emits close as well. Do not resolve before the child is reaped.
      });
      record.child.once("close", onClose);
    } catch {
      log(`${kind === "node" ? "backend" : "rules"}-spawn-failed`);
      queueMicrotask(() => onClose(1, null));
    }
    return record;
  }

  async function checkReadiness(record) {
    const deadline = Date.now() + limits.readinessMs;
    while (!stopping && !record.closed && !record.controller.signal.aborted && Date.now() < deadline) {
      let ready = false;
      try {
        ready = await probe({ port: config.port, token: config.token, signal: record.controller.signal, timeoutMs: limits.probeMs });
      } catch { /* Diagnostics are deliberately not forwarded. */ }
      if (record.closed || stopping || record.controller.signal.aborted) return;
      if (ready) {
        log("rules-ready");
        return;
      }
      await delay(limits.pollMs, record.controller.signal);
    }
    if (!stopping && !record.closed && !record.controller.signal.aborted) {
      log("rules-readiness-failed");
      stopChild(record, "SIGTERM", limits.pythonStopMs);
    }
  }

  function startPython() {
    if (stopping) return;
    python = launch("python", config.python);
    void checkReadiness(python);
  }

  node = launch("node", config.node);
  log("backend-started");
  if (config.invalidDrainOverride) log("backend-drain-config-invalid-default");
  if (config.rulesEnabled) startPython();
  else log(config.modeRequested ? "rules-invalid-config-disabled" : "rules-disabled");

  return { done, stop };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const supervisor = startSupervisor();
  const onTerm = () => { void supervisor.stop("SIGTERM"); };
  const onInt = () => { void supervisor.stop("SIGINT"); };
  process.once("SIGTERM", onTerm);
  process.once("SIGINT", onInt);
  const code = await supervisor.done;
  process.off("SIGTERM", onTerm);
  process.off("SIGINT", onInt);
  process.exitCode = code;
}
