import { describe, expect, it } from "vitest";
import { draftQuotationItem, prunePendingQuotationRecommendations, quotationDraftOperations, quotationSaveIsConfirmed } from "./clientQuotationDraft";
import type { QuotationDetail, QuotationLine } from "./quotationApi";

const source = { revisionId: "revision", itemVersion: 1, revisionVersion: 1, uomId: "unit" };
const line = (id: string, roomId = "kitchen"): QuotationLine => ({ id, mainLineId: id, mainLineName: id, roomId, roomName: roomId,
  included: true, source, quantity: 1, modeTier: "signature", pricingMode: "sub_vendor", ratePaise: 100, amountPaise: 100, uomName: "Unit",
  choices: [{ modeTier: "signature", available: true, unavailableReason: null, ratePaise: 100, amountPaise: 100, source }],
  mainBasketId: "basket", subBasketId: "sub" });

describe("Client recommendation draft lineage", () => {
  it("removes only unsaved recommendation dependents when their last source in the same room is removed", () => {
    const kitchen = line("source"); const bedroom = line("source", "bedroom");
    const dependent = { ...draftQuotationItem(line("dependent"), "add"), recommendationSourceMainLineIds: ["source"] };
    const result = prunePendingQuotationRecommendations({ version: 4, groups: [], items: {
      source: { ...draftQuotationItem(kitchen), included: false }, dependent
    } }, [kitchen, { ...bedroom, id: "bedroom-source" }]);
    expect(result.items.dependent!.included).toBe(false);
    expect(quotationDraftOperations(result)).toEqual([{ kind: "update", lineItemId: "source", source, included: false }]);
  });

  it("retains other sources and independent selections while pruning transitive unsaved recommendations", () => {
    const first = line("first"); const second = line("second");
    const result = prunePendingQuotationRecommendations({ version: 4, groups: [], items: {
      first: { ...draftQuotationItem(first), included: false },
      shared: { ...draftQuotationItem(line("shared"), "add"), recommendationSourceMainLineIds: ["first", "second"] },
      only: { ...draftQuotationItem(line("only"), "add"), recommendationSourceMainLineIds: ["first"] },
      nested: { ...draftQuotationItem(line("nested"), "add"), recommendationSourceMainLineIds: ["only"] },
      manual: { ...draftQuotationItem(line("manual"), "add"), recommendationSourceMainLineIds: [] }
    } }, [first, second]);
    expect(result.items.shared).toMatchObject({ included: true, recommendationSourceMainLineIds: ["second"] });
    expect(result.items.only!.included).toBe(false);
    expect(result.items.nested!.included).toBe(false);
    expect(result.items.manual!.included).toBe(true);
  });

  it("leaves persisted and omitted-origin dependencies to the server and preserves origins on ordinary edits", () => {
    const existing = line("existing"); const sourceLine = line("source");
    const result = prunePendingQuotationRecommendations({ version: 4, groups: [], items: {
      source: { ...draftQuotationItem(sourceLine), included: false },
      existing: { ...draftQuotationItem(existing), quantity: "3" }
    } }, [sourceLine, existing]);
    expect(result.items.existing!.included).toBe(true);
    expect(quotationDraftOperations(result)[1]).not.toHaveProperty("recommendationSourceMainLineIds");
  });

  it("excludes a restored saved recommendation when its explicitly assigned local source is removed", () => {
    const sourceLine = line("source");
    const excluded = { ...line("restored"), included: false, amountPaise: 0 };
    const result = prunePendingQuotationRecommendations({ version: 4, groups: [], items: {
      restored: { ...draftQuotationItem(excluded), included: true, recommendationSourceMainLineIds: ["source"] },
      source: { ...draftQuotationItem(sourceLine), included: false }
    } }, [sourceLine, excluded]);
    expect(result.items.restored).toMatchObject({ kind: "update", included: false, recommendationSourceMainLineIds: [] });
    expect(quotationDraftOperations(result)).toEqual([
      { kind: "update", lineItemId: "restored", source, included: false },
      { kind: "update", lineItemId: "source", source, included: false }
    ]);
    expect(excluded).toMatchObject({ included: false, amountPaise: 0 });
  });

  it("does not confirm an unknown save against missing or mismatched recommendation origins", () => {
    const before = { projectId: "project", estimateId: "estimate", estimateVersion: 4, lines: [] } as unknown as QuotationDetail;
    const current = { ...before, estimateVersion: 5, lines: [line("dependent")] };
    const operation = { kind: "add" as const, mainLineId: "dependent", roomId: "kitchen", source, quantity: 1,
      modeTier: "signature" as const, recommendationSourceMainLineIds: ["source"] };
    expect(quotationSaveIsConfirmed(before, current, [operation])).toBe(false);
    current.lines[0] = { ...current.lines[0]!, recommendationSourceMainLineIds: [] };
    expect(quotationSaveIsConfirmed(before, current, [operation])).toBe(false);
    current.lines[0] = { ...current.lines[0]!, recommendationSourceMainLineIds: ["source"] };
    expect(quotationSaveIsConfirmed(before, current, [operation])).toBe(true);
  });
});
