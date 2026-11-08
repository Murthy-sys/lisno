import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { leadKeys, type ConfiguredEstimateLine, type EstimateDraft, type EstimateDraftInput } from "./leadsApi";
import type { EstimationCatalogue } from "./estimationCatalogueApi";

const authState = vi.hoisted(() => ({ role: "estimator_sales" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "staff", role: authState.role }, status: "authenticated" }) }));
vi.mock("../messages", () => ({ ProjectChatNavigation: () => null }));
vi.mock("./estimateRevisionsApi", async importOriginal => ({
  ...await importOriginal<typeof import("./estimateRevisionsApi")>(),
  getEstimateRevisions: vi.fn(async () => ({ items: [], pagination: { limit: 20, nextCursor: null } }))
}));

beforeEach(() => { authState.role = "estimator_sales"; });
const json = (data: unknown) => Response.json({ data });
function setup(status: EstimateDraft["status"] = "draft", withSavedLine = false, overrides: Partial<EstimateDraft> = {}) {
  const rooms = [
    { id: "living", typeId: "living", label: "Living & Dining", sqft: 200, length: 20, width: 10 },
    { id: "kitchen", typeId: "kitchen", label: "Kitchen", sqft: 80, length: 10, width: 8 }
  ];
  const catalogue: EstimationCatalogue = { ineligibleLineCount: 0, items: [
    { id: "pop", name: "POP / Gypsum", displayOrder: 1, subBaskets: [{ id: "ceilings", basketId: "pop", name: "Ceilings", displayOrder: 1, mainLines: [
      { id: "ceiling", mainLineId: "ceiling", name: "Gypsum ceiling", basketId: "pop", subBasketId: "ceilings", displayOrder: 1,
        revisionId: "ceiling-revision", uom: { id: "unit", name: "sq ft", code: "SQFT", decimalScale: 2 },
        modeBaseRatesPaise: { pmc: 1000, sub_vendor: 2000, in_house: null } }
    ] }] },
    { id: "paint", name: "Painting", displayOrder: 2, subBaskets: [{ id: "walls", basketId: "paint", name: "Wall finishes", displayOrder: 1, mainLines: [
      { id: "paint-line", mainLineId: "paint-line", name: "Wall paint", basketId: "paint", subBasketId: "walls", displayOrder: 1,
        revisionId: "paint-revision", uom: { id: "unit", name: "sq ft", code: "SQFT", decimalScale: 2 },
        modeBaseRatesPaise: { pmc: 1500, sub_vendor: 3000, in_house: null } }
    ] }] }
  ] };
  const savedLine: ConfiguredEstimateLine = {
    id: "saved-ceiling", source: "configuration", catalogueId: "ceiling", roomId: "living", roomName: rooms[0]!.label,
    mainBasketId: "pop", mainBasketName: "POP / Gypsum", subBasketId: "ceilings", subBasketName: "Ceilings",
    mainLineId: "ceiling", mainLineName: "Gypsum ceiling", revisionId: "ceiling-revision", uomId: "unit", uomName: "sq ft", uomCode: "SQFT", uomDecimalScale: 2,
    unit: "sq ft", quantity: 2, included: true, pricingMode: "sub_vendor", rateSource: "manual", classification: "standard", modeTier: "signature",
    rate: 99, ratePaise: 9900, amount: 198, amountPaise: 19800, specification: null
  };
  let stored: EstimateDraft = { id: "estimate", version: 1, propertyType: "2BHK", rooms, scopes: [],
    selectedMainBasketIds: ["pop", "paint"], lineItems: withSavedLine ? [savedLine] : [],
    subtotal: withSavedLine ? 198 : 0, gst: withSavedLine ? 35.64 : 0, total: withSavedLine ? 233.64 : 0, status, approvalRequired: false, ...overrides };
  const saves: EstimateDraftInput[] = [];
  const requests: Array<{ method: string; url: string }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input), method = init?.method ?? "GET";
    requests.push({ method, url });
    if (url.endsWith("/leads/lead")) return json({ id: "lead", clientName: "Client", projectName: "Home", location: "Pune", propertyType: "2BHK" });
    if (url.endsWith("/leads/lead/estimate") && method === "GET") return json(stored);
    if (url.includes("/estimation/catalogue?")) return json({ ...catalogue, pagination: { total: 2, offset: 0, limit: 100, hasMore: false } });
    if (url.includes("/estimation/catalogue/recommendations?")) return json({ sources: [] });
    if (url.endsWith("/leads/lead/estimate") && method === "PUT") {
      const body = JSON.parse(String(init?.body)) as EstimateDraftInput;
      saves.push(body);
      stored = { ...stored, ...body, version: stored.version! + 1,
        lineItems: body.lineItems.map(line => line.source === "configuration" ? { ...savedLine, ...line, id: line.id ?? `saved-${line.mainLineId}` } : line) };
      return json(stored);
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  });
  const mount = () => {
    let client!: QueryClient;
    function Capture() { client = useQueryClient(); return null; }
    const view = renderWithQuery(<MemoryRouter initialEntries={["/estimator-sales/leads/lead/estimate"]}><Capture /><Routes>
      <Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} />
    </Routes></MemoryRouter>);
    return { ...view, client: () => client };
  };
  return { mount, saves, requests, newerSavedRevision: () => { stored = { ...stored, version: stored.version! + 1 }; } };
}

async function openEmptyBuilder(user: ReturnType<typeof userEvent.setup>) {
  const continueButton = await screen.findByRole("button", { name: "Continue to item selection" });
  await waitFor(() => expect(continueButton).toBeEnabled());
  await user.click(continueButton);
}

describe("Sales direct catalogue browsing", () => {
  it("shows both selected baskets immediately without changing dirty state or saving previews", async () => {
    const fixture = setup(); fixture.mount(); const user = userEvent.setup();
    await openEmptyBuilder(user);
    expect(screen.getByRole("heading", { name: /^Ceilings / })).toBeVisible();
    expect(screen.getByRole("heading", { name: /^Wall finishes / })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Gypsum ceiling/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Wall paint/ })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Add items" })).not.toBeInTheDocument();
    expect(screen.getByText("0 selected items")).toBeVisible();
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "paint");
    expect(screen.getByRole("checkbox", { name: /Wall paint/ })).toBeVisible();
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Kitchen/ }));
    await user.click(screen.getByRole("button", { name: "Edit baskets" }));
    await screen.findByRole("heading", { name: "Configure estimate" });
    expect(fixture.saves).toHaveLength(0);
    expect(fixture.requests.every(request => request.method === "GET")).toBe(true);
    expect(fixture.requests.some(request => /component-pricing/.test(request.url))).toBe(false);
  });

  it("retains excluded local edits across rooms and filtering, then saves only the selected row", async () => {
    const fixture = setup(); const view = fixture.mount(); const user = userEvent.setup();
    await openEmptyBuilder(user);
    fireEvent.change(screen.getByRole("spinbutton", { name: /Quantity.*Gypsum ceiling/ }), { target: { value: "7" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Selling rate.*Gypsum ceiling/ }), { target: { value: "123.45" } });
    expect(screen.getByRole("checkbox", { name: /Gypsum ceiling/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save and edit baskets" })).toBeVisible();
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Kitchen/ }));
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Gypsum ceiling/ })).toHaveValue(1);
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living/ }));
    const search = screen.getByRole("searchbox", { name: "Search estimate items" });
    await user.type(search, "paint"); await user.clear(search);
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Gypsum ceiling/ })).toHaveValue(7);
    expect(screen.getByRole("textbox", { name: /Selling rate.*Gypsum ceiling/ })).toHaveValue("123.45");
    await user.click(screen.getByRole("checkbox", { name: /Gypsum ceiling/ }));
    expect(screen.getByRole("checkbox", { name: /Wall paint/ })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: /Gypsum ceiling/ }));
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Gypsum ceiling/ })).toHaveValue(7);
    await user.click(screen.getByRole("checkbox", { name: /Gypsum ceiling/ }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(fixture.saves).toHaveLength(1);
    expect(fixture.saves[0]!.lineItems).toEqual([expect.objectContaining({ roomId: "living", mainLineId: "ceiling", quantity: 7, ratePaise: 12345, included: true, rateSource: "manual" })]);
    view.unmount(); fixture.mount();
    expect(await screen.findByRole("spinbutton", { name: /Quantity.*Gypsum ceiling/ })).toHaveValue(7);
    expect(screen.getByRole("textbox", { name: /Selling rate.*Gypsum ceiling/ })).toHaveValue("123.45");
    expect(screen.getByRole("checkbox", { name: /Wall paint/ })).not.toBeChecked();
  });

  it("protects excluded preview edits from a newer server revision", async () => {
    const fixture = setup(); const view = fixture.mount(); const user = userEvent.setup();
    await openEmptyBuilder(user);
    fireEvent.change(screen.getByRole("spinbutton", { name: /Quantity.*Gypsum ceiling/ }), { target: { value: "7" } });
    fixture.newerSavedRevision();
    await act(async () => { await view.client().refetchQueries({ queryKey: leadKeys.estimate("lead") }); });
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Gypsum ceiling/ })).toHaveValue(7);
    expect(screen.getByRole("checkbox", { name: /Gypsum ceiling/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save and edit baskets" })).toBeVisible();
    expect(fixture.saves).toHaveLength(0);
  });

  it("does not serialize a deliberately edited but excluded new item", async () => {
    const fixture = setup("draft", true); fixture.mount(); const user = userEvent.setup();
    fireEvent.change(await screen.findByRole("spinbutton", { name: /Quantity.*Wall paint/ }), { target: { value: "9" } });
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(fixture.saves[0]!.lineItems).toHaveLength(1);
    expect(fixture.saves[0]!.lineItems[0]).toMatchObject({ mainLineId: "ceiling", quantity: 2, ratePaise: 9900 });
    expect(screen.getByRole("spinbutton", { name: /Quantity.*Wall paint/ })).toHaveValue(9);
  });

  it("keeps Designer on the existing selected-item presentation", async () => {
    authState.role = "designer";
    setup("draft", true).mount();
    expect(await screen.findByRole("checkbox", { name: /Gypsum ceiling/ })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Wall paint/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add items" })).toBeVisible();
  });

  it.each(["pending_designer_approval", "sent_to_client", "client_approved"] as const)("keeps %s Sales estimates limited to saved rows", async status => {
    setup(status, true).mount();
    expect(await screen.findByRole("checkbox", { name: /Gypsum ceiling/ })).toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: /Wall paint/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add items" })).not.toBeInTheDocument();
  });

  it.each([false, true])("respects editClosed=%s on a v3 draft retaining its previous approval", async closed => {
    setup("draft", true, { estimation: {
      workflowVersion: 3, phase: "post", status: "draft", requirementsVersion: 1,
      editClosedAt: closed ? "2026-11-05T06:00:00Z" : null,
      preApproval: null, finalApproval: { reviewRoundId: "approved-round", estimateVersion: 1, approvedAt: "2026-11-04T06:00:00Z",
        requirementsVersion: 1, designReviewRoundId: null, designPlanVersion: null, designScopeRevision: 1 },
      designScopeRevision: 1, approvedDesignScopeRevision: 1, pendingReviewRoundId: null, preparationSnapshotId: null
    } }).mount();
    await screen.findByRole("checkbox", { name: /Gypsum ceiling/ });
    if (closed) {
      expect(screen.getByRole("checkbox", { name: /Gypsum ceiling/ })).toBeDisabled();
      expect(screen.queryByRole("checkbox", { name: /Wall paint/ })).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole("checkbox", { name: /Gypsum ceiling/ })).toBeEnabled();
      expect(screen.getByRole("checkbox", { name: /Wall paint/ })).not.toBeChecked();
    }
  });
});
