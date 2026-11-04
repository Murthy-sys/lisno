import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnotationDocumentV1, EstimateDesignClientWorkspace, EstimatePlanClientWorkspace, EstimatePlanPage } from "../../api/types";
import { ApiError } from "../../api/client";
import * as designApi from "../leads/estimateDesignApi";
import { ClientEstimateDesignReview } from "./ClientEstimateDesignReview";
import type { ClientPlanPageReview } from "./ClientPlanPageReview";
import { withPublishedReview } from "./clientEstimateReviewTestUtils";
import { clientEstimateWorkflowVersion } from "./clientEstimateWorkflow";
import type { EstimateQueueItem } from "./estimateWorkflowApi";

const auth = vi.hoisted(() => ({ user: { id: "client-one", role: "client" } }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../leads/estimateDesignApi", async importOriginal => ({
  ...await importOriginal<typeof import("../leads/estimateDesignApi")>(),
  getClientEstimateDrawings: vi.fn(), getClientPlanWorkspace: vi.fn(),
  saveClientPlanDraft: vi.fn(), previewClientPlanTargets: vi.fn(),
  submitClientPlanChangeRequest: vi.fn(), updateClientPlanChangeRequest: vi.fn()
}));
vi.mock("../../components/design/ProtectedImage", () => ({ ProtectedImage: () => <span>Plan preview</span> }));
vi.mock("./ClientEstimateDrawings", () => ({
  ClientEstimateDrawings: ({ canReview, workspace }: { canReview: boolean; workspace?: EstimateDesignClientWorkspace }) => <>
    {workspace ? <span>Loaded drawing workspace</span> : null}
    <button disabled={!canReview}>Review a drawing</button>
  </>,
  projectDrawingAnnotationsToPage: () => [], projectDrawingCommentsToPage: () => []
}));
vi.mock("../workflow/SpacePlanningCompletion", () => ({
  EstimateSpacePlanningCompletion: ({ projectId, estimateId }: { projectId: string; estimateId: string }) =>
    <div role="group" aria-label="Space planning completion">{projectId}:{estimateId}</div>
}));

const annotations: AnnotationDocumentV1 = { schemaVersion: 1, imageWidth: 1000, imageHeight: 800, elements: [] };
vi.mock("./ClientPlanPageReview", () => ({
  ClientPlanPageReview: (props: ComponentProps<typeof ClientPlanPageReview>) => <div role="dialog" aria-label="Review plan">
    <button onClick={props.onClose}>Close plan</button>
    <button disabled={!props.canReview} onClick={() => void props.saveDraft(annotations)}>Save plan draft</button>
    <button disabled={!props.canReview} onClick={() => void props.previewTargets(annotations)}>Preview plan targets</button>
    <button disabled={!props.canReview} onClick={() => void props.submitRequest({ version: 5, summary: "Move fixture", annotations, targetDrawingIds: ["drawing-one"], snapshotToken: "synthetic-snapshot", idempotencyKey: "synthetic-operation" })}>Submit plan changes</button>
    <button disabled={!props.canReview} onClick={() => void props.updateRequest?.({ requestId: "request-one", version: 6, summary: "Updated position", annotations })}>Update plan request</button>
  </div>
}));

const page: EstimatePlanPage = {
  id: "page-one", uploadId: "upload-one", pageNumber: 1, width: 1000, height: 800,
  currentRevisionId: "revision-one", status: "awaiting_review", thumbnailUrl: "/synthetic-thumbnail", currentImageUrl: "/synthetic-image",
  annotationDraft: null, reviewRoundId: "design-round-one"
};
const plans: EstimatePlanClientWorkspace = { pages: [page], openRequests: [], uploads: [{ id: page.uploadId, originalFilename: "synthetic-plan.pdf", mimeType: "application/pdf", pageCount: 1, pages: [page] }] };
const drawings: EstimateDesignClientWorkspace = { uploads: [], pages: [], drawings: [], revisions: [], readiness: { ready: true, total: 0, approved: 0, awaitingReview: 0, changesRequested: 0 } };

function estimate(overrides: Partial<EstimateQueueItem> = {}): EstimateQueueItem {
  const value = withPublishedReview({ id: "estimate-one", leadId: "lead-one", projectId: "project-one", propertyType: "2BHK", rooms: [], scopes: [], lineItems: [],
    subtotal: 500, gst: 90, total: 590, status: "client_approved" as const, approvalRequired: false,
    workflowVersion: 3 as const, version: 3, designPlanVersion: 2, designPlanStatus: "ready_for_client" as const,
    quotationApprovalState: "revision_current" as const, currentQuotationApproved: true, requiresClientReapproval: false,
    quotationApprovalSource: "designer_revision" as const,
    currentQuotationApproval: { kind: "designer_revision" as const, reviewRoundId: "post-round", estimateVersion: 3, approvedAt: "2026-11-04T08:00:00Z" },
    lead: { _id: "lead-one", clientName: "Synthetic client", projectName: "Synthetic project", location: "Test location" } });
  value.publishedReview.phase = "post";
  value.publishedReview.workflowVersion = 3;
  return { ...value, ...overrides };
}

function renderReview(value: EstimateQueueItem) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const element = (item: EstimateQueueItem) => <QueryClientProvider client={queryClient}><ClientEstimateDesignReview estimate={item} /></QueryClientProvider>;
  const view = render(element(value));
  return { ...view, queryClient, rerenderEstimate: (item: EstimateQueueItem) => view.rerender(element(item)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: "client-one", role: "client" };
  vi.mocked(designApi.getClientEstimateDrawings).mockResolvedValue(drawings);
  vi.mocked(designApi.getClientPlanWorkspace).mockResolvedValue(plans);
});

describe("Client estimate design review", () => {
  it.each(["approval_unverified", "revision_pending", "design_not_submitted", "source_conflict", "not_client"])("does not request or render design tools for %s", async state => {
    const value = estimate();
    if (state === "approval_unverified") {
      value.quotationApprovalState = undefined;
      value.currentQuotationApproved = undefined;
      value.quotationApprovalSource = undefined;
      value.currentQuotationApproval = undefined;
    }
    if (state === "revision_pending") {
      value.quotationApprovalState = "revision_pending_client";
      value.currentQuotationApproved = false;
      value.requiresClientReapproval = true;
      value.quotationApprovalSource = null;
      value.currentQuotationApproval = null;
    }
    if (state === "design_not_submitted") value.designPlanVersion = 0;
    if (state === "source_conflict") value.reviewSourceIssue = "source_conflict";
    if (state === "not_client") auth.user.role = "designer";
    const view = renderReview(value);
    await act(async () => undefined);
    expect(view.container).toBeEmptyDOMElement();
    expect(screen.queryByRole("group", { name: "Space planning completion" })).not.toBeInTheDocument();
    expect(designApi.getClientEstimateDrawings).not.toHaveBeenCalled();
    expect(designApi.getClientPlanWorkspace).not.toHaveBeenCalled();
  });

  it("fails closed using the published workflow version when top-level metadata is absent", async () => {
    const value = estimate({ workflowVersion: undefined });
    value.quotationApprovalState = undefined;
    value.currentQuotationApproved = undefined;
    value.quotationApprovalSource = undefined;
    value.currentQuotationApproval = undefined;
    expect(clientEstimateWorkflowVersion(value)).toBe(3);
    const view = renderReview(value);
    await act(async () => undefined);
    expect(view.container).toBeEmptyDOMElement();
    expect(designApi.getClientPlanWorkspace).not.toHaveBeenCalled();
  });

  it("allows design-plan review from the unchanged approved initial quotation", async () => {
    const value = estimate({
      quotationApprovalState: "initial_current",
      currentQuotationApproved: true,
      requiresClientReapproval: false,
      quotationApprovalSource: "initial_unchanged",
      currentQuotationApproval: { kind: "initial_unchanged", reviewRoundId: "pre-round", estimateVersion: 2, approvedAt: "2026-11-03T08:00:00Z" }
    });
    value.publishedReview!.phase = "pre";
    renderReview(value);
    expect(await screen.findByRole("button", { name: "Open uploaded plan synthetic-plan.pdf" })).toBeEnabled();
  });

  it("uses the current quotation and design status when the working estimate is a draft", async () => {
    const value = estimate({
      status: "draft",
      designPlanStatus: "ready_for_client",
      quotationApprovalState: "initial_current",
      currentQuotationApproved: true,
      requiresClientReapproval: false,
      quotationApprovalSource: "initial_unchanged",
      currentQuotationApproval: { kind: "initial_unchanged", reviewRoundId: "pre-round", estimateVersion: 2, approvedAt: "2026-11-03T08:00:00Z" }
    });
    value.publishedReview!.phase = "pre";
    renderReview(value);
    expect(await screen.findByRole("button", { name: "Open uploaded plan synthetic-plan.pdf" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Review a drawing" })).toBeEnabled();
    expect(screen.getByRole("group", { name: "Space planning completion" })).toHaveTextContent("project-one:estimate-one");
  });

  it("retains approved post-design drawing, full-plan and project completion tools", async () => {
    renderReview(estimate());
    expect(await screen.findByRole("button", { name: "Open uploaded plan synthetic-plan.pdf" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Drawings and plans", level: 3 })).toBeVisible();
    expect(screen.getByRole("button", { name: "Review a drawing" })).toBeEnabled();
    expect(screen.getByRole("group", { name: "Space planning completion" })).toHaveTextContent("project-one:estimate-one");
    expect(screen.queryByRole("region", { name: "Submitted estimate" })).not.toBeInTheDocument();
    expect(screen.queryByText("Review section-wise estimate")).not.toBeInTheDocument();
  });

  it("keeps submitted design available read-only when the design review stage is closed", async () => {
    renderReview(estimate({ designPlanStatus: "approved" }));
    await userEvent.click(await screen.findByRole("button", { name: "Open uploaded plan synthetic-plan.pdf" }));
    expect(screen.getByRole("dialog", { name: "Review plan" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save plan draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review a drawing" })).toBeDisabled();
  });

  it("keeps drawing review available while the separate full-plan read is pending", async () => {
    vi.mocked(designApi.getClientPlanWorkspace).mockReturnValue(new Promise(() => undefined));
    renderReview(estimate());
    await waitFor(() => expect(screen.getByRole("button", { name: "Review a drawing" })).toBeEnabled());
    expect(screen.getByText("Loading full design pages…")).toBeVisible();
    expect(screen.getByText("Loaded drawing workspace")).toBeVisible();
  });

  it("retires cached drawings and an open plan dialog when the drawing read is denied", async () => {
    const { queryClient } = renderReview(estimate());
    await userEvent.click(await screen.findByRole("button", { name: "Open uploaded plan synthetic-plan.pdf" }));
    expect(screen.getByText("Loaded drawing workspace")).toBeVisible();
    vi.mocked(designApi.getClientEstimateDrawings).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Unavailable"));
    await act(async () => { await queryClient.refetchQueries({ queryKey: designApi.estimateDesignKeys.clientWorkspace("estimate-one") }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry drawings" })).toBeVisible());
    expect(screen.queryByText("Loaded drawing workspace")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review a drawing" })).toBeDisabled();
  });

  it("preserves the review-round source and invalidations for plan annotations and requests", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderReview(estimate());
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(await screen.findByRole("button", { name: "Open uploaded plan synthetic-plan.pdf" }));
    await user.click(screen.getByRole("button", { name: "Save plan draft" }));
    await waitFor(() => expect(designApi.saveClientPlanDraft).toHaveBeenCalledWith("page-one", 0, annotations, "design-round-one"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Preview plan targets" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Preview plan targets" }));
    expect(designApi.previewClientPlanTargets).toHaveBeenCalledWith("page-one", annotations, "design-round-one");
    await user.click(screen.getByRole("button", { name: "Submit plan changes" }));
    await waitFor(() => expect(designApi.submitClientPlanChangeRequest).toHaveBeenCalledWith("page-one", expect.objectContaining({ version: 5, reviewRoundId: "design-round-one", annotations, idempotencyKey: "synthetic-operation" })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Update plan request" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Update plan request" }));
    expect(designApi.updateClientPlanChangeRequest).toHaveBeenCalledWith("request-one", { version: 6, summary: "Updated position", annotations });
    await waitFor(() => {
      for (const key of [designApi.estimateDesignKeys.clientPlanWorkspace("estimate-one"), designApi.estimateDesignKeys.clientWorkspace("estimate-one"), ["client", "estimates"], ["project-workflow"], ["client", "projects"]]) {
        expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: key }));
      }
    });
  });

  it("retains unchanged legacy design-only requests but closes tools when the estimate changes", async () => {
    const value = estimate({ workflowVersion: undefined, status: "client_changes_requested" });
    value.publishedReview!.workflowVersion = undefined;
    value.publishedReview!.status = "pending";
    const { rerenderEstimate } = renderReview(value);
    await userEvent.click(await screen.findByRole("button", { name: "Open uploaded plan synthetic-plan.pdf" }));
    expect(screen.getByRole("button", { name: "Submit plan changes" })).toBeEnabled();
    rerenderEstimate({ ...value, version: 4 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Design tools" })).not.toBeInTheDocument();
  });

  it("retires cached full-plan data and an open dialog after a denied refresh", async () => {
    const { queryClient } = renderReview(estimate());
    await userEvent.click(await screen.findByRole("button", { name: "Open uploaded plan synthetic-plan.pdf" }));
    vi.mocked(designApi.getClientPlanWorkspace).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Unavailable"));
    await act(async () => { await queryClient.refetchQueries({ queryKey: designApi.estimateDesignKeys.clientPlanWorkspace("estimate-one") }); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("complementary", { name: "Design tools" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry design pages" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Review a drawing" })).toBeEnabled();
  });

  it("clears selected plan state when switching projects and closes tools on a source conflict", async () => {
    const { rerenderEstimate } = renderReview(estimate());
    await userEvent.click(await screen.findByRole("button", { name: "Open uploaded plan synthetic-plan.pdf" }));
    rerenderEstimate(estimate({ id: "estimate-two", projectId: "project-two" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(designApi.getClientPlanWorkspace).toHaveBeenCalledWith("estimate-two"));
    rerenderEstimate(estimate({ id: "estimate-two", projectId: "project-two", reviewSourceIssue: "source_conflict" }));
    expect(screen.queryByRole("region", { name: "Design review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Space planning completion" })).not.toBeInTheDocument();
  });

  it("preserves the same estimate's drawing and plan state when legacy approval links its project", async () => {
    const value = estimate({ workflowVersion: undefined, status: "sent_to_client", projectId: null });
    value.publishedReview!.workflowVersion = undefined;
    const { rerenderEstimate } = renderReview(value);
    await userEvent.click(await screen.findByRole("button", { name: "Open uploaded plan synthetic-plan.pdf" }));
    const drawingButton = screen.getByRole("button", { name: "Review a drawing" });
    rerenderEstimate({ ...value, status: "client_approved", projectId: "project-one" });
    expect(screen.getByRole("button", { name: "Review a drawing" })).toBe(drawingButton);
    expect(screen.getByRole("dialog", { name: "Review plan" })).toBeVisible();
  });
});
