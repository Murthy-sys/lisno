import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { leadKeys, type ConfiguredEstimateLine, type EstimateDraft, type EstimateDraftInput } from "./leadsApi";
import type { EstimationCatalogue } from "./estimationCatalogueApi";
import type { EstimateRequirementsDetail } from "../client/estimateRequirementsApi";
const authState = vi.hoisted(() => ({ user: { id: "test-staff", role: "designer" }, authorization: { permissions: ["estimation.estimate.save", "estimation.estimate.submit", "estimation.estimate.send_client"] }, reviewSession: { id: "test-session" }, status: "authenticated" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => authState }));
beforeEach(() => { authState.user.role = "designer"; });
vi.mock("./estimateRevisionsApi", async importOriginal => ({
  ...await importOriginal<typeof import("./estimateRevisionsApi")>(),
  getEstimateRevisions: vi.fn(async () => ({ items: [], pagination: { limit: 20, nextCursor: null } }))
}));


vi.mock("../messages", () => ({ ProjectChatNavigation: () => null }));
const estimate: EstimateDraft = {
  id: "estimate-one", projectId: "project-one", version: 7, propertyType: "2BHK", rooms: [{ id: "living", typeId: "living", label: "Living Room", sqft: 100, length: 10, width: 10, icon: "" }], scopes: ["FC"],
  lineItems: [{ id: "line-one", source: "legacy", catalogueId: "FC01", roomName: "Living Room", specification: "Gypsum plain", unit: "sqft", rate: 95, quantity: 200, included: true }],
  subtotal: 19000, gst: 3420, total: 22420, status: "draft", approvalRequired: false, designPlanStatus: "approved",
  estimation: { workflowVersion: 2, phase: "post", status: "draft", requirementsVersion: 3, editClosedAt: null, preApproval: { reviewRoundId: "pre-round", estimateVersion: 2, approvedAt: "2026-10-13T10:00:00Z" }, finalApproval: null, designScopeRevision: 2, approvedDesignScopeRevision: 2, pendingReviewRoundId: null, preparationSnapshotId: null }
};
const requirements: EstimateRequirementsDetail = { projectId: "project-one", requirementsVersion: 3, estimateVersion: 7, phase: "post", editingAllowed: true, editingBlockReason: null, canResolve: true,
  requirements: [], mainBaskets: [], rooms: [], indicativeTotalPaise: 2242000, pricingComplete: true };

function setup(value: EstimateDraft = structuredClone(estimate), requests = structuredClone(requirements), catalogue?: EstimationCatalogue) {
  const state = { estimate: value, requests }; let queryClient!: QueryClient;
  let saveGate: Promise<void> | undefined;
  let saveFailure: { status: number; commit: boolean } | null = null;
  function Capture() { queryClient = useQueryClient(); return null; }
  const saves: unknown[] = []; const submits: unknown[] = [];
  server.use(
    http.get("/api/v1/leads/lead-one", () => HttpResponse.json({ data: { id: "lead-one", projectId: "project-one", clientName: "Sample client", projectName: "Sample project", location: "Sample city", propertyType: "2BHK", estimationWorkflowVersion: 2 } })),
    http.get("/api/v1/leads/lead-one/estimate", () => HttpResponse.json({ data: state.estimate })),
    http.get("/api/v1/projects/project-one/estimate-requirements", () => HttpResponse.json({ data: state.requests })),
    http.get("/api/v1/projects/project-one/quotation/revision", () => HttpResponse.json({ data: { estimateId: state.estimate.id, estimateVersion: state.estimate.version, pricedRevision: state.estimate.estimation?.pricedRevision, status: state.estimate.status, phase: state.estimate.estimation?.phase } })),
    http.get("/api/v1/estimation/catalogue", () => HttpResponse.json({ data: { ...catalogue, pagination: { total: 1, hasMore: false, offset: 0, limit: 100 } } })),
    http.get("/api/v1/estimation/catalogue/recommendations", () => HttpResponse.json({ data: { sources: [] } })),
    http.put("/api/v1/leads/lead-one/estimate", async ({ request }) => {
      const body = await request.json() as EstimateDraftInput; saves.push(body);
      await saveGate;
      if (saveFailure && !saveFailure.commit) return HttpResponse.json({ error: { code: "SAVE_REJECTED", message: "Review this estimate before saving." } }, { status: saveFailure.status });
      state.estimate = { ...state.estimate, ...body, version: state.estimate.version! + 1,
        ...(state.estimate.estimation?.workflowVersion === 3 && state.estimate.capabilities?.canPrepareQuotationSubmission ? {
          quotationApprovalState: "revision_draft" as const, currentQuotationApproved: false, requiresClientReapproval: true,
          quotationApprovalSource: null, currentQuotationApproval: null,
          capabilities: { ...state.estimate.capabilities, canPublishQuotation: true }
        } : {}),
        lineItems: body.lineItems.map(line => line.source === "configuration"
          ? { ...state.estimate.lineItems.find(saved => saved.id === line.id), ...line } as ConfiguredEstimateLine : line) };
      return saveFailure ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Save response unavailable." } }, { status: saveFailure.status }) : HttpResponse.json({ data: state.estimate });
    }),
    http.post("/api/v1/leads/lead-one/estimate/submit", async ({ request }) => { submits.push(await request.json()); state.estimate = { ...state.estimate, status: "sent_to_client", estimation: { ...state.estimate.estimation!, status: "sent_to_client", pendingReviewRoundId: "post-round" } }; return HttpResponse.json({ data: state.estimate }); })
  );
  const view = renderWithQuery(<MemoryRouter initialEntries={["/estimator-sales/leads/lead-one/estimate"]}><Capture /><Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace returnTo="/designer/design-plans" />} /></Routes></MemoryRouter>);
  return { state, saves, submits, unmount: view.unmount, getClient: () => queryClient, pauseSave: (gate: Promise<void>) => { saveGate = gate; },
    failSave: (status: number, commit = false) => { saveFailure = { status, commit }; }, allowSave: () => { saveFailure = null; } };
}

function configuredFixture() {
  const rooms = [
    { id: "living", typeId: "living", label: "Living Room", sqft: 100, length: 10, width: 10, icon: "" },
    { id: "bedroom", typeId: "bedroom", label: "Bedroom", sqft: 80, length: 10, width: 8, icon: "" }
  ];
  const line = (mainLineId: string, roomIndex: number, quantity: number): ConfiguredEstimateLine => ({
    id: `${mainLineId}-${rooms[roomIndex]!.id}`, source: "configuration", catalogueId: mainLineId,
    roomId: rooms[roomIndex]!.id, roomName: rooms[roomIndex]!.label,
    mainBasketId: "basket", mainBasketName: "Interiors", subBasketId: "sub", subBasketName: "Finishes",
    mainLineId, mainLineName: mainLineId === "visible" ? "Visible finish" : "Internal finish", revisionId: `revision-${mainLineId}`,
    uomId: "unit", uomName: "units", uomCode: "NOS", uomDecimalScale: 0, unit: "units", quantity, included: true,
    pricingMode: "sub_vendor", rateSource: "configuration", rate: 20, ratePaise: 2000, amount: quantity * 20, amountPaise: quantity * 2000,
    specification: null, clientVisible: mainLineId === "visible"
  });
  const draft: EstimateDraft = { ...estimate, rooms, scopes: [], selectedMainBasketIds: ["basket"],
    lineItems: [line("visible", 0, 2), line("visible", 1, 3), line("internal", 0, 1)],
    subtotal: 120, gst: 21.6, total: 141.6,
    capabilities: { canUnlockQuotation: false, canPublishQuotation: true, canPrepareQuotationSubmission: true, canChangePricingMode: true },
    quotationApprovalState: "revision_draft", currentQuotationApproved: false, requiresClientReapproval: true,
    quotationApprovalSource: null, currentQuotationApproval: null,
    estimation: { ...estimate.estimation!, workflowVersion: 3, pricedRevision: 2 } };
  const catalogue: EstimationCatalogue = { items: [{ id: "basket", name: "Interiors", displayOrder: 1,
    subBaskets: [{ id: "sub", basketId: "basket", name: "Finishes", displayOrder: 1,
      mainLines: ["internal", "visible"].map((mainLineId, index) => ({
        id: mainLineId, mainLineId, basketId: "basket", subBasketId: "sub",
        name: mainLineId === "visible" ? "Visible finish" : "Internal finish", displayOrder: index,
        revisionId: `revision-${mainLineId}`, itemVersion: 1, revisionVersion: 1,
        uom: { id: "unit", name: "units", code: "NOS", decimalScale: 0 },
        modeBaseRatesPaise: { pmc: 2000, sub_vendor: 2000, in_house: null }
      })) }] }], ineligibleLineCount: 0 };
  return { draft, catalogue };
}

function initialDesignerQuotation(): EstimateDraft {
  const draft = structuredClone(estimate);
  return { ...draft, status: "client_approved", designPlanStatus: "assigned",
    capabilities: { canUnlockQuotation: false, canPublishQuotation: false, canPrepareQuotationSubmission: true },
    estimation: { ...draft.estimation!, workflowVersion: 3, pricedRevision: 2, approvedDesignScopeRevision: null },
    quotationApprovalState: "initial_current", currentQuotationApproved: true, requiresClientReapproval: false,
    quotationApprovalSource: "initial_unchanged",
    currentQuotationApproval: { kind: "initial_unchanged", ...draft.estimation!.preApproval! } };
}

describe("Collaborative estimate workspace", () => {
  it.each([
    { role: "estimator_sales", phase: "pre" },
    { role: "designer", phase: "post" }
  ] as const)("refreshes missing mode capability for $role without discarding local item edits", async ({ role, phase }) => {
    authState.user.role = role;
    const { draft, catalogue } = configuredFixture();
    draft.estimation = { ...draft.estimation!, phase, ...(phase === "pre" ? { preApproval: null } : {}) };
    draft.capabilities = { ...draft.capabilities!, canChangePricingMode: undefined };
    draft.lineItems = draft.lineItems.map(line => line.id === "visible-living"
      ? { ...line, classification: "special" as const, rateSource: "manual" as const, rate: 97.25, ratePaise: 9725 }
      : line);
    const data = setup(draft, { ...structuredClone(requirements), phase }, catalogue);
    const user = userEvent.setup();
    await screen.findByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/ });
    await waitFor(() => expect(data.getClient().isFetching()).toBe(0));
    const row = () => screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/ }).closest(".configured-estimate-line") as HTMLElement;
    expect(within(row()).queryByRole("radio", { name: /item type/ })).not.toBeInTheDocument();
    await user.clear(within(row()).getByRole("spinbutton"));
    await user.type(within(row()).getByRole("spinbutton"), "19");
    expect(within(row()).getByRole("textbox", { name: /Selling rate/ })).toBeDisabled();
    expect(within(row()).getByRole("switch", { name: /PMC pricing mode/ })).toBeDisabled();
    data.state.estimate = { ...data.state.estimate, capabilities: { ...data.state.estimate.capabilities!, canChangePricingMode: true } };
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(within(row()).getByRole("switch", { name: /PMC pricing mode/ })).toBeEnabled());
    expect(within(row()).queryByText("Type", { exact: true })).not.toBeInTheDocument();
    expect(within(row()).queryByRole("radio", { name: /item type/ })).not.toBeInTheDocument();
    expect(within(row()).getByRole("spinbutton")).toHaveValue(19);
    expect(within(row()).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("97.25");
    expect(data.saves).toEqual([]);
  });

  it("keeps mode read-only when refreshing returns an explicit denial", async () => {
    const { draft, catalogue } = configuredFixture();
    draft.capabilities = { ...draft.capabilities!, canChangePricingMode: undefined };
    draft.lineItems = draft.lineItems.map(line => ({ ...line, classification: "special" as const }));
    const data = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    await screen.findByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/ });
    await waitFor(() => expect(data.getClient().isFetching()).toBe(0));
    data.state.estimate = { ...data.state.estimate, capabilities: { ...data.state.estimate.capabilities!, canChangePricingMode: false } };
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(data.getClient().getQueryData<EstimateDraft>(leadKeys.estimate("lead-one"))?.capabilities?.canChangePricingMode).toBe(false));
    const toggle = screen.getByRole("switch", { name: /PMC pricing mode.*Visible finish.*Living Room/ });
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/ })).toBeEnabled();
    expect(data.saves).toEqual([]);
  });

  it("preserves local changes and the version conflict when item refresh finds a newer estimate", async () => {
    authState.user.role = "estimator_sales";
    const { draft, catalogue } = configuredFixture();
    draft.capabilities = { ...draft.capabilities!, canChangePricingMode: undefined };
    const data = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    await screen.findByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/ });
    await waitFor(() => expect(data.getClient().isFetching()).toBe(0));
    const quantity = () => screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/ });
    await user.clear(quantity()); await user.type(quantity(), "19");
    data.state.estimate = { ...data.state.estimate, version: draft.version! + 1,
      lineItems: data.state.estimate.lineItems.map(line => line.id === "visible-living" ? { ...line, quantity: 99 } : line),
      capabilities: { ...data.state.estimate.capabilities!, canChangePricingMode: false } };
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await screen.findByText("This estimate changed elsewhere. Reload the latest saved estimate before editing it again.");
    expect(quantity()).toHaveValue(19);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reload saved estimate (discard edits)" })).toBeVisible();
    expect(data.saves).toEqual([]);
  });

  it.each([
    { role: "estimator_sales", phase: "pre", capability: true },
    { role: "designer", phase: "post", capability: true },
    { role: "estimator_sales", phase: "post", capability: false },
    { role: "designer", phase: "post", capability: undefined }
  ] as const)("uses the server mode capability for $role in $phase (capability $capability)", async ({ role, phase, capability }) => {
    const user = userEvent.setup();
    authState.user.role = role;
    const { draft, catalogue } = configuredFixture();
    draft.estimation = { ...draft.estimation!, phase, ...(phase === "pre" ? { preApproval: null } : {}) };
    draft.capabilities = { ...draft.capabilities!, canChangePricingMode: capability };
    draft.lineItems = draft.lineItems.map(line => ({ ...line, classification: "special" as const }));
    const data = setup(draft, { ...structuredClone(requirements), phase }, catalogue);
    await screen.findByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/ });
    await waitFor(() => expect(data.getClient().isFetching()).toBe(0));
    const quantity = screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/ });
    const row = quantity.closest(".configured-estimate-line") as HTMLElement;
    if (capability) {
      const toggle = within(row).getByRole("switch", { name: /PMC pricing mode/ });
      await user.click(toggle);
      expect(toggle).toBeChecked();
    } else {
      const toggle = within(row).getByRole("switch", { name: /PMC pricing mode/ });
      expect(toggle).toBeDisabled();
      await user.click(toggle);
      expect(toggle).not.toBeChecked();
      expect(within(row).queryByText("Vendor")).not.toBeInTheDocument();
    }
    expect(quantity).toBeEnabled();
    expect(data.saves).toEqual([]);
  });

  it("saves an unrelated Sales quantity edit after handoff without changing its read-only PMC mode or manual price", async () => {
    const user = userEvent.setup();
    authState.user.role = "estimator_sales";
    const { draft, catalogue } = configuredFixture();
    draft.capabilities = { ...draft.capabilities!, canChangePricingMode: false };
    draft.lineItems = draft.lineItems.map(line => line.id === "visible-living"
      ? { ...line, classification: "special" as const, pricingMode: "pmc" as const, rateSource: "manual" as const, rate: 42, ratePaise: 4200 }
      : line);
    const data = setup(draft, structuredClone(requirements), catalogue);
    await screen.findByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/ });
    await waitFor(() => expect(data.getClient().isFetching()).toBe(0));
    const quantity = screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/ });
    const row = quantity.closest(".configured-estimate-line") as HTMLElement;
    expect(within(row).getByText("PMC")).toBeVisible();
    const toggle = within(row).getByRole("switch", { name: /PMC pricing mode/ });
    expect(toggle).toBeDisabled();
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(within(row).queryByRole("radio", { name: /item type/ })).not.toBeInTheDocument();
    expect(within(row).getByRole("textbox", { name: /Selling rate/ })).toBeDisabled();
    await user.clear(quantity);
    await user.type(quantity, "4");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.saves).toHaveLength(1));
    expect((data.saves[0] as EstimateDraftInput).lineItems).toContainEqual(expect.objectContaining({
      id: "visible-living", quantity: 4, classification: "special", pricingMode: "pmc", rateSource: "manual", ratePaise: 4200
    }));
    expect(within(row).getByText("PMC")).toBeVisible();
  });

  it("identifies the configured item and focuses validation without writing on an invalid Submit", async () => {
    const { draft, catalogue } = configuredFixture();
    const data = setup(draft, structuredClone(requirements), catalogue); const user = userEvent.setup();
    const quantity = () => screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/i });
    await waitFor(() => expect(quantity()).toBeEnabled());
    await user.clear(quantity());
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeEnabled(); submit.focus(); await user.keyboard("{Enter}");
    expect(submit).toHaveAccessibleDescription(/Correct the highlighted quantities or prices.*Visible finish \(Living Room\)/);
    expect(document.getElementById(submit.getAttribute("aria-describedby")!)).toHaveFocus();
    expect(data.saves).toEqual([]); expect(data.submits).toEqual([]);
  });

  it.each(["missing", "denied"] as const)("explains %s Designer access without claiming an assignment issue and preserves edits on refresh", async kind => {
    const { draft, catalogue } = configuredFixture();
    draft.capabilities = kind === "missing" ? undefined : { canUnlockQuotation: false, canPublishQuotation: false, canPrepareQuotationSubmission: false };
    const data = setup(draft, structuredClone(requirements), catalogue); const user = userEvent.setup();
    const quantity = () => screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/i });
    await waitFor(() => expect(quantity()).toBeEnabled());
    await user.clear(quantity()); await user.type(quantity(), "19");
    const submit = screen.getByRole("button", { name: "Submit" });
    await user.click(submit);
    expect(submit).toHaveAccessibleDescription(kind === "missing" ? /Submission access could not be verified/ : /current access and workflow state/);
    expect(submit).not.toHaveAccessibleDescription(/current assignment/);
    await user.click(screen.getByRole("button", { name: "Refresh estimate access" }));
    await waitFor(() => expect(submit).toHaveAccessibleDescription(kind === "missing" ? /Submission access could not be verified/ : /current access and workflow state/));
    expect(quantity()).toHaveValue(19); expect(data.saves).toEqual([]); expect(data.submits).toEqual([]);
  });

  it("does not retain busy feedback after repeated Submit clicks and a failed save", async () => {
    const data = setup(initialDesignerQuotation()); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "245");
    let finish!: () => void; data.pauseSave(new Promise(resolve => { finish = resolve; })); data.failSave(422);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: "Submitting…" }));
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeEnabled();
    expect(screen.getByText("Wait for the current estimate action to finish.")).toBeVisible();
    await act(async () => finish());
    await screen.findByText("Review this estimate before saving.");
    expect(screen.queryByText("Wait for the current estimate action to finish.")).not.toBeInTheDocument();
    expect(quantity).toHaveValue(245); expect(data.saves).toHaveLength(1); expect(data.submits).toEqual([]);
  });

  it("keeps initial approval current until an edit and submits an existing-item edit once", async () => {
    const data = setup(initialDesignerQuotation()), user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    const initialSubmit = screen.getByRole("button", { name: "Submit" });
    expect(initialSubmit).toBeEnabled();
    await user.click(initialSubmit);
    expect(initialSubmit).toHaveAccessibleDescription("Your initial approval is current. There are no quotation changes to submit for Client review.");
    expect(document.getElementById(initialSubmit.getAttribute("aria-describedby")!)).toHaveFocus();
    expect(data.saves).toEqual([]); expect(data.submits).toEqual([]);
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    await user.clear(quantity); await user.type(quantity, "230");
    expect(screen.getByText("The saved estimate has initial approval. Submit your unsaved changes for Client review.")).toBeVisible();
    expect(screen.queryByText("Initial estimate approved. No quotation changes require Client review.")).not.toBeInTheDocument();
    let finish!: () => void;
    data.pauseSave(new Promise(resolve => { finish = resolve; }));
    await user.dblClick(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(data.saves).toHaveLength(1));
    expect(data.submits).toEqual([]);
    expect(quantity).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeEnabled();
    await act(async () => finish());
    await waitFor(() => expect(data.submits).toEqual([{ expectedVersion: 8 }]));
    expect(data.state.estimate.estimation!.preApproval).toEqual(estimate.estimation!.preApproval);
  });

  it("preserves Designer edits after a rejected save and retries Submit without publishing the failed save", async () => {
    const data = setup(initialDesignerQuotation()), user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "240");
    data.failSave(422);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Review this estimate before saving.")).toBeVisible();
    expect(quantity).toHaveValue(240); expect(data.submits).toEqual([]);
    data.allowSave();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(data.submits).toEqual([{ expectedVersion: 8 }]));
    expect(data.saves).toHaveLength(2);
  });

  it("verifies an unknown Designer save before allowing a new submission attempt", async () => {
    const data = setup(initialDesignerQuotation()), user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "250");
    data.failSave(503, true);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(await screen.findByRole("button", { name: "Verify saved estimate" }));
    await screen.findByText("Estimate save confirmed. You can continue editing.");
    expect(data.submits).toEqual([]);
    data.allowSave();
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).not.toHaveAttribute("aria-describedby"));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(data.submits).toEqual([{ expectedVersion: 9 }]));
    expect(data.saves).toHaveLength(2);
  });

  it("keeps the committed Designer revision after publication failure and safely retries the latest version", async () => {
    const data = setup(initialDesignerQuotation()), user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "260");
    let fail = true;
    server.use(http.post("/api/v1/leads/lead-one/estimate/submit", async ({ request }) => {
      data.submits.push(await request.json());
      if (fail) return HttpResponse.json({ error: { code: "PUBLICATION_UNAVAILABLE", message: "Publication temporarily unavailable." } }, { status: 503 });
      data.state.estimate = { ...data.state.estimate, status: "sent_to_client", estimation: { ...data.state.estimate.estimation!, status: "sent_to_client", pendingReviewRoundId: "retry-round" } };
      return HttpResponse.json({ data: data.state.estimate });
    }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText(/Your changes are saved, but submission could not be confirmed/)).toBeVisible();
    expect(quantity).toHaveValue(260); expect(data.state.estimate.version).toBe(8);
    expect(screen.queryByText("Submitted to the client portal for approval.")).not.toBeInTheDocument();
    fail = false;
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).not.toHaveAttribute("aria-describedby"));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(data.submits).toEqual([{ expectedVersion: 8 }, { expectedVersion: 9 }]));
    expect(await screen.findByText("Submitted to the client portal for approval.")).toBeVisible();
  });

  it.each(["identity", "version", "publication"] as const)("does not publish when the saved Designer response fails %s validation", async failure => {
    const data = setup(initialDesignerQuotation()), user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "270");
    server.use(http.put("/api/v1/leads/lead-one/estimate", async ({ request }) => {
      const body = await request.json() as EstimateDraftInput; data.saves.push(body);
      const result = { ...data.state.estimate, ...body, version: failure === "version" ? 7 : 8,
        id: failure === "identity" ? "another-estimate" : data.state.estimate.id,
        quotationApprovalState: "revision_draft", currentQuotationApproved: false, requiresClientReapproval: true,
        quotationApprovalSource: null, currentQuotationApproval: null,
        capabilities: { canUnlockQuotation: false, canPublishQuotation: failure !== "publication", canPrepareQuotationSubmission: false } };
      return HttpResponse.json({ data: result });
    }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText(failure === "publication"
      ? "Publication is unavailable for the saved revision. Refresh the estimate to check your current assignment and access."
      : "The saved revision could not be verified. Refresh the estimate before submitting.");
    expect(data.saves).toHaveLength(1); expect(data.submits).toEqual([]);
  });

  it("does not create a review when the saved response confirms no material quotation change", async () => {
    const data = setup(initialDesignerQuotation()), user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "280");
    server.use(http.put("/api/v1/leads/lead-one/estimate", async ({ request }) => {
      const body = await request.json() as EstimateDraftInput; data.saves.push(body);
      data.state.estimate = { ...data.state.estimate, ...body, version: 8 } as EstimateDraft;
      return HttpResponse.json({ data: data.state.estimate });
    }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("No quotation changes need Client review. Your initial approval remains current.")).toBeVisible();
    expect(data.submits).toEqual([]); expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("lets the Designer add one item from a new basket after initial approval and submit it in one click", async () => {
    const { draft, catalogue } = configuredFixture();
    const source = catalogue.items[0]!.subBaskets[0]!.mainLines[0]!;
    catalogue.items.push({ id: "new-basket", name: "Woodwork", displayOrder: 2,
      subBaskets: [{ id: "new-sub", basketId: "new-basket", name: "Doors", displayOrder: 1, mainLines: [
        { ...source, basketId: "new-basket", subBasketId: "new-sub", id: "addition", mainLineId: "addition", name: "Additional finish", revisionId: "revision-addition" },
        { ...source, basketId: "new-basket", subBasketId: "new-sub", id: "unrelated", mainLineId: "unrelated", name: "Unrelated finish", revisionId: "revision-unrelated" }
      ] }] });
    Object.assign(draft, { status: "client_approved", designPlanStatus: "assigned", capabilities: { ...draft.capabilities, canPublishQuotation: false }, quotationApprovalState: "initial_current",
      currentQuotationApproved: true, requiresClientReapproval: false, quotationApprovalSource: "initial_unchanged",
      currentQuotationApproval: { kind: "initial_unchanged", ...draft.estimation!.preApproval } });
    const approved = structuredClone(draft.estimation!.preApproval);
    const existing = draft.lineItems.map(line => ({ id: line.id, roomName: line.roomName, quantity: line.quantity, included: line.included }));
    const first = setup(draft, structuredClone(requirements), catalogue);
    server.use(http.put("/api/v1/leads/lead-one/estimate", async ({ request }) => {
      const body = await request.json() as EstimateDraftInput;
      first.saves.push(body);
      first.state.estimate = { ...first.state.estimate, ...body, version: first.state.estimate.version! + 1,
        quotationApprovalState: "revision_draft", currentQuotationApproved: false, requiresClientReapproval: true,
        quotationApprovalSource: null, currentQuotationApproval: null,
        capabilities: { canUnlockQuotation: false, canPublishQuotation: true, canPrepareQuotationSubmission: true },
        lineItems: body.lineItems.map(line => line.source === "configuration"
          ? { mainLineName: line.mainLineId === "addition" ? "Additional finish" : line.mainLineId, mainBasketName: line.mainBasketId === "new-basket" ? "Woodwork" : "Interiors", subBasketName: line.subBasketId === "new-sub" ? "Doors" : "Finishes", uomName: "units", uomDecimalScale: 0, ...first.state.estimate.lineItems.find(saved => saved.id === line.id), ...line, id: line.id ?? `${line.mainLineId}-${line.roomId}` } as ConfiguredEstimateLine : line) };
      return HttpResponse.json({ data: first.state.estimate });
    }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add items" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "new-basket");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub Basket" }), "new-sub");
    await user.type(screen.getByRole("searchbox", { name: "Search available items" }), "Additional");
    await user.click(screen.getByRole("button", { name: "Add Additional finish" }));
    expect(screen.getByRole("button", { name: "Added Additional finish" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Additional finish.*Living Room/i })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Submitted to the client portal for approval.");
    expect(first.saves).toHaveLength(1);
    expect(first.state.estimate.selectedMainBasketIds).toEqual(["basket", "new-basket"]);
    expect(first.state.estimate.selectedMainBasketClassifications).toContainEqual({ mainBasketId: "new-basket", classification: "standard" });
    const added = first.state.estimate.lineItems.filter(line => !existing.some(saved => saved.id === line.id));
    expect(added).toEqual([expect.objectContaining({ mainLineId: "addition", roomId: "living", included: true })]);
    for (const line of existing) expect(first.state.estimate.lineItems).toContainEqual(expect.objectContaining(line));
    expect(first.state.estimate.estimation!.preApproval).toEqual(approved);
    expect(first.submits).toEqual([{ expectedVersion: 8 }]);
    const saved = structuredClone(first.state.estimate);
    first.unmount();

    const reloaded = setup(saved, structuredClone(requirements), catalogue);
    await waitFor(() => expect(screen.getByText("Additional finish")).toBeVisible());
    expect(screen.queryByText("Unrelated finish")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Bedroom/ }));
    expect(screen.queryByText("Additional finish")).not.toBeInTheDocument();
    expect(reloaded.state.estimate.lineItems).toContainEqual(expect.objectContaining({ id: "visible-bedroom", quantity: 3 }));
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(reloaded.submits).toEqual([]);
    expect(reloaded.saves).toEqual([]);
    expect(reloaded.state.estimate.estimation).toMatchObject({ preApproval: approved, status: "sent_to_client", pendingReviewRoundId: "post-round" });
    expect(reloaded.state.estimate.lineItems.filter(line => line.source === "configuration" && line.mainLineId === "addition")).toHaveLength(1);
  });

  it.each([false, true])("undoes a new-basket addition without losing explicit parent selection (%s)", async explicitlySelected => {
    const { draft, catalogue } = configuredFixture();
    const source = catalogue.items[0]!.subBaskets[0]!.mainLines[0]!;
    catalogue.items.push({ id: "new-basket", name: "Woodwork", displayOrder: 2,
      subBaskets: [{ id: "new-sub", basketId: "new-basket", name: "Doors", displayOrder: 1,
        mainLines: [{ ...source, basketId: "new-basket", subBasketId: "new-sub", id: "addition", mainLineId: "addition", name: "Additional finish", revisionId: "revision-addition" }] }] });
    if (explicitlySelected) draft.selectedMainBasketIds!.push("new-basket");
    const expectedBaskets = [...draft.selectedMainBasketIds!];
    const { saves } = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add items" }));
    await user.click(screen.getByRole("button", { name: "Add Additional finish" }));
    await user.click(screen.getByRole("checkbox", { name: /Additional finish/ }));
    expect(screen.queryByRole("spinbutton", { name: /Additional finish/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Submitted to the client portal for approval.");
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ selectedMainBasketIds: expectedBaskets });
    expect((saves[0] as EstimateDraftInput).lineItems).not.toContainEqual(expect.objectContaining({ mainLineId: "addition" }));
  });

  it("keeps both rapid additions from different new baskets and ignores a repeated Add", async () => {
    const { draft, catalogue } = configuredFixture();
    const source = catalogue.items[0]!.subBaskets[0]!.mainLines[0]!;
    for (const suffix of ["A", "B"]) catalogue.items.push({ id: `basket-${suffix}`, name: `Extra ${suffix}`, displayOrder: 2,
      subBaskets: [{ id: `sub-${suffix}`, basketId: `basket-${suffix}`, name: `Sub ${suffix}`, displayOrder: 1,
        mainLines: [{ ...source, basketId: `basket-${suffix}`, subBasketId: `sub-${suffix}`, id: `addition-${suffix}`, mainLineId: `addition-${suffix}`, name: `Additional ${suffix}`, revisionId: `revision-${suffix}` }] }] });
    const { saves } = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add items" }));
    const first = screen.getByRole("button", { name: "Add Additional A" });
    const second = screen.getByRole("button", { name: "Add Additional B" });
    act(() => { first.click(); first.click(); second.click(); });
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Submitted to the client portal for approval.");
    const saved = saves[0] as EstimateDraftInput;
    expect(saved.selectedMainBasketIds).toEqual(["basket", "basket-A", "basket-B"]);
    expect(saved.lineItems.filter(line => line.source === "configuration" && line.mainLineId.startsWith("addition")))
      .toEqual([expect.objectContaining({ mainLineId: "addition-A", roomId: "living", included: true }),
        expect.objectContaining({ mainLineId: "addition-B", roomId: "living", included: true })]);
  });

  it("recovers an invalid quantity after excluding a saved item without including it again", async () => {
    const { draft, catalogue } = configuredFixture();
    const { saves } = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    await screen.findByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/i });
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).not.toHaveAttribute("aria-describedby"));
    await user.clear(screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/i }));
    await user.click(screen.getByRole("checkbox", { name: /Visible finish/ }));
    const recovery = await screen.findByRole("region", { name: "Excluded items needing review" });
    expect(within(recovery).getByRole("checkbox", { name: /Visible finish/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(saves).toEqual([]);
    const excludedQuantity = within(recovery).getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/i });
    await user.type(excludedQuantity, "23");
    expect(excludedQuantity).toHaveValue(23);
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Submitted to the client portal for approval.");
    expect((saves[0] as EstimateDraftInput).lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "visible-living", quantity: 23, included: false }),
      expect.objectContaining({ id: "visible-bedroom", quantity: 3, included: true })
    ]));
    expect(screen.queryByRole("region", { name: "Excluded items needing review" })).not.toBeInTheDocument();
  });

  it("exposes an excluded saved item's changed unit for explicit quantity review before saving", async () => {
    const { draft, catalogue } = configuredFixture();
    draft.lineItems = draft.lineItems.map(line => line.id === "internal-living" ? { ...line, included: false } : line);
    const item = catalogue.items[0]!.subBaskets[0]!.mainLines.find(line => line.mainLineId === "internal")!;
    item.uom = { id: "new-unit", code: "SQFT", name: "sq ft", decimalScale: 2 };
    const { saves } = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    const recovery = await screen.findByRole("region", { name: "Excluded items needing review" });
    expect(within(recovery).getByText(/Unit changed from units to sq ft/)).toBeVisible();
    expect(within(recovery).getByRole("checkbox", { name: /Internal finish/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    const quantity = within(recovery).getByRole("spinbutton", { name: /Quantity.*Internal finish.*Living Room/i });
    await user.clear(quantity); await user.type(quantity, "3.5");
    expect(quantity).toHaveValue(3.5);
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Finish reviewing excluded items" }));
    expect(screen.queryByRole("region", { name: "Excluded items needing review" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add items" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Submitted to the client portal for approval.");
    expect((saves[0] as EstimateDraftInput).lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "internal-living", uomId: "new-unit", quantity: 3.5, included: false })
    ]));
  });

  it.each([403, 503])("preserves dirty exit protection and input after lead refresh failure %s", async status => {
    const { draft, catalogue } = configuredFixture();
    const data = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    const quantity = () => screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/i });
    await waitFor(() => expect(quantity()).toBeEnabled());
    await user.clear(quantity()); await user.type(quantity(), "8");
    let unavailable = true;
    server.use(http.get("/api/v1/leads/lead-one", () => unavailable
      ? HttpResponse.json({ error: { code: "LEAD_UNAVAILABLE", message: "Lead unavailable" } }, { status })
      : HttpResponse.json({ data: { id: "lead-one", projectId: "project-one", clientName: "Sample client", projectName: "Sample project", propertyType: "2BHK", estimationWorkflowVersion: 2 } })));
    await act(async () => { await data.getClient().invalidateQueries({ queryKey: leadKeys.detail("lead-one") }); });
    await screen.findByText(/We couldn't load this lead/);
    expect(screen.queryByRole("spinbutton", { name: /Quantity.*Visible finish/ })).not.toBeInTheDocument();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    unavailable = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(quantity()).toHaveValue(8));
    expect(data.saves).toEqual([]);
  });

  it("saves once before returning to baskets, keeps the selected room, and restores the edited quantity", async () => {
    const { draft, catalogue } = configuredFixture();
    const data = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    await screen.findByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/i });
    await user.click(screen.getByRole("button", { name: /Bedroom.*sqft/i }));
    const quantity = screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Bedroom/i });
    await user.clear(quantity); await user.type(quantity, "9");
    let finish!: () => void;
    data.pauseSave(new Promise<void>(resolve => { finish = resolve; }));
    await user.dblClick(screen.getByRole("button", { name: "Save and edit baskets" }));
    await waitFor(() => expect(data.saves).toHaveLength(1));
    expect(screen.queryByRole("heading", { name: "Configure estimate" })).not.toBeInTheDocument();
    expect(quantity).toBeDisabled();
    await act(async () => finish());
    expect(await screen.findByRole("heading", { name: "Configure estimate" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(screen.getByRole("region", { name: "Estimate items for Bedroom" })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Bedroom/i })).toHaveValue(9);
    expect((data.saves[0] as EstimateDraftInput).lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "visible-bedroom", quantity: 9 }), expect.objectContaining({ id: "visible-living", quantity: 2 })
    ]));
    expect(data.submits).toEqual([]);
  });

  it("confirms a Sub Basket removal for the full current room despite search, saves from setup, and keeps the other room", async () => {
    const { draft, catalogue } = configuredFixture();
    const data = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    await screen.findByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/i });
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "Visible");
    expect(screen.queryByText("Internal finish")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Finishes Sub Basket from Living Room" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Finishes in Living Room?" });
    expect(dialog).toHaveTextContent("All selected items in this Sub Basket will be removed from this room");
    await user.click(within(dialog).getByRole("button", { name: "Remove from estimate" }));
    expect(screen.queryByRole("checkbox", { name: /Visible finish/ })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Search estimate items" }));
    expect(screen.queryByRole("checkbox", { name: /Internal finish/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save and edit baskets" }));
    await screen.findByRole("heading", { name: "Configure estimate" });
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(data.saves).toHaveLength(1);
    const savedLines = (data.saves[0] as EstimateDraftInput).lineItems;
    expect(savedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "visible-living", included: false, quantity: 2 }),
      expect.objectContaining({ id: "internal-living", included: false, quantity: 1 }),
      expect.objectContaining({ id: "visible-bedroom", included: true, quantity: 3 })
    ]));
    const stored = structuredClone(data.state.estimate);
    data.unmount();
    setup(stored, structuredClone(requirements), catalogue);
    await screen.findByRole("button", { name: "Add items" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).not.toHaveAttribute("aria-describedby"));
    expect(screen.queryByRole("checkbox", { name: /Visible finish/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Internal finish/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Bedroom.*sqft/i }));
    expect(screen.getByRole("checkbox", { name: /Visible finish/ })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Bedroom/i })).toHaveValue(3);
    expect(data.submits).toEqual([]);
  });

  it("stays in item selection after a rejected navigation save and retries the preserved input", async () => {
    const { draft, catalogue } = configuredFixture();
    const data = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    const quantity = () => screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/i });
    await waitFor(() => expect(quantity()).toBeEnabled());
    await user.clear(quantity()); await user.type(quantity(), "8");
    data.failSave(422);
    await user.click(screen.getByRole("button", { name: "Save and edit baskets" }));
    expect(await screen.findByText("Review this estimate before saving.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Configure estimate" })).not.toBeInTheDocument();
    expect(quantity()).toHaveValue(8);
    expect(quantity()).toBeEnabled();
    data.allowSave();
    await user.click(screen.getByRole("button", { name: "Save and edit baskets" }));
    await screen.findByRole("heading", { name: "Configure estimate" });
    expect(data.saves).toHaveLength(2);
    expect((data.saves[1] as EstimateDraftInput).lineItems).toEqual(expect.arrayContaining([expect.objectContaining({ id: "visible-living", quantity: 8 })]));
  });

  it("verifies an unknown committed save before permitting navigation without resubmitting", async () => {
    const { draft, catalogue } = configuredFixture();
    const data = setup(draft, structuredClone(requirements), catalogue);
    const user = userEvent.setup();
    const quantity = () => screen.getByRole("spinbutton", { name: /Quantity.*Visible finish.*Living Room/i });
    await waitFor(() => expect(quantity()).toBeEnabled());
    await user.clear(quantity()); await user.type(quantity(), "6");
    data.failSave(503, true);
    await user.click(screen.getByRole("button", { name: "Save and edit baskets" }));
    await screen.findByRole("button", { name: "Verify saved estimate" });
    expect(screen.queryByRole("heading", { name: "Configure estimate" })).not.toBeInTheDocument();
    expect(quantity()).toHaveValue(6);
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(data.submits).toEqual([]); expect(data.saves).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Verify saved estimate" }));
    expect(await screen.findByText("Estimate save confirmed. You can continue editing.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit baskets" }));
    await screen.findByRole("heading", { name: "Configure estimate" });
    expect(data.saves).toHaveLength(1);
    expect(data.submits).toEqual([]);
  });

  it("preserves an incomplete manual rate when both the old rate and serialized edit are null", async () => {
    const { draft, catalogue } = configuredFixture();
    draft.lineItems = draft.lineItems.map(line => line.id === "visible-living"
      ? { ...line, rateSource: "manual" as const, ratePaise: null, rate: null, amountPaise: null, amount: null } as ConfiguredEstimateLine : line);
    const { state, getClient } = setup(draft, structuredClone(requirements), catalogue);
    const rate = () => screen.getByRole("textbox", { name: /selling rate.*visible finish.*living room/i });
    await screen.findByRole("textbox", { name: /selling rate.*visible finish.*living room/i });
    await waitFor(() => expect(rate()).toBeEnabled());
    expect(rate()).toHaveValue("");
    await userEvent.type(rate(), "12.");
    state.estimate = { ...state.estimate, version: 8 };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); await getClient().refetchQueries({ queryKey: ["quotation", "project-one"] }); });
    expect((await screen.findAllByText(/Your local edits are preserved/))[0]).toBeVisible();
    expect(rate()).toHaveValue("12.");
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("preserves editable rows excluded from the save payload, including after saving selected items", async () => {
    authState.user.role = "estimator_sales";
    const { draft, catalogue } = configuredFixture();
    draft.lineItems = draft.lineItems.filter(line => line.id !== "internal-living");
    const { state, getClient, saves } = setup(draft, structuredClone(requirements), catalogue);
    const quantity = () => screen.getByRole("spinbutton", { name: /quantity.*internal finish.*living room/i });
    await userEvent.click(await screen.findByRole("checkbox", { name: /Internal finish/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    await userEvent.clear(quantity()); await userEvent.type(quantity(), "7");
    await userEvent.click(screen.getByRole("checkbox", { name: /Internal finish/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect((saves[0] as EstimateDraftInput).lineItems.some(line => line.source === "configuration" && line.mainLineId === "internal")).toBe(false);
    state.estimate = { ...state.estimate, version: 9 };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); await getClient().refetchQueries({ queryKey: ["quotation", "project-one"] }); });
    expect((await screen.findAllByText(/Your local edits are preserved/))[0]).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Internal finish/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("retains a partial rate typed while an earlier blank-rate save is in flight", async () => {
    authState.user.role = "estimator_sales";
    const { draft, catalogue } = configuredFixture();
    draft.lineItems = draft.lineItems.map(line => line.id === "visible-living"
      ? { ...line, rateSource: "manual" as const, ratePaise: null, rate: null, amountPaise: null, amount: null } as ConfiguredEstimateLine : line);
    const { state, getClient, saves, pauseSave } = setup(draft, structuredClone(requirements), catalogue);
    let finish!: () => void;
    pauseSave(new Promise(resolve => { finish = resolve; }));
    const rate = () => screen.getByRole("textbox", { name: /selling rate.*visible finish.*living room/i });
    await screen.findByRole("textbox", { name: /selling rate.*visible finish.*living room/i });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    await userEvent.type(rate(), "12.");
    await act(async () => finish());
    await screen.findByText("Estimate draft saved.");
    expect(rate()).toHaveValue("12.");
    state.estimate = { ...state.estimate, version: 9 };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); await getClient().refetchQueries({ queryKey: ["quotation", "project-one"] }); });
    expect((await screen.findAllByText(/Your local edits are preserved/))[0]).toBeVisible();
    expect(rate()).toHaveValue("12.");
  });

  it("refreshes after the actual configured edits have been saved", async () => {
    authState.user.role = "estimator_sales";
    const { draft, catalogue } = configuredFixture();
    const { state, getClient } = setup(draft, structuredClone(requirements), catalogue);
    const quantity = () => screen.getByRole("spinbutton", { name: /quantity.*visible finish.*living room/i });
    await screen.findByRole("spinbutton", { name: /quantity.*visible finish.*living room/i });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    await userEvent.clear(quantity()); await userEvent.type(quantity(), "7");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    state.estimate = { ...state.estimate, version: 9,
      lineItems: state.estimate.lineItems.map(line => line.id === "visible-living" ? { ...line, quantity: 5 } : line) };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); await getClient().refetchQueries({ queryKey: ["quotation", "project-one"] }); });
    await waitFor(() => expect(quantity()).toHaveValue(5));
    expect(screen.queryByText("Your local edits are preserved. Review or copy them before reloading.")).not.toBeInTheDocument();
  });

  it("refreshes untouched configured rows across rooms when catalogue order differs from saved order", async () => {
    const { draft, catalogue } = configuredFixture();
    const { state, getClient } = setup(draft, structuredClone(requirements), catalogue);
    await screen.findByRole("spinbutton", { name: /quantity.*visible finish.*living room/i });
    const quantity = () => screen.getByRole("spinbutton", { name: /quantity.*visible finish.*living room/i });
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).not.toHaveAttribute("aria-describedby"));
    expect(quantity()).toHaveValue(2);
    for (const nextQuantity of [4, 5]) {
      state.estimate = { ...state.estimate, version: state.estimate.version! + 1,
        lineItems: state.estimate.lineItems.map(line => line.id === "visible-living" ? { ...line, quantity: nextQuantity } : line) };
      await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); await getClient().refetchQueries({ queryKey: ["quotation", "project-one"] }); });
      await waitFor(() => expect(quantity()).toHaveValue(nextQuantity));
      expect(screen.queryByText("Your local edits are preserved. Review or copy them before reloading.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    }
  });

  it("preserves edited configured rows and rejects a silent rebase when another session saves", async () => {
    const { draft, catalogue } = configuredFixture();
    const { state, getClient, saves } = setup(draft, structuredClone(requirements), catalogue);
    await screen.findByRole("spinbutton", { name: /quantity.*visible finish.*living room/i });
    const quantity = () => screen.getByRole("spinbutton", { name: /quantity.*visible finish.*living room/i });
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).not.toHaveAttribute("aria-describedby"));
    await userEvent.clear(quantity()); await userEvent.type(quantity(), "9");
    state.estimate = { ...state.estimate, version: 8,
      lineItems: state.estimate.lineItems.map(line => line.id === "visible-living" ? { ...line, quantity: 4 } : line) };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); await getClient().refetchQueries({ queryKey: ["quotation", "project-one"] }); });
    expect(quantity()).toHaveValue(9);
    expect((await screen.findAllByText(/Your local edits are preserved/))[0]).toBeVisible();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Submit" })); expect(saves).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Reload saved estimate (discard edits)" }));
    await waitFor(() => expect(quantity()).toHaveValue(4));
  });

  it("refreshes an untouched form when a newer saved revision arrives", async () => {
    const { state, getClient } = setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    expect(quantity).toHaveValue(200);
    state.estimate = { ...state.estimate, version: 8, lineItems: state.estimate.lineItems.map(line => ({ ...line, quantity: 300 })) };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); await getClient().refetchQueries({ queryKey: ["quotation", "project-one"] }); });
    await waitFor(() => expect(quantity).toHaveValue(300));
    expect(screen.queryByText("Your local edits are preserved. Review or copy them before reloading.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("allows the server-authorized primary Designer to send a v3 post quotation before drawing approval", async () => {
    const { saves, submits } = setup({ ...estimate, quotationApprovalState: "revision_draft", currentQuotationApproved: false,
      requiresClientReapproval: true, quotationApprovalSource: null, currentQuotationApproval: null,
      capabilities: { canUnlockQuotation: false, canPublishQuotation: true }, designPlanStatus: "assigned", estimation: { ...estimate.estimation!, workflowVersion: 3, pricedRevision: 2, approvedDesignScopeRevision: null } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).not.toHaveAttribute("aria-describedby"));
    expect(screen.queryByText(/Final submission is waiting/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(submits).toEqual([{ expectedVersion: 8 }]));
    expect(saves).toHaveLength(1);
  });

  it("does not offer a second Client submission while the unchanged initial approval is current", async () => {
    const current = { kind: "initial_unchanged" as const, reviewRoundId: "pre-round", estimateVersion: 7, approvedAt: "2026-11-04T08:00:00Z" };
    const { submits } = setup({ ...estimate, quotationApprovalState: "initial_current", currentQuotationApproved: true,
      requiresClientReapproval: false, quotationApprovalSource: "initial_unchanged", currentQuotationApproval: current,
      capabilities: { canUnlockQuotation: false, canPublishQuotation: true, canPrepareQuotationSubmission: true }, designPlanStatus: "assigned",
      estimation: { ...estimate.estimation!, workflowVersion: 3, pricedRevision: 2, approvedDesignScopeRevision: null } });
    expect(await screen.findByText("Initial estimate approved. No quotation changes require Client review.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    expect(submits).toEqual([]);
  });

  it("keeps Sales post-quotation Save and read available without a save-first publication action", async () => {
    authState.user.role = "estimator_sales";
    const { saves, submits } = setup({ ...estimate, capabilities: { canUnlockQuotation: false, canPublishQuotation: false }, estimation: { ...estimate.estimation!, workflowVersion: 3, pricedRevision: 2 } });
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    expect(quantity).toBeEnabled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    expect(saves).toEqual([]); expect(submits).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(submits).toEqual([]);
  });

  it("hides the ready-for-client shortcut when the backend denies v3 publication", async () => {
    setup({ ...estimate, status: "ready_for_client", capabilities: { canUnlockQuotation: false, canPublishQuotation: false }, estimation: { ...estimate.estimation!, workflowVersion: 3, pricedRevision: 2, status: "ready_for_client" } });
    await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    expect(screen.queryByRole("button", { name: "Send to client" })).not.toBeInTheDocument();
  });

  it("requires an explicit Sales approve-and-send action for the first v3 quotation", async () => {
    authState.user.role = "estimator_sales";
    const { submits } = setup({ ...estimate, capabilities: { canUnlockQuotation: false, canPublishQuotation: true }, designPlanStatus: "pending_assignment", estimation: { ...estimate.estimation!, workflowVersion: 3, phase: "pre", pricedRevision: 1, preApproval: null, approvedDesignScopeRevision: null } });
    await userEvent.click(await screen.findByRole("button", { name: "Submit" }));
    const checklist = await screen.findByRole("dialog", { name: "Before submitting your estimate" });
    for (const checkbox of within(checklist).getAllByRole("checkbox")) await userEvent.click(checkbox);
    await userEvent.click(within(checklist).getByRole("button", { name: "Confirm and submit" }));
    await waitFor(() => expect(submits).toEqual([{ expectedVersion: 8, approveSales: true }]));
  });

  it("submits the just-saved version and retains the assigned designer workspace", async () => {
    const { saves, submits } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "120");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(submits).toEqual([{ expectedVersion: 8 }]));
    expect(saves[0]).toMatchObject({ expectedVersion: 7, lineItems: [expect.objectContaining({ quantity: 120 })] });
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^(?:Save and edit|Edit|View) baskets$/ }));
    expect(screen.getByRole("link", { name: "Back to design plans" })).toHaveAttribute("href", "/designer/design-plans");
  });

  it("preserves unsaved values and blocks rebasing silently after a background version update", async () => {
    const { state, getClient, saves } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "123");
    state.estimate = { ...state.estimate, version: 8, lineItems: state.estimate.lineItems.map((line) => ({ ...line, quantity: 300 })) };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); await getClient().refetchQueries({ queryKey: ["quotation", "project-one"] }); });
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByRole("button", { name: "Submit" })).toHaveAccessibleDescription(/Reload the latest saved estimate/);
    expect(quantity).toHaveValue(123); expect(saves).toEqual([]);
    expect(screen.getAllByText(/Your local edits are preserved/)[0]).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reload saved estimate (discard edits)" }));
    await waitFor(() => expect(quantity).toHaveValue(300)); expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("keeps final-closed estimates readonly despite an editable physical status", async () => {
    setup({ ...estimate, estimation: { ...estimate.estimation!, editClosedAt: "2026-10-13T12:00:00Z" } });
    expect(await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  it("blocks final publication when design has not approved the current scope", async () => {
    const data = setup({ ...estimate, estimation: { ...estimate.estimation!, approvedDesignScopeRevision: 1 } });
    const submit = await screen.findByRole("button", { name: "Submit" });
    expect(submit).toBeEnabled(); await userEvent.click(submit);
    expect(submit).toHaveAccessibleDescription(/Verify client requests and the current design approval/);
    expect(data.saves).toEqual([]); expect(data.submits).toEqual([]);
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
  });
});
