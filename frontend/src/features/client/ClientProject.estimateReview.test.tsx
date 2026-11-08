import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";

import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { renderApp, renderWithQuery } from "../../test/render";
import { AuthProvider } from "../../auth/AuthProvider";
import { estimateWorkflowKeys, type EstimateQueueItem } from "../estimates/estimateWorkflowApi";
import { withPublishedReview, withQuotationApproval } from "../estimates/clientEstimateReviewTestUtils";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import type { EstimateRequirementsDetail } from "./estimateRequirementsApi";
import type { QuotationDetail } from "./quotationApi";
import { ClientProject } from "./ClientProject";

const client = { id: "client-1", name: "Review Client", email: "review@example.test", role: "client" as const };
const project = { id: "project-villa", name: "Submitted Villa", clientId: client.id, status: "active", location: "Bengaluru", floors: [], progress: 0 };

function estimate(id = "estimate-villa", projectId: string | null = project.id): EstimateQueueItem {
  return withPublishedReview({
    id, projectId, propertyType: "Villa", rooms: [], scopes: ["FC"],
    status: "sent_to_client" as const, approvalRequired: true,
    lineItems: [{ catalogueId: "LEGACY-ITEM", roomName: "Living room", specification: "Custom shelving", unit: "unit", quantity: 2, rate: 400, amount: 750, included: true }],
    subtotal: 750, gst: 135, total: 885,
    lead: { _id: "lead-1", clientName: client.name, clientEmail: client.email, projectName: "Submitted Villa", location: "Bengaluru" }
  });
}

function installApi(rows: EstimateQueueItem[], options: { quotation?: QuotationDetail; requirements?: EstimateRequirementsDetail; projectPanels?: boolean; otherProject?: typeof project; decisionStatus?: number; getError?: () => number | undefined; pending?: Promise<Response>; decisionPending?: Promise<void> } = {}) {
  tokenStorage.set("client-token");
  const decisions: unknown[] = [];
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ data: client });
    if (url.endsWith("/auth/authorization")) return Response.json({ data: options.projectPanels ? authorizationFor("client", [...authorizationFor("client").permissions, "projects.design_workflow.read", "pm.workspace.read"]) : authorizationFor("client") });
    if (url.endsWith(`/projects/${project.id}`)) return Response.json({ data: { ...project, ...(options.quotation ? { estimationWorkflowVersion: 3 } : options.requirements ? { estimationWorkflowVersion: 2 } : {}) } });
    if (options.otherProject && url.endsWith(`/projects/${options.otherProject.id}`)) return Response.json({ data: { ...options.otherProject, estimationWorkflowVersion: 3 } });
    if (options.otherProject && url.endsWith(`/projects/${options.otherProject.id}/quotation`)) return Response.json({ data: { ...notStartedQuotation(), projectId: options.otherProject.id } });
    if (options.otherProject && url.endsWith(`/projects/${options.otherProject.id}/quotation/revision`)) return Response.json({ data: { estimateId: null, estimateVersion: null, pricedRevision: 0, status: "draft", phase: "pre" } });
    if (url.endsWith(`/projects/${project.id}/quotation`) && options.quotation) return Response.json({ data: options.quotation });
    if (url.endsWith(`/projects/${project.id}/quotation/revision`) && options.quotation) return Response.json({ data: { estimateId: options.quotation.estimateId, estimateVersion: options.quotation.estimateVersion, pricedRevision: options.quotation.pricedRevision, status: options.quotation.status, phase: options.quotation.phase } });
    if (url.endsWith(`/projects/${project.id}/estimate-requirements`) && options.requirements) return Response.json({ data: options.requirements });
    if (url.endsWith(`/projects/${project.id}/estimate-tiers`)) return Response.json({ data: { projectId: project.id, estimateId: rows[0]?.id ?? null, estimateVersion: 1, editingAllowed: false, editingBlockReason: "review_pending", totalPaise: 88500, isIncomplete: false, lines: [] } });
    if (url.endsWith("/client/estimates")) {
      if (options.pending) return options.pending;
      const status = options.getError?.();
      return status ? Response.json({ error: { code: "UNAVAILABLE", message: "Not available" } }, { status }) : Response.json({ data: rows });
    }
    if (url.endsWith("/decision") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)); decisions.push(body);
      if (options.decisionPending) await options.decisionPending;
      if (options.decisionStatus) return Response.json({ error: { code: "CONFLICT", message: "A newer estimate was submitted. Refresh to review it." } }, { status: options.decisionStatus });
      rows[0] = { ...rows[0]!, status: body.decision === "approve" ? "client_approved" : "client_changes_requested", publishedReview: { ...rows[0]!.publishedReview!, version: 2, canDecide: false, status: body.decision === "approve" ? "approved" : "changes_requested", decisionNote: body.note } };
      return Response.json({ data: rows[0] });
    }
    if (url.endsWith("/design-workflow")) return Response.json({ data: { projectId: options.otherProject && url.includes(options.otherProject.id) ? options.otherProject.id : project.id, projectName: project.name, estimateApprovalStatus: rows[0]?.status === "client_approved" ? "approved" : "awaiting_approval", serverNow: new Date().toISOString(), floors: [], projectStages: [] } });
    if (url.endsWith("/design-requirements")) return Response.json({ data: { version: 0, sourceToken: "no-selections", entries: [], blockers: [], canReadInternal: false } });
    if (url.includes("/pm/client?")) return Response.json({ data: { tab: "client", availability: "no_data", calculatedAt: "2026-11-05T00:00:00Z", items: [], total: 0, issues: [], sources: [], people: [], actions: [] } });
    if (url.endsWith("/design-sections")) return Response.json({ data: { projectId: project.id, sections: [], progress: { total: 0, approved: 0, rejected: 0, awaitingReview: 0 } } });
    if (url.includes("/design-versions?") || url.includes("/client/project-summaries?")) return Response.json({ data: { items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false } } });
    if (url.endsWith("/latest-approved-versions")) return Response.json({ data: [] });
    if (url.endsWith("/design-drawings")) return Response.json({ data: { uploads: [], pages: [], drawings: [], revisions: [], readiness: { ready: true, total: 0, approved: 0, awaitingReview: 0, changesRequested: 0 } } });
    if (url.endsWith("/plan-review")) return Response.json({ data: { uploads: [], pages: [], openRequests: [] } });
    throw new Error(`Unhandled request: ${url}`);
  });
  return { fetch, decisions };
}

function notStartedQuotation(): QuotationDetail {
  return { projectId: project.id, estimateId: null, estimateVersion: null, workflowVersion: 3, pricedRevision: 0, phase: "pre", status: "draft", reviewState: "draft", editingAllowed: false, editingBlockReason: "not_started", totalPaise: null, isIncomplete: false, rooms: [], lines: [] };
}

function projectRequirements(): EstimateRequirementsDetail {
  return { projectId: project.id, requirementsVersion: 0, estimateVersion: null, phase: "pre", editingAllowed: true, editingBlockReason: null, canResolve: false, requirements: [], mainBaskets: [{ id: "joinery", name: "Joinery" }], rooms: [], indicativeTotalPaise: null, pricingComplete: false };
}

function workingQuotation(): QuotationDetail {
  const source = { revisionId: "revision-one", itemVersion: 2, revisionVersion: 3, uomId: "unit" };
  return { ...notStartedQuotation(), estimateId: "estimate-villa", estimateVersion: 3, pricedRevision: 2,
    status: "sent_to_client", reviewState: "ready_for_approval", editingAllowed: true, editingBlockReason: null, totalPaise: 88500,
    rooms: [{ id: "living", name: "Living room" }], lines: [{ id: "storage", mainLineId: "storage", mainLineName: "Storage", roomId: "living", roomName: "Living room", included: true, source, quantity: 2, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 40000, amountPaise: 75000, choices: [] }] };
}

function expectSubmittedSectionsHidden(fetch?: ReturnType<typeof installApi>["fetch"]) {
  expect(screen.queryByText("Additional requirements")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Your estimate requirements" })).not.toBeInTheDocument();
  expect(screen.queryByText("Project coordination")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Selections requiring your approval" })).not.toBeInTheDocument();
  expect(screen.queryByText("No configured design requirements for the current estimate.")).not.toBeInTheDocument();
  expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add requirement" })).not.toBeInTheDocument();
  if (fetch) expect(fetch.mock.calls.filter(([input]) => /\/(estimate-requirements|design-requirements|pm\/client)(\?|$)/.test(String(input)))).toHaveLength(0);
}

describe("Client project published estimate review", () => {
  it("mounts the v3 quotation editor and blocks approval while unsaved item edits exist", async () => {
    const selected = estimate(); selected.workflowVersion = 3; selected.publishedReview!.workflowVersion = 3; selected.publishedReview!.phase = "pre";
    const source = { revisionId: "revision-one", itemVersion: 2, revisionVersion: 3, uomId: "unit" };
    const quotation: QuotationDetail = { projectId: project.id, estimateId: selected.id, estimateVersion: 3, workflowVersion: 3, pricedRevision: 2, phase: "pre", status: "sent_to_client", reviewState: "ready_for_approval", editingAllowed: true, editingBlockReason: null, totalPaise: 88500, isIncomplete: false, rooms: [{ id: "living", name: "Living room" }], lines: [{ id: "storage", mainLineId: "storage", mainLineName: "Storage", roomId: "living", roomName: "Living room", included: true, source, quantity: 2, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 40000, amountPaise: 75000, choices: [] }] };
    installApi([withQuotationApproval(selected, quotation)], { quotation, requirements: { projectId: project.id, requirementsVersion: 0, estimateVersion: 3, phase: "pre", editingAllowed: true, editingBlockReason: null, canResolve: false, requirements: [], mainBaskets: [], rooms: [], indicativeTotalPaise: null, pricingComplete: false } });
    renderApp([`/client/projects/${project.id}`]); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /Quantity for Storage/ });
    const requirements = await screen.findByText("Additional requirements");
    expect(requirements.closest("details")).not.toHaveAttribute("open");
    expect(quantity.compareDocumentPosition(requirements) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open estimation" })).not.toBeInTheDocument();
    expect(screen.queryByText("Indicative total")).not.toBeInTheDocument();
    expect(screen.queryByText(/No requirements yet/)).not.toBeInTheDocument();
    const approve = await screen.findByRole("button", { name: "Review quotation" });
    expect(approve).toBeEnabled();
    await user.clear(quantity); await user.type(quantity, "4");
    expect(screen.queryByRole("button", { name: "Approve quotation" })).not.toBeInTheDocument();
    expect(screen.getByText(/Save or discard your quotation changes/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByRole("button", { name: "Review quotation" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Design review" })).not.toBeInTheDocument();
  });
  it("omits the three sections and their reads before the first v3 quotation exists", async () => {
    const { fetch } = installApi([], { quotation: notStartedQuotation(), requirements: projectRequirements(), projectPanels: true });
    const view = renderApp([`/client/projects/${project.id}?pm=client`]);
    expect(await screen.findByText(/Your team has not prepared the quotation yet/)).toBeVisible();
    await waitFor(() => expect(view.queryClient.getQueryState(estimateWorkflowKeys.client)?.status).toBe("success"));
    expectSubmittedSectionsHidden(fetch);
    expect(screen.getByRole("link", { name: "Back to projects" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh quotation" })).toBeEnabled();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
  it("omits the three sections immediately after v2 invited membership", async () => {
    const { fetch } = installApi([], { requirements: projectRequirements(), projectPanels: true });
    renderApp([`/client/projects/${project.id}`]);
    expect(await screen.findByText(/No submitted estimate is linked/)).toBeVisible();
    expectSubmittedSectionsHidden(fetch);
  });

  it("keeps populated internal estimates and editable requirements from revealing the sections", async () => {
    const quotation = { ...workingQuotation(), status: "draft" as const, reviewState: "draft" as const };
    const unpublished = { ...estimate(), status: "draft" as const, publishedReview: null };
    const { fetch, decisions } = installApi([unpublished], { quotation, requirements: projectRequirements(), projectPanels: true });
    const view = renderApp([`/client/projects/${project.id}?pm=client`]);
    expect(await screen.findByRole("spinbutton", { name: /Quantity for Storage/ })).toHaveValue(2);
    await waitFor(() => expect(view.queryClient.getQueryState(estimateWorkflowKeys.client)?.status).toBe("success"));
    expectSubmittedSectionsHidden(fetch);
    expect(decisions).toEqual([]);
  });

  it.each(["approved", "changes_requested", "superseded"] as const)("retains sections for a valid %s published review", async status => {
    const quotation = workingQuotation();
    quotation.status = status === "approved" ? "client_approved" : status === "changes_requested" ? "client_changes_requested" : "draft";
    quotation.reviewState = status === "approved" ? "approved" : "awaiting_staff_review";
    const selected = withQuotationApproval(estimate(), quotation);
    selected.status = quotation.status;
    selected.publishedReview = { ...selected.publishedReview!, status, canDecide: false };
    installApi([selected], { quotation, requirements: projectRequirements(), projectPanels: true });
    renderApp([`/client/projects/${project.id}`]);
    expect(await screen.findByText("Additional requirements")).toBeVisible();
    expect(screen.getByText("Project coordination")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Selections requiring your approval" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Review quotation" })).not.toBeInTheDocument();
  });

  it("restores all three sections after Sales submission through the existing quotation refresh", async () => {
    const rows: EstimateQueueItem[] = [];
    const options = { quotation: notStartedQuotation(), requirements: projectRequirements(), projectPanels: true };
    const { fetch, decisions } = installApi(rows, options);
    const view = renderApp([`/client/projects/${project.id}?pm=client`]);
    await screen.findByText(/Your team has not prepared the quotation yet/);
    expectSubmittedSectionsHidden(fetch);
    const savedRequirements = structuredClone(options.requirements);
    options.quotation = workingQuotation();
    rows.push(withQuotationApproval(estimate(), options.quotation));
    await userEvent.click(screen.getByRole("button", { name: "Refresh quotation" }));
    expect(await screen.findByText("Additional requirements")).toBeVisible();
    expect(screen.getByText("Project coordination")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Selections requiring your approval" })).toBeVisible();
    expect(await screen.findByRole("region", { name: "Client follow-up" })).toBeVisible();
    expect(await screen.findByRole("spinbutton", { name: /Quantity for Storage/ })).toHaveValue(2);
    expect(options.requirements).toEqual(savedRequirements);
    expect(decisions).toEqual([]);
    expect(fetch.mock.calls.filter(([input, init]) => /\/(estimate-requirements(?:\/[^/?]+)?|quotation|decision)(\?|$)/.test(String(input)) && init?.method && init.method !== "GET")).toHaveLength(0);
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("restores v2 sections when the shared review query receives its first publication", async () => {
    const rows: EstimateQueueItem[] = [];
    installApi(rows, { requirements: projectRequirements(), projectPanels: true });
    const view = renderApp([`/client/projects/${project.id}`]);
    await screen.findByText(/No submitted estimate is linked/);
    expectSubmittedSectionsHidden();
    rows.push(estimate());
    await act(async () => { await view.queryClient.refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    expect(await screen.findByRole("heading", { name: "Your estimate requirements" })).toBeVisible();
    expect(screen.getByText("Project coordination")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Selections requiring your approval" })).toBeVisible();
  });

  it.each(["foreign", "duplicate", "missing_snapshot", "source_conflict"] as const)("hides all three sections for %s publication evidence", async issue => {
    const quotation = workingQuotation();
    const selected = withQuotationApproval(estimate(), quotation);
    const rows = issue === "foreign" ? [{ ...selected, projectId: "project-other" }]
      : issue === "duplicate" ? [selected, { ...selected, id: "estimate-other" }]
      : [{ ...selected, reviewSourceIssue: issue, ...(issue === "missing_snapshot" ? { publishedReview: null } : {}) }];
    const { fetch } = installApi(rows, { quotation, requirements: projectRequirements(), projectPanels: true });
    const view = renderApp([`/client/projects/${project.id}?pm=client`]);
    await screen.findByRole("spinbutton", { name: /Quantity for Storage/ });
    await waitFor(() => expect(view.queryClient.getQueryState(estimateWorkflowKeys.client)?.status).toBe("success"));
    expectSubmittedSectionsHidden(fetch);
  });

  it("does not flash sections before the initial publication lookup succeeds", async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { release = resolve; });
    const quotation = workingQuotation(), selected = withQuotationApproval(estimate(), quotation);
    const { fetch } = installApi([selected], { quotation, requirements: projectRequirements(), projectPanels: true, pending });
    renderApp([`/client/projects/${project.id}`]);
    await screen.findByRole("spinbutton", { name: /Quantity for Storage/ });
    expectSubmittedSectionsHidden(fetch);
    await act(async () => { release(Response.json({ data: [selected] })); });
    expect(await screen.findByText("Additional requirements")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Selections requiring your approval" })).toBeVisible();
  });

  it.each([403, 500])("hides retained sections after a %s refresh and recovers without losing quotation edits", async status => {
    let failure: number | undefined;
    const quotation = workingQuotation(), rows = [withQuotationApproval(estimate(), quotation)];
    installApi(rows, { quotation, requirements: projectRequirements(), projectPanels: true, getError: () => failure });
    const view = renderApp([`/client/projects/${project.id}`]), user = userEvent.setup();
    await screen.findByRole("heading", { name: "Selections requiring your approval" });
    const quantity = screen.getByRole("spinbutton", { name: /Quantity for Storage/ });
    await user.clear(quantity); await user.type(quantity, "6");
    failure = status;
    await act(async () => { await view.queryClient.refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    await waitFor(() => expectSubmittedSectionsHidden());
    expect(quantity).toHaveValue(6);
    failure = undefined;
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    expect(await screen.findByText("Additional requirements")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Selections requiring your approval" })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: /Quantity for Storage/ })).toHaveValue(6);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Review quotation" })).not.toBeInTheDocument();
  });

  it("keeps mounted sections through a background publication check", async () => {
    const quotation = workingQuotation(), rows = [withQuotationApproval(estimate(), quotation)];
    const options: Parameters<typeof installApi>[1] = { quotation, requirements: projectRequirements(), projectPanels: true };
    installApi(rows, options);
    const view = renderApp([`/client/projects/${project.id}`]);
    const requirements = await screen.findByText("Additional requirements");
    await screen.findByRole("heading", { name: "Selections requiring your approval" });
    let release!: (response: Response) => void;
    options.pending = new Promise<Response>(resolve => { release = resolve; });
    let refresh!: Promise<unknown>;
    act(() => { refresh = view.queryClient.refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    await waitFor(() => expect(view.queryClient.getQueryState(estimateWorkflowKeys.client)?.fetchStatus).toBe("fetching"));
    expect(screen.getByText("Additional requirements")).toBe(requirements);
    expect(screen.getByRole("heading", { name: "Selections requiring your approval" })).toBeVisible();
    await act(async () => { release(Response.json({ data: rows })); await refresh; });
    expect(screen.getByText("Additional requirements")).toBe(requirements);
  });

  it("does not reuse publication evidence when navigating to another invited project", async () => {
    const quotation = workingQuotation(), rows = [withQuotationApproval(estimate(), quotation)];
    const otherProject = { ...project, id: "project-other", name: "Unsubmitted Cottage" };
    const { fetch } = installApi(rows, { quotation, requirements: projectRequirements(), projectPanels: true, otherProject });
    renderWithQuery(<MemoryRouter initialEntries={[`/client/projects/${project.id}`]}><AuthProvider>
      <Link to={`/client/projects/${otherProject.id}`}>Open other project</Link>
      <Routes><Route path="/client/projects/:projectId" element={<ClientProject />} /></Routes>
    </AuthProvider></MemoryRouter>);
    await screen.findByRole("heading", { name: "Selections requiring your approval" });
    await userEvent.click(screen.getByRole("link", { name: "Open other project" }));
    expect(await screen.findByRole("heading", { name: otherProject.name })).toBeVisible();
    await screen.findByText(/Your team has not prepared the quotation yet/);
    expectSubmittedSectionsHidden();
    expect(fetch.mock.calls.filter(([input]) => String(input).includes(otherProject.id) && /\/(estimate-requirements|design-requirements|pm\/client)(\?|$)/.test(String(input)))).toHaveLength(0);
  });

  it("names the immutable pre-estimate phase on its approval action", async () => {
    const selected = estimate(); selected.publishedReview!.phase = "pre";
    installApi([selected]); renderApp([`/client/projects/${project.id}`]);
    await userEvent.click(await screen.findByRole("button", { name: "Approve pre-estimate" }));
    expect(screen.getByRole("dialog", { name: "Approve this pre-estimate?" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText("Pre-estimate approved")).toBeVisible();
  });

  it("keeps a withdrawn submission visible as history without presenting a pending decision", async () => {
    const selected = estimate(); selected.status = "draft";
    selected.publishedReview = { ...selected.publishedReview!, phase: "pre", status: "superseded", canDecide: false };
    installApi([selected]); renderApp([`/client/projects/${project.id}`]);
    expect(await screen.findByText("Review withdrawn")).toBeVisible();
    expect(screen.getByText("This submitted review was withdrawn")).toBeVisible();
    expect(screen.queryByText("Awaiting your review")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve pre-estimate" })).not.toBeInTheDocument();
  });

  it("compares immutable pre/final snapshots and keeps unchanged final approval explicit", async () => {
    const selected = estimate(); selected.publishedReview!.phase = "post";
    selected.preApprovedReview = { reviewRoundId: "pre-round", estimateVersion: 1, snapshot: structuredClone(selected.publishedReview!.snapshot) };
    selected.changesFromPre = { addedLineIds: [], removedLineIds: [], changedLineIds: [], scopeChanged: false, noChanges: true, beforeTotal: 885, afterTotal: 885 };
    selected.total = 999999;
    const { decisions } = installApi([selected]);
    renderApp([`/client/projects/${project.id}`]);
    expect(await screen.findByText("No changes from pre-estimate")).toBeVisible();
    expect(screen.queryByText("₹9,99,999")).not.toBeInTheDocument();
    expect(decisions).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Approve final post-estimate" }));
    expect(screen.getByRole("dialog", { name: "Approve this final post-estimate?" })).toHaveTextContent("Final approval closes estimate changes.");
    await userEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText("Final post-estimate approved")).toBeVisible();
    expect(decisions).toHaveLength(1);
  });

  it("shows changed scope by stable line identity and hides final approval if its comparison source is missing", async () => {
    const selected = estimate(); selected.publishedReview!.phase = "post";
    const snapshot = selected.publishedReview!.snapshot;
    snapshot.lineItems[0]!.id = "line-one";
    selected.preApprovedReview = { reviewRoundId: "pre-round", estimateVersion: 1, snapshot: structuredClone(snapshot) };
    selected.preApprovedReview.snapshot.lineItems[0]!.quantity = 1;
    selected.changesFromPre = { addedLineIds: [], removedLineIds: [], changedLineIds: ["line-one"], scopeChanged: true, noChanges: false, beforeTotal: 800, afterTotal: 885 };
    installApi([selected]); const { queryClient } = renderApp([`/client/projects/${project.id}`]);
    expect(await screen.findByText(/Updated: Custom shelving · Living room · 2 unit/)).toBeVisible();
    expect(screen.getByText(/Room or scope details have changed/)).toBeVisible();
    selected.preApprovedReview = null;
    await act(async () => { await queryClient.refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    expect(await screen.findByText(/comparison with your approved pre-estimate is unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve final post-estimate" })).not.toBeInTheDocument();
  });

  it("shows configured basket snapshots and paise without exposing opaque line IDs", async () => {
    const configured = estimate();
    configured.publishedReview!.snapshot.lineItems = [{
      id: "estimate-line-1", source: "configuration", catalogueId: "line-internal-1",
      mainBasketId: "basket-1", mainBasketName: "Joinery", subBasketId: "sub-1",
      subBasketName: "Wardrobes", mainLineId: "line-internal-1", mainLineName: "Wardrobe carcass", estimateNotes: ["Maintain removable service access"],
      roomId: "room-1", roomName: "Master Bedroom", specification: null,
      unit: "sq ft", uomName: "sq ft", rate: 80.05, ratePaise: 8005,
      quantity: 1.25, included: true, amount: 100.06, amountPaise: 10006
    }];
    configured.publishedReview!.snapshot.subtotal = 100.06;
    configured.publishedReview!.snapshot.subtotalPaise = 10006;
    configured.publishedReview!.snapshot.gstPaise = 1801;
    configured.publishedReview!.snapshot.totalPaise = 11807;
    installApi([configured]);
    renderApp([`/client/projects/${project.id}`]);
    const review = await screen.findByRole("region", { name: "Submitted estimate" });
    expect(within(review).getByText("Joinery")).toBeVisible();
    expect(within(review).getByText("Wardrobe carcass")).toBeVisible();
    expect(within(review).getByText("Wardrobes · Master Bedroom")).toBeVisible();
    expect(within(review).getByText("Maintain removable service access")).toBeVisible();
    expect(within(review).getByText("1.25 sq ft × ₹80.05")).toBeVisible();
    expect(within(review).getAllByText("₹100.06").length).toBeGreaterThan(0);
    expect(within(review).queryByText("line-internal-1")).not.toBeInTheDocument();
  });

  it("shows the exact project's submitted amounts and unknown items as read only, then confirms the displayed round", async () => {
    const selected = estimate();
    selected.total = 999999;
    const historicalLine = selected.lineItems[0]!;
    if (historicalLine.source === "configuration") throw new Error("Expected a historical estimate line.");
    selected.lineItems = [{ ...historicalLine, specification: "Unsubmitted change" }];
    const other = estimate("estimate-other", "project-other");
    other.publishedReview!.snapshot.projectName = "Private other project";
    other.publishedReview!.snapshot.total = 47200;
    const { decisions } = installApi([selected, other]);
    const user = userEvent.setup();
    const { queryClient } = renderApp([`/client/projects/${project.id}`]);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const review = await screen.findByRole("region", { name: "Submitted estimate" });
    expect(within(review).getByText("LEGACY-ITEM")).toBeVisible();
    expect(within(review).getByText("Custom shelving")).toBeVisible();
    expect(within(review).getAllByText("₹750").length).toBeGreaterThan(0);
    expect(within(review).getByText("₹885")).toBeVisible();
    expect(screen.queryByText("Unsubmitted change")).not.toBeInTheDocument();
    expect(screen.queryByText("Private other project")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Approve estimate" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Approve this estimate?" });
    expect(within(dialog).getByText("₹885")).toBeVisible();
    expect(within(dialog).getByText("Version 3 · Submission 1")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(decisions).toEqual([]);
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText("Estimate approved")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("region", { name: "Submitted estimate" })).toHaveFocus());
    expect(decisions).toEqual([{ decision: "approve", note: "", reviewRoundId: "round-estimate-villa", reviewRoundVersion: 1 }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectWorkflowKeys.all });
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
  });

  it("requires explained changes, records the trimmed note, and offers the new submitted version after revision", async () => {
    const rows = [estimate()];
    const { decisions } = installApi(rows);
    const user = userEvent.setup();
    const { queryClient } = renderApp([`/client/projects/${project.id}`]);
    await user.click(await screen.findByRole("button", { name: "Request changes" }));
    const dialog = screen.getByRole("dialog", { name: "Request estimate changes" });
    const note = within(dialog).getByRole("textbox", { name: /Changes needed/ });
    expect(note).toHaveFocus();
    expect(note).toHaveAttribute("maxLength", "1000");
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Send change request" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Describe the changes");
    expect(decisions).toEqual([]);
    await user.type(note, "  Use oak shelving in the living room.  ");
    await user.click(within(dialog).getByRole("button", { name: "Send change request" }));
    expect(await screen.findByText("Sales is revising your estimate")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("region", { name: "Submitted estimate" })).toHaveFocus());
    expect(screen.getByText("Use oak shelving in the living room.")).toBeVisible();
    expect(decisions).toEqual([{ decision: "request_changes", note: "Use oak shelving in the living room.", reviewRoundId: "round-estimate-villa", reviewRoundVersion: 1 }]);
    rows[0] = { ...rows[0]!, status: "draft", total: 800000, rooms: [], scopes: [] };
    await act(async () => { await queryClient.refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    expect(screen.getAllByText("₹885").length).toBeGreaterThan(0);
    expect(screen.queryByText("₹8,00,000")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    rows[0] = estimate();
    rows[0].publishedReview = { ...rows[0].publishedReview!, id: "round-second", version: 1, estimateVersion: 5, sendGeneration: 2 };
    await act(async () => { await queryClient.refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    expect(await screen.findByText("Version 5 · Submission 2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve estimate" })).toBeEnabled();
  });

  it("locks a failed stale decision until refresh and closes its confirmation", async () => {
    installApi([estimate()], { decisionStatus: 409 });
    const user = userEvent.setup();
    renderApp([`/client/projects/${project.id}`]);
    await user.click(await screen.findByRole("button", { name: "Approve estimate" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText("This estimate has changed")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh estimate" }));
    expect(await screen.findByRole("button", { name: "Approve estimate" })).toBeEnabled();
  });

  it.each(["none", "ambiguous", "missing", "conflict"] as const)("fails closed for a %s review source", async (state) => {
    const rows = state === "none" ? [estimate("other", "project-other")] : state === "ambiguous" ? [estimate(), estimate("duplicate")] : [estimate()];
    if (state === "missing") rows[0]!.publishedReview = null;
    if (state === "conflict") rows[0]!.reviewSourceIssue = "source_conflict";
    installApi(rows);
    renderApp([`/client/projects/${project.id}`]);
    const text = state === "none" ? /No submitted estimate is linked/ : state === "ambiguous" ? /current estimate for this project could not be verified/ : "Submitted estimate unavailable";
    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export as PDF" })).not.toBeInTheDocument();
  });

  it("hides cached review content after a denied read and offers retry", async () => {
    let status: number | undefined;
    installApi([estimate()], { getError: () => status });
    const { queryClient } = renderApp([`/client/projects/${project.id}`]);
    expect(await screen.findByText("Custom shelving")).toBeVisible();
    status = 403;
    await act(async () => { await queryClient.refetchQueries({ queryKey: estimateWorkflowKeys.client }); });
    await waitFor(() => expect(screen.queryByText("Custom shelving")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Retry estimates" })).toBeVisible();
    status = 503;
    await userEvent.click(screen.getByRole("button", { name: "Retry estimates" }));
    expect(screen.queryByText("Custom shelving")).not.toBeInTheDocument();
  });

  it("keeps an unlinked estimate actionable on the dashboard", async () => {
    installApi([estimate("estimate-unlinked", null)]);
    renderApp(["/client?estimate=estimate-unlinked"]);
    expect(await screen.findByRole("button", { name: "Approve estimate" })).toBeEnabled();
    expect(screen.getByText("Custom shelving")).toBeVisible();
  });

  it("shows a loading state until a submitted review arrives", async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    installApi([], { pending });
    renderApp([`/client/projects/${project.id}`]);
    expect(await screen.findByText("Loading submitted estimates…")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
    await act(async () => { release(Response.json({ data: [estimate()] })); });
    expect(await screen.findByRole("button", { name: "Approve estimate" })).toBeEnabled();
  });

  it("prevents a duplicate submit while a decision is saving", async () => {
    let release!: () => void;
    const decisionPending = new Promise<void>((resolve) => { release = resolve; });
    const { decisions } = installApi([estimate()], { decisionPending });
    const user = userEvent.setup();
    renderApp([`/client/projects/${project.id}`]);
    await user.click(await screen.findByRole("button", { name: "Approve estimate" }));
    const confirm = screen.getByRole("button", { name: "Confirm approval" });
    await user.dblClick(confirm);
    expect(confirm).toBeDisabled();
    expect(decisions).toHaveLength(1);
    await act(async () => { release(); });
    expect(await screen.findByText("Estimate approved")).toBeVisible();
  });

  it("closes the old confirmation when a newer submitted round arrives", async () => {
    installApi([estimate()]);
    const user = userEvent.setup();
    const { queryClient } = renderApp([`/client/projects/${project.id}`]);
    await user.click(await screen.findByRole("button", { name: "Approve estimate" }));
    const next = estimate();
    next.publishedReview = { ...next.publishedReview!, id: "new-round", estimateVersion: 7, sendGeneration: 2 };
    act(() => { queryClient.setQueryData(estimateWorkflowKeys.client, [next]); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Version 7 · Submission 2")).toBeVisible();
  });
});
