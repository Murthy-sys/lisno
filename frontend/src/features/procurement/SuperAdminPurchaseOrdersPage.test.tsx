import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { SuperAdminPurchaseOrdersPage } from "./SuperAdminPurchaseOrdersPage";
import type { PurchaseOrder, PurchaseOrderRequestModeSnapshot } from "./purchaseOrderApi";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ authorization: { role: "super_admin", permissions: ["procurement.purchase_orders.approve"] } })
}));

const order: PurchaseOrder = {
  id: "order-one", orderNumber: "PO-ONE", projectId: "project-one", vendor: { id: "vendor-one", code: "VEN-1", name: "Oak Works" },
  status: "pending_approval", version: 4, revision: 1, estimateSource: { estimateId: "estimate-one", estimateVersion: 2, estimateReviewRoundId: "review-one" },
  terms: "Install at site", draftLines: [], draftTotals: { netPaise: 600000, gstPaise: 108000, totalPaise: 708000 },
  submittedRevisionId: "revision-one", approvedRevisionId: null, approvedNetPaise: null, approvedGstPaise: null, approvedTotalPaise: null,
  decisions: [], revisions: [{ id: "revision-one", revision: 1, submittedAt: "2026-10-01T00:00:00.000Z", submittedById: "procurement-one", terms: "Install at site", totals: { netPaise: 600000, gstPaise: 108000, totalPaise: 708000 }, lines: [{ id: "line-one", procurementItemId: "item-one", procurementItemVersion: 1, quantityMilliUnits: 1000, unitPricePaise: 600000, gstBasisPoints: 1800, scopeType: "supply", description: "Kitchen cabinetry", targetDate: "2026-11-01", deliveryLocation: "Site", netPaise: 600000, gstPaise: 108000, totalPaise: 708000, itemName: "Kitchen cabinetry", roomName: "Kitchen", uomCode: "unit" }] }],
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z"
};

const projectRequest = {
  id: "request-project-one", projectId: "project-one", projectName: "Aurora Villa", status: "pending_approval",
  version: 4, revision: 2, submittedRevisionId: "request-revision-two", preparationDigest: "a".repeat(64),
  estimateSource: { estimateId: "estimate-one", estimateVersion: 2, estimateReviewRoundId: "review-one" },
  approvedEstimatePaise: 900000, committedPaise: 400000, committedGstPaise: 0, committedTotalPaise: 400000, remainingPaise: 500000,
  totals: { netPaise: 600000, gstPaise: 108000, totalPaise: 708000 },
  sectionTotals: [
    { sectionId: "KIT", label: "Kitchen", totals: { netPaise: 400000, gstPaise: 72000, totalPaise: 472000 } },
    { sectionId: "LIV", label: "Living", totals: { netPaise: 200000, gstPaise: 36000, totalPaise: 236000 } }
  ],
  vendorTotals: [
    { vendorId: "vendor-one", code: "VEN-1", name: "Oak Works", terms: "Install at site", totals: { netPaise: 400000, gstPaise: 72000, totalPaise: 472000 } },
    { vendorId: "vendor-two", code: "VEN-2", name: "Bright Works", terms: "Deliver at site", totals: { netPaise: 200000, gstPaise: 36000, totalPaise: 236000 } }
  ],
  approvedOrderIds: [], decisions: [], revisions: [{
    id: "request-revision-two", revision: 2, submittedAt: "2026-10-01T00:00:00.000Z", submittedById: "buyer-one",
    preparationDigest: "a".repeat(64), approvedEstimatePaise: 900000, committedPaise: 400000, committedGstPaise: 0,
    committedTotalPaise: 400000, remainingPaise: 500000, modeSnapshotStatus: "historical_unavailable", modeSnapshots: [],
    totals: { netPaise: 600000, gstPaise: 108000, totalPaise: 708000 },
    sectionTotals: [
      { sectionId: "KIT", label: "Kitchen", totals: { netPaise: 400000, gstPaise: 72000, totalPaise: 472000 } },
      { sectionId: "LIV", label: "Living", totals: { netPaise: 200000, gstPaise: 36000, totalPaise: 236000 } }
    ],
    vendorTotals: [
      { vendorId: "vendor-one", code: "VEN-1", name: "Oak Works", terms: "Install at site", totals: { netPaise: 400000, gstPaise: 72000, totalPaise: 472000 } },
      { vendorId: "vendor-two", code: "VEN-2", name: "Bright Works", terms: "Deliver at site", totals: { netPaise: 200000, gstPaise: 36000, totalPaise: 236000 } }
    ],
    lines: [
      { id: "line-one", procurementItemId: "item-one", procurementItemVersion: 3, quantityMilliUnits: 2000, unitPricePaise: 200000,
        gstBasisPoints: 1800, scopeType: "execution", description: "Kitchen cabinetry", targetDate: "2026-11-01",
        deliveryLocation: "Aurora Villa", netPaise: 400000, gstPaise: 72000, totalPaise: 472000,
        vendorId: "vendor-one", vendorCode: "VEN-1", vendorName: "Oak Works", allocatedWorkPaise: 500000,
        sectionLabel: "Kitchen", sourceSectionId: "KIT", sourceLineItemKey: "estimate-line-one", roomName: "Kitchen",
        itemName: "Kitchen cabinetry", brand: "Oak", uomCode: "sq ft" },
      { id: "line-two", procurementItemId: "item-two", procurementItemVersion: 1, quantityMilliUnits: 1000, unitPricePaise: 200000,
        gstBasisPoints: 1800, scopeType: "supply", description: "Pendant lighting", targetDate: "2026-11-05",
        deliveryLocation: "Aurora Villa", netPaise: 200000, gstPaise: 36000, totalPaise: 236000,
        vendorId: "vendor-two", vendorCode: "VEN-2", vendorName: "Bright Works", allocatedWorkPaise: 250000,
        sectionLabel: "Living", sourceSectionId: "LIV", sourceLineItemKey: "estimate-line-two", roomName: "Living",
        itemName: "Pendant lighting", brand: "Clear", uomCode: "unit" }
    ]
  }],
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z"
};

const modeSnapshot: PurchaseOrderRequestModeSnapshot = {
  sourceLineItemKey: "estimate-line-one", source: "configuration",
  roomId: "room-kitchen", roomName: "Kitchen", mainBasketId: "basket-cabinetry", mainBasketName: "Cabinetry",
  subBasketId: "sub-cabinets", subBasketName: "Base cabinets", mainLineId: "main-cabinet", mainLineName: "Kitchen cabinetry",
  approvedQuantity: "2", approvedUnit: "sq ft", approvedAmountPaise: 500000, referenceAsOf: "2026-10-01T00:00:00.000Z",
  mode: {
    state: "ready", options: [{ key: "pmc", label: "PMC" }],
    decision: { id: "decision-one", version: 3, sourceLineItemKey: "estimate-line-one", mode: "pmc", quantity: "2",
      discountBps: 0, markupBasis: "starting", exceptionReason: null, revisionId: "configuration-revision-one",
      revisionDigest: "b".repeat(64), updatedAt: "2026-09-30T00:00:00.000Z" },
    preview: { formulaVersion: "v1", mode: "pmc", quantity: "2", quantityScale: 0, baseCostPaise: 240000,
      adjustedCostPaise: 250000, lowQuantityImpactPaise: 10000, sellingPaise: 320000, finalVendorChargesPaise: null, floorSellingPaise: 280000,
      marginBps: 2800, appliedImpactBps: 400, discountBps: 0, discountAmountPaise: 0,
      quantityRule: null, procurementQuantitySuggestion: "2", components: [],
      settings: { scopes: [{ scope: "pmc", source: "scoped", baseRatePaise: 120000, lowQuantityLimit: "3",
        impactBps: 400, minimumMarkupBps: 1200, startingMarkupBps: 2800 }], configuredMarginBps: 2800, markupBasis: "starting" } },
    issues: [], revision: { id: "configuration-revision-one", version: 4, status: "active", contentDigest: "b".repeat(64) },
    uom: { id: "uom-sqft", code: "sq ft", decimalScale: 0 }, priceReferences: {
      "item-one": { state: "ready", priceVersionId: "price-one", priceVersionNumber: 2, taxVersionId: "tax-one",
        taxVersionNumber: 1, unitPricePaise: 300000, gstBasisPoints: 1800, treatment: "exclusive",
        effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, issues: [] },
      "item-three": { state: "ready", priceVersionId: "price-three", priceVersionNumber: 1, taxVersionId: "tax-one",
        taxVersionNumber: 1, unitPricePaise: 100000, gstBasisPoints: 1800, treatment: "exclusive",
        effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, issues: [] }
    }
  },
  actualChildren: [
    { procurementItemId: "item-one", vendorId: "vendor-one", quantityMilliUnits: 1000, unitPricePaise: 300000,
      gstBasisPoints: 1800, allocatedWorkPaise: 400000, netPaise: 300000, gstPaise: 54000, totalPaise: 354000,
      commercialExceptionReason: null },
    { procurementItemId: "item-three", vendorId: "vendor-one", quantityMilliUnits: 1000, unitPricePaise: 100000,
      gstBasisPoints: 1800, allocatedWorkPaise: 100000, netPaise: 100000, gstPaise: 18000, totalPaise: 118000,
      commercialExceptionReason: null }
  ],
  actualTotals: { netPaise: 400000, gstPaise: 72000, totalPaise: 472000 }, actualNetMinusConfiguredCostPaise: 150000
};

const capturedRequest = { ...projectRequest, revisions: projectRequest.revisions.map((revision) => ({
  ...revision, modeSnapshotStatus: "captured", modeSnapshots: [modeSnapshot],
  lines: [{ ...revision.lines[0], quantityMilliUnits: 1000, unitPricePaise: 300000, netPaise: 300000,
    gstPaise: 54000, totalPaise: 354000, allocatedWorkPaise: 400000 },
    { ...revision.lines[0], id: "line-three", procurementItemId: "item-three", itemName: "Cabinet fitting",
      quantityMilliUnits: 1000, unitPricePaise: 100000, netPaise: 100000, gstPaise: 18000, totalPaise: 118000,
      allocatedWorkPaise: 100000 }, revision.lines[1]]
})) };

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "key-12345678" });
  server.use(
    http.get("/api/v1/admin/purchase-order-requests/pending", () => HttpResponse.json({ data: { items: [], total: 0, limit: 50, offset: 0 } })),
    http.get("/api/v1/admin/purchase-orders/pending", () => HttpResponse.json({ data: { items: [order], total: 1, limit: 50, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-commitments", () => HttpResponse.json({ data: { approvedEstimatePaise: 900000, committedPaise: 500000, committedGstPaise: 0, committedTotalPaise: 500000, remainingPaise: 400000 } }))
  );
});

describe("Super Admin purchase order approval", () => {
  it("preserves a negative frozen Sub-Vendor balance as signed internal evidence", async () => {
    const subVendorSnapshot: PurchaseOrderRequestModeSnapshot = { ...modeSnapshot, mode: { ...modeSnapshot.mode,
      options: [{ key: "sub_vendor", label: "Sub-Vendor" }],
      decision: { ...modeSnapshot.mode.decision!, mode: "sub_vendor" },
      preview: { ...modeSnapshot.mode.preview!, mode: "sub_vendor", finalVendorChargesPaise: -6123 } } };
    const request = { ...capturedRequest, revisions: capturedRequest.revisions.map((revision) => ({
      ...revision, modeSnapshots: [subVendorSnapshot]
    })) };
    server.use(http.get("/api/v1/admin/purchase-order-requests/pending", () => HttpResponse.json({ data: {
      items: [request], total: 1, limit: 50, offset: 0
    } })));
    const user = userEvent.setup();
    renderWithQuery(<SuperAdminPurchaseOrdersPage />);
    await user.click(await screen.findByRole("button", { name: /Aurora Villa/ }));
    const review = screen.getByRole("form", { name: "Review Aurora Villa purchase order request" });
    const reconciliation = within(review).getByRole("article", { name: "Kitchen cabinetry mode and vendor reconciliation" });
    expect(within(reconciliation).getByText("Configured Sub-Vendor balance (signed)").parentElement).toHaveTextContent("-₹61.23");
    expect(within(reconciliation).getByText("Actual vendor net").parentElement).toHaveTextContent("₹4,000.00");
  });

  it("shows one frozen configured benchmark beside the total of two actual vendor children", async () => {
    server.use(http.get("/api/v1/admin/purchase-order-requests/pending", () => HttpResponse.json({ data: {
      items: [capturedRequest], total: 1, limit: 50, offset: 0
    } })));
    const user = userEvent.setup();
    renderWithQuery(<SuperAdminPurchaseOrdersPage />);
    await user.click(await screen.findByRole("button", { name: /Aurora Villa/ }));
    const review = screen.getByRole("form", { name: "Review Aurora Villa purchase order request" });
    const reconciliation = within(review).getByRole("article", { name: "Kitchen cabinetry mode and vendor reconciliation" });
    expect(within(reconciliation).getByText("Configured cost benchmark").parentElement).toHaveTextContent("₹2,500.00");
    expect(within(reconciliation).getAllByText("₹2,500.00")).toHaveLength(1);
    expect(within(reconciliation).getByText("Approved customer estimate").parentElement).toHaveTextContent("₹5,000.00");
    expect(within(reconciliation).getByText("Actual vendor net").parentElement).toHaveTextContent("₹4,000.00");
    expect(within(reconciliation).getByText("Actual GST").parentElement).toHaveTextContent("₹720.00");
    expect(within(reconciliation).getByText("Actual vendor gross").parentElement).toHaveTextContent("₹4,720.00");
    expect(within(reconciliation).getByText("Vendor net − configured cost").parentElement).toHaveTextContent("₹1,500.00");
    await user.click(within(reconciliation).getByText("Calculation, source and vendor line evidence"));
    expect(within(reconciliation).getByRole("heading", { name: "Saved mode settings" })).toBeVisible();
    expect(within(reconciliation).getByText(/Low quantity limit 3/)).toBeVisible();
    expect(within(reconciliation).getByText("Cabinet fitting")).toBeVisible();
    expect(within(reconciliation).getByText(/Price version 2/)).toBeVisible();
    expect(within(reconciliation).getByText(/Price version 1/)).toBeVisible();
    expect((await axe.run(review, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("shows unverified saved values and requires a separate approval reason", async () => {
    const decisions: unknown[] = [];
    const recoveredSnapshot: PurchaseOrderRequestModeSnapshot = { ...modeSnapshot, mode: { ...modeSnapshot.mode,
      integrity: { status: "mismatch", activatedDigest: "b".repeat(64), observedDigest: "c".repeat(64),
        candidateAvailability: [{ key: "pmc", label: "PMC", available: true, issues: [] }] },
      decision: { ...modeSnapshot.mode.decision!, integrityBasis: { kind: "observed_unverified",
        activatedDigest: "b".repeat(64), observedDigest: "c".repeat(64),
        reason: "The current saved PMC rate was checked against the supplier scope.",
        actorId: "buyer-one", acknowledgedAt: "2026-10-01T00:00:00.000Z" } }
    } };
    const request = { ...capturedRequest, revisions: capturedRequest.revisions.map((item) => ({
      ...item, modeSnapshots: [recoveredSnapshot]
    })) };
    server.use(
      http.get("/api/v1/admin/purchase-order-requests/pending", () => HttpResponse.json({ data: {
        items: [request], total: 1, limit: 50, offset: 0
      } })),
      http.post("/api/v1/admin/purchase-order-requests/request-project-one/decision", async ({ request: call }) => {
        decisions.push(await call.json());
        return HttpResponse.json({ data: { ...request, status: "approved", version: 5 } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<SuperAdminPurchaseOrdersPage />);
    await user.click(await screen.findByRole("button", { name: /Aurora Villa/ }));
    const form = screen.getByRole("form", { name: "Review Aurora Villa purchase order request" });
    expect(within(form).getByText(/current saved Configuration values that could not be verified/)).toBeVisible();
    const reconciliation = within(form).getByRole("article", { name: "Kitchen cabinetry mode and vendor reconciliation" });
    expect(within(reconciliation).getByText("Unverified saved Configuration values")).toBeVisible();
    expect(within(reconciliation).getByText(/current saved PMC rate was checked/)).toBeVisible();
    await user.type(within(form).getByRole("textbox", { name: "Budget override reason" }), "Client approved the additional supplier cost");
    await user.click(within(form).getByRole("button", { name: "Approve all vendor orders" }));
    expect(decisions).toHaveLength(0);
    expect(within(form).getByRole("textbox", { name: "Unverified configuration approval reason" })).toBeInvalid();
    await user.type(within(form).getByRole("textbox", { name: "Unverified configuration approval reason" }), "I reviewed the saved PMC calculation and buyer's reason");
    await user.click(within(form).getByRole("button", { name: "Approve all vendor orders" }));
    await waitFor(() => expect(decisions).toHaveLength(1));
    expect(decisions[0]).toMatchObject({ decision: "approve",
      reason: "I reviewed the saved PMC calculation and buyer's reason",
      budgetOverrideReason: "Client approved the additional supplier cost" });
  });

  it("labels historical evidence as uncaptured and does not infer a mode from vendor lines", async () => {
    server.use(http.get("/api/v1/admin/purchase-order-requests/pending", () => HttpResponse.json({ data: {
      items: [projectRequest], total: 1, limit: 50, offset: 0
    } })));
    const user = userEvent.setup();
    renderWithQuery(<SuperAdminPurchaseOrdersPage />);
    await user.click(await screen.findByRole("button", { name: /Aurora Villa/ }));
    const review = screen.getByRole("form", { name: "Review Aurora Villa purchase order request" });
    expect(within(review).getByText("Mode and price evidence was not captured for this historical revision.")).toBeVisible();
    expect(within(review).queryByText("Configured cost benchmark")).not.toBeInTheDocument();
  });

  it("surfaces missing price references and manual commercial reasons on the frozen line", async () => {
    const exceptionSnapshot: PurchaseOrderRequestModeSnapshot = { ...modeSnapshot,
      mode: { ...modeSnapshot.mode, state: "exception", decision: { ...modeSnapshot.mode.decision!, exceptionReason: "No current specification rate" },
        priceReferences: { ...modeSnapshot.mode.priceReferences,
          "item-three": { state: "unavailable", priceVersionId: null, priceVersionNumber: null, taxVersionId: null,
            taxVersionNumber: null, unitPricePaise: null, gstBasisPoints: null, treatment: null, effectiveFrom: null,
            effectiveTo: null, issues: [{ code: "missing_price", message: "No effective vendor price version" }] } } },
      actualChildren: [modeSnapshot.actualChildren[0], { ...modeSnapshot.actualChildren[1], commercialExceptionReason: "Supplier quoted an alternate finish" }]
    };
    server.use(http.get("/api/v1/admin/purchase-order-requests/pending", () => HttpResponse.json({ data: {
      items: [{ ...capturedRequest, revisions: capturedRequest.revisions.map((revision) => ({ ...revision,
        modeSnapshots: [exceptionSnapshot] })) }], total: 1, limit: 50, offset: 0
    } })));
    const user = userEvent.setup();
    renderWithQuery(<SuperAdminPurchaseOrdersPage />);
    await user.click(await screen.findByRole("button", { name: /Aurora Villa/ }));
    const reconciliation = screen.getByRole("article", { name: "Kitchen cabinetry mode and vendor reconciliation" });
    expect(within(reconciliation).getByText("Price or tax reference: No effective vendor price version")).toBeVisible();
    expect(within(reconciliation).getByText("Manual exception: No current specification rate")).toBeVisible();
    expect(within(reconciliation).getByText("Manual exception: Supplier quoted an alternate finish")).toBeVisible();
  });

  it("returns focus to each queue row when its review is closed", async () => {
    server.use(http.get("/api/v1/admin/purchase-order-requests/pending", () => HttpResponse.json({ data: {
      items: [projectRequest], total: 1, limit: 50, offset: 0
    } })));
    const user = userEvent.setup();
    renderWithQuery(<SuperAdminPurchaseOrdersPage />);

    const projectQueue = await screen.findByRole("list", { name: "Pending project purchase order requests" });
    const projectRow = within(projectQueue).getByRole("button", { name: /Aurora Villa/ });
    await user.click(projectRow);
    await user.click(within(screen.getByRole("form", { name: "Review Aurora Villa purchase order request" })).getByRole("button", { name: "Close review" }));
    expect(projectRow).toHaveFocus();

    const individualQueue = await screen.findByRole("list", { name: "Pending purchase orders" });
    const individualRow = within(individualQueue).getByRole("button", { name: /PO-ONE/ });
    await user.click(individualRow);
    await user.click(within(screen.getByRole("form", { name: "Review PO-ONE" })).getByRole("button", { name: "Close" }));
    expect(individualRow).toHaveFocus();
  });

  it("labels both queues and shows submitted-revision totals instead of mutable draft totals", async () => {
    server.use(
      http.get("/api/v1/admin/purchase-order-requests/pending", () => HttpResponse.json({ data: {
        items: [{ ...projectRequest, totals: { ...projectRequest.totals, totalPaise: 99999999 }, sectionTotals: [], vendorTotals: [] }], total: 1, limit: 50, offset: 0
      } })),
      http.get("/api/v1/admin/purchase-orders/pending", () => HttpResponse.json({ data: {
        items: [{ ...order, draftTotals: { ...order.draftTotals, totalPaise: 99999999 } }], total: 1, limit: 50, offset: 0
      } }))
    );
    renderWithQuery(<SuperAdminPurchaseOrdersPage />);

    const projectQueue = await screen.findByRole("list", { name: "Pending project purchase order requests" });
    const projectRow = within(projectQueue).getByRole("button", { name: /Aurora Villa/ });
    expect(projectRow).toHaveAccessibleName(/Aurora Villa.*Scope.*2 estimate sections.*Submitted total.*₹7,080\.00/);
    expect(projectRow).toHaveTextContent("2 estimate sections · 2 vendors");
    expect(projectRow).toHaveTextContent("Submitted total");
    expect(projectRow).toHaveTextContent("₹7,080.00");
    expect(projectRow).not.toHaveTextContent("₹9,99,999.99");

    const individualQueue = await screen.findByRole("list", { name: "Pending purchase orders" });
    const individualRow = within(individualQueue).getByRole("button", { name: /PO-ONE/ });
    expect(individualRow).toHaveAccessibleName(/PO-ONE.*Project.*project-one.*Submitted total.*₹7,080\.00/);
    expect(individualRow).toHaveTextContent("Project");
    expect(individualRow).toHaveTextContent("Submitted total");
    expect(individualRow).toHaveTextContent("₹7,080.00");
    expect(individualRow).not.toHaveTextContent("₹9,99,999.99");
  });

  it("does not present draft terms as submitted terms when the revision is missing", async () => {
    server.use(http.get("/api/v1/admin/purchase-orders/pending", () => HttpResponse.json({ data: {
      items: [{ ...order, submittedRevisionId: "missing-revision", terms: "Mutable draft terms" }], total: 1, limit: 50, offset: 0
    } })));
    const user = userEvent.setup();
    renderWithQuery(<SuperAdminPurchaseOrdersPage />);
    const row = await screen.findByRole("button", { name: /PO-ONE/ });
    expect(row).toHaveTextContent("Unavailable");
    await user.click(row);
    const review = screen.getByRole("form", { name: "Review PO-ONE" });
    expect(within(review).getByText(/Submitted terms unavailable/)).toBeVisible();
    expect(within(review).queryByText("Mutable draft terms")).not.toBeInTheDocument();
    expect(within(review).getByRole("button", { name: "Approve purchase order" })).toBeDisabled();
  });

  it("reviews one project package by section and vendor, then sends one versioned approval", async () => {
    const decisions: unknown[] = [];
    let decided = false;
    server.use(
      http.get("/api/v1/admin/purchase-order-requests/pending", () => HttpResponse.json({ data: { items: decided ? [] : [projectRequest], total: decided ? 0 : 1, limit: 50, offset: 0 } })),
      http.post("/api/v1/admin/purchase-order-requests/request-project-one/decision", async ({ request }) => {
        decisions.push(await request.json());
        decided = true;
        return HttpResponse.json({ data: { ...projectRequest, status: "approved", version: 5 } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<SuperAdminPurchaseOrdersPage />);
    const queue = await screen.findByRole("list", { name: "Pending project purchase order requests" });
    await user.click(within(queue).getByRole("button", { name: /Aurora Villa/ }));
    const form = screen.getByRole("form", { name: "Review Aurora Villa purchase order request" });
    expect((await axe.run(form, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    expect(within(form).getByText(/approved estimate before GST/i)).toBeVisible();
    expect(within(form).getByText(/The proposed before GST amount exceeds the approved estimate/)).toBeVisible();
    await user.click(within(form).getByText("Kitchen"));
    expect(within(form).getAllByText("Kitchen cabinetry")[0]).toBeVisible();
    const vendorDetail = within(form).getByText("Bright Works").closest("details");
    expect(vendorDetail).not.toBeNull();
    await user.click(within(vendorDetail!).getByText("Bright Works"));
    expect(within(vendorDetail!).getAllByText("Pendant lighting")[0]).toBeVisible();
    await user.click(within(form).getByRole("button", { name: "Approve all vendor orders" }));
    expect(within(form).getByRole("textbox", { name: "Budget override reason" })).toBeInvalid();
    expect(decisions).toHaveLength(0);
    await user.type(within(form).getByRole("textbox", { name: "Budget override reason" }), "Client approved the extra work");
    await user.click(within(form).getByRole("button", { name: "Approve all vendor orders" }));
    await waitFor(() => expect(decisions).toHaveLength(1));
    expect(decisions[0]).toEqual({ expectedVersion: 4, submittedRevisionId: "request-revision-two",
      decision: "approve", reason: null, budgetOverrideReason: "Client approved the extra work", idempotencyKey: "key-12345678" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Aurora Villa/ })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Project purchase order requests" })).toHaveFocus();
  });

  it("requires an explicit budget override and submits the immutable revision and version", async () => {
    const decisions: unknown[] = [];
    let decided = false;
    server.use(
      http.get("/api/v1/admin/purchase-orders/pending", () => HttpResponse.json({ data: { items: decided ? [] : [order], total: decided ? 0 : 1, limit: 50, offset: 0 } })),
      http.post("/api/v1/procurement/projects/project-one/purchase-orders/order-one/decision", async ({ request }) => {
        decisions.push(await request.json());
        decided = true;
        return HttpResponse.json({ data: { ...order, status: "approved", version: 5 } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<SuperAdminPurchaseOrdersPage />);
    await user.click(await screen.findByRole("button", { name: /PO-ONE/ }));
    expect(await screen.findByText(/would exceed the approved estimate/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Approve purchase order" }));
    expect(screen.getByRole("textbox", { name: "Budget override reason" })).toBeInvalid();
    expect(decisions).toHaveLength(0);
    await user.type(screen.getByRole("textbox", { name: "Budget override reason" }), "Client approved additional cabinetry scope");
    await user.click(screen.getByRole("button", { name: "Approve purchase order" }));
    await waitFor(() => expect(decisions).toHaveLength(1));
    expect(decisions[0]).toEqual({ expectedVersion: 4, submittedRevisionId: "revision-one", idempotencyKey: "key-12345678", decision: "approve", reason: null, budgetOverrideReason: "Client approved additional cabinetry scope" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /PO-ONE/ })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Individual vendor orders" })).toHaveFocus();
  });
});
