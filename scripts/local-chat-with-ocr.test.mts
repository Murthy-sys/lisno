import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createDevelopmentProcessSpecs } from "../backend/src/development/processes.js";
import {
  createLocalChatWithOcrSpecs,
  localChildDrainMs,
  runLocalChatWithOcr,
} from "./local-chat-with-ocr.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specs = () => createLocalChatWithOcrSpecs({ root: "/repo", environment: {}, nodeExecutable: "/node", platform: "linux" });

class FakeChild extends EventEmitter {
  pid = 123;
  signals: (NodeJS.Signals | number | undefined)[] = [];
  stopped = false;
  constructor(readonly ignoreTerm = false) { super(); }
  kill(signal?: NodeJS.Signals | number) {
    this.signals.push(signal);
    if (signal === "SIGKILL" || !this.ignoreTerm) queueMicrotask(() => this.exit(null, typeof signal === "string" ? signal : "SIGTERM"));
    return true;
  }
  exit(code: number | null, signal: NodeJS.Signals | null = null) {
    if (this.stopped) return;
    this.stopped = true;
    this.emit("exit", code, signal);
  }
}

function harness(children = [new FakeChild(), new FakeChild()]) {
  const signals = new EventEmitter();
  const errors: string[] = [];
  const spawned: string[] = [];
  return {
    children, signals, errors, spawned,
    options: {
      specs: specs(), pathExists: () => true, signalSource: signals, childDrainMs: 10,
      writeError: (message: string) => { errors.push(message); }, writeOutput: () => {},
      waitForBackend: async () => {},
      spawnProcess: ((command: string) => {
        spawned.push(command);
        return children[spawned.length - 1] as unknown as ChildProcess;
      }) as typeof spawn,
    },
  };
}

test("reuses the unchanged OCR command, API target, and shared development credentials", () => {
  const environment = { PORT: "3210", OCR_WORKER_TOKEN: "synthetic-explicit-worker-token", ASSISTANT_SERVICE_TOKEN: "synthetic-assistant-token" };
  const actual = createLocalChatWithOcrSpecs({ root: "/repo", environment, nodeExecutable: "/node", platform: "linux" });
  const original = createDevelopmentProcessSpecs({ backendRoot: "/repo/backend", environment, nodeExecutable: "/node", platform: "linux" });
  assert.deepEqual(actual[1], original[1]);
  assert.equal(actual[0].env, actual[1].env);
  assert.deepEqual(actual[0], { ...original[0], args: ["--import", "tsx", "/repo/scripts/local-chat-backend.mts"] });
  assert.equal(actual[1].env.OCR_WORKER_TOKEN, environment.OCR_WORKER_TOKEN);
  assert.equal(actual[1].env.ASSISTANT_SERVICE_TOKEN, environment.ASSISTANT_SERVICE_TOKEN);
  assert.equal(actual[1].env.OCR_API_BASE_URL, "http://127.0.0.1:3210/api/v1");
  assert.ok(!actual[0].args.some((arg) => arg === "watch" || arg.includes("src/dev.ts")));
});

test("accepts the exact local target with an optional trailing slash", () => {
  for (const suffix of ["", "/"]) {
    const result = createLocalChatWithOcrSpecs({ environment: { OCR_API_BASE_URL: `http://127.0.0.1:3000/api/v1${suffix}` } });
    assert.equal(result[1].env.OCR_API_BASE_URL, `http://127.0.0.1:3000/api/v1${suffix}`);
  }
});

test("rejects remote, alternate-port, credentialed, and ambiguous OCR targets before spawning", async () => {
  for (const target of [
    "https://lisno.example/api/v1", "http://127.0.0.1:4000/api/v1", "http://localhost:3000/api/v1",
    "http://127.0.0.1:3000/api/v1?token=synthetic", "http://user:synthetic@127.0.0.1:3000/api/v1",
    "http://127.0.0.1:3000/api/v1#fragment", "http://127.0.0.1:3000/other",
  ]) {
    assert.throws(() => createLocalChatWithOcrSpecs({ environment: { OCR_API_BASE_URL: target } }), /must target this backend/u);
    const h = harness();
    h.options.specs[1].env = { ...h.options.specs[1].env, OCR_API_BASE_URL: target };
    await assert.rejects(runLocalChatWithOcr(h.options), /must target this backend/u);
    assert.equal(h.spawned.length, 0);
  }
});

test("refuses non-development mode and invalid backend ports", () => {
  assert.throws(() => createLocalChatWithOcrSpecs({ environment: { NODE_ENV: "production" } }), /development mode/u);
  for (const PORT of ["0", "80", "65536", "NaN", "3e3"]) {
    assert.throws(() => createLocalChatWithOcrSpecs({ environment: { PORT } }), /valid local backend port/u);
  }
});

test("bounds the child drain environment setting and defaults invalid values", () => {
  assert.equal(localChildDrainMs({}), 25_000);
  assert.equal(localChildDrainMs({ LISNO_LOCAL_CHILD_DRAIN_MS: "295000" }), 295_000);
  for (const value of ["0", "24999", "295001", "NaN", "25000.0", "2.5e4", ""]) {
    assert.equal(localChildDrainMs({ LISNO_LOCAL_CHILD_DRAIN_MS: value }), 25_000);
  }
});

test("waits for backend readiness before starting OCR", async () => {
  const h = harness();
  let ready!: () => void;
  const completion = runLocalChatWithOcr({ ...h.options, waitForBackend: () => new Promise<void>((resolveReady) => { ready = resolveReady; }) });
  assert.equal(h.spawned.length, 1);
  ready();
  await Promise.resolve();
  assert.equal(h.spawned.length, 2);
  h.signals.emit("SIGTERM");
  assert.equal(await completion, 0);
  assert.ok(h.children.every((child) => child.stopped));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(`${signal} stops and reaps both children and removes signal listeners`, async () => {
    const h = harness();
    const completion = runLocalChatWithOcr(h.options);
    await Promise.resolve();
    h.signals.emit(signal);
    assert.equal(await completion, 0);
    assert.ok(h.children.every((child) => child.stopped && child.signals.includes("SIGTERM")));
    assert.equal(h.signals.listenerCount("SIGINT"), 0);
    assert.equal(h.signals.listenerCount("SIGTERM"), 0);
  });
}

test("backend failure stops OCR and preserves the nonzero code", async () => {
  const h = harness();
  const completion = runLocalChatWithOcr(h.options);
  await Promise.resolve();
  h.children[0].exit(23);
  assert.equal(await completion, 23);
  assert.ok(h.children[1].stopped);
  assert.deepEqual(h.errors, []);
});

test("readiness failure forces a hung backend to exit without starting OCR", async () => {
  const h = harness([new FakeChild(true)]);
  const completion = runLocalChatWithOcr({ ...h.options, waitForBackend: async () => { throw new Error("synthetic readiness failure"); } });
  assert.equal(await completion, 1);
  assert.equal(h.spawned.length, 1);
  assert.deepEqual(h.children[0].signals, ["SIGTERM", "SIGKILL"]);
  assert.ok(h.errors.some((error) => error.includes("forcing owned processes")));
});

test("a signal gives both hung children one bounded grace period and returns failure", async () => {
  const h = harness([new FakeChild(true), new FakeChild(true)]);
  const completion = runLocalChatWithOcr(h.options);
  await Promise.resolve();
  h.signals.emit("SIGTERM");
  h.signals.emit("SIGINT");
  assert.equal(await completion, 1);
  assert.ok(h.children.every((child) => child.stopped && child.signals.includes("SIGKILL")));
  assert.equal(h.errors.filter((error) => error.includes("forcing owned processes")).length, 1);
});

test("failed OCR spawn still drains the running backend", async () => {
  const h = harness([new FakeChild(true)]);
  let calls = 0;
  const completion = runLocalChatWithOcr({
    ...h.options,
    spawnProcess: (() => {
      calls += 1;
      if (calls === 2) throw new Error("synthetic spawn failure");
      return h.children[0] as unknown as ChildProcess;
    }) as typeof spawn,
  });
  assert.equal(await completion, 1);
  assert.ok(h.children[0].stopped);
  assert.ok(h.children[0].signals.includes("SIGKILL"));
});

test("missing OCR environment does not start either child", async () => {
  const h = harness();
  assert.equal(await runLocalChatWithOcr({ ...h.options, pathExists: () => false }), 1);
  assert.equal(h.spawned.length, 0);
});

test("real synthetic children ignoring SIGTERM are killed and reaped before completion", { timeout: 5_000 }, async () => {
  const children: ChildProcess[] = [];
  const signals = new EventEmitter();
  let workerReady!: () => void;
  const ready = new Promise<void>((resolveReady) => { workerReady = resolveReady; });
  const errors: string[] = [];
  const fixture = join(ROOT, "scripts", "fixtures", "render-chat", "child.mjs");
  const testSpecs = specs().map((spec) => ({ ...spec, command: process.execPath, args: [fixture, "ignore-term"], cwd: ROOT }));
  const completion = runLocalChatWithOcr({
    specs: testSpecs, pathExists: () => true, signalSource: signals, childDrainMs: 30,
    writeError: (message) => { errors.push(message); }, writeOutput: () => {},
    spawnProcess: ((command: string, args: string[], options: object) => {
      const child = spawn(command, args, { ...options, stdio: ["ignore", "ignore", "ignore", "ipc"] });
      children.push(child);
      if (children.length === 2) child.once("message", workerReady);
      return child;
    }) as typeof spawn,
    waitForBackend: async () => { await once(children[0], "message"); },
  });
  try {
    await ready;
    signals.emit("SIGTERM");
    assert.equal(await completion, 1);
    assert.equal(children.length, 2);
    for (const child of children) {
      assert.equal(child.signalCode, "SIGKILL");
      assert.throws(() => process.kill(child.pid!, 0), { code: "ESRCH" });
    }
    assert.equal(errors.length, 1);
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
});
