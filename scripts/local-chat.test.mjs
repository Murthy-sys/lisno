import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertPortAvailable, createLocalChatConfig, localChatOptions } from "./local-chat.mjs";

test("normal backend npm dev selects the combined local Python and OCR startup", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = JSON.parse(readFileSync(resolve(root, "backend/package.json"), "utf8"));
  const [command, entrypoint, ...args] = manifest.scripts.dev.split(/\s+/u);
  assert.equal(command, "node");
  assert.equal(resolve(root, "backend", entrypoint), resolve(root, "scripts/local-chat.mjs"));
  const options = localChatOptions(args);
  assert.deepEqual(options, { withOcr: true });

  const config = createLocalChatConfig({
    ASSISTANT_SERVICE_URL: "https://obsolete-cloud.example",
    ASSISTANT_SERVICE_TOKEN: "obsolete-service-token",
    GEMINI_API_KEY: "synthetic-existing-key",
    OPENAI_API_KEY: "synthetic-existing-key",
  }, root, undefined, options);
  assert.deepEqual(config.node.args, ["--import", "tsx", resolve(root, "scripts/local-chat-with-ocr.mts")]);
  assert.equal(config.node.env.ASK_LISNO_ENABLED, "true");
  assert.equal(config.node.env.PROJECT_CHAT_AI_ENABLED, "true");
  assert.equal(config.node.env.ASSISTANT_SERVICE_URL, "http://127.0.0.1:8080");
  assert.equal(config.node.env.ASSISTANT_SERVICE_TOKEN, config.python.env.ASSISTANT_SERVICE_TOKEN);
  assert.match(config.token, /^[a-f0-9]{64}$/u);
  assert.deepEqual(config.python.args, ["-m", "lisno_assistant.rules_main"]);
  assert.equal(config.python.env.GEMINI_API_KEY, undefined);
  assert.equal(config.python.env.OPENAI_API_KEY, undefined);
  assert.equal(config.python.env.MONGODB_URI, undefined);
});

test("local chat connects both surfaces to rules with temporary shared credentials", () => {
  const env = { PORT: "3000", MONGODB_URI: "synthetic-local-database", JWT_SECRET: "synthetic-secret", ASSISTANT_SERVICE_URL: "https://old.example", ASSISTANT_SERVICE_TOKEN: "old-token", GEMINI_API_KEY: "synthetic-cloud-secret" };
  const result = createLocalChatConfig(env, "/synthetic/repo");
  assert.equal(result.rulesEnabled, true);
  assert.equal(result.node.env.ASK_LISNO_ENABLED, "true");
  assert.equal(result.node.env.PROJECT_CHAT_AI_ENABLED, "true");
  assert.equal(result.node.env.ASSISTANT_SERVICE_URL, "http://127.0.0.1:8080");
  assert.match(result.token, /^[a-f0-9]{64}$/u);
  assert.equal(result.python.env.ASSISTANT_SERVICE_TOKEN, result.token);
  assert.equal(result.node.env.MONGODB_URI, env.MONGODB_URI);
  assert.equal(result.node.env.JWT_SECRET, env.JWT_SECRET);
  assert.equal(result.python.env.GEMINI_API_KEY, undefined);
  assert.equal(result.python.env.MONGODB_URI, undefined);
  assert.equal(result.node.env.GEMINI_API_KEY, env.GEMINI_API_KEY);
  assert.equal(env.ASSISTANT_SERVICE_TOKEN, "old-token");
  assert.deepEqual(result.node.args, ["--import", "tsx", "/synthetic/repo/scripts/local-chat-backend.mts"]);
  assert.notEqual(createLocalChatConfig(env).token, result.token);
});

test("local configuration rejects production, invalid or colliding ports", () => {
  for (const env of [{NODE_ENV:"production"}, {PORT:"8080"}, {PORT:"bad"}, {PORT:"80"}, {ASSISTANT_RULES_PORT:"3000"}, {ASSISTANT_RULES_PORT:"bad"}]) {
    assert.throws(() => createLocalChatConfig(env));
  }
});

test("optional OCR mode shares one backend and preserves Python isolation", () => {
  const env = {PORT: "3000", OCR_WORKER_TOKEN: "synthetic-ocr-token", GEMINI_API_KEY: "synthetic-existing-extraction-key"};
  const token = "synthetic-local-chat-token-for-testing";
  const plain = createLocalChatConfig(env, "/synthetic/repo", token);
  const combined = createLocalChatConfig(env, "/synthetic/repo", token, {withOcr: true});
  assert.deepEqual(combined.node.args, ["--import", "tsx", "/synthetic/repo/scripts/local-chat-with-ocr.mts"]);
  assert.deepEqual(combined.python, plain.python);
  assert.equal(combined.node.env.OCR_WORKER_TOKEN, env.OCR_WORKER_TOKEN);
  assert.equal(combined.node.env.LISNO_LOCAL_CHILD_DRAIN_MS, "25000");
  assert.equal(combined.nodeDrainMs, 26000);
  assert.equal(combined.python.env.LISNO_LOCAL_CHILD_DRAIN_MS, undefined);
  assert.equal(combined.python.env.GEMINI_API_KEY, undefined);
});

test("CLI accepts only the explicit combined-startup option", () => {
  assert.deepEqual(localChatOptions([]), {withOcr: false});
  assert.deepEqual(localChatOptions(["--with-ocr"]), {withOcr: true});
  for (const args of [["--unknown"], ["--with-ocr", "--with-ocr"], ["production"]]) assert.throws(() => localChatOptions(args));
});

test("port check refuses an occupied service without stopping it", async () => {
  const server = createServer();
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await assert.rejects(assertPortAvailable(port), /unavailable/u);
    assert.equal(server.listening, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
