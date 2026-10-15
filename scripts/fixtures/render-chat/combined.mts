// Exercises the real nested supervisors without application data or network access.
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createLocalChatWithOcrSpecs, runLocalChatWithOcr } from "../../local-chat-with-ocr.mjs";

const children: ChildProcess[] = [];
const fixture = fileURLToPath(new URL("./child.mjs", import.meta.url));
const behavior = process.argv[2] ?? "normal";
const specs = createLocalChatWithOcrSpecs({ environment: {} }).map(spec => ({
  ...spec, command: process.execPath, args: [fixture, behavior],
}));
process.exitCode = await runLocalChatWithOcr({
  specs, childDrainMs: 80, pathExists: () => true,
  writeOutput: () => {}, writeError: () => {},
  spawnProcess: ((command: string, args: string[], options: object) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    children.push(child);
    if (children.length === 2) child.once("message", () => process.send?.({ ready: true, pids: children.map(c => c.pid) }));
    return child;
  }) as typeof spawn,
  waitForBackend: async () => { await once(children[0], "message"); },
});
