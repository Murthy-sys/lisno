import { describe, expect, it } from "vitest";
import { quotationCandidateHasAvailableChoice, quotationCandidateRows } from "./clientQuotationCandidates";
import type { QuotationCandidate, QuotationLine } from "./quotationApi";

const source = { revisionId: "revision-one", itemVersion: 2, revisionVersion: 3, uomId: "unit-one" };
const candidate: QuotationCandidate = { mainLineId: "desk", name: "Desk", mainBasketId: "furniture", mainBasketName: "Furniture", subBasketId: null, subBasketName: null,
  source, pricingMode: "sub_vendor", modeTier: "signature", dimensionsMandatory: false, dimensionRule: null, uomName: "Unit", choices: [] };
const kitchen = { id: "kitchen-one", name: "Kitchen" };

describe("Client builder candidate projection", () => {
  it("does not invent saved financial values or include a candidate automatically", () => {
    const [row] = quotationCandidateRows([candidate], kitchen, []);
    expect(row).toMatchObject({ mainLineId: "desk", roomId: "kitchen-one", included: false, ratePaise: null, amountPaise: null, source });
    expect(quotationCandidateRows([candidate], undefined, [])).toEqual([]);
  });

  it("does not replace a saved or excluded row with candidate defaults for the same room", () => {
    const [initial] = quotationCandidateRows([candidate], kitchen, []);
    const saved: QuotationLine = { ...initial!, id: "saved-one", included: false, quantity: 17, modeTier: "premium", source: null };
    expect(quotationCandidateRows([candidate], kitchen, [saved])).toEqual([]);
    expect(saved).toMatchObject({ quantity: 17, modeTier: "premium", source: null, included: false });
    expect(quotationCandidateRows([candidate], { id: "bedroom-two", name: "Bedroom 2" }, [saved])).toHaveLength(1);
  });

  it("deduplicates repeated pages and keeps candidate identity stable and specific to its room", () => {
    const [first] = quotationCandidateRows([candidate, candidate], kitchen, []);
    const rows = quotationCandidateRows([candidate, candidate], kitchen, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(first!.id);
    expect(quotationCandidateRows([candidate], { id: "bedroom-two", name: "Bedroom 2" }, [])[0]!.id).not.toBe(first!.id);
  });

  it("preserves safe mode options and permits explicit mode selection only with capability and Special eligibility", () => {
    const option = { modeTier: "signature" as const, available: true, unavailableReason: null, ratePaise: 250, amountPaise: 250, source };
    const special: QuotationCandidate = { ...candidate, classification: "special", pricingModeChoices: [{ pricingMode: "pmc", choices: [option] }] };
    const [row] = quotationCandidateRows([special], kitchen, []);
    expect(row).toMatchObject({ classification: "special", pricingMode: "sub_vendor", pricingModeChoices: special.pricingModeChoices });
    expect(quotationCandidateHasAvailableChoice(special, true)).toBe(true);
    expect(quotationCandidateHasAvailableChoice(special, false)).toBe(false);
    expect(quotationCandidateHasAvailableChoice({ ...special, classification: "standard" }, true)).toBe(false);
    expect(quotationCandidateHasAvailableChoice({ ...special, classification: undefined }, true)).toBe(false);
  });
});
