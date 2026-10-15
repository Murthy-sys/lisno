import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Text as MockText } from "react-native";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { pickDocument, TransferHttpError } from "../../platform/files";
import { isDesignUncertain } from "./DesignPlanControls";
import { PreparedPlanDocuments } from "./PreparedPlanDocuments";
import { designPlanEligibility } from "./DesignPlanTasksWorkspace";
import { workflow } from "./__tests__/fixtures";
import { EstimateDesignPreparation } from "./EstimateDesignPreparation";
import { DesignFileUpload } from "./DesignFileUpload";
import { DesignPlanAssignment } from "./DesignPlanAssignment";
import { PlanChangeRequests } from "./PlanChangeRequests";
import { designPlanKeys } from "./designPlanApi";
import { designTaskOptions, type DesignWorkspace } from "./designPlanModel";
import { request, requestQueue, session, task, workspace } from "./__tests__/fixtures";
jest.mock("../workflows/WorkflowWorkspace", () => ({ WorkflowWorkspace: () => null }));
jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: () => jest.fn(async () => undefined) }));
jest.mock("../../navigation/AdaptiveAppScaffold", () => ({ useScaffoldNavigationGuard: () => null, useScaffoldNavigationBlocked: () => false }));
jest.mock("../../platform/files", () => ({ ...jest.requireActual("../../platform/files"), pickDocument: jest.fn(), releaseSelectedAsset: jest.fn(async () => undefined) }));
jest.mock("../documents/useProtectedDocument", () => ({ useProtectedDocument: () => ({ status: "ready", localUri: "file:///private/page.png", error: null, retry: jest.fn() }) }));
jest.mock("../documents/ProtectedDocumentViewer", () => ({ ProtectedDocumentViewer: ({ visible, source, renderImage }: { visible: boolean; source: { path: string } | null; renderImage?: (uri: string) => ReactElement }) => visible ? <><MockText>{source?.path}</MockText>{renderImage?.("file:///private/image.png")}</> : null }));
jest.mock("../annotations/NativeAnnotationEditor", () => ({ NativeAnnotationEditor: ({ readOnly }: { readOnly: boolean }) => <MockText>{readOnly ? "Read-only annotations" : "Editable annotations"}</MockText> }));
let clients: QueryClient[] = [];
function setup(initial: DesignWorkspace = workspace) {
 let current = initial; const get = jest.fn(async (path: string): Promise<unknown> => { if (path.endsWith("/design-uploads")) return current; if (path.startsWith("/estimate-plan-change-requests?")) return []; if (path === "/estimate-plan-change-requests/request-a") return request; if (path === "/admin/designers") return [{ id: "designer-b", name: "Second Designer", email: "designer-b@example.test" }]; throw new Error(`Unexpected GET ${path}`); });
 const patch = jest.fn(async (_path: string, input: Record<string, unknown>) => { const drawing = { ...current.drawings[0]!, displayTitle: String(input.displayTitle), verified: Boolean(input.verified) }; const revision = { ...current.revisions[0]!, id: "revision-new", revisionNumber: 4 }; current = { ...current, drawings: [drawing], revisions: [revision] }; return { ...drawing, revision }; });
 const post = jest.fn(async (_path: string, _input?: unknown): Promise<unknown> => ({ submittedCount: 1, reviewRoundId: "round-a", designPlanVersion: 4, deliveryStatus: "failed" })); const put = jest.fn(async (_path: string, _input?: unknown): Promise<unknown> => ({ ...request, version: 5 })); const upload = jest.fn();
 jest.mocked(useConfiguredRuntime).mockReturnValue({ runtime: { api: { authenticated: { get, post, patch, put } }, transfers: { upload } }, environment: { environment: { id: "env-a" }, generation: 1 }, session: { generation: 1 } } as never);
 return { get, post, patch, put, upload, setCurrent: (next: DesignWorkspace) => { current = next; } };
}
async function mount(ui: ReactElement) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } }); clients.push(client); await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>); return client; }
const preparation = (readOnly = false) => <EstimateDesignPreparation estimateId="estimate-a" session={session} {...designTaskOptions(task)} readOnly={readOnly} />;
beforeEach(() => jest.clearAllMocks());
afterEach(async () => { await cleanup(); for (const client of clients) client.clear(); clients = []; });
it("edits title, verification and crop using the reviewed revision CAS", async () => {
 const api = setup(); await mount(preparation()); await fireEvent.press(await screen.findByRole("button", { name: "Edit / verify Kitchen drawing" }));
 await fireEvent.changeText(screen.getByLabelText("Drawing title"), "Kitchen revised"); await fireEvent.changeText(screen.getByLabelText("Crop width"), "240"); await fireEvent.press(screen.getByRole("checkbox", { name: "Title and crop verified" })); await fireEvent.press(screen.getByRole("button", { name: "Save drawing changes" }));
 await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/estimate-design-drawings/drawing-a", { version: 3, displayTitle: "Kitchen revised", crop: { x: 10, y: 20, width: 240, height: 250 }, verified: true })); await screen.findByRole("header", { name: "Kitchen revised" });
});
it("keeps stale corrections intact and prevents another save", async () => {
 const api = setup(); api.patch.mockRejectedValueOnce(new ApiError(409, "STALE", "Changed")); await mount(preparation()); await fireEvent.press(await screen.findByRole("button", { name: "Edit / verify Kitchen drawing" })); await fireEvent.changeText(screen.getByLabelText("Drawing title"), "Keep local draft"); await fireEvent.press(screen.getByRole("button", { name: "Save drawing changes" })); await screen.findByText(/source changed. Refresh and reopen/); expect(screen.getByLabelText("Drawing title").props.value).toBe("Keep local draft"); expect(screen.getByRole("button", { name: "Save drawing changes" })).toBeDisabled(); expect(api.patch).toHaveBeenCalledTimes(1);
});
it("locks an open correction when a newer drawing revision arrives", async () => {
 const api = setup(); const client = await mount(preparation()); await fireEvent.press(await screen.findByRole("button", { name: "Edit / verify Kitchen drawing" })); const next = { ...workspace, revisions: [{ ...workspace.revisions[0]!, id: "new-source", revisionNumber: 5 }] }; api.setCurrent(next); await act(async () => client.setQueryData(designPlanKeys.workspace({ environmentId: "env-a", userId: session.user.id }, "estimate-a"), next)); await waitFor(() => expect(screen.getByRole("button", { name: "Save drawing changes" })).toBeDisabled()); expect(api.patch).not.toHaveBeenCalled();
});
it("preserves a saved submission when delivery fails and never auto-resubmits", async () => {
 const api = setup(); await mount(preparation()); const submit = await screen.findByRole("button", { name: "Submit drawings to Client" }); await waitFor(() => expect(submit).not.toBeDisabled()); await fireEvent.press(submit); await fireEvent.press(screen.getByRole("button", { name: "Confirm submit drawings" })); await screen.findByText(/Design submitted. Client email was not delivered/); expect(api.post).toHaveBeenCalledTimes(1);
});
it("does not offer automatic retry after an uncertain submission without a server CAS token", async () => {
 const api = setup(); api.post.mockRejectedValueOnce(new Error("Connection lost")); await mount(preparation()); const submit = await screen.findByRole("button", { name: "Submit drawings to Client" }); await waitFor(() => expect(submit).not.toBeDisabled()); await fireEvent.press(submit); await fireEvent.press(screen.getByRole("button", { name: "Confirm submit drawings" })); await waitFor(() => expect(screen.getAllByText(/Refresh and review the saved uploads/).length).toBeGreaterThan(0)); expect(screen.queryByRole("button", { name: "Retry saved Design request" })).toBeNull(); expect(api.post).toHaveBeenCalledTimes(1);
});
it("shows approved revisions without edit or submit controls and hides all content after denied refresh", async () => {
 const api = setup({ ...workspace, revisions: [{ ...workspace.revisions[0]!, reviewStatus: "approved" }] }); await mount(preparation(true)); await screen.findByRole("header", { name: "Kitchen drawing" }); expect(screen.queryByRole("button", { name: "Edit / verify Kitchen drawing" })).toBeNull(); expect(screen.queryByRole("button", { name: "Submit drawings to Client" })).toBeNull(); api.get.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Access changed")); await fireEvent.press(screen.getByRole("button", { name: "Refresh designs" })); await screen.findByText(/unavailable for your current access/); expect(screen.queryByRole("header", { name: "Kitchen drawing" })).toBeNull();
});
it("requires explicit new-page intent when Client requests are open", async () => {
 const api = setup(); const original = api.get.getMockImplementation()!; api.get.mockImplementation(path => path.startsWith("/estimate-plan-change-requests?") ? Promise.resolve([requestQueue]) : original(path)); await mount(preparation()); await screen.findByText(/Client feedback is open/); expect(screen.queryByRole("button", { name: "Choose design file" })).toBeNull(); await fireEvent.press(screen.getByRole("checkbox", { name: "Upload an additional new design page" })); expect(screen.getByRole("button", { name: "Choose design file" })).not.toBeDisabled();
});
it("maps Client feedback using stable target IDs and request CAS, and opens read-only annotations", async () => {
 const api = setup(); const original = api.get.getMockImplementation()!; api.get.mockImplementation(path => path.startsWith("/estimate-plan-change-requests?") ? Promise.resolve([requestQueue]) : original(path)); await mount(<PlanChangeRequests estimateId="estimate-a" session={session} workspace={workspace} disabled={false} onChanged={async () => undefined} onDenied={jest.fn()} />);
 await fireEvent.press(await screen.findByRole("radio", { name: "Move kitchen door · Page feedback needs mapping" })); await fireEvent.press(await screen.findByRole("button", { name: "View annotated plan feedback" })); expect(screen.getByText("Read-only annotations")).toBeTruthy(); expect(screen.getByText("/estimate-plan-pages/page-a/current-image")).toBeTruthy(); await fireEvent.press(screen.getByRole("checkbox", { name: "Kitchen drawing" })); await fireEvent.press(screen.getByRole("button", { name: "Link selected drawings" })); await waitFor(() => expect(api.put).toHaveBeenCalledWith("/estimate-plan-change-requests/request-a/targets", { version: 4, targetDrawingIds: ["drawing-a"] }));
});
it.each([new Error("Network lost"), new TransferHttpError(201, "INVALID_TRANSFER_RESPONSE", "The upload response was unreadable.")])("retries a replacement with the same file, request version and idempotency key after %p", async failure => {
 const api = setup(); jest.mocked(pickDocument).mockResolvedValue({ status: "selected", asset: { uri: "file:///private/revised.pdf", name: "revised.pdf", mimeType: "application/pdf", size: 123 } } as never); api.upload.mockImplementationOnce(() => ({ result: Promise.reject(failure) })).mockImplementationOnce(() => ({ result: Promise.resolve({ ...workspace.uploads[0], purpose: "plan_request_replacement", requestReplacement: { requestId: "request-a", requestVersion: 4, sourcePageId: "page-a", targetCount: 1, matches: [], ignoredPageNumbers: [], ignoredPageCount: 0 } }) }));
 await mount(<DesignFileUpload estimateId="estimate-a" session={session} target={{ kind: "request", requestId: "request-a", version: 4 }} onChanged={async () => undefined} />); await fireEvent.press(screen.getByRole("button", { name: "Choose design file" })); await fireEvent.press(await screen.findByRole("button", { name: "Upload design plan" })); await fireEvent.press(await screen.findByRole("button", { name: "Retry saved Design request" })); await screen.findByText(/File saved/); expect(api.upload).toHaveBeenCalledTimes(2); expect(api.upload.mock.calls[1]![0]).toMatchObject({ fileUri: api.upload.mock.calls[0]![0].fileUri, parameters: api.upload.mock.calls[0]![0].parameters }); expect(api.upload.mock.calls[0]![0].parameters).toMatchObject({ version: "4" });
});
it.each([[0, true], [201, true], [400, false], [403, false], [404, false], [408, true], [409, false], [422, false], [429, false], [500, true]])("classifies only known non-timeout 4xx Design failures as definite (%i)", (status, uncertain) => {
 expect(isDesignUncertain(new ApiError(status as number, "TEST_FAILURE", "Test failure"))).toBe(uncertain);
 expect(isDesignUncertain(new TransferHttpError(status as number, "TEST_FAILURE", "Test failure"))).toBe(uncertain);
});
it("uses the separate Design plan assignment endpoint and locks approved plans", async () => {
 const api = setup(); api.post.mockResolvedValue(task); await mount(<DesignPlanAssignment projectId="project-a" session={session} estimateStatus="client_approved" designPlanStatus="assigned" />); const choice = await screen.findByRole("combobox", { name: "Assigned Designer" }); await waitFor(() => expect(choice).not.toBeDisabled()); await fireEvent.press(choice); await fireEvent.press(screen.getByRole("radio", { name: "Second Designer · designer-b@example.test" })); await fireEvent.press(screen.getByRole("button", { name: "Assign Designer" })); await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/projects/project-a/design-assignment", { designerId: "designer-b" }));
 await cleanup(); await mount(<DesignPlanAssignment projectId="project-a" session={session} estimateStatus="client_approved" designPlanStatus="approved" />); expect(screen.getByText("The approved Design plan is locked.")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Assign Designer" })).toBeNull();
});

it("binds assigned task editing to the current project source, active stage and design-start milestone", () => {
 expect(designPlanEligibility(task, workflow)).toMatchObject({ editable: true, allowDeletion: true });
 expect(designPlanEligibility(task, { ...workflow, projectId: "project-b" })).toMatchObject({ editable: false, show: false });
 expect(designPlanEligibility(task, { ...workflow, initialPayment: { workflowVersion: 2, confirmedAt: "2026-10-14", designStartedAt: null } })).toMatchObject({ editable: false });
 expect(designPlanEligibility({ ...task, status: "ready_for_client" }, workflow)).toMatchObject({ editable: false, allowDeletion: true });
 expect(designPlanEligibility({ ...task, status: "approved" }, workflow)).toMatchObject({ editable: false, allowDeletion: false });
});
it("prepares the current manifest and opens its derived authenticated PDF path", async () => {
 const api = setup(); const onReady = jest.fn(); let docs = { manifestHash: "manifest-a", reviewRoundId: null, readyForSubmission: false, documents: [{ sourceUploadId: "upload-a", originalFilename: "villa.pdf", documentId: null as string | null, manifestHash: "manifest-a", status: "not_prepared", pageCount: 1, pdfUrl: null as string | null, failureCode: null, failureMessage: null }] };
 api.get.mockImplementation(async () => docs); api.post.mockImplementation(async () => { docs = { ...docs, readyForSubmission: true, documents: [{ ...docs.documents[0]!, documentId: "document-a", status: "ready", pdfUrl: "https://untrusted.example/private.pdf" }] }; return docs; });
 await mount(<PreparedPlanDocuments estimateId="estimate-a" session={session} revisionKey="revision-a" enabled canPrepare onReady={onReady} onDenied={jest.fn()} />);
 await waitFor(() => expect(api.post).toHaveBeenCalledWith("/estimates/estimate-a/design-plan-documents/prepare", { expectedManifestHash: "manifest-a" })); await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true)); await fireEvent.press(screen.getByRole("button", { name: "Open full PDF: villa.pdf" })); expect(screen.getByText("/estimates/estimate-a/design-plan-documents/document-a/pdf")).toBeTruthy(); expect(screen.queryByText("https://untrusted.example/private.pdf")).toBeNull();
});
it("does not replace a newer PDF manifest with a late preparation acknowledgement", async () => {
 const api = setup(); let resolve: (value: unknown) => void = () => undefined; const old = { manifestHash: "old", reviewRoundId: null, readyForSubmission: false, documents: [{ sourceUploadId: "upload-a", originalFilename: "old.pdf", documentId: null, manifestHash: "old", status: "not_prepared", pageCount: 1, pdfUrl: null, failureCode: null, failureMessage: null }] }; const next = { manifestHash: "new", reviewRoundId: null, readyForSubmission: false, documents: [] }; api.get.mockResolvedValue(old); api.post.mockImplementation(() => new Promise(value => { resolve = value; })); const onReady = jest.fn();
 const client = await mount(<PreparedPlanDocuments estimateId="estimate-a" session={session} revisionKey="revision-a" enabled canPrepare onReady={onReady} onDenied={jest.fn()} />); await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1)); api.get.mockResolvedValue(next); const key = [...designPlanKeys.documents({ environmentId: "env-a", userId: session.user.id }, "estimate-a"), "revision-a"]; await act(async () => { client.setQueryData(key, next); resolve({ ...old, readyForSubmission: true, documents: [] }); }); await waitFor(() => expect(client.getQueryData(key)).toEqual(next)); expect(onReady).not.toHaveBeenLastCalledWith(true);
});
