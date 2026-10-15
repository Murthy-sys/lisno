import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import type { ReactNode } from "react";
import { AUTHORIZATION_POLICY_VERSION, PERMISSION_CODES } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiNetworkError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { pickImage, recoverPendingImageSelection, releaseSelectedAsset } from "../../platform/files";
import { ExecutionDetailPanel } from "./ExecutionDetailPanel";
import { ExecutionPolicyPanel } from "./ExecutionPolicyPanel";
import { ExecutionWorkspace } from "./ExecutionWorkspace";
import { ProjectVendorAccessPanel } from "./ProjectVendorAccessPanel";
import { useDeliveryContext, type DeliveryContext } from "./executionNative";
import { WorkEvidence } from "../vendor-work/WorkEvidence";
import { VendorApprovedOrder } from "../vendor-work/VendorApprovedOrder";
import { VendorWorkSubmission } from "../vendor-work/VendorWorkSubmission";
import { VendorWorkWorkspace } from "../vendor-work/VendorWorkWorkspace";
import { SiteCompletionPanel } from "../completion/SiteCompletionPanel";
import { ClientVendorWorkReviews } from "../completion/ClientVendorWorkReviews";
import { ProjectCompletionDetail } from "../completion/ProjectCompletionWorkspace";
jest.mock("../../platform/files", () => ({ ...jest.requireActual("../../platform/files"), pickImage: jest.fn(), capturePhoto: jest.fn(), recoverPendingImageSelection: jest.fn(), releaseSelectedAsset: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: jest.fn() }));
const get = jest.fn(); const post = jest.fn(); const patch = jest.fn(); const put = jest.fn(); const upload = jest.fn(); const download = jest.fn(); const refresh = jest.fn(async () => undefined);
const session = (role = "site_manager", permissions: readonly string[] = PERMISSION_CODES) => ({ user: { id: `${role}-a`, role }, authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions } }) as unknown as AuthenticatedSession;
const staff = session("site_manager", ["execution.tracker.read", "execution.staff.manage", "execution.policy.manage", "execution.access.retry", "procurement.progress.read", "procurement.site_completion.manage", "procurement.vendor_work.media.read"]);
const vendor = session("vendor"); const client = session("client"); const admin = session("super_admin");
const work = { id: "work/a", projectId: "project-a", projectName: "Project A", vendorId: "vendor-a", vendorName: "Vendor A", orderId: "order-a", orderNumber: "PO-17", orderRevision: 2, lineId: "order-line/a", sourceLineItemKey: "estimate-line/a", itemName: "Wardrobe", roomName: "Bedroom 1", description: "Measured wardrobe", scopeType: "supply_and_execution", mainBasketId: "basket-a", mainBasketName: "Carpentry", subBasketId: "sub-a", subBasketName: "Storage", mainLineId: "main-line/a", sourceAvailable: true, quantityMilliUnits: 2500, uomCode: "sqft", originalTargetDate: "2026-11-02", timezone: "Asia/Kolkata", tracking: "tracked", legacyStatus: "in_progress", version: 7, executionRound: 2, status: "in_progress", progress: 25, latestNote: "", latestReportAt: null, latestVendorReport: null, acknowledgedAt: null, proposedSchedule: null, schedule: null, reportingStartsOn: null, hold: null, submission: null, verification: null, evidenceExemption: null, imageIds: [], daily: { localDate: "2026-10-14", dueAt: null, state: "not_due", reportedAt: null }, flags: [], nextOwner: "vendor", allowedActions: ["report"], canSubmitToClient: false };
const counts = { total: 1, open: 1, reported: 0, verified: 0, clientAccepted: 0, missing: 0, blocked: 0, overdue: 0, awaitingVerification: 0, setupRequired: 0 };
const site = { projectId: "project-a", projectStatus: "active", version: 4, progress: 70, note: "Current progress", status: "draft", currentRound: 1, canSubmit: false, needsReverification: false, blockers: [], review: null };
const completion = { projectId: "project-a", projectName: "Project A", projectStatus: "active", completionAuthority: "vendor_client", completionAuthorityVersion: 12, estimateSource: { estimateId: "estimate-a", estimateVersion: 7, estimateReviewRoundId: "round-a" }, scope: [{ sourceLineItemKey: "source/line-a", sourceSectionId: "section-a", roomName: "Kitchen", specification: "Hob", amountPaise: 289129, approvedOrderLineCount: 0, exception: null, status: "uncovered" }], approvedOrders: [], vendorWork: { totalAssignments: 2, approvedAssignments: 2, pendingAssignments: 0, openReviews: 0 }, siteCompletion: { status: "client_approved", progress: 100, round: 2, reviewId: "site-review-a" }, blockers: [{ code: "SCOPE_UNCOVERED", message: "Resolve the Hob source line." }], pendingOwner: "super_admin", readyForCompletion: false, completedAt: null, completionDecisionId: null };
function Context({ user = staff, children }: { user?: AuthenticatedSession; children: (context: DeliveryContext) => ReactNode }) { const c = useDeliveryContext(user); return <>{children(c)}</>; }
async function mount(node: ReactNode) { const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } }); const view = await render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>); return { ...view, cache }; }
beforeEach(() => {
  jest.clearAllMocks(); get.mockReset(); post.mockReset(); patch.mockReset(); put.mockReset(); upload.mockReset(); download.mockReset();
  jest.mocked(useInvalidateEvent).mockReturnValue(refresh); jest.mocked(recoverPendingImageSelection).mockResolvedValue({ status: "none" }); jest.mocked(releaseSelectedAsset).mockResolvedValue(undefined);
  jest.mocked(useConfiguredRuntime).mockReturnValue({ environment: { environment: { id: "test" }, status: "ready", generation: 1 }, session: { generation: 1 }, runtime: { api: { authenticated: { get, post, patch, put, delete: jest.fn() } }, transfers: { upload, download } } } as unknown as ReturnType<typeof useConfiguredRuntime>);
});
it("submits native daily reports with exact execution version and retries unknown results without rebuilding", async () => {
  get.mockResolvedValue(work); post.mockRejectedValueOnce(new ApiNetworkError(new Error("offline"))).mockResolvedValueOnce({ ...work, version: 8 });
  const view = await mount(<Context user={vendor}>{c => <ExecutionDetailPanel context={c} assignmentId="work/a" vendor />}</Context>);
  await fireEvent.changeText(await view.findByLabelText("Vendor reported progress (%)"), "40"); await fireEvent.changeText(view.getByLabelText("Work note"), "Frame fitted to measured opening");
  await fireEvent.press(view.getByRole("button", { name: "Save daily report" })); await fireEvent.press(await view.findByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2)); expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
  expect(post.mock.calls[0]).toEqual(["/vendor/work/work%2Fa/execution", expect.objectContaining({ action: "report", expectedVersion: 7, progress: 40, note: "Frame fitted to measured opening", imageIds: [], idempotencyKey: expect.any(String) })]);
});
it("verifies only the current submitted execution round", async () => {
  const submitted = { ...work, progress: 100, status: "awaiting_verification", allowedActions: ["verify", "request_changes"], submission: { id: "submission/round2", note: "Ready", imageIds: [], submittedAt: "2026-10-14T06:00:00Z", version: 3 } };
  get.mockResolvedValue(submitted); post.mockResolvedValue({ ...submitted, version: 8 });
  const view = await mount(<Context>{c => <ExecutionDetailPanel context={c} assignmentId="work/a" expectedProjectId="project-a" />}</Context>);
  await fireEvent.press(await view.findByRole("button", { name: "Verify completion" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-a/execution/work%2Fa", expect.objectContaining({ action: "verify", expectedVersion: 7, submissionId: "submission/round2" })));
});
it("preserves a dirty report and prevents sending after a newer server version arrives", async () => {
  get.mockResolvedValue(work); const view = await mount(<Context user={vendor}>{c => <ExecutionDetailPanel context={c} assignmentId="work/a" vendor />}</Context>);
  await fireEvent.changeText(await view.findByLabelText("Work note"), "My unsaved report");
  await act(() => view.cache.setQueryData(["test", "vendor-a", "operations", "delivery", "work", "work/a"], { ...work, version: 8 }));
  await view.findByText("The assignment changed. Discard your draft and review the current action before continuing."); expect(view.getByLabelText("Work note").props.value).toBe("My unsaved report");
  expect(view.getByRole("button", { name: "Save daily report" }).props.accessibilityState.disabled).toBe(true); expect(post).not.toHaveBeenCalled();
});
it("keeps a conflicted execution draft until the user reloads and discards the stale version", async () => {
  let current = work; get.mockImplementation(async () => current); post.mockRejectedValue(new ApiError(409, "EXECUTION_VERSION_CONFLICT", "The assignment changed"));
  const view = await mount(<Context user={vendor}>{c => <ExecutionDetailPanel context={c} assignmentId="work/a" vendor />}</Context>);
  await fireEvent.changeText(await view.findByLabelText("Work note"), "Unsaved completion update"); await fireEvent.changeText(view.getByLabelText("Vendor reported progress (%)"), "60"); await fireEvent.press(view.getByRole("button", { name: "Save daily report" }));
  await view.findByRole("button", { name: "Reload current data" }); expect(view.queryByRole("button", { name: "Retry same request" })).toBeNull(); expect(view.getByLabelText("Work note").props.value).toBe("Unsaved completion update");
  current = { ...work, version: 8 }; await fireEvent.press(view.getByRole("button", { name: "Reload current data" })); await view.findByText("The assignment changed. Discard your draft and review the current action before continuing.");
  expect(view.getByRole("button", { name: "Save daily report" }).props.accessibilityState.disabled).toBe(true); expect(post).toHaveBeenCalledTimes(1);
});
it("does not fetch execution data for a session without the canonical read permission", async () => {
  const view = await mount(<ExecutionWorkspace session={session("designer", [])} />); await view.findByText("Execution unavailable"); expect(get).not.toHaveBeenCalled();
});
it("clears denied detail and rejects mismatched project identity before exposing actions", async () => {
  get.mockResolvedValue({ ...work, projectId: "other-project", itemName: "Private other project" });
  const view = await mount(<Context>{c => <ExecutionDetailPanel context={c} assignmentId="work/a" expectedProjectId="project-a" />}</Context>);
  await view.findByText("The response does not match the selected record. Refresh before continuing."); expect(view.queryByText("Private other project")).toBeNull(); expect(view.queryByRole("button", { name: "Save daily report" })).toBeNull();
  get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "No longer assigned")); await act(() => view.cache.invalidateQueries()); await view.findByText("Assignment unavailable"); expect(view.queryByText("Private other project")).toBeNull();
});
it("edits reporting policy natively with observed version and reason", async () => {
  const policy = { projectId: "project-a", version: 3, timezone: "Asia/Kolkata", reminderTime: "09:00", deadlineTime: "18:00", escalationTime: "19:00", effectiveDate: "2026-11-02" };
  get.mockResolvedValue(policy); put.mockResolvedValue({ ...policy, version: 4 });
  const view = await mount(<Context>{c => <ExecutionPolicyPanel context={c} projectId="project-a" />}</Context>);
  await fireEvent.changeText(await view.findByLabelText("Daily reminder (HH:MM)"), "08:30"); await fireEvent.changeText(view.getByLabelText("Reason for schedule change"), "Earlier access agreed with site team"); await fireEvent.press(view.getByRole("button", { name: "Save reporting schedule" }));
  await waitFor(() => expect(put).toHaveBeenCalledWith("/projects/project-a/execution-policy", expect.objectContaining({ expectedVersion: 3, reminderTime: "08:30", reason: "Earlier access agreed with site team" })));
});
it("uploads one private work image with the vendor task version and reuses its exact unknown request", async () => {
  const task = { id: "work/a", projectId: "project-a", version: 11 }; get.mockResolvedValue(task);
  jest.mocked(pickImage).mockResolvedValue({ status: "selected", asset: { uri: "file:///private/photo.png", name: "photo.png", mimeType: "image/png", size: 250, width: 30, height: 30 } });
  upload.mockImplementationOnce(() => ({ result: Promise.reject(new ApiNetworkError(new Error("offline"))) })).mockImplementationOnce(() => ({ result: Promise.resolve({ ...task, version: 12 }) }));
  const view = await mount(<Context user={vendor}>{c => <WorkEvidence context={c} projectId="project-a" assignmentId="work/a" imageIds={[]} canUpload />}</Context>);
  await fireEvent.press(await view.findByRole("button", { name: "Choose work photo" })); await fireEvent.press(await view.findByRole("button", { name: "Upload work photo" })); await fireEvent.press(await view.findByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2)); expect(upload.mock.calls[0]?.[0]).toMatchObject({ path: "/vendor/work/work%2Fa/images", fieldName: "image", parameters: { expectedVersion: "11", idempotencyKey: expect.any(String) } }); expect(upload.mock.calls[0]?.[0].parameters).toEqual(upload.mock.calls[1]?.[0].parameters);
});
it("opens authenticated private evidence and releases the artifact on close", async () => {
  const release = jest.fn(async () => undefined); const cancel = jest.fn(); download.mockReturnValue({ result: Promise.resolve({ uri: "file:///private/evidence.jpg", release }), cancel });
  const view = await mount(<Context user={client}>{c => <WorkEvidence context={c} projectId="project-a" assignmentId="work/a" imageIds={["photo/1"]} />}</Context>);
  await fireEvent.press(await view.findByRole("button", { name: "View photo 1" })); await view.findByLabelText("Private work completion evidence"); expect(download).toHaveBeenCalledWith(expect.objectContaining({ path: "/projects/project-a/vendor-work/work%2Fa/images/photo%2F1" }));
  await fireEvent.press(view.getByRole("button", { name: "Close work photo" })); await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
});
it("sends verified work to Client using the legacy task CAS version", async () => {
  get.mockResolvedValue({ id: work.id, projectId: work.projectId, version: 23 }); post.mockResolvedValue({ id: "review-a", assignmentId: work.id, projectId: work.projectId });
  const view = await mount(<Context user={vendor}>{c => <VendorWorkSubmission context={c} work={{ ...work, canSubmitToClient: true } as never} />}</Context>);
  await fireEvent.changeText(await view.findByLabelText("Note for Client"), "Please inspect the verified finish"); await fireEvent.press(view.getByRole("button", { name: "Send verified work to Client" }));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/vendor/work/work%2Fa/submit", expect.objectContaining({ expectedVersion: 23, note: "Please inspect the verified finish" })));
});
it("retains unknown invitation commands with every version and respects server readiness", async () => {
  const item = { id: "intent-a", version: 5, projectId: "project-a", vendorId: "vendor-a", vendorName: "Vendor A", vendorVersion: 3, orderId: "order-a", orderLabel: "PO-17", orderVersion: 9, revision: 2, access: "setup_pending", invitation: { id: "invite-a", version: 4, status: "pending", expiresAt: "2026-11-02T00:00:00Z" }, state: "failed", readiness: { state: "ready" }, availableActions: ["resend_invitation"], canRetry: true };
  get.mockResolvedValue({ items: [item], total: 1, readiness: { state: "ready" } }); post.mockRejectedValueOnce(new ApiNetworkError(new Error("offline"))).mockResolvedValueOnce({ items: [item] });
  const view = await mount(<Context>{c => <ProjectVendorAccessPanel context={c} projectId="project-a" />}</Context>);
  await fireEvent.press(await view.findByRole("button", { name: "Resend invitation for PO-17" })); await fireEvent.press(await view.findByRole("button", { name: "Retry same request" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2)); expect(post.mock.calls[0]).toEqual(post.mock.calls[1]); expect(post.mock.calls[0]?.[1]).toMatchObject({ expectedOrderVersion: 9, expectedOrderRevision: 2, expectedVendorVersion: 3, invitationId: "invite-a", expectedInvitationVersion: 4, expectedAccessVersion: 5 });
});
it("requires saved site progress before sending completion and preserves the updated CAS", async () => {
  let current = site; get.mockImplementation(async () => current); patch.mockImplementation(async (_path, body) => { current = { ...site, progress: body.progress, note: body.note, version: 5, canSubmit: true }; return current; }); post.mockResolvedValue({ ...site, version: 6, status: "pending_client" });
  const view = await mount(<Context>{c => <SiteCompletionPanel context={c} projectId="project-a" />}</Context>);
  await fireEvent.changeText(await view.findByLabelText("Project execution progress (%)"), "100"); expect(view.getByRole("button", { name: "Complete and send to Client" }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(view.getByRole("button", { name: "Save 100% progress" })); await waitFor(() => expect(view.getByRole("button", { name: "Complete and send to Client" }).props.accessibilityState.disabled).toBe(false)); await fireEvent.press(view.getByRole("button", { name: "Complete and send to Client" }));
  expect(patch).toHaveBeenCalledWith("/projects/project-a/site-completion/progress", expect.objectContaining({ expectedVersion: 4, progress: 100 })); expect(post).toHaveBeenCalledWith("/projects/project-a/site-completion/submit", expect.objectContaining({ expectedVersion: 5 }));
});
it("Client completion decisions use review version rather than parent completion version", async () => {
  const completionReview = { ...site, version: 21, progress: 100, status: "pending_client", review: { id: "site-review-a", projectId: "project-a", version: 3, round: 2, status: "pending", progress: 100, note: "All verified", submittedAt: "2026-10-14T06:00:00Z", sections: [], decision: null } }; get.mockResolvedValue(completionReview); post.mockResolvedValue(completionReview);
  const view = await mount(<Context user={client}>{c => <SiteCompletionPanel context={c} projectId="project-a" />}</Context>);
  await fireEvent.press(await view.findByRole("button", { name: "Request completion changes" })); await fireEvent.changeText(view.getByLabelText("Describe completion changes needed"), "Kitchen drawer needs alignment"); await fireEvent.press(view.getByRole("button", { name: "Send changes to Site Manager" }));
  expect(post).toHaveBeenCalledWith("/clients/projects/project-a/site-completion/decision", expect.objectContaining({ expectedVersion: 3, decision: "request_changes", reason: "Kitchen drawer needs alignment" }));
});
it("Client work decisions require a reason and target the exact review and assignment", async () => {
  const review = { id: "review/a", projectId: "project-a", assignmentId: "work/a", version: 4, round: 2, status: "pending", itemName: "Wardrobe", roomName: "Bedroom 1", sectionLabel: "Carpentry", description: "Measured wardrobe", note: "Please inspect", imageIds: [], progress: 100, submittedAt: "2026-10-14T06:00:00Z", decision: null }; get.mockResolvedValue({ items: [review], total: 1, pendingTotal: 1, limit: 25, offset: 0 }); post.mockResolvedValue(review);
  const view = await mount(<Context user={client}>{c => <ClientVendorWorkReviews context={c} projectId="project-a" />}</Context>);
  await fireEvent.press(await view.findByRole("button", { name: "Request changes to Wardrobe" })); expect(view.getByRole("button", { name: "Send changes for Wardrobe" }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.changeText(view.getByLabelText("Changes needed for Wardrobe"), "Align the top hinge"); await fireEvent.press(view.getByRole("button", { name: "Send changes for Wardrobe" }));
  expect(post).toHaveBeenCalledWith("/clients/projects/project-a/vendor-work-reviews/review%2Fa/decision", expect.objectContaining({ expectedVersion: 4, reason: "Align the top hinge", decision: "request_changes" }));
});
it("records a reasoned scope exception with stable estimate line and authority version", async () => {
  get.mockImplementation(async path => path.endsWith("/site-completion") ? { ...site, progress: 100, status: "client_approved" } : completion); post.mockResolvedValue({ projectId: "project-a", sourceLineItemKey: "source/line-a" });
  const view = await mount(<Context user={admin}>{c => <ProjectCompletionDetail context={c} projectId="project-a" />}</Context>);
  expect((await view.findByRole("button", { name: "Mark project completed" })).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(view.getByRole("button", { name: "Record scope decision for Hob" })); await fireEvent.changeText(view.getByLabelText("Reason for scope decision (at least 10 characters)"), "Client supplied the hob separately"); await fireEvent.press(view.getByRole("button", { name: "Record scope decision" }));
  expect(post).toHaveBeenCalledWith("/admin/projects/project-a/scope-exceptions", expect.objectContaining({ sourceLineItemKey: "source/line-a", expectedAuthorityVersion: 12, reason: "Client supplied the hob separately" }));
});
it("final completion is server gated and retries the same unknown closure", async () => {
  const ready = { ...completion, readyForCompletion: true, blockers: [] }; get.mockImplementation(async path => path.endsWith("/site-completion") ? { ...site, progress: 100, status: "client_approved" } : ready); post.mockRejectedValueOnce(new ApiNetworkError(new Error("offline"))).mockResolvedValueOnce({ projectId: "project-a", completedAt: "2026-10-14T06:00:00Z" });
  const view = await mount(<Context user={admin}>{c => <ProjectCompletionDetail context={c} projectId="project-a" />}</Context>);
  await fireEvent.press(await view.findByRole("button", { name: "Mark project completed" })); await fireEvent.press(await view.findByRole("button", { name: "Retry same request" })); await waitFor(() => expect(post).toHaveBeenCalledTimes(2)); expect(post.mock.calls[0]).toEqual(post.mock.calls[1]); expect(post.mock.calls[0]?.[1]).toMatchObject({ expectedAuthorityVersion: 12 });
});
it("shows server issued order paise without reconstructing financial totals", async () => {
  get.mockResolvedValue({ id: "order-a", projectId: "project-a", orderNumber: "PO-17", revision: 2, approvedAt: "2026-10-14T06:00:00Z", vendor: { id: "vendor-a", name: "Vendor A", code: "VA" }, lines: [], totals: { netPaise: 289129, gstPaise: 52043, totalPaise: 341172 }, terms: "Deliver to site" });
  const view = await mount(<Context user={vendor}>{c => <VendorApprovedOrder context={c} orderId="order-a" projectId="project-a" />}</Context>); await view.findByText("Total: ₹3,411.72"); await view.findByText("Before GST: ₹2,891.29");
});
it("loads subsequent execution project pages using the server offset", async () => {
  get.mockImplementation(async path => path.includes("offset=25") ? { items: [], total: 26, limit: 25, offset: 25 } : { items: [{ id: "project-a", name: "Project A", status: "active", counts }], total: 26, limit: 25, offset: 0 });
  const view = await mount(<ExecutionWorkspace session={staff} />); await fireEvent.press(await view.findByRole("button", { name: "Next page" })); await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining("offset=25"), expect.anything()));
});
it("guards vendor tab navigation while an execution draft is dirty", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  get.mockImplementation(async path => path.startsWith("/execution/work/") ? work : path.startsWith("/vendor/work/execution") ? { project: null, projectCounts: null, items: [work], total: 1, limit: 25, offset: 0, counts, policy: null, canManagePolicy: false } : { id: work.id, projectId: work.projectId, version: 3 });
  const view = await mount(<VendorWorkWorkspace session={vendor} workId="work/a" />); await fireEvent.changeText(await view.findByLabelText("Work note"), "Unsaved report"); await fireEvent.press(view.getByRole("button", { name: "Issued work orders" })); expect(alert).toHaveBeenCalledWith("Unsaved changes", expect.any(String), expect.any(Array)); expect(view.getByLabelText("Work note").props.value).toBe("Unsaved report"); alert.mockRestore();
});
