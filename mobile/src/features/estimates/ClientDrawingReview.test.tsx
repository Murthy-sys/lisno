import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { ClientDrawingReview } from "./ClientDrawingReview";
import type { ClientDrawingWorkspace, ClientEstimate, ClientPlanWorkspace } from "./clientReviewModel";

jest.mock("../../runtime/RuntimeProvider", () => ({ useConfiguredRuntime: jest.fn() }));
jest.mock("../../core/query/useInvalidation", () => ({ useInvalidateEvent: jest.fn() }));
jest.mock("../documents/ProtectedDocumentViewer", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View, Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    ProtectedDocumentViewer: ({ visible, source, onClose, renderImage }: {
      visible: boolean; source: { path: string } | null; onClose: () => void; renderImage: (uri: string) => ReactNode;
    }) => visible ? React.createElement(View, { testID: "drawing-viewer" },
      React.createElement(Text, { testID: "drawing-source" }, source?.path),
      React.createElement(Pressable, { accessibilityRole: "button", accessibilityLabel: "Close document viewer", onPress: onClose }, React.createElement(Text, null, "Close")),
      renderImage("file:///private/drawing.png")
    ) : null
  };
});
jest.mock("../annotations/NativeAnnotationEditor", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View, Pressable, Text } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    NativeAnnotationEditor: ({ value, onChange, readOnly, sharedAnnotations }: {
      value: { imageWidth: number; imageHeight: number; elements: unknown[] };
      onChange: (value: unknown) => void; readOnly: boolean; sharedAnnotations: unknown[];
    }) => React.createElement(View, null,
      React.createElement(Text, null, `${readOnly ? "Read only" : "Editable"} annotations: ${value.elements.length}`),
      React.createElement(Text, null, `Shared annotations: ${sharedAnnotations.length}`),
      readOnly ? null : React.createElement(Pressable, {
        accessibilityRole: "button", accessibilityLabel: "Add rectangle mark",
        onPress: () => onChange({ ...value, elements: [...value.elements, {
          id: `local-${value.elements.length}`, type: "rectangle", x: 0.2, y: 0.2, width: 0.3, height: 0.3,
          color: "#B42318", strokeWidth: 4
        }] })
      }, React.createElement(Text, null, "Add mark"))
    )
  };
});

const runtimeMock = jest.mocked(useConfiguredRuntime);
const invalidateMock = jest.mocked(useInvalidateEvent);
const invalidated = jest.fn(async () => undefined);
const permissions = [
  "estimation.client_drawings.read",
  "estimation.client_plan_review.read",
  "estimation.design_revision_image.read",
  "estimation.client_annotation_draft.save",
  "estimation.client_drawing_decision",
  "estimation.client_plan_target_preview",
  "estimation.client_plan_change_request.create",
  "estimation.client_plan_change_request.update"
] as const;

function session(grants: readonly string[] = permissions): AuthenticatedSession {
  return {
    user: { id: "client-a", name: "Client", email: "client@example.invalid", role: "client" },
    authorization: { role: "client", policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: [...grants] }
  } as AuthenticatedSession;
}

function estimate(designPlanStatus: string | null = null): ClientEstimate {
  return {
    id: "estimate-a", projectId: null, status: "sent_to_client", designPlanStatus,
    total: 200_000, lineItems: [], lead: { projectName: "Project A" }
  } as ClientEstimate;
}

const page = {
  id: "page-a", uploadId: "upload-a", pageNumber: 1, width: 1000, height: 500,
  currentRevisionId: "page-revision-a", status: "awaiting_review", annotationDraft: null
} as const;
const mark = {
  id: "old-mark", type: "rectangle", x: 0.2, y: 0.2, width: 0.2, height: 0.2,
  color: "#B42318", strokeWidth: 4
} as const;

function drawingWorkspace(): ClientDrawingWorkspace {
  return {
    uploads: [{ id: "upload-a", originalFilename: "House plans.pdf", mimeType: "application/pdf" }],
    pages: [{ id: "page-a", uploadId: "upload-a", pageNumber: 1, width: 1000, height: 500 }],
    drawings: [{ id: "drawing-a", sourcePageId: "page-a", displayTitle: "Drawing A", active: true }],
    revisions: [{
      id: "revision-a", drawingId: "drawing-a", revisionNumber: 2, sourcePageId: "page-a",
      crop: { x: 400, y: 100, width: 200, height: 100 }, reviewStatus: "submitted",
      changeSummary: null, annotations: null, annotationDraft: null
    }],
    readiness: { ready: false, total: 1, approved: 0, awaitingReview: 1, changesRequested: 0 }
  };
}

function planWorkspace(): ClientPlanWorkspace {
  return {
    uploads: [{ id: "upload-a", originalFilename: "House plans.pdf", mimeType: "application/pdf", pageCount: 1, pages: [page] }],
    pages: [page], openRequests: []
  };
}

function setup(options: { drawings?: ClientDrawingWorkspace; plans?: ClientPlanWorkspace; planAbsent?: boolean } = {}) {
  const drawings = options.drawings ?? drawingWorkspace();
  const plans = options.planAbsent ? { uploads: [], pages: [], openRequests: [] } : options.plans ?? planWorkspace();
  const get = jest.fn(async (path: string) => {
    if (path.endsWith("/design-drawings")) return drawings;
    if (path.endsWith("/plan-review")) return plans;
    throw new Error("Unexpected GET path");
  });
  const post = jest.fn(async (path: string, _body?: unknown) => path.endsWith("/target-preview") ? {
    pageRevisionNumber: 7, snapshotToken: "a".repeat(64),
    targets: [
      { drawingId: "drawing-a", title: "Drawing A", reason: "area_overlap" },
      { drawingId: "drawing-b", title: "Drawing B", reason: "area_overlap" }
    ]
  } : { id: "response-a", version: 1 });
  const put = jest.fn(async () => ({ id: "saved-a", version: 6 }));
  runtimeMock.mockReturnValue({
    runtime: { api: { authenticated: { get, post, put } } },
    environment: { status: "ready", environment: { id: "env-a" } },
    session: { status: "authenticated", session: session() }
  } as never);
  invalidateMock.mockReturnValue(invalidated);
  return { get, post, put };
}

async function mount(currentEstimate = estimate(), currentSession = session()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const view = await render(<QueryClientProvider client={client}><ClientDrawingReview estimate={currentEstimate} session={currentSession} /></QueryClientProvider>);
  return { view, client };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

describe("ClientDrawingReview", () => {
  beforeEach(() => { jest.clearAllMocks(); invalidated.mockResolvedValue(undefined); });

  it("shows backend readiness, only active submitted revisions, and read-only history", async () => {
    const drawings = drawingWorkspace();
    drawings.drawings.push({ id: "drawing-hidden", sourcePageId: "page-a", displayTitle: "Hidden Drawing", active: false });
    drawings.revisions.push({
      ...drawings.revisions[0]!, id: "staff-draft", drawingId: "drawing-hidden", revisionNumber: 1,
      reviewStatus: "submitted"
    });
    drawings.revisions.push({
      ...drawings.revisions[0]!, id: "revision-old", revisionNumber: 1,
      reviewStatus: "changes_requested", changeSummary: "Raise the door", annotations: {
        schemaVersion: 1, imageWidth: 200, imageHeight: 100, elements: [mark]
      }
    });
    setup({ drawings });
    await mount();
    await screen.findByText("1 drawing unresolved: 1 awaiting review.");
    expect(screen.getByText("House plans.pdf · page 1")).toBeTruthy();
    expect(screen.queryByText("Hidden Drawing")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "View revision 1 of Drawing A" }));
    expect(screen.getByText("Read only annotations: 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve drawing" })).toBeNull();
    expect(screen.getByTestId("drawing-source").props.children).toBe("/estimate-design-revisions/revision-old/image");
  });

  it("projects drawing marks to the source page, confirms selected targets, and submits the preview snapshot", async () => {
    const { post } = setup();
    await mount();
    await fireEvent.press(await screen.findByRole("button", { name: "View Drawing A" }));
    await fireEvent.press(screen.getByRole("button", { name: "Add rectangle mark" }));
    await fireEvent.changeText(screen.getByLabelText("Describe required changes"), "Move the cupboard");
    await fireEvent.press(screen.getByRole("button", { name: "Review affected drawings" }));
    await screen.findByRole("header", { name: "Confirm affected drawings" });
    expect(post).toHaveBeenCalledWith("/client/estimate-plan-pages/page-a/target-preview", {
      annotations: {
        schemaVersion: 1, imageWidth: 1000, imageHeight: 500,
        elements: [{ ...mark, id: "local-0", x: 0.44, y: 0.24, width: 0.06, height: 0.06 }]
      }
    });
    await fireEvent.press(screen.getByRole("checkbox", { name: "Drawing B" }));
    await fireEvent.press(screen.getByRole("button", { name: "Confirm change request" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/client/estimate-plan-pages/page-a/change-requests", expect.objectContaining({
      version: 7, summary: "Move the cupboard", targetDrawingIds: ["drawing-a", "drawing-b"],
      snapshotToken: "a".repeat(64), idempotencyKey: expect.stringMatching(/^mobile-/)
    })));
    expect(invalidated).toHaveBeenCalledWith("plan-review-changed");
  });

  it("locks targets during submission and retries with the same idempotency key and targets", async () => {
    const { post } = setup();
    const pending = deferred<{ id: string; version: number }>();
    let submissions = 0;
    post.mockImplementation(async (path: string, _body?: unknown) => {
      if (path.endsWith("/target-preview")) return {
        pageRevisionNumber: 7, snapshotToken: "a".repeat(64),
        targets: [
          { drawingId: "drawing-a", title: "Drawing A", reason: "area_overlap" },
          { drawingId: "drawing-b", title: "Drawing B", reason: "area_overlap" }
        ]
      };
      if (path.endsWith("/change-requests") && submissions++ === 0) return pending.promise;
      return { id: "request-a", version: 1 };
    });
    await mount();
    await fireEvent.press(await screen.findByRole("button", { name: "View Drawing A" }));
    await fireEvent.press(screen.getByRole("button", { name: "Add rectangle mark" }));
    await fireEvent.changeText(screen.getByLabelText("Describe required changes"), "Move the cupboard");
    await fireEvent.press(screen.getByRole("button", { name: "Review affected drawings" }));
    await screen.findByRole("header", { name: "Confirm affected drawings" });
    await fireEvent.press(screen.getByRole("checkbox", { name: "Drawing B" }));
    await fireEvent.press(screen.getByRole("button", { name: "Confirm change request" }));
    await waitFor(() => expect(post.mock.calls.filter(([path]) => path.endsWith("/change-requests"))).toHaveLength(1));
    expect(screen.getByRole("checkbox", { name: "Drawing B" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Drawing B" }));
    await act(async () => { pending.reject(new ApiError(503, "UNAVAILABLE", "Try again")); });
    await screen.findByText("The drawing review could not be saved. Check your connection and try again.");
    expect(screen.getByText("Editable annotations: 1")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Drawing B" }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Confirm change request" }));
    await waitFor(() => expect(post.mock.calls.filter(([path]) => path.endsWith("/change-requests"))).toHaveLength(2));
    const submissionsSent = post.mock.calls.filter(([path]) => path.endsWith("/change-requests"));
    const firstBody = submissionsSent[0]?.[1] as { idempotencyKey: string } | undefined;
    const secondBody = submissionsSent[1]?.[1] as { idempotencyKey: string } | undefined;
    expect(firstBody).toMatchObject({ idempotencyKey: secondBody?.idempotencyKey, targetDrawingIds: ["drawing-a", "drawing-b"] });
  });

  it("blocks direct change requests when a source-page revision has no matching plan page", async () => {
    const { post } = setup({ planAbsent: true });
    await mount();
    await fireEvent.press(await screen.findByRole("button", { name: "View Drawing A" }));
    await fireEvent.press(screen.getByRole("button", { name: "Add rectangle mark" }));
    expect(screen.getByText("The source plan page is unavailable. Refresh the plan before requesting drawing changes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh source plan" })).toBeTruthy();
    expect(screen.queryByLabelText("Describe required changes")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send drawing change request" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review affected drawings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Approve drawing" })).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("blocks source-page changes without plan-read permission while keeping revision approval", async () => {
    const { get, post } = setup();
    await mount(estimate(), session([
      "estimation.client_drawings.read", "estimation.design_revision_image.read",
      "estimation.client_drawing_decision", "estimation.client_annotation_draft.save",
      "estimation.client_plan_target_preview", "estimation.client_plan_change_request.create"
    ]));
    await fireEvent.press(await screen.findByRole("button", { name: "View Drawing A" }));
    expect(screen.getByText("The source plan page is unavailable. Refresh the plan before requesting drawing changes.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review affected drawings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send drawing change request" })).toBeNull();
    expect(screen.getByRole("button", { name: "Approve drawing" })).toBeTruthy();
    expect(get.mock.calls.some(([path]) => path.endsWith("/plan-review"))).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("blocks source-page changes when the plan query fails, with a retry path", async () => {
    const { get, post } = setup();
    get.mockImplementation(async (path: string) => {
      if (path.endsWith("/plan-review")) throw new ApiError(503, "UNAVAILABLE", "Unavailable");
      return drawingWorkspace();
    });
    await mount();
    await fireEvent.press(await screen.findByRole("button", { name: "View Drawing A" }));
    expect(screen.getByText("The source plan page is unavailable. Refresh the plan before requesting drawing changes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry plan context" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send drawing change request" })).toBeNull();
    expect(screen.getByRole("button", { name: "Approve drawing" })).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("enables page feedback when delayed plan context arrives without discarding open edits", async () => {
    const { get } = setup();
    const pendingPlan = deferred<ClientPlanWorkspace>();
    get.mockImplementation(async (path: string) => path.endsWith("/plan-review") ? pendingPlan.promise : drawingWorkspace());
    await mount();
    await fireEvent.press(await screen.findByRole("button", { name: "View Drawing A" }));
    await fireEvent.press(screen.getByRole("button", { name: "Add rectangle mark" }));
    expect(screen.getByText("The source plan page is unavailable. Refresh the plan before requesting drawing changes.")).toBeTruthy();
    await act(async () => { pendingPlan.resolve(planWorkspace()); });
    await screen.findByLabelText("Describe required changes");
    expect(screen.getByText("Editable annotations: 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review affected drawings" })).toBeTruthy();
  });

  it("approves only the exact submitted revision number after confirmation", async () => {
    const { post } = setup();
    await mount();
    await fireEvent.press(await screen.findByRole("button", { name: "View Drawing A" }));
    await fireEvent.press(screen.getByRole("button", { name: "Approve drawing" }));
    expect(post).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Confirm drawing approval" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/client/estimate-design-revisions/revision-a/decision", {
      version: 2, decision: "approve"
    }));
    expect(invalidated).toHaveBeenCalledWith("plan-review-changed");
  });

  it("updates an existing page request with its own version and preserves current annotations", async () => {
    const drawings = drawingWorkspace();
    drawings.revisions[0] = { ...drawings.revisions[0]!, reviewStatus: "changes_requested", changeSummary: "Old request" };
    const plans = planWorkspace();
    plans.openRequests.push({
      id: "request-a", sourcePageId: "page-a", version: 5, summary: "Old request",
      annotations: { schemaVersion: 1, imageWidth: 1000, imageHeight: 500, elements: [{ ...mark, x: 0.44, y: 0.24, width: 0.04, height: 0.04 }] },
      status: "open", targets: [{ drawingId: "drawing-a", requestedRevisionId: "revision-a", status: "open", resolvedByRevisionId: null }],
      unassigned: false
    });
    const { put, post } = setup({ drawings, plans });
    await mount();
    await fireEvent.press(await screen.findByRole("button", { name: "View Drawing A" }));
    expect(screen.getByText("Editable annotations: 1")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Describe required changes"), "Move the door farther");
    await fireEvent.press(screen.getByRole("button", { name: "Update change request" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/client/estimate-plan-change-requests/request-a", expect.objectContaining({
      version: 5, summary: "Move the door farther",
      annotations: expect.objectContaining({ schemaVersion: 1, imageWidth: 1000, imageHeight: 500 })
    })));
    expect(post).not.toHaveBeenCalled();
  });

  it("preserves unsent marks after a stale page preview and warns before discarding them", async () => {
    const { post } = setup();
    post.mockRejectedValueOnce(new ApiError(409, "DRAWING_STALE", "Changed"));
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await mount();
    await fireEvent.press(await screen.findByRole("button", { name: "View Drawing A" }));
    await fireEvent.press(screen.getByRole("button", { name: "Add rectangle mark" }));
    await fireEvent.changeText(screen.getByLabelText("Describe required changes"), "Please change this");
    await fireEvent.press(screen.getByRole("button", { name: "Review affected drawings" }));
    await screen.findByText(/Your unsent marks are still here/);
    expect(screen.getByText("Read only annotations: 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Review affected drawings" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Close document viewer" }));
    expect(alert).toHaveBeenCalledWith("Discard unsent drawing edits?", expect.any(String), expect.any(Array));
    expect(screen.getByTestId("drawing-viewer")).toBeTruthy();
    alert.mockRestore();
  });

  it("gates all mutation controls when review is not currently allowed", async () => {
    setup();
    await mount({ ...estimate(), status: "client_approved", designPlanStatus: "approved" }, session(["estimation.client_drawings.read", "estimation.client_plan_review.read", "estimation.design_revision_image.read"]));
    await fireEvent.press(await screen.findByRole("button", { name: "View Drawing A" }));
    expect(screen.getByText("Read only annotations: 0")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve drawing" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send drawing change request" })).toBeNull();
  });

  it("does not offer private image previews without the image operation", async () => {
    setup();
    await mount(estimate(), session(["estimation.client_drawings.read"]));
    await screen.findByText("Drawing A");
    expect(screen.queryByRole("button", { name: "View Drawing A" })).toBeNull();
    expect(screen.queryByTestId("drawing-viewer")).toBeNull();
  });
});
