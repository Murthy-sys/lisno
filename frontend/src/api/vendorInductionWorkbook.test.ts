import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { vendorInductionStarterQuestions } from "../../../shared/knowledge/vendorInduction";
import { createVendorInductionWorkbookTools } from "../../../shared/knowledge/vendorInductionWorkbook";

const tools = createVendorInductionWorkbookTools(() => import("exceljs"));

async function workbookBuffer(rows: readonly (readonly unknown[])[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Vendor Induction");
  for (const row of rows) sheet.addRow([...row]);
  return new Uint8Array(await workbook.xlsx.writeBuffer()).slice().buffer;
}

describe("vendor induction workbook import", () => {
  it("round trips typed questions, enabled state, and conditional answers", async () => {
    const questions = vendorInductionStarterQuestions("execution");
    const exported = await tools.createExportBuffer(questions);
    const result = await tools.parseBuffer(exported);

    expect(result.issues).toEqual([]);
    expect(result.legacy).toBe(false);
    expect(result.questions).toEqual(questions);
  });

  it("preserves every matching option in a multi-option display condition", async () => {
    const parent = {
      id: "material", key: "material", section: "Supply", prompt: "Which materials can you supply?",
      helpText: null, type: "multi_choice" as const, required: true, enabled: true,
      options: [{ id: "material_option_1", label: "Plywood" }, { id: "material_option_2", label: "Laminate" }],
      unit: null, min: null, max: null, showIf: null
    };
    const child = {
      id: "lead_time", key: "lead_time", section: "Supply", prompt: "What is the lead time?",
      helpText: null, type: "number" as const, required: true, enabled: true, options: [],
      unit: "days", min: 0, max: 90,
      showIf: { questionId: "material", optionIds: ["material_option_1", "material_option_2"] }
    };
    const result = await tools.parseBuffer(await tools.createExportBuffer([parent, child]));

    expect(result.issues).toEqual([]);
    expect(result.questions).toEqual([parent, child]);
  });

  it("flags ambiguous legacy rows, duplicates, and spreadsheet errors before publication", async () => {
    const result = await tools.parseBuffer(await workbookBuffer([
      ["Q.No", "Questions", "Option 1", "Option 2", "Logic"],
      [1, "What is the tentative carpet area?", "8000", "Enter Area (Sq.ft)"],
      [1, "What is the tentative carpet area?", "Yes", "No", "If no, show next question"],
      ["#REF!", "How many trained workers can you mobilize?"]
    ]));

    expect(result.legacy).toBe(true);
    expect(result.questions).toHaveLength(3);
    expect(result.issues.map(issue => issue.message).join(" ")).toMatch(/duplicate|repeated|number is repeated/i);
    expect(result.issues.map(issue => issue.message).join(" ")).toMatch(/mixes a numeric answer|spreadsheet errors/i);
    expect(result.issues.map(issue => issue.message).join(" ")).toMatch(/natural-language condition|Map this/i);
  });

  it("rejects formulas and hyperlinks, even when a cached value exists", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Vendor Induction");
    sheet.addRow(["Key", "Section", "Question", "Answer Type"]);
    sheet.addRow(["capacity", "Capability", "How many workers?", "number"]);
    sheet.getCell("C2").value = { formula: 'HYPERLINK("https://example.test", "Click")', result: "Click" };
    const result = await tools.parseBuffer(new Uint8Array(await workbook.xlsx.writeBuffer()).slice().buffer);

    expect(result.questions).toEqual([]);
    expect(result.issues.some(issue => /formula/i.test(issue.message))).toBe(true);
  });

  it("provides a valid empty template for manual question entry", async () => {
    const result = await tools.parseBuffer(await tools.createTemplateBuffer());
    expect(result).toEqual({ questions: [], issues: [], legacy: false });
  });
});
