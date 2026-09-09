import { describe, expect, it } from "vitest";
import { KNOWLEDGE_RELATED_ITEM_SUGGESTIONS, relatedItemSuggestions } from "./knowledgeRelatedItemSuggestions";
import type { KnowledgeBasket, KnowledgeItemListItem, KnowledgeSubBasket } from "./knowledgeTypes";

const meta = {
  version: 1,
  createdById: "test-admin",
  updatedById: "test-admin",
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z"
};
const electrical: KnowledgeBasket = {
  ...meta, id: "basket-electrical", name: "Electrical", description: null, displayOrder: 0, status: "active"
};
const ceiling: KnowledgeSubBasket = {
  ...meta, id: "sub-ceiling", basketId: electrical.id, name: "Ceiling lighting", displayOrder: 0
};

function item(overrides: Partial<KnowledgeItemListItem> = {}): KnowledgeItemListItem {
  return {
    ...meta,
    id: "item-downlight",
    itemType: "main_line",
    basketId: electrical.id,
    basketName: electrical.name,
    subBasketId: ceiling.id,
    subBasketName: ceiling.name,
    mainLineId: "item-downlight",
    mainLineName: "Recessed LED downlight",
    description: null,
    status: "draft",
    activeRevisionId: null,
    draftRevisionId: "revision-downlight",
    revisionNumber: 1,
    uomId: null,
    priorityId: null,
    modeIds: [],
    surfaceIds: [],
    vendorIds: [],
    completeness: { percentage: 0, sections: [], blockers: [], warnings: [] },
    allowedActions: [],
    ...overrides
  };
}

const context = { basket: electrical, subBasket: undefined, subBasketId: "", items: [], catalogReady: true };
const names = (options: Parameters<typeof relatedItemSuggestions>[0]) => relatedItemSuggestions(options).map(({ name }) => name);

describe("related item starter suggestions", () => {
  it("contains exactly the twelve approved name and classification combinations without saved IDs, pricing or scope actions", () => {
    expect(KNOWLEDGE_RELATED_ITEM_SUGGESTIONS.map(({ basketName, subBasketName, name }) => [basketName, subBasketName, name])).toEqual([
      ["Electrical", "Ceiling lighting", "Recessed LED downlight"],
      ["Electrical", "Ceiling lighting", "Adjustable recessed spotlight"],
      ["Electrical", "Cove lighting", "LED strip light for ceiling cove"],
      ["Electrical", "Ceiling lighting", "Surface-mounted ceiling light"],
      ["POP / Gypsum", "Ceiling details", "Gypsum cove detail"],
      ["POP / Gypsum", "Service access", "Ceiling service access panel"],
      ["Modular", "Kitchen hardware", "Soft-close cabinet hinge set"],
      ["Modular", "Kitchen hardware", "Soft-close drawer runner set"],
      ["Modular", "Kitchen storage", "Pull-out kitchen storage unit"],
      ["Modular", "Overhead cabinet hardware", "Lift-up cabinet shutter fitting"],
      ["On Site Carpentry", "Wardrobe fittings", "Wardrobe hanging rail"],
      ["On Site Carpentry", "Wardrobe fittings", "Pull-out wardrobe basket"]
    ]);
    expect(new Set(KNOWLEDGE_RELATED_ITEM_SUGGESTIONS.map(({ key }) => key)).size).toBe(12);
    expect(Object.isFrozen(KNOWLEDGE_RELATED_ITEM_SUGGESTIONS)).toBe(true);
    for (const suggestion of KNOWLEDGE_RELATED_ITEM_SUGGESTIONS) {
      expect(Object.keys(suggestion).sort()).toEqual(["basketName", "guidance", "key", "name", "subBasketName"]);
      expect(suggestion.guidance.length).toBeGreaterThan(20);
      expect(Object.isFrozen(suggestion)).toBe(true);
    }
  });

  it.each([
    ["Electrical", 4], ["POP / Gypsum", 2], ["Modular", 4], ["On Site Carpentry", 2]
  ])("shows only %s starters under All Sub Baskets", (name, count) => {
    expect(relatedItemSuggestions({ ...context, basket: { ...electrical, name } })).toHaveLength(count);
  });

  it("normalizes compatibility characters, whitespace and case without guessing renamed categories", () => {
    expect(relatedItemSuggestions({ ...context, basket: { ...electrical, name: "  ＥＬＥＣＴＲＩＣＡＬ\n" } })).toHaveLength(4);
    expect(relatedItemSuggestions({ ...context, basket: { ...electrical, name: "  POP   /   gYpSuM " } })).toHaveLength(2);
    for (const name of ["Lights", "Electrical services", "Carpentry", "POP/Gypsum", "Painting", ""]) {
      expect(relatedItemSuggestions({ ...context, basket: { ...electrical, name } })).toEqual([]);
    }
  });

  it("requires a complete catalog and a known selected basket", () => {
    expect(relatedItemSuggestions({ ...context, catalogReady: false })).toEqual([]);
    expect(relatedItemSuggestions({ ...context, catalogReady: false, items: [item()] })).toEqual([]);
    expect(relatedItemSuggestions({ ...context, basket: undefined })).toEqual([]);
  });

  it("filters a selected sub-basket by normalized name and requires its exact IDs", () => {
    expect(names({ ...context, subBasketId: ceiling.id, subBasket: { ...ceiling, name: "  CEILING\n lighting " } })).toEqual([
      "Recessed LED downlight", "Adjustable recessed spotlight", "Surface-mounted ceiling light"
    ]);
    expect(relatedItemSuggestions({ ...context, subBasketId: ceiling.id })).toEqual([]);
    expect(relatedItemSuggestions({ ...context, subBasketId: ceiling.id, subBasket: { ...ceiling, id: "other-sub" } })).toEqual([]);
    expect(relatedItemSuggestions({ ...context, subBasketId: ceiling.id, subBasket: { ...ceiling, basketId: "other-basket" } })).toEqual([]);
    expect(relatedItemSuggestions({ ...context, subBasketId: ceiling.id, subBasket: { ...ceiling, name: "Custom lighting" } })).toEqual([]);
  });

  it.each(["draft", "active", "inactive", "archived"] as const)("suppresses an existing %s catalog match without returning an ID or changing status", (status) => {
    const existing = Object.freeze(item({ status, mainLineName: "  Ｒecessed   LED\ndownlight " }));
    expect(names({ ...context, items: Object.freeze([existing]) })).not.toContain("Recessed LED downlight");
    expect(existing.status).toBe(status);
    expect(existing.mainLineId).toBe("item-downlight");
  });

  it("checks every supplied page rather than truncating at the first 100 records", () => {
    const items = Array.from({ length: 100 }, (_, index) => item({ mainLineId: `other-${index}`, mainLineName: `Unrelated item ${index}` }));
    items.push(item());
    expect(names({ ...context, items })).not.toContain("Recessed LED downlight");
  });

  it("keeps same-name items in another basket, sub-basket or item type distinct", () => {
    for (const existing of [
      item({ basketId: "other-basket", basketName: "Electrical" }),
      item({ subBasketId: "other-sub", subBasketName: "Outdoor lighting" }),
      item({ itemType: "temporary" }),
      item({ subBasketId: null, subBasketName: null })
    ]) {
      expect(names({ ...context, items: [existing] })).toContain("Recessed LED downlight");
    }
    expect(names({ ...context, items: [item({ itemType: undefined })] })).not.toContain("Recessed LED downlight");
  });

  it("uses sub-basket IDs when a specific sub-basket is selected, even if another has the same label", () => {
    const selected = { ...context, subBasketId: ceiling.id, subBasket: ceiling };
    expect(names({ ...selected, items: [item({ subBasketId: "different-sub-same-name" })] })).toContain("Recessed LED downlight");
    expect(names({ ...selected, items: [item({ subBasketName: undefined })] })).not.toContain("Recessed LED downlight");
    expect(names({ ...selected, items: [item({ subBasketName: null })] })).not.toContain("Recessed LED downlight");
  });

  it("does not invent missing sub-basket context in an all-sub-baskets catalog", () => {
    expect(names({ ...context, items: [item({ subBasketName: undefined })] })).toContain("Recessed LED downlight");
    expect(names({ ...context, items: [item({ subBasketName: null })] })).toContain("Recessed LED downlight");
  });
});
