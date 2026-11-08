import { useState } from "react";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import type { EstimateRequirementsDetail } from "../client/estimateRequirementsApi";
import { StaffEstimateCollaboration } from "./StaffEstimateCollaboration";
import { StaffEstimateRequirements } from "./StaffEstimateRequirements";
import type { ConfiguredEstimateLine, EstimateDraft } from "./leadsApi";

const lifecycle: NonNullable<EstimateDraft["estimation"]> = { workflowVersion: 2, phase: "post", status: "draft", requirementsVersion: 3, editClosedAt: null,
  preApproval: { reviewRoundId: "pre-round", estimateVersion: 2, approvedAt: "2026-10-13T10:00:00Z" }, finalApproval: null,
  designScopeRevision: 2, approvedDesignScopeRevision: 1, pendingReviewRoundId: null, preparationSnapshotId: null };
const line: ConfiguredEstimateLine = { id: "line-one", source: "configuration", catalogueId: "main-line", roomId: "room-one", roomName: "Bedroom 1", mainBasketId: "joinery", mainBasketName: "Joinery", subBasketId: null, subBasketName: null,
  mainLineId: "main-line", mainLineName: "Storage unit", revisionId: "revision-one", uomId: "unit", uomName: "Unit", uomCode: "unit", uomDecimalScale: 0,
  quantity: 2, ratePaise: 50000, included: true, unit: "Unit", specification: null, rate: 500, amount: 1000, amountPaise: 100000 };
const estimate: EstimateDraft = { id: "estimate-one", projectId: "project-one", version: 7, propertyType: "2BHK", rooms: [{ id: "room-one", label: "Bedroom 1" }], scopes: [], lineItems: [line], subtotal: 1000, gst: 180, total: 1180, totalPaise: 118000,
  status: "draft", approvalRequired: false, estimation: lifecycle, designPlanStatus: "approved", preApprovedReview: { reviewRoundId: "pre-round", estimateVersion: 2,
    snapshot: { projectName: "Sample home", clientName: "Sample client", location: "Sample city", propertyType: "2BHK", lineItems: [], subtotal: 800, gst: 144, total: 944, totalPaise: 94400 } } };
const detail: EstimateRequirementsDetail = { projectId: "project-one", requirementsVersion: 3, estimateVersion: 7, phase: "post", editingAllowed: true, editingBlockReason: null, canResolve: true,
  mainBaskets: [{ id: "joinery", name: "Joinery" }], rooms: [{ id: "room-one", label: "Bedroom 1" }], indicativeTotalPaise: 118000, pricingComplete: false,
  requirements: [{ id: "request-one", projectId: "project-one", phase: "post", mainBasketId: "joinery", roomId: "room-one", text: "Add tall storage.", authorId: "client-one", version: 2, status: "open", lineItemIds: [], reason: "", supersededById: null, createdAt: "2026-10-13T10:00:00Z", updatedAt: "2026-10-13T10:00:00Z", resolvedAt: null, canEdit: false }] };

describe("Staff estimate collaboration", () => {
  it.each([false, true])("distinguishes saved initial approval from unsaved quotation changes (%s)", dirty => {
    renderWithQuery(<StaffEstimateCollaboration compact hasUnsavedQuotationChanges={dirty} estimate={{ ...estimate,
      quotationApprovalState: "initial_current", currentQuotationApproved: true, requiresClientReapproval: false,
      quotationApprovalSource: "initial_unchanged", currentQuotationApproval: { kind: "initial_unchanged", ...lifecycle.preApproval! },
      estimation: { ...lifecycle, workflowVersion: 3, pricedRevision: 2 } }} />);
    expect(screen.getByText(dirty
      ? "The saved estimate has initial approval. Submit your unsaved changes for Client review."
      : "Initial estimate approved. No quotation changes require Client review.")).toBeVisible();
  });

  it("fails closed in compact mode when the current quotation approval is unavailable", () => {
    renderWithQuery(<StaffEstimateCollaboration compact estimate={{ ...estimate, estimation: { ...lifecycle, workflowVersion: 3, pricedRevision: 2 } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The current quotation approval could not be verified");
  });

  it("keeps a v3 pre-design draft in the normal collaboration stage", () => {
    renderWithQuery(<StaffEstimateCollaboration estimate={{ ...estimate,
      quotationApprovalState: "source_issue", currentQuotationApproved: false,
      requiresClientReapproval: false, quotationApprovalSource: null, currentQuotationApproval: null,
      estimation: { ...lifecycle, workflowVersion: 3, phase: "pre", status: "draft",
        pricedRevision: 2, preApproval: null } }} />);
    expect(screen.getByRole("heading", { name: "Estimate collaboration" })).toBeVisible();
    expect(screen.getByText(/Prepare the pre-design quotation/)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/approval could not be verified|workflow remains paused/i)).not.toBeInTheDocument();
  });

  it("keeps v3 quotation revision separate from procurement preparation release", () => {
    renderWithQuery(<StaffEstimateCollaboration estimate={{ ...estimate, quotationApprovalState: "revision_draft", currentQuotationApproved: false,
      requiresClientReapproval: true, quotationApprovalSource: null, currentQuotationApproval: null,
      estimation: { ...lifecycle, workflowVersion: 3, pricedRevision: 2 } }} />);
    expect(screen.getByRole("heading", { name: "Revised quotation draft" })).toBeVisible();
    expect(screen.getByText("Client approval is required for the revised quotation before design work continues.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Release saved estimate for preparation" })).not.toBeInTheDocument();
  });
  it("shows quotation unlock only with server capability and pins the approved source plus reason", async () => {
    const post = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ expectedVersion: 7, reviewRoundId: "quote-approved", reason: "Client changed the storage scope.", idempotencyKey: expect.any(String) });
      return HttpResponse.json({ data: { ...estimate, version: 8 } });
    });
    server.use(http.post("/api/v1/estimates/estimate-one/unlock", post));
    renderWithQuery(<StaffEstimateCollaboration estimate={{ ...estimate, quotationApprovalState: "revision_current", currentQuotationApproved: true,
      requiresClientReapproval: false, quotationApprovalSource: "designer_revision",
      currentQuotationApproval: { kind: "designer_revision", reviewRoundId: "quote-approved", estimateVersion: 6, approvedAt: "2026-10-30T10:00:00Z" },
      capabilities: { canUnlockQuotation: true }, estimation: { ...lifecycle, workflowVersion: 3, pricedRevision: 2,
      editClosedAt: "2026-10-30T10:00:00Z", finalApproval: { reviewRoundId: "quote-approved", estimateVersion: 6, approvedAt: "2026-10-30T10:00:00Z", requirementsVersion: 3, designReviewRoundId: null, designPlanVersion: null, designScopeRevision: 2 } } }} />);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Unlock quotation" }));
    expect(screen.getByRole("textbox", { name: "Unlock reason" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Confirm unlock" })); expect(post).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Unlock reason" }), "Client changed the storage scope.");
    await user.click(screen.getByRole("button", { name: "Confirm unlock" }));
    expect(await screen.findByText(/Quotation reopened/)).toBeVisible();
  });

  it("keeps a locked quotation readable without offering unauthorized unlock", () => {
    renderWithQuery(<StaffEstimateCollaboration estimate={{ ...estimate, quotationApprovalState: "revision_current", currentQuotationApproved: true,
      requiresClientReapproval: false, quotationApprovalSource: "designer_revision",
      currentQuotationApproval: { kind: "designer_revision", reviewRoundId: "quote-approved", estimateVersion: 6, approvedAt: "2026-10-30T10:00:00Z" },
      capabilities: { canUnlockQuotation: false }, estimation: { ...lifecycle, workflowVersion: 3, pricedRevision: 2, editClosedAt: "2026-10-30T10:00:00Z" } }} />);
    expect(screen.getByText("Revised quotation approved")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Unlock quotation" })).not.toBeInTheDocument();
  });

  it("shows immutable original and saved proposed totals with a design scope blocker", () => {
    renderWithQuery(<StaffEstimateCollaboration estimate={estimate} />);
    expect(screen.getByText("₹944.00")).toBeVisible(); expect(screen.getByText("₹1,180.00")).toBeVisible();
    expect(screen.getByText(/Final submission is waiting/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Release saved estimate for preparation" })).toBeEnabled();
  });

  it("requires a withdrawal reason and sends the pinned estimate and review versions", async () => {
    const advance = vi.fn();
    const post = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ expectedVersion: 7, reviewRoundId: "post-round", reviewRoundVersion: 4, reason: "Client added storage." });
      return HttpResponse.json({ data: { ...estimate, version: 8 } });
    });
    server.use(http.post("/api/v1/estimates/estimate-one/withdraw-review", post));
    renderWithQuery(<StaffEstimateCollaboration compact onVersionAdvance={advance} estimate={{ ...estimate, status: "sent_to_client", estimation: { ...lifecycle, status: "sent_to_client", pendingReviewRoundId: "post-round" },
      clientReview: { id: "post-round", version: 4, estimateVersion: 7, sendGeneration: 1, status: "pending", deliveryStatus: "sent", deliveryAttemptCount: 1, deliveredAt: null } }} />);
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Withdraw review to edit" })).not.toBeVisible();
    await user.click(screen.getByLabelText("Estimate actions"));
    await user.click(screen.getByRole("button", { name: "Withdraw review to edit" }));
    expect(screen.getByRole("textbox", { name: "Withdrawal reason" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Withdraw review" })); expect(post).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Withdrawal reason" }), "Client added storage.");
    await user.click(screen.getByRole("button", { name: "Withdraw review" }));
    expect(await screen.findByText(/Review withdrawn. The client/)).toBeVisible(); expect(advance).toHaveBeenCalledWith(7, 8);
  });

  it.each([false, true])("preserves a compact conflict dialog when refreshed eligibility disappears (locked %s)", async locked => {
    const post = vi.fn(() => HttpResponse.json({ error: { code: "ESTIMATE_VERSION_CONFLICT", message: "This review changed elsewhere." } }, { status: 409 }));
    server.use(http.post("/api/v1/estimates/estimate-one/withdraw-review", post));
    const pending: EstimateDraft = { ...estimate, status: "sent_to_client", estimation: { ...lifecycle, workflowVersion: 3, status: "sent_to_client", pendingReviewRoundId: "post-round" },
      clientReview: { id: "post-round", version: 4, estimateVersion: 7, sendGeneration: 1, status: "pending", deliveryStatus: "sent", deliveryAttemptCount: 1, deliveredAt: null } };
    function Harness() {
      const [current, setCurrent] = useState(pending);
      return <><button onClick={() => setCurrent({ ...estimate, version: 8, capabilities: { canUnlockQuotation: false }, estimation: { ...lifecycle, workflowVersion: 3, editClosedAt: locked ? "2026-11-02T10:00:00Z" : null } })}>Apply refreshed estimate</button><StaffEstimateCollaboration compact estimate={current} /></>;
    }
    renderWithQuery(<Harness />); const user = userEvent.setup();
    await user.click(screen.getByLabelText("Estimate actions"));
    await user.click(screen.getByRole("button", { name: "Withdraw review to edit" }));
    await user.type(screen.getByRole("textbox", { name: "Withdrawal reason" }), "Retain this reason for review.");
    await user.click(screen.getByRole("button", { name: "Withdraw review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This review changed elsewhere.");
    // Refreshing the parent query replaces the estimate props while the conflict is open.
    act(() => screen.getByRole("button", { name: "Apply refreshed estimate", hidden: true }).click());
    await waitFor(() => expect(screen.queryByLabelText("Estimate actions")).not.toBeInTheDocument());
    const dialog = screen.getByRole("dialog", { name: "Withdraw this client review?" });
    expect(within(dialog).getByRole("textbox", { name: "Withdrawal reason" })).toHaveValue("Retain this reason for review.");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The latest state has been refreshed.");
    expect(within(dialog).getByRole("button", { name: "Withdraw review" })).toBeDisabled();
    expect(post).toHaveBeenCalledOnce();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("freezes only an explicitly confirmed saved preparation version", async () => {
    const post = vi.fn(async ({ request }: { request: Request }) => { expect(await request.json()).toEqual({ expectedVersion: 7 }); return HttpResponse.json({ data: { estimateId: estimate.id, estimateVersion: 7 } }); });
    server.use(http.post("/api/v1/estimates/estimate-one/preparation-snapshots", post));
    renderWithQuery(<StaffEstimateCollaboration estimate={estimate} />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Release saved estimate for preparation" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByText(/Save your draft first to include unsaved edits/)).toBeVisible(); expect(post).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Release saved version" }));
    expect(await screen.findByText(/Saved estimate released/)).toBeVisible(); expect(post).toHaveBeenCalledOnce();
  });

  it("keeps legacy transition conflicts reviewable without retrying stale input", async () => {
    server.use(http.get("/api/v1/estimates/estimate-one/collaboration-preview", () => HttpResponse.json({ data: { estimateId: "estimate-one", projectId: "project-one", estimateVersion: 7, currentWorkflowVersion: null, targetVersion: 3, eligible: true, blockers: [], previewFingerprint: "preview-one" } })));
    server.use(http.post("/api/v1/estimates/estimate-one/enable-collaboration", () => HttpResponse.json({ error: { code: "ESTIMATE_TRANSITION_CONFLICT", message: "Existing commitments require reconciliation." } }, { status: 409 })));
    renderWithQuery(<StaffEstimateCollaboration estimate={{ ...estimate, estimation: undefined, designPlanStatus: "assigned" }} />);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Enable collaboration" }));
    await user.type(await screen.findByRole("textbox", { name: "Workflow change reason" }), "Use the revised quotation flow.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm enable collaboration" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Confirm enable collaboration" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Existing commitments require reconciliation.");
    expect(screen.getByRole("button", { name: "Confirm enable collaboration" })).toBeDisabled();
  });

  it("requires a reviewed eligible preview and a reason before enabling the new quotation workflow", async () => {
    const post = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ expectedVersion: 7, targetVersion: 3, reason: "Start the revised client review process.", previewFingerprint: "preview-one" });
      return HttpResponse.json({ data: { ...estimate, version: 8 } });
    });
    server.use(
      http.get("/api/v1/estimates/estimate-one/collaboration-preview", () => HttpResponse.json({ data: { estimateId: "estimate-one", projectId: "project-one", estimateVersion: 7, currentWorkflowVersion: 2, targetVersion: 3, eligible: true, blockers: [], previewFingerprint: "preview-one" } })),
      http.post("/api/v1/estimates/estimate-one/enable-collaboration", post)
    );
    renderWithQuery(<StaffEstimateCollaboration estimate={estimate} />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Enable collaboration" }));
    await screen.findByText("This saved draft is eligible. Existing approval history will be preserved.");
    expect(post).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm enable collaboration" }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Workflow change reason" })).toHaveFocus();
    await user.type(screen.getByRole("textbox", { name: "Workflow change reason" }), "Start the revised client review process.");
    await user.click(screen.getByRole("button", { name: "Confirm enable collaboration" }));
    expect(await screen.findByText(/Quotation workflow enabled/)).toBeVisible();
    expect(post).toHaveBeenCalledOnce();
  });

  it("displays transition blockers and does not offer a mutation for an ineligible history", async () => {
    const post = vi.fn();
    server.use(http.get("/api/v1/estimates/estimate-one/collaboration-preview", () => HttpResponse.json({ data: { estimateId: "estimate-one", projectId: "project-one", estimateVersion: 7, currentWorkflowVersion: 2, targetVersion: 3, eligible: false, blockers: ["Existing approvals need reconciliation."], previewFingerprint: "blocked-one" } })), http.post("/api/v1/estimates/estimate-one/enable-collaboration", post));
    renderWithQuery(<StaffEstimateCollaboration estimate={estimate} />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Enable collaboration" }));
    expect(await screen.findByText("Existing approvals need reconciliation.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm enable collaboration" })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it("hides editing transitions after final approval even if a stale physical status says draft", () => {
    renderWithQuery(<StaffEstimateCollaboration estimate={{ ...estimate, estimation: { ...lifecycle, editClosedAt: "2026-10-13T12:00:00Z" } }} />);
    expect(screen.getByText("Final estimate approved")).toBeVisible(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Staff request resolution", () => {
  it("shows the requested Main Line and limits resolution to that exact stable line", async () => {
    server.use(http.get("/api/v1/projects/project-one/estimate-requirements", () => HttpResponse.json({ data: {
      ...detail, mainLines: [{ id: "main-line", name: "Storage unit", mainBasketId: "joinery", subBasketId: null, subBasketName: null }],
      requirements: [{ ...detail.requirements[0]!, mainLineId: "main-line" }]
    } })));
    renderWithQuery(<StaffEstimateRequirements projectId="project-one" estimate={{ ...estimate, lineItems: [line,
      { ...line, id: "other-line", mainLineId: "another-line", catalogueId: "another-line", mainLineName: "Different storage" }] }} />);
    expect(await screen.findByText("Requested Main Line: Storage unit")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Resolve requirement 1" }));
    const dialog = screen.getByRole("dialog", { name: "Resolve client requirement" });
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(dialog).queryByText(/Different storage/)).not.toBeInTheDocument();
  });

  function setup(overrides: Partial<EstimateRequirementsDetail> = {}) {
    const state = { detail: structuredClone({ ...detail, ...overrides }) }; const advance = vi.fn();
    server.use(http.get("/api/v1/projects/project-one/estimate-requirements", () => HttpResponse.json({ data: state.detail })));
    renderWithQuery(<StaffEstimateRequirements projectId="project-one" estimate={{ ...estimate, lineItems: [line, { ...line, id: "other-room", roomId: "room-two", mainLineName: "Other room item" }, { ...line, id: "other-basket", mainBasketId: "lighting", mainLineName: "Other basket item" }] }} onVersionAdvance={advance} />);
    return { state, advance };
  }
  it("links only matching saved items and submits strict collection/item version fences", async () => {
    const { state, advance } = setup();
    server.use(http.post("/api/v1/projects/project-one/estimate-requirements/request-one/resolve", async ({ request }) => {
      expect(await request.json()).toEqual({ expectedRequirementsVersion: 3, expectedVersion: 2, status: "included", lineItemIds: ["line-one"], reason: "" });
      state.detail = { ...state.detail, requirementsVersion: 4, estimateVersion: 8, requirements: [{ ...state.detail.requirements[0]!, status: "included", lineItemIds: ["line-one"], version: 3 }] };
      return HttpResponse.json({ data: state.detail });
    }));
    const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Resolve requirement 1" }));
    const dialog = screen.getByRole("dialog", { name: "Resolve client requirement" });
    expect(within(dialog).getByRole("combobox", { name: "Resolution" })).toHaveFocus();
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(1); expect(within(dialog).queryByText(/Other room|Other basket/)).not.toBeInTheDocument();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(within(dialog).getByRole("checkbox")); await user.click(within(dialog).getByRole("button", { name: "Save resolution" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(advance).toHaveBeenCalledWith(7, 8);
  });

  it("requires a reason to decline and preserves it after stale conflicts", async () => {
    const { state } = setup(); const post = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ expectedRequirementsVersion: 3, expectedVersion: 2, status: "declined", lineItemIds: [], reason: "Outside agreed scope." });
      state.detail.requirementsVersion = 4;
      return HttpResponse.json({ error: { code: "ESTIMATE_REQUIREMENTS_CHANGED", message: "Requests changed." } }, { status: 409 });
    });
    server.use(http.post("/api/v1/projects/project-one/estimate-requirements/request-one/resolve", post));
    const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Resolve requirement 1" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Resolution" }), "declined");
    await user.click(screen.getByRole("button", { name: "Save resolution" })); expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Resolution reason" })).toHaveFocus();
    await user.type(screen.getByRole("textbox", { name: "Resolution reason" }), "Outside agreed scope.");
    await user.click(screen.getByRole("button", { name: "Save resolution" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Requests changed."); expect(screen.getByRole("textbox", { name: "Resolution reason" })).toHaveValue("Outside agreed scope.");
    expect(screen.getByRole("button", { name: "Save resolution" })).toBeDisabled();
  });

  it("respects backend read-only capabilities and keeps requirement history", async () => {
    setup({ editingAllowed: false, editingBlockReason: "closed", canResolve: false });
    expect(await screen.findByText("Add tall storage.")).toBeVisible(); expect(screen.queryByRole("button", { name: "Resolve requirement 1" })).not.toBeInTheDocument();
  });
});
