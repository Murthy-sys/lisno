import "dotenv/config";

import { loadDevelopmentEnvironment } from "./config/development-env.js";
import { startServer } from "./server.js";

startServer({ loadEnvironment: loadDevelopmentEnvironment }).then(
  () => undefined,
  (error: unknown) => {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
);
