import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQualityExportBuffer, createQualityTemplateBuffer, downloadQualityChecklist, parseQualityWorkbookBuffer, qualityAiPrompt, QUALITY_SIMPLE_WORKBOOK_HEADERS, QUALITY_WORKBOOK_HEADERS, readQualityWorkbook } from "./knowledgeQualityWorkbook";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

async function workbook(rows: unknown[][], customize?: (book: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Quality Parameters");
  rows.forEach(row => sheet.addRow(row));
  customize?.(book);
  const bytes = await book.xlsx.writeBuffer();
  return new Uint8Array(bytes).slice().buffer;
}
const file = (buffer: ArrayBuffer, name = "quality.xlsx") => ({ name, size: buffer.byteLength, arrayBuffer: async () => buffer }) as File;
const headersOf = (sheet: ExcelJS.Worksheet) => (sheet.getRow(1).values as string[]).slice(1);
const cellFor = (sheet: ExcelJS.Worksheet, row: number, header: string) => sheet.getCell(row, headersOf(sheet).indexOf(header) + 1);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("quality workbook import", () => {
  it("round-trips the downloadable blank template and never imports the illustrative example", async () => {
    const buffer = await createQualityTemplateBuffer();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(["Quality Parameters", "Instructions", "Example Electrical"]);
    const sheet = book.getWorksheet("Quality Parameters")!;
    expect(headersOf(sheet)).toEqual(["Question", "Answer type", "Options", "Acceptance criteria", "Photo evidence"]);
    expect(sheet.columnCount).toBe(5);
    expect(QUALITY_WORKBOOK_HEADERS).not.toContain("Required");
    expect(QUALITY_WORKBOOK_HEADERS).not.toContain("Active");
    expect(QUALITY_WORKBOOK_HEADERS).not.toContain("Category");
    expect(book.getWorksheet("Example Electrical")?.getRow(1).values).toEqual([undefined, ...QUALITY_SIMPLE_WORKBOOK_HEADERS]);
    expect(book.getWorksheet("Example Electrical")?.columnCount).toBe(5);
    expect(book.getWorksheet("Instructions")?.rowCount).toBeLessThanOrEqual(8);
    for (const row of [2, 201]) {
      expect(sheet.getCell(row, 2).dataValidation).toMatchObject({ type: "list", formulae: ['"text,number,dropdown,radio,checkbox,multi_select,boolean"'] });
      expect(sheet.getCell(row, 5).dataValidation).toMatchObject({ type: "whole", operator: "between", formulae: [0, 100], showInputMessage: true, prompt: expect.stringContaining("single photo") });
    }
    const empty = await parseQualityWorkbookBuffer(buffer);
    expect(empty.parameters).toEqual([]);
    expect(empty.issues).toEqual([{ row: null, message: expect.stringContaining("no questions") }]);
    sheet.getRow(2).values = ["Are the fixtures fixed correctly?", "boolean"];
    const parsed = await parseQualityWorkbookBuffer(new Uint8Array(await book.xlsx.writeBuffer()).slice().buffer);
    expect(parsed.issues).toEqual([]);
    expect(parsed.parameters).toHaveLength(1);
    expect(parsed.parameters[0]).toMatchObject({ label: "Are the fixtures fixed correctly?", type: "boolean", required: true, active: true });
    expect(parsed.parameters[0]).not.toHaveProperty("defaultValue");
  });

  it.each(["Yes", "yes", true])("requires one photo when a simple worksheet says %s without a photo-count heading", async photos => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      [...QUALITY_SIMPLE_WORKBOOK_HEADERS],
      ["Is the fixing secure?", "dropdown", "Pass|Fail", "Matches approved details.", photos]
    ]));
    expect(result.issues).toEqual([]);
    expect(result.parameters[0]).toMatchObject({ allowedValues: ["Pass", "Fail"], acceptanceCriteria: "Matches approved details.", evidence: { photos: true, minPhotosPerSample: 1, documents: false, video: false } });
    expect(result.parameters[0]).not.toHaveProperty("defaultValue");
    expect(result.parameters[0]).not.toHaveProperty("sampling");
    expect(result.parameters[0]).not.toHaveProperty("severity");
  });

  it.each([0, 1, 2, 100, "0", "1", "2", "100"])("imports Photo evidence count %s directly", async count => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      [...QUALITY_SIMPLE_WORKBOOK_HEADERS], ["Is the fixing secure?", "boolean", null, null, count]
    ]));
    expect(result.issues).toEqual([]);
    const photos = Number(count);
    expect(result.parameters[0].evidence).toEqual({ photos: photos > 0, documents: false, video: false, ...(photos > 0 ? { minPhotosPerSample: photos } : {}) });
  });

  it.each([-1, 0.5, 101, "-1", "1.5", "1.0", "101", "100.1", "two", "1e2"])("rejects invalid Photo evidence count %s", async count => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      [...QUALITY_SIMPLE_WORKBOOK_HEADERS], ["Is the fixing secure?", "boolean", null, null, count]
    ]));
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, column: "Photo evidence", message: expect.stringContaining("whole number from 0 to 100") })]));
  });

  it("supports inline counts and legacy Yes/No rows in the same workbook", async () => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      [...QUALITY_SIMPLE_WORKBOOK_HEADERS, "Minimum photos per sample"],
      ["Inline count with matching legacy count", "boolean", null, null, 2, 2],
      ["Inline count with blank legacy count", "boolean", null, null, 1, null],
      ["No inline photos with matching legacy zero", "boolean", null, null, 0, 0],
      ["Legacy enabled photos", "boolean", null, null, "Yes", 3],
      ["Legacy disabled photos", "boolean", null, null, "No", null]
    ]));
    expect(result.issues).toEqual([]);
    expect(result.parameters.map(row => row.evidence)).toEqual([
      { photos: true, minPhotosPerSample: 2, documents: false, video: false },
      { photos: true, minPhotosPerSample: 1, documents: false, video: false },
      { photos: false, documents: false, video: false },
      { photos: true, minPhotosPerSample: 3, documents: false, video: false },
      { photos: false, documents: false, video: false }
    ]);
  });

  it.each([[2, 3], [0, 2], [1, 0], [100, 99]])("rejects inline photo count %s when a populated legacy count says %s", async (inline, legacy) => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      [...QUALITY_SIMPLE_WORKBOOK_HEADERS, "Minimum photos per sample"], ["Is the fixing secure?", "boolean", null, null, inline, legacy]
    ]));
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, column: "Minimum photos per sample", message: expect.stringContaining("must match") })]));
  });

  it("rejects an invalid nonblank legacy count even when an inline count is valid", async () => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      [...QUALITY_SIMPLE_WORKBOOK_HEADERS, "Minimum photos per sample"], ["Is the fixing secure?", "boolean", null, null, 2, "invalid"]
    ]));
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, column: "Minimum photos per sample" })]));
  });

  it.each([null, 0, "invalid"])("still rejects the explicit photo-count column when its value is %s", async count => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      [...QUALITY_SIMPLE_WORKBOOK_HEADERS, "Minimum photos per sample"],
      ["Is the fixing secure?", "boolean", null, null, "Yes", count]
    ]));
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, column: "Minimum photos per sample" })]));
  });

  it.each([false, "false", "no", true, "yes", null])("makes valid legacy flags %s mandatory and active", async flag => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      ["Question", "Answer type", "Required", "Active"],
      ["Is the fixing secure?", "boolean", flag, flag]
    ]));
    expect(result.issues).toEqual([]);
    expect(result.parameters[0]).toMatchObject({ required: true, active: true });
  });

  it.each(["Required", "Active"])("still validates legacy %s values", async heading => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      ["Question", "Answer type", heading],
      ["Is the fixing secure?", "boolean", "sometimes"]
    ]));
    expect(result.issues).toContainEqual({ row: 2, column: heading, message: "Use true or false (yes or no is also accepted)." });
  });

  it("accepts legacy Category text without adding it to imported checks", async () => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      ["Question", "Answer type", "Category"],
      ["Is the fixing secure?", "boolean", "Installation"]
    ]));
    expect(result.issues).toEqual([]);
    expect(result.parameters[0]).toMatchObject({ label: "Is the fixing secure?", required: true, active: true });
    expect(result.parameters[0]).not.toHaveProperty("category");
  });

  it.each([123, "A".repeat(241)])("still validates obsolete Category values", async category => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      ["Question", "Answer type", "Category"],
      ["Is the fixing secure?", "boolean", category]
    ]));
    expect(result.issues).toEqual([expect.objectContaining({ row: 2, column: "Category" })]);
    expect(result.parameters[0]).not.toHaveProperty("category");
  });

  it("imports evidence and percentage values into independent rules with new IDs", async () => {
    const buffer = await workbook([
      ["  QUESTION  ", " Answer   type ", "Options", "Sampling method", "Sample value", "Sample unit", "Photo evidence", "Minimum photos per sample", "Document evidence", "Video evidence", "Stage", "Severity", "Check method", "Required", "Acceptance criteria"],
      ["Are sampled fixtures securely installed?", "dropdown", "Pass | Fail | Not applicable", "percentage", 0.1, "installed fixtures", "yes", 2, false, false, "After fixing", "Major", "Visual", true, "Matches approved details"],
      [],
      ["Is the circuit record complete?", "boolean", null, "all", null, "circuits", false, null, "true", false]
    ], book => { book.getWorksheet("Quality Parameters")!.getCell("E2").numFmt = "0.00%"; });
    const first = await parseQualityWorkbookBuffer(buffer);
    const second = await parseQualityWorkbookBuffer(buffer);
    expect(first.issues).toEqual([]);
    expect(first.parameters).toHaveLength(2);
    expect(first.parameters[0]).toMatchObject({ type: "dropdown", allowedValues: ["Pass", "Fail", "Not applicable"], sampling: { method: "percentage", value: 10, unit: "installed fixtures" }, evidence: { photos: true, minPhotosPerSample: 2, documents: false, video: false }, severity: "major", checkMethod: "visual", required: true });
    expect(first.parameters[0].id).not.toBe(second.parameters[0].id);
    expect(first.parameters[1]).toMatchObject({ sampling: { method: "all", unit: "circuits" }, evidence: { photos: false, documents: true, video: false } });
  });

  it("continues to import the full legacy 22-column format with explicit advanced settings", async () => {
    const values: Record<string, unknown> = {
      Question: "Legacy measured clearance", "Answer type": "number", Stage: "After fixing", Instructions: "Measure the installed clearance.",
      Unit: "mm", Minimum: "0", Maximum: "99.000001", "Default answer": "0", "Sampling method": "fixed_count", "Sample value": 4, "Sample unit": "panels",
      "Photo evidence": true, "Minimum photos per sample": 3, "Document evidence": true, "Video evidence": false
    };
    const result = await parseQualityWorkbookBuffer(await workbook([[...QUALITY_WORKBOOK_HEADERS], QUALITY_WORKBOOK_HEADERS.map(header => values[header] ?? null)]));
    expect(result.issues).toEqual([]);
    expect(result.parameters[0]).toMatchObject({ type: "number", unit: "mm", minimum: "0", maximum: "99.000001", defaultValue: "0", stage: "After fixing", sampling: { method: "fixed_count", value: 4, unit: "panels" }, evidence: { photos: true, minPhotosPerSample: 3, documents: true, video: false } });
  });

  it.each([10, "10", "10%"])("treats a plain sample value %s as ten percent", async value => {
    const result = await parseQualityWorkbookBuffer(await workbook([["Question", "Answer type", "Sampling method", "Sample value", "Sample unit"], ["Question", "text", "percentage", value, "fixtures"]]));
    expect(result.issues).toEqual([]);
    expect(result.parameters[0].sampling).toMatchObject({ value: 10 });
  });

  it("preserves fractional percentage samples and does not rescale a literal percent suffix", async () => {
    const buffer = await workbook([["Question", "Answer type", "Sampling method", "Sample value", "Sample unit"], ["Check A", "text", "percentage", 0.105, "fixtures"], ["Check B", "text", "percentage", 10, "fixtures"]], book => {
      book.worksheets[0].getCell("D2").numFmt = "0.0%";
      book.worksheets[0].getCell("D3").numFmt = '0"%"';
    });
    const result = await parseQualityWorkbookBuffer(buffer);
    expect(result.issues).toEqual([]);
    expect(result.parameters[0].sampling).toMatchObject({ value: 10.5 });
    expect(result.parameters[1].sampling).toMatchObject({ value: 10 });
  });

  it("reports exact worksheet rows and columns for invalid shapes, defaults and duplicate questions", async () => {
    const result = await parseQualityWorkbookBuffer(await workbook([
      ["Question", "Answer type", "Options", "Minimum", "Maximum", "Default answer", "Required", "Sampling method", "Sample value", "Sample unit", "Photo evidence", "Minimum photos per sample"],
      ["Measured gap", "number", null, "2", "1", "3", "maybe", "percentage", 120, "panels", true, 0],
      [],
      [" measured   GAP ", "text"],
      ["Choose finish", "dropdown", "Pass|Pass", null, null, "Unknown"],
      ["Other question", "unknown"]
    ]));
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, column: "Required" }), expect.objectContaining({ row: 2, column: "Maximum" }), expect.objectContaining({ row: 2, column: "Sample value" }), expect.objectContaining({ row: 2, column: "Minimum photos per sample" }), expect.objectContaining({ row: 4, column: "Question", message: expect.stringContaining("already exists") }), expect.objectContaining({ row: 5, column: "Options" }), expect.objectContaining({ row: 5, column: "Default answer" }), expect.objectContaining({ row: 6, column: "Answer type" })
    ]));
  });

  it.each([
    { formula: "1+1", result: 2 },
    { error: "#DIV/0!" },
    { text: "External", hyperlink: "https://example.invalid" }
  ])("rejects formulas, cached results, cell errors and hyperlinks", async value => {
    const result = await parseQualityWorkbookBuffer(await workbook([["Question", "Answer type"], [value, "text"]]));
    expect(result.parameters).toEqual([]);
    expect(result.issues[0]).toMatchObject({ row: 2, message: expect.stringContaining("Paste values only") });
  });

  it("rejects formulas in non-imported sheets too", async () => {
    const result = await parseQualityWorkbookBuffer(await workbook([["Question", "Answer type"], ["Check", "boolean"]], book => { book.addWorksheet("Hidden data").addRow([{ formula: "1+1", result: 2 }]); }));
    expect(result.parameters).toEqual([]);
    expect(result.issues[0]).toMatchObject({ row: null, message: expect.stringContaining("Hidden data") });
  });

  it.each([
    { rows: [["Question", "Question", "Answer type"], ["Check", "Check", "text"]], message: "more than once" },
    { rows: [["Question", "Answer type", "Basket ID"], ["Check", "text", "unexpected"]], message: "Unknown column" },
    { rows: [["Question"], ["Check"]], message: "Answer type heading is required" },
    { rows: [["Question", "Answer type"], ["Check", "text", "unheaded"]], message: "needs a supported heading" }
  ])("rejects invalid headings: $message", async ({ rows, message }) => {
    const result = await parseQualityWorkbookBuffer(await workbook(rows));
    expect(result.parameters).toEqual([]);
    expect(result.issues[0].row).toBe(1);
    expect(result.issues[0].message).toContain(message);
  });

  it("accepts a single differently named sheet but rejects ambiguous multi-sheet files", async () => {
    const single = await workbook([["Question", "Answer type"], ["Check", "boolean"]], book => { book.worksheets[0].name = "AI generated"; });
    expect((await parseQualityWorkbookBuffer(single)).issues).toEqual([]);
    const multiple = await workbook([["Question", "Answer type"]], book => { book.worksheets[0].name = "AI generated"; book.addWorksheet("Other"); });
    expect((await parseQualityWorkbookBuffer(multiple)).issues[0].message).toContain('named "Quality Parameters"');
  });

  it("enforces row and column limits before reading cell values", async () => {
    const tooManyRows = await workbook([["Question", "Answer type"], ...Array.from({ length: 201 }, (_, i) => [`Question ${i}`, "text"])]);
    expect((await parseQualityWorkbookBuffer(tooManyRows)).issues[0].message).toContain("200 checklist rows");
    const tooManyColumns = await workbook([["Question", "Answer type"]], book => { book.worksheets[0].getCell("AE2").value = "extra"; });
    expect((await parseQualityWorkbookBuffer(tooManyColumns)).issues[0].message).toContain("30 columns");
  });

  it("rejects malformed archives, wrong extensions, oversized files and pre-cancelled reads", async () => {
    expect((await parseQualityWorkbookBuffer(new ArrayBuffer(10))).issues[0].message).toContain("valid .xlsx");
    expect((await readQualityWorkbook(file(new ArrayBuffer(0), "quality.xlsm"))).issues[0].message).toContain(".xlsx");
    expect((await readQualityWorkbook({ ...file(new ArrayBuffer(0)), size: 6 * 1024 * 1024 } as File)).issues[0].message).toContain("5 MiB");
    const controller = new AbortController(); controller.abort();
    expect((await readQualityWorkbook(file(new ArrayBuffer(0)), controller.signal)).issues[0].message).toBe("Import cancelled.");
  });

  it("rejects dangerous ZIP entries and oversized expansion before decompression", async () => {
    const valid = await workbook([["Question", "Answer type"], ["Check", "text"]]);
    const oversize = valid.slice(0);
    const view = new DataView(oversize);
    for (let offset = 0; offset < view.byteLength - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) { view.setUint32(offset + 24, 40 * 1024 * 1024, true); break; }
    }
    expect((await parseQualityWorkbookBuffer(oversize)).issues[0].message).toContain("expanded workbook");
    // Replacing a same-length archive member tests rejection before ExcelJS reads its contents.
    const bytes = new Uint8Array(valid.slice(0));
    const decoded = new TextDecoder("latin1").decode(bytes);
    const position = decoded.lastIndexOf("docProps/core.xml");
    expect(position).toBeGreaterThan(-1);
    bytes.set(new TextEncoder().encode("xl/vbaProject.bi"), position);
    expect((await parseQualityWorkbookBuffer(bytes.buffer)).issues[0].message).toContain("macros");
  });

  it("terminates a worker when cancelled or timed out", async () => {
    vi.useFakeTimers();
    const workers: { terminate: ReturnType<typeof vi.fn>; onmessage?: (event: MessageEvent) => void }[] = [];
    class WorkerMock {
      terminate = vi.fn(); postMessage = vi.fn(); onmessage?: (event: MessageEvent) => void;
      constructor() { workers.push(this); }
    }
    vi.stubGlobal("Worker", WorkerMock);
    const controller = new AbortController();
    const cancelled = readQualityWorkbook(file(new ArrayBuffer(0)), controller.signal);
    await Promise.resolve();
    controller.abort();
    expect((await cancelled).issues[0].message).toBe("Import cancelled.");
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const timedOut = readQualityWorkbook(file(new ArrayBuffer(0)));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await timedOut).issues[0].message).toContain("too long");
    expect(workers[1].terminate).toHaveBeenCalledOnce();
  });

  // it("includes the import contract and unanswered inspections in the AI prompt", () => {
  //   const prompt = qualityAiPrompt("Electrical");
  //   expect(prompt).toContain('Main Basket "Electrical"');
  //   expect(prompt).toContain(QUALITY_WORKBOOK_HEADERS.join(" | "));
  //   expect(prompt).toContain("Leave Default answer blank");
  //   expect(prompt).toContain("do not invent legal or engineering thresholds");
  //   expect(prompt).toContain("one clear site photo per sampled fixture");
  //   expect(prompt).toContain("All quality checks are mandatory and active");
  //   expect(prompt).toContain("do not add Required or Active columns");
  //   expect(prompt).not.toContain("Blank Required means false");
  //   expect(prompt).not.toContain("Category");
  // });
});

describe("saved quality checklist export", () => {
  const parameter = (type: string, fields: KnowledgeJsonObject = {}): KnowledgeJsonObject => ({ id: `saved-${type}`, label: `${type} check`, type, required: true, active: true, ...fields });
  // A visible zero makes an absent photo requirement explicit; both represent no required evidence.
  const explicitNoEvidence = (row: KnowledgeJsonObject): KnowledgeJsonObject => row.evidence === undefined || row.evidence === null ? { ...row, evidence: { photos: false, documents: false, video: false } } : row;

  it("omits unused advanced columns while retaining configured zero and false defaults", async () => {
    const simpleBook = new ExcelJS.Workbook();
    await simpleBook.xlsx.load(await createQualityExportBuffer([parameter("text")]));
    expect(headersOf(simpleBook.worksheets[0])).toEqual(QUALITY_SIMPLE_WORKBOOK_HEADERS);
    expect(simpleBook.worksheets[0].columnCount).toBe(5);
    expect(simpleBook.worksheets[0].columns.every(column => !column.hidden)).toBe(true);
    const configured = [parameter("number", { minimum: "0", defaultValue: "0" }), parameter("boolean", { defaultValue: false })];
    const buffer = await createQualityExportBuffer(configured);
    const configuredBook = new ExcelJS.Workbook();
    await configuredBook.xlsx.load(buffer);
    const sheet = configuredBook.worksheets[0];
    expect(headersOf(sheet)).toEqual([...QUALITY_SIMPLE_WORKBOOK_HEADERS, "Minimum", "Default answer"]);
    expect(sheet.columns.slice(5).every(column => column.hidden && column.outlineLevel === 1)).toBe(true);
    expect(cellFor(sheet, 2, "Minimum").value).toBe("0");
    expect(cellFor(sheet, 2, "Default answer").value).toBe("0");
    expect(cellFor(sheet, 3, "Default answer").value).toBe(false);
    const result = await parseQualityWorkbookBuffer(buffer);
    expect(result.issues).toEqual([]);
    expect(result.parameters.map(({ id, ...row }) => row)).toEqual(configured.map(({ id, ...row }) => explicitNoEvidence(row)));
  });

  it.each([0, 1, 2, 100])("exports photo count %s in the visible column without a redundant hidden count", async count => {
    const saved = parameter("boolean", { evidence: { photos: count > 0, documents: false, video: false, ...(count > 0 ? { minPhotosPerSample: count } : {}) } });
    const buffer = await createQualityExportBuffer([saved]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    expect(cellFor(book.worksheets[0], 2, "Photo evidence").value).toBe(count);
    expect(cellFor(book.worksheets[0], 2, "Photo evidence").type).toBe(ExcelJS.ValueType.Number);
    expect(headersOf(book.worksheets[0])).not.toContain("Minimum photos per sample");
    const result = await parseQualityWorkbookBuffer(buffer);
    expect(result.issues).toEqual([]);
    expect(result.parameters[0].evidence).toEqual(saved.evidence);
  });

  it("round-trips saved row order, every answer type and inspection metadata without mutating the snapshot", async () => {
    const saved = [
      parameter("text", { defaultValue: "As approved", stage: "After fixing", instructions: "Inspect the fixing\nand record its location.", acceptanceCriteria: "Matches the approved fixing detail.", checkMethod: "visual", severity: "major", responsibleRole: "Site engineer", failureAction: "Rectify and reinspect.", category: "Legacy installation", sampling: { method: "percentage", value: 10.123456, unit: "installed fixtures" }, evidence: { photos: true, minPhotosPerSample: 2, documents: true, video: false, instructions: "Capture each sampled fixing clearly." } }),
      parameter("number", { minimum: "0", maximum: "9007199254740993.123456", defaultValue: "0", unit: "mm", sampling: { method: "fixed_count", value: 3, unit: "panels" }, evidence: { photos: false, documents: false, video: false } }),
      parameter("dropdown", { allowedValues: ["Pass", "Fail", "Not applicable"], defaultValue: "Fail" }),
      parameter("radio", { allowedValues: ["Approved", "Rework"], defaultValue: "Approved" }),
      parameter("checkbox", { defaultValue: false }),
      parameter("multi_select", { allowedValues: ["Photo", "Measurement", "Document"], defaultValue: ["Document", "Photo"] }),
      parameter("boolean", { defaultValue: false, sampling: { method: "all", unit: "circuits" }, evidence: { photos: false, documents: false, video: true } }),
      parameter("number", { id: "precise-number", label: "Precise measurement", defaultValue: "9007199254740993.123456", maximum: "9007199254740993.123456" })
    ];
    const before = JSON.stringify(saved);
    const buffer = await createQualityExportBuffer(saved);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(["Quality Parameters"]);
    const sheet = book.worksheets[0];
    expect(headersOf(sheet).slice(0, 5)).toEqual(QUALITY_SIMPLE_WORKBOOK_HEADERS);
    expect(headersOf(sheet).slice(5)).toEqual(QUALITY_WORKBOOK_HEADERS.filter(header => header !== "Minimum photos per sample" && !QUALITY_SIMPLE_WORKBOOK_HEADERS.some(simple => simple === header)));
    expect(sheet.columns.filter(column => !column.hidden).map(column => sheet.getCell(1, column.number!).value)).toEqual(QUALITY_SIMPLE_WORKBOOK_HEADERS);
    expect(sheet.columns.slice(5).every(column => column.hidden && column.outlineLevel === 1 && column.collapsed)).toBe(true);
    expect(sheet.rowCount).toBe(saved.length + 1);
    expect(cellFor(sheet, 3, "Maximum").value).toBe("9007199254740993.123456");
    expect(cellFor(sheet, 3, "Maximum").type).toBe(ExcelJS.ValueType.String);
    expect(cellFor(sheet, 2, "Photo evidence").value).toBe(2);
    expect(cellFor(sheet, 3, "Photo evidence").value).toBe(0);
    const result = await parseQualityWorkbookBuffer(buffer);
    expect(result.issues).toEqual([]);
    expect(result.parameters.map(({ id, ...row }) => row)).toEqual(saved.map(({ id, category, ...row }) => explicitNoEvidence(row)));
    expect(result.parameters.every(row => !saved.some(source => source.id === row.id))).toBe(true);
    expect(JSON.stringify(saved)).toBe(before);
  });

  it.each(['=HYPERLINK("https://example.invalid","Open")', "+1+1", "-2+3", "@SUM(A1:A2)", "https://example.invalid"])("keeps formula-like or URL text %s as plain text", async text => {
    const buffer = await createQualityExportBuffer([parameter("text", { label: text, defaultValue: text, instructions: text })]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    for (const header of ["Question", "Instructions", "Default answer"]) {
      expect(cellFor(book.worksheets[0], 2, header).value).toBe(text);
      expect(cellFor(book.worksheets[0], 2, header).type).toBe(ExcelJS.ValueType.String);
    }
    const result = await parseQualityWorkbookBuffer(buffer);
    expect(result.issues).toEqual([]);
    expect(result.parameters[0]).toMatchObject({ label: text, defaultValue: text, instructions: text });
  });

  it("rejects empty or malformed saved checklists instead of downloading an incomplete workbook", async () => {
    await expect(createQualityExportBuffer([])).rejects.toThrow("no saved quality parameters");
    await expect(createQualityExportBuffer([parameter("number", { minimum: "2", maximum: "1" })])).rejects.toThrow("check 1, Maximum");
  });

  it.each<{ fields: KnowledgeJsonObject; message: string }>([
    { fields: { allowedValues: ["Pass|Fail", "Review"] }, message: "| character" },
    { fields: { allowedValues: [" Pass", "Fail"] }, message: "leading/trailing spaces" },
    { fields: { allowedValues: Array.from({ length: 20 }, (_, i) => `${i}${"a".repeat(238)}`) }, message: "4000-character cell limit" }
  ])("reports options that the established Excel format cannot preserve: $message", async ({ fields, message }) => {
    await expect(createQualityExportBuffer([parameter("multi_select", fields)])).rejects.toThrow(message);
  });

  it("exports a cleared multi-select default as an unanswered blank while still requiring options", async () => {
    const saved = parameter("multi_select", { allowedValues: ["Pass", "Fail"], defaultValue: [] });
    const buffer = await createQualityExportBuffer([saved]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    expect(headersOf(book.worksheets[0])).not.toContain("Default answer");
    const result = await parseQualityWorkbookBuffer(buffer);
    expect(result.issues).toEqual([]);
    expect(result.parameters[0]).toMatchObject({ type: "multi_select", allowedValues: ["Pass", "Fail"] });
    // Empty selections, absent defaults and blank Excel cells all represent an unanswered inspection.
    expect(result.parameters[0]).not.toHaveProperty("defaultValue");
    expect(saved.defaultValue).toEqual([]);
    await expect(createQualityExportBuffer([parameter("multi_select", { allowedValues: [], defaultValue: [] })])).rejects.toThrow("Add at least one allowed option");
  });

  it("reports sampling precision that the established import format cannot preserve", async () => {
    await expect(createQualityExportBuffer([parameter("text", { sampling: { method: "percentage", value: 0.0000001, unit: "fixtures" } })])).rejects.toThrow("Sample value. The Excel format supports up to six decimal places");
  });

  it.each([
    { name: "../Electrical / Lighting: <Main>\\?", filename: "Lisno-Electrical-Lighting-Main-quality-checklist.xlsx" },
    { name: "... / \\ : * ?", filename: "Lisno-Main-Basket-quality-checklist.xlsx" }
  ])("downloads a safe basket filename and cleans up its object URL: $filename", async ({ name, filename }) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const createObjectURL = vi.fn(() => "blob:quality-export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicked = this; });
    await downloadQualityChecklist(name, [parameter("boolean", { defaultValue: false })]);
    expect(clicked?.download).toBe(filename);
    expect(clicked?.href).toBe("blob:quality-export");
    expect(clicked?.isConnected).toBe(false);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:quality-export");
  });

  it("cleans up the anchor and object URL if the browser cannot start the download", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = () => "blob:failed-export"; static revokeObjectURL = revokeObjectURL; });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { throw new Error("Download unavailable"); });
    await expect(downloadQualityChecklist("Electrical", [parameter("boolean")])).rejects.toThrow("Download unavailable");
    expect(document.querySelector('a[href="blob:failed-export"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:failed-export");
  });
});
