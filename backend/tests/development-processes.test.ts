import { EventEmitter } from "node:events";
import type { ChildProcess, spawn } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import {
  createDevelopmentProcessSpecs,
  runDevelopmentProcesses
} from "../src/development/processes.js";

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn((signal?: NodeJS.Signals | number) => {
    this.signalCode =
      typeof signal === "string" ? signal : signal === undefined ? "SIGTERM" : null;
    return true;
  });

  exit(code: number | null, signal: NodeJS.Signals | null = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }
}

describe("combined backend and OCR development processes", () => {
  it("builds both commands with one shared worker credential", () => {
    const specs = createDevelopmentProcessSpecs({
      backendRoot: "/repo/backend",
      environment: {},
      nodeExecutable: "/node",
      platform: "linux"
    });

    expect(specs.map((spec) => spec.label)).toEqual(["backend", "ocr-worker"]);
    expect(specs[0].env.OCR_WORKER_TOKEN).toBe(
      specs[1].env.OCR_WORKER_TOKEN
    );
    expect(specs[0].env.OCR_API_BASE_URL).toBe(
      "http://127.0.0.1:3000/api/v1"
    );
    expect(specs[1].env.OCR_API_BASE_URL).toBe(
      "http://127.0.0.1:3000/api/v1"
    );
    expect(specs[0]).toMatchObject({
      command: "/node",
      args: [
        "/repo/backend/node_modules/tsx/dist/cli.mjs",
        "watch",
        "src/dev.ts"
      ],
      cwd: "/repo/backend"
    });
    expect(specs[1]).toMatchObject({
      command: "/repo/ocr-worker/.venv/bin/python",
      args: ["-m", "lisno_ocr.worker"],
      cwd: "/repo/ocr-worker"
    });
  });

  it("preserves an explicitly supplied shared worker credential", () => {
    const specs = createDevelopmentProcessSpecs({
      backendRoot: "/repo/backend",
      environment: {
        OCR_WORKER_TOKEN: "explicit-worker-token-with-at-least-32-characters"
      },
      nodeExecutable: "/node",
      platform: "linux"
    });

    expect(specs.every((spec) =>
      spec.env.OCR_WORKER_TOKEN ===
      "explicit-worker-token-with-at-least-32-characters"
    )).toBe(true);
  });

  it("reports the worker setup command before spawning when its Python is missing", async () => {
    const specs = createDevelopmentProcessSpecs({
      backendRoot: "/repo/backend",
      environment: {},
      nodeExecutable: "/node",
      platform: "linux"
    });
    const spawnProcess = vi.fn<typeof spawn>();
    const writeError = vi.fn();

    await expect(
      runDevelopmentProcesses({
        specs,
        pathExists: () => false,
        spawnProcess,
        writeError
      })
    ).resolves.toBe(1);

    expect(spawnProcess).not.toHaveBeenCalled();
    expect(writeError).toHaveBeenCalledWith(
      expect.stringContaining('python -m pip install -e ".[test,model]"')
    );
  });

  it("waits for backend readiness before spawning the OCR worker", async () => {
    const backend = new FakeChild();
    const worker = new FakeChild();
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(backend as unknown as ChildProcess)
      .mockReturnValueOnce(worker as unknown as ChildProcess);
    let markReady: (() => void) | undefined;
    const waitForBackend = () =>
      new Promise<void>((resolve) => {
        markReady = resolve;
      });

    const completion = runDevelopmentProcesses({
      specs: createDevelopmentProcessSpecs({
        backendRoot: "/repo/backend",
        environment: {},
        nodeExecutable: "/node",
        platform: "linux"
      }),
      pathExists: () => true,
      spawnProcess: spawnProcess as typeof spawn,
      signalSource: new EventEmitter(),
      waitForBackend,
      writeOutput: () => undefined
    });

    expect(spawnProcess).toHaveBeenCalledTimes(1);
    markReady?.();
    await Promise.resolve();
    expect(spawnProcess).toHaveBeenCalledTimes(2);

    backend.exit(1);
    worker.exit(null, "SIGTERM");
    await completion;
  });

  it("aborts readiness without a late timeout when the backend exits before ready", async () => {
    const backend = new FakeChild();
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(backend as unknown as ChildProcess);
    const writeError = vi.fn();
    let readinessSignal: AbortSignal | undefined;
    const waitForBackend = (_spec: unknown, signal: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        readinessSignal = signal;
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Readiness aborted.", "AbortError")),
          { once: true }
        );
      });

    const completion = runDevelopmentProcesses({
      specs: createDevelopmentProcessSpecs({
        backendRoot: "/repo/backend",
        environment: {},
        nodeExecutable: "/node",
        platform: "linux"
      }),
      pathExists: () => true,
      spawnProcess: spawnProcess as typeof spawn,
      signalSource: new EventEmitter(),
      waitForBackend,
      writeError,
      writeOutput: () => undefined
    });

    backend.exit(3);

    await expect(completion).resolves.toBe(3);
    expect(readinessSignal).toBeDefined();
    expect(readinessSignal?.aborted).toBe(true);
    await Promise.resolve();
    expect(writeError).not.toHaveBeenCalled();
    expect(spawnProcess).toHaveBeenCalledTimes(1);
  });

  it("stops the sibling and returns failure when a child exits", async () => {
    const backend = new FakeChild();
    const worker = new FakeChild();
    const children = [backend, worker];
    const spawnProcess = vi.fn(() => children.shift() as unknown as ChildProcess);

    const completion = runDevelopmentProcesses({
      specs: createDevelopmentProcessSpecs({
        backendRoot: "/repo/backend",
        environment: {},
        nodeExecutable: "/node",
        platform: "linux"
      }),
      pathExists: () => true,
      spawnProcess: spawnProcess as typeof spawn,
      signalSource: new EventEmitter(),
      waitForBackend: async () => undefined,
      writeOutput: () => undefined
    });

    await Promise.resolve();
    backend.exit(2);
    expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
    worker.exit(null, "SIGTERM");
    await expect(completion).resolves.toBe(2);
  });

  it("stops both children cleanly from one interrupt", async () => {
    const backend = new FakeChild();
    const worker = new FakeChild();
    const children = [backend, worker];
    const signals = new EventEmitter();

    const completion = runDevelopmentProcesses({
      specs: createDevelopmentProcessSpecs({
        backendRoot: "/repo/backend",
        environment: {},
        nodeExecutable: "/node",
        platform: "linux"
      }),
      pathExists: () => true,
      spawnProcess: vi.fn(
        () => children.shift() as unknown as ChildProcess
      ) as typeof spawn,
      signalSource: signals,
      waitForBackend: async () => undefined,
      writeOutput: () => undefined
    });

    await Promise.resolve();
    signals.emit("SIGINT");
    expect(backend.kill).toHaveBeenCalledWith("SIGTERM");
    expect(worker.kill).toHaveBeenCalledWith("SIGTERM");
    backend.exit(null, "SIGTERM");
    worker.exit(null, "SIGTERM");
    await expect(completion).resolves.toBe(0);
  });
});
