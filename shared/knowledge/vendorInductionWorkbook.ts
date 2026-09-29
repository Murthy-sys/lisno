import type { Cell, CellValue, Workbook, Worksheet } from "exceljs";
import type { VendorInductionAnswerType, VendorInductionQuestion } from "./vendorInduction";

export interface VendorInductionWorkbookIssue { readonly row: number | null; readonly column?: string; readonly message: string }
export interface VendorInductionWorkbookResult {
  readonly questions: readonly VendorInductionQuestion[];
  readonly issues: readonly VendorInductionWorkbookIssue[];
  readonly legacy: boolean;
}

export const VENDOR_INDUCTION_WORKBOOK_HEADERS = [
  "Key", "Section", "Question", "Answer Type", "Required", "Enabled",
  "Option 1", "Option 2", "Option 3", "Option 4", "Option 5", "Option 6", "Option 7", "Option 8",
  "Unit", "Min", "Max", "Show If Question Key", "Show If Option"
] as const;
export const VENDOR_INDUCTION_WORKBOOK_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const VENDOR_INDUCTION_WORKBOOK_MAX_BYTES = 5 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 32 * 1024 * 1024;
const MAX_QUESTIONS = 100;
const MAX_COLUMNS = 30;
const SHEET = "Vendor Induction";
const ANSWER_TYPES: readonly VendorInductionAnswerType[] = ["short_text", "paragraph", "number", "yes_no", "single_choice", "multi_choice"];
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
const slug = (value: string) => normalize(value).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 64);
const errorResult = (message: string): VendorInductionWorkbookResult => ({ questions: [], issues: [{ row: null, message }], legacy: false });

/** Bounds ZIP expansion and rejects encrypted, executable, or externally linked workbooks before ExcelJS reads them. */
function inspectArchive(buffer: ArrayBuffer): void {
  if (buffer.byteLength > VENDOR_INDUCTION_WORKBOOK_MAX_BYTES) throw new Error("The workbook must be 5 MiB or smaller.");
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
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 || view.getUint16(end + 8, true) !== entries || entries > 2000 || directorySize > VENDOR_INDUCTION_WORKBOOK_MAX_BYTES || offset + directorySize !== end) throw new Error("This workbook archive format is not supported. Save a fresh .xlsx copy.");
  const directoryEnd = offset + directorySize;
  let total = 0;
  const names = new Set<string>();
  for (let index = 0; index < entries; index++) {
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
    if (total > MAX_EXPANDED_BYTES) throw new Error("The expanded workbook is too large. Remove unused sheets and formatting.");
    offset += 46 + length + extra + comment;
  }
  if (offset !== directoryEnd || !names.has("xl/workbook.xml") || !names.has("[content_types].xml")) throw new Error("This file is not a valid Excel workbook.");
}

function scalar(cell: Cell, issues: VendorInductionWorkbookIssue[], row: number): string | number | boolean | null {
  const value: CellValue = cell.value;
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  const content = typeof value === "string" ? value : typeof value === "object" && "richText" in value ? value.richText.map(part => part.text).join("") : null;
  if (content !== null) {
    if (content.length > 4_000) issues.push({ row, column: cell.address, message: "Cell text must be at most 4,000 characters." });
    if (/#REF!|#VALUE!|#DIV\/0!|#NAME\?/iu.test(content)) issues.push({ row, column: cell.address, message: "Replace spreadsheet errors with plain values." });
    return content.length <= 4_000 ? content : null;
  }
  issues.push({ row, column: cell.address, message: typeof value === "object" && ("formula" in value || "sharedFormula" in value)
    ? "Formulas are not allowed, including cached results. Paste values only."
    : "Use plain text, numbers or yes/no; dates, errors and links are not supported." });
  return null;
}

function headerName(value: string): string {
  const normalized = normalize(value).replace(/[.\s_-]+/gu, "");
  if (normalized === "qno") return "Q.No";
  if (normalized === "questions") return "Questions";
  if (normalized === "logic") return "Logic";
  return VENDOR_INDUCTION_WORKBOOK_HEADERS.find(header => normalize(header).replace(/[.\s_-]+/gu, "") === normalized) ?? value.trim();
}

function headingMap(sheet: Worksheet, issues: VendorInductionWorkbookIssue[]): { row: number; columns: Map<string, number>; legacy: boolean } | null {
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 5); rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const columns = new Map<string, number>();
    for (let column = 1; column <= Math.min(sheet.columnCount, MAX_COLUMNS); column++) {
      const value = row.getCell(column).value;
      if (typeof value !== "string" || !value.trim()) continue;
      const header = headerName(value);
      if (columns.has(header)) issues.push({ row: rowNumber, column: row.getCell(column).address, message: `Heading ${header} appears more than once.` });
      else columns.set(header, column);
    }
    if (columns.has("Question") || columns.has("Questions")) {
      const legacy = columns.has("Questions") && !columns.has("Question");
      const supported = new Set<string>([...VENDOR_INDUCTION_WORKBOOK_HEADERS, "Q.No", "Questions", "Logic"]);
      for (const [header, column] of columns) if (!supported.has(header)) issues.push({ row: rowNumber, column: sheet.getRow(rowNumber).getCell(column).address, message: `Unknown column ${header}. Use the induction template headings.` });
      if (!legacy) for (const required of ["Key", "Section", "Answer Type"]) if (!columns.has(required)) issues.push({ row: rowNumber, message: `The ${required} heading is required.` });
      return { row: rowNumber, columns, legacy };
    }
  }
  issues.push({ row: null, message: "No Question or Questions heading was found in the first five rows." });
  return null;
}

function parseBoolean(value: string | number | boolean | null, fallback: boolean, row: number, column: string, issues: VendorInductionWorkbookIssue[]): boolean {
  if (value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && /^(yes|true|1|no|false|0)$/iu.test(value.trim())) return /^(yes|true|1)$/iu.test(value.trim());
  issues.push({ row, column, message: "Use Yes or No." });
  return fallback;
}

function parseNumber(value: string | number | boolean | null, row: number, column: string, issues: VendorInductionWorkbookIssue[]): number | null {
  if (value === null || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) { issues.push({ row, column, message: "Use a non-negative number up to 1,000,000." }); return null; }
  return number;
}

export function createVendorInductionWorkbookTools(loadExcelJS: () => Promise<{ default: { Workbook: typeof import("exceljs").Workbook } }>) {
  async function parseBuffer(buffer: ArrayBuffer): Promise<VendorInductionWorkbookResult> {
    try { inspectArchive(buffer); } catch (error) { return errorResult(error instanceof Error ? error.message : "The workbook is invalid."); }
    let book: Workbook;
    try { const ExcelJS = await loadExcelJS(); book = new ExcelJS.default.Workbook(); await book.xlsx.load(buffer); }
    catch { return errorResult("The workbook is malformed or unsupported. Save a fresh .xlsx copy and try again."); }
    const issues: VendorInductionWorkbookIssue[] = [];
    for (const candidate of book.worksheets) {
      if (candidate.rowCount > MAX_QUESTIONS + 6 || candidate.columnCount > MAX_COLUMNS) return errorResult("Use at most 100 question rows and 30 columns per worksheet.");
      candidate.eachRow(row => row.eachCell(cell => {
        const value = cell.value;
        if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value || "hyperlink" in value || "error" in value))
          issues.push({ row: row.number, column: cell.address, message: `Remove formulas, cell errors and hyperlinks from worksheet ${candidate.name}. Paste values only.` });
      }));
    }
    if (issues.length) return { questions: [], issues, legacy: false };
    const sheet = book.getWorksheet(SHEET) ?? (book.worksheets.length === 1 ? book.worksheets[0] : undefined);
    if (!sheet) return errorResult(`Use a worksheet named ${SHEET} when the workbook has multiple worksheets.`);
    const heading = headingMap(sheet, issues);
    if (!heading) return { questions: [], issues, legacy: false };
    const { columns, legacy } = heading;
    const questions: VendorInductionQuestion[] = [];
    const conditionalRows: Array<{ row: number; questionId: string; source: string; option: string }> = [];
    const seenKeys = new Set<string>();
    const seenPrompts = new Set<string>();
    const seenNumbers = new Set<string>();
    for (let rowNumber = heading.row + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      if (!row.hasValues) continue;
      const read = (column: string) => columns.has(column) ? scalar(row.getCell(columns.get(column)!), issues, rowNumber) : null;
      const text = (column: string) => { const value = read(column); return value === null ? "" : String(value).trim(); };
      const prompt = text(legacy ? "Questions" : "Question");
      if (!prompt) { if (Object.values(row.values ?? {}).some(value => value != null && value !== "")) issues.push({ row: rowNumber, column: "Question", message: "A populated row needs a question." }); continue; }
      if (questions.length >= MAX_QUESTIONS) { issues.push({ row: rowNumber, message: "Use at most 100 questions." }); break; }
      if (prompt.length > 500) issues.push({ row: rowNumber, column: "Question", message: "Question must be at most 500 characters." });
      const promptKey = normalize(prompt);
      if (seenPrompts.has(promptKey)) issues.push({ row: rowNumber, column: "Question", message: "This question is repeated. Review duplicate prompts before importing." });
      seenPrompts.add(promptKey);
      if (legacy) {
        const number = text("Q.No");
        if (number && seenNumbers.has(number)) issues.push({ row: rowNumber, column: "Q.No", message: "Question number is repeated; it is display order, not identity." });
        if (number) seenNumbers.add(number);
      }
      const key = legacy ? `legacy_row_${rowNumber}` : slug(text("Key"));
      if (!key) issues.push({ row: rowNumber, column: "Key", message: "Enter a unique question key." });
      else if (!/^[a-z][a-z0-9_]{0,63}$/u.test(key)) issues.push({ row: rowNumber, column: "Key", message: "Question key must start with a letter and contain only lowercase letters, numbers and underscores." });
      if (seenKeys.has(key)) issues.push({ row: rowNumber, column: "Key", message: "Question key is repeated." });
      seenKeys.add(key);
      const options = Array.from({ length: 8 }, (_, index) => text(`Option ${index + 1}`)).filter(Boolean);
      const declaredType = text("Answer Type").toLocaleLowerCase("en").replace(/[\s-]+/gu, "_");
      const type = ANSWER_TYPES.includes(declaredType as VendorInductionAnswerType) ? declaredType as VendorInductionAnswerType : options.length >= 2 ? "single_choice" : "short_text";
      if (!declaredType || !ANSWER_TYPES.includes(declaredType as VendorInductionAnswerType)) issues.push({ row: rowNumber, column: "Answer Type", message: legacy ? "Confirm the answer type in the induction editor before publishing." : "Choose a supported answer type." });
      if (["single_choice", "multi_choice"].includes(type) && options.length < 2) issues.push({ row: rowNumber, column: "Option 1", message: "Choice questions need at least two options." });
      if (!["single_choice", "multi_choice"].includes(type) && options.length) issues.push({ row: rowNumber, column: "Option 1", message: "Only choice questions can contain options." });
      if (new Set(options.map(normalize)).size !== options.length) issues.push({ row: rowNumber, column: "Option 1", message: "Choice labels must be unique." });
      if (options.some(option => option.length > 120)) issues.push({ row: rowNumber, column: "Option 1", message: "Choice labels must be at most 120 characters." });
      if (options.some(option => /^(enter|type|input)\b/iu.test(option)) && options.some(option => /^\d+(?:\.\d+)?$/u.test(option)))
        issues.push({ row: rowNumber, column: "Option 1", message: "This row mixes a numeric answer with input instructions. Use a Number question instead." });
      const unit = text("Unit");
      const min = parseNumber(read("Min"), rowNumber, "Min", issues);
      const max = parseNumber(read("Max"), rowNumber, "Max", issues);
      if (unit.length > 40) issues.push({ row: rowNumber, column: "Unit", message: "Unit must be at most 40 characters." });
      if (type !== "number" && (unit || min !== null || max !== null)) issues.push({ row: rowNumber, column: "Unit", message: "Unit, Min and Max apply only to Number questions." });
      if (min !== null && max !== null && min > max) issues.push({ row: rowNumber, column: "Min", message: "Minimum must not exceed maximum." });
      const logic = text("Logic");
      if (logic) issues.push({ row: rowNumber, column: "Logic", message: "Map this natural-language condition in the editor; workbook logic is never run automatically." });
      const id = key || `row_${rowNumber}`;
      const source = text("Show If Question Key");
      const option = text("Show If Option");
      if (source || option) conditionalRows.push({ row: rowNumber, questionId: id, source, option });
      questions.push({ id, key: id, section: text("Section") || "General", prompt,
        helpText: null, type, required: parseBoolean(read("Required"), true, rowNumber, "Required", issues),
        enabled: parseBoolean(read("Enabled"), true, rowNumber, "Enabled", issues),
        options: options.map((label, index) => ({ id: `${id}_option_${index + 1}`, label })),
        unit: type === "number" ? unit || null : null, min: type === "number" ? min : null, max: type === "number" ? max : null,
        showIf: null });
    }
    for (const condition of conditionalRows) {
      const index = questions.findIndex(item => item.id === condition.questionId);
      const question = questions[index];
      if (!question) continue;
      const source = questions.find(item => item.key === slug(condition.source));
      if (!condition.source || !condition.option || !source || questions.indexOf(source) >= index || !["yes_no", "single_choice", "multi_choice"].includes(source.type)) {
        issues.push({ row: condition.row, column: "Show If Question Key", message: "Choose an earlier yes/no or choice question and one of its options." });
        continue;
      }
      let selectedOptions: string[];
      try {
        const parsed: unknown = condition.option.startsWith("[") ? JSON.parse(condition.option) : [condition.option];
        if (!Array.isArray(parsed) || !parsed.length || parsed.length > 12 || parsed.some(value => typeof value !== "string" || !value.trim())) throw new Error("Invalid condition options");
        selectedOptions = parsed as string[];
      } catch {
        issues.push({ row: condition.row, column: "Show If Option", message: "Use one option label or a JSON list of option labels for multiple matches." });
        continue;
      }
      const optionIds = selectedOptions.map(value => source.type === "yes_no" && /^(yes|no)$/iu.test(value) ? value.toLowerCase()
        : source.options.find(item => normalize(item.label) === normalize(value) || item.id === value)?.id);
      if (optionIds.some(value => !value) || new Set(optionIds).size !== optionIds.length) {
        issues.push({ row: condition.row, column: "Show If Option", message: "Every condition option must belong to its source question and appear once." });
        continue;
      }
      questions[index] = { ...question, showIf: { questionId: source.id, optionIds: optionIds as string[] } };
    }
    return { questions, issues, legacy };
  }

  async function workbookBuffer(questions: readonly VendorInductionQuestion[]): Promise<ArrayBuffer> {
    const ExcelJS = await loadExcelJS();
    const book = new ExcelJS.default.Workbook();
    const sheet = book.addWorksheet(SHEET);
    sheet.addRow([...VENDOR_INDUCTION_WORKBOOK_HEADERS]);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { wrapText: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns = VENDOR_INDUCTION_WORKBOOK_HEADERS.map(header => ({ width: header === "Question" ? 65 : header === "Section" ? 26 : 19 }));
    for (const question of questions) {
      const source = questions.find(item => item.id === question.showIf?.questionId);
      const selectedOptions = question.showIf?.optionIds.map(id => source?.type === "yes_no" ? id : source?.options.find(option => option.id === id)?.label).filter((label): label is string => !!label) ?? [];
      const selected = selectedOptions.length > 1 ? JSON.stringify(selectedOptions) : selectedOptions[0] ?? null;
      sheet.addRow([
        question.key, question.section, question.prompt, question.type, question.required ? "Yes" : "No", question.enabled ? "Yes" : "No",
        ...Array.from({ length: 8 }, (_, index) => question.options[index]?.label ?? null),
        question.unit, question.min, question.max, source?.key ?? null, selected
      ]);
    }
    const output = await book.xlsx.writeBuffer();
    return new Uint8Array(output).slice().buffer;
  }

  return {
    parseBuffer,
    createTemplateBuffer: () => workbookBuffer([]),
    createExportBuffer: workbookBuffer
  };
}
