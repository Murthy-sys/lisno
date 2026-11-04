import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { leadKeys, type ConfiguredEstimateLine, type EstimateDraft, type EstimateDraftInput } from "./leadsApi";
import type { EstimationCatalogue } from "./estimationCatalogueApi";
import type { EstimateRequirementsDetail } from "../client/estimateRequirementsApi";
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "test-estimator" }, reviewSession: { id: "test-session" }, status: "authenticated" }) }));
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
    capabilities: { canUnlockQuotation: false, canPublishQuotation: false },
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

describe("Collaborative estimate workspace", () => {
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
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
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
    expect(screen.getByRole("checkbox", { name: /Visible finish/ })).not.toBeChecked();
    await user.clear(screen.getByRole("searchbox", { name: "Search estimate items" }));
    expect(screen.getByRole("checkbox", { name: /Internal finish/ })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save and edit baskets" }));
    await screen.findByRole("heading", { name: "Configure estimate" });
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(data.saves).toHaveLength(2));
    await screen.findByText("Estimate draft saved.");
    const savedLines = (data.saves[1] as EstimateDraftInput).lineItems;
    expect(savedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "visible-living", included: false, quantity: 2 }),
      expect.objectContaining({ id: "internal-living", included: false, quantity: 1 }),
      expect.objectContaining({ id: "visible-bedroom", included: true, quantity: 3 })
    ]));
    const stored = structuredClone(data.state.estimate);
    data.unmount();
    setup(stored, structuredClone(requirements), catalogue);
    await screen.findByRole("checkbox", { name: /Visible finish/ });
    expect(screen.getByRole("checkbox", { name: /Visible finish/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Internal finish/ })).not.toBeChecked();
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
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
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
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); });
    expect(await screen.findByText(/Your local edits are preserved/)).toBeVisible();
    expect(rate()).toHaveValue("12.");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("preserves editable rows excluded from the save payload, including after saving selected items", async () => {
    const { draft, catalogue } = configuredFixture();
    draft.lineItems = draft.lineItems.filter(line => line.id !== "internal-living");
    const { state, getClient, saves } = setup(draft, structuredClone(requirements), catalogue);
    const quantity = () => screen.getByRole("spinbutton", { name: /quantity.*internal finish.*living room/i });
    await screen.findByRole("spinbutton", { name: /quantity.*internal finish.*living room/i });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    await userEvent.clear(quantity()); await userEvent.type(quantity(), "7");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect((saves[0] as EstimateDraftInput).lineItems.some(line => line.source === "configuration" && line.mainLineId === "internal")).toBe(false);
    state.estimate = { ...state.estimate, version: 9 };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); });
    expect(await screen.findByText(/Your local edits are preserved/)).toBeVisible();
    expect(quantity()).toHaveValue(7);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("retains a partial rate typed while an earlier blank-rate save is in flight", async () => {
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
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); });
    expect(await screen.findByText(/Your local edits are preserved/)).toBeVisible();
    expect(rate()).toHaveValue("12.");
  });

  it("refreshes after the actual configured edits have been saved", async () => {
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
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); });
    await waitFor(() => expect(quantity()).toHaveValue(5));
    expect(screen.queryByText(/Your local edits are preserved/)).not.toBeInTheDocument();
  });

  it("refreshes untouched configured rows across rooms when catalogue order differs from saved order", async () => {
    const { draft, catalogue } = configuredFixture();
    const { state, getClient } = setup(draft, structuredClone(requirements), catalogue);
    await screen.findByRole("spinbutton", { name: /quantity.*visible finish.*living room/i });
    const quantity = () => screen.getByRole("spinbutton", { name: /quantity.*visible finish.*living room/i });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    expect(quantity()).toHaveValue(2);
    for (const nextQuantity of [4, 5]) {
      state.estimate = { ...state.estimate, version: state.estimate.version! + 1,
        lineItems: state.estimate.lineItems.map(line => line.id === "visible-living" ? { ...line, quantity: nextQuantity } : line) };
      await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); });
      await waitFor(() => expect(quantity()).toHaveValue(nextQuantity));
      expect(screen.queryByText(/Your local edits are preserved/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    }
  });

  it("preserves edited configured rows and rejects a silent rebase when another session saves", async () => {
    const { draft, catalogue } = configuredFixture();
    const { state, getClient, saves } = setup(draft, structuredClone(requirements), catalogue);
    await screen.findByRole("spinbutton", { name: /quantity.*visible finish.*living room/i });
    const quantity = () => screen.getByRole("spinbutton", { name: /quantity.*visible finish.*living room/i });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
    await userEvent.clear(quantity()); await userEvent.type(quantity(), "9");
    state.estimate = { ...state.estimate, version: 8,
      lineItems: state.estimate.lineItems.map(line => line.id === "visible-living" ? { ...line, quantity: 4 } : line) };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); });
    expect(quantity()).toHaveValue(9);
    expect(await screen.findByText(/Your local edits are preserved/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled(); expect(saves).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Reload saved estimate (discard edits)" }));
    await waitFor(() => expect(quantity()).toHaveValue(4));
  });

  it("refreshes an untouched form when a newer saved revision arrives", async () => {
    const { state, getClient } = setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    expect(quantity).toHaveValue(200);
    state.estimate = { ...state.estimate, version: 8, lineItems: state.estimate.lineItems.map(line => ({ ...line, quantity: 300 })) };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); });
    await waitFor(() => expect(quantity).toHaveValue(300));
    expect(screen.queryByText(/Your local edits are preserved/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });

  it("allows the server-authorized primary Designer to send a v3 post quotation before drawing approval", async () => {
    const { saves, submits } = setup({ ...estimate, capabilities: { canUnlockQuotation: false, canPublishQuotation: true }, designPlanStatus: "assigned", estimation: { ...estimate.estimation!, workflowVersion: 3, pricedRevision: 2, approvedDesignScopeRevision: null } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send designer-revised quotation" })).toBeEnabled());
    expect(screen.queryByText(/Final submission is waiting/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send designer-revised quotation" }));
    await waitFor(() => expect(submits).toEqual([{ expectedVersion: 8 }]));
    expect(saves).toHaveLength(1);
  });

  it("keeps Sales post-quotation Save and read available without a save-first publication action", async () => {
    const { saves, submits } = setup({ ...estimate, capabilities: { canUnlockQuotation: false, canPublishQuotation: false }, estimation: { ...estimate.estimation!, workflowVersion: 3, pricedRevision: 2 } });
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    expect(quantity).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Send designer-revised quotation" })).not.toBeInTheDocument();
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
    const { submits } = setup({ ...estimate, capabilities: { canUnlockQuotation: false, canPublishQuotation: true }, designPlanStatus: "pending_assignment", estimation: { ...estimate.estimation!, workflowVersion: 3, phase: "pre", pricedRevision: 1, preApproval: null, approvedDesignScopeRevision: null } });
    await userEvent.click(await screen.findByRole("button", { name: "Approve and send to client" }));
    await waitFor(() => expect(submits).toEqual([{ expectedVersion: 8, approveSales: true }]));
  });

  it("submits the just-saved version and retains the assigned designer workspace", async () => {
    const { saves, submits } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "120");
    await user.click(screen.getByRole("button", { name: "Submit final estimate" }));
    await waitFor(() => expect(submits).toEqual([{ expectedVersion: 8 }]));
    expect(saves[0]).toMatchObject({ expectedVersion: 7, lineItems: [expect.objectContaining({ quantity: 120 })] });
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^(?:Save and edit|Edit|View) baskets$/ }));
    expect(screen.getByRole("link", { name: "Back to design plans" })).toHaveAttribute("href", "/designer/design-plans");
  });

  it("preserves unsaved values and blocks rebasing silently after a background version update", async () => {
    const { state, getClient, saves } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "123");
    state.estimate = { ...state.estimate, version: 8, lineItems: state.estimate.lineItems.map((line) => ({ ...line, quantity: 300 })) };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled());
    expect(quantity).toHaveValue(123); expect(saves).toEqual([]);
    expect(screen.getByText(/Your local edits are preserved/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reload saved estimate (discard edits)" }));
    await waitFor(() => expect(quantity).toHaveValue(300)); expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });

  it("keeps final-closed estimates readonly despite an editable physical status", async () => {
    setup({ ...estimate, estimation: { ...estimate.estimation!, editClosedAt: "2026-10-13T12:00:00Z" } });
    expect(await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit final estimate" })).not.toBeInTheDocument();
  });

  it("blocks final publication when design has not approved the current scope", async () => {
    setup({ ...estimate, estimation: { ...estimate.estimation!, approvedDesignScopeRevision: 1 } });
    expect(await screen.findByRole("button", { name: "Submit final estimate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });
});
