import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createLocalChatConfig } from "./local-chat.mjs";
import { startSupervisor } from "./render-start.mjs";

for (const behavior of ["normal", "ignore-term"]) {
  test(`combined supervisor reaps backend, OCR and Python children (${behavior})`, { timeout: 10_000 }, async () => {
    const config = createLocalChatConfig({}, undefined, undefined, { withOcr: true });
    config.node.args = ["--import", "tsx", fileURLToPath(new URL("./fixtures/render-chat/combined.mts", import.meta.url)), behavior];
    config.python = { command: process.execPath, args: [fileURLToPath(new URL("./fixtures/render-chat/child.mjs", import.meta.url)), "normal"], cwd: config.node.cwd, env: {} };
    const children = [];
    let descendants = [];
    let combinedReady;
    let pythonReady;
    const ready = Promise.all([
      new Promise(resolve => { combinedReady = resolve; }),
      new Promise(resolve => { pythonReady = resolve; }),
    ]);
    const events = [];
    const supervisor = startSupervisor({
      config, probe: async () => true, log: event => events.push(event),
      timing: { nodeDrainMs: 2_000, pythonStopMs: 500 },
      spawnProcess: (command, args, options) => {
        const child = spawn(command, args, { ...options, stdio: ["ignore", "ignore", "ignore", "ipc"] });
        children.push(child);
        if (children.length === 1) child.once("message", message => { descendants = message.pids; combinedReady(); });
        else child.once("message", pythonReady);
        return child;
      },
    });
    try {
      await ready;
      assert.equal(descendants.length, 2);
      const code = await supervisor.stop("SIGTERM");
      assert.equal(code, behavior === "normal" ? 0 : 1);
      assert.ok(!events.includes("backend-drain-timeout"));
      for (const pid of [...children.map(child => child.pid), ...descendants]) {
        assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
      }
    } finally {
      await supervisor.stop("SIGTERM");
      // Only synthetic fixture descendants created by this test are eligible for cleanup.
      for (const pid of descendants) {
        try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      }
    }
  });
}
