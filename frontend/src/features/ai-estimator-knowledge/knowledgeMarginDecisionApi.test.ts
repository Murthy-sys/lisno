import { afterEach, expect, it, vi } from "vitest";
import { createKnowledgeApi } from "../../../../shared/knowledge/knowledgeApi";
import type { MarginCommitInput } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { apiClient } from "../../api/client";

afterEach(() => vi.restoreAllMocks());

it("sends the manually edited margin bound with its tier section save", async () => {
  const api = createKnowledgeApi(apiClient);
  const put = vi.spyOn(apiClient, "put").mockResolvedValue({});
  const update = {
    expectedVersion: 3, expectedAggregateVersion: 7, modeTier: "premium",
    payload: { subVendorMarginBps: 3500 },
    marginEdits: [{ mode: "sub_vendor", key: "margin", bound: "maximumBps" }]
  } as const;
  await api.updateKnowledgeSection("line", "draft", "advanced", update);
  expect(put).toHaveBeenCalledExactlyOnceWith("/admin/ai-estimator-knowledge/main-lines/line/revisions/draft/sections/advanced", update);
});

it("addresses the selected Sub-Basket and sends approval and direct edits to different operations", async () => {
  const api = createKnowledgeApi(apiClient);
  const get = vi.spyOn(apiClient, "get").mockResolvedValue({});
  const post = vi.spyOn(apiClient, "post").mockResolvedValue({});
  const path = "/admin/ai-estimator-knowledge/baskets/b%2F1/sub-baskets/s%2F1/margins";
  const input: MarginCommitInput = {
    operationId: "operation-1", versionToken: "a".repeat(64), reviewToken: "b".repeat(64),
    decision: { kind: "approve", candidate: { tier: "premium", mode: "sub_vendor", mainLineId: "line-1" } }
  };
  const preview = { versionToken: input.versionToken, decision: input.decision };
  await api.getKnowledgeMarginMatrix("b/1", "s/1");
  expect(get).toHaveBeenCalledExactlyOnceWith(path + "/matrix?inHouseScope=sub_basket", { showGlobalLoader: false });
  await api.previewKnowledgeMarginDecision("b/1", "s/1", preview);
  await api.commitKnowledgeMarginDecision("b/1", "s/1", input);
  const edit: MarginCommitInput = { ...input, decision: { kind: "edit", changes: [
    { tier: "signature", mode: "pmc", ranges: [{ key: "margin", minimumBps: 1400, maximumBps: 1700 }] }
  ] } };
  await api.commitKnowledgeMarginDecision("b/1", "s/1", edit);
  const shared = { inHouseScope: "sub_basket" };
  expect(post.mock.calls).toEqual([
    [path + "/preview", { ...preview, ...shared }], [path + "/approve", { ...input, ...shared }], [path + "/defaults", { ...edit, ...shared }]
  ]);
  await api.getKnowledgeSubBasketMargins("b/1", "s/1", { modeTier: "premium", inHouseScope: "sub_basket" });
  expect(get).toHaveBeenLastCalledWith(path + "?modeTier=premium&inHouseScope=sub_basket", { showGlobalLoader: false });
  await api.getKnowledgeSubBasketMargins("b/1", "s/1");
  expect(get).toHaveBeenLastCalledWith(path, { showGlobalLoader: false });
});
