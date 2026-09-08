import { describe, expect, it } from "vitest";
import { createQualityParameter, mandatoryQualityParameters, qualityImportIssues, qualitySamplingSummary, validateQualityParameters } from "./knowledgeQuality";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

const parameter = (change: KnowledgeJsonObject = {}): KnowledgeJsonObject => ({ id: "quality-1", type: "text", label: "Are the fixings secure?", ...change });
const paths = (row: KnowledgeJsonObject) => validateQualityParameters([row]).map(issue => issue.path);

describe("quality checklist validation", () => {
  it("creates independent row identities without prefilled inspection answers", () => {
    const one = createQualityParameter();
    expect(one).toMatchObject({ type: "text", label: "", required: true, active: true });
    expect(one.id).not.toBe(createQualityParameter().id);
    expect(one).not.toHaveProperty("defaultValue");
  });

  it("projects old flags as mandatory and active without changing the saved rows", () => {
    const existing = [parameter({ required: false, active: false }), parameter({ id: "quality-2" })];
    const current = mandatoryQualityParameters(existing);
    expect(current).toEqual(existing.map(row => ({ ...row, required: true, active: true })));
    expect(existing[0]).toMatchObject({ required: false, active: false });
    expect(existing[1]).not.toHaveProperty("required");
  });

  it("preserves legacy optional fields and rejects missing or unexpected fields", () => {
    expect(validateQualityParameters([parameter()])).toEqual([]);
    expect(validateQualityParameters(undefined)).toEqual([]);
    expect(paths(parameter({ label: " ", required: "true", injected: true }))).toEqual(expect.arrayContaining(["parameters.0.label", "parameters.0.required", "parameters.0.injected"]));
    expect(validateQualityParameters([null, "x"]).map(issue => issue.path)).toEqual(["parameters.0", "parameters.1"]);
  });

  it("validates all response shapes and range boundaries without floating point rounding", () => {
    const valid = [
      parameter(),
      parameter({ type: "number", minimum: "0.000001", maximum: "9007199254740993", defaultValue: "9007199254740993", unit: "mm" }),
      parameter({ type: "dropdown", allowedValues: ["Pass", "Fail"], defaultValue: "Pass" }),
      parameter({ type: "radio", allowedValues: ["Pass", "Fail"], defaultValue: "Fail" }),
      parameter({ type: "multi_select", allowedValues: ["Pass", "Fail"], defaultValue: ["Pass"] }),
      parameter({ type: "boolean", defaultValue: false }),
      parameter({ type: "checkbox", defaultValue: true })
    ];
    for (const row of valid) expect(validateQualityParameters([row])).toEqual([]);
    expect(paths(parameter({ type: "number", minimum: "2", maximum: "1", defaultValue: "3" }))).toEqual(expect.arrayContaining(["parameters.0.maximum", "parameters.0.defaultValue"]));
    expect(paths(parameter({ type: "number", minimum: "01", maximum: "1.0000001", defaultValue: 1 }))).toEqual(expect.arrayContaining(["parameters.0.minimum", "parameters.0.maximum", "parameters.0.defaultValue"]));
    expect(paths(parameter({ type: "dropdown", allowedValues: ["Pass", "Pass"], defaultValue: "Unknown" }))).toEqual(expect.arrayContaining(["parameters.0.allowedValues.1", "parameters.0.defaultValue"]));
    expect(paths(parameter({ type: "text", allowedValues: ["Pass"], unit: "mm" }))).toEqual(expect.arrayContaining(["parameters.0.allowedValues", "parameters.0.minimum"]));
  });

  it("validates sampling and evidence independently of response type", () => {
    const row = parameter({ sampling: { method: "percentage", value: 10, unit: "installed fixtures" }, evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 1, instructions: "Show each fixing and its location." }, stage: "Post installation", severity: "major", checkMethod: "visual" });
    expect(validateQualityParameters([row])).toEqual([]);
    expect(qualitySamplingSummary(row)).toBe("Inspect 10% of installed fixtures, rounded up to the next whole unit.");
    expect(qualitySamplingSummary(parameter({ sampling: { method: "all", unit: "circuits" } }))).toBe("Inspect all circuits.");
    expect(qualitySamplingSummary(parameter({ sampling: { method: "fixed_count", unit: "fixtures", value: 3 } }))).toBe("Inspect 3 fixtures.");
    expect(paths(parameter({ sampling: { method: "percentage", value: 0, unit: "fixtures" }, evidence: { photos: true, documents: false, video: false } }))).toEqual(expect.arrayContaining(["parameters.0.sampling.value", "parameters.0.evidence.minPhotosPerSample"]));
    expect(paths(parameter({ sampling: { method: "all", value: 10, unit: "fixtures" }, evidence: { photos: false, documents: false, video: false, minPhotosPerSample: 1 } }))).toEqual(expect.arrayContaining(["parameters.0.sampling.value", "parameters.0.evidence.minPhotosPerSample"]));
  });

  it.each([0, 101, Infinity, -1])("rejects invalid percentage %s", value => {
    expect(paths(parameter({ sampling: { method: "percentage", value, unit: "fixtures" } }))).toContain("parameters.0.sampling.value");
  });

  it.each([0, 1.5, 1_000_001])("rejects invalid fixed count %s", value => {
    expect(paths(parameter({ sampling: { method: "fixed_count", value, unit: "fixtures" } }))).toContain("parameters.0.sampling.value");
  });

  it("enforces text lengths, strict nested fields and photo limits", () => {
    expect(paths(parameter({ label: "x".repeat(241), instructions: "x".repeat(4001), sampling: { method: "all", unit: "units", unsafe: true }, evidence: { photos: true, documents: "true", video: false, minPhotosPerSample: 101, extra: true } }))).toEqual(expect.arrayContaining(["parameters.0.label", "parameters.0.instructions", "parameters.0.sampling.unsafe", "parameters.0.evidence.documents", "parameters.0.evidence.minPhotosPerSample", "parameters.0.evidence.extra"]));
  });

  it("detects normalized import duplicates, preserves stage distinctions and enforces combined limits", () => {
    const existing = [parameter({ stage: "Before installation" })];
    const duplicate = parameter({ id: "quality-2", label: " ARE  THE FIXINGS SECURE? ", stage: " before   installation " });
    expect(qualityImportIssues(existing, [duplicate])).toEqual(expect.arrayContaining([expect.objectContaining({ path: "parameters.1.label" })]));
    expect(qualityImportIssues(existing, [parameter({ id: "quality-2", stage: "After installation" })])).toEqual([]);
    const rows = Array.from({ length: 200 }, (_, i) => parameter({ id: String(i), label: `Question ${i}` }));
    expect(qualityImportIssues(rows, [parameter({ id: "additional", label: "Added question" })])).toEqual(expect.arrayContaining([expect.objectContaining({ path: "parameters", message: expect.stringContaining("200") })]));
    expect(validateQualityParameters(rows.map(row => ({ ...row, instructions: "x".repeat(4000) })))).toEqual(expect.arrayContaining([expect.objectContaining({ path: "parameters", message: expect.stringContaining("256 KiB") })]));
  });

  it("allows a valid painting check to be imported beside incomplete draft questions while keeping save validation strict", () => {
    const existing = [parameter({ id: "draft-1", label: "", type: "" }), parameter({ id: "draft-2", label: "", type: "" })];
    const incoming = parameter({ id: "painting", label: "is Painting done", type: "radio", allowedValues: ["Pass", "Fail", "Not applicable"], acceptanceCriteria: "photos to be uploaded after painting", evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 1 } });
    expect(qualityImportIssues(existing, [incoming])).toEqual([]);
    expect(validateQualityParameters([...existing, incoming]).map(issue => issue.path)).toEqual([
      "parameters.0.label", "parameters.0.type", "parameters.1.label", "parameters.1.type"
    ]);
    expect(existing.map(row => row.label)).toEqual(["", ""]);
  });

  it("still rejects invalid imported questions and ID or question duplicates beside incomplete draft questions", () => {
    const existing = [parameter({ id: "draft-1", label: "", type: "" }), parameter({ id: "same-id", label: "is Painting done" })];
    expect(qualityImportIssues(existing, [parameter({ id: "new", type: "radio", allowedValues: [] })])).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "parameters.2.allowedValues" })
    ]));
    expect(qualityImportIssues(existing, [parameter({ id: "same-id", label: "Are switches labelled?" })])).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "parameters.2.id" })
    ]));
    expect(qualityImportIssues(existing, [parameter({ id: "different-id", label: " IS  PAINTING DONE " })])).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "parameters.2.label", message: expect.stringContaining("already exists") })
    ]));
  });

  it("counts incomplete existing drafts towards import row and payload limits", () => {
    const existing = Array.from({ length: 200 }, (_, index) => parameter({ id: `draft-${index}`, label: "", type: "" }));
    expect(qualityImportIssues(existing, [parameter()])).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "parameters", message: expect.stringContaining("200") })
    ]));
    expect(qualityImportIssues(existing.slice(0, 70).map(row => ({ ...row, instructions: "x".repeat(4000) })), [parameter()])).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "parameters", message: expect.stringContaining("256 KiB") })
    ]));
  });
});
