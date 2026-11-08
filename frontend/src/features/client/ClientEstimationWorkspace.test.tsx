import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { withPublishedReview, withQuotationApproval } from "../estimates/clientEstimateReviewTestUtils";
import { estimateWorkflowKeys, type EstimateQueueItem } from "../estimates/estimateWorkflowApi";
import { ClientEstimationWorkspace } from "./ClientEstimationWorkspace";
import { canReviewCurrentQuotation } from "./clientQuotationReview";
import { estimateTiersKeys, type EstimateTiersDetail } from "./estimateTiersApi";
import { quotationKeys, type QuotationDetail, type QuotationRevision } from "./quotationApi";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "client-one", role: "client" }, reviewSession: null }) }));

function fixture(phase: "pre" | "post" = "pre") {
  const source = { revisionId: "revision-one", itemVersion: 2, revisionVersion: 3, uomId: "unit" };
  const detail: QuotationDetail = { projectId: "project-one", estimateId: "estimate-one", estimateVersion: 3, workflowVersion: 3,
    pricedRevision: 2, phase, status: "sent_to_client", reviewState: "ready_for_approval", editingAllowed: true, editingBlockReason: null,
    totalPaise: 118000, isIncomplete: false, rooms: [{ id: "kitchen", name: "Kitchen" }],
    baskets: [{ id: "joinery", name: "Joinery", subBaskets: [{ id: "cabinet", name: "Cabinet work" }] }],
    lines: [{ id: "line-one", mainLineId: "cabinet", mainLineName: "Current cabinet", roomId: "kitchen", roomName: "Kitchen", mainBasketId: "joinery", mainBasketName: "Joinery",
      subBasketId: "cabinet", subBasketName: "Cabinet work", included: true, source, quantity: 2, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 50000, amountPaise: 100000,
      choices: [{ modeTier: "signature", available: true, unavailableReason: null, source, ratePaise: 50000, amountPaise: 100000 }] }] };
  if (phase === "post") Object.assign(detail, {
    quotationApprovalState: "revision_pending_client" as const,
    currentQuotationApproved: false,
    requiresClientReapproval: true,
    quotationApprovalSource: null,
    currentQuotationApproval: null
  });
  const estimate: EstimateQueueItem = withQuotationApproval(withPublishedReview({ id: "estimate-one", projectId: detail.projectId, propertyType: "Villa", rooms: [], scopes: [], status: "sent_to_client" as const, approvalRequired: true,
    lineItems: [{ id: "line-one", source: "legacy", catalogueId: "cabinet", roomId: "kitchen", roomName: "Kitchen", specification: "Submitted cabinet", unit: "Unit", quantity: 2, rate: 350, amount: 700, included: true }],
    subtotal: 700, gst: 126, total: 826, lead: { _id: "lead-one", clientName: "Synthetic Client", projectName: "Synthetic Home", location: "Test location" } }), detail);
  Object.assign(estimate.publishedReview!.snapshot.lineItems[0]!, { source: "configuration", mainLineName: "Submitted cabinet", mainLineId: "cabinet", mainBasketId: "joinery", mainBasketName: "Submitted joinery", subBasketId: "cabinet", subBasketName: "Submitted cabinets" });
  if (phase === "post") {
    estimate.estimation!.salesApproval = null;
    estimate.preApprovedReview = { reviewRoundId: "approved-pre-round", estimateVersion: 2, snapshot: { ...estimate.publishedReview!.snapshot } };
    estimate.changesFromPre = { addedLineIds: [], removedLineIds: [], changedLineIds: [], scopeChanged: false, noChanges: true, beforeTotal: 826, afterTotal: 826 };
  }
  return { detail, estimate };
}

function revision(detail: QuotationDetail): QuotationRevision {
  return { estimateId: detail.estimateId!, estimateVersion: detail.estimateVersion!, pricedRevision: detail.pricedRevision, phase: detail.phase, status: detail.status };
}

function setup(options: { workspace?: boolean; phase?: "pre" | "post"; quotationError?: number; tiersError?: number; tiersProjectId?: string; tiersGate?: Promise<void> } = {}) {
  const initial = fixture(options.phase);
  const tiers: EstimateTiersDetail = { projectId: options.tiersProjectId ?? "project-one", estimateId: null, estimateVersion: null, editingAllowed: false,
    editingBlockReason: "not_started", totalPaise: null, isIncomplete: false, lines: [] };
  const state = { ...initial, queue: options.quotationError ? [] : [initial.estimate], quotationError: options.quotationError ?? 0,
    tiers, tiersError: options.tiersError ?? 0, tiersRequests: 0, queueError: 0, saveError: 0, decisionError: 0, pdfError: 0, revisionVersion: null as number | null };
  const decisions: Array<Record<string, unknown>> = [], saves: Array<Record<string, unknown>> = [];
  let cache!: QueryClient;
  function Capture() { cache = useQueryClient(); return null; }
  server.use(
    http.get("/api/v1/projects/project-one/quotation", () => state.quotationError ? HttpResponse.json({ error: { message: "Unavailable" } }, { status: state.quotationError }) : HttpResponse.json({ data: state.detail })),
    http.get("/api/v1/projects/project-one/estimate-tiers", async () => {
      state.tiersRequests += 1; await options.tiersGate;
      return state.tiersError ? HttpResponse.json({ error: { message: "Unavailable" } }, { status: state.tiersError }) : HttpResponse.json({ data: state.tiers });
    }),
    http.get("/api/v1/projects/project-one/quotation/revision", () => HttpResponse.json({ data: { ...revision(state.detail), ...(state.revisionVersion === null ? {} : { estimateVersion: state.revisionVersion }) } })),
    http.get("/api/v1/client/estimates", () => state.queueError ? HttpResponse.json({ error: { message: "Unavailable" } }, { status: state.queueError }) : HttpResponse.json({ data: state.queue })),
    http.get("/api/v1/client/estimates/estimate-one/pdf", () => state.pdfError ? HttpResponse.json({ error: { message: "Unavailable" } }, { status: state.pdfError }) : new HttpResponse("synthetic-pdf", { headers: { "content-type": "application/pdf" } })),
    http.patch("/api/v1/projects/project-one/quotation", async ({ request }) => {
      const body = await request.json() as { expectedVersion: number; operations: Array<{ quantity?: number }> }; saves.push(body);
      if (state.saveError) return HttpResponse.json({ error: { message: "Save rejected" } }, { status: state.saveError });
      state.detail = { ...state.detail, estimateVersion: 4, pricedRevision: 3, status: "draft", reviewState: "awaiting_staff_review",
        ...(state.detail.phase === "post" ? { quotationApprovalState: "revision_draft" as const, currentQuotationApproved: false, requiresClientReapproval: true, quotationApprovalSource: null, currentQuotationApproval: null } : {}),
        lines: state.detail.lines.map(line => ({ ...line, quantity: body.operations[0]!.quantity ?? line.quantity })) };
      state.estimate = { ...state.estimate, version: 4, status: "draft", estimation: { ...state.estimate.estimation!, status: "draft", pendingReviewRoundId: null, salesApproval: null, pricedRevision: 3 },
        ...(state.detail.phase === "post" ? { quotationApprovalState: "revision_draft" as const, currentQuotationApproved: false, requiresClientReapproval: true, quotationApprovalSource: null, currentQuotationApproval: null } : {}),
        publishedReview: { ...state.estimate.publishedReview!, status: "superseded", canDecide: false } };
      state.queue = [state.estimate]; return HttpResponse.json({ data: state.detail });
    }),
    http.post("/api/v1/client/estimates/estimate-one/decision", async ({ request }) => {
      decisions.push(await request.json() as Record<string, unknown>);
      if (state.decisionError) return HttpResponse.json({ error: { message: "A newer estimate was submitted." } }, { status: state.decisionError });
      state.estimate = { ...state.estimate, status: "client_approved", publishedReview: { ...state.estimate.publishedReview!, version: 2, status: "approved", canDecide: false } };
      state.queue = [state.estimate]; return HttpResponse.json({ data: state.estimate });
    })
  );
  const rendered = renderWithQuery(<><Capture /><ClientEstimationWorkspace projectId="project-one" workspace={options.workspace} /></>);
  return { ...rendered, state, decisions, saves, refresh: () => act(async () => { await cache.invalidateQueries(); }),
    refreshTiers: () => act(async () => { await cache.invalidateQueries({ queryKey: estimateTiersKeys.detail("project-one") }); }),
    refreshReview: () => act(async () => { await cache.invalidateQueries({ queryKey: estimateWorkflowKeys.client }); }),
    mismatchRevision: () => act(async () => { state.revisionVersion = 99; await cache.refetchQueries({ queryKey: quotationKeys.revision("project-one") }); }) };
}

describe("Unified Client estimation", () => {
  it("shows the standalone ID only after the authorized availability probe and clears it on denial", async () => {
    let release!: () => void;
    const tiersGate = new Promise<void>(resolve => { release = resolve; });
    const view = setup({ quotationError: 404, tiersGate, workspace: true });
    view.state.tiers = { ...view.state.tiers, projectNumber: "Lisno000031" };
    expect(await screen.findByText("Checking quotation availability…")).toBeVisible();
    expect(screen.queryByText(/Project ID/)).not.toBeInTheDocument();
    await act(async () => { release(); });
    expect(await screen.findByText("Project ID: Lisno000031")).toBeVisible();
    view.state.tiersError = 403; await view.refreshTiers();
    expect(await screen.findByText(/Quotation access is unavailable/)).toBeVisible();
    expect(screen.queryByText(/Project ID/)).not.toBeInTheDocument();
  });

  it("shows not-started after an actual quotation 404 only when the authorized project probe succeeds", async () => {
    let release!: () => void;
    const tiersGate = new Promise<void>(resolve => { release = resolve; });
    const view = setup({ quotationError: 404, tiersGate });
    expect(await screen.findByText("Checking quotation availability…")).toBeVisible();
    expect(screen.queryByText(/has not prepared the quotation yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    await act(async () => { release(); });
    expect(await screen.findByText(/has not prepared the quotation yet/)).toBeVisible();
    expect(view.state.tiersRequests).toBe(1);
    expect(screen.queryByRole("button", { name: /Approve|Review for/ })).not.toBeInTheDocument();
  });

  it("loads the newly submitted review when refreshing a previously not-started quotation", async () => {
    const view = setup({ quotationError: 404 }), user = userEvent.setup();
    await screen.findByText(/has not prepared the quotation yet/);
    view.state.quotationError = 0;
    view.state.queue = [view.state.estimate];
    await user.click(screen.getByRole("button", { name: "Refresh quotation" }));
    expect(await screen.findByRole("button", { name: "Review for pre-design approval" })).toBeEnabled();
    expect(screen.getByRole("spinbutton", { name: /Quantity for Current cabinet/ })).toHaveValue(2);
    expect(view.state.tiersRequests).toBe(1);
    expect(view.decisions).toEqual([]);
    expect(view.saves).toEqual([]);
  });

  it.each([403, 500])("does not infer not-started from a quotation 404 when the authorized probe fails with %s", async tiersError => {
    const view = setup({ quotationError: 404, tiersError });
    await waitFor(() => expect(view.state.tiersRequests).toBe(1));
    expect(await screen.findByText(/Quotation access is unavailable/)).toBeVisible();
    expect(screen.queryByText(/has not prepared the quotation yet/)).not.toBeInTheDocument();
  });

  it("rejects foreign-project not-started proof", async () => {
    const view = setup({ quotationError: 404, tiersProjectId: "project-other" });
    await waitFor(() => expect(view.state.tiersRequests).toBe(1));
    expect(await screen.findByText(/Quotation access is unavailable/)).toBeVisible();
    expect(screen.queryByText(/has not prepared the quotation yet/)).not.toBeInTheDocument();
  });

  it("does not probe a denied quotation and does not reuse not-started proof after a denied refresh", async () => {
    const view = setup({ quotationError: 404 }), user = userEvent.setup();
    expect(await screen.findByText(/has not prepared the quotation yet/)).toBeVisible();
    view.state.tiersError = 403; await view.refreshTiers();
    expect(await screen.findByText(/Quotation access is unavailable/)).toBeVisible();
    expect(screen.queryByText(/has not prepared the quotation yet/)).not.toBeInTheDocument();
    view.state.tiersError = 500; await view.refreshTiers();
    expect(screen.queryByText(/has not prepared the quotation yet/)).not.toBeInTheDocument();
    view.state.quotationError = 403; view.state.tiersError = 0;
    const requestsBeforeDeniedQuote = view.state.tiersRequests;
    await user.click(screen.getByRole("button", { name: "Refresh quotation" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh quotation" })).toBeEnabled());
    expect(view.state.tiersRequests).toBe(requestsBeforeDeniedQuote);
    expect(screen.queryByText(/has not prepared the quotation yet/)).not.toBeInTheDocument();
    view.state.quotationError = 404;
    await user.click(screen.getByRole("button", { name: "Refresh quotation" }));
    expect(await screen.findByText(/has not prepared the quotation yet/)).toBeVisible();
  });

  it("preserves the local draft when a later missing quotation is confirmed not-started", async () => {
    const view = setup(), user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /Quantity for Current cabinet/ });
    await user.clear(quantity); await user.type(quantity, "6");
    view.state.quotationError = 404; await view.refresh();
    await waitFor(() => expect(view.state.tiersRequests).toBeGreaterThan(0));
    expect(await screen.findByText(/Quotation access is unavailable/)).toBeVisible();
    expect(screen.queryByText(/has not prepared the quotation yet/)).not.toBeInTheDocument();
    view.state.quotationError = 0;
    await user.click(screen.getByRole("button", { name: "Refresh quotation" }));
    expect(await screen.findByRole("spinbutton", { name: /Quantity for Current cabinet/ })).toHaveValue(6);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("returns keyboard focus to the editor when leaving the submitted review", async () => {
    setup(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Review for pre-design approval" }));
    expect(await screen.findByRole("region", { name: "Submitted estimate" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Edit estimate" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("region", { name: "Your quotation" })).toHaveFocus();
    expect(screen.getByRole("spinbutton", { name: /Quantity for Current cabinet/ })).toHaveValue(2);
  });

  it("shows one item area and reviews the frozen version before submitting its exact decision token", async () => {
    const view = setup(), user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /Quantity for Current cabinet/ });
    expect(quantity).toHaveValue(2);
    // Existing requirements links still lead to the unified commercial workspace.
    expect(view.container.querySelector("#estimate-review-title")).toContainElement(quantity);
    expect(screen.queryByText("Review section-wise estimate")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve pre-design quotation" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Review for pre-design approval" }));
    const submitted = await screen.findByRole("region", { name: "Submitted estimate" });
    expect(view.container.querySelector("#estimate-review-title")).toContainElement(submitted);
    expect(submitted).toHaveFocus();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(within(submitted).getByRole("article", { name: "Submitted cabinet in Kitchen" })).toBeVisible();
    expect(within(submitted).getByText("₹826")).toBeVisible();
    expect(within(submitted).queryByText("₹1,180.00")).not.toBeInTheDocument();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Approve pre-design quotation" }));
    const dialog = screen.getByRole("dialog", { name: "Approve this pre-design quotation?" });
    expect(within(dialog).getByText("Version 3 · Submission 1")).toBeVisible();
    expect(within(dialog).getByText("₹826")).toBeVisible();
    await user.dblClick(within(dialog).getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(view.decisions).toEqual([{ decision: "approve", note: "", reviewRoundId: "round-estimate-one", reviewRoundVersion: 1 }]));
    expect(await screen.findByText("Pre-design approval recorded")).toBeVisible();
  });

  it("saves edits, waits for Sales, and only approves the newly confirmed version", async () => {
    const view = setup(), user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /Quantity for Current cabinet/ });
    await user.clear(quantity); await user.type(quantity, "4");
    expect(screen.getByRole("button", { name: "View submitted version" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Waiting for Sales confirmation/)).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "View submitted version" }));
    expect(await screen.findByText("This quotation has been superseded")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve pre-design quotation" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit estimate" }));
    expect(screen.getByRole("spinbutton", { name: /Quantity for Current cabinet/ })).toHaveValue(4);
    view.state.detail = { ...view.state.detail, status: "sent_to_client", reviewState: "ready_for_approval",
      quotationApprovalState: "revision_pending_client", currentQuotationApproved: false, requiresClientReapproval: true,
      quotationApprovalSource: null, currentQuotationApproval: null };
    view.state.estimate = withQuotationApproval({ ...view.state.estimate, status: "sent_to_client", publishedReview: { ...view.state.estimate.publishedReview!, id: "round-revised", status: "pending", canDecide: true } }, view.state.detail);
    view.state.queue = [view.state.estimate]; await view.refresh();
    await user.click(await screen.findByRole("button", { name: "Review for pre-design approval" }));
    await user.click(await screen.findByRole("button", { name: "Approve pre-design quotation" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(view.decisions[0]).toMatchObject({ reviewRoundId: "round-revised", reviewRoundVersion: 1 }));
    expect(view.saves).toHaveLength(1);
  });

  it("preserves edits and prevents submitted review after a rejected save", async () => {
    const view = setup(), user = userEvent.setup(); view.state.saveError = 422;
    const quantity = await screen.findByRole("spinbutton", { name: /Quantity for Current cabinet/ });
    await user.clear(quantity); await user.type(quantity, "5"); await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Save rejected")).toBeVisible(); expect(quantity).toHaveValue(5);
    expect(screen.getByRole("button", { name: "View submitted version" })).toBeDisabled(); expect(view.decisions).toEqual([]);
  });

  it("saves post-design edits, waits for Designer, and reviews only the newly confirmed version", async () => {
    const view = setup({ phase: "post" }), user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /Quantity for Current cabinet/ });
    await user.clear(quantity); await user.type(quantity, "7");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Waiting for Designer confirmation/)).toBeVisible();
    expect(screen.queryByText(/Waiting for Sales confirmation/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "View submitted version" }));
    expect(await screen.findByText("This quotation has been superseded")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve designer-revised quotation" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit estimate" }));
    expect(screen.getByRole("spinbutton", { name: /Quantity for Current cabinet/ })).toHaveValue(7);
    view.state.detail = { ...view.state.detail, status: "sent_to_client", reviewState: "ready_for_approval",
      quotationApprovalState: "revision_pending_client", currentQuotationApproved: false,
      requiresClientReapproval: true, quotationApprovalSource: null, currentQuotationApproval: null };
    view.state.estimate = withQuotationApproval({ ...view.state.estimate, status: "sent_to_client", publishedReview: {
      ...view.state.estimate.publishedReview!, id: "round-post-revised", version: 2, status: "pending", canDecide: true
    } }, view.state.detail);
    view.state.estimate.estimation!.salesApproval = null;
    view.state.queue = [view.state.estimate]; await view.refresh();
    await user.click(await screen.findByRole("button", { name: "Review revised quotation" }));
    expect(await screen.findByText(/Submitted version 4/)).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "Approve designer-revised quotation" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(view.decisions).toEqual([{ decision: "approve", note: "", reviewRoundId: "round-post-revised", reviewRoundVersion: 2 }]));
    expect(view.saves).toHaveLength(1);
  });

  it("retires a stale decision after 409 until an explicit refreshed review", async () => {
    const view = setup(), user = userEvent.setup(); view.state.decisionError = 409;
    await user.click(await screen.findByRole("button", { name: "Review for pre-design approval" }));
    await user.click(await screen.findByRole("button", { name: "Approve pre-design quotation" })); await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText("This estimate has changed")).toBeVisible(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve pre-design quotation" })).not.toBeInTheDocument(); expect(view.decisions).toHaveLength(1);
    view.state.estimate.publishedReview!.canDecide = false;
    await user.click(screen.getByRole("button", { name: "Refresh estimate" }));
    expect(screen.queryByRole("button", { name: "Approve pre-design quotation" })).not.toBeInTheDocument();
  });

  it.each([403, 500])("hides the submitted copy and decisions after review refresh fails with %s", async status => {
    const view = setup(), user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Review for pre-design approval" }));
    expect(await screen.findByRole("article", { name: "Submitted cabinet in Kitchen" })).toBeVisible();
    view.state.queueError = status; await view.refreshReview();
    expect(await screen.findByRole("heading", { name: "Submitted estimate unavailable" })).toBeVisible();
    expect(screen.queryByRole("article", { name: "Submitted cabinet in Kitchen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve pre-design quotation" })).not.toBeInTheDocument();
  });

  it("blocks duplicate/foreign project reviews and revision mismatches", async () => {
    const view = setup();
    await screen.findByRole("button", { name: "Review for pre-design approval" });
    await view.mismatchRevision();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Review for pre-design approval" })).not.toBeInTheDocument());
    view.state.queue = [view.state.estimate, { ...view.state.estimate, id: "another-estimate" }]; await view.refreshReview();
    expect(await screen.findByText(/current estimate for this project could not be verified/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "View submitted version" })).not.toBeInTheDocument();
    view.state.queue = [{ ...view.state.estimate, projectId: "project-other" }]; await view.refreshReview();
    await waitFor(() => expect(screen.queryByRole("button", { name: "View submitted version" })).not.toBeInTheDocument()); expect(view.decisions).toEqual([]);
  });

  it("blocks approval after PDF verification fails until refresh", async () => {
    const view = setup(), user = userEvent.setup(); view.state.pdfError = 409;
    await user.click(await screen.findByRole("button", { name: "Review for pre-design approval" }));
    await user.click(await screen.findByRole("button", { name: /Export submitted PDF/ }));
    expect(await screen.findByText("Refresh the submitted version before making a decision.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve pre-design quotation" })).not.toBeInTheDocument(); expect(view.decisions).toEqual([]);
  });
});

describe("Quotation approval source binding", () => {
  it("uses immutable review proof even when current Configuration reports incompatible working values", () => {
    const { detail, estimate } = fixture();
    detail.isIncomplete = true; detail.lines[0]!.mainLineName = "Configuration changed";
    expect(canReviewCurrentQuotation(detail, estimate, revision(detail))).toBe(true);
  });
  it.each(["sales-proof", "requirements", "round", "price", "phase", "version", "closed", "source"])("rejects inconsistent %s evidence", mismatch => {
    const { detail, estimate } = fixture();
    if (mismatch === "sales-proof") estimate.estimation!.salesApproval = null;
    if (mismatch === "requirements") estimate.publishedReview!.requirementsVersion = 9;
    if (mismatch === "round") estimate.estimation!.pendingReviewRoundId = "old-round";
    if (mismatch === "price") estimate.estimation!.pricedRevision = 9;
    if (mismatch === "phase") estimate.estimation!.phase = "post";
    if (mismatch === "version") estimate.publishedReview!.estimateVersion = 9;
    if (mismatch === "closed") estimate.estimation!.editClosedAt = "2026-11-03T12:00:00Z";
    if (mismatch === "source") estimate.reviewSourceIssue = "source_conflict";
    expect(canReviewCurrentQuotation(detail, estimate, revision(detail))).toBe(false);
  });
});
