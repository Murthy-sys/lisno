import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/client";
import type { KnowledgeSubBasket } from "../ai-estimator-knowledge/knowledgeTypes";
import { proposalFixture, proposalHierarchyFixture } from "./proposal.fixtures";
import { createProposalDataSource } from "./proposalDataSource";
import { knowledgeModeTierDataSource } from "../ai-estimator-knowledge/knowledgeModeTierDataSource";
import type { ProposalDetail } from "./proposalTypes";

function subBasket(id: string, basketId: string, name = id): KnowledgeSubBasket {
  return { id, basketId, name, version: 1, displayOrder: 0, createdAt: "2026-10-12T00:00:00.000Z", updatedAt: "2026-10-12T00:00:00.000Z", createdById: "admin", updatedById: "admin" };
}

function source(detail: ProposalDetail) {
  const onAccessDenied = vi.fn();
  return { onAccessDenied, adapter: createProposalDataSource({ actorId: detail.requesterId, scope: "procurement", proposalId: detail.id,
    snapshot: "current", getDetail: () => detail, getHierarchy: () => proposalHierarchyFixture(detail), isCurrent: () => true,
    onSaved: vi.fn(), onAccessDenied }) };
}

afterEach(() => vi.restoreAllMocks());

describe("proposal recommendation Sub-Basket catalog", () => {
  it("does not inherit global item-name discovery in any Mode tier", () => {
    const get = vi.spyOn(apiClient, "get");
    const { adapter } = source(proposalFixture());
    for (const tier of ["signature", "premium", "functional"] as const) {
      expect(knowledgeModeTierDataSource(tier, adapter).specificationItemNames).toBeUndefined();
    }
    expect(get).not.toHaveBeenCalled();
  });
  it("offers live siblings and the proposed child under an existing parent, across catalog pages", async () => {
    const detail = proposalFixture({ basketId: "parent-one", target: { kind: "new_sub_basket", basketId: "parent-one" } });
    const get = vi.spyOn(apiClient, "get")
      .mockResolvedValueOnce({ items: [subBasket("sibling-one", "parent-one", "Existing stone"), subBasket("foreign", "parent-two")], pagination: { offset: 0, limit: 2, total: 4, hasMore: true } })
      .mockResolvedValueOnce({ items: [subBasket("sibling-two", "parent-one"), subBasket("sub-proposal", "parent-one", "Earlier saved name")], pagination: { offset: 2, limit: 2, total: 4, hasMore: false } });
    const result = await source(detail).adapter.getSubBasketCatalog("parent-one");
    expect(result.items.map(entry => entry.id)).toEqual(["sibling-one", "sibling-two", "sub-proposal"]);
    expect(result.items.find(entry => entry.id === "sub-proposal")?.name).toBe("Interior stone");
    expect(result.pagination).toEqual({ offset: 0, limit: 3, total: 3, hasMore: false });
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/procurement/vendor-basket-proposals/references?kind=sub-baskets&limit=100&offset=0",
      "/procurement/vendor-basket-proposals/references?kind=sub-baskets&limit=100&offset=2"
    ]);
  });

  it("keeps a new Main Basket catalog isolated from live Configuration", async () => {
    const get = vi.spyOn(apiClient, "get");
    const detail = proposalFixture();
    const result = await source(detail).adapter.getSubBasketCatalog(detail.basketId);
    expect(result.items.map(entry => entry.id)).toEqual(["sub-proposal"]);
    expect(get).not.toHaveBeenCalled();
  });

  it("loads only the requested live parent when recommendations inspect another basket", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({ items: [subBasket("live-child", "parent-two"), subBasket("unrelated", "parent-one")], pagination: { offset: 0, limit: 100, total: 2, hasMore: false } });
    const result = await source(proposalFixture()).adapter.getSubBasketCatalog("parent-two");
    expect(result.items.map(entry => entry.id)).toEqual(["live-child"]);
  });

  it("reports a failed live catalog rather than offering an incomplete sibling list", async () => {
    const failure = new Error("Catalog unavailable");
    vi.spyOn(apiClient, "get").mockRejectedValueOnce(failure);
    const { adapter, onAccessDenied } = source(proposalFixture({ target: { kind: "new_sub_basket", basketId: "basket-proposal" } }));
    await expect(adapter.getSubBasketCatalog("basket-proposal")).rejects.toBe(failure);
    expect(onAccessDenied).toHaveBeenCalledWith(failure);
  });
});
