import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { focusManager, QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ manageBaseRate: false }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: "procurement" }, authorization: access.manageBaseRate
  ? { permissions: ["procurement.purchase_orders.manage"] } : null }) }));

import { server } from "../../test/server";
import { renderWithQuery } from "../../test/render";
import { ProcurementBasketWorkspace } from "./ProcurementBasketWorkspace";
import { procurementBasketKeys, type BasketEnquiry, type ProcurementBasketDetail, type ProcurementBasketList } from "./procurementBasketApi";
import { purchaseOrderKeys, type PurchaseOrderModeResolution } from "./purchaseOrderApi";
import { syncKnowledgeSectionMutation } from "../ai-estimator-knowledge/knowledgeMutationSync";

const source = { estimateId: "estimate-one", estimateVersion: 2, estimateReviewRoundId: "round-one" };
const digest = "a".repeat(64);
const basketDigest = "b".repeat(64);
const mode = {
  state: "ready", options: [{ key: "pmc", label: "PMC" }], decision: null, issues: [],
  preview: { baseCostPaise: 14_000, adjustedCostPaise: 15_000, sellingPaise: 19_000, lowQuantityImpactPaise: 1_000 },
  revision: { id: "config-revision", version: 2, status: "active", contentDigest: digest },
  uom: { id: "uom-one", code: "sq-ft", decimalScale: 2 }
} as unknown as PurchaseOrderModeResolution;
const basket = { id: "basket-painting", name: "Painting", includedLineCount: 1, readyLineCount: 1,
  classification: "special" as const, automaticSubVendor: false, boqReady: true, standardCost: null,
  approvedEstimatePaise: 30_000, baseCostPaise: 14_000, adjustedCostPaise: 15_000,
  workingTotalPaise: 19_000, workingTotalComplete: true, committedNetPaise: 0, state: "ready" };
const list: ProcurementBasketList = { projectId: "project-one", estimateSource: source, baskets: [basket, {
  ...basket, id: "basket-other", approvedEstimatePaise: 90_000, workingTotalPaise: 70_000
}] };
const detail: ProcurementBasketDetail = { ...basket, projectId: "project-one", estimateSource: source, preparationDigest: basketDigest,
  lines: [{ sourceLineItemKey: "room-one:paint-one", roomId: "room-one", roomName: "Living Room",
    subBasketId: "sub-one", subBasketName: "Interior paint", mainLineId: "main-one", mainLineName: "Primer coat",
    approvedQuantity: "2", approvedUnit: "sq-ft", approvedAmountPaise: 30_000, included: true, source: "configuration", mode, baseUnitRatePaise: 7_000,
    projectRate: { version: 0, overridePaise: null }, standardCost: null }] };
const vendors = [
  { vendorId: "vendor-one", code: "VEN-1", name: "Sharma Interiors", contactEmail: "vendor@example.test", kpiScoreBps: 8600, city: { name: "Bengaluru", key: "bengaluru" }, cityVersion: 1, cityMatch: "same_city", eligible: true, blockers: [] },
  { vendorId: "vendor-two", code: "VEN-2", name: "Decor Masters", contactEmail: "decor@example.test", kpiScoreBps: 7100, city: { name: "Mysuru", key: "mysuru" }, cityVersion: 1, cityMatch: "outside_city", eligible: true, blockers: [] }
];
const draftEnquiry: BasketEnquiry = { id: "enquiry-one", projectId: "project-one", mainBasketId: basket.id,
  version: 1, status: "draft", estimateSource: source, preparationDigest: basketDigest, vendorScopeCurrent: null,
  boqRevisionId: null, boqRevision: null, boqDigest: null, bidCount: 0, awardId: null, invitations: [],
  lines: [{ id: "boq-line-one", sourceLineItemKey: "room-one:paint-one", roomId: "room-one", roomName: "Living Room",
    subBasketId: "sub-one", subBasketName: "Interior paint", mainLineId: "main-one", mainLineName: "Primer coat",
    approvedQuantity: "2", approvedUnit: "sq-ft", uomId: "uom-one", uomCode: "sq-ft", uomDecimalScale: 2,
    description: "Primer coat", quantityMilliUnits: 2000 }] };

function install(initialEnquiry: BasketEnquiry | null = null) {
  let enquiry = initialEnquiry;
  const unavailableVendorIds = new Set<string>();
  const creations: unknown[] = [];
  const updates: unknown[] = [];
  const dispatches: unknown[] = [];
  server.use(
    http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: list })),
    http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: detail })),
    http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries", () => HttpResponse.json({ data: enquiry ? [enquiry] : [] })),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: { projectId: "project-one", estimateSource: source, digest, estimateLines: [], sections: [], approvedEstimatePaise: 30_000, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 30_000, netPaise: null, itemCount: 0, readyItemCount: 0, blockers: [], orderDefaults: { targetDate: "2026-11-30", deliveryLocation: "Site" } } })),
    http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/vendor-candidates", ({ request }) => {
      const params = new URL(request.url).searchParams;
      const city = params.get("city") ?? "all";
      const search = (params.get("q") ?? "").toLowerCase();
      const matched = vendors.filter((vendor) => (city === "all" || vendor.cityMatch === city) &&
        (vendor.name.toLowerCase().includes(search) || vendor.code.toLowerCase().includes(search)));
      const items = matched.filter((vendor) => !unavailableVendorIds.has(vendor.vendorId));
      const offset = Number(params.get("offset") ?? 0);
      return HttpResponse.json({ data: { projectCity: { name: "Bengaluru", key: "bengaluru" }, total: items.length,
        matchingVendorCount: matched.length, blockedReasonCounts: { vendor_inactive: matched.length - items.length },
        limit: 50, offset, items: items.slice(offset, offset + 50) } });
    }),
    http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries", async ({ request }) => {
      creations.push(await request.json());
      enquiry = { id: "enquiry-one", projectId: "project-one", mainBasketId: basket.id, version: 1, status: "draft", estimateSource: source, preparationDigest: basketDigest, vendorScopeCurrent: null, boqRevisionId: null, boqRevision: null, boqDigest: null,
        lines: [{ id: "boq-line-one", sourceLineItemKey: "room-one:paint-one", roomId: "room-one", roomName: "Living Room", subBasketId: "sub-one", subBasketName: "Interior paint", mainLineId: "main-one", mainLineName: "Primer coat", approvedQuantity: "2", approvedUnit: "sq-ft", uomId: "uom-one", uomCode: "sq-ft", uomDecimalScale: 2, description: "Primer coat", quantityMilliUnits: 2000 }], invitations: [], bidCount: 0, awardId: null };
      return HttpResponse.json({ data: enquiry });
    }),
    http.put("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one", async ({ request }) => {
      const body = await request.json() as { expectedPreparationDigest: string; lines: Array<{ sourceLineItemKey: string }> };
      updates.push(body);
      enquiry = { ...enquiry!, version: enquiry!.version + 1, status: "draft", preparationDigest: body.expectedPreparationDigest, vendorScopeCurrent: null,
        boqRevisionId: null, boqRevision: null, boqDigest: null,
        lines: enquiry!.lines.map((line) => { const { scopeType: _scopeType, targetDate: _targetDate, deliveryLocation: _deliveryLocation, ...withoutTerms } = line;
          return withoutTerms; }),
        invitations: [], bidCount: 0 };
      return HttpResponse.json({ data: enquiry });
    }),
    http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/dispatch", async ({ request }) => {
      dispatches.push(await request.json()); enquiry = { ...enquiry!, version: 2, status: "sent", vendorScopeCurrent: true, boqRevisionId: "revision-one", boqRevision: 1, boqDigest: digest,
        invitations: [{ id: "invitation-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", vendorCode: "VEN-1", kind: "initial", status: "sent", sentAt: "2026-10-05T00:00:00Z", expiresAt: "2026-10-12T00:00:00Z", generation: 1 }] };
      return HttpResponse.json({ data: enquiry });
    }),
    http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/comparison", () => HttpResponse.json({ data: { enquiryId: "enquiry-one", boqRevisionId: "revision-one", boqDigest: digest, comparisonDigest: digest, averageBidNetPaise: null, rows: [], recommendedBidId: null, awardId: null, bidHistory: [], bidHistoryHasMore: false, counteroffers: [], counteroffersHasMore: false } }))
  );
  return { creations, updates, dispatches,
    setEnquiry: (next: BasketEnquiry | null) => { enquiry = next; },
    setVendorEligible: (vendorId: string, eligible: boolean) => { if (eligible) unavailableVendorIds.delete(vendorId); else unavailableVendorIds.add(vendorId); }
  };
}

function renderWorkspace(onClient?: (client: QueryClient) => void) {
  function CaptureClient() { const client = useQueryClient(); onClient?.(client); return null; }
  return renderWithQuery(<MemoryRouter initialEntries={["/procurement/projects/project-one"]}><CaptureClient /><ProcurementBasketWorkspace projectId="project-one" projectName="Aurora Villa" projectSourceStale={false} currentEstimate={{ estimateId: "estimate-one", estimateVersion: 2 }} /></MemoryRouter>);
}

function installStandardRate(initialEnquiry: BasketEnquiry | null = null, lineName = "POP false ceiling") {
  install(initialEnquiry);
  let projectRate = { version: 0, overridePaise: null as number | null };
  let configurationBasePaise = 7_500;
  let currentDigest = basketDigest;
  const writes: Array<Record<string, unknown>> = [];
  const basePaise = () => projectRate.overridePaise ?? configurationBasePaise;
  const totalPaise = () => Math.round(basePaise() * 1.1);
  const currentBasket = () => ({ ...basket, classification: "standard" as const, automaticSubVendor: true,
    boqReady: true, standardCost: { totalPaise: totalPaise(), complete: true, provisional: true, pricedLineCount: 1 } });
  const currentDetail = (): ProcurementBasketDetail => ({ ...detail, ...currentBasket(), preparationDigest: currentDigest,
    lines: [{ ...detail.lines[0]!, mainLineName: lineName, approvedQuantity: "1", baseUnitRatePaise: basePaise(),
      projectRate, standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "1",
        baseRates: [{ scope: "sub_vendor", ratePaise: basePaise() }], baseCostPaise: basePaise(),
        adjustedCostPaise: totalPaise(), issues: [] } }] });
  server.use(
    http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: { ...list, baskets: [currentBasket()] } })),
    http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: currentDetail() })),
    http.put("/api/v1/procurement/projects/project-one/baskets/basket-painting/base-rate", async ({ request }) => {
      const input = await request.json() as { baseRatePaise: number | null; expectedVersion: number } & Record<string, unknown>;
      writes.push(input);
      if (input.expectedVersion !== projectRate.version) return HttpResponse.json({ error: { code: "PROJECT_RATE_VERSION_CONFLICT", message: "The base amount changed." } }, { status: 409 });
      projectRate = { version: projectRate.version + 1, overridePaise: input.baseRatePaise };
      currentDigest = String(projectRate.version).repeat(64);
      return HttpResponse.json({ data: { projectId: "project-one", mainBasketId: basket.id, estimateSource: source,
        sourceLineItemKey: detail.lines[0]!.sourceLineItemKey, projectRate } });
    })
  );
  return { writes, setConfigurationRate: (paise: number) => { configurationBasePaise = paise; currentDigest = paise.toString(16).padStart(64, "0"); } };
}

describe("Procurement basket workspace", () => {
  beforeEach(() => { access.manageBaseRate = false; });
  it("shows the current Configuration unit name for an approved line", async () => {
    install();
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: {
      ...detail,
      lines: [{ ...detail.lines[0]!, mode: { ...mode, uom: { ...mode.uom!, name: "Square feet" } } }]
    } })));
    const user = userEvent.setup();
    renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    const table = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    const row = within(table).getByRole("rowheader", { name: /Primer coat/u }).closest("tr")!;
    expect(within(row).getByText("Square feet")).toBeVisible();
    expect(within(row).queryByText("sq-ft")).not.toBeInTheDocument();
  });
  it("shows a newly saved Painting Configuration amount after local save and another session's change on focus", async () => {
    const { setConfigurationRate } = installStandardRate(null, "False Ceiling Painting in Royal Emulsion");
    let client!: QueryClient;
    const user = userEvent.setup();
    renderWorkspace((current) => { client = current; });
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    const table = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    const row = within(table).getByRole("rowheader", { name: "False Ceiling Painting in Royal Emulsion" }).closest("tr")!;
    expect(within(table).getAllByRole("columnheader").map((heading) => heading.textContent)).toEqual(["Item / description", "Qty", "Base amount", "Total"]);
    expect(within(row).getByText("₹75.00")).toBeVisible();
    expect(within(row).getByText("₹82.50")).toBeVisible();

    setConfigurationRate(8_000);
    await act(async () => {
      await syncKnowledgeSectionMutation(client, {
        id: "pricing-section", mainLineId: "main-one", revisionId: "config-revision", sectionKey: "pricing",
        applicability: "configured", version: 3, aggregateVersion: 4, payload: {},
        createdById: "super-admin-one", updatedById: "super-admin-one",
        createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z"
      });
    });
    await waitFor(() => expect(within(row).getByText("₹80.00")).toBeVisible());
    expect(within(row).getByText("₹88.00")).toBeVisible();
    expect(screen.getByText("₹88.00", { selector: ".procurement-basket__scope-total strong" })).toBeVisible();
    expect(screen.queryByText(/revision no longer matches|activation differs/u)).not.toBeInTheDocument();

    setConfigurationRate(9_000);
    try {
      act(() => focusManager.setFocused(false));
      act(() => focusManager.setFocused(true));
      await waitFor(() => expect(within(row).getByText("₹90.00")).toBeVisible());
      expect(within(row).getByText("₹99.00")).toBeVisible();
      expect(screen.getByText("₹99.00", { selector: ".procurement-basket__scope-total strong" })).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Projects" }));
      expect(within(await screen.findByRole("button", { name: /Painting.*approved estimate/i })).getByText("₹99.00")).toBeVisible();
    } finally {
      act(() => focusManager.setFocused(undefined));
    }
  });

  it("reloads an opened Painting basket on return even while its cached amount is fresh", async () => {
    const { setConfigurationRate } = installStandardRate(null, "False Ceiling Painting in Royal Emulsion");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false } } });
    function ProjectReturn() {
      const [open, setOpen] = useState(true);
      return <><button type="button" onClick={() => setOpen((current) => !current)}>{open ? "Leave project" : "Return to project"}</button>
        {open ? <ProcurementBasketWorkspace projectId="project-one" projectName="Aurora Villa" projectSourceStale={false}
          currentEstimate={{ estimateId: "estimate-one", estimateVersion: 2 }} /> : null}</>;
    }
    const user = userEvent.setup();
    try {
      render(<QueryClientProvider client={client}><MemoryRouter><ProjectReturn /></MemoryRouter></QueryClientProvider>);
      await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
      expect(await screen.findByText("₹75.00")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Leave project" }));
      setConfigurationRate(8_500);
      await user.click(screen.getByRole("button", { name: "Return to project" }));
      const table = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
      await waitFor(() => expect(within(table).getByText("₹85.00")).toBeVisible());
      expect(within(table).getByText("₹93.50")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Projects" }));
      expect(within(await screen.findByRole("button", { name: /Painting.*approved estimate/i })).getByText("₹93.50")).toBeVisible();
    } finally {
      client.clear();
    }
  });

  it("shows the server issue and an incomplete total for invalid Painting Configuration", async () => {
    installStandardRate(null, "False Ceiling Painting in Royal Emulsion");
    const issue = { code: "SUB_VENDOR_RATE_MISSING", message: "Sub-vendor Base amount is not configured for this item." };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: { ...list, baskets: [{ ...basket,
        classification: "standard", automaticSubVendor: true, boqReady: false,
        standardCost: { totalPaise: null, complete: false, provisional: false, pricedLineCount: 0 } }] } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: { ...detail,
        classification: "standard", automaticSubVendor: true, boqReady: false,
        standardCost: { totalPaise: null, complete: false, provisional: false, pricedLineCount: 0 },
        lines: [{ ...detail.lines[0]!, mainLineName: "False Ceiling Painting in Royal Emulsion", approvedQuantity: "1",
          baseUnitRatePaise: null, standardCost: { state: "unavailable", mode: "sub_vendor", calculationQuantity: null,
            baseRates: [], baseCostPaise: null, adjustedCostPaise: null, issues: [issue] } }] } }))
    );
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    const table = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    expect(within(table).getByText(issue.message)).toBeVisible();
    expect(within(table).getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText("Incomplete", { selector: ".procurement-basket__scope-total strong" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /mode for False Ceiling Painting/u })).not.toBeInTheDocument();
  });
  it("saves, updates, and clears a project Base amount with server-refreshed totals", async () => {
    access.manageBaseRate = true;
    const { writes } = installStandardRate();
    let client!: QueryClient;
    const user = userEvent.setup();
    renderWorkspace((current) => { client = current; });
    const card = await screen.findByRole("button", { name: /Painting.*approved estimate/i });
    expect(within(card).getByText("₹82.50")).toBeVisible();
    await user.click(card);
    const table = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    expect(within(table).getAllByRole("columnheader").map((heading) => heading.textContent)).toEqual(["Item / description", "Qty", "Base amount", "Total"]);
    const row = within(table).getByRole("rowheader", { name: "POP false ceiling" }).closest("tr")!;
    expect(within(row).getByText("₹75.00")).toBeVisible();
    expect(within(row).getByText("₹82.50")).toBeVisible();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await user.click(within(row).getByRole("button", { name: "Edit base amount for POP false ceiling" }));
    const input = within(row).getByRole("textbox", { name: "Base amount for POP false ceiling (₹/sq-ft)" });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "80.00");
    await user.click(within(row).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(row).getByText("₹80.00")).toBeVisible());
    expect(within(row).getByText("₹88.00")).toBeVisible();
    expect(screen.getByText("₹88.00", { selector: ".procurement-basket__scope-total strong" })).toBeVisible();
    expect(writes[0]).toMatchObject({ sourceLineItemKey: "room-one:paint-one", baseRatePaise: 8_000,
      expectedVersion: 0, expectedEstimateSource: source, expectedPreparationDigest: basketDigest });
    expect(writes[0]).toHaveProperty("idempotencyKey");
    expect(writes[0]).not.toHaveProperty("adjustedCostPaise");
    for (const queryKey of [procurementBasketKeys.list("project-one"), procurementBasketKeys.detail("project-one", basket.id),
      procurementBasketKeys.enquiries("project-one", basket.id), purchaseOrderKeys.preparation("project-one")]) {
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey }));
    }
    await waitFor(() => expect(within(row).getByRole("button", { name: "Edit base amount for POP false ceiling" })).toHaveFocus());
    await user.click(within(row).getByRole("button", { name: "Edit base amount for POP false ceiling" }));
    expect(within(row).getByRole("button", { name: "Use Configuration price for POP false ceiling" })).toBeVisible();
    await user.clear(within(row).getByRole("textbox", { name: /Base amount for POP false ceiling/u }));
    await user.type(within(row).getByRole("textbox", { name: /Base amount for POP false ceiling/u }), "85");
    await user.click(within(row).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(row).getByText("₹85.00")).toBeVisible());
    expect(writes[1]).toMatchObject({ baseRatePaise: 8_500, expectedVersion: 1 });
    await user.click(within(row).getByRole("button", { name: "Edit base amount for POP false ceiling" }));
    await user.click(within(row).getByRole("button", { name: "Use Configuration price for POP false ceiling" }));
    await waitFor(() => expect(within(row).getByText("₹75.00")).toBeVisible());
    expect(within(row).getByText("₹82.50")).toBeVisible();
    expect(writes[2]).toMatchObject({ baseRatePaise: null, expectedVersion: 2 });
    await user.click(screen.getByRole("button", { name: "Projects" }));
    expect(within(await screen.findByRole("button", { name: /Painting.*approved estimate/i })).getByText("₹82.50")).toBeVisible();
  });

  it("validates nonnegative paise precision and permits a zero project amount", async () => {
    access.manageBaseRate = true;
    const { writes } = installStandardRate();
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    const table = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    await user.click(within(table).getByRole("button", { name: "Edit base amount for POP false ceiling" }));
    const input = within(table).getByRole("textbox", { name: /Base amount for POP false ceiling/u });
    for (const amount of ["-1", "1.234", "90000000000.01", ""]) {
      await user.clear(input);
      if (amount) await user.type(input, amount);
      await user.click(within(table).getByRole("button", { name: "Save" }));
      expect(within(table).getByRole("alert")).toHaveTextContent("Enter a nonnegative amount");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(writes).toHaveLength(0);
    }
    await user.type(input, "0");
    await user.click(within(table).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(table).getAllByText("₹0.00")).toHaveLength(2));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ baseRatePaise: 0, expectedVersion: 0 });
  });

  it("keeps the saved amount on a conflict and restores focus on Cancel", async () => {
    access.manageBaseRate = true;
    installStandardRate();
    server.use(http.put("/api/v1/procurement/projects/project-one/baskets/basket-painting/base-rate", () =>
      HttpResponse.json({ error: { code: "PROJECT_RATE_VERSION_CONFLICT", message: "The project rate changed. Refresh the basket." } }, { status: 409 })));
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    const table = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    await user.click(within(table).getByRole("button", { name: "Edit base amount for POP false ceiling" }));
    const input = within(table).getByRole("textbox", { name: /Base amount for POP false ceiling/u });
    await user.clear(input);
    await user.type(input, "80");
    await user.click(within(table).getByRole("button", { name: "Save" }));
    expect(await within(table).findByRole("alert")).toHaveTextContent("The project rate changed. Refresh the basket.");
    expect(within(table).getByText("₹82.50")).toBeVisible();
    await user.click(within(table).getByRole("button", { name: "Cancel" }));
    expect(within(table).getByText("₹75.00")).toBeVisible();
    expect(within(table).getByRole("button", { name: "Edit base amount for POP false ceiling" })).toHaveFocus();
  });

  it("hides project price editing without permission or after award approval starts", async () => {
    access.manageBaseRate = false;
    installStandardRate();
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    expect(await screen.findByRole("table", { name: "Included approved source lines for Painting" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit base amount for POP false ceiling" })).not.toBeInTheDocument();
  });

  it("locks project price editing while an award is pending", async () => {
    access.manageBaseRate = true;
    installStandardRate({ ...draftEnquiry, status: "award_pending" });
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    expect(await screen.findByRole("table", { name: "Included approved source lines for Painting" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit base amount for POP false ceiling" })).not.toBeInTheDocument();
  });

  it("keeps project price editing available for a sent BOQ revision", async () => {
    access.manageBaseRate = true;
    installStandardRate({ ...draftEnquiry, status: "sent", boqRevisionId: "revision-one", boqRevision: 1, boqDigest: digest });
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    expect(await screen.findByText("Revise sent BOQ", { selector: "summary" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Edit base amount for POP false ceiling" })).toBeEnabled();
  });

  it("keeps frozen bid responses visible but read-only after a base rate save", async () => {
    access.manageBaseRate = true;
    const sent: BasketEnquiry = { ...draftEnquiry, version: 3, status: "sent", vendorScopeCurrent: true, boqRevisionId: "revision-one",
      boqRevision: 1, boqDigest: digest, bidCount: 1,
      invitations: [{ id: "invitation-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", vendorCode: "VEN-1",
        kind: "initial", status: "failed", sentAt: "2026-10-05T00:00:00Z", expiresAt: "2026-10-12T00:00:00Z", generation: 1 }] };
    installStandardRate(sent);
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/comparison", () =>
      HttpResponse.json({ data: { enquiryId: "enquiry-one", boqRevisionId: "revision-one", boqDigest: digest,
        comparisonDigest: digest, averageBidNetPaise: 10_000, recommendedBidId: "bid-one", awardId: null,
        rows: [{ bidId: "bid-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", officialKpiScoreBps: 8600,
          quoteNetPaise: 10_000, quoteGstPaise: 1_800, quoteGrossPaise: 11_800, priceScoreBps: 10_000,
          comparisonScoreBps: 9_300, eligible: true, blockers: [], recommended: true, priorityRank: 1, bidRevision: 1, lines: [] }],
        bidHistory: [], bidHistoryHasMore: false, counteroffers: [], counteroffersHasMore: false } })));
    let client!: QueryClient;
    const user = userEvent.setup(); renderWorkspace((current) => { client = current; });
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    await user.click(await screen.findByText("Invitation status and WhatsApp", { selector: "summary" }));
    expect(await screen.findByRole("button", { name: "Resend invitation to Sharma Interiors" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Counteroffer" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Award$/u })).toBeVisible();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await user.click(await screen.findByRole("button", { name: "Edit base amount for POP false ceiling" }));
    const input = screen.getByRole("textbox", { name: /Base amount for POP false ceiling/u });
    await user.clear(input);
    await user.type(input, "80");
    await user.click(screen.getByRole("button", { name: /^Save$/u }));
    await user.click(await screen.findByText("Revise sent BOQ", { selector: "summary" }));
    expect(await screen.findByText(/Internal basket pricing changed. Existing vendor links remain valid/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Resend invitation to Sharma Interiors" })).toBeEnabled();
    expect(await screen.findByRole("heading", { name: "Compare bids" })).toBeVisible();
    expect(screen.getByText(/These responses belong to the previous frozen BOQ/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Counteroffer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Award$/u })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Sharma Interiors/u })).toBeEnabled();
    expect(screen.getByText("Average bid price (before GST)").parentElement).toHaveTextContent("₹100.00");
    expect(screen.queryByText("Prior BOQ revisions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bids" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Comparison" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Bids" }));
    expect(screen.getByRole("heading", { name: "Invitation delivery" }).closest(".procurement-basket__stage-content")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Comparison" }));
    expect(screen.getByRole("heading", { name: "Compare bids" }).closest(".procurement-basket__stage-content")).toHaveFocus();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["procurement", "basket-comparison", "project-one", basket.id], refetchType: "none" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["procurement", "basket-award", "project-one", basket.id], refetchType: "none" });
    expect(screen.getByRole("button", { name: "Start BOQ revision" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Start BOQ revision" }));
    expect(screen.getByRole("button", { name: "Cancel revision" })).toBeVisible();
  });

  it("does not let an older issued estimate lock the current approved source", async () => {
    access.manageBaseRate = true;
    installStandardRate();
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries", () =>
      HttpResponse.json({ data: [draftEnquiry, { ...draftEnquiry, id: "old-issued", status: "issued",
        estimateSource: { ...source, estimateVersion: 1 } }] })));
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    expect(await screen.findByRole("button", { name: "Edit base amount for POP false ceiling" })).toBeEnabled();
  });
  it("shows an automatic Standard Sub-vendor cost in the card and scope without a mode action", async () => {
    install();
    let modeWrites = 0;
    const standardBasket = { ...basket, classification: "standard" as const, automaticSubVendor: true, boqReady: true,
      standardCost: { totalPaise: 15_000, complete: true, provisional: true, pricedLineCount: 1 },
      readyLineCount: 0, workingTotalPaise: 0, workingTotalComplete: false, state: "partial" };
    const suggestedMode = { ...mode, state: "selection_required", decision: null, preview: null,
      options: [{ key: "sub_vendor", label: "Sub-vendor" }],
      availability: [{ key: "sub_vendor", label: "Sub-vendor", available: true, issues: [] }] } as PurchaseOrderModeResolution;
    const standardDetail: ProcurementBasketDetail = { ...detail, ...standardBasket,
      lines: [{ ...detail.lines[0]!, mode: suggestedMode,
        standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "2",
          baseRates: [{ scope: "sub_vendor", ratePaise: 7_000 }], baseCostPaise: 14_000,
          adjustedCostPaise: 15_000, issues: [] } }] };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: { ...list, baskets: [standardBasket] } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: standardDetail })),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-decisions", () => { modeWrites += 1; return HttpResponse.json({ data: {} }); })
    );
    const user = userEvent.setup();
    const view = renderWorkspace();
    const card = await screen.findByRole("button", { name: /Painting.*approved estimate/i });
    expect(within(card).getByText("Total")).toBeVisible();
    expect(within(card).getByText("₹150.00")).toBeVisible();
    expect(within(card).queryByText("partial")).not.toBeInTheDocument();
    await user.click(card);
    const scope = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    expect(within(scope).getAllByRole("columnheader").map((heading) => heading.textContent)).toEqual(["Item / description", "Qty", "Base amount", "Total"]);
    expect(within(scope).getByText("₹70.00")).toBeVisible();
    expect(within(scope).getByText("₹150.00")).toBeVisible();
    expect(screen.queryByText("Low quantity impact")).not.toBeInTheDocument();
    expect(screen.queryByText("₹140.00")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /(?:Confirm|Review|Choose) mode for Primer coat/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Sub-vendor" })).not.toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: /Sharma Interiors/u })).toBeEnabled();
    expect(modeWrites).toBe(0);
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("uses Sub-vendor and approved quantity for explicit Standard even when a PMC decision exists", async () => {
    install();
    const savedBasket = { ...basket, classification: "standard" as const, automaticSubVendor: true, boqReady: true,
      standardCost: { totalPaise: 15_000, complete: true, provisional: true, pricedLineCount: 1 } };
    const savedMode = { ...mode, decision: { id: "decision-one", version: 4,
      sourceLineItemKey: "room-one:paint-one", mode: "pmc", quantity: "3", discountBps: 0,
      markupBasis: "starting", exceptionReason: null, revisionId: "config-revision", revisionDigest: digest,
      updatedAt: "2026-10-05T00:00:00Z" } } as PurchaseOrderModeResolution;
    const savedDetail: ProcurementBasketDetail = { ...detail, ...savedBasket,
      lines: [{ ...detail.lines[0]!, mode: savedMode, baseUnitRatePaise: 7_000,
        standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "2",
          baseRates: [{ scope: "sub_vendor", ratePaise: 7_000 }], baseCostPaise: 14_000,
          adjustedCostPaise: 15_000, issues: [] } }] };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: { ...list, baskets: [savedBasket] } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: savedDetail }))
    );
    const user = userEvent.setup(); renderWorkspace();
    const card = await screen.findByRole("button", { name: /Painting.*approved estimate/i });
    expect(within(card).getByText("₹150.00")).toBeVisible();
    await user.click(card);
    const scope = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    const lineRow = within(scope).getByRole("rowheader", { name: /Primer coat/u }).closest("tr")!;
    expect(within(lineRow).getByText("2")).toBeVisible();
    expect(within(lineRow).getByText("₹70.00")).toBeVisible();
    expect(within(lineRow).getByText("₹150.00")).toBeVisible();
    expect(screen.queryByRole("button", { name: /mode for Primer coat/u })).not.toBeInTheDocument();
    expect(screen.queryByText("Low quantity impact")).not.toBeInTheDocument();
  });

  it("shows a Standard pricing blocker without a fabricated complete cost", async () => {
    const { creations, dispatches } = install();
    const blockedBasket = { ...basket, classification: "standard" as const, automaticSubVendor: true, boqReady: false,
      standardCost: { totalPaise: null, complete: false, provisional: false, pricedLineCount: 0 },
      readyLineCount: 0, workingTotalComplete: false };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: { ...list, baskets: [blockedBasket] } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: {
        ...detail, ...blockedBasket, lines: [{ ...detail.lines[0]!, baseUnitRatePaise: null, mode: { ...mode, state: "unavailable", preview: null,
          revision: { ...mode.revision!, status: "draft" },
          issues: [{ code: "MISSING_SCOPE", message: "Pinned Sub-vendor scope is missing." }] },
          standardCost: { state: "unavailable", mode: null, calculationQuantity: null, baseRates: [],
            baseCostPaise: null, adjustedCostPaise: null, issues: [{ code: "MISSING_SCOPE", message: "Pinned Sub-vendor scope is missing." }] } }]
      } }))
    );
    const user = userEvent.setup(); renderWorkspace();
    const card = await screen.findByRole("button", { name: /Painting.*approved estimate/i });
    expect(within(card).getByText("Incomplete")).toBeVisible();
    await user.click(card);
    const scope = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    expect(within(scope).getAllByText("Unavailable")).toHaveLength(2);
    expect(within(scope).getByText("Pinned Sub-vendor scope is missing.")).toBeVisible();
    expect(screen.getAllByText("Pinned Sub-vendor scope is missing.")).toHaveLength(1);
    expect(screen.getAllByText("Incomplete")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /mode for Primer coat/u })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("checkbox", { name: /Sharma Interiors/u }));
    await user.click(screen.getByRole("checkbox", { name: /Decor Masters/u }));
    const send = screen.getByRole("button", { name: "Send bid invitations" });
    expect(screen.getByText("2 vendors selected")).toBeVisible();
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription("Primer coat: Pinned Sub-vendor scope is missing.");
    expect(creations).toHaveLength(0);
    expect(dispatches).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Bill of quantities" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Scope/u })).not.toBeInTheDocument();
  });

  it("lets Procurement shortlist vendors while a priced draft Configuration waits for activation", async () => {
    const { creations, dispatches } = install();
    const draftBasket = { ...basket, classification: "standard" as const, automaticSubVendor: true, boqReady: false,
      standardCost: { totalPaise: 15_000, complete: true, provisional: true, pricedLineCount: 1 },
      readyLineCount: 0, workingTotalComplete: false };
    const draftDetail: ProcurementBasketDetail = { ...detail, ...draftBasket,
      lines: [{ ...detail.lines[0]!, mode: { ...mode, state: "unavailable", preview: null,
        revision: { ...mode.revision!, status: "draft" } },
        standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "2",
          baseRates: [{ scope: "sub_vendor", ratePaise: 7_000 }], baseCostPaise: 14_000,
          adjustedCostPaise: 15_000, issues: [] } }] };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: { ...list, baskets: [draftBasket] } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: draftDetail }))
    );
    const user = userEvent.setup(); const view = renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    const search = await screen.findByRole("searchbox", { name: "Search vendors" });
    expect(search).toBeEnabled();
    await user.type(search, "Sharma");
    await user.click(await screen.findByRole("checkbox", { name: /Sharma Interiors/u }));
    await user.clear(search);
    await user.type(search, "Decor");
    await user.click(await screen.findByRole("checkbox", { name: /Decor Masters/u }));
    expect(screen.getByText("2 vendors selected")).toBeVisible();
    const send = screen.getByRole("button", { name: "Send bid invitations" });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription("Primer coat: The current saved Configuration revision needs Super Admin activation before bid invitations can be sent.");
    expect(creations).toHaveLength(0);
    expect(dispatches).toHaveLength(0);
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("lets an observed saved Standard price proceed to BOQ without a mode review", async () => {
    const { creations, dispatches } = install();
    const mismatch = { code: "PINNED_DIGEST_MISMATCH", message: "The saved Configuration content does not match its activated digest." };
    const observedDigest = "c".repeat(64);
    const observedBasket = { ...basket, classification: "standard" as const, automaticSubVendor: true, boqReady: true,
      standardCost: { totalPaise: 15_000, complete: true, provisional: true, pricedLineCount: 1 },
      readyLineCount: 0, workingTotalPaise: 0, workingTotalComplete: false, state: "partial" };
    const observedMode = { ...mode, state: "unavailable", decision: null, preview: null,
      options: [{ key: "sub_vendor", label: "Sub-vendor" }], issues: [mismatch],
      integrity: { status: "mismatch", activatedDigest: digest, observedDigest,
        candidateAvailability: [{ key: "sub_vendor", label: "Sub-vendor", available: true, issues: [] }] } } as PurchaseOrderModeResolution;
    const observedDetail: ProcurementBasketDetail = { ...detail, ...observedBasket,
      lines: [{ ...detail.lines[0]!, mode: observedMode,
        standardCost: { state: "observed_unverified", mode: "sub_vendor", calculationQuantity: "2",
          baseRates: [{ scope: "sub_vendor", ratePaise: 7_000 }], baseCostPaise: 14_000,
          adjustedCostPaise: 15_000, issues: [mismatch] } }] };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: { ...list, baskets: [observedBasket] } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: observedDetail }))
    );
    const user = userEvent.setup();
    const view = renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    const scope = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    const row = within(scope).getByRole("rowheader", { name: /Primer coat/u }).closest("tr")!;
    expect(within(row).getByText("₹70.00")).toBeVisible();
    expect(within(row).getByText("₹150.00")).toBeVisible();
    expect(screen.queryByText(/Using saved Configuration amount/u)).not.toBeInTheDocument();
    expect(screen.queryByText(mismatch.message)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /(?:Review|Confirm|Choose) mode for Primer coat/u })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("checkbox", { name: /Sharma Interiors/u }));
    await user.click(screen.getByRole("button", { name: "Send bid invitations" }));
    await waitFor(() => expect(creations).toHaveLength(1));
    expect(screen.queryByRole("heading", { name: "Complete BOQ details" })).not.toBeInTheDocument();
    expect(JSON.stringify(creations[0])).not.toMatch(/baseCostPaise|adjustedCostPaise|standardCost|workingTotalPaise/u);
    await waitFor(() => expect(dispatches).toHaveLength(1));
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("keeps historical unclassified Standard on the manual mode workflow", async () => {
    install();
    const historicalBasket = { ...basket, classification: "standard" as const, automaticSubVendor: false, boqReady: false,
      standardCost: { totalPaise: 15_000, complete: true, provisional: true, pricedLineCount: 1 },
      readyLineCount: 0, workingTotalComplete: false };
    const historicalDetail: ProcurementBasketDetail = { ...detail, ...historicalBasket,
      lines: [{ ...detail.lines[0]!, mode: { ...mode, state: "selection_required", preview: null },
        standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "2",
          baseRates: [{ scope: "sub_vendor", ratePaise: 7_000 }], baseCostPaise: 14_000,
          adjustedCostPaise: 15_000, issues: [] } }] };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: { ...list, baskets: [historicalBasket] } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: historicalDetail }))
    );
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    expect(screen.getByRole("button", { name: "Confirm mode for Primer coat" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Send bid invitations" })).toBeDisabled();
    expect(screen.getByText("Primer coat: Confirm this line’s saved mode before sending bid invitations.")).toBeVisible();
  });

  it("keeps Special mode editing and respects backend BOQ readiness", async () => {
    install();
    const blockedSpecial = { ...basket, boqReady: false };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: { ...list, baskets: [blockedSpecial] } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: { ...detail, ...blockedSpecial } }))
    );
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    expect(screen.getByRole("button", { name: "Choose mode for Primer coat" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "Send bid invitations" })).toBeDisabled();
    expect(screen.getByText("Primer coat: Review the current saved mode before sending bid invitations.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Bill of quantities" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Scope/u })).not.toBeInTheDocument();
  });

  it("names an unready second manual line while keeping vendors selectable and legacy invitation actions blocked", async () => {
    const issue = "Save the current Configuration mode for this line.";
    const blockedBasket = { ...basket, includedLineCount: 2, readyLineCount: 1, boqReady: false };
    const secondLine = { ...detail.lines[0]!, sourceLineItemKey: "room-one:cove-one", mainLineId: "main-two",
      mainLineName: "Cove in Gypsum", approvedAmountPaise: 6_500,
      mode: { ...mode, state: "selection_required" as const, preview: null,
        issues: [{ code: "MODE_NOT_SAVED", message: issue }] } };
    const sent: BasketEnquiry = { ...draftEnquiry, status: "sent", version: 3, boqRevisionId: "revision-one",
      boqRevision: 1, boqDigest: digest, vendorScopeCurrent: true, bidCount: 1,
      lines: [...draftEnquiry.lines, { ...draftEnquiry.lines[0]!, id: "boq-line-two",
        sourceLineItemKey: secondLine.sourceLineItemKey, mainLineId: secondLine.mainLineId,
        mainLineName: secondLine.mainLineName, description: "Cove in Gypsum" }],
      invitations: [
        { id: "invitation-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", vendorCode: "VEN-1",
          kind: "initial", status: "failed", sentAt: null, expiresAt: "2026-10-12T00:00:00Z", generation: 1 },
        { id: "invitation-two", vendorId: "vendor-two", vendorName: "Decor Masters", vendorCode: "VEN-2",
          kind: "initial", status: "consumed", sentAt: "2026-10-05T00:00:00Z", expiresAt: "2026-10-12T00:00:00Z", generation: 1 }
      ] };
    install(sent);
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets", () => HttpResponse.json({ data: {
        ...list, baskets: [blockedBasket]
      } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: {
        ...detail, ...blockedBasket, lines: [detail.lines[0], secondLine]
      } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/comparison", () =>
        HttpResponse.json({ data: { enquiryId: sent.id, boqRevisionId: "revision-one", boqDigest: digest,
          comparisonDigest: digest, averageBidNetPaise: 5_000, recommendedBidId: "bid-two", awardId: null,
          rows: [{ bidId: "bid-two", vendorId: "vendor-two", vendorName: "Decor Masters",
            officialKpiScoreBps: 7100, quoteNetPaise: 5_000, quoteGstPaise: 0, quoteGrossPaise: 5_000,
            priceScoreBps: 10_000, comparisonScoreBps: 8_500, eligible: true, blockers: [],
            recommended: true, priorityRank: 1, bidRevision: 1, lines: [] }],
          bidHistory: [], bidHistoryHasMore: false, counteroffers: [], counteroffersHasMore: false } }))
    );
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Painting.*approved estimate/i }));
    const first = await screen.findByRole("checkbox", { name: /Sharma Interiors/u });
    const second = await screen.findByRole("checkbox", { name: /Decor Masters/u });
    expect(first).toBeEnabled(); expect(second).toBeEnabled();
    await user.click(first); await user.click(second);
    const reason = `Cove in Gypsum: ${issue}`;
    const send = screen.getByRole("button", { name: "Send selected requests" });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription(reason);
    await user.click(screen.getByText("Invitation status and WhatsApp", { selector: "summary" }));
    const resend = screen.getByRole("button", { name: "Resend invitation to Sharma Interiors" });
    expect(resend).toBeDisabled(); expect(resend).toHaveAccessibleDescription(reason);
    expect(await screen.findByRole("heading", { name: "Compare bids" })).toBeVisible();
    const counteroffer = screen.getByRole("button", { name: "Counteroffer" });
    expect(counteroffer).toBeDisabled();
    expect(counteroffer).toHaveAccessibleDescription(`Updated bid requests are paused: ${reason}`);
    expect(screen.getByRole("button", { name: "Award" })).toBeEnabled();
  });

  it("omits zero-value source lines that the basket total excludes", async () => {
    install();
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: {
      ...detail, includedLineCount: 0, readyLineCount: 0, baseCostPaise: 0, adjustedCostPaise: 0,
      workingTotalPaise: 0, workingTotalComplete: true,
      lines: [{ ...detail.lines[0]!, approvedAmountPaise: 0 }]
    } })));
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    expect(await screen.findByText("No priced approved source lines are available in this basket.")).toBeVisible();
    expect(screen.queryByRole("table", { name: "Included approved source lines for Painting" })).not.toBeInTheDocument();
    expect(screen.getByText("₹0.00")).toBeVisible();
  });

  it("keeps same-named baskets separate by ID and drills into one approved source", async () => {
    install(); const user = userEvent.setup(); const view = renderWorkspace();
    const paintingCards = await screen.findAllByRole("button", { name: /Painting.*approved estimate/i });
    expect(paintingCards).toHaveLength(2);
    await user.click(paintingCards[0]!);
    expect(await screen.findByRole("heading", { name: "Painting" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Procurement breadcrumb" })).toHaveTextContent(/Aurora Villa.*Painting/u);
    const scope = screen.getByRole("table", { name: "Included approved source lines for Painting" });
    const line = within(scope).getByRole("rowheader", { name: /Primer coat/u }).closest("tr");
    expect(line).not.toBeNull();
    expect(within(line!).getByText(/₹70/u)).toBeVisible();
    expect(within(line!).getByText(/₹150/u)).toBeVisible();
    expect(screen.queryByText(/₹190/u)).not.toBeInTheDocument();
    const enquiryStage = screen.getByRole("button", { name: "Enquiry" });
    expect(enquiryStage).toHaveAttribute("aria-current", "step");
    enquiryStage.focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toHaveClass("procurement-basket__stage-content");
    expect(enquiryStage).toHaveAttribute("aria-current", "step");
    const report = await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } });
    expect(report.violations).toEqual([]);
  });

  it("shows an incomplete total without inventing a line amount", async () => {
    install();
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: {
      ...detail, readyLineCount: 0, workingTotalPaise: 0, workingTotalComplete: false,
      lines: [{ ...detail.lines[0]!, mode: null, baseUnitRatePaise: null }]
    } })));
    const user = userEvent.setup();
    renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    const scope = await screen.findByRole("table", { name: "Included approved source lines for Painting" });
    expect(within(scope).getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getAllByText("Incomplete").length).toBeGreaterThan(0);
  });

  it("sends every included approved line on one click without requesting BOQ details", async () => {
    const { creations, dispatches } = install(); const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    expect(await screen.findByRole("navigation", { name: "Vendor enquiry progress" })).toBeVisible();
    expect(await screen.findByRole("searchbox", { name: "Search vendors" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Bill of quantities" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "City" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("checkbox", { name: /Sharma Interiors/u }));
    await user.click(screen.getByRole("button", { name: "Send bid invitations" }));
    await waitFor(() => expect(creations).toHaveLength(1));
    expect(screen.queryByRole("heading", { name: "Complete BOQ details" })).not.toBeInTheDocument();
    expect(creations[0]).toMatchObject({ expectedPreparationDigest: basketDigest, lines: [{ sourceLineItemKey: "room-one:paint-one" }] });
    expect((creations[0] as { lines: unknown[] }).lines[0]).toEqual({ sourceLineItemKey: "room-one:paint-one" });
    expect(JSON.stringify(creations[0])).not.toMatch(/baseCostPaise|workingTotalPaise|sellingPaise/u);
    await waitFor(() => expect(dispatches).toHaveLength(1));
    expect(dispatches[0]).toMatchObject({ expectedPreparationDigest: basketDigest, vendorIds: ["vendor-one"] });
  });

  it("refreshes a saved draft when the approved line amount changes before sending", async () => {
    const currentDigest = "c".repeat(64);
    const { updates, dispatches } = install(draftEnquiry);
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({
      data: { ...detail, preparationDigest: currentDigest,
        lines: [{ ...detail.lines[0]!, approvedAmountPaise: 42_000 }] }
    })));
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    await user.click(await screen.findByRole("checkbox", { name: /Sharma Interiors/u }));
    await user.click(screen.getByRole("button", { name: "Send bid invitations" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toMatchObject({ expectedPreparationDigest: currentDigest });
    await waitFor(() => expect(dispatches).toHaveLength(1));
    expect(dispatches[0]).toMatchObject({ expectedPreparationDigest: currentDigest, vendorIds: ["vendor-one"] });
  });

  it("keeps vendor selections across searches in the visible enquiry panel", async () => {
    const { dispatches } = install(draftEnquiry);
    const user = userEvent.setup(); const view = renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    const vendorPanel = await screen.findByRole("region", { name: "Choose vendors" });
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.type(screen.getByRole("searchbox", { name: "Search vendors" }), "Sharma");
    await user.click(await screen.findByRole("checkbox", { name: /Sharma Interiors/u }));
    expect(screen.queryByRole("checkbox", { name: /Decor Masters/u })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Search vendors" }));
    await user.type(screen.getByRole("searchbox", { name: "Search vendors" }), "Decor");
    await user.click(await screen.findByRole("checkbox", { name: /Decor Masters/u }));
    expect(vendorPanel).toHaveTextContent("2 vendors selected");
    expect(screen.getByText("Selected: Sharma Interiors, Decor Masters")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send bid invitations" }));
    await waitFor(() => expect(dispatches).toHaveLength(1));
    expect(dispatches[0]).toMatchObject({ vendorIds: ["vendor-one", "vendor-two"] });
  });

  it("keeps both prior bidders selectable on a two-line sent BOQ and requests updated bids without revising it", async () => {
    const secondLine = { ...detail.lines[0]!, sourceLineItemKey: "room-one:cove-one", mainLineId: "main-two",
      mainLineName: "Cove in Gypsum", approvedQuantity: "1", approvedUnit: "Rft", approvedAmountPaise: 6_500 };
    const sent: BasketEnquiry = { ...draftEnquiry, version: 3, status: "sent", boqRevisionId: "revision-one",
      boqRevision: 1, boqDigest: digest, vendorScopeCurrent: true, bidCount: 2,
      lines: [...draftEnquiry.lines, { ...draftEnquiry.lines[0]!, id: "boq-line-two",
        sourceLineItemKey: secondLine.sourceLineItemKey, mainLineId: secondLine.mainLineId,
        mainLineName: secondLine.mainLineName, description: "Cove in Gypsum", approvedUnit: "Rft", uomCode: "Rft" }],
      invitations: vendors.map((vendor, index) => ({ id: `invitation-${index}`, vendorId: vendor.vendorId,
        vendorName: vendor.name, vendorCode: vendor.code, kind: "initial" as const, status: "consumed",
        sentAt: "2026-10-05T00:00:00Z", expiresAt: "2026-10-12T00:00:00Z", generation: 1 })) };
    const { updates, dispatches, setEnquiry } = install(sent);
    const previews: unknown[] = [];
    const batches: unknown[] = [];
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: {
        ...detail, name: "POP / Gypsum", lines: [detail.lines[0], secondLine], includedLineCount: 2, readyLineCount: 2
      } })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/invitation-batches/preview", async ({ request }) => {
        const body = await request.json() as { selection: { vendorIds: string[] } };
        previews.push(body);
        const ids = body.selection.vendorIds;
        return HttpResponse.json({ data: { enquiryId: sent.id, enquiryVersion: sent.version,
          boqRevisionId: sent.boqRevisionId, boqDigest: sent.boqDigest, selectedCount: ids.length,
          requiresReason: true, actions: ids.map((vendorId) => ({ vendorId,
            vendorName: vendors.find((vendor) => vendor.vendorId === vendorId)!.name,
            action: "updated_bid_request", invitationStatus: "consumed", priorBidId: `bid-${vendorId}` })) } });
      }),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/invitation-batches", async ({ request }) => {
        const body = await request.json() as { selection: { vendorIds: string[] } };
        batches.push(body);
        const updated = { ...sent, version: 4 };
        setEnquiry(updated);
        return HttpResponse.json({ data: { enquiry: updated, selectedCount: body.selection.vendorIds.length,
          results: body.selection.vendorIds.map((vendorId) => ({ vendorId, action: "updated_bid_request",
            status: "sent", invitationId: `updated-${vendorId}` })) } });
      })
    );
    const user = userEvent.setup(); const view = renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    expect(await screen.findByText("Cove in Gypsum")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Comparison" })).toHaveAttribute("aria-current", "step");
    const first = await screen.findByRole("checkbox", { name: /Sharma Interiors/u });
    const second = await screen.findByRole("checkbox", { name: /Decor Masters/u });
    expect(first).toBeEnabled(); expect(second).toBeEnabled();
    expect(screen.getAllByText("Bid received")).toHaveLength(2);
    await user.click(first); await user.click(second);
    expect(await screen.findByRole("region", { name: "Planned invitation actions" })).toHaveTextContent("2 vendors");
    expect(screen.getByRole("button", { name: "Send selected requests" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Reason for requesting updated bids" }), "Please quote the revised timing.");
    expect(screen.getByRole("button", { name: "Send selected requests" })).toBeEnabled();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Send selected requests" }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]).toMatchObject({ expectedVersion: 3, boqRevisionId: "revision-one", boqDigest: digest,
      selection: { kind: "vendors", vendorIds: ["vendor-one", "vendor-two"] },
      counterofferReason: "Please quote the revised timing." });
    expect(previews.length).toBeGreaterThan(0);
    expect(updates).toHaveLength(0); expect(dispatches).toHaveLength(0);
    expect(await screen.findByRole("status", { name: "Invitation results" })).toHaveTextContent("Email sent");
  });

  it("selects the whole Main Basket beyond one page and keeps exclusions across search before draft dispatch", async () => {
    const { dispatches } = install(draftEnquiry);
    const manyVendors = Array.from({ length: 52 }, (_, index) => ({ ...vendors[0]!, vendorId: `vendor-${index + 1}`,
      code: `VEN-${index + 1}`, name: `Vendor ${index + 1}` }));
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/vendor-candidates", ({ request }) => {
      const params = new URL(request.url).searchParams;
      const matched = manyVendors.filter((vendor) => vendor.name.toLowerCase().includes((params.get("q") ?? "").toLowerCase()));
      const offset = Number(params.get("offset") ?? 0);
      return HttpResponse.json({ data: { projectCity: null, items: matched.slice(offset, offset + 50), total: matched.length,
        matchingVendorCount: matched.length, blockedReasonCounts: {}, limit: 50, offset } });
    }));
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    await user.click(await screen.findByRole("button", { name: "Select all eligible (52)" }));
    expect(screen.getByText("52 vendors selected")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    const vendor51 = await screen.findByRole("checkbox", { name: /Vendor 51/u });
    expect(vendor51).toBeChecked();
    await user.click(vendor51);
    expect(screen.getByText("51 vendors selected")).toBeVisible();
    await user.type(screen.getByRole("searchbox", { name: "Search vendors" }), "Vendor 1");
    expect(await screen.findByRole("checkbox", { name: /^Vendor 1 VEN-1/u })).toBeChecked();
    expect(screen.getByText("51 vendors selected")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send bid invitations" }));
    await waitFor(() => expect(dispatches).toHaveLength(1));
    expect(dispatches[0]).toMatchObject({ selection: { kind: "all_eligible", excludedVendorIds: ["vendor-51"] } });
  });

  it("allows selection and same-revision invitations after internal-only pricing drift", async () => {
    const sent: BasketEnquiry = { ...draftEnquiry, status: "sent", version: 3, boqRevisionId: "revision-one",
      boqRevision: 1, boqDigest: digest, vendorScopeCurrent: true, bidCount: 0,
      invitations: [{ id: "invitation-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", vendorCode: "VEN-1",
        kind: "initial", status: "sent", sentAt: "2026-10-05T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", generation: 1 }] };
    install(sent);
    const changedDigest = "c".repeat(64);
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting", () => HttpResponse.json({ data: {
        ...detail, preparationDigest: changedDigest
      } })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/invitation-batches/preview", () =>
        HttpResponse.json({ data: { enquiryId: sent.id, enquiryVersion: sent.version, boqRevisionId: sent.boqRevisionId,
          boqDigest: sent.boqDigest, selectedCount: 1, requiresReason: false,
          actions: [{ vendorId: "vendor-two", vendorName: "Decor Masters", action: "first_invitation",
            invitationStatus: null, priorBidId: null }] } }))
    );
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    const newVendor = await screen.findByRole("checkbox", { name: /Decor Masters/u });
    expect(newVendor).toBeEnabled();
    await user.click(newVendor);
    expect(await screen.findByRole("region", { name: "Planned invitation actions" })).toHaveTextContent("First invitation");
    expect(screen.getByRole("button", { name: "Send selected requests" })).toBeEnabled();
    expect(screen.queryByText(/Load the current BOQ before sending invitations/u)).not.toBeInTheDocument();
  });

  it("shows authoritative mixed actions and per-vendor delivery outcomes for basket-wide selection", async () => {
    const mixedVendors = [...vendors, { ...vendors[0]!, vendorId: "vendor-three", code: "VEN-3", name: "Third Vendor" },
      { ...vendors[0]!, vendorId: "vendor-four", code: "VEN-4", name: "Fourth Vendor" }];
    const sent: BasketEnquiry = { ...draftEnquiry, status: "sent", version: 3, boqRevisionId: "revision-one",
      boqRevision: 1, boqDigest: digest, vendorScopeCurrent: true, bidCount: 1,
      invitations: [
        { id: "invitation-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", vendorCode: "VEN-1",
          kind: "initial", status: "consumed", sentAt: "2026-10-05T00:00:00Z", expiresAt: "2026-10-12T00:00:00Z", generation: 1 },
        { id: "invitation-two", vendorId: "vendor-two", vendorName: "Decor Masters", vendorCode: "VEN-2",
          kind: "initial", status: "sent", sentAt: "2026-10-05T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", generation: 1 },
        { id: "invitation-three", vendorId: "vendor-three", vendorName: "Third Vendor", vendorCode: "VEN-3",
          kind: "initial", status: "failed", sentAt: null, expiresAt: "2026-10-12T00:00:00Z", generation: 1 }
      ] };
    const { setEnquiry } = install(sent);
    const actions = [
      { vendorId: "vendor-one", vendorName: "Sharma Interiors", action: "updated_bid_request", invitationStatus: "consumed", priorBidId: "bid-one" },
      { vendorId: "vendor-two", vendorName: "Decor Masters", action: "already_invited", invitationStatus: "sent", priorBidId: null },
      { vendorId: "vendor-three", vendorName: "Third Vendor", action: "retry", invitationStatus: "failed", priorBidId: null },
      { vendorId: "vendor-four", vendorName: "Fourth Vendor", action: "first_invitation", invitationStatus: null, priorBidId: null }
    ];
    const batches: unknown[] = [];
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/vendor-candidates", ({ request }) => {
        const query = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
        const items = mixedVendors.filter((vendor) => vendor.name.toLowerCase().includes(query));
        return HttpResponse.json({ data: { projectCity: null, items, total: items.length,
          matchingVendorCount: items.length, blockedReasonCounts: {}, limit: 50, offset: 0 } });
      }),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/invitation-batches/preview", () =>
        HttpResponse.json({ data: { enquiryId: sent.id, enquiryVersion: 3, boqRevisionId: "revision-one",
          boqDigest: digest, selectedCount: 4, requiresReason: true, actions } })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/invitation-batches", async ({ request }) => {
        batches.push(await request.json()); const updated = { ...sent, version: 4 }; setEnquiry(updated);
        return HttpResponse.json({ data: { enquiry: updated, selectedCount: 4,
          results: actions.map((item) => ({ vendorId: item.vendorId, action: item.action,
            status: item.action === "retry" ? "failed" : item.action === "already_invited" ? "already_invited" :
              item.action === "first_invitation" ? "pending" : "sent", invitationId: null })) } });
      })
    );
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    await user.click(await screen.findByRole("button", { name: "Select all eligible (4)" }));
    const plan = await screen.findByRole("region", { name: "Planned invitation actions" });
    await waitFor(() => expect(plan).toHaveTextContent("Already invited — no new message"));
    expect(plan).toHaveTextContent("Retry delivery");
    expect(plan).toHaveTextContent("First invitation");
    expect(plan).toHaveTextContent("Request updated bid");
    await user.type(screen.getByRole("textbox", { name: "Reason for requesting updated bids" }), "Please provide an updated quote.");
    await user.click(screen.getByRole("button", { name: "Send selected requests" }));
    await waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]).toMatchObject({ selection: { kind: "all_eligible" }, counterofferReason: "Please provide an updated quote." });
    const results = await screen.findByRole("status", { name: "Invitation results" });
    expect(results).toHaveTextContent("Delivery failed; retry is available");
    expect(results).toHaveTextContent("No new message");
    expect(results).toHaveTextContent("Delivery pending");
    expect(results).toHaveTextContent("Email sent");
  });

  it("pauses a stale BOQ send until the current revision is loaded", async () => {
    const { dispatches, setEnquiry } = install(draftEnquiry);
    let client!: QueryClient;
    const user = userEvent.setup(); renderWorkspace((value) => { client = value; });
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    await user.click(await screen.findByRole("checkbox", { name: /Sharma Interiors/u }));
    setEnquiry({ ...draftEnquiry, version: 2, lines: [{ ...draftEnquiry.lines[0]!, deliveryLocation: "Remote site" }] });
    await act(async () => { await client.invalidateQueries({ queryKey: procurementBasketKeys.enquiries("project-one", basket.id) }); });
    expect(await screen.findByText(/The BOQ changed while you were editing/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Send bid invitations" })).toBeDisabled();
    expect(dispatches).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Load current BOQ" }));
    expect(screen.getByRole("button", { name: "Send bid invitations" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Send bid invitations" }));
    await waitFor(() => expect(dispatches).toHaveLength(1));
    expect(dispatches[0]).toMatchObject({ expectedVersion: 3 });
  });

  it("removes a selected vendor when refreshed eligibility is revoked", async () => {
    const { dispatches, setVendorEligible } = install(draftEnquiry);
    let client!: QueryClient;
    const user = userEvent.setup(); renderWorkspace((value) => { client = value; });
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    await user.click(await screen.findByRole("checkbox", { name: /Sharma Interiors/u }));
    await user.click(screen.getByRole("checkbox", { name: /Decor Masters/u }));
    setVendorEligible("vendor-one", false);
    await act(async () => { await client.invalidateQueries({ queryKey: ["procurement", "basket-vendors", "project-one", basket.id] }); });
    expect(await screen.findByText(/A selected vendor is no longer eligible and was removed/u)).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /Sharma Interiors/u })).not.toBeInTheDocument();
    expect(screen.getByText("Selected: Decor Masters")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send bid invitations" }));
    await waitFor(() => expect(dispatches).toHaveLength(1));
    expect(dispatches[0]).toMatchObject({ vendorIds: ["vendor-two"] });
  });

  it("recovers from a vendor directory error and explains an empty result", async () => {
    install(draftEnquiry);
    let fail = true;
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/vendor-candidates", () => fail ?
      HttpResponse.json({ error: { code: "DIRECTORY_UNAVAILABLE", message: "Directory temporarily unavailable" } }, { status: 503 }) :
      HttpResponse.json({ data: { projectCity: { name: "Bengaluru", key: "bengaluru" }, total: 0,
        matchingVendorCount: 1, blockedReasonCounts: { contact_missing: 1 }, limit: 50, offset: 0, items: [] } })));
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send bid invitations" })).toBeDisabled();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No active vendors are ready for this main basket.")).toBeVisible();
    expect(screen.getByText("Missing contact email: 1")).toBeVisible();
    expect(screen.getByRole("link", { name: "Manage vendors" })).toBeVisible();
  });

  it("retries a failed vendor link without changing the frozen BOQ revision", async () => {
    const failedEnquiry: BasketEnquiry = { id: "enquiry-one", projectId: "project-one", mainBasketId: basket.id,
      version: 3, status: "sent", estimateSource: source, preparationDigest: basketDigest, vendorScopeCurrent: true, boqRevisionId: "revision-one",
      boqRevision: 1, boqDigest: digest, lines: [], bidCount: 0, awardId: null,
      invitations: [{ id: "invitation-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", vendorCode: "VEN-1",
        kind: "initial", status: "failed", sentAt: null, expiresAt: "2026-10-12T00:00:00Z", generation: 1 }] };
    install(failedEnquiry);
    const retries: unknown[] = [];
    server.use(http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/resend-invitation", async ({ request }) => {
      retries.push(await request.json());
      return HttpResponse.json({ data: { ...failedEnquiry, version: 4,
        invitations: [{ ...failedEnquiry.invitations[0], id: "invitation-two", kind: "resend", status: "sent", generation: 2 }] } });
    }));
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    expect(await screen.findByRole("button", { name: "Bids" })).toHaveAttribute("aria-current", "step");
    await user.click(await screen.findByText("Invitation status and WhatsApp", { selector: "summary" }));
    await user.click(await screen.findByRole("button", { name: "Resend invitation to Sharma Interiors" }));
    await waitFor(() => expect(retries).toHaveLength(1));
    expect(retries[0]).toMatchObject({ expectedVersion: 3, vendorId: "vendor-one" });
    expect(JSON.stringify(retries[0])).not.toMatch(/boqRevisionId|lines|unitPricePaise/u);
  });

  it("prepares each delivered vendor's WhatsApp invitation without claiming it was sent", async () => {
    const sent: BasketEnquiry = { ...draftEnquiry, status: "sent", version: 3, boqRevisionId: "revision-one",
      boqRevision: 1, boqDigest: digest, vendorScopeCurrent: true,
      invitations: vendors.map((vendor, index) => ({ id: `invitation-${index}`, vendorId: vendor.vendorId,
        vendorName: vendor.name, vendorCode: vendor.code, kind: "initial" as const, status: "sent",
        sentAt: "2026-10-05T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", generation: 1 })) };
    const { setEnquiry } = install(sent);
    let client!: QueryClient;
    const shared: string[] = [];
    server.use(http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/invitations/:vendorId/whatsapp-share-intent", ({ params }) => {
      shared.push(String(params.vendorId));
      return HttpResponse.json({ data: params.vendorId === "vendor-one"
        ? { available: true, shareUrl: "https://wa.me/919999999999?text=BOQ", blocker: null, expiresAt: "2099-01-01T00:00:00Z" }
        : { available: false, shareUrl: null, blocker: "No usable phone number", expiresAt: null } });
    }));
    const user = userEvent.setup(); renderWorkspace((current) => { client = current; });
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    expect(screen.queryByRole("link", { name: /Open WhatsApp message/u })).not.toBeInTheDocument();
    await user.click(await screen.findByText("Invitation status and WhatsApp", { selector: "summary" }));
    await user.click(screen.getByRole("button", { name: "Prepare WhatsApp for Sharma Interiors" }));
    const ready = await screen.findByRole("link", { name: "Open WhatsApp message for Sharma Interiors" });
    expect(ready).toHaveAttribute("href", "https://wa.me/919999999999?text=BOQ");
    expect(ready).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("WhatsApp: Ready to send")).toBeVisible();
    expect(screen.queryByText("WhatsApp: Sent")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Prepare WhatsApp for Decor Masters" }));
    expect(await screen.findByText("WhatsApp: Unavailable · No usable phone number")).toBeVisible();
    expect(shared).toEqual(["vendor-one", "vendor-two"]);
    setEnquiry({ ...sent, version: 4, invitations: sent.invitations.map((invitation) => invitation.vendorId === "vendor-one"
      ? { ...invitation, id: "new-invitation-one", generation: 2 } : invitation) });
    await act(async () => { await client.invalidateQueries({ queryKey: procurementBasketKeys.enquiries("project-one", basket.id) }); });
    await waitFor(() => expect(screen.queryByRole("link", { name: "Open WhatsApp message for Sharma Interiors" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Prepare WhatsApp for Sharma Interiors" })).toBeVisible();
  });

  it("removes an expired WhatsApp link from an open enquiry and prepares a new one", async () => {
    const sent: BasketEnquiry = { ...draftEnquiry, status: "sent", version: 3, boqRevisionId: "revision-one",
      boqRevision: 1, boqDigest: digest, vendorScopeCurrent: true,
      invitations: [{ id: "invitation-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", vendorCode: "VEN-1",
        kind: "initial", status: "sent", sentAt: "2026-10-05T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", generation: 1 }] };
    install(sent);
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    let preparations = 0;
    server.use(http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/invitations/vendor-one/whatsapp-share-intent", () => {
      preparations += 1;
      return HttpResponse.json({ data: { available: true, shareUrl: `https://wa.me/919999999999?text=BOQ${preparations}`,
        blocker: null, expiresAt: new Date(now + 60_000).toISOString() } });
    }));
    try {
      const user = userEvent.setup(); renderWorkspace();
      await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
      await user.click(await screen.findByText("Invitation status and WhatsApp", { selector: "summary" }));
      await user.click(screen.getByRole("button", { name: "Prepare WhatsApp for Sharma Interiors" }));
      expect(await screen.findByRole("link", { name: "Open WhatsApp message for Sharma Interiors" })).toHaveAttribute("href", "https://wa.me/919999999999?text=BOQ1");
      now += 60_001;
      act(() => { document.dispatchEvent(new Event("visibilitychange")); });
      await waitFor(() => expect(screen.queryByRole("link", { name: "Open WhatsApp message for Sharma Interiors" })).not.toBeInTheDocument());
      expect(screen.getByText("WhatsApp: Link expired")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Prepare new WhatsApp link for Sharma Interiors" }));
      expect(await screen.findByRole("link", { name: "Open WhatsApp message for Sharma Interiors" })).toHaveAttribute("href", "https://wa.me/919999999999?text=BOQ2");
      expect(preparations).toBe(2);
    } finally { clock.mockRestore(); }
  });

  it("keeps an all-failed BOQ draft retryable without dispatching a second revision", async () => {
    const failedDraft: BasketEnquiry = { ...draftEnquiry, version: 3, status: "draft", vendorScopeCurrent: true,
      boqRevisionId: "revision-one", boqRevision: 1, boqDigest: digest,
      invitations: [{ id: "invitation-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", vendorCode: "VEN-1",
        kind: "initial", status: "failed", sentAt: null, expiresAt: "2026-10-12T00:00:00Z", generation: 1 }] };
    const { setEnquiry, dispatches } = install(failedDraft);
    const retries: unknown[] = [];
    server.use(http.post("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries/enquiry-one/resend-invitation", async ({ request }) => {
      retries.push(await request.json());
      const sent = { ...failedDraft, version: 4, status: "sent" as const,
        invitations: [{ ...failedDraft.invitations[0]!, id: "invitation-two", kind: "resend" as const, status: "sent", generation: 2 }] };
      setEnquiry(sent);
      return HttpResponse.json({ data: sent });
    }));
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    expect(await screen.findByText("Revise saved BOQ", { selector: "summary" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send bid invitations" })).toBeDisabled();
    await user.click(screen.getByText("Invitation status and WhatsApp", { selector: "summary" }));
    await user.click(screen.getByRole("button", { name: "Resend invitation to Sharma Interiors" }));
    await waitFor(() => expect(retries).toHaveLength(1));
    expect(retries[0]).toMatchObject({ expectedVersion: 3, vendorId: "vendor-one" });
    expect(dispatches).toHaveLength(0);
    expect(await screen.findByText("Revise sent BOQ", { selector: "summary" })).toBeVisible();
  });

  it("keeps sent BOQ revision behind a secondary disclosure and resends with a new revision", async () => {
    const sentEnquiry: BasketEnquiry = { id: "enquiry-one", projectId: "project-one", mainBasketId: basket.id,
      version: 3, status: "sent", estimateSource: source, preparationDigest: basketDigest, vendorScopeCurrent: true, boqRevisionId: "revision-one",
      boqRevision: 1, boqDigest: digest, bidCount: 1, awardId: null,
      lines: [{ id: "boq-line-one", sourceLineItemKey: "room-one:paint-one", roomId: "room-one", roomName: "Living Room", subBasketId: "sub-one", subBasketName: "Interior paint", mainLineId: "main-one", mainLineName: "Primer coat", approvedQuantity: "2", approvedUnit: "sq-ft", uomId: "uom-one", uomCode: "sq-ft", uomDecimalScale: 2, description: "Primer coat", quantityMilliUnits: 2000, scopeType: "execution", targetDate: "2026-11-30", deliveryLocation: "Site" }],
      invitations: [{ id: "invitation-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", vendorCode: "VEN-1", kind: "initial", status: "sent", sentAt: "2026-10-05T00:00:00Z", expiresAt: "2026-10-12T00:00:00Z", generation: 1 }] };
    const { updates, dispatches } = install(sentEnquiry);
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    expect(await screen.findByRole("button", { name: "Comparison" })).toHaveAttribute("aria-current", "step");
    expect(await screen.findByText("Revise sent BOQ", { selector: "summary" })).toBeVisible();
    expect(screen.queryByLabelText("Delivery location")).not.toBeInTheDocument();
    await user.click(screen.getByText("Revise sent BOQ", { selector: "summary" }));
    expect(screen.getByText(/supersedes current vendor links and bids/u)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Start BOQ revision" }));
    await user.click(await screen.findByRole("checkbox", { name: /Decor Masters/u }));
    await user.click(screen.getByRole("button", { name: "Send bid invitations" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toMatchObject({ expectedVersion: 3, expectedPreparationDigest: basketDigest,
      lines: [{ sourceLineItemKey: "room-one:paint-one" }] });
    await waitFor(() => expect(dispatches).toHaveLength(1));
    expect(dispatches[0]).toMatchObject({ vendorIds: ["vendor-two"] });
  });

  it("shows the issued stage only for an issued enquiry", async () => {
    const issued: BasketEnquiry = { id: "enquiry-issued", projectId: "project-one", mainBasketId: basket.id,
      version: 5, status: "issued", estimateSource: source, preparationDigest: basketDigest, vendorScopeCurrent: true,
      boqRevisionId: "boq-issued", boqRevision: 1, boqDigest: digest, bidCount: 1,
      awardId: "award-issued", lines: [], invitations: [] };
    install(issued);
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/awards/award-issued/monitor", () => HttpResponse.json({ data: {
      award: { id: "award-issued", status: "issued", vendorId: "vendor-one" },
      order: { id: "order-issued", orderNumber: "WO-ISSUED", status: "approved", revision: 1,
        terms: "Complete painting scope.", vendor: { name: "Sharma Interiors" }, lines: [],
        totals: { netPaise: 40_000, gstPaise: 0, totalPaise: 40_000 } },
      boqLines: [], site: { status: "awaiting_vendor", progressPercent: null, tasks: [] },
      finance: { assessmentStatus: "pending", invoiceTotalPaise: null, tdsPaise: null, netPayablePaise: null,
        recordedCostPaise: null, paidPaise: null, gstRegistration: { registered: null, gstin: null }, paymentSchedule: [] },
      vendorAlerts: []
    } })));
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    const awardedStage = await screen.findByRole("button", { name: "Awarded" });
    expect(awardedStage).toHaveAttribute("aria-current", "step");
    expect(await screen.findByRole("heading", { name: "Sharma Interiors · WO-ISSUED" })).toBeVisible();
  });

  it("opens an earlier issued package for read-only monitoring and PDF access", async () => {
    install();
    const current: BasketEnquiry = { id: "enquiry-current", projectId: "project-one", mainBasketId: basket.id, vendorScopeCurrent: true,
      version: 1, status: "draft", estimateSource: source, preparationDigest: basketDigest,
      boqRevisionId: null, boqRevision: null, boqDigest: null, lines: [], invitations: [], bidCount: 0, awardId: null };
    const earlier: BasketEnquiry = { ...current, id: "older-issued", version: 5, status: "issued",
      boqRevisionId: "boq-old", boqRevision: 1, boqDigest: digest, awardId: "award-old" };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/enquiries", () => HttpResponse.json({ data: [current, earlier] })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-painting/awards/award-old/monitor", () => HttpResponse.json({ data: {
        award: { id: "award-old", status: "issued", vendorId: "vendor-one" },
        order: { id: "order-old", orderNumber: "WO-OLD", status: "approved", revision: 1, terms: "Complete prior painting scope.",
          vendor: { name: "Sharma Interiors" }, lines: [], totals: { netPaise: 40000, gstPaise: 0, totalPaise: 40000 } },
        boqLines: [], site: { status: "awaiting_vendor", progressPercent: null, tasks: [] },
        finance: { assessmentStatus: "pending", invoiceTotalPaise: null, tdsPaise: null, netPayablePaise: null,
          recordedCostPaise: null, paidPaise: null, gstRegistration: { registered: null, gstin: null }, paymentSchedule: [] },
        vendorAlerts: [] } }))
    );
    const user = userEvent.setup(); renderWorkspace();
    await user.click((await screen.findAllByRole("button", { name: /Painting.*approved estimate/i }))[0]!);
    await user.click(await screen.findByText("Earlier enquiries (1)"));
    await user.click(screen.getByText(/Enquiry older-is/u));
    expect(await screen.findByRole("heading", { name: "Sharma Interiors · WO-OLD" })).toBeVisible();
    expect(screen.queryByText("Prior BOQ revisions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download work order PDF" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Prepare WhatsApp work order" })).not.toBeInTheDocument();
  });
});
