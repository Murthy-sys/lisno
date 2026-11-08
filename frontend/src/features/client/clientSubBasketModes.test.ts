import { describe, expect, it } from "vitest";
import { draftQuotationItem, quotationDraftOperations, quotationSaveIsConfirmed } from "./clientQuotationDraft";
import { quotationGroupComparison, quotationGroupModeOptions, quotationModeOperations, stageQuotationGroupMode } from "./clientSubBasketModes";
import type { QuotationDetail, QuotationLine } from "./quotationApi";
const source = { revisionId: "revision", itemVersion: 2, revisionVersion: 3, uomId: "unit" };
const line = (id: string): QuotationLine => ({ id, mainLineId: id, mainLineName: id, roomId: "room", roomName: "Room", mainBasketId: "basket", subBasketId: "sub", included: true,
  quantity: 2, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 123, amountPaise: 246, source,
  choices: [{ modeTier: "signature", available: true, unavailableReason: null, ratePaise: 123, amountPaise: 246, source },
    { modeTier: "premium", available: true, unavailableReason: null, ratePaise: 157, amountPaise: 314, source }] });
const group = { mainBasketId: "basket", subBasketId: "sub", roomId: "room", includedCount: 101, sourceToken: "scope" };

describe("Client sub-basket modes", () => {
  it("compresses more than 100 tier changes into one atomic scope command while retaining a quantity edit", () => {
    const lines = Array.from({ length: 101 }, (_, index) => line(`line-${index}`));
    const before = { version: 7, groups: [], items: { "line-0": { ...draftQuotationItem(lines[0]!), quantity: "3" } } };
    const changed = stageQuotationGroupMode(before, lines, 7, "premium", undefined, group);
    const operations = quotationDraftOperations(changed.draft!, quotationModeOperations({ group: changed.selection! }, changed.draft));
    expect(operations).toEqual([{ kind: "set_group_tier", mainBasketId: "basket", subBasketId: "sub", roomId: "room", sourceToken: "scope", modeTier: "premium" },
      { kind: "update", lineItemId: "line-0", source, quantity: 3, included: true, modeTier: "premium" }]);
  });

  it("keeps an unrelated sub-basket tier edit when compressing Direct items", () => {
    const direct = { ...line("direct"), subBasketId: null };
    const nested = line("nested");
    const draft = { version: 7, groups: [], items: {
      direct: { ...draftQuotationItem(direct), modeTier: "premium" as const },
      nested: { ...draftQuotationItem(nested), modeTier: "premium" as const }
    } };
    const operation = { kind: "set_group_tier" as const, mainBasketId: "basket", subBasketId: null, roomId: "room", sourceToken: "direct-scope", modeTier: "premium" as const };
    expect(quotationDraftOperations(draft, [operation])).toEqual([operation,
      { kind: "update", lineItemId: "nested", source, quantity: 2, included: true, modeTier: "premium" }]);
  });

  it("confirms Direct-item saves independently of untouched sub-baskets while removals retain their whole-basket scope", () => {
    const direct = { ...line("direct"), subBasketId: null };
    const nested = line("nested");
    const before = { projectId: "project", estimateId: "estimate", estimateVersion: 7, lines: [direct, nested] } as QuotationDetail;
    const operation = { kind: "set_group_tier" as const, mainBasketId: "basket", subBasketId: null, roomId: "room", sourceToken: "direct-scope", modeTier: "premium" as const };
    const current = { ...before, estimateVersion: 8, lines: [{ ...direct, modeTier: "premium" as const, ratePaise: 157, amountPaise: 314 }, nested] };
    expect(quotationSaveIsConfirmed(before, current, [operation])).toBe(true);
    expect(quotationSaveIsConfirmed(before, { ...current, lines: [direct, { ...nested, modeTier: "premium" as const }] }, [operation])).toBe(false);
    const removal = { kind: "exclude_group" as const, mainBasketId: "basket", subBasketId: null, roomId: "room", sourceToken: "basket-scope" };
    const partiallyRemoved = { ...before, estimateVersion: 8, lines: [nested], excludedLines: [{ ...direct, included: false }] };
    expect(quotationSaveIsConfirmed(before, partiallyRemoved, [removal])).toBe(false);
    expect(quotationSaveIsConfirmed(before, { ...partiallyRemoved, lines: [], excludedLines: [direct, nested].map(row => ({ ...row, included: false })) }, [removal])).toBe(true);
  });

  it.each([group, undefined])("retains explicit same-tier intent for manual prices and restores Mode without a write (group=%s)", scope => {
    const saved = { ...line("manual"), ratePaise: 900, amountPaise: 1800 };
    const changed = stageQuotationGroupMode(null, [saved], 7, "signature", undefined, scope);
    expect(changed.draft?.items.manual).toMatchObject({ modeTier: "signature" });
    const operations = quotationDraftOperations(changed.draft!, quotationModeOperations({ scope: changed.selection! }, changed.draft));
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ kind: scope ? "set_group_tier" : "update", modeTier: "signature" });
    const before = { projectId: "project", estimateId: "estimate", estimateVersion: 7, lines: [saved] } as QuotationDetail;
    expect(quotationSaveIsConfirmed(before, { ...before, estimateVersion: 8 }, operations)).toBe(false);
    expect(quotationSaveIsConfirmed(before, { ...before, estimateVersion: 8, lines: [line("manual")] }, operations)).toBe(true);
    const restored = stageQuotationGroupMode(changed.draft, [saved], 7, "mode", changed.selection, scope);
    expect(restored.draft).toBeNull(); expect(restored.selection).toBeUndefined();
  });

  it("compares explicit tier and row changes with configuration prices while preserving untouched saved pricing", () => {
    const items = [draftQuotationItem(line("changed")), draftQuotationItem(line("unchanged"))];
    const comparison = quotationGroupComparison(items, 7, group, new Set(["changed"]))!;
    expect(comparison.lines[0]).toMatchObject({ rateSource: "configuration" });
    expect(comparison.lines[1]).not.toHaveProperty("rateSource");
  });

  it("preserves quantities and component selections when Mode restores a mixed group", () => {
    const first = { ...line("first"), selectedInHouseComponentIds: ["old"] };
    const second = { ...line("second"), modeTier: "premium" as const };
    const before = { version: 7, groups: [], items: { first: { ...draftQuotationItem(first), quantity: "4" } } };
    const changed = stageQuotationGroupMode(before, [first, second], 7, "premium", undefined, group);
    expect(changed.draft!.items.first).toMatchObject({ modeTier: "premium", components: [], quantity: "4" });
    const restored = stageQuotationGroupMode(changed.draft, [first, second], 7, "mode", changed.selection, group);
    expect(restored.draft).toEqual(before); expect(restored.selection).toBeUndefined();
  });

  it("uses every included item's availability and returns no comparison for unresolved sources", () => {
    const first = draftQuotationItem(line("first")); const second = draftQuotationItem({ ...line("second"), choices: [line("second").choices[0]!] });
    expect(quotationGroupModeOptions([first, second]).find(option => option.tier === "premium")).toMatchObject({ available: false });
    expect(quotationGroupComparison([{ ...first, line: { ...first.line, source: null } }], 7, group)).toBeUndefined();
    const comparison = quotationGroupComparison([first, second], 7, group)!;
    expect(comparison.lines).toHaveLength(2); expect(comparison).not.toHaveProperty("rates");
  });

  it("requires every prior group member and explicit components when confirming a lost response", () => {
    const rows = [line("first"), line("second")];
    const before = { projectId: "project", estimateId: "estimate", estimateVersion: 7, lines: rows } as QuotationDetail;
    const operation = { kind: "set_group_tier" as const, mainBasketId: "basket", subBasketId: "sub", roomId: "room", sourceToken: "scope", modeTier: "premium" as const,
      componentSelections: [{ lineItemId: "first", selectedInHouseComponentIds: ["selected"] }] };
    const current = { ...before, estimateVersion: 8, lines: rows.map(row => ({ ...row, modeTier: "premium" as const, ratePaise: 157, amountPaise: 314, selectedInHouseComponentIds: ["selected"] })) };
    expect(quotationSaveIsConfirmed(before, current, [operation])).toBe(true);
    expect(quotationSaveIsConfirmed(before, { ...current, lines: [current.lines[0]!] }, [operation])).toBe(false);
    expect(quotationSaveIsConfirmed(before, { ...current, lines: [{ ...current.lines[0]!, selectedInHouseComponentIds: [] }, current.lines[1]!] }, [operation])).toBe(false);
  });
});
