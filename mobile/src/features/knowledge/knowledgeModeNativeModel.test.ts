import { modeCalculationsIssues, modeCalculationsForPayload } from "../../../../shared/knowledge/knowledgeModeCalculation";
import { nativeCalculationChange, nativeCalculationDraft, nativePercentage, patchKnowledgeRow } from "./knowledgeModeNativeModel";

describe("native Mode draft preservation", () => {
  it("retains incomplete decimals and invalid values until they are corrected", () => {
    const initial = { retainedRoot: { note: "keep" }, modeCalculations: { future_scope: { keep: true }, pmc: null, sub_vendor: null, in_house_labor: null, in_house_material: null } };
    const draft = { baseRate: "12.", lowQuantityLimit: "15", impactRate: "10", minimumRate: "25", startingRate: "35" };
    const changed = nativeCalculationChange(initial, "pmc", draft, 2);
    expect(modeCalculationsForPayload(changed).pmc).toMatchObject({ baseRatePaise: "12.", lowQuantityLimit: "15", impactBps: 1000 });
    expect(nativeCalculationDraft(modeCalculationsForPayload(changed).pmc).baseRate).toBe("12.");
    expect(modeCalculationsIssues(changed)).toEqual(expect.arrayContaining([expect.objectContaining({ path: "modeCalculations.pmc.baseRatePaise" })]));
    expect(changed.retainedRoot).toEqual(initial.retainedRoot);
    expect(changed.modeCalculations).toMatchObject({ future_scope: { keep: true }, sub_vendor: null });
    const corrected = nativeCalculationChange(changed, "pmc", { ...draft, baseRate: "12.34" }, 2);
    expect(modeCalculationsForPayload(corrected).pmc).toMatchObject({ baseRatePaise: 1234 });
    expect(nativePercentage("10.")).toBe("10.");
    expect(nativePercentage("10.25")).toBe(1025);
  });

  it("splits legacy In-house settings only after an explicit edit and preserves independent costs", () => {
    const legacy = { baseRatePaise: 22200, lowQuantityLimit: "15", impactBps: 1000, minimumMarkupBps: 2000, startingMarkupBps: 3000 };
    const payload = { modeCalculations: { pmc: null, sub_vendor: null, in_house: legacy } };
    const changed = nativeCalculationChange(payload, "in_house_labor", { ...nativeCalculationDraft(legacy), baseRate: "333.33" }, 2);
    expect(changed.modeCalculations).toMatchObject({ in_house: legacy, in_house_labor: { baseRatePaise: 33333 }, in_house_material: legacy });
  });

  it("patches a stable row without removing hidden compatibility fields or malformed siblings", () => {
    const payload = { specifications: [{ id: "spec-1", name: "Old", type: "dropdown", options: ["One"], value: "One", future: "kept" }, "legacy"], unknown: true };
    expect(patchKnowledgeRow(payload, "specifications", "spec-1", { name: "New" })).toEqual({ ...payload, specifications: [{ ...payload.specifications[0] as object, name: "New" }, "legacy"] });
  });
});
