import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";

import { ApiError, apiClient } from "../../api/client";
import type { EstimateDesignClientWorkspace, EstimatePlanClientWorkspace } from "../../api/types";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import * as estimatesApi from "../estimates/estimateWorkflowApi";
import { withPublishedReview } from "../estimates/clientEstimateReviewTestUtils";
import { ClientEstimationWorkspace } from "./ClientEstimationWorkspace";
import { EstimateReviewPanel } from "../estimates/EstimateReviewPanel";
import * as designApi from "../leads/estimateDesignApi";
import * as clientApi from "./clientApi";
import { ClientProject } from "./ClientProject";

const auth = vi.hoisted(() => ({ user: { id: "client-a", role: "client" }, status: "authenticated", reviewSession: { id: "session-a" } }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../project-status/ProjectStatusButton", () => ({ ProjectStatusButton: () => null }));
vi.mock("../workflow/KeyCollectionHeader", () => ({ KeyCollectionHeader: () => null }));
vi.mock("../messages", () => ({ ProjectChatNavigation: () => null }));
vi.mock("../workflow/ProjectWorkflowPanel", () => ({ ProjectWorkflowPanel: () => <p>Project workflow</p> }));
vi.mock("../workflow/useDesignWorkflowQuery", () => ({ useDesignWorkflowQuery: () => ({ data: { designerHandoff: { initialEstimateApproved: true, executionAvailable: false } } }) }));
vi.mock("../workflow/SpacePlanningCompletion", () => ({ EstimateSpacePlanningCompletion: () => null }));
vi.mock("./DesignSectionReview", () => ({ DesignSectionReview: () => null }));
vi.mock("./ClientQuotation", () => ({ ClientQuotation: () => <p>Working quotation</p> }));
vi.mock("./ClientEstimateTiers", () => ({ ClientEstimateTiers: () => null }));
vi.mock("./ClientSubmittedQuotationPdf", () => ({ ClientSubmittedQuotationPdf: () => null }));
vi.mock("../estimates/ClientPublishedEstimate", () => ({ ClientPublishedEstimate: () => <p>Published quotation</p> }));

function estimate(projectId = "project-a", workflowVersion: 2 | 3 = 3): estimatesApi.EstimateQueueItem {
  const value = withPublishedReview({
    id: `estimate-${projectId}`, projectId, propertyType: "Villa", rooms: [], scopes: [], lineItems: [],
    subtotal: 100, gst: 18, total: 118, status: "client_approved" as const, approvalRequired: false,
    workflowVersion, version: 3, designPlanVersion: 2, designPlanStatus: "ready_for_client" as const,
    quotationApprovalState: "revision_current" as const, currentQuotationApproved: true, requiresClientReapproval: false,
    quotationApprovalSource: "designer_revision" as const,
    currentQuotationApproval: { kind: "designer_revision" as const, reviewRoundId: `quote-${projectId}`, estimateVersion: 3, approvedAt: "2026-11-27T00:00:00Z" },
    lead: { _id: `lead-${projectId}`, clientName: "Synthetic client", projectName: `Home ${projectId}`, location: "Synthetic location" }
  });
  value.publishedReview.phase = "post";
  value.publishedReview.workflowVersion = workflowVersion;
  return value;
}

function designData(projectId: string) {
  const ids = ["2d", "3d"] as const;
  const mapping = { roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc" as const };
  const drawings: EstimateDesignClientWorkspace = {
    uploads: ids.map(kind => ({
      id: `${projectId}-upload-${kind}`, estimateId: `estimate-${projectId}`, leadId: `lead-${projectId}`, originalFilename: `${projectId}-${kind}.pdf`,
      mimeType: "application/pdf", sizeBytes: 1024, uploaderId: "designer-a", uploadedAt: "2026-11-27T00:00:00Z", extractionStatus: "estimator_review",
      failureCode: null, failureMessage: null, canRetry: false, canDelete: false, purpose: "ordinary", requestReplacement: null,
      layoutType: kind === "2d" ? "layout_2d" : "layout_3d", canClassifyLayoutType: false
    })),
    pages: ids.map(kind => ({ id: `${projectId}-page-${kind}`, uploadId: `${projectId}-upload-${kind}`, pageNumber: 1, width: 400, height: 300 })),
    drawings: ids.map(kind => ({
      ...mapping, id: `${projectId}-drawing-${kind}`, uploadId: `${projectId}-upload-${kind}`, sourcePageId: `${projectId}-page-${kind}`, estimateId: `estimate-${projectId}`,
      active: true, verified: true, detectedTitle: `${projectId} ${kind.toUpperCase()} room`, displayTitle: `${projectId} ${kind.toUpperCase()} room`,
      source: "ocr", roomConfidence: null, scopeConfidence: null, ocrConfidence: 1, roomEvidence: [], scopeEvidence: []
    })),
    revisions: ids.map(kind => ({
      ...mapping, id: `${projectId}-revision-${kind}`, drawingId: `${projectId}-drawing-${kind}`, revisionNumber: 1, sourcePageId: `${projectId}-page-${kind}`,
      crop: { x: 0, y: 0, width: 400, height: 300 }, label: `${kind} room`, reviewStatus: "submitted", submittedAt: "2026-11-27T00:00:00Z", reviewerId: null,
      reviewedAt: null, changeSummary: null, annotationLayerId: null, annotations: null, replacementUploadId: null, replacesRevisionId: null, annotationDraft: null
    })),
    readiness: { ready: false, total: 2, approved: 0, awaitingReview: 2, changesRequested: 0 }
  };
  const pages = ids.map(kind => ({
    id: `${projectId}-page-${kind}`, uploadId: `${projectId}-upload-${kind}`, pageNumber: 1, width: 400, height: 300,
    currentRevisionId: `${projectId}-revision-${kind}`, status: "awaiting_review" as const, thumbnailUrl: `/synthetic/${projectId}-${kind}-thumb`,
    currentImageUrl: `/synthetic/${projectId}-${kind}-full`, annotationDraft: null, reviewRoundId: `round-${projectId}`
  }));
  const plans: EstimatePlanClientWorkspace = { pages, openRequests: [], uploads: ids.map((kind, index) => ({
    id: `${projectId}-upload-${kind}`, originalFilename: `${projectId}-${kind}.pdf`, mimeType: "application/pdf", pageCount: 1,
    layoutType: kind === "2d" ? "layout_2d" : "layout_3d", pages: [pages[index]!]
  })) };
  return { drawings, plans };
}

function setup(options: { rows?: estimatesApi.EstimateQueueItem[]; workflowVersion?: 2 | 3; entry?: string; sourceError?: boolean; sourceGate?: Promise<void>; standalone?: "quotation" | "legacy" } = {}) {
  const state = { rows: options.rows ?? [estimate("project-a", options.workflowVersion)], sourceError: options.sourceError ?? false, sourceGate: options.sourceGate };
  vi.spyOn(clientApi, "getClientProject").mockImplementation(async projectId => ({
    id: projectId, name: `Home ${projectId}`, clientId: auth.user.id, status: "active", location: "Synthetic location", floors: [], progress: 0,
    estimationWorkflowVersion: options.workflowVersion ?? 3,
    clientName: "Synthetic client", clientEmail: "synthetic@example.test", clientMobile: "", clientAddress: "",
    initiatingDesignerId: "designer-a", assignedEstimatorId: null, assignedDesignerIds: ["designer-a"], managerId: null,
    plannedStartAt: "2026-11-27T00:00:00Z", plannedEndAt: "2026-12-27T00:00:00Z", actualStartAt: null, actualEndAt: null,
    createdAt: "2026-11-27T00:00:00Z", updatedAt: "2026-11-27T00:00:00Z"
  }));
  vi.spyOn(clientApi, "getClientVersions").mockResolvedValue([]);
  vi.spyOn(estimatesApi, "getClientEstimates").mockImplementation(async () => {
    await state.sourceGate;
    if (state.sourceError) throw new ApiError(503, "UNAVAILABLE", "Synthetic source unavailable");
    return structuredClone(state.rows);
  });
  const drawingRead = vi.spyOn(designApi, "getClientEstimateDrawings").mockImplementation(async estimateId => designData(estimateId.replace(/^estimate-/, "")).drawings);
  const planRead = vi.spyOn(designApi, "getClientPlanWorkspace").mockImplementation(async estimateId => designData(estimateId.replace(/^estimate-/, "")).plans);
  vi.spyOn(apiClient, "getBlob").mockResolvedValue({ blob: new Blob(["synthetic-image"], { type: "image/png" }), filename: "synthetic.png" });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let navigate!: NavigateFunction;
  function CaptureNavigation() { navigate = useNavigate(); return null; }
  const app = () => <QueryClientProvider client={queryClient}><FeedbackProvider><MemoryRouter initialEntries={[options.entry ?? "/client/projects/project-a"]}>
    <CaptureNavigation />
    <Link to="/client/projects/project-a#design-review">Open project drawings</Link>
    <Link to="/client/projects/project-b">Open other project</Link>
    {options.standalone === "quotation" ? <ClientEstimationWorkspace projectId="project-a" />
      : options.standalone === "legacy" ? <EstimateReviewPanel projectId="project-a" />
        : <Routes><Route path="/client/projects/:projectId" element={<ClientProject />} /></Routes>}
  </MemoryRouter></FeedbackProvider></QueryClientProvider>;
  const view = render(app());
  return { state, drawingRead, planRead, queryClient, ...view, navigate: (path: string) => act(() => navigate(path)), refresh: () => act(async () => { await queryClient.invalidateQueries({ queryKey: estimatesApi.estimateWorkflowKeys.client }); }), rerenderSession: () => view.rerender(app()) };
}

beforeEach(() => {
  auth.user = { id: "client-a", role: "client" }; auth.status = "authenticated"; auth.reviewSession = { id: "session-a" };
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:synthetic-design"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Client project extracted design images", () => {
  it.each([2, 3] as const)("shows both extracted layout images in open Design flow for workflow %s while Estimation is closed", async workflowVersion => {
    setup({ workflowVersion });
    const user = userEvent.setup();
    const two = await screen.findByAltText("project-a 2D room thumbnail");
    const three = await screen.findByAltText("project-a 3D room thumbnail");
    expect(two).toBeVisible(); expect(three).toBeVisible();
    expect(screen.getByRole("button", { name: "Estimation" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Design flow" })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("design-review")).toContainElement(two);
    const plans = screen.getByRole("region", { name: "Full design plan" });
    expect(within(plans).getByText("2D layout")).toBeVisible(); expect(within(plans).getByText("3D layout")).toBeVisible();
    expect(within(plans).getAllByRole("button", { name: /Open uploaded plan/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Approve project-a 2D room" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Estimation" }));
    expect(screen.getAllByRole("img", { name: "project-a 2D room thumbnail" })).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: "project-a 3D room thumbnail" })).toHaveLength(1);
    expect(screen.getAllByRole("region", { name: "Design review" })).toHaveLength(1);
  });

  it("opens and focuses the design destination after navigating to its anchor while collapsed", async () => {
    setup(); const user = userEvent.setup();
    await screen.findByAltText("project-a 2D room thumbnail");
    await user.click(screen.getByRole("button", { name: "Design flow" }));
    expect(screen.getByRole("button", { name: "Design flow" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("link", { name: "Open project drawings" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Design flow" })).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByRole("img", { name: "project-a 2D room thumbnail" })).toBeVisible();
    await waitFor(() => expect(document.getElementById("design-review")).toHaveFocus());
  });

  it("retains approved design images and preview controls while removing approval actions", async () => {
    const row = estimate(); row.designPlanStatus = "approved";
    setup({ rows: [row] });
    expect(await screen.findByAltText("project-a 2D room thumbnail")).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview project-a 3D room" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Approve project-a/ })).not.toBeInTheDocument();
  });

  it("refreshes the verified estimate when a new review task links to the same project's anchor", async () => {
    const row = estimate(); row.designPlanVersion = 0;
    const view = setup({ rows: [row] });
    await screen.findByRole("button", { name: "Design flow" });
    await waitFor(() => expect(screen.queryByText("Loading submitted design drawings…")).not.toBeInTheDocument());
    expect(view.drawingRead).not.toHaveBeenCalled();
    view.state.rows = [estimate()];
    await userEvent.click(screen.getByRole("link", { name: "Open project drawings" }));
    expect(await screen.findByAltText("project-a 2D room thumbnail")).toBeVisible();
  });

  it("loads both current workspaces and closes old-round drafts after task navigation from design v2 to v3", async () => {
    const view = setup();
    const user = userEvent.setup();
    await screen.findByAltText("project-a 2D room thumbnail");
    await user.click(screen.getByRole("button", { name: "Preview project-a 2D room" }));
    const oldDialog = screen.getByRole("dialog", { name: "project-a 2D room preview" });
    await user.type(within(oldDialog).getByRole("textbox", { name: "Change summary" }), "Old round draft");

    const next = designData("project-a");
    next.drawings.drawings.forEach(drawing => { drawing.displayTitle += " round 3"; });
    next.drawings.revisions.forEach(revision => { revision.id += "-v3"; revision.revisionNumber = 2; });
    next.plans.pages.forEach(page => {
      page.currentRevisionId += "-v3";
      page.thumbnailUrl += "-v3";
      page.currentImageUrl += "-v3";
      page.reviewRoundId = "round-project-a-v3";
    });
    view.drawingRead.mockResolvedValue(next.drawings);
    view.planRead.mockResolvedValue(next.plans);
    view.state.rows = [{ ...estimate(), designPlanVersion: 3 }];
    view.navigate("/client/projects/project-a#design-review");

    expect(await screen.findByAltText("project-a 2D room round 3 thumbnail")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(oldDialog).not.toBeInTheDocument();
    expect(view.drawingRead.mock.calls.length).toBeGreaterThan(1);
    expect(view.planRead.mock.calls.length).toBeGreaterThan(1);
    await waitFor(() => {
      const imageUrls = vi.mocked(apiClient.getBlob).mock.calls.map(call => call[0]);
      expect(imageUrls).toContain("/estimate-design-revisions/project-a-revision-2d-v3/image");
    });
    await user.click(screen.getByRole("button", { name: /Open uploaded plan project-a-3d.pdf/ }));
    await waitFor(() => expect(vi.mocked(apiClient.getBlob).mock.calls.map(call => call[0])).toContain("/synthetic/project-a-3d-full-v3"));
  });

  it("refreshes both workspaces during an in-flight metadata refresh without losing same-round drafts", async () => {
    const view = setup();
    const user = userEvent.setup();
    await screen.findByAltText("project-a 2D room thumbnail");
    await user.click(screen.getByRole("button", { name: "Preview project-a 2D room" }));
    const dialog = screen.getByRole("dialog", { name: "project-a 2D room preview" });
    await user.type(within(dialog).getByRole("textbox", { name: "Change summary" }), "Keep this round's draft");

    let release!: () => void;
    view.state.sourceGate = new Promise<void>(resolve => { release = resolve; });
    act(() => { void view.queryClient.invalidateQueries({ queryKey: estimatesApi.estimateWorkflowKeys.client }); });
    await screen.findByText("Checking the latest submitted design…");
    view.navigate("/client/projects/project-a#design-review");
    act(() => release());

    await waitFor(() => {
      expect(view.drawingRead.mock.calls.length).toBeGreaterThan(1);
      expect(view.planRead.mock.calls.length).toBeGreaterThan(1);
      expect(within(dialog).getByRole("textbox", { name: "Change summary" })).toHaveValue("Keep this round's draft");
    });
    expect(screen.getByRole("dialog", { name: "project-a 2D room preview" })).toBe(dialog);
  });

  it.each(["unapproved", "unsubmitted", "source_issue"])("preserves the existing viewer gate for %s designs", async reason => {
    const row = estimate();
    if (reason === "unapproved") row.currentQuotationApproved = false;
    if (reason === "unsubmitted") row.designPlanVersion = 0;
    if (reason === "source_issue") row.reviewSourceIssue = "source_conflict";
    const view = setup({ rows: [row] });
    await screen.findByRole("button", { name: "Design flow" });
    await waitFor(() => expect(screen.queryByText("Loading submitted design drawings…")).not.toBeInTheDocument());
    expect(view.drawingRead).not.toHaveBeenCalled(); expect(view.planRead).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Design review" })).not.toBeInTheDocument();
  });

  it.each(["missing", "foreign", "ambiguous"])("does not load another estimate's images for a %s source", async kind => {
    const rows = kind === "missing" ? [] : kind === "foreign" ? [estimate("project-b")] : [estimate(), { ...estimate(), id: "ambiguous-estimate" }];
    const view = setup({ rows });
    await screen.findByText(kind === "ambiguous" ? "The current design for this project could not be verified. Refresh or contact your Sales team." : "No submitted design is linked to this project yet.");
    expect(view.drawingRead).not.toHaveBeenCalled(); expect(view.planRead).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: /room thumbnail/ })).not.toBeInTheDocument();
  });

  it("shows loading and source failure safely, then restores the existing images after retry", async () => {
    let release!: () => void;
    const view = setup({ sourceGate: new Promise<void>(resolve => { release = resolve; }) });
    expect(await screen.findByText("Loading submitted design drawings…")).toBeVisible();
    expect(view.drawingRead).not.toHaveBeenCalled();
    act(() => release());
    await screen.findByAltText("project-a 2D room thumbnail");
    view.state.sourceError = true;
    await view.refresh();
    expect(await screen.findByText("Submitted design access could not be verified. Refresh before reviewing.")).toBeVisible();
    expect(screen.queryByRole("img", { name: /room thumbnail/ })).not.toBeInTheDocument();
    view.state.sourceError = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry design access" }));
    expect(await screen.findByAltText("project-a 3D room thumbnail")).toBeVisible();
  });

  it("clears the old project's extracted images when navigating to a different project", async () => {
    const view = setup({ rows: [estimate(), estimate("project-b")] });
    await screen.findByAltText("project-a 2D room thumbnail");
    await userEvent.click(screen.getByRole("link", { name: "Open other project" }));
    expect(screen.queryByRole("img", { name: "project-a 2D room thumbnail" })).not.toBeInTheDocument();
    expect(await screen.findByAltText("project-b 3D room thumbnail")).toBeVisible();
    expect(view.drawingRead.mock.calls.map(call => call[0])).toEqual(["estimate-project-a", "estimate-project-b"]);
  });

  it("does not reuse prior-session design images after identity changes", async () => {
    const view = setup();
    await screen.findByAltText("project-a 2D room thumbnail");
    view.state.rows = [estimate("project-b")];
    auth.user = { id: "client-b", role: "client" }; auth.reviewSession = { id: "session-b" };
    view.rerenderSession();
    expect(screen.queryByRole("img", { name: /project-a.*thumbnail/ })).not.toBeInTheDocument();
    await screen.findByText("No submitted design is linked to this project yet.");
    expect(view.drawingRead).toHaveBeenCalledTimes(1);
  });

  it.each(["quotation", "legacy"] as const)("keeps the standalone %s surface's design viewer enabled by default", async standalone => {
    setup({ standalone, workflowVersion: standalone === "legacy" ? 2 : 3 });
    expect(await screen.findByAltText("project-a 2D room thumbnail")).toBeVisible();
    expect(screen.getByRole("img", { name: "project-a 3D room thumbnail" })).toBeVisible();
  });
});
