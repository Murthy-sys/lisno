import { Worker } from "node:worker_threads";
import type { PdfValidationLimits } from "../domain/pdf-validation-budget.js";
import { ApiError } from "../middleware/errors.js";

const MAX_ACTIVE = 2;
const MAX_WAITING = 4;
const DEADLINE_MS = 5_000;
let active = 0;
const waiting: Array<() => void> = [];

function busy() {
  return new ApiError(503, "PDF_VALIDATION_BUSY", "Document processing is busy. Please try again shortly.", undefined, { "Retry-After": "5" });
}

async function acquire() {
  if (active >= MAX_ACTIVE) {
    if (waiting.length >= MAX_WAITING) throw busy();
    await new Promise<void>((resolve, reject) => {
      const enter = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const index = waiting.indexOf(enter);
        if (index >= 0) waiting.splice(index, 1);
        reject(busy());
      }, DEADLINE_MS);
      waiting.push(enter);
    });
  } else active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = waiting.shift();
    if (next) next(); else active -= 1;
  };
}

// Only fixed application code runs in the worker. Uploaded bytes are data in
// workerData, never script text or a module path. A fresh worker also discards
// pdf-lib's global name/reference caches after each untrusted document.
const workerCode = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  const loaded = workerData.loader
    ? await (await import(workerData.loader)).tsImport(workerData.module, workerData.parent)
    : await import(workerData.module);
  const valid = await loaded.validatePdfDocumentInWorker(Buffer.from(workerData.bytes), workerData.limits);
  parentPort.postMessage(valid === true);
})().catch(() => parentPort.postMessage(false));
`;

export async function isValidPdfDocument(data: Buffer, limits: Partial<PdfValidationLimits> = {}): Promise<boolean> {
  if (data.length < 8 || !/^%PDF-\d\.\d/.test(data.subarray(0, 8).toString("ascii"))) return false;
  const release = await acquire();
  try {
    const source = import.meta.url.endsWith(".ts");
    const module = new URL(`../domain/pdf-document-validation.${source ? "ts" : "js"}`, import.meta.url).href;
    const loader = source ? import.meta.resolve("tsx/esm/api") : null;
    return await new Promise<boolean>(resolve => {
      let worker: Worker | undefined;
      let settled = false;
      const finish = (valid: boolean) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (worker) void worker.terminate().then(() => resolve(valid), () => resolve(false));
        else resolve(false);
      };
      const timer = setTimeout(() => finish(false), Math.min(DEADLINE_MS, limits.maxMilliseconds ?? DEADLINE_MS));
      try {
        worker = new Worker(workerCode, {
          eval: true,
          execArgv: [],
          resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 2 },
          workerData: { module, loader, parent: import.meta.url, bytes: data, limits },
          stdout: true, stderr: true
        });
        worker.stdout?.resume(); worker.stderr?.resume();
        worker.once("message", value => finish(value === true));
        worker.once("error", () => finish(false));
        worker.once("exit", () => finish(false));
      } catch { finish(false); }
    });
  } finally { release(); }
}
