import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createLaunchConfig, probeRulesReady, startSupervisor } from "./render-start.mjs";

const TOKEN = "synthetic-rules-service-token-for-tests";
const environment = (extra = {}) => ({
  ASSISTANT_MODE: "rules", ASSISTANT_SERVICE_TOKEN: TOKEN,
  ASSISTANT_SERVICE_URL: "http://127.0.0.1:8080",
  ASK_LISNO_ENABLED: "true", PROJECT_CHAT_AI_ENABLED: "false", PORT: "3000", ...extra,
});
const timing = { readinessMs: 40, probeMs: 10, pollMs: 2, restartMs: [2, 4], nodeDrainMs: 20, pythonStopMs: 10 };

async function until(condition, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail("Condition did not become true within the test deadline");
    await pause(2);
  }
}

function fakeProcesses(behavior = () => ({})) {
  const records = [];
  const spawnProcess = (command, args, options) => {
    const index = records.length;
    const controls = behavior(command, index);
    if (controls.throwOnSpawn) throw new Error("synthetic private spawn details");
    const child = new EventEmitter();
    const record = { command, args, options, child, signals: [], closed: false };
    record.close = (code = 0, signal = null) => {
      if (record.closed) return;
      record.closed = true;
      child.emit("close", code, signal);
    };
    child.kill = (signal) => {
      record.signals.push(signal);
      if (!(controls.ignoreTerm && signal !== "SIGKILL")) queueMicrotask(() => record.close(0, signal));
      return true;
    };
    records.push(record);
    if (controls.spawnError) queueMicrotask(() => {
      child.emit("error", new Error("synthetic private credentials"));
      record.close(-2);
    });
    return child;
  };
  return { records, spawnProcess };
}

test("production entrypoints and backend environment are preserved with independent flags", () => {
  const input = environment({ MONGODB_URI: "synthetic-db", JWT_SECRET: "synthetic-jwt", CORS_ORIGIN: "synthetic-origin" });
  const config = createLaunchConfig(input, "/synthetic/repository");
  assert.equal(config.rulesEnabled, true);
  assert.deepEqual(config.node.env, input);
  assert.deepEqual(config.node.args, ["dist/server.js"]);
  assert.equal(config.node.cwd, "/synthetic/repository/backend");
  assert.equal(config.python.command, "/synthetic/repository/assistant-service/dist/rules-venv/bin/python");
  assert.deepEqual(config.python.args, ["-m", "lisno_assistant.rules_main"]);
  assert.equal(config.nodeDrainMs, 25_000);
  assert.equal(config.invalidDrainOverride, false);
});

test("extended Node drain override is bounded and invalid values retain the safe default", () => {
  for (const value of ["25000", "60000", "295000"]) {
    const config = createLaunchConfig(environment({ LISNO_NODE_DRAIN_MS: value }));
    assert.equal(config.nodeDrainMs, Number(value));
    assert.equal(config.invalidDrainOverride, false);
    assert.equal(config.python.env.LISNO_NODE_DRAIN_MS, undefined);
  }
  for (const value of ["", "8000", "24999", "295001", "300000", "60000junk", "-10000"]) {
    const config = createLaunchConfig(environment({ LISNO_NODE_DRAIN_MS: value }));
    assert.equal(config.nodeDrainMs, 25_000);
    assert.equal(config.invalidDrainOverride, true);
    assert.equal(config.rulesEnabled, true);
  }
});

test("Python receives a strict environment allowlist with no parent secrets, proxies or model configuration", () => {
  const input = environment({
    MONGODB_URI: "SECRET_DB", JWT_SECRET: "SECRET_JWT", GEMINI_API_KEY: "SECRET_CLOUD",
    AWS_SECRET_ACCESS_KEY: "SECRET_AWS", HTTP_PROXY: "SECRET_PROXY", HTTPS_PROXY: "SECRET_PROXY",
    ALL_PROXY: "SECRET_PROXY", NODE_OPTIONS: "SECRET_NODE", PYTHONPATH: "SECRET_IMPORT",
    PYTHONHOME: "SECRET_RUNTIME", LD_PRELOAD: "SECRET_LIBRARY", HOME: "SECRET_HOME",
    PATH: "SECRET_PATH", ASSISTANT_MODEL_URL: "SECRET_MODEL", UNKNOWN_FUTURE_SECRET: "SECRET_FUTURE",
  });
  const config = createLaunchConfig(input, "/synthetic/repository");
  assert.deepEqual(Object.keys(config.python.env).sort(), [
    "PATH", "LANG", "PYTHONPATH", "PYTHONUNBUFFERED", "PYTHONDONTWRITEBYTECODE",
    "PYTHONNOUSERSITE", "VIRTUAL_ENV", "ASSISTANT_SERVICE_TOKEN", "ASSISTANT_RULES_PORT",
  ].sort());
  assert.equal(JSON.stringify(config.python.env).includes("SECRET_"), false);
  assert.equal(config.python.env.ASSISTANT_SERVICE_TOKEN, TOKEN);
  assert.equal(JSON.stringify(config.python.args).includes(TOKEN), false);
  assert.equal(input.ASSISTANT_SERVICE_TOKEN, TOKEN);
});

test("invalid rules configuration disables only assistant features in Node", async (t) => {
  const cases = [
    { ASSISTANT_MODE: undefined }, { ASSISTANT_MODE: "model" },
    { ASSISTANT_SERVICE_URL: "https://cloud.example/" },
    { ASSISTANT_SERVICE_URL: "http://localhost:8080" },
    { ASSISTANT_SERVICE_URL: "http://127.0.0.1:8080/private" },
    { ASSISTANT_SERVICE_URL: "http://127.0.0.1:8080?token=private" },
    { ASSISTANT_SERVICE_TOKEN: "short" }, { ASSISTANT_SERVICE_TOKEN: `${TOKEN}\n` },
    { ASSISTANT_SERVICE_TOKEN: "a".repeat(513) }, { ASSISTANT_RULES_PORT: "0" },
    { ASSISTANT_RULES_PORT: "80", ASSISTANT_SERVICE_URL: "http://127.0.0.1:80" },
    { ASSISTANT_RULES_PORT: "65536" }, { ASSISTANT_RULES_PORT: "8080junk" },
    { ASSISTANT_RULES_PORT: "3000", ASSISTANT_SERVICE_URL: "http://127.0.0.1:3000" },
  ];
  for (const [index, invalid] of cases.entries()) await t.test(`invalid configuration ${index + 1}`, () => {
    const config = createLaunchConfig(environment({ MONGODB_URI: "preserved", ...invalid }));
    assert.equal(config.rulesEnabled, false);
    assert.equal(config.node.env.ASK_LISNO_ENABLED, "false");
    assert.equal(config.node.env.PROJECT_CHAT_AI_ENABLED, "false");
    assert.equal(config.node.env.ASSISTANT_SERVICE_URL, "");
    assert.equal(config.node.env.ASSISTANT_SERVICE_TOKEN, "");
    assert.equal(config.node.env.MONGODB_URI, "preserved");
  });
});

test("custom isolated test port remains literal loopback", () => {
  const config = createLaunchConfig(environment({ ASSISTANT_RULES_PORT: "18080", ASSISTANT_SERVICE_URL: "http://127.0.0.1:18080" }));
  assert.equal(config.rulesEnabled, true);
  assert.equal(config.port, 18080);
  assert.equal(config.python.env.ASSISTANT_RULES_PORT, "18080");
});

test("disabled mode starts only the ordinary backend", async () => {
  const fake = fakeProcesses();
  const supervisor = startSupervisor({ config: createLaunchConfig(environment({ ASSISTANT_MODE: "" })), ...fake, log: () => {}, timing });
  assert.equal(fake.records.length, 1);
  await supervisor.stop();
  assert.equal(await supervisor.done, 0);
});

test("readiness runs while both API feature flags remain false", async () => {
  const fake = fakeProcesses();
  const events = [];
  const config = createLaunchConfig(environment({ ASK_LISNO_ENABLED: "false", PROJECT_CHAT_AI_ENABLED: "false" }));
  const supervisor = startSupervisor({ config, ...fake, probe: async () => true, log: (event) => events.push(event), timing });
  await until(() => events.includes("rules-ready"));
  assert.equal(fake.records.length, 2);
  assert.equal(fake.records[0].options.env.ASK_LISNO_ENABLED, "false");
  assert.equal(fake.records[0].options.env.PROJECT_CHAT_AI_ENABLED, "false");
  assert.equal(fake.records[1].options.stdio, "ignore");
  await supervisor.stop();
});

test("missing Python retries finitely without stopping Node or leaking exception text", async () => {
  const fake = fakeProcesses((command) => ({ spawnError: command.endsWith("/python") }));
  const events = [];
  const supervisor = startSupervisor({ ...fake, config: createLaunchConfig(environment()), probe: async () => false, log: (event) => events.push(event), timing });
  await until(() => events.includes("rules-restarts-exhausted"));
  assert.equal(fake.records.length, 4);
  assert.equal(fake.records[0].closed, false);
  assert.deepEqual(fake.records[0].signals, []);
  assert.equal(events.some((event) => /private|credentials/.test(event)), false);
  await supervisor.stop();
});

test("port conflict or failed readiness stops the child and exhausts bounded retries", async () => {
  const fake = fakeProcesses();
  const events = [];
  const supervisor = startSupervisor({ ...fake, config: createLaunchConfig(environment()), probe: async () => false, log: (event) => events.push(event), timing });
  await until(() => events.includes("rules-restarts-exhausted"));
  assert.equal(events.filter((event) => event === "rules-readiness-failed").length, 3);
  assert.equal(fake.records[0].closed, false);
  for (const record of fake.records.slice(1)) assert.deepEqual(record.signals, ["SIGTERM"]);
  await supervisor.stop();
});

test("Python crash recovers; the process-lifetime restart budget does not reset after readiness", async () => {
  const fake = fakeProcesses();
  const events = [];
  const supervisor = startSupervisor({ ...fake, config: createLaunchConfig(environment()), probe: async () => true, log: (event) => events.push(event), timing });
  for (let attempt = 0; attempt < 3; attempt++) {
    await until(() => events.filter((event) => event === "rules-ready").length === attempt + 1);
    fake.records.at(-1).close(1);
  }
  await until(() => events.includes("rules-restarts-exhausted"));
  assert.equal(fake.records.length, 4);
  assert.equal(fake.records[0].closed, false);
  await supervisor.stop();
});

test("SIGINT drains Node before stopping Python and force-reaps an unresponsive child", async () => {
  const fake = fakeProcesses(() => ({ ignoreTerm: true }));
  const events = [];
  const supervisor = startSupervisor({ ...fake, config: createLaunchConfig(environment()), probe: async () => true, log: (event) => events.push(event), timing });
  const stopping = supervisor.stop("SIGINT");
  assert.deepEqual(fake.records[0].signals, ["SIGINT"]);
  assert.deepEqual(fake.records[1].signals, []);
  assert.equal(await stopping, 1);
  assert.deepEqual(fake.records[0].signals, ["SIGINT", "SIGKILL"]);
  assert.deepEqual(fake.records[1].signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(fake.records.every((record) => record.closed), true);
  assert.equal(events.filter((event) => event === "backend-drain-timeout").length, 1);
});

test("Node can finish after the old drain cutoff while Python remains available and shutdown is idempotent", async () => {
  const fake = fakeProcesses((_command, index) => ({ ignoreTerm: index === 0 }));
  const events = [];
  // Scale 25 seconds to 25 ms and finish at 12 ms, beyond the old 8-second cutoff.
  const supervisor = startSupervisor({ ...fake, config: createLaunchConfig(environment()), probe: async () => true, log: (event) => events.push(event), timing: { ...timing, nodeDrainMs: 25 } });
  const stopping = supervisor.stop();
  assert.equal(supervisor.stop(), stopping);
  await pause(12);
  assert.equal(fake.records[1].closed, false);
  fake.records[0].close(0);
  assert.equal(await stopping, 0);
  assert.deepEqual(fake.records[0].signals, ["SIGTERM"]);
  assert.deepEqual(fake.records[1].signals, ["SIGTERM"]);
  assert.equal(events.includes("backend-drain-timeout"), false);
  assert.equal(events.filter((event) => event === "stopped").length, 1);
});

test("an actual backend failure code during intentional shutdown remains visible", async () => {
  const fake = fakeProcesses((_command, index) => ({ ignoreTerm: index === 0 }));
  const supervisor = startSupervisor({ ...fake, config: createLaunchConfig(environment()), probe: async () => true, log: () => {}, timing });
  const stopping = supervisor.stop();
  fake.records[0].close(23);
  assert.equal(await stopping, 23);
  assert.equal(fake.records[1].closed, true);
});

test("Node startup failure reaps Python and returns failure", async () => {
  const fake = fakeProcesses((_command, index) => ({ spawnError: index === 0 }));
  const supervisor = startSupervisor({ ...fake, config: createLaunchConfig(environment()), probe: async () => true, log: () => {}, timing });
  assert.equal(await supervisor.done, 1);
  assert.equal(fake.records.every((record) => record.closed), true);
  assert.deepEqual(fake.records[1].signals, ["SIGTERM"]);
});

test("synchronous spawn failure is sanitized and does not leave another child", async () => {
  const fake = fakeProcesses(() => ({ throwOnSpawn: true }));
  const events = [];
  const supervisor = startSupervisor({ ...fake, config: createLaunchConfig(environment()), probe: async () => false, log: (event) => events.push(event), timing });
  assert.equal(await supervisor.done, 1);
  assert.equal(events.some((event) => event.includes("private")), false);
});

test("shutdown during restart backoff prevents a new Python child", async () => {
  const fake = fakeProcesses();
  const supervisor = startSupervisor({ ...fake, config: createLaunchConfig(environment()), probe: async () => true, log: () => {}, timing: { ...timing, restartMs: [40] } });
  fake.records[1].close(1);
  await supervisor.stop();
  await pause(50);
  assert.equal(fake.records.length, 2);
});

test("authenticated readiness validates rules identity and never follows redirects", async (t) => {
  let response = { status: 200, body: JSON.stringify({ status: "ready", mode: "rules", protocolVersion: 1 }) };
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url, auth: req.headers.authorization });
    res.writeHead(response.status, { Location: "http://not-loopback.invalid/" });
    res.end(response.body);
  });
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  const options = { port: server.address().port, token: TOKEN };
  assert.equal(await probeRulesReady(options), true);
  assert.deepEqual(requests[0], { url: "/health/ready", auth: `Bearer ${TOKEN}` });
  for (const invalid of [
    { status: 200, body: '{"status":"ready"}' },
    { status: 200, body: "a".repeat(1_025) },
    { status: 302, body: "" }, { status: 401, body: "" },
  ]) {
    response = invalid;
    assert.equal(await probeRulesReady(options), false);
  }
  assert.equal(requests.length, 5);
});

test("actual synthetic child processes are reaped after Node fails", async () => {
  const children = [];
  const fixture = fileURLToPath(new URL("./fixtures/render-chat/child.mjs", import.meta.url));
  const supervisor = startSupervisor({
    config: createLaunchConfig(environment()), timing, probe: async () => true, log: () => {},
    spawnProcess: (_command, _args, options) => {
      const child = spawn(process.execPath, [fixture, children.length === 0 ? "fail" : "idle"], { cwd: options.cwd, env: options.env, stdio: "ignore" });
      children.push(child);
      return child;
    },
  });
  assert.equal(await supervisor.done, 23);
  assert.equal(children.length, 2);
  for (const child of children) assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
});

test("actual synthetic children handle SIGINT and force shutdown without orphaning", async (t) => {
  for (const signal of ["SIGINT", "SIGTERM"]) await t.test(signal, async () => {
    const children = [];
    const ready = [];
    const fixture = fileURLToPath(new URL("./fixtures/render-chat/child.mjs", import.meta.url));
    const supervisor = startSupervisor({
      config: createLaunchConfig(environment()), timing, probe: async () => true, log: () => {},
      spawnProcess: (_command, _args, options) => {
        const child = spawn(process.execPath, [fixture, "ignore-term"], { cwd: options.cwd, env: options.env, stdio: ["ignore", "ignore", "ignore", "ipc"] });
        ready.push(new Promise((resolveReady) => child.once("message", resolveReady)));
        children.push(child);
        return child;
      },
    });
    t.after(() => supervisor.stop());
    await Promise.all(ready);
    assert.equal(await supervisor.stop(signal), signal === "SIGTERM" ? 1 : 0);
    assert.equal(children.length, 2);
    for (const child of children) assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
  });
});

test("readiness hangs and cancellation are bounded", async (t) => {
  const sockets = new Set();
  const server = createServer(() => {});
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    return new Promise((resolveClose) => server.close(resolveClose));
  });
  const options = { port: server.address().port, token: TOKEN, timeoutMs: 20 };
  assert.equal(await probeRulesReady(options), false);
  const controller = new AbortController();
  const checking = probeRulesReady({ ...options, signal: controller.signal, timeoutMs: 1_000 });
  controller.abort();
  assert.equal(await checking, false);
});
