import type { Cell, CellValue, Workbook, Worksheet } from "exceljs";
import { createQualityParameter, qualityImportIssues, validateQualityParameters, QUALITY_PARAMETER_TYPES, QUALITY_CHECK_METHODS, QUALITY_SEVERITIES, QUALITY_SAMPLING_METHODS } from "./knowledgeQuality";
import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

export interface QualityImportIssue { row: number | null; column?: string; message: string }
export interface QualityImportResult { parameters: KnowledgeJsonObject[]; issues: QualityImportIssue[] }

export const QUALITY_SIMPLE_WORKBOOK_HEADERS = ["Question", "Answer type", "Options", "Acceptance criteria", "Photo evidence"] as const;
export const QUALITY_WORKBOOK_HEADERS = [
  "Question", "Answer type", "Stage", "Instructions", "Acceptance criteria",
  "Check method", "Severity", "Responsible role", "Failure action",
  "Unit", "Options", "Minimum", "Maximum", "Default answer", "Sampling method", "Sample value",
  "Sample unit", "Photo evidence", "Minimum photos per sample", "Document evidence", "Video evidence", "Evidence instructions"
] as const;
const LEGACY_WORKBOOK_HEADERS = ["Required", "Active", "Category"] as const;
type Header = typeof QUALITY_WORKBOOK_HEADERS[number] | typeof LEGACY_WORKBOOK_HEADERS[number];
const WORKSHEET = "Quality Parameters";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_PARSE_MS = 20_000;
const normalizeHeader = (value: string) => value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
const canonicalHeaders = new Map([...QUALITY_WORKBOOK_HEADERS, ...LEGACY_WORKBOOK_HEADERS].map(header => [normalizeHeader(header), header]));
const failure = (message: string): QualityImportResult => ({ parameters: [], issues: [{ row: null, message }] });

/** The selected file is parsed off the UI thread. Neither preview nor parsing saves any data. */
export async function readQualityWorkbook(file: File, signal?: AbortSignal): Promise<QualityImportResult> {
  if (!/\.xlsx$/iu.test(file.name)) return failure("Choose an .xlsx workbook. Macro-enabled workbooks and CSV files are not supported.");
  if (file.size > MAX_FILE_BYTES) return failure("The workbook must be 5 MiB or smaller.");
  if (signal?.aborted) return failure("Import cancelled.");
  let buffer: ArrayBuffer;
  try { buffer = await file.arrayBuffer(); }
  catch { return failure("The workbook could not be read. Choose the file again."); }
  if (signal?.aborted) return failure("Import cancelled.");
  if (typeof Worker === "undefined") return parseQualityWorkbookBuffer(buffer);
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
    worker.postMessage(buffer, [buffer]);
  });
}

/** Bounds the ZIP before ExcelJS decompresses it, and rejects active or externally linked content. */
function inspectArchive(buffer: ArrayBuffer): void {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("The workbook must be 5 MiB or smaller.");
  const view = new DataView(buffer);
  if (view.byteLength < 22 || view.getUint32(0, true) !== 0x04034b50) throw new Error("This file is not a valid .xlsx workbook.");
  let end = -1;
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65_557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === view.byteLength) { end = offset; break; }
  }
  if (end < 0) throw new Error("The workbook archive is incomplete or malformed.");
  const entries = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 || view.getUint16(end + 8, true) !== entries || entries > 2000 || directorySize > MAX_FILE_BYTES || offset + directorySize !== end) throw new Error("This workbook archive format is not supported. Save a fresh .xlsx copy.");
  const directoryEnd = offset + directorySize;
  let total = 0;
  const names = new Set<string>();
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > directoryEnd || view.getUint32(offset, true) !== 0x02014b50) throw new Error("The workbook archive is malformed.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 24, true);
    const length = view.getUint16(offset + 28, true);
    const extra = view.getUint16(offset + 30, true);
    const comment = view.getUint16(offset + 32, true);
    if (flags & 1 || ![0, 8].includes(method) || offset + 46 + length + extra + comment > directoryEnd) throw new Error("Encrypted or unsupported workbook archives cannot be imported.");
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, length)).toLowerCase();
    if (names.has(name) || name.includes("..") || name.startsWith("/") || name.includes("\\")) throw new Error("The workbook archive contains invalid entries.");
    names.add(name);
    if (/vbaproject|macrosheets|externallinks|embeddings|activex/iu.test(name)) throw new Error("Remove macros, embedded objects and external links before importing.");
    total += size;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error("The expanded workbook is too large. Remove unused sheets and formatting.");
    offset += 46 + length + extra + comment;
  }
  if (offset !== directoryEnd || !names.has("xl/workbook.xml") || !names.has("[content_types].xml")) throw new Error("This file is not a valid Excel workbook.");
}

function scalar(cell: Cell, issues: QualityImportIssue[], row: number, column: string): string | number | boolean | null {
  const value: CellValue = cell.value;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const content = typeof value === "string" ? value : value && typeof value === "object" && "richText" in value ? value.richText.map(entry => entry.text).join("") : null;
  if (content !== null) {
    if (content.length > 4000) { issues.push({ row, column, message: "Cell text must be at most 4000 characters." }); return null; }
    return content;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  issues.push({ row, column, message: value && typeof value === "object" && ("formula" in value || "sharedFormula" in value) ? "Formulas are not allowed, including cached results. Paste values only." : "Use a plain text, numeric or boolean value; dates, errors and links are not supported." });
  return null;
}

export async function parseQualityWorkbookBuffer(buffer: ArrayBuffer): Promise<QualityImportResult> {
  try { inspectArchive(buffer); }
  catch (error) { return failure(error instanceof Error ? error.message : "The workbook is invalid."); }
  let book: Workbook;
  try {
    const ExcelJS = await import("exceljs");
    book = new ExcelJS.default.Workbook();
    await book.xlsx.load(buffer);
  } catch { return failure("The workbook is malformed or unsupported. Save it as a new .xlsx file and try again."); }
  const sheet = book.getWorksheet(WORKSHEET) ?? (book.worksheets.length === 1 ? book.worksheets[0] : undefined);
  if (!sheet) return failure('Use a worksheet named "Quality Parameters" when the workbook has multiple worksheets.');
  if (sheet.rowCount > 201 || sheet.columnCount > 30) return failure("Use at most 200 checklist rows and 30 columns. Remove unused rows, columns and formatting.");
  const issues: QualityImportIssue[] = [];
  // No worksheet's formulas, cached formula results or links are evaluated or accepted.
  for (const candidate of book.worksheets) {
    if (candidate.rowCount > 201 || candidate.columnCount > 30) return failure("Each worksheet must contain at most 201 rows and 30 columns, including its header.");
    candidate.eachRow(row => row.eachCell(cell => {
      const value = cell.value;
      if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value || "hyperlink" in value || "error" in value)) issues.push({ row: candidate === sheet ? row.number : null, column: candidate === sheet ? cell.address : undefined, message: `Remove formulas, cell errors and hyperlinks from worksheet "${candidate.name}". Paste values only.` });
    }));
  }
  if (issues.length) return { parameters: [], issues };
  const columns = new Map<Header, number>();
  for (let column = 1; column <= sheet.columnCount; column++) {
    const cell = sheet.getRow(1).getCell(column);
    const value = scalar(cell, issues, 1, cell.address);
    if (value === null) {
      if (Array.from({ length: sheet.rowCount - 1 }, (_, i) => sheet.getRow(i + 2).getCell(column).value).some(v => v !== null && v !== undefined && v !== "")) issues.push({ row: 1, column: cell.address, message: "A column with values needs a supported heading." });
      continue;
    }
    const header = typeof value === "string" ? canonicalHeaders.get(normalizeHeader(value)) : undefined;
    if (!header) issues.push({ row: 1, column: String(value), message: `Unknown column: ${String(value)}. Use the template headings.` });
    else if (columns.has(header)) issues.push({ row: 1, column: header, message: "This heading appears more than once." });
    else columns.set(header, column);
  }
  for (const heading of ["Question", "Answer type"] as const) if (!columns.has(heading)) issues.push({ row: 1, column: heading, message: `The ${heading} heading is required.` });
  if (issues.length) return { parameters: [], issues };
  const parameters: KnowledgeJsonObject[] = [];
  const sourceRows: number[] = [];
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
    const row = sheet.getRow(rowIndex);
    if (!row.hasValues || row.values && Object.values(row.values).every(value => value === null || value === undefined || typeof value === "string" && !value.trim())) continue;
    const value = (header: Header) => columns.has(header) ? scalar(row.getCell(columns.get(header)!), issues, rowIndex, header) : null;
    const text = (header: Header): string | null => {
      const entry = value(header);
      if (entry === null) return null;
      if (typeof entry !== "string") { issues.push({ row: rowIndex, column: header, message: "Enter text in this column." }); return null; }
      return entry.trim() || null;
    };
    const enumeration = (header: Header, choices: readonly string[]) => {
      const entry = text(header);
      if (entry === null) return null;
      const normalized = entry.toLowerCase().replace(/[\s-]+/gu, "_");
      if (!choices.includes(normalized)) issues.push({ row: rowIndex, column: header, message: `Use one of: ${choices.join(", ")}.` });
      return normalized;
    };
    const boolean = (header: Header, blank: boolean | null = null): boolean | null => {
      const entry = value(header);
      if (entry === null || typeof entry === "string" && !entry.trim()) return blank;
      if (typeof entry === "boolean") return entry;
      if (typeof entry === "string" && /^(?:true|false|yes|no)$/iu.test(entry.trim())) return /^(?:true|yes)$/iu.test(entry.trim());
      issues.push({ row: rowIndex, column: header, message: "Use true or false (yes or no is also accepted)." });
      return null;
    };
    const numeric = (header: Header, percentage = false): string | null => {
      const entry = value(header);
      if (entry === null || typeof entry === "string" && !entry.trim()) return null;
      let result: string;
      if (typeof entry === "number") {
        const format = (row.getCell(columns.get(header)!).numFmt ?? "").replace(/"[^"]*"|\\.|\[[^\]]*\]/gu, "");
        const formattedPercent = percentage && format.includes("%");
        const number = formattedPercent ? entry * 100 : entry;
        // Percent-formatted Excel cells store fractions. Avoid binary multiplication residue.
        result = formattedPercent ? Number(number.toPrecision(15)).toString() : String(number);
      } else if (typeof entry === "string") result = entry.trim().replace(percentage ? /%$/u : /$^/u, "").trim();
      else { issues.push({ row: rowIndex, column: header, message: "Enter a non-negative number." }); return null; }
      if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(result)) { issues.push({ row: rowIndex, column: header, message: "Use a non-negative decimal with at most six decimal places, without commas or leading zeros." }); return null; }
      return result;
    };
    const type = enumeration("Answer type", QUALITY_PARAMETER_TYPES);
    const question = text("Question");
    // Older templates may contain these flags. Validate their values, but every check is now mandatory and active.
    boolean("Required");
    boolean("Active");
    const legacyCategory = text("Category");
    if (legacyCategory !== null && legacyCategory.length > 240) issues.push({ row: rowIndex, column: "Category", message: "Enter nonempty text up to 240 characters." });
    const entry: Record<string, KnowledgeJsonValue> = { ...createQualityParameter(), label: question ?? "", type: type ?? "", required: true, active: true };
    for (const [header, key] of [["Stage", "stage"], ["Instructions", "instructions"], ["Acceptance criteria", "acceptanceCriteria"], ["Responsible role", "responsibleRole"], ["Failure action", "failureAction"], ["Unit", "unit"]] as const) {
      const content = text(header);
      if (content !== null) entry[key] = content;
    }
    const checkMethod = enumeration("Check method", QUALITY_CHECK_METHODS);
    const severity = enumeration("Severity", QUALITY_SEVERITIES);
    if (checkMethod) entry.checkMethod = checkMethod;
    if (severity) entry.severity = severity;
    const options = text("Options");
    if (options !== null) entry.allowedValues = options.split("|").map(v => v.trim());
    for (const [header, key] of [["Minimum", "minimum"], ["Maximum", "maximum"]] as const) {
      const number = numeric(header);
      if (number !== null) entry[key] = number;
    }
    if (value("Default answer") !== null) {
      if (type === "number") entry.defaultValue = numeric("Default answer");
      else if (type === "boolean" || type === "checkbox") entry.defaultValue = boolean("Default answer");
      else if (type === "multi_select") entry.defaultValue = text("Default answer")?.split("|").map(v => v.trim()) ?? null;
      else entry.defaultValue = text("Default answer");
    }
    const method = enumeration("Sampling method", QUALITY_SAMPLING_METHODS);
    const sampleValue = numeric("Sample value", method === "percentage");
    const sampleUnit = text("Sample unit");
    if (method !== null || sampleValue !== null || sampleUnit !== null) entry.sampling = { method: method ?? "", unit: sampleUnit ?? "", ...(sampleValue !== null ? { value: Number(sampleValue) } : {}) };
    const photoValue = value("Photo evidence");
    let photos: boolean | null = null;
    let inlinePhotoCount: number | null = null;
    if (typeof photoValue === "boolean") photos = photoValue;
    else if (typeof photoValue === "string" && /^(?:true|false|yes|no)$/iu.test(photoValue.trim())) photos = /^(?:true|yes)$/iu.test(photoValue.trim());
    else if (photoValue !== null && !(typeof photoValue === "string" && !photoValue.trim())) {
      const count = typeof photoValue === "number" ? photoValue : /^(?:0|[1-9]\d*)$/u.test(photoValue.trim()) ? Number(photoValue.trim()) : Number.NaN;
      if (!Number.isInteger(count) || count < 0 || count > 100) issues.push({ row: rowIndex, column: "Photo evidence", message: "Enter a whole number from 0 to 100: 0 for no photos, 1 for a single photo, or 2–100 for multiple photos." });
      else { inlinePhotoCount = count; photos = count > 0; }
    }
    const documents = boolean("Document evidence");
    const video = boolean("Video evidence");
    const minPhotos = numeric("Minimum photos per sample");
    const evidenceInstructions = text("Evidence instructions");
    if (inlinePhotoCount !== null && minPhotos !== null && Number(minPhotos) !== inlinePhotoCount) issues.push({ row: rowIndex, column: "Minimum photos per sample", message: "This count must match the number in Photo evidence. Use the same count or leave this legacy column blank." });
    // Inline counts are complete requirements. Legacy Yes/No still uses a strict explicit count column, or defaults Yes to one if absent.
    const minPhotosPerSample = inlinePhotoCount !== null ? inlinePhotoCount > 0 ? inlinePhotoCount : null : photos === true && !columns.has("Minimum photos per sample") ? 1 : minPhotos !== null ? Number(minPhotos) : null;
    if ([photos, documents, video, minPhotos, evidenceInstructions].some(v => v !== null)) entry.evidence = { photos: photos ?? false, documents: documents ?? false, video: video ?? false, ...(minPhotosPerSample !== null ? { minPhotosPerSample } : {}), ...(evidenceInstructions ? { instructions: evidenceInstructions } : {}) };
    parameters.push(entry);
    sourceRows.push(rowIndex);
  }
  for (const issue of qualityImportIssues([], parameters)) {
    const match = /^parameters\.(\d+)(?:\.(.+))?$/u.exec(issue.path);
    issues.push({ row: match ? sourceRows[Number(match[1])] : null, column: match?.[2] ? columnForField(match[2]) : undefined, message: issue.message });
  }
  if (!parameters.length) issues.push({ row: null, message: "The Quality Parameters worksheet has no questions. Add rows below the headings." });
  return { parameters, issues };
}

function columnForField(field: string): string {
  const mapping: Record<string, Header> = { label: "Question", type: "Answer type", category: "Category", stage: "Stage", instructions: "Instructions", acceptanceCriteria: "Acceptance criteria", checkMethod: "Check method", severity: "Severity", responsibleRole: "Responsible role", failureAction: "Failure action", required: "Required", active: "Active", unit: "Unit", allowedValues: "Options", minimum: "Minimum", maximum: "Maximum", defaultValue: "Default answer", "sampling.method": "Sampling method", "sampling.value": "Sample value", "sampling.unit": "Sample unit", "evidence.photos": "Photo evidence", "evidence.minPhotosPerSample": "Minimum photos per sample", "evidence.documents": "Document evidence", "evidence.video": "Video evidence", "evidence.instructions": "Evidence instructions" };
  return mapping[field] ?? mapping[field.replace(/\.\d+$/u, "")] ?? field;
}

function styleEssentialWorksheet(sheet: Worksheet): void {
  sheet.addRow([...QUALITY_SIMPLE_WORKBOOK_HEADERS]);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: QUALITY_SIMPLE_WORKBOOK_HEADERS.length } };
  [55, 20, 34, 60, 20].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF221D40" } };
  sheet.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(1).height = 34;
}

function addEssentialValidation(sheet: Worksheet): void {
  for (let row = 2; row <= 201; row++) {
    sheet.getCell(row, 2).dataValidation = { type: "list", allowBlank: true, formulae: [`"${QUALITY_PARAMETER_TYPES.join(",")}"`], showErrorMessage: true, errorStyle: "stop", errorTitle: "Choose an answer type", error: "Choose one of the answer types in the dropdown." };
    sheet.getCell(row, 5).dataValidation = { type: "whole", operator: "between", allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorStyle: "stop", errorTitle: "Enter 0 to 100 photos", error: "Enter a whole number from 0 to 100.", showInputMessage: true, promptTitle: "Required photo count", prompt: "0 = no photos; 1 = a single photo; 2–100 = multiple photos per checked unit." };
  }
}

export async function createQualityTemplateBuffer(): Promise<ArrayBuffer> {
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.default.Workbook();
  book.creator = "Lisno";
  const sheet = book.addWorksheet(WORKSHEET);
  styleEssentialWorksheet(sheet);
  addEssentialValidation(sheet);
  const instructions = book.addWorksheet("Instructions");
  instructions.getColumn(1).width = 120;
  const notes = [
    'Add one check per row in "Quality Parameters". The checklist applies to the whole Main Basket; every check is mandatory and active.',
    "Question and Answer type are required. Write a clear question (up to 240 characters) and choose an answer type from the dropdown.",
    "Options: for dropdown, radio or multi_select only; separate distinct options with |, for example Pass|Fail|Not applicable.",
    "Acceptance criteria: describe what a pass looks like (up to 4000 characters). Use approved project details and have a qualified professional review them.",
    "Photo evidence: enter a whole number from 0 to 100. 0 or blank means no photos; 1 means a single photo; 2–100 means multiple required photos per checked unit. Existing sampling rules apply the count per sampled unit.",
    "Use at most 200 checks and a 5 MiB .xlsx file. Keep these five headings. Enter plain values only; no formulas, links, macros, embedded objects or images.",
    "Example Electrical is guidance only and is not imported. Import previews new checks before they are added; it does not save or replace existing checks.",
    "Saved downloads retain other existing settings in grouped, hidden columns. Older Yes/No values remain supported. A numeric Photo evidence value replaces a blank legacy photo-count cell; if both counts are filled, they must match."
  ];
  notes.forEach(note => { const row = instructions.addRow([note]); row.alignment = { wrapText: true, vertical: "top" }; row.height = 34; });
  const example = book.addWorksheet("Example Electrical");
  styleEssentialWorksheet(example);
  example.addRow(["Are the electrical fixtures securely fixed and visibly undamaged?", "dropdown", "Pass|Fail|Not applicable", "Fixings match the approved project detail; fixtures are secure and visibly undamaged.", 2]);
  example.getRow(2).alignment = { wrapText: true, vertical: "top" };
  example.getRow(2).height = 60;
  addEssentialValidation(example);
  const output = await book.xlsx.writeBuffer();
  return new Uint8Array(output).slice().buffer;
}

function exportIssue(index: number, column: Header, message: string): Error {
  return new Error(`Cannot download checklist: check ${index + 1}, ${column}. ${message}`);
}

/** Uses the established import format; unsupported list values fail instead of changing saved choices. */
function exportList(value: KnowledgeJsonValue | undefined, index: number, column: "Options" | "Default answer"): string | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw exportIssue(index, column, "Expected a list of text values.");
  // An empty selection is unanswered, like an absent or null default; the importer leaves a blank default unset.
  if (value.length === 0) return null;
  if (value.some(entry => typeof entry !== "string" || entry.includes("|") || entry.trim() !== entry)) throw exportIssue(index, column, "Options with a | character or leading/trailing spaces cannot be represented in the Excel format. Update these values before downloading.");
  const result = value.join("|");
  if (result.length > 4000) throw exportIssue(index, column, "The combined values exceed Excel import's 4000-character cell limit. Shorten the options before downloading.");
  return result;
}

export async function createQualityExportBuffer(parameters: readonly KnowledgeJsonObject[]): Promise<ArrayBuffer> {
  if (!parameters.length) throw new Error("There are no saved quality parameters to download.");
  const validation = validateQualityParameters([...parameters]);
  if (validation.length) {
    const issue = validation[0];
    const match = /^parameters\.(\d+)(?:\.(.+))?$/u.exec(issue.path);
    throw new Error(`Cannot download checklist: ${match ? `check ${Number(match[1]) + 1}, ${columnForField(match[2] ?? "")}. ` : ""}${issue.message}`);
  }
  const object = (value: KnowledgeJsonValue | undefined): value is KnowledgeJsonObject => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const rows = parameters.map((parameter, index) => {
    const sampling = object(parameter.sampling) ? parameter.sampling : undefined;
    const evidence = object(parameter.evidence) ? parameter.evidence : undefined;
    if (sampling?.value !== undefined && sampling.value !== null && !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(String(sampling.value))) throw exportIssue(index, "Sample value", "The Excel format supports up to six decimal places. Update the sampling value before downloading.");
    const values: Partial<Record<Header, KnowledgeJsonValue>> = {
      Question: parameter.label, "Answer type": parameter.type, Stage: parameter.stage,
      Instructions: parameter.instructions, "Acceptance criteria": parameter.acceptanceCriteria,
      "Check method": parameter.checkMethod, Severity: parameter.severity,
      "Responsible role": parameter.responsibleRole, "Failure action": parameter.failureAction,
      Unit: parameter.unit, Options: exportList(parameter.allowedValues, index, "Options"),
      Minimum: parameter.minimum, Maximum: parameter.maximum,
      "Default answer": parameter.type === "multi_select" ? exportList(parameter.defaultValue, index, "Default answer") : parameter.defaultValue,
      "Sampling method": sampling?.method, "Sample value": sampling?.value, "Sample unit": sampling?.unit,
      "Photo evidence": evidence?.photos === true ? evidence.minPhotosPerSample : 0,
      "Document evidence": evidence?.documents, "Video evidence": evidence?.video,
      "Evidence instructions": evidence?.instructions
    };
    return QUALITY_WORKBOOK_HEADERS.map(header => {
      const value = values[header];
      // Assign primitive values only. Strings beginning with =, +, - or @ remain text, never formulas.
      if (value === undefined || value === null) return null;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
      throw exportIssue(index, header, "This value cannot be represented as a plain Excel cell.");
    });
  });
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.default.Workbook();
  book.creator = "Lisno";
  const simpleHeaders = new Set<Header>(QUALITY_SIMPLE_WORKBOOK_HEADERS);
  const headers = [
    ...QUALITY_SIMPLE_WORKBOOK_HEADERS,
    ...QUALITY_WORKBOOK_HEADERS.filter((header, column) => !simpleHeaders.has(header) && rows.some(row => row[column] !== null))
  ];
  const sheet = book.addWorksheet(WORKSHEET);
  styleEssentialWorksheet(sheet);
  sheet.getRow(1).values = headers;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: parameters.length + 1, column: headers.length } };
  sheet.properties.outlineLevelCol = 1;
  sheet.properties.outlineProperties = { summaryBelow: true, summaryRight: false };
  for (let column = QUALITY_SIMPLE_WORKBOOK_HEADERS.length + 1; column <= headers.length; column++) {
    const advancedColumn = sheet.getColumn(column);
    advancedColumn.width = 25;
    advancedColumn.outlineLevel = 1;
    advancedColumn.hidden = true;
  }
  rows.forEach(values => {
    const row = sheet.addRow(headers.map(header => values[QUALITY_WORKBOOK_HEADERS.indexOf(header)]));
    row.alignment = { wrapText: true, vertical: "top" };
    row.height = 60;
    row.eachCell(cell => { if (typeof cell.value === "string") cell.numFmt = "@"; });
  });
  const output = await book.xlsx.writeBuffer();
  return new Uint8Array(output).slice().buffer;
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

export async function downloadQualityTemplate(): Promise<void> {
  downloadWorkbook(await createQualityTemplateBuffer(), "Lisno-quality-checklist-template.xlsx");
}

export async function downloadQualityChecklist(basketName: string, parameters: readonly KnowledgeJsonObject[]): Promise<void> {
  const safeBasketName = basketName.normalize("NFKC").replace(/[^\p{L}\p{N} -]/gu, "-").replace(/[ -]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80).replace(/-+$/gu, "") || "Main-Basket";
  downloadWorkbook(await createQualityExportBuffer(parameters), `Lisno-${safeBasketName}-quality-checklist.xlsx`);
}

export function qualityAiPrompt(basketName: string): string {
  return `Create an editable interior fit-out quality checklist for the Main Basket ${JSON.stringify(basketName)}. It will be shared by all Main Lines and temporary items in that basket. Tailor questions to this basket; do not generate a catalog of every basket.
Return an .xlsx workbook with one worksheet named "Quality Parameters" and exactly these columns in row 1:
${QUALITY_SIMPLE_WORKBOOK_HEADERS.join(" | ")}
Use at most 200 questions and a 5 MiB file. Write plain values only: no formulas, macros, links, images, embedded objects, IDs or additional columns. All quality checks are mandatory and active.
Every row needs a clear Question (up to 240 characters) and Answer type: ${QUALITY_PARAMETER_TYPES.join(", ")}. Options are needed only for dropdown, radio or multi_select; separate distinct options with |, such as Pass|Fail|Not applicable. Leave Options blank for other answer types.
Acceptance criteria describes what a pass looks like (up to 4000 characters). Refer to approved project details for professional review; do not invent legal or engineering thresholds. Do not prefill inspection answers or add severity, sampling, stage or other fields.
Photo evidence: enter a whole number from 0 to 100. Use 0 for no photos, 1 for a single photo, or 2–100 for multiple required photos per checked unit. Do not add a separate count column or embed photos in the workbook. Avoid duplicate questions and keep the checklist focused on practical, important checks for this basket.`;
}
