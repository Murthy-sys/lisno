import type { JsonApiClient } from "../../core/http/apiClient";
import { createExecutionApi } from "./executionApi";
import { createVendorWorkApi, workImagePath, workUploadPath } from "../vendor-work/vendorWorkApi";
import { createCompletionApi } from "../completion/completionApi";
const get = jest.fn(); const post = jest.fn(); const patch = jest.fn(); const put = jest.fn();
const http = { get, post, patch, put } as unknown as JsonApiClient["authenticated"];
beforeEach(() => jest.clearAllMocks());
it("uses separate authenticated vendor/staff action routes and preserves exact commands", async () => {
  const api = createExecutionApi(http); const body = { action: "verify" as const, expectedVersion: 7, submissionId: "round/2", idempotencyKey: "same-attempt" };
  await api.command("work/1", "project/2", false, body); expect(post).toHaveBeenLastCalledWith("/projects/project%2F2/execution/work%2F1", body);
  await api.command("work/1", "project/2", true, body); expect(post).toHaveBeenLastCalledWith("/vendor/work/work%2F1/execution", body);
  await api.history("work/1", { limit: 25, offset: 50 }); expect(get).toHaveBeenLastCalledWith("/execution/work/work%2F1/history?limit=25&offset=50", { signal: undefined });
});
it("keeps escaped filters and portfolio scope with backend pagination", async () => {
  await createExecutionApi(http).projects({ q: "door & timber", projectScope: "current", limit: 25, offset: 25 });
  expect(get).toHaveBeenCalledWith("/execution/projects?q=door%20%26%20timber&projectScope=current&limit=25&offset=25", { signal: undefined });
});
it("pins vendor access to all invitation/order/access versions", async () => {
  const body = { action: "resend_invitation" as const, expectedVendorVersion: 3, invitationId: "invite/1", expectedInvitationVersion: 6, expectedOrderVersion: 8, expectedOrderRevision: 2, expectedAccessVersion: 4, idempotencyKey: "same-attempt" };
  await createExecutionApi(http).sendAccess("p/1", "po/1", body); expect(post).toHaveBeenCalledWith("/projects/p%2F1/vendor-access/orders/po%2F1/send", body);
  await createExecutionApi(http).retryAccess("p/1", "intent/1", { expectedVersion: 4, idempotencyKey: "same-retry" }); expect(post).toHaveBeenLastCalledWith("/projects/p%2F1/vendor-access/intent%2F1/retry", { expectedVersion: 4, idempotencyKey: "same-retry" });
});
it("keeps Client decisions on review versions and stable image identity", async () => {
  const body = { expectedVersion: 3, idempotencyKey: "same-review", decision: "request_changes" as const, reason: "Repair door finish" };
  await createVendorWorkApi(http).decide("p/1", "review/4", body); expect(post).toHaveBeenCalledWith("/clients/projects/p%2F1/vendor-work-reviews/review%2F4/decision", body);
  await createCompletionApi(http).decide("p/1", body); expect(post).toHaveBeenLastCalledWith("/clients/projects/p%2F1/site-completion/decision", body);
  expect(workImagePath("p/1", "work/2", "image/3")).toBe("/projects/p%2F1/vendor-work/work%2F2/images/image%2F3"); expect(workUploadPath("work/2")).toBe("/vendor/work/work%2F2/images");
});
it("uses observed authority version and stable source key for final closure and exceptions", async () => {
  const body = { sourceLineItemKey: "estimate-line/7", kind: "externally_fulfilled" as const, reason: "Client supplied this outside the order", expectedAuthorityVersion: 12, idempotencyKey: "same-exception" };
  await createCompletionApi(http).except("p/1", body); expect(post).toHaveBeenCalledWith("/admin/projects/p%2F1/scope-exceptions", body);
  await createCompletionApi(http).complete("p/1", { expectedAuthorityVersion: 13, idempotencyKey: "same-closure" }); expect(post).toHaveBeenLastCalledWith("/admin/projects/p%2F1/complete", { expectedAuthorityVersion: 13, idempotencyKey: "same-closure" });
});
