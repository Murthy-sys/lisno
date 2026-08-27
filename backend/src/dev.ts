import "dotenv/config";

import { pathToFileURL } from "node:url";

import { startDevelopmentBackend } from "./development/start.js";

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  startDevelopmentBackend().then(
    () => undefined,
    (error: unknown) => {
      const message =
        error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    }
  );
}
