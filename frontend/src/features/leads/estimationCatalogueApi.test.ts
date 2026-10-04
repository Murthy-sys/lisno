import { describe, expect, it, vi } from "vitest";

import { getEstimationCatalogue, getEstimationCatalogueRecommendations } from "./estimationCatalogueApi";

describe("estimator catalogue API", () => {
  it("reads every page before presenting the configured hierarchy", async () => {
    const offsets: number[] = [];
    const readyFlags: Array<string | null> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const query = new URL(String(input), "http://localhost").searchParams;
      const offset = Number(query.get("offset"));
      offsets.push(offset);
      readyFlags.push(query.get("includeReadyNonActive"));
      return Response.json({ data: {
        items: [{ id: `basket-${offset}`, name: `Basket ${offset}`, displayOrder: offset, subBaskets: [] }],
        pagination: { limit: 100, offset, total: 2, hasMore: offset === 0 },
        ineligibleLineCount: offset === 0 ? 3 : 1
      } });
    });
    const result = await getEstimationCatalogue({ includeReadyNonActive: true });
    expect(offsets).toEqual([0, 1]);
    expect(readyFlags).toEqual(["true", "true"]);
    expect(result.items.map((item) => item.id)).toEqual(["basket-0", "basket-1"]);
    expect(result.ineligibleLineCount).toBe(4);
    expect(result.readyNonActiveSupported).toBe(true);
  });

  it("restarts with the legacy query only when an older server rejects the new flag", async () => {
    const requested: Array<string | null> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const query = new URL(String(input), "http://localhost").searchParams;
      requested.push(query.get("includeReadyNonActive"));
      return requested.length === 1
        ? Response.json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed.", fields: { includeReadyNonActive: "Unrecognized field" } } }, { status: 400 })
        : Response.json({ data: { items: [{ id: "active-basket", name: "Active basket", displayOrder: 1, subBaskets: [] }], pagination: { limit: 100, offset: 0, total: 1, hasMore: false }, ineligibleLineCount: 1 } });
    });
    const result = await getEstimationCatalogue({ includeReadyNonActive: true });
    expect(requested).toEqual(["true", null]);
    expect(result.items.map((item) => item.id)).toEqual(["active-basket"]);
    expect(result.readyNonActiveSupported).toBe(false);
  });

  it("does not hide another catalogue validation failure", async () => {
    const requested: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      requested.push(String(input));
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Bad offset", fields: { offset: "Invalid" } } }, { status: 400 });
    });
    await expect(getEstimationCatalogue({ includeReadyNonActive: true })).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(requested).toHaveLength(1);
  });

  it("fails if a page reports more data but cannot advance", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: {
      items: [], pagination: { limit: 100, offset: 0, total: 1, hasMore: true }, ineligibleLineCount: 0
    } }));
    await expect(getEstimationCatalogue()).rejects.toThrow("pagination did not advance");
  });

  it("reads selected recommendation sources in sorted batches of at most 50", async () => {
    const requests: string[][] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input), "http://localhost");
      expect(url.pathname).toMatch(/\/estimation\/catalogue\/recommendations$/);
      expect(url.searchParams.get("includeReadyNonActive")).toBe("true");
      const ids = url.searchParams.get("mainLineIds")?.split(",") ?? [];
      requests.push(ids);
      return Response.json({ data: { sources: ids.map((mainLineId) => ({ mainLineId, available: true, revisionId: `revision-${mainLineId}`, revisionVersion: 1, itemVersion: 1, rules: [], guidance: [] })) } });
    });
    const ids = Array.from({ length: 51 }, (_, index) => `line-${String(index).padStart(2, "0")}`);
    const result = await getEstimationCatalogueRecommendations([...ids].reverse().concat(ids[0]!));
    expect(requests.map((item) => item.length)).toEqual([50, 1]);
    expect(requests.flat()).toEqual(ids);
    expect(result.sources.map((item) => item.mainLineId)).toEqual(ids);
  });
});
