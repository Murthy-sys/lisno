import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLaunchConfig, startSupervisor } from "./render-start.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function createLocalChatConfig(env, root = ROOT, token = randomBytes(32).toString("hex"), { withOcr = false } = {}) {
  // Deliberately local, temporary credentials. No environment file is rewritten.
  if (env.NODE_ENV && env.NODE_ENV !== "development") throw new Error("Local chat requires development mode.");
  const config = createLaunchConfig({
    ...env,
    NODE_ENV: "development",
    ASSISTANT_MODE: "rules",
    ASSISTANT_SERVICE_URL: `http://127.0.0.1:${env.ASSISTANT_RULES_PORT ?? "8080"}`,
    ASSISTANT_SERVICE_TOKEN: token,
    ASK_LISNO_ENABLED: "true",
    PROJECT_CHAT_AI_ENABLED: "true",
  }, root);
  const backendPort = Number(config.node.env.PORT ?? 3000);
  if (!config.rulesEnabled || !Number.isSafeInteger(backendPort) || backendPort < 1024 || backendPort > 65535) {
    throw new Error("Local chat requires distinct backend and Python ports from 1024 to 65535.");
  }
  // Source entrypoint skips the demo bootstrap. Existing local accounts/data stay intact.
  config.node.args = ["--import", "tsx", join(root, "scripts", withOcr ? "local-chat-with-ocr.mts" : "local-chat-backend.mts")];
  if (withOcr) {
    // The inner supervisor reaps both owned children before the outer deadline.
    config.node.env.LISNO_LOCAL_CHILD_DRAIN_MS = String(config.nodeDrainMs);
    config.nodeDrainMs += 1_000;
  }
  return config;
}

export function localChatOptions(args) {
  if (!args.length) return { withOcr: false };
  if (args.length === 1 && args[0] === "--with-ocr") return { withOcr: true };
  throw new Error("Local chat accepts only the optional --with-ocr flag.");
}

export async function assertPortAvailable(port) {
  await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Local port ${port} is unavailable. Stop the existing service before starting local chat.`)));
    server.listen(port, "127.0.0.1", () => server.close(resolvePort));
  });
}

export async function main() {
  const options = localChatOptions(process.argv.slice(2));
  const require = createRequire(join(ROOT, "backend", "package.json"));
  const envPath = join(ROOT, "backend", ".env");
  const fileEnv = existsSync(envPath) ? require("dotenv").parse(readFileSync(envPath)) : {};
  const config = createLocalChatConfig({ ...fileEnv, ...process.env }, ROOT, undefined, options);
  if (!existsSync(config.python.command)) {
    throw new Error("Python rules environment is missing. Follow assistant-service/deployment/LOCAL_RULES.md first.");
  }
  if (options.withOcr && !existsSync(join(ROOT, "ocr-worker", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"))) {
    throw new Error("Local OCR environment is missing. Set up the existing OCR worker before using --with-ocr.");
  }
  await assertPortAvailable(Number(config.node.env.PORT ?? 3000));
  await assertPortAvailable(config.port);
  const supervisor = startSupervisor({ config });
  const onTerm = () => { void supervisor.stop("SIGTERM"); };
  const onInt = () => { void supervisor.stop("SIGINT"); };
  process.once("SIGTERM", onTerm);
  process.once("SIGINT", onInt);
  const code = await supervisor.done;
  process.off("SIGTERM", onTerm);
  process.off("SIGINT", onInt);
  process.exitCode = code;
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "")) {
  await main().catch((error) => {
    // Only our fixed setup errors are printed; environment/parser/spawn details may contain secrets.
    const safe = error instanceof Error && /^(Local |Python rules environment)/u.test(error.message);
    process.stderr.write(`${safe ? error.message : "Local chat could not start. Check the local setup guide."}\n`);
    process.exitCode = 1;
  });
}
