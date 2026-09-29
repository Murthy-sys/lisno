import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import {
  createVendorInductionWorkbookTools,
  VENDOR_INDUCTION_WORKBOOK_MAX_BYTES,
  VENDOR_INDUCTION_WORKBOOK_MIME,
  type VendorInductionWorkbookResult,
} from "../../../../shared/knowledge/vendorInductionWorkbook";
import type { VendorInductionQuestion } from "../../../../shared/knowledge/vendorInduction";
import { pickDocument, readFileBytes, releaseSelectedAsset, writePrivateFileBytes } from "../../platform/files";

const workbook = createVendorInductionWorkbookTools(async () => {
  // Metro loads the browser bundle only when staff imports or shares a workbook.
  const module: typeof import("exceljs") = require("exceljs/dist/exceljs.min.js");
  return { default: module };
});

export async function selectVendorInductionWorkbook(): Promise<VendorInductionWorkbookResult | null> {
  const selection = await pickDocument({ acceptedMimeTypes: [VENDOR_INDUCTION_WORKBOOK_MIME], maxBytes: VENDOR_INDUCTION_WORKBOOK_MAX_BYTES });
  if (selection.status === "cancelled") return null;
  try {
    if (!/\.xlsx$/iu.test(selection.asset.name)) throw new Error("Choose an .xlsx workbook. CSV and macro-enabled files are not supported.");
    const bytes = await readFileBytes(selection.asset.uri, VENDOR_INDUCTION_WORKBOOK_MAX_BYTES);
    return await workbook.parseBuffer(new Uint8Array(bytes).buffer);
  } finally { await releaseSelectedAsset(selection.asset).catch(() => undefined); }
}

export async function shareVendorInductionWorkbook(kind: "template" | "saved", questions: readonly VendorInductionQuestion[]): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device.");
  const buffer = kind === "template" ? await workbook.createTemplateBuffer() : await workbook.createExportBuffer(questions);
  const filename = kind === "template" ? "vendor-induction-template.xlsx" : "vendor-induction-draft.xlsx";
  const uri = writePrivateFileBytes(new Uint8Array(buffer), filename, VENDOR_INDUCTION_WORKBOOK_MAX_BYTES);
  try { await Sharing.shareAsync(uri, { mimeType: VENDOR_INDUCTION_WORKBOOK_MIME, UTI: "org.openxmlformats.spreadsheetml.sheet" }); }
  finally { const file = new File(uri); if (file.exists) file.delete(); }
}
