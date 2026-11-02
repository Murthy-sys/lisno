import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/client";
import { downloadEstimateRevisionPdf, estimateRevisionKeys, estimateRevisionLabel, getEstimateRevision, getEstimateRevisions } from "./estimateRevisionsApi";

afterEach(() => vi.restoreAllMocks());

describe("staff estimate revision API", () => {
  it("keeps opaque cursors and route identities encoded, with abortable read-only requests", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { items: [], pagination: { limit: 20, nextCursor: null } } }));
    const signal = new AbortController().signal;
    await getEstimateRevisions("estimate/a", { cursor: "opaque+cursor=/", limit: 20, signal });
    const [url, options] = fetch.mock.calls[0]!;
    expect(String(url)).toContain("/estimates/estimate%2Fa/revisions?cursor=opaque%2Bcursor%3D%2F&limit=20");
    expect(options).toMatchObject({ method: "GET", signal });
    expect(options?.body).toBeUndefined();
  });

  it("binds detail and original PDF reads to the same nested revision, never the current PDF route", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { id: "round/a", estimateId: "estimate/a" } }));
    const signal = new AbortController().signal;
    await getEstimateRevision("estimate/a", "round/a", signal);
    expect(String(fetch.mock.calls[0]![0])).toContain("/estimates/estimate%2Fa/revisions/round%2Fa");
    expect(fetch.mock.calls[0]![1]?.signal).toBe(signal);
    const artifact = { blob: new Blob(["stored revision"], { type: "application/pdf" }), filename: "estimate-r2.pdf" };
    const download = vi.spyOn(apiClient, "getBlob").mockResolvedValue(artifact);
    expect(await downloadEstimateRevisionPdf("estimate/a", "round/a", signal)).toBe(artifact);
    expect(download).toHaveBeenCalledWith("/estimates/estimate%2Fa/revisions/round%2Fa/pdf", { signal, showGlobalLoader: false });
  });

  it("isolates actor, estimate, and revision query data under the shared invalidation prefix", () => {
    expect(estimateRevisionKeys.list("estimate-a", "sales-a")).not.toEqual(estimateRevisionKeys.list("estimate-a", "sales-b"));
    expect(estimateRevisionKeys.detail("estimate-a", "round-1", "sales-a")).not.toEqual(estimateRevisionKeys.detail("estimate-b", "round-1", "sales-a"));
    expect(estimateRevisionKeys.detail("estimate-a", "round-1", "sales-a")).not.toEqual(estimateRevisionKeys.detail("estimate-a", "round-2", "sales-a"));
    expect(estimateRevisionKeys.detail("estimate-a", "round-1", "sales-a").slice(0, 2)).toEqual(estimateRevisionKeys.all);
  });

  it("uses the stored generation and does not invent a pre phase for old revisions", () => {
    expect(estimateRevisionLabel({ phase: "pre", sendGeneration: 3 })).toBe("Pre-estimate · R3");
    expect(estimateRevisionLabel({ phase: "post", sendGeneration: 7 })).toBe("Estimate · R7");
    expect(estimateRevisionLabel({ sendGeneration: 1 })).toBe("Estimate · R1");
  });
});
