import { createProposalApi } from "./proposalApi";
import { proposalKnowledgeContext } from "./proposalKnowledgeContext";
import { proposalFixture, proposalHierarchyFixture, proposalSectionFixture } from "./proposal.fixtures";
import type { ProposalContext } from "./proposalRuntime";
import { ApiError } from "../../core/http/apiClient";
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));

function setup(scope: "admin" | "procurement" = "admin", current = proposalFixture({ status: "pending", requestId: "request-a", requestVersion: 5 })) {
  let detail = current;
  const get = jest.fn().mockImplementation(async (path: string) => path.includes("proposal-one?snapshot=") ? detail : path.includes("/hierarchy") ? { items: proposalHierarchyFixture(detail), pagination: { total: 2, offset: 0, limit: 100, hasMore: false } } : path.includes("/resources/resource-overview") ? proposalSectionFixture("overview", { uomId: "uom-a" }, detail) : path.includes("inherited-quality") ? { basketId: "parent-a", parameters: [], version: 3 } : { items: [], pagination: { total: 0, offset: 0, limit: 100, hasMore: false } });
  const put = jest.fn().mockImplementation(async () => ({ detail: { ...detail, version: detail.version + 1, requestVersion: detail.requestVersion! + 1 }, resource: { ...proposalSectionFixture("overview", { uomId: "uom-b" }, detail), version: 2 } }));
  const transport = { get, put, post: jest.fn(), patch: jest.fn(), delete: jest.fn() };
  const context = { api: createProposalApi(transport), transport, scope, actorId: "actor-a", scopeKey: "test:actor-a:1", ready: true, canRead: true, canUpdate: true, key: (...parts: unknown[]) => ["knowledge", "proposals", ...parts] } as unknown as ProposalContext;
  const hierarchy = proposalHierarchyFixture(current);
  const onSaved = jest.fn().mockImplementation(async result => { detail = result.detail; });
  const onAccessLost = jest.fn();
  const native = proposalKnowledgeContext({ context, snapshot: "current", getDetail: () => detail, getHierarchy: () => hierarchy, onSaved, onAccessLost, refresh: jest.fn(async () => undefined) });
  return { native, context, transport, onSaved, onAccessLost, detail: () => detail };
}

it("routes section writes only into isolated proposal resources with proposal and request CAS", async () => {
  const test = setup();
  const item = await test.native.api.getKnowledgeItem("line-proposal");
  const section = await test.native.api.getKnowledgeSection(item.mainLineId, item.draftRevisionId!, "overview");
  const saved = await test.native.api.updateKnowledgeSection(item.mainLineId, item.draftRevisionId!, "overview", { expectedVersion: section.version, expectedAggregateVersion: 1, applicability: "configured", payload: { uomId: "uom-b" } });
  expect(test.transport.put).toHaveBeenCalledWith("/admin/ai-estimator-knowledge/basket-proposals/proposal-one/main-lines/line-proposal/sections/overview", { expectedVersion: 1, expectedRequestVersion: 5, applicability: "configured", payload: { uomId: "uom-b" } });
  expect(saved.aggregateVersion).toBe(2);
  expect(test.onSaved).toHaveBeenCalledTimes(1);
  expect((await test.native.api.getKnowledgeItem("line-proposal")).version).toBe(2);
});

it("does not expose unrelated catalogue writes through native editors", async () => {
  const test = setup();
  await expect(test.native.api.createKnowledgeBasket({ name: "Wrong target" })).rejects.toThrow("unavailable inside a saved request");
  expect(test.transport.post).not.toHaveBeenCalled();
  expect(test.native.canCreate).toBe(false); expect(test.native.canLifecycle).toBe(false);
});

it("keeps inherited Quality read-only and prevents requester access to the internal Design tab", async () => {
  const base = proposalFixture({ target: { kind: "new_sub_basket", basketId: "parent-a" }, capabilities: { edit: true, review: false, revise: false, submit: true, decide: false, editQuality: false } });
  const test = setup("procurement", base);
  expect(test.native.readOnlyQuality).toBe(true); expect(test.native.supportsLegacyQuality).toBe(false); expect(test.native.showDesign).toBe(false);
  await expect(test.native.api.updateKnowledgeBasketQuality("parent-a", { expectedVersion: 3, parameters: [] })).rejects.toThrow("Inherited Main Basket Quality is read-only");
  expect(test.transport.put).not.toHaveBeenCalled();
  await expect(test.native.api.getKnowledgeItem("missing-line")).rejects.toThrow("unavailable");
});

it("rejects resource identity mismatch instead of reusing another line's section", async () => {
  const test = setup();
  test.transport.get.mockResolvedValueOnce({ ...proposalSectionFixture("overview"), parentId: "other-line" });
  await expect(test.native.api.getKnowledgeSection("line-proposal", "author-head:line-proposal", "overview")).rejects.toThrow("identity could not be verified");
});

it("freezes an uncertain section command and retries its original payload and CAS", async () => {
  const test = setup();
  test.transport.put.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Try again"));
  const original = { expectedVersion: 1, expectedAggregateVersion: 1, payload: { uomId: "uom-b" } };
  await expect(test.native.api.updateKnowledgeSection("line-proposal", "author-head:line-proposal", "overview", original)).rejects.toThrow("Try again");
  expect(test.native.saveOutcomeUnknown).toBe(true);
  await expect(test.native.api.updateKnowledgeSection("line-proposal", "author-head:line-proposal", "pricing", original)).rejects.toThrow("Retry the unconfirmed save");
  expect(test.transport.put).toHaveBeenCalledTimes(1);
  await test.native.api.updateKnowledgeSection("line-proposal", "author-head:line-proposal", "overview", { ...original, expectedAggregateVersion: 8, payload: { uomId: "another-uom" } });
  expect(test.transport.put.mock.calls[1]).toEqual(test.transport.put.mock.calls[0]);
  expect(test.native.saveOutcomeUnknown).toBe(false);
});

it("releases an uncertain command into explicit version-conflict review", async () => {
  const test = setup();
  test.transport.put.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "Try again")).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere"));
  const save = () => test.native.api.updateKnowledgeSection("line-proposal", "author-head:line-proposal", "overview", { expectedVersion: 1, expectedAggregateVersion: 1, payload: {} });
  await expect(save()).rejects.toThrow("Try again");
  await expect(save()).rejects.toThrow("Changed elsewhere");
  expect(test.native.saveOutcomeUnknown).toBe(false);
  expect(test.onSaved).not.toHaveBeenCalled();
});

it("removes the proposal editor after a section mutation loses access", async () => {
  const test = setup();
  test.transport.put.mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Access changed"));
  await expect(test.native.api.updateKnowledgeSection("line-proposal", "author-head:line-proposal", "overview", { expectedVersion: 1, expectedAggregateVersion: 1, payload: {} })).rejects.toThrow("Access changed");
  expect(test.onAccessLost).toHaveBeenCalledTimes(1);
  expect(test.native.saveOutcomeUnknown).toBe(false);
  expect(test.onSaved).not.toHaveBeenCalled();
});
