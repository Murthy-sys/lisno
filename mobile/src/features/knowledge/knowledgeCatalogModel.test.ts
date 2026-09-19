import {
  knowledgeActivateCommand,
  knowledgeCreateCommand,
  knowledgeDeactivateCommand,
  knowledgeDuplicateCommand,
  knowledgeHistoryPath,
  knowledgeListPath,
  validateKnowledgeCreate,
  validateKnowledgeDuplicate,
  type KnowledgeBasket,
  type KnowledgeItemDetail
} from "./knowledgeCatalogModel";

const basket: KnowledgeBasket = {
  id: "basket/a b?",
  name: "Civil",
  description: null,
  status: "active",
  version: 1
};

const detail = {
  mainLineId: "line/a b?",
  version: 4,
  draftRevision: { id: "revision/a b?" }
} as KnowledgeItemDetail;

describe("knowledge catalog model", () => {
  it("normalizes a supported Main Line create body", () => {
    expect(validateKnowledgeCreate({
      basketId: basket.id,
      subBasketName: "  Masonry  ",
      name: "  Brick work  ",
      description: "  External wall  "
    }, [basket])).toEqual({
      value: {
        basketId: basket.id,
        input: { name: "Brick work", subBasketName: "Masonry", description: "External wall" }
      }
    });
  });

  it("requires an active server-provided basket and bounded names", () => {
    expect(validateKnowledgeCreate({ basketId: basket.id, subBasketName: "Masonry", name: "Brick", description: "" }, [{ ...basket, status: "inactive" }]).error).toMatch(/active Main Basket/i);
    expect(validateKnowledgeCreate({ basketId: basket.id, subBasketName: "", name: "Brick", description: "" }, [basket]).error).toMatch(/Sub Basket/i);
    expect(validateKnowledgeDuplicate({ name: " ", reason: "" }).error).toMatch(/Duplicate name/i);
  });

  it("builds normalized list and encoded detail/history paths", () => {
    expect(knowledgeListPath({ search: "  brick wall ", limit: 20, offset: 40 })).toBe("/admin/ai-estimator-knowledge/items?search=brick+wall&limit=20&offset=40");
    expect(knowledgeHistoryPath("line/a b?")).toBe("/admin/ai-estimator-knowledge/main-lines/line%2Fa%20b%3F/history?limit=20&offset=0");
    expect(knowledgeCreateCommand(basket.id, { name: "Brick", subBasketName: "Masonry" }).path).toBe("/admin/ai-estimator-knowledge/baskets/basket%2Fa%20b%3F/main-lines");
  });

  it("keeps duplicate and lifecycle commands on the captured aggregate version", () => {
    expect(knowledgeDuplicateCommand(detail, { name: "Brick copy", reason: "Alternative" })).toEqual({
      path: "/admin/ai-estimator-knowledge/main-lines/line%2Fa%20b%3F/duplicate",
      body: { expectedVersion: 4, name: "Brick copy", reason: "Alternative" }
    });
    expect(knowledgeActivateCommand(detail)).toEqual({
      path: "/admin/ai-estimator-knowledge/main-lines/line%2Fa%20b%3F/revisions/revision%2Fa%20b%3F/activate",
      body: { expectedVersion: 4 }
    });
    expect(knowledgeDeactivateCommand(detail, "  Superseded costs  ").body).toEqual({ expectedVersion: 4, reason: "Superseded costs" });
  });

  it("rejects invalid lifecycle snapshots and missing reasons", () => {
    expect(() => knowledgeActivateCommand({ ...detail, draftRevision: null })).toThrow(/Draft revision/i);
    expect(() => knowledgeDeactivateCommand(detail, " ")).toThrow(/reason/i);
    expect(() => knowledgeDuplicateCommand({ ...detail, version: 0 }, { name: "copy" })).toThrow(/version/i);
  });
});
