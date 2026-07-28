import "dotenv/config";

import { fileURLToPath } from "node:url";

import {
  createDevelopmentProcessSpecs,
  runDevelopmentProcesses
} from "./processes.js";

const backendRoot = fileURLToPath(new URL("../..", import.meta.url));
const specs = createDevelopmentProcessSpecs({ backendRoot });

process.exitCode = await runDevelopmentProcesses({ specs });
