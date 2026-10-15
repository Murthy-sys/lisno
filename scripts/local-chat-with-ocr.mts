import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createDevelopmentProcessSpecs,
  runDevelopmentProcesses,
  type DevelopmentProcessSpec,
} from "../backend/src/development/processes.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DRAIN_MS = 25_000;

type Environment = Record<string, string | undefined>;
type ExistingRunOptions = Parameters<typeof runDevelopmentProcesses>[0];

export function localChildDrainMs(environment: Environment): number {
  const raw = environment.LISNO_LOCAL_CHILD_DRAIN_MS;
  if (raw === undefined) return DEFAULT_DRAIN_MS;
  const value = Number(raw);
  return /^\d+$/u.test(raw) && Number.isSafeInteger(value) && value >= DEFAULT_DRAIN_MS && value <= 295_000
    ? value
    : DEFAULT_DRAIN_MS;
}

function validateLocalOcrTarget(specs: DevelopmentProcessSpec[]): void {
  const backend = specs.find((spec) => spec.label === "backend");
  const worker = specs.find((spec) => spec.label === "ocr-worker");
  const rawPort = backend?.env.PORT ?? "3000";
  const port = Number(rawPort);
  if (!backend || !worker || !/^\d+$/u.test(rawPort) || !Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Local chat requires a valid local backend port.");
  }
  const expected = `http://127.0.0.1:${port}/api/v1`;
  if (specs.some((spec) => ![expected, `${expected}/`].includes(spec.env.OCR_API_BASE_URL ?? ""))) {
    throw new Error("Local chat OCR must target this backend at http://127.0.0.1:<port>/api/v1.");
  }
}

export function createLocalChatWithOcrSpecs({
  root = ROOT,
  environment = process.env,
  nodeExecutable = process.execPath,
  platform = process.platform,
}: {
  root?: string;
  environment?: Environment;
  nodeExecutable?: string;
  platform?: NodeJS.Platform;
} = {}): DevelopmentProcessSpec[] {
  if (environment.NODE_ENV && environment.NODE_ENV !== "development") {
    throw new Error("Local chat requires development mode.");
  }
  const specs = createDevelopmentProcessSpecs({
    backendRoot: join(root, "backend"), environment, nodeExecutable, platform,
  });
  validateLocalOcrTarget(specs);
  // Keep the existing worker command and shared credentials; avoid demo seeding and watcher children.
  specs[0].args = ["--import", "tsx", join(root, "scripts", "local-chat-backend.mts")];
  return specs;
}

export async function runLocalChatWithOcr({
  specs,
  environment = process.env,
  childDrainMs = localChildDrainMs(environment),
  spawnProcess = spawn,
  writeError = (message: string) => { process.stderr.write(message); },
  ...options
}: ExistingRunOptions & { environment?: Environment; childDrainMs?: number }): Promise<number> {
  validateLocalOcrTarget(specs);
  if (!Number.isSafeInteger(childDrainMs) || childDrainMs < 1 || childDrainMs > 295_000) {
    throw new Error("Local chat child shutdown deadline is invalid.");
  }
  const children = new Set<ChildProcess>();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let forced = false;
  let notifyStopped: (() => void) | undefined;

  const beginDrain = () => {
    if (deadline !== undefined) return;
    deadline = setTimeout(() => {
      if (children.size === 0) return;
      forced = true;
      writeError("Local chat child shutdown exceeded its deadline; forcing owned processes to stop.\n");
      for (const child of children) child.kill("SIGKILL");
    }, childDrainMs);
  };
  const onStopped = (child: ChildProcess) => {
    beginDrain();
    children.delete(child);
    if (children.size === 0) notifyStopped?.();
  };
  const trackedSpawn = ((...args: Parameters<typeof spawn>) => {
    let child: ChildProcess;
    try {
      child = spawnProcess(...args);
    } catch (error) {
      beginDrain();
      throw error;
    }
    children.add(child);
    const originalKill = child.kill.bind(child);
    child.kill = (signal) => {
      // The existing runner owns shutdown decisions, including readiness and spawn failures.
      if (signal === undefined || signal === "SIGTERM" || signal === "SIGINT") beginDrain();
      return originalKill(signal);
    };
    child.once("exit", () => onStopped(child));
    child.once("error", () => {
      beginDrain();
      // A failed spawn has no process to reap. A running child still needs its exit event.
      if (!child.pid) onStopped(child);
    });
    return child;
  }) as typeof spawn;

  try {
    const result = await runDevelopmentProcesses({ ...options, specs, spawnProcess: trackedSpawn, writeError });
    if (children.size > 0) {
      beginDrain();
      await new Promise<void>((resolveStopped) => { notifyStopped = resolveStopped; });
    }
    return forced ? Math.max(result, 1) : result;
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
  }
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "")) {
  try {
    process.exitCode = await runLocalChatWithOcr({ specs: createLocalChatWithOcrSpecs() });
  } catch {
    process.stderr.write("Local chat with OCR could not start. Check the local setup guide.\n");
    process.exitCode = 1;
  }
}
