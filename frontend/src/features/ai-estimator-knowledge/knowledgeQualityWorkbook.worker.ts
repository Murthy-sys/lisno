import { parseQualityWorkbookBuffer } from "./knowledgeQualityWorkbook";

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try { self.postMessage(await parseQualityWorkbookBuffer(event.data)); }
  catch { self.postMessage({ parameters: [], issues: [{ row: null, message: "The workbook could not be read. Save a new .xlsx copy and try again." }] }); }
};
