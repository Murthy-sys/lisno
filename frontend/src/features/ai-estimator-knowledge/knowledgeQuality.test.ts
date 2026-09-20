import { describe, expect, it } from "vitest";
import {
  createQualityParameter,
  isQualityControlOptionReference,
  mandatoryQualityParameters,
  normalizeQualityControlOptionName,
  qualityControlSelectOptions,
  qualityFrequencyFromSampling,
  qualityFrequencySelectionFromSampling,
  qualityImportIssues,
  qualityParameterNeedsCompletion,
  qualityPerformerSelection,
  qualitySamplingForFrequency,
  qualitySamplingSummary,
  validateQualityParameters,
  validateQualityParametersForSave
} from "./knowledgeQuality";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

const parameter = (change: KnowledgeJsonObject = {}): KnowledgeJsonObject => ({ id: "quality-1", type: "text", label: "Are the fixings secure?", ...change });
const paths = (row: KnowledgeJsonObject) => validateQualityParameters([row]).map(issue => issue.path);
const frequencyId = "qco_111111111111111111111111";
const performerId = "qco_222222222222222222222222";
const qualityOptions = {
  frequency: [{ id: frequencyId, kind: "frequency", name: "Per elevation", version: 1, createdById: "user-1", updatedById: "user-1", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" }],
  performer: [{ id: performerId, kind: "performer", name: "Quality lead", version: 1, createdById: "user-1", updatedById: "user-1", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" }]
} as const;

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

  it("keeps legacy revisions readable while requiring canonical controls for a new shared save", () => {
    const legacy = parameter({ responsibleRole: "Site engineer", sampling: { method: "percentage", value: 10, unit: "rooms" } });
    expect(validateQualityParameters([legacy])).toEqual([]);
    expect(validateQualityParametersForSave([legacy]).map(issue => issue.path)).toEqual([
      "parameters.0.severity", "parameters.0.responsibleRole", "parameters.0.sampling"
    ]);
    const complete = parameter({ severity: "critical", responsibleRole: "pm", sampling: { method: "fixed_count", value: 1, unit: "project" } });
    expect(validateQualityParametersForSave([complete])).toEqual([]);
  });

  it("round-trips every supported frequency without accepting lookalike legacy sampling", () => {
    for (const frequency of ["per_unit", "per_room", "per_zone", "per_batch", "once_per_project"] as const) {
      expect(qualityFrequencyFromSampling(qualitySamplingForFrequency(frequency))).toBe(frequency);
    }
    expect(qualityFrequencyFromSampling({ method: "all", unit: "rooms" })).toBeNull();
    expect(qualityFrequencyFromSampling({ method: "fixed_count", value: 2, unit: "project" })).toBeNull();
  });

  it("accepts only frozen custom references and resolves them in their own catalog kind", () => {
    expect(isQualityControlOptionReference(frequencyId)).toBe(true);
    expect(isQualityControlOptionReference("qco_ABCDEF111111111111111111")).toBe(false);
    expect(isQualityControlOptionReference("qco_1111")).toBe(false);
    expect(qualityFrequencySelectionFromSampling({ method: "all", unit: frequencyId })).toBe(frequencyId);
    expect(qualityPerformerSelection(performerId)).toBe(performerId);

    const custom = parameter({ severity: "major", responsibleRole: performerId, sampling: { method: "all", unit: frequencyId } });
    expect(validateQualityParametersForSave([custom], qualityOptions)).toEqual([]);
    expect(qualityParameterNeedsCompletion(custom, qualityOptions)).toBe(false);

    const wrongKind = parameter({ severity: "major", responsibleRole: frequencyId, sampling: { method: "all", unit: performerId } });
    expect(validateQualityParametersForSave([wrongKind], qualityOptions).map(issue => issue.path)).toEqual([
      "parameters.0.responsibleRole",
      "parameters.0.sampling"
    ]);
    expect(qualityParameterNeedsCompletion(wrongKind, qualityOptions)).toBe(true);
  });

  it("matches backend name normalization and keeps built-ins before alphabetized custom values", () => {
    expect(normalizeQualityControlOptionName("  Ｐｅｒ\t  Floor  ")).toBe("per floor");
    const options = qualityControlSelectOptions("performer", {
      ...qualityOptions,
      performer: [
        { ...qualityOptions.performer[0], name: "Zone lead" },
        { ...qualityOptions.performer[0], id: "qco_333333333333333333333333", name: "area lead" }
      ]
    });
    expect(options.slice(0, 4).map(option => option.label)).toEqual(["Site", "PM", "Procurement", "Vendor"]);
    expect(options.slice(4).map(option => option.label)).toEqual(["area lead", "Zone lead"]);
  });

  it("requires the full inclusive pass range only for Number answers", () => {
    const controls = { severity: "minor", responsibleRole: "vendor", sampling: { method: "all", unit: "batch" } };
    expect(validateQualityParametersForSave([parameter({ type: "number", ...controls })]).map(issue => issue.path)).toEqual([
      "parameters.0.minimum", "parameters.0.maximum", "parameters.0.unit"
    ]);
    expect(validateQualityParametersForSave([parameter({ type: "number", minimum: "1", maximum: "1.5", unit: "mm", ...controls })])).toEqual([]);
    expect(validateQualityParametersForSave([parameter({ type: "text", ...controls })])).toEqual([]);
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
