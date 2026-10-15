import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../core/http/apiClient";
import { pickDocument, releaseSelectedAsset } from "../../platform/files";
import { KnowledgeDetailProvider } from "../knowledge/knowledgeDetailUi";
import { useNativeWorkspace, type NativeContext } from "../admin/nativeWorkspace";
import { ReviewDetail, ReviewQueueWorkspace } from "./ReviewQueueWorkspace";
import { ReviewDecisionForm } from "./ReviewDecisionForm";
import { designReviewSchema, estimateReviewDetailSchema, sameReviewSource } from "./reviewModel";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null }));
jest.mock("../admin/nativeWorkspace", () => ({ ...jest.requireActual("../admin/nativeWorkspace"), useNativeWorkspace: jest.fn() }));
jest.mock("../documents/ProtectedDocumentViewer", () => ({ ProtectedDocumentViewer: () => null }));
jest.mock("../../platform/files", () => ({ ...jest.requireActual("../../platform/files"), pickDocument: jest.fn(), releaseSelectedAsset: jest.fn(async () => undefined) }));
const estimate = estimateReviewDetailSchema.parse({ id: "round-a", version: 6, sendGeneration: 2, project: { id: "project-a", name: "North residence" }, client: { name: "Client A", email: "client-a@example.test" }, estimate: { id: "estimate-a", version: 4, total: 145.67 }, assignedAdmin: { id: "admin-a", name: "Sales Manager A" }, deliveryStatus: "sent", deliveryAttemptCount: 2, deliveryAttemptedAt: "2026-10-02T00:00:00Z", deliveredAt: "2026-10-02T00:00:00Z", status: "pending", decision: null, proofAvailable: false, createdAt: "2026-10-01T00:00:00Z", pdf: { filename: "Submitted estimate A.pdf", mimeType: "application/pdf", byteSize: 2000, sha256: "synthetic-checksum" }, decisionSource: null, decisionNote: null, decidedAt: null, estimateSnapshot: { projectName: "North residence", clientName: "Client A", location: "Hyderabad", propertyType: "2BHK", lineItems: [{ id: "line-a", catalogueId: "catalogue-a", roomName: "Bedroom 2", specification: "Wardrobe finish", unit: "sqm", quantity: 9.876, rate: 12.5, ratePaise: 1250, included: true, amount: 123.45, amountPaise: 12345 }], subtotal: 123.45, subtotalPaise: 12345, gst: 22.22, gstPaise: 2222, total: 145.67, totalPaise: 14567 } });
const design = designReviewSchema.parse({ id: "design-round-a", estimateId: "estimate-a", projectId: "project-a", projectName: "North residence", clientName: "Client A", designPlanVersion: 8, status: "pending", deliveryStatus: "disabled", submittedAt: "2026-10-03T00:00:00Z", version: 3, attachmentNames: ["Bedroom plan.pdf", "Kitchen plan.png"], canDecide: true, decision: null });
const page = (items: unknown[], total = items.length, offset = 0) => ({ items, pagination: { total, limit: 20, offset, hasMore: offset + items.length < total } });
function setup() {
  const get = jest.fn(); const post = jest.fn(); const uploadWork = jest.fn(); const upload = jest.fn(input => ({ result: uploadWork(input) })); const share = jest.fn(async () => undefined); const release = jest.fn(async () => undefined); const download = jest.fn(() => ({ result: Promise.resolve({ share, release }) }));
  const c = { http: { get, post }, transfers: { download, upload }, session: { user: { id: "admin-a", role: "admin" } }, scope: "test:admin-a", ready: true, can: jest.fn(() => true), key: (...parts: unknown[]) => ["test", "admin-a", "estimate-responses", ...parts], refresh: jest.fn(async () => undefined), guards: { current: new Map() }, navigate: (action: () => void) => action() } as unknown as NativeContext;
  jest.mocked(useNativeWorkspace).mockReturnValue(c); jest.mocked(pickDocument).mockResolvedValue({ status: "selected", asset: { uri: "file:///synthetic/proof.pdf", name: "Client proof.pdf", mimeType: "application/pdf", sizeBytes: 1000 } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  const wrap = (node: React.ReactNode) => <QueryClientProvider client={client}><KnowledgeDetailProvider>{node}</KnowledgeDetailProvider></QueryClientProvider>;
  return { c, get, post, upload, uploadWork, download, share, release, wrap, show: (node: React.ReactNode) => render(wrap(node)) };
}
it("shows immutable submitted snapshot prices and releases exact private PDF downloads", async () => {
  const t = setup(); t.get.mockResolvedValue(estimate); await t.show(<ReviewDetail context={t.c} kind="estimate" roundId="round-a" />); await screen.findByText("Immutable estimate version 4"); expect(screen.getByText("Total: ₹145.67")).toBeTruthy(); expect(screen.getByText("Rate: ₹12.50 · Amount: ₹123.45")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Download Submitted estimate A.pdf" })); await waitFor(() => expect(t.release).toHaveBeenCalledTimes(1)); expect(t.download).toHaveBeenCalledWith(expect.objectContaining({ path: "/admin/estimate-client-response-tasks/round-a/pdf" })); expect(t.share).toHaveBeenCalledTimes(1);
});
it("rejects a response returned under a different immutable round identity", async () => {
  const t = setup(); t.get.mockResolvedValue({ ...estimate, id: "round-b" }); await t.show(<ReviewDetail context={t.c} kind="estimate" roundId="round-a" />); await screen.findByText("The immutable estimate review identity could not be verified."); expect(screen.queryByText("North residence")).toBeNull(); expect(t.upload).not.toHaveBeenCalled();
});
it("paginates estimate queues using the server total and exact offset", async () => {
  const t = setup(); t.get.mockImplementation(async (path: string) => page([estimate], 43, path.includes("offset=20") ? 20 : 0)); await t.show(<ReviewQueueWorkspace kind="estimate" session={t.c.session} />); await screen.findByText("1–20 of 43"); await fireEvent.press(screen.getByRole("button", { name: "Next page" })); await screen.findByText("21–40 of 43"); expect(t.get).toHaveBeenCalledWith("/admin/estimate-client-response-tasks?status=pending&limit=20&offset=20", expect.anything());
});
it("paginates Design arrays without unsupported server pagination fields", async () => {
  const t = setup(); t.get.mockResolvedValue(Array.from({ length: 21 }, (_, i) => ({ ...design, id: `round-${i}`, projectName: `Project ${i}` }))); await t.show(<ReviewQueueWorkspace kind="design" session={t.c.session} />); await screen.findByText("1–20 of 21"); await fireEvent.press(screen.getByRole("button", { name: "Next page" })); await screen.findByText("21–21 of 21"); expect(t.get).toHaveBeenCalledWith("/admin/design-plan-response-tasks?status=pending", expect.anything()); expect(t.get.mock.calls.every(call => !String(call[0]).includes("limit="))).toBe(true);
});
it("shows Design submission attachments and retries the same review email version", async () => {
  const t = setup(); t.get.mockResolvedValue([design]); t.post.mockResolvedValue({ ...design, deliveryStatus: "sent", version: 4 }); await t.show(<ReviewDetail context={t.c} kind="design" roundId={design.id} />); await screen.findByRole("button", { name: "Download Bedroom plan.pdf" }); await fireEvent.press(screen.getByRole("button", { name: "Download Kitchen plan.png" })); await waitFor(() => expect(t.download).toHaveBeenCalledWith(expect.objectContaining({ path: "/admin/design-plan-response-tasks/design-round-a/attachments/1" })));
  await fireEvent.press(screen.getByRole("button", { name: "Retry design review email" })); await waitFor(() => expect(t.post).toHaveBeenCalledWith("/admin/design-plan-response-tasks/design-round-a/email/retry", { expectedVersion: 3 }));
});
it("shows recorded design decision actor, role and proof without mutable decision controls", async () => {
  const t = setup(); t.get.mockResolvedValue([{ ...design, status: "approved", decision: { action: "approve", source: "admin_proof", performedById: "admin-b", performedByName: "Sales Manager B", performedByRole: "admin", performedAt: "2026-10-04T00:00:00Z", note: "Confirmed by Client", onBehalfOfClient: true, proof: { filename: "Approved proof.png", mimeType: "image/png", byteSize: 100, uploadedAt: "2026-10-04T00:00:00Z" } } }]); await t.show(<ReviewDetail context={t.c} kind="design" roundId={design.id} />); await screen.findByText("Performed by: Sales Manager B · Sales Manager"); expect(screen.getByText("Recorded on behalf of the Client.")).toBeTruthy(); expect(screen.getByRole("button", { name: "Download Approved proof.png" })).toBeTruthy(); expect(screen.queryByRole("button", { name: "Record decision" })).toBeNull();
});
it("requires note for requested changes and captures exact estimate proof/version", async () => {
  const t = setup(); t.get.mockResolvedValue(estimate); t.uploadWork.mockResolvedValue({ estimate: { id: estimate.estimate.id }, clientReview: { id: estimate.id, version: 7, status: "changes_requested" } }); await t.show(<ReviewDecisionForm context={t.c} kind="estimate" task={estimate} current onReload={async () => undefined} />); await fireEvent.press(screen.getByRole("combobox", { name: "Client decision" })); await fireEvent.press(screen.getByRole("radio", { name: "Request changes" })); await fireEvent.press(screen.getByRole("button", { name: "Choose Client decision proof" })); await screen.findByRole("button", { name: "Proof: Client proof.pdf" }); await fireEvent.press(screen.getByRole("button", { name: "Record decision" })); expect(t.upload).not.toHaveBeenCalled(); await fireEvent.changeText(screen.getByLabelText("Requested changes"), "Revise wardrobe finish"); await fireEvent.press(screen.getByRole("button", { name: "Record decision" })); await waitFor(() => expect(t.upload).toHaveBeenCalledWith(expect.objectContaining({ path: "/admin/estimate-client-response-tasks/round-a/decision", parameters: { version: "6", decision: "request_changes", note: "Revise wardrobe finish" }, fileName: "Client proof.pdf" })));
});
it("preflights current scope/version before uploading and blocks stale proof submission", async () => {
  const t = setup(); t.get.mockResolvedValue({ ...estimate, version: 7 }); await t.show(<ReviewDecisionForm context={t.c} kind="estimate" task={estimate} current onReload={async () => undefined} />); await fireEvent.press(screen.getByRole("button", { name: "Choose Client decision proof" })); await screen.findByRole("button", { name: "Proof: Client proof.pdf" }); await fireEvent.press(screen.getByRole("button", { name: "Record decision" })); await screen.findByRole("button", { name: "Reload current data" }); expect(t.upload).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Record decision" })).toBeDisabled(); await fireEvent.press(screen.getByRole("button", { name: "Reload current data" })); await screen.findByRole("button", { name: "Choose Client decision proof" }); expect(releaseSelectedAsset).toHaveBeenCalled();
});
it("pins a lost upload response and does not upload again after a changed review version", async () => {
  const t = setup(); let current = estimate; t.get.mockImplementation(async () => current); t.uploadWork.mockImplementation(async () => { current = { ...estimate, version: 7, status: "approved" }; throw new ApiError(503, "UNAVAILABLE", "Lost response"); }); await t.show(<ReviewDecisionForm context={t.c} kind="estimate" task={estimate} current onReload={async () => undefined} />); await fireEvent.press(screen.getByRole("button", { name: "Choose Client decision proof" })); await screen.findByRole("button", { name: "Proof: Client proof.pdf" }); await fireEvent.press(screen.getByRole("button", { name: "Record decision" })); await screen.findByRole("button", { name: "Retry same request" }); expect(screen.getByLabelText("Decision note").props.editable).toBe(false); expect(screen.getByRole("button", { name: "Discard decision draft" })).toBeDisabled(); await fireEvent.press(screen.getByRole("button", { name: "Retry same request" })); await screen.findByRole("button", { name: "Reload current data" }); expect(t.upload).toHaveBeenCalledTimes(1);
});
it("removes private review details on mutation access denial", async () => {
  const t = setup(); t.get.mockResolvedValue(estimate); t.uploadWork.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access removed")); await t.show(<ReviewDetail context={t.c} kind="estimate" roundId="round-a" />); await screen.findByText("Immutable estimate version 4"); await fireEvent.press(screen.getByRole("button", { name: "Choose Client decision proof" })); await screen.findByRole("button", { name: "Proof: Client proof.pdf" }); await fireEvent.press(screen.getByRole("button", { name: "Record decision" })); await screen.findByText("This review is no longer available for your account."); expect(screen.queryByText("Total: ₹145.67")).toBeNull();
});
it("locks the decision while a design email retry outcome is unknown", async () => {
  const t = setup(); t.get.mockResolvedValue([design]); t.post.mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Email result unknown")); await t.show(<ReviewDetail context={t.c} kind="design" roundId={design.id} />); await screen.findByRole("button", { name: "Retry design review email" }); await fireEvent.press(screen.getByRole("button", { name: "Retry design review email" })); await screen.findByRole("button", { name: "Retry same request" }); expect(screen.getByRole("button", { name: "Record decision" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Choose Client decision proof" })).toBeDisabled(); expect(t.upload).not.toHaveBeenCalled();
});
it("honors per-review Design decision denial despite role capability", async () => {
  const t = setup(); t.get.mockResolvedValue([{ ...design, canDecide: false }]); await t.show(<ReviewDetail context={t.c} kind="design" roundId={design.id} />); await screen.findByText("Awaiting the Client's response."); expect(screen.queryByRole("button", { name: "Record decision" })).toBeNull(); expect(screen.queryByRole("button", { name: "Retry design review email" })).toBeNull(); expect(t.upload).not.toHaveBeenCalled();
});

it("keeps immutable source identity distinct across unequal projects and estimates", () => {
  expect(sameReviewSource(estimate, { ...estimate, estimate: { ...estimate.estimate, id: "estimate-b" } })).toBe(false);
  expect(sameReviewSource(estimate, { ...estimate, project: { id: "project-b", name: "South residence" } })).toBe(false);
  expect(sameReviewSource(design, { ...design, designPlanVersion: 9 })).toBe(false);
  expect(sameReviewSource(design, { ...design, version: 4 })).toBe(true);
});

it("removes cached private Design details when a successful scope refresh omits the round", async () => {
  const t = setup(); t.get.mockResolvedValue([design]);
  await t.show(<ReviewDetail context={t.c} kind="design" roundId={design.id} />);
  await screen.findByText("North residence"); t.get.mockResolvedValue([]);
  await fireEvent.press(screen.getByRole("button", { name: "Refresh review detail" }));
  await screen.findByText("This review is no longer available for your account.");
  expect(screen.queryByText("North residence")).toBeNull();
  expect(screen.queryByRole("button", { name: "Download Bedroom plan.pdf" })).toBeNull();
});
