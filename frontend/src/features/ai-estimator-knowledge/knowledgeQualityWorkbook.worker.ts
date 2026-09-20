import { parseQualityWorkbookBuffer } from "./knowledgeQualityWorkbook";

self.onmessage = async (event: MessageEvent<{ buffer: ArrayBuffer; qualityOptions: Parameters<typeof parseQualityWorkbookBuffer>[1] }>) => {
  try { self.postMessage(await parseQualityWorkbookBuffer(event.data.buffer, event.data.qualityOptions)); }
  catch { self.postMessage({ parameters: [], issues: [{ row: null, message: "The workbook could not be read. Save a new .xlsx copy and try again." }] }); }
};
