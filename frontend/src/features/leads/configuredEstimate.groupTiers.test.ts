import { describe, expect, it } from "vitest";
import { applyConfiguredGroupTier, type ConfiguredLineDraft } from "./configuredEstimate";

const scope = { roomId: "room", mainBasketId: "basket", subBasketId: "sub" };
const draft = (id: string, manual = false): ConfiguredLineDraft => ({ key: id, ...scope, persistedId: id,
  mainLineId: id, catalogueId: id, mainLineName: id, roomName: "Room", mainBasketName: "Basket", subBasketName: "Sub", itemType: "main_line",
  revisionId: "revision", itemVersion: 1, revisionVersion: 1, uomId: "uom", uomName: "ea", uomDecimalScale: 0,
  included: true, quantity: 2, sourceMissing: false, pricingMode: "sub_vendor", modeTier: "signature",
  rateSource: manual ? "manual" : "configuration", rateInput: manual ? "99.25" : "20",
  applicableTiers: ["signature", "premium"], tierPricing: {
    signature: { modeBaseRatesPaise: { pmc: 1000, sub_vendor: 2000, in_house: null } },
    premium: { modeBaseRatesPaise: { pmc: 1500, sub_vendor: 3500, in_house: null } }
  } });

describe("Sub Basket tier application", () => {
  it("leaves initial Mode values and references intact, including mixed tiers and manual rates", () => {
    const lines = [draft("manual", true), { ...draft("premium"), modeTier: "premium" as const, rateInput: "35" }];
    const next = applyConfiguredGroupTier(lines, scope, "mode", new Map())!;
    expect(next.lines).toEqual(lines); expect(next.lines[0]).toBe(lines[0]); expect(next.baselines.size).toBe(0);
  });
  it("applies one tier atomically and restores manual prices but recomputes configured prices after Configuration changes", () => {
    const lines = [draft("manual", true), draft("configured"), { ...draft("excluded"), included: false },
      { ...draft("other-room"), roomId: "other" }, { ...draft("other-sub"), subBasketId: "other" }];
    const next = applyConfiguredGroupTier(lines, scope, "premium", new Map())!;
    expect(next.lines.slice(0, 2).map(line => [line.modeTier, line.rateInput, line.rateSource])).toEqual([
      ["premium", "35", "configuration"], ["premium", "35", "configuration"]]);
    expect(next.lines.slice(2)).toEqual(lines.slice(2));
    const refreshed = next.lines.map(line => ({ ...line, quantity: 4, tierPricing: { ...line.tierPricing,
      signature: { modeBaseRatesPaise: { pmc: 1000, sub_vendor: 2300, in_house: null } } } }));
    const restored = applyConfiguredGroupTier(refreshed, scope, "mode", next.baselines)!;
    expect(restored.lines[0]).toMatchObject({ modeTier: "signature", rateInput: "99.25", rateSource: "manual", quantity: 4 });
    expect(restored.lines[1]).toMatchObject({ modeTier: "signature", rateInput: "23", rateSource: "configuration", quantity: 4 });
  });
  it("adopts configured prices on an explicit choice matching the current tier and refuses partial unavailable changes", () => {
    const manual = draft("manual", true);
    expect(applyConfiguredGroupTier([manual], scope, "signature", new Map())!.lines[0]).toMatchObject({ rateInput: "20", rateSource: "configuration" });
    expect(applyConfiguredGroupTier([manual, { ...draft("missing"), applicableTiers: ["signature"] }], scope, "premium", new Map())).toBeNull();
    expect(manual.rateInput).toBe("99.25");
  });
  it("resets component selections only on a real tier switch and restores identities without reusing old component prices", () => {
    const component = { id: "original", basketId: "basket", subBasketId: "sub", basketName: "Basket", subBasketName: "Sub", baseRatePaise: 3000, unavailableReason: null };
    const line = { ...draft("component"), pricingMode: "in_house" as const, selectedInHouseComponentIds: ["original"],
      tierPricing: { signature: { modeBaseRatesPaise: { pmc: null, sub_vendor: null, in_house: null }, inHouseComponents: [component] },
        premium: { modeBaseRatesPaise: { pmc: null, sub_vendor: null, in_house: null }, inHouseComponents: [{ ...component, id: "premium" }] } }, inHouseComponents: [component] };
    const selected = applyConfiguredGroupTier([line], scope, "premium", new Map())!;
    expect(selected.lines[0]!.selectedInHouseComponentIds).toEqual([]);
    const restored = applyConfiguredGroupTier(selected.lines, scope, "mode", selected.baselines)!;
    expect(restored.lines[0]!.selectedInHouseComponentIds).toEqual(["original"]);
    expect(restored.lines[0]!.componentPricing).toBeUndefined();
    expect(applyConfiguredGroupTier([line], scope, "signature", new Map())!.lines[0]!.selectedInHouseComponentIds).toEqual(["original"]);
  });
});
