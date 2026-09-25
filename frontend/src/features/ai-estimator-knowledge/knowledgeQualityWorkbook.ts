import { createQualityWorkbookTools, type QualityImportResult } from "../../../../shared/knowledge/knowledgeQualityWorkbook";
import { EMPTY_QUALITY_CONTROL_OPTION_CATALOG, type QualityControlOptionCatalog } from "./knowledgeQuality";
import type { KnowledgeJsonObject } from "./knowledgeTypes";
export * from "../../../../shared/knowledge/knowledgeQualityWorkbook";
export const { parseQualityWorkbookBuffer, createQualityTemplateBuffer, createQualityExportBuffer, qualityAiPrompt } = createQualityWorkbookTools(() => import("exceljs"));
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PARSE_MS = 20_000;
const failure = (message: string): QualityImportResult => ({ parameters: [], issues: [{ row: null, message }] });

/** The selected file is parsed off the UI thread. Neither preview nor parsing saves any data. */
export async function readQualityWorkbook(file: File, signal?: AbortSignal, qualityOptions: QualityControlOptionCatalog = EMPTY_QUALITY_CONTROL_OPTION_CATALOG): Promise<QualityImportResult> {
  if (!/\.xlsx$/iu.test(file.name)) return failure("Choose an .xlsx workbook. Macro-enabled workbooks and CSV files are not supported.");
  if (file.size > MAX_FILE_BYTES) return failure("The workbook must be 5 MiB or smaller.");
  if (signal?.aborted) return failure("Import cancelled.");
  let buffer: ArrayBuffer;
  try { buffer = await file.arrayBuffer(); }
  catch { return failure("The workbook could not be read. Choose the file again."); }
  if (signal?.aborted) return failure("Import cancelled.");
  if (typeof Worker === "undefined") return parseQualityWorkbookBuffer(buffer, qualityOptions);
  return new Promise(resolve => {
    let worker: Worker;
    try { worker = new Worker(new URL("./knowledgeQualityWorkbook.worker.ts", import.meta.url), { type: "module" }); }
    catch { resolve(failure("The workbook reader could not start. Refresh the page and try again.")); return; }
    let finished = false;
    const finish = (result: QualityImportResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      resolve(result);
    };
    const cancel = () => finish(failure("Import cancelled."));
    const timeout = setTimeout(() => finish(failure("The workbook took too long to read. Reduce its size and remove unused sheets or formatting.")), MAX_PARSE_MS);
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<QualityImportResult>) => finish(event.data);
    worker.onerror = () => finish(failure("The workbook could not be read. Download the template and copy your values into it."));
    worker.postMessage({ buffer, qualityOptions }, [buffer]);
  });
}

function downloadWorkbook(buffer: ArrayBuffer, filename: string): void {
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function downloadQualityTemplate(qualityOptions: QualityControlOptionCatalog = EMPTY_QUALITY_CONTROL_OPTION_CATALOG): Promise<void> {
  downloadWorkbook(await createQualityTemplateBuffer(qualityOptions), "Lisno-quality-checklist-template.xlsx");
}

export async function downloadQualityChecklist(basketName: string, parameters: readonly KnowledgeJsonObject[], qualityOptions: QualityControlOptionCatalog = EMPTY_QUALITY_CONTROL_OPTION_CATALOG): Promise<void> {
  const safeBasketName = basketName.normalize("NFKC").replace(/[^\p{L}\p{N} -]/gu, "-").replace(/[ -]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80).replace(/-+$/gu, "") || "Main-Basket";
  downloadWorkbook(await createQualityExportBuffer(parameters, qualityOptions), `Lisno-${safeBasketName}-quality-checklist.xlsx`);
}
