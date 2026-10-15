import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { releaseSelectedAsset, TransferHttpError, pickDocument } from "../../platform/files";
import { NativeWorkflowActionForm } from "./NativeWorkflowActionForm";
import { InitialPaymentAction } from "./WorkflowWorkspace";
import { createFurnitureDimensionsDraft, parseFurnitureDimensionsDraft } from "./furnitureDimensions";
import type { DesignStageOperational, DesignWorkflowActionId, DesignWorkflowView } from "./workflowTypes";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../platform/files", () => ({ ...jest.requireActual("../../platform/files"), pickDocument: jest.fn(), releaseSelectedAsset: jest.fn(async () => undefined) }));
const fixture = { version: 6, availableActions: [], rooms: [{ id: "room-a", name: "Kitchen", required: true, hasDimensions: true, canProceed: false, dimensions: { submissionEventId: "submission-a", revision: 2, status: "pending", submittedAt: "2026-10-14T00:00:00Z", items: [{ id: "dimension-a", name: "Cabinet", unit: "ft", length: 4, width: 3 }] } }], furniture: { requirementsSubmissionEventId: "requirements-a", evidence: [] } } as unknown as DesignStageOperational;
const workflow = { projectId: "project-a", furnitureRooms: [{ id: "room-a", name: "Kitchen", estimateItems: [{ id: "item-a", name: "Cabinet", catalogueId: "main-a", specification: "Cabinet", quantity: 1, uom: "ft" }] }] } as DesignWorkflowView;
function setup() {
  const post = jest.fn().mockResolvedValue({ version: 7 }); const get = jest.fn().mockResolvedValue([]); const upload = jest.fn((_input: unknown) => ({ result: Promise.resolve({ version: 7 }) }));
  const session = { user: { id: "designer-a", role: "designer" }, authorization: { role: "designer", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: ["projects.design_workflow.read", "projects.design_workflow.act"] } };
  jest.mocked(useConfiguredRuntime).mockReturnValue({ runtime: { api: { authenticated: { post, get } }, transfers: { upload } }, environment: { environment: { id: "test" } }, session: { status: "authenticated", session } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  const refresh = jest.fn();
  async function open(id: DesignWorkflowActionId) { await render(<QueryClientProvider client={client}><NativeWorkflowActionForm projectId="project-a" stageId="stage-a" action={{ id, label: "Workflow action", actor: "designer", requiresProof: false }} operational={fixture} workflow={workflow} refresh={refresh} /></QueryClientProvider>); await fireEvent.press(screen.getByText("Workflow action")); }
  return { post, get, upload, client, refresh, open };
}
beforeEach(() => jest.clearAllMocks());
it("binds client furniture approval to the reviewed submission and captured workflow version", async () => {
  const { open, post } = setup(); await open("furniture_accept");
  await fireEvent.press(screen.getByText("Save workflow action")); expect(await screen.findByText("Confirm that you reviewed the information before submitting.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("checkbox", { name: "I reviewed these requirements and submitted dimensions" }));
  await fireEvent.press(screen.getByText("Save workflow action"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/actions", expect.objectContaining({ expectedVersion: 6, action: "furniture_accept", data: { submissionEventId: "requirements-a" }, idempotencyKey: expect.any(String) })));
});
it("requires site evidence and uploads multiple photos atomically", async () => {
  const { open, upload } = setup(); await open("measurement_complete");
  await fireEvent.press(screen.getByText("Save workflow action")); expect(await screen.findByText("Choose at least one site photo or video.")).toBeTruthy();
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "selected", asset: { uri: "file:///one.jpg", name: "one.jpg", mimeType: "image/jpeg", size: 100 } }).mockResolvedValueOnce({ status: "selected", asset: { uri: "file:///two.jpg", name: "two.jpg", mimeType: "image/jpeg", size: 100 } });
  await fireEvent.press(screen.getByText("Add site photo or video")); await screen.findByText("one.jpg"); await fireEvent.press(screen.getByText("Add site photo or video")); await screen.findByText("two.jpg");
  await fireEvent.press(screen.getByText("Save workflow action"));
  await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.objectContaining({ fieldName: "mediaFiles", fileUri: "file:///one.jpg", additionalFiles: [expect.objectContaining({ fieldName: "mediaFiles", fileUri: "file:///two.jpg" })], parameters: expect.objectContaining({ expectedVersion: "6", action: "measurement_complete" }) })));
});
it("retries the same workflow command after an uncertain response", async () => {
  const { open, post } = setup(); post.mockRejectedValueOnce(new Error("Offline")); await open("keys_received");
  await fireEvent.press(screen.getByText("Save workflow action")); await fireEvent.press(await screen.findByText("Retry saved workflow action"));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2)); expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
});
it("supports existing receipt attestation without hiding the confirmation behind a receipt timestamp", async () => {
  const { client, post } = setup(); await render(<QueryClientProvider client={client}><InitialPaymentAction projectId="project-a" payment={{ version: 6, canConfirm: true, requiresAttestation: true, confirmedAt: "2026-10-01T00:00:00Z", existingReceiptAt: "2026-10-01T00:00:00Z" }} refresh={jest.fn()} /></QueryClientProvider>);
  await fireEvent.press(screen.getByText("Confirm existing receipt")); await fireEvent.changeText(screen.getByLabelText("Payment receipt reference"), "Verified bank receipt"); await fireEvent.press(screen.getByText("Confirm existing receipt"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/actions", expect.objectContaining({ expectedVersion: 6, action: "confirm_initial_payment", note: "Verified bank receipt" })));
});
it("rejects fractional count items, stale item identities and unconfigured units", () => {
  const source = [{ id: "room-a", name: "Kitchen", estimateItems: [{ id: "point-a", name: "Sockets", catalogueId: "main-a", specification: "Sockets", quantity: 2, uom: "No", measurementType: "count" as const }] }];
  const draft = createFurnitureDimensionsDraft([{ id: "room-a" }], source);
  draft["room-a"] = [{ estimateItemId: "point-a", measurementType: "count", quantity: "1.5", uomId: "uom-a" }];
  expect(parseFurnitureDimensionsDraft(["room-a"], draft, source, [{ id: "uom-a", code: "no", name: "No", decimalScale: 0 }]).error).toMatch(/whole number/);
  draft["room-a"]![0] = { estimateItemId: "point-a", measurementType: "count", quantity: "2", uomId: "missing" };
  expect(parseFurnitureDimensionsDraft(["room-a"], draft, source, []).error).toMatch(/configured UOM/);
  expect(parseFurnitureDimensionsDraft(["room-b"], draft, source, []).error).toMatch(/unavailable or have changed/);
});

it("resolves returned rooms that no longer contain approved furniture without uploading new proof", async () => {
  const { client, post } = setup();
  const operational = { ...fixture, rooms: [{ ...fixture.rooms![0]!, dimensions: { ...fixture.rooms![0]!.dimensions!, status: "changes_requested" as const, returnReason: "Review changed scope" } }] };
  const source = { ...workflow, furnitureRooms: [{ id: "room-a", name: "Kitchen", estimateItems: [] }] };
  await render(<QueryClientProvider client={client}><NativeWorkflowActionForm projectId="project-a" stageId="stage-a" operational={operational} workflow={source} action={{ id: "furniture_upload", label: "Correct dimensions", actor: "designer", requiresProof: true }} refresh={jest.fn()} /></QueryClientProvider>);
  await fireEvent.press(screen.getByText("Correct dimensions"));
  await fireEvent.press(screen.getByText("Resolve returned rooms"));
  await waitFor(() => expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/actions", expect.objectContaining({ expectedVersion: 6, action: "furniture_upload", data: { resolveReturnedZeroValueRoomIds: ["room-a"] } })));
});

it("retains selected evidence and its command after a malformed successful upload, then releases on exact retry", async () => {
  const { open, upload } = setup();
  upload.mockImplementationOnce(() => ({ result: Promise.reject(new TransferHttpError(201, "INVALID_TRANSFER_RESPONSE", "Invalid response")) }));
  await open("measurement_complete");
  const asset = { uri: "file:///retained.jpg", name: "retained.jpg", mimeType: "image/jpeg", size: 100 };
  jest.mocked(pickDocument).mockResolvedValueOnce({ status: "selected", asset });
  await fireEvent.press(screen.getByText("Add site photo or video")); await screen.findByText(asset.name);
  await fireEvent.press(screen.getByText("Save workflow action")); await screen.findByText("Retry saved workflow action");
  expect(releaseSelectedAsset).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Retry saved workflow action"));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  expect(upload.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ ...(upload.mock.calls[0]?.[0] as Record<string, unknown>), onProgress: expect.any(Function) }));
  await waitFor(() => expect(releaseSelectedAsset).toHaveBeenCalledWith(asset));
});
it("releases a late picker result after the action editor unmounts", async () => {
  const { open } = setup(); await open("measurement_complete");
  let finish!: (value: Awaited<ReturnType<typeof pickDocument>>) => void;
  jest.mocked(pickDocument).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await fireEvent.press(screen.getByText("Add site photo or video"));
  await screen.unmount();
  const asset = { uri: "file:///late.jpg", name: "late.jpg", mimeType: "image/jpeg", size: 100 };
  finish({ status: "selected", asset });
  await waitFor(() => expect(releaseSelectedAsset).toHaveBeenCalledWith(asset));
});

it("keeps payment recovery available and disables cancel after a lost confirmation reply", async () => {
  const { client, post } = setup(); post.mockRejectedValueOnce(new Error("Lost reply"));
  await render(<QueryClientProvider client={client}><InitialPaymentAction projectId="project-a" payment={{ version: 6, canConfirm: true }} refresh={jest.fn()} /></QueryClientProvider>);
  await fireEvent.press(screen.getByText("Confirm initial payment"));
  await fireEvent.changeText(screen.getByLabelText("Payment receipt reference"), "Synthetic verified receipt");
  await fireEvent.press(screen.getByText("Confirm payment"));
  await screen.findByText("Retry saved confirmation"); expect(screen.getByRole("button", { name: "Cancel confirmation" })).toBeDisabled();
  await fireEvent.press(screen.getByText("Retry saved confirmation"));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2)); expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
});
