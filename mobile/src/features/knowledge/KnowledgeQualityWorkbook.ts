import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import { createQualityWorkbookTools, type QualityImportResult } from "../../../../shared/knowledge/knowledgeQualityWorkbook";
import type { QualityControlOptionCatalog } from "../../../../shared/knowledge/knowledgeQuality";
import type { KnowledgeJsonObject } from "../../../../shared/knowledge/knowledgeTypes";
import { pickDocument, readFileBytes, releaseSelectedAsset, writePrivateFileBytes } from "../../platform/files";
import { inspectQualityWorkbookArchive } from "./knowledgeWorkbookArchive";

export const QUALITY_WORKBOOK_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BYTES = 5 * 1024 * 1024;
const workbook = createQualityWorkbookTools(async () => {
  // Metro resolves this browser-only bundle lazily, without Node filesystem modules.
  const module: typeof import("exceljs") = require("exceljs/dist/exceljs.min.js");
  return { default: module };
});

export async function selectQualityWorkbook(options: QualityControlOptionCatalog): Promise<QualityImportResult | null> {
  const selection = await pickDocument({ acceptedMimeTypes: [QUALITY_WORKBOOK_MIME], maxBytes: MAX_BYTES });
  if (selection.status === "cancelled") return null;
  try {
    if (!/\.xlsx$/iu.test(selection.asset.name)) throw new Error("Choose an .xlsx workbook. CSV and macro-enabled files are not supported.");
    const bytes = await readFileBytes(selection.asset.uri, MAX_BYTES);
    const buffer = new Uint8Array(bytes).buffer;
    await inspectQualityWorkbookArchive(buffer);
    return await workbook.parseQualityWorkbookBuffer(buffer, options);
  } finally { await releaseSelectedAsset(selection.asset).catch(() => undefined); }
}

export async function shareQualityWorkbook(kind: "template" | "saved", basketName: string, parameters: readonly KnowledgeJsonObject[], options: QualityControlOptionCatalog): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device.");
  const buffer = kind === "template" ? await workbook.createQualityTemplateBuffer(options) : await workbook.createQualityExportBuffer(parameters, options);
  const filename = kind === "template" ? "quality-parameters-template.xlsx" : `${basketName}-quality-parameters.xlsx`;
  const uri = writePrivateFileBytes(new Uint8Array(buffer), filename, MAX_BYTES);
  try { await Sharing.shareAsync(uri, { mimeType: QUALITY_WORKBOOK_MIME, UTI: "org.openxmlformats.spreadsheetml.sheet" }); }
  finally { const file = new File(uri); if (file.exists) file.delete(); }
}
