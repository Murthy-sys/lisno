import { describe, expect, it } from "vitest";
import type { AssistantAdditionLineInput, AssistantRecommendation } from "../src/contracts/project-chat-assistant.js";
import { assistantSellingAmount, calculateAssistantAddition, type AssistantApprovedScope, type AssistantPricingSource } from "../src/services/project-assistant-pricing.js";

const settings = (baseRatePaise: number, extras = {}) => ({ baseRatePaise, lowQuantityLimit: "10", impactBps: 1000, minimumMarkupBps: 1000, startingMarkupBps: 2000, ...extras });
function source(id = "ceiling", extras: Partial<AssistantPricingSource> = {}): AssistantPricingSource {
  return { candidate: { mainLineId: id, mainBasketId: "basket", subBasketId: "sub", name: `Line ${id}`, basketName: "Basket", subBasketName: "Sub",
    revisionId: `${id}-draft`, revisionVersion: 2, itemVersion: 3, uom: { id: "uom", code: "sq-ft", name: "Square feet", decimalScale: 2 }, available: true }, temporary: false,
    advanced: { modeCalculations: { pmc: settings(7500), sub_vendor: settings(6500), in_house_labor: settings(2300), in_house_material: settings(4700) }, pmcMarginBps: 1500, subVendorMarginBps: 2500 }, ...extras };
}
const approved = (totalPaise = 910000): AssistantApprovedScope => ({ state: "approved", totalPaise, rooms: [{ id: "hall", name: "Hall" }, { id: "bedroom", name: "Bedroom" }], lines: [] });
const line = (mainLineId = "ceiling", overrides: Partial<AssistantAdditionLineInput> = {}): AssistantAdditionLineInput => ({ mainLineId, roomId: "hall", quantity: "11", pricingMode: null, additiveConfirmed: true, optional: false, ...overrides });
function reads(sources = [source()], rules: AssistantRecommendation[] = []) {
  return { lines: async (ids: string[]) => new Map(sources.filter(source => ids.includes(source.candidate.mainLineId)).map(source => [source.candidate.mainLineId, source])),
    recommendations: async (ids: string[]) => rules.filter(rule => ids.includes(rule.sourceMainLineId)) };
}
const rule = (from: string, to: string[], extras: Partial<AssistantRecommendation> = {}): AssistantRecommendation => ({ sourceMainLineId: from, ruleId: `${from}-recommendation`, requirement: "must", targetKind: "main_line", targetMainLineIds: to, available: true, completionRequired: false, unavailableChildCount: 0, ...extras });

describe("assistant exact Configuration selling prices", () => {
  it.each([ ["pmc", "9", 87353], ["pmc", "10", 97059], ["pmc", "11", 97059],
    ["sub_vendor", "9", 85800], ["sub_vendor", "10", 95333], ["sub_vendor", "11", 95333],
    ["in_house", "9", 86626], ["in_house", "10", 96250], ["in_house", "11", 96250] ] as const)("uses %s at quantity %s with inclusive threshold", (mode, quantity, amount) => {
    expect(assistantSellingAmount(source(), mode, quantity)).toBe(amount);
  });
  it("rounds split labor and material independently and never reuses an incomplete split's legacy combined value", () => {
    const item = source(); item.advanced!.modeCalculations = { in_house_labor: settings(1, { lowQuantityLimit: "0", startingMarkupBps: 3000 }), in_house_material: settings(1, { lowQuantityLimit: "0", startingMarkupBps: 3000 }), in_house: settings(99999) };
    expect(assistantSellingAmount(item, "in_house", "1")).toBe(2);
    (item.advanced!.modeCalculations as any).in_house_material = null;
    expect(() => assistantSellingAmount(item, "in_house", "1")).toThrow();
  });
  it("uses separate saved PMC/Sub-Vendor margins, refuses absent values, and never supplies discounts", () => {
    const item = source(); (item.advanced!.modeCalculations as any).pmc.startingMarkupBps = 9000;
    expect(assistantSellingAmount(item, "pmc", "11")).toBe(97059);
    delete item.advanced!.pmcMarginBps;
    expect(() => assistantSellingAmount(item, "pmc", "11")).toThrow();
  });
  it("calculates GST once and keeps unequal approved baselines and quantities isolated", async () => {
    const first = await calculateAssistantAddition({ lines: [line()] }, approved(), reads());
    const second = await calculateAssistantAddition({ lines: [line("ceiling", { quantity: "3", roomId: "bedroom" })] }, approved(432100), reads());
    expect(first).toMatchObject({ subtotalPaise: 95333, gstPaise: 17160, totalPaise: 112493, approvedBaselinePaise: 910000, hypotheticalTotalPaise: 1022493, state: "complete" });
    expect(second).toMatchObject({ subtotalPaise: 28600, gstPaise: 5148, totalPaise: 33748, approvedBaselinePaise: 432100, hypotheticalTotalPaise: 465848 });
    expect(JSON.stringify(first)).not.toMatch(/baseRatePaise|MarginBps|MarkupBps|revisedAmountPaise|impactBps/);
  });
  it.each([null, "0", "-1", "1.001", "NaN", "1e3"])("requests valid UOM quantity for %s without assuming one unit", async quantity => {
    const result = await calculateAssistantAddition({ lines: [line("ceiling", { quantity })] }, approved(), reads());
    expect(result.totalPaise).toBeNull(); expect(result.lines[0]!.amountPaise).toBeNull(); expect(result.missingInputs.length).toBeGreaterThan(0);
  });
  it("requires a real project room and refuses missing, unavailable, temporary and overflowing lines", async () => {
    for (const item of [source("ceiling", { temporary: true }), source("ceiling", { advanced: null }), source("other")]) {
      const result = await calculateAssistantAddition({ lines: [line()] }, approved(), reads([item])); expect(result.totalPaise).toBeNull();
    }
    for (const roomId of [null, "other-project-room"]) expect((await calculateAssistantAddition({ lines: [line("ceiling", { roomId })] }, approved(), reads())).totalPaise).toBeNull();
    expect((await calculateAssistantAddition({ lines: [line("ceiling", { quantity: "99999999999999999999999999999" })] }, approved(), reads())).totalPaise).toBeNull();
  });
  it("deduplicates equal lines while refusing conflicting quantities and preserves different rooms", async () => {
    expect((await calculateAssistantAddition({ lines: [line(), line()] }, approved(), reads())).lines).toHaveLength(1);
    expect((await calculateAssistantAddition({ lines: [line(), line("ceiling", { quantity: "8" })] }, approved(), reads())).totalPaise).toBeNull();
    const rooms = await calculateAssistantAddition({ lines: [line(), line("ceiling", { roomId: "bedroom", quantity: "3" })] }, approved(), reads());
    expect(rooms.lines).toHaveLength(2); expect(rooms.subtotalPaise).toBe(123933);
  });
});

describe("assistant recommendations and immutable approved allowances", () => {
  it("expands all Sub Basket children, does not infer quantity, separates optional charges, and labels partial totals", async () => {
    const result = await calculateAssistantAddition({ lines: [line(), line("paint", { quantity: "2", optional: true })] }, approved(), reads([source(), source("cove"), source("paint"), source("trim")], [rule("ceiling", ["cove", "trim"], { targetKind: "sub_basket" }), rule("ceiling", ["paint"], { requirement: "can", ruleId: "paint-optional" })]));
    expect(result.state).toBe("partial"); expect(result.totalPaise).toBeNull(); expect(result.subtotalPaise).toBe(95333); expect(result.optionalSubtotalPaise).toBe(19067);
    expect(result.lines.filter(line => ["cove", "trim"].includes(line.mainLineId)).every(line => line.quantity === null && line.amountPaise === null && !line.optional)).toBe(true);
    expect(result.assumptions.join(" ")).toContain("partial subtotal");
  });
  it("does not let unavailable children or required rules vanish from an otherwise complete result", async () => {
    const result = await calculateAssistantAddition({ lines: [line()] }, approved(), reads([source()], [rule("ceiling", [], { available: false, completionRequired: true, unavailableChildCount: 2, targetKind: "sub_basket" })]));
    expect(result.state).toBe("partial"); expect(result.missingInputs.join(" ")).toContain("incomplete or unavailable");
  });
  it("terminates cyclic recommendations and preserves a required line when an optional rule also points to it", async () => {
    const result = await calculateAssistantAddition({ lines: [line(), line("cove", { optional: true })] }, approved(), reads([source(), source("cove")], [rule("ceiling", ["cove"]), rule("cove", ["ceiling"])]));
    expect(result.lines).toHaveLength(2); expect(result.lines.every(line => !line.optional)).toBe(true); expect(result.totalPaise).not.toBeNull();
  });
  it("requires additive confirmation for an included allowance and preserves its own mode", async () => {
    const baseline = approved(); baseline.lines = [{ mainLineId: "ceiling", roomId: "hall", pricingMode: "pmc", included: true }];
    const blocked = await calculateAssistantAddition({ lines: [line("ceiling", { additiveConfirmed: false })] }, baseline, reads());
    expect(blocked.lines[0]!.pricingMode).toBe("pmc"); expect(blocked.totalPaise).toBeNull(); expect(blocked.missingInputs.join(" ")).toContain("already included");
    const extra = await calculateAssistantAddition({ lines: [line()] }, baseline, reads());
    expect(extra.subtotalPaise).toBe(97059); expect(extra.hypotheticalTotalPaise).toBe(1024530);
    expect(baseline.totalPaise).toBe(910000);
  });
  it("does not fabricate a complete addition when approved scope is unavailable or a special historical mode is ambiguous", async () => {
    const missing = { ...approved(), state: "unavailable" as const, totalPaise: null };
    expect((await calculateAssistantAddition({ lines: [line()] }, missing, reads())).totalPaise).toBeNull();
    const existing = approved(); existing.lines = ["pmc", "in_house"].map(pricingMode => ({ mainLineId: "ceiling", roomId: "hall", pricingMode: pricingMode as "pmc" | "in_house", included: true }));
    expect((await calculateAssistantAddition({ lines: [line()] }, existing, reads())).missingInputs.join(" ")).toContain("different modes");
  });
  it("excludes optional children of optional additions, satisfies an already included recommendation without charging twice", async () => {
    const baseline = approved(); baseline.lines = [{ mainLineId: "cove", roomId: "hall", pricingMode: "sub_vendor", included: true }];
    const result = await calculateAssistantAddition({ lines: [line(), line("paint", { optional: true })] }, baseline, reads([source(), source("paint"), source("trim")], [rule("ceiling", ["cove"]), rule("paint", ["trim"])]));
    expect(result.lines.map(line => line.mainLineId)).not.toContain("cove"); expect(result.lines.find(line => line.mainLineId === "trim")?.optional).toBe(true); expect(result.state).toBe("complete");
  });
});
