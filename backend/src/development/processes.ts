import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { withDevelopmentCredentials } from "../config/development-env.js";

export interface DevelopmentProcessSpec {
  label: "backend" | "ocr-worker";
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
}

export interface DevelopmentProcessOptions {
  backendRoot: string;
  environment?: Record<string, string | undefined>;
  nodeExecutable?: string;
  platform?: NodeJS.Platform;
}

interface SignalSource {
  on(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

interface RunDevelopmentProcessesOptions {
  specs: DevelopmentProcessSpec[];
  pathExists?: (path: string) => boolean;
  spawnProcess?: typeof spawn;
  signalSource?: SignalSource;
  waitForBackend?: (
    spec: DevelopmentProcessSpec,
    signal: AbortSignal
  ) => Promise<void>;
  writeError?: (message: string) => void;
  writeOutput?: (message: string) => void;
}

export function createDevelopmentProcessSpecs({
  backendRoot,
  environment = process.env,
  nodeExecutable = process.execPath,
  platform = process.platform
}: DevelopmentProcessOptions): DevelopmentProcessSpec[] {
  const workerRoot = path.resolve(backendRoot, "../ocr-worker");
  const workerPython = path.join(
    workerRoot,
    ".venv",
    platform === "win32" ? "Scripts/python.exe" : "bin/python"
  );
  const effectiveEnvironment: Record<string, string | undefined> =
    withDevelopmentCredentials(environment);
  const sharedEnvironment = {
    ...effectiveEnvironment,
    OCR_API_BASE_URL:
      effectiveEnvironment.OCR_API_BASE_URL ??
      `http://127.0.0.1:${effectiveEnvironment.PORT ?? "3000"}/api/v1`
  };

  return [
    {
      label: "backend",
      command: nodeExecutable,
      args: [
        path.join(backendRoot, "node_modules/tsx/dist/cli.mjs"),
        "watch",
        "src/dev.ts"
      ],
      cwd: backendRoot,
      env: sharedEnvironment
    },
    {
      label: "ocr-worker",
      command: workerPython,
      args: ["-m", "lisno_ocr.worker"],
      cwd: workerRoot,
      env: sharedEnvironment
    }
  ];
}

export function runDevelopmentProcesses({
  specs,
  pathExists = existsSync,
  spawnProcess = spawn,
  signalSource = process,
  waitForBackend = waitForBackendHealth,
  writeError = (message) => process.stderr.write(message),
  writeOutput = (message) => process.stdout.write(message)
}: RunDevelopmentProcessesOptions): Promise<number> {
  const worker = specs.find((spec) => spec.label === "ocr-worker");
  if (!worker || !pathExists(worker.command)) {
    writeError(
      [
        "OCR worker environment is missing.",
        "Set it up with:",
        "  cd ../ocr-worker",
        "  python3 -m venv .venv",
        "  source .venv/bin/activate",
        '  python -m pip install -e ".[test,model]"',
        ""
      ].join("\n")
    );
    return Promise.resolve(1);
  }

  writeOutput("Starting backend and OCR worker...\n");

  return new Promise((resolve) => {
    const liveChildren = new Set<ChildProcess>();
    const readiness = new AbortController();
    let requestedExitCode: number | undefined;
    let settled = false;

    const cleanup = () => {
      signalSource.off("SIGINT", onInterrupt);
      signalSource.off("SIGTERM", onInterrupt);
    };
    const finishIfStopped = () => {
      if (settled || liveChildren.size > 0) return;
      settled = true;
      cleanup();
      resolve(requestedExitCode ?? 1);
    };
    const requestShutdown = (exitCode: number) => {
      requestedExitCode ??= exitCode;
      readiness.abort();
      for (const child of liveChildren) {
        child.kill("SIGTERM");
      }
      finishIfStopped();
    };
    const onInterrupt = () => requestShutdown(0);

    signalSource.on("SIGINT", onInterrupt);
    signalSource.on("SIGTERM", onInterrupt);

    const spawnSpec = (spec: DevelopmentProcessSpec) => {
      try {
        const child = spawnProcess(spec.command, spec.args, {
          cwd: spec.cwd,
          env: spec.env,
          stdio: "inherit"
        });
        liveChildren.add(child);
        child.once("error", () => {
          liveChildren.delete(child);
          requestShutdown(1);
        });
        child.once("exit", (code) => {
          liveChildren.delete(child);
          if (requestedExitCode === undefined) {
            requestShutdown(code && code > 0 ? code : 1);
          }
          finishIfStopped();
        });
        return true;
      } catch {
        requestShutdown(1);
        return false;
      }
    };

    const backend = specs.find((spec) => spec.label === "backend");
    if (!backend || !spawnSpec(backend)) {
      finishIfStopped();
      return;
    }

    void waitForBackend(backend, readiness.signal).then(
      () => {
        if (readiness.signal.aborted || requestedExitCode !== undefined) return;
        writeOutput("Backend is ready; starting OCR worker.\n");
        if (!spawnSpec(worker)) finishIfStopped();
      },
      (error: unknown) => {
        if (readiness.signal.aborted || requestedExitCode !== undefined) return;
        writeError(
          `Backend did not become ready: ${
            error instanceof Error ? error.message : String(error)
          }\n`
        );
        requestShutdown(1);
      }
    );
  });
}

async function waitForBackendHealth(
  spec: DevelopmentProcessSpec,
  signal: AbortSignal
): Promise<void> {
  const apiBaseUrl = spec.env.OCR_API_BASE_URL;
  if (!apiBaseUrl) throw new Error("OCR_API_BASE_URL is not configured.");
  const healthUrl = `${apiBaseUrl.replace(/\/+$/, "")}/health`;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    signal.throwIfAborted();
    try {
      const response = await fetch(healthUrl, { signal });
      if (response.ok) return;
    } catch {
      signal.throwIfAborted();
      // The backend watcher may still be compiling or connecting to MongoDB.
    }
    await delay(250, undefined, { signal });
  }

  throw new Error(`timed out waiting for ${healthUrl}`);
}
