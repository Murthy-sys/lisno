import { screen, waitFor, within } from "@testing-library/react";
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
    renderWithQuery(<StaffEstimateCollaboration onVersionAdvance={advance} estimate={{ ...estimate, status: "sent_to_client", estimation: { ...lifecycle, status: "sent_to_client", pendingReviewRoundId: "post-round" },
      clientReview: { id: "post-round", version: 4, estimateVersion: 7, sendGeneration: 1, status: "pending", deliveryStatus: "sent", deliveryAttemptCount: 1, deliveredAt: null } }} />);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Withdraw review to edit" }));
    expect(screen.getByRole("textbox", { name: "Withdrawal reason" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Withdraw review" })); expect(post).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Withdrawal reason" }), "Client added storage.");
    await user.click(screen.getByRole("button", { name: "Withdraw review" }));
    expect(await screen.findByText(/Review withdrawn. The client/)).toBeVisible(); expect(advance).toHaveBeenCalledWith(7, 8);
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
    server.use(http.post("/api/v1/estimates/estimate-one/enable-collaboration", () => HttpResponse.json({ error: { code: "ESTIMATE_TRANSITION_CONFLICT", message: "Existing commitments require reconciliation." } }, { status: 409 })));
    renderWithQuery(<StaffEstimateCollaboration estimate={{ ...estimate, estimation: undefined, designPlanStatus: "assigned" }} />);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Enable collaboration" }));
    await user.click(screen.getByRole("button", { name: "Confirm enable collaboration" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Existing commitments require reconciliation.");
    expect(screen.getByRole("button", { name: "Confirm enable collaboration" })).toBeDisabled();
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
