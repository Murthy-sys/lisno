import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ClientPlanReview } from "./ClientPlanReview";
import { parseClientEstimates } from "./clientReviewModel";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../documents/ProtectedDocumentViewer", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View: NativeView, Pressable: NativePressable, Text: NativeText } = jest.requireActual("react-native") as typeof import("react-native");
  return { ProtectedDocumentViewer: ({ visible, source, onClose, renderImage }: {
    readonly visible: boolean;
    readonly source: { readonly path: string };
    readonly onClose: () => void;
    readonly renderImage: (uri: string) => ReactNode;
  }) => visible ? React.createElement(NativeView, { testID: "plan-viewer", accessibilityLabel: source.path },
    React.createElement(NativePressable, { accessibilityRole: "button", accessibilityLabel: "Close document viewer", onPress: onClose }, React.createElement(NativeText, null, "Close viewer")),
    renderImage("file:///synthetic/plan-page.png")) : null };
});
jest.mock("../annotations/NativeAnnotationEditor", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View: NativeView, Pressable: NativePressable, Text: NativeText } = jest.requireActual("react-native") as typeof import("react-native");
  return { NativeAnnotationEditor: ({ value, onChange, readOnly, sharedAnnotations }: {
    readonly value: { readonly schemaVersion: 1; readonly imageWidth: number; readonly imageHeight: number; readonly elements: readonly unknown[] };
    readonly onChange: (value: unknown) => void;
    readonly readOnly: boolean;
    readonly sharedAnnotations: readonly unknown[];
  }) => React.createElement(NativeView, { testID: "annotation-editor", accessibilityLabel: readOnly ? "Read-only marks" : "Editable marks" },
    React.createElement(NativeText, null, `Marks: ${value.elements.length}`),
    React.createElement(NativeText, null, `Shared marks: ${sharedAnnotations.length}`),
    !readOnly ? React.createElement(NativePressable, { accessibilityRole: "button", accessibilityLabel: "Add test mark", onPress: () => onChange({
      ...value,
      elements: [...value.elements, { id: `mark-${value.elements.length + 1}`, type: "text", color: "#B42318", strokeWidth: 2, x: 0.4, y: 0.3, text: "Move door" }]
    }) }, React.createElement(NativeText, null, "Add mark")) : null) };
});

const useConfiguredRuntimeMock = jest.mocked(useConfiguredRuntime);
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const runtime = { api: { authenticated: { get: mockGet, post: mockPost, put: mockPut } } };
const environment = { environment: { id: "env-test" }, generation: 1, status: "ready" };
const sessionSnapshot = { status: "authenticated", generation: 1, session: { user: { id: "client-one" } } };
const permissions = [
  "estimation.client_plan_review.read",
  "estimation.client_plan_annotation_draft.save",
  "estimation.client_plan_target_preview",
  "estimation.client_plan_change_request.create",
  "estimation.client_plan_change_request.update"
];
const mark = { id: "saved-mark", type: "text", color: "#B42318", strokeWidth: 2, x: 0.2, y: 0.3, text: "Keep this" };
const blankDocument = { schemaVersion: 1, imageWidth: 1000, imageHeight: 700, elements: [] };

function session(overrides: readonly string[] = permissions): AuthenticatedSession {
  return {
    user: { id: "client-one", name: "Client One", email: "client@example.test", role: "client" },
    authorization: { role: "client", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: [...overrides] }
  } as AuthenticatedSession;
}

function estimate(status = "sent_to_client", designPlanStatus: string | null = null) {
  return parseClientEstimates([{
    id: "estimate-one", projectId: null, status, designPlanStatus, total: 100000,
    lineItems: [], lead: { projectName: "Home A" }
  }])[0]!;
}

function page(id: string, pageNumber: number, uploadId = "upload-a", status = "awaiting_review", annotationDraft: unknown = null) {
  return { id, uploadId, pageNumber, width: 1000, height: 700, currentRevisionId: `revision-${id}`, status, annotationDraft };
}

function payload(options: { readonly approved?: boolean; readonly draft?: boolean; readonly openRequest?: boolean } = {}) {
  const pageOne = page("page-one", 1, "upload-a", options.approved ? "approved" : "awaiting_review", options.draft ? { id: "draft-one", sourcePageId: "page-one", version: 3, annotations: { ...blankDocument, elements: [mark] } } : null);
  const pageTwo = page("page-two", 2);
  const pageThree = page("page-three", 1, "upload-b");
  return {
    uploads: [
      { id: "upload-a", originalFilename: "house-plan.pdf", mimeType: "application/pdf", pageCount: 2, pages: [pageTwo, pageOne] },
      { id: "upload-b", originalFilename: "garage.png", mimeType: "image/png", pageCount: 1, pages: [pageThree] }
    ],
    pages: [pageOne, pageTwo, pageThree],
    openRequests: options.openRequest ? [{
      id: "request-one", sourcePageId: "page-one", version: 4, summary: "Move door", status: "open", annotations: { ...blankDocument, elements: [mark] }, targets: [], unassigned: true
    }] : []
  };
}

let planPayload: ReturnType<typeof payload>;

function setup() {
  planPayload = payload();
  mockGet.mockImplementation(async (path: string) => {
    if (path === "/client/estimates/estimate-one/plan-review") return planPayload;
    throw new Error("Unexpected read");
  });
  mockPost.mockImplementation(async (path: string) => {
    if (path.endsWith("/target-preview")) return { pageRevisionNumber: 3, snapshotToken: "s".repeat(64), targets: [] };
    if (path.endsWith("/change-requests")) return { id: "request-created", sourcePageId: "page-one", version: 1 };
    throw new Error("Unexpected mutation");
  });
  mockPut.mockImplementation(async (path: string) => {
    if (path.endsWith("/annotation-draft")) return { id: "draft-one", sourcePageId: "page-one", version: 1 };
    if (path.endsWith("/request-one")) return { id: "request-one", sourcePageId: "page-one", version: 5 };
    throw new Error("Unexpected mutation");
  });
  useConfiguredRuntimeMock.mockReturnValue({ runtime, environment, session: sessionSnapshot } as never);
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
}

async function renderReview(est = estimate(), auth = session()) {
  const client = makeClient();
  const wrapper = ({ children }: { readonly children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = await render(<ClientPlanReview estimate={est} session={auth} />, { wrapper });
  return { view, client };
}

async function openFirst(view: Awaited<ReturnType<typeof renderReview>>["view"]) {
  await view.findByText("house-plan.pdf");
  await fireEvent.press(view.getByRole("button", { name: "Open house-plan.pdf, page 1" }));
  await view.findByTestId("annotation-editor");
}

describe("ClientPlanReview", () => {
  beforeEach(() => { jest.clearAllMocks(); setup(); });

  it("lists original filenames and ordered pages without fetching any full page image before Open", async () => {
    const { view } = await renderReview();
    expect(await view.findByText("house-plan.pdf")).toBeTruthy();
    expect(view.getByText("garage.png")).toBeTruthy();
    expect(view.getAllByText("Page 1")).toHaveLength(2);
    expect(view.getByText("Page 2")).toBeTruthy();
    expect(view.queryByTestId("plan-viewer")).toBeNull();
    expect(mockGet).toHaveBeenCalledWith("/client/estimates/estimate-one/plan-review", { signal: expect.anything() });
    expect(mockGet).toHaveBeenCalledTimes(1);
    await openFirst(view);
    expect(view.getByTestId("plan-viewer").props.accessibilityLabel).toBe("/client/estimate-plan-pages/page-one/current-image");
    await fireEvent.press(view.getByRole("button", { name: "Next page" }));
    expect(view.getByTestId("plan-viewer").props.accessibilityLabel).toBe("/client/estimate-plan-pages/page-two/current-image");
  });

  it("saves a versioned draft and reopens the server-refetched marks", async () => {
    const { view } = await renderReview();
    await openFirst(view);
    await fireEvent.press(view.getByRole("button", { name: "Add test mark" }));
    await fireEvent.press(view.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith("/client/estimate-plan-pages/page-one/annotation-draft", {
      version: 0,
      annotations: expect.objectContaining({ elements: [expect.objectContaining({ id: "mark-1" })] })
    }));
    planPayload = payload({ draft: true });
    await fireEvent.press(view.getByRole("button", { name: "Refresh plans" }));
    await waitFor(() => expect(view.getByText("Annotation draft saved.")).toBeTruthy());
    await fireEvent.press(view.getByRole("button", { name: "Close document viewer" }));
    expect(view.queryByTestId("plan-viewer")).toBeNull();
    await openFirst(view);
    expect(view.getByText("Marks: 1")).toBeTruthy();
  });

  it("previews zero overlaps and confirms page-level feedback with the authoritative revision and one key", async () => {
    const { view } = await renderReview();
    await openFirst(view);
    await fireEvent.press(view.getByRole("button", { name: "Add test mark" }));
    await fireEvent.changeText(view.getByLabelText("Change summary"), "Move the door");
    await fireEvent.press(view.getByRole("button", { name: "Request changes" }));
    expect(await view.findByText(/No drawing overlaps these marks/u)).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith("/client/estimate-plan-pages/page-one/target-preview", { annotations: expect.objectContaining({ elements: [expect.anything()] }) });
    await fireEvent.press(view.getByRole("button", { name: "Confirm change request" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/client/estimate-plan-pages/page-one/change-requests", expect.objectContaining({
      version: 3, summary: "Move the door", snapshotToken: "s".repeat(64), targetDrawingIds: [], idempotencyKey: expect.any(String)
    })));
    await waitFor(() => expect(view.queryByTestId("plan-viewer")).toBeNull());
  });

  it("requires explicit affected-drawing selection before submitting", async () => {
    mockPost.mockImplementation(async (path: string) => path.endsWith("/target-preview")
      ? { pageRevisionNumber: 4, snapshotToken: "t".repeat(64), targets: [{ drawingId: "drawing-a", title: "Kitchen", reason: "area_overlap" }] }
      : { id: "request-created", sourcePageId: "page-one", version: 1 });
    const { view } = await renderReview();
    await openFirst(view);
    await fireEvent.press(view.getByRole("button", { name: "Add test mark" }));
    await fireEvent.changeText(view.getByLabelText("Change summary"), "Move kitchen wall");
    await fireEvent.press(view.getByRole("button", { name: "Request changes" }));
    const kitchen = await view.findByRole("checkbox", { name: "Kitchen" });
    expect(kitchen.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(kitchen);
    expect(view.getByRole("button", { name: "Confirm change request" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(view.getByRole("checkbox", { name: "Kitchen" }));
    await fireEvent.press(view.getByRole("button", { name: "Confirm change request" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/client/estimate-plan-pages/page-one/change-requests", expect.objectContaining({ targetDrawingIds: ["drawing-a"] })));
  });

  it("retains the same idempotency key when a submission is retried after a network failure", async () => {
    let submits = 0;
    mockPost.mockImplementation(async (path: string) => {
      if (path.endsWith("/target-preview")) return { pageRevisionNumber: 3, snapshotToken: "s".repeat(64), targets: [] };
      submits += 1;
      if (submits === 1) throw new Error("network unavailable");
      return { id: "request-created", sourcePageId: "page-one", version: 1 };
    });
    const { view } = await renderReview();
    await openFirst(view);
    await fireEvent.press(view.getByRole("button", { name: "Add test mark" }));
    await fireEvent.changeText(view.getByLabelText("Change summary"), "Move the door");
    await fireEvent.press(view.getByRole("button", { name: "Request changes" }));
    await view.findByText(/No drawing overlaps/u);
    await fireEvent.press(view.getByRole("button", { name: "Confirm change request" }));
    await view.findByText(/could not be completed/u);
    await fireEvent.press(view.getByRole("button", { name: "Confirm change request" }));
    await waitFor(() => expect(submits).toBe(2));
    const calls = mockPost.mock.calls.filter(([path]) => String(path).endsWith("/change-requests"));
    expect(calls[0]?.[1].idempotencyKey).toBe(calls[1]?.[1].idempotencyKey);
  });

  it("locks target selection during submission and keeps the retry key after a lost response", async () => {
    let releaseFirst!: () => void;
    let submissions = 0;
    mockPost.mockImplementation(async (path: string) => {
      if (path.endsWith("/target-preview")) return {
        pageRevisionNumber: 3, snapshotToken: "s".repeat(64),
        targets: [{ drawingId: "drawing-a", title: "Kitchen", reason: "area_overlap" }]
      };
      submissions += 1;
      if (submissions === 1) {
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
        throw new Error("response lost");
      }
      return { id: "request-created", sourcePageId: "page-one", version: 1 };
    });
    const { view } = await renderReview();
    await openFirst(view);
    await fireEvent.press(view.getByRole("button", { name: "Add test mark" }));
    await fireEvent.changeText(view.getByLabelText("Change summary"), "Move kitchen wall");
    await fireEvent.press(view.getByRole("button", { name: "Request changes" }));
    await view.findByRole("checkbox", { name: "Kitchen" });
    await fireEvent.press(view.getByRole("button", { name: "Confirm change request" }));
    expect(view.getByRole("checkbox", { name: "Kitchen" }).props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    await fireEvent.press(view.getByRole("checkbox", { name: "Kitchen" }));
    expect(view.getByRole("checkbox", { name: "Kitchen" }).props.accessibilityState.checked).toBe(true);
    await act(async () => { releaseFirst(); });
    await view.findByText(/could not be completed/u);
    await fireEvent.press(view.getByRole("button", { name: "Confirm change request" }));
    await waitFor(() => expect(submissions).toBe(2));
    const calls = mockPost.mock.calls.filter(([path]) => String(path).endsWith("/change-requests"));
    expect(calls[0]?.[1]).toMatchObject({ targetDrawingIds: ["drawing-a"], idempotencyKey: calls[1]?.[1].idempotencyKey });
  });

  it("refreshes after a 409 while preserving marks and summary for explicit reconciliation", async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path.endsWith("/target-preview")) return { pageRevisionNumber: 3, snapshotToken: "s".repeat(64), targets: [] };
      throw new ApiError(409, "PLAN_REVIEW_CONFLICT", "private server detail");
    });
    const { view } = await renderReview();
    await openFirst(view);
    await fireEvent.press(view.getByRole("button", { name: "Add test mark" }));
    await fireEvent.changeText(view.getByLabelText("Change summary"), "Move the door");
    await fireEvent.press(view.getByRole("button", { name: "Request changes" }));
    await view.findByText(/No drawing overlaps/u);
    await fireEvent.press(view.getByRole("button", { name: "Confirm change request" }));
    expect(await view.findByText(/Your marks remain here/u)).toBeTruthy();
    expect(view.getByText("Marks: 1")).toBeTruthy();
    expect(view.getByLabelText("Change summary").props.value).toBe("Move the door");
    expect(view.queryByText("private server detail")).toBeNull();
    await waitFor(() => expect(mockGet.mock.calls.length).toBeGreaterThan(1));
    await fireEvent.press(view.getByRole("button", { name: "Use latest version with my marks" }));
    expect(view.getByText("Marks: 1")).toBeTruthy();
    expect(view.getByRole("button", { name: "Request changes" })).toBeTruthy();
  });

  it("updates an existing open request with its version", async () => {
    planPayload = payload({ openRequest: true });
    const { view } = await renderReview();
    await openFirst(view);
    expect(view.getByText("Marks: 1")).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText("Change summary"), "Move the kitchen door");
    await fireEvent.press(view.getByRole("button", { name: "Update request" }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith("/client/estimate-plan-change-requests/request-one", {
      version: 4, summary: "Move the kitchen door", annotations: expect.objectContaining({ elements: [expect.anything()] })
    }));
    expect(await view.findByText("Change request updated.")).toBeTruthy();
  });

  it("keeps prior plan marks visible when drawing feedback cannot be projected", async () => {
    planPayload = payload({ openRequest: true });
    planPayload.openRequests[0]!.status = "resolved";
    mockGet.mockImplementation(async (path: string) => {
      if (path === "/client/estimates/estimate-one/plan-review") return planPayload;
      if (path === "/client/estimates/estimate-one/design-drawings") return {
        uploads: [],
        pages: [{ id: "page-one", uploadId: "upload-a", pageNumber: 1, width: 1000, height: 700 }],
        drawings: [{ id: "drawing-one", sourcePageId: "page-one", displayTitle: "Kitchen", active: true }],
        revisions: [{
          id: "drawing-revision-one", drawingId: "drawing-one", revisionNumber: 1, sourcePageId: "page-one",
          crop: { x: 950, y: 0, width: 100, height: 100 }, reviewStatus: "submitted",
          changeSummary: "Move the cabinet", annotations: { ...blankDocument, elements: [mark] }, annotationDraft: null
        }],
        readiness: { ready: false, total: 1, approved: 0, awaitingReview: 1, changesRequested: 0 }
      };
      throw new Error("Unexpected read");
    });
    const { view } = await renderReview(estimate(), session([...permissions, "estimation.client_drawings.read"]));
    await openFirst(view);
    expect(await view.findByText(/Shared drawing feedback could not be displayed/u)).toBeTruthy();
    expect(view.getByText("Shared marks: 1")).toBeTruthy();
    expect(view.getByText("Earlier feedback")).toBeTruthy();
    expect(view.getByText("Move door")).toBeTruthy();
  });

  it("shows approved pages read-only and gates denied or awaiting plans without fetching", async () => {
    planPayload = payload({ approved: true });
    const approved = await renderReview(estimate("client_approved", "approved"));
    await openFirst(approved.view);
    expect(approved.view.getByLabelText("Read-only marks")).toBeTruthy();
    expect(approved.view.queryByRole("button", { name: "Request changes" })).toBeNull();
    await approved.view.unmount();

    mockGet.mockClear();
    const awaiting = await renderReview(estimate("client_approved", "pending_assignment"));
    expect(awaiting.view.getByText("Design plan awaited")).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
    await awaiting.view.unmount();

    const denied = await renderReview(estimate(), session([]));
    expect(denied.view.getByText("Design plan unavailable")).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("keeps unsent marks visible when the plan becomes non-reviewable during an open editor", async () => {
    const { view } = await renderReview();
    await openFirst(view);
    await fireEvent.press(view.getByRole("button", { name: "Add test mark" }));
    await fireEvent.changeText(view.getByLabelText("Change summary"), "Move the door");

    await view.rerender(<ClientPlanReview estimate={estimate("client_approved", "pending_assignment")} session={session()} />);
    expect(view.getByTestId("plan-viewer")).toBeTruthy();
    expect(view.getByText("Marks: 1")).toBeTruthy();
    expect(view.getByText("Unsent summary")).toBeTruthy();
    expect(view.getByText("Move the door")).toBeTruthy();
    expect(view.getByLabelText("Read-only marks")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Request changes" })).toBeNull();
  });

  it("warns before closing with unsaved marks", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const { view } = await renderReview();
    await openFirst(view);
    await fireEvent.press(view.getByRole("button", { name: "Add test mark" }));
    await fireEvent.press(view.getByRole("button", { name: "Close document viewer" }));
    expect(alert).toHaveBeenCalledWith("Discard unsaved plan edits?", expect.any(String), expect.any(Array));
    expect(view.getByTestId("plan-viewer")).toBeTruthy();
    const buttons = alert.mock.calls[0]?.[2] as { readonly text: string; readonly onPress?: () => void }[];
    await act(async () => buttons.find((button) => button.text === "Discard edits")?.onPress?.());
    expect(view.queryByTestId("plan-viewer")).toBeNull();
    alert.mockRestore();
  });
});
