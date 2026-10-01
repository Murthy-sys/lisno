import { describe, expect, it, vi } from "vitest";

import { getEstimationCatalogue } from "./estimationCatalogueApi";

describe("estimator catalogue API", () => {
  it("reads every page before presenting the configured hierarchy", async () => {
    const offsets: number[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const query = new URL(String(input), "http://localhost").searchParams;
      const offset = Number(query.get("offset"));
      offsets.push(offset);
      return Response.json({ data: {
        items: [{ id: `basket-${offset}`, name: `Basket ${offset}`, displayOrder: offset, subBaskets: [] }],
        pagination: { limit: 100, offset, total: 2, hasMore: offset === 0 },
        ineligibleLineCount: offset === 0 ? 3 : 1
      } });
    });
    const result = await getEstimationCatalogue();
    expect(offsets).toEqual([0, 1]);
    expect(result.items.map((item) => item.id)).toEqual(["basket-0", "basket-1"]);
    expect(result.ineligibleLineCount).toBe(4);
  });

  it("fails if a page reports more data but cannot advance", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: {
      items: [], pagination: { limit: 100, offset: 0, total: 1, hasMore: true }, ineligibleLineCount: 0
    } }));
    await expect(getEstimationCatalogue()).rejects.toThrow("pagination did not advance");
  });
});
