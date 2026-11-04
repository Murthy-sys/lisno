import { describe, expect, it, vi } from "vitest";
import { getQuotationCandidates, getQuotationRecommendations, quotationKeys, type QuotationRecommendationQuery } from "./quotationApi";

const source = { revisionId: "current-draft", revisionVersion: 3, itemVersion: 2, uomId: "sqft" };
const query: QuotationRecommendationQuery = { expectedVersion: 7, roomId: "bedroom", sources: [{ mainLineId: "wall", source }] };

describe("quotation recommendation contract", () => {
  it("sends source identities in a project-scoped read body without losing version or paging", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { items: [], total: 0 } }));
    await getQuotationRecommendations("project-a", { ...query, offset: 20 });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toContain("/projects/project-a/quotation/recommendations/query");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ ...query, offset: 20, limit: 20 });
  });

  it("separates project, session, room, version, source revision and page caches", () => {
    const key = quotationKeys.recommendations("project-a", query, "client-a");
    expect(quotationKeys.recommendations("project-b", query, "client-a")).not.toEqual(key);
    expect(quotationKeys.recommendations("project-a", query, "client-b")).not.toEqual(key);
    for (const changed of [{ ...query, roomId: "kitchen" }, { ...query, expectedVersion: 8 }, { ...query, offset: 20 },
      { ...query, sources: [{ mainLineId: "wall", source: { ...source, revisionVersion: 4 } }] }]) {
      expect(quotationKeys.recommendations("project-a", changed, "client-a")).not.toEqual(key);
    }
    const sources = [{ mainLineId: "z", source }, { mainLineId: "a", source }];
    expect(quotationKeys.recommendations("p", { ...query, sources })).toEqual(quotationKeys.recommendations("p", { ...query, sources: [...sources].reverse() }));
  });

  it("sends filters to candidate search so results beyond the loaded page can match", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { items: [], total: 0, offset: 0, limit: 20 } }));
    await getQuotationCandidates("project-a", "Primer", 40, { mainBasketId: "painting", subBasketId: "walls" });
    const url = new URL(String(fetch.mock.calls[0][0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: "Primer", offset: "40", limit: "20", mainBasketId: "painting", subBasketId: "walls" });
  });
});
