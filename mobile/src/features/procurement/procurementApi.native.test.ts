import { createProcurementBasketApi } from "./procurementBasketApi";
import { createPurchaseOrderApi } from "./purchaseOrderApi";
import { createProjectProcurementApi } from "./projectProcurementApi";
import { createVendorSuggestionsApi } from "./vendorSuggestionsApi";
import type { JsonApiClient } from "../../core/http/apiClient";
const get = jest.fn(); const post = jest.fn(); const put = jest.fn(); const patch = jest.fn(); const del = jest.fn();
const http = { get, post, put, patch, delete: del } as unknown as JsonApiClient["authenticated"];
beforeEach(() => jest.clearAllMocks());
it("rejects cross-project basket, item, preparation and order reads", async () => {
  get.mockResolvedValue({ projectId: "other", id: "basket", items: [{ projectId: "other" }] });
  await expect(createProcurementBasketApi(http).getProcurementBasket("mine", "basket")).rejects.toThrow("changed");
  await expect(createProcurementBasketApi(http).getProcurementBaskets("mine")).rejects.toThrow("another project");
  await expect(createProjectProcurementApi(http).getProjectProcurementItems("mine", "", 0)).rejects.toThrow("does not belong");
  await expect(createPurchaseOrderApi(http).getPurchaseOrderPreparation("mine")).rejects.toThrow("does not match");
  await expect(createPurchaseOrderApi(http).listPurchaseOrders("mine")).rejects.toThrow("does not match");
});
it("retains exact approved source, digest, line identity and CAS for project-only rate changes", async () => {
  const input = { sourceLineItemKey: "line/123", baseRatePaise: 12345, expectedVersion: 3, expectedEstimateSource: { estimateId: "e", estimateVersion: 8, estimateReviewRoundId: "round" }, expectedPreparationDigest: "digest", idempotencyKey: "same-request" };
  put.mockResolvedValue({ projectId: "project/1", mainBasketId: "basket/2", sourceLineItemKey: "line/123", estimateSource: input.expectedEstimateSource, projectRate: { version: 4, overridePaise: 12345 } });
  await createProcurementBasketApi(http).saveBasketBaseRate("project/1", "basket/2", input);
  expect(put).toHaveBeenCalledWith("/procurement/projects/project%2F1/baskets/basket%2F2/base-rate", input, {});
  put.mockResolvedValue({ projectId: "project/1", mainBasketId: "basket/2", sourceLineItemKey: "different", estimateSource: input.expectedEstimateSource });
  await expect(createProcurementBasketApi(http).saveBasketBaseRate("project/1", "basket/2", input)).rejects.toThrow("another basket line");
});
it("historical BOQ responses cannot become awardable or substitute another revision", async () => {
  get.mockResolvedValue({ enquiryId: "enquiry", boq: { id: "history" }, canAward: true });
  await expect(createProcurementBasketApi(http).getBasketEnquiryHistoryRevision("p", "b", "enquiry", "history", 20, 40)).rejects.toThrow("read-only");
  expect(get).toHaveBeenCalledWith(expect.stringContaining("bidOffset=20&counterofferOffset=40"), expect.anything());
});
it("pins approval decisions to the submitted revision and rejects missing identity", async () => {
  const api = createPurchaseOrderApi(http); const input = { decision: "approve" as const, reason: null, budgetOverrideReason: null, idempotencyKey: "decision-once" };
  const order = { id: "po", projectId: "p", version: 11, submittedRevisionId: "revision-3" } as Parameters<typeof api.decidePurchaseOrder>[0];
  await api.decidePurchaseOrder(order, input);
  expect(post).toHaveBeenCalledWith("/procurement/projects/p/purchase-orders/po/decision", { ...input, expectedVersion: 11, submittedRevisionId: "revision-3" });
  expect(() => api.decidePurchaseOrder({ ...order, submittedRevisionId: null }, input)).toThrow("unavailable");
});
it("rejects a vendor suggestion from another approved design source", async () => {
  get.mockResolvedValue({ project: { projectId: "p", estimateId: "e", estimateVersion: 6, designPlanVersion: 3 }, items: [{ projectId: "p", estimateId: "e", estimateVersion: 6, designPlanVersion: 2 }] });
  await expect(createVendorSuggestionsApi(http).getVendorSuggestions("p")).rejects.toThrow("approved design");
});
