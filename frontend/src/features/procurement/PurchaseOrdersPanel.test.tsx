import { useQueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionCode } from "../../api/authorization-contract";
import type { ProjectProcurementItem } from "../../api/types";
import { LoadingProvider } from "../../components/ui/GlobalRequestLoader";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { PurchaseOrderItemRecovery } from "./PurchaseOrderItemRecovery";
import { PurchaseOrdersPanel } from "./PurchaseOrdersPanel";
import { purchaseOrderKeys, type PreviewPurchaseOrderModeInput, type PurchaseOrder } from "./purchaseOrderApi";

let permissions: PermissionCode[] = [];
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ authorization: { role: "procurement", permissions } })
}));

const item: ProjectProcurementItem = {
  id: "item-one", projectId: "project-one", itemName: "Kitchen cabinetry", brand: "Oak", pricePaise: 250000,
  uom: { id: "uom-one", code: "sq ft", name: "Square feet", status: "active" },
  vendor: { id: "vendor-one", code: "VEN-1", name: "Oak Works", status: "active" },
  estimateSource: { estimateId: "estimate-one", estimateVersion: 2, estimateReviewRoundId: "review-one", sourceSectionId: "CA", sourceLineItemKey: "line-one" },
  version: 1, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z"
};

const preparation = {
  projectId: "project-one",
  estimateSource: { estimateId: "estimate-one", estimateVersion: 2, estimateReviewRoundId: "review-one" },
  approvedEstimatePaise: 1000000, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 1000000,
  orderDefaults: { targetDate: "2026-11-30", deliveryLocation: "Aurora Villa site" },
  digest: "a".repeat(64), netPaise: 740000, itemCount: 2, readyItemCount: 2, blockers: [],
  sections: [
    { id: "KIT", label: "Kitchen", roomName: "Kitchen", estimatedPaise: 600000, netPaise: 500000, items: [
      { id: "item-one", version: 1, sourceSectionId: "KIT", sourceLineItemKey: "line-one", roomName: "Kitchen",
        itemName: "Kitchen cabinetry", brand: "Oak", uom: { id: "uom-one", code: "sq ft", name: "Square feet", decimalScale: 2, status: "active" },
        vendor: { id: "vendor-one", code: "VEN-1", name: "Oak Works", status: "active", vendorType: "execution" },
        plannedOrderQuantityMilliUnits: 2000, pricePaise: 250000, allocatedWorkPaise: 650000, plannedLineNetPaise: 500000, blockers: [] }
    ] },
    { id: "LIV", label: "Living", roomName: "Living", estimatedPaise: 400000, netPaise: 240000, items: [
      { id: "item-two", version: 3, sourceSectionId: "LIV", sourceLineItemKey: "line-two", roomName: "Living",
        itemName: "Living room lights", brand: "Clear", uom: { id: "uom-two", code: "unit", name: "Unit", decimalScale: 0, status: "active" },
        vendor: { id: "vendor-two", code: "VEN-2", name: "Bright Works", status: "active", vendorType: "supplier" },
        plannedOrderQuantityMilliUnits: 3000, pricePaise: 80000, allocatedWorkPaise: 350000, plannedLineNetPaise: 240000, blockers: [] }
    ] }
  ],
  estimateLines: [
    { key: "line-one", included: true, source: "configuration", itemType: "main_line", roomId: "room-kitchen", roomName: "Kitchen",
      mainBasketId: "basket-kitchen", mainBasketName: "Woodwork", subBasketId: "sub-kitchen", subBasketName: "Cabinetry",
      mainLineId: "main-kitchen", mainLineName: "Kitchen cabinetry", quantity: "2", unit: "sq ft", amountPaise: 600000, itemIds: ["item-one"],
      mode: { state: "ready", options: [{ key: "pmc", label: "PMC" }],
        decision: { id: "mode-one", version: 1, sourceLineItemKey: "line-one", mode: "pmc", quantity: "2", discountBps: 0,
          markupBasis: "starting", exceptionReason: null, revisionId: "revision-kitchen", revisionDigest: "digest-kitchen", updatedAt: "2026-10-01T00:00:00Z" },
        preview: { formulaVersion: "v1", mode: "pmc", quantity: "2", quantityScale: 2, baseCostPaise: 380000, adjustedCostPaise: 400000,
          lowQuantityImpactPaise: 20000, sellingPaise: 500000, finalVendorChargesPaise: null, floorSellingPaise: null, marginBps: 2000, appliedImpactBps: 500,
          discountBps: 0, discountAmountPaise: 0, quantityRule: null, procurementQuantitySuggestion: null,
          settings: { scopes: [{ scope: "pmc", source: "scoped", baseRatePaise: 190000, lowQuantityLimit: "2", impactBps: 500, minimumMarkupBps: 1000, startingMarkupBps: 2000 }], configuredMarginBps: 2000, markupBasis: "starting" }, components: [] },
        issues: [], revision: { id: "revision-kitchen", version: 3, status: "active", contentDigest: "digest-kitchen" },
        uom: { id: "uom-one", code: "sq ft", decimalScale: 2 }, priceReferences: { "item-one": {
          state: "ready", priceVersionId: "price-one", priceVersionNumber: 2, taxVersionId: "tax-one", taxVersionNumber: 1,
          unitPricePaise: 250000, gstBasisPoints: 1800, treatment: "exclusive", effectiveFrom: "2026-01-01", effectiveTo: null, issues: []
        } } } },
    { key: "line-two", included: true, source: "configuration", itemType: "main_line", roomId: "room-living", roomName: "Living",
      mainBasketId: "basket-living", mainBasketName: "Woodwork", subBasketId: "sub-living", subBasketName: "Lighting",
      mainLineId: "main-living", mainLineName: "Living room lights", quantity: "3", unit: "unit", amountPaise: 400000, itemIds: ["item-two"],
      mode: { state: "ready", options: [{ key: "sub_vendor", label: "Execution / Sub-Vendor" }],
        decision: { id: "mode-two", version: 1, sourceLineItemKey: "line-two", mode: "sub_vendor", quantity: "3", discountBps: 0,
          markupBasis: "starting", exceptionReason: null, revisionId: "revision-living", revisionDigest: "digest-living", updatedAt: "2026-10-01T00:00:00Z" },
        preview: { formulaVersion: "v1", mode: "sub_vendor", quantity: "3", quantityScale: 0, baseCostPaise: 200000, adjustedCostPaise: 205000,
          lowQuantityImpactPaise: 5000, sellingPaise: 250000, finalVendorChargesPaise: 192500, floorSellingPaise: null, marginBps: 1800, appliedImpactBps: 250,
          discountBps: 0, discountAmountPaise: 0, quantityRule: null, procurementQuantitySuggestion: null,
          settings: { scopes: [{ scope: "sub_vendor", source: "scoped", baseRatePaise: 70000, lowQuantityLimit: "3", impactBps: 250, minimumMarkupBps: 900, startingMarkupBps: 1800 }], configuredMarginBps: 1800, markupBasis: "starting" }, components: [] },
        issues: [], revision: { id: "revision-living", version: 2, status: "active", contentDigest: "digest-living" },
        uom: { id: "uom-two", code: "unit", decimalScale: 0 }, priceReferences: { "item-two": {
          state: "ready", priceVersionId: "price-two", priceVersionNumber: 1, taxVersionId: "tax-two", taxVersionNumber: 1,
          unitPricePaise: 80000, gstBasisPoints: 500, treatment: "exclusive", effectiveFrom: "2026-01-01", effectiveTo: null, issues: []
        } } } }
  ]
};

function modePreviewData(input: PreviewPurchaseOrderModeInput, sellingPaise = 500000) {
  const line = preparation.estimateLines.find((candidate) => candidate.key === input.sourceLineItemKey)!;
  return { projectId: "project-one", estimateSource: input.estimateSource,
    sourceLineItemKey: input.sourceLineItemKey, decisionVersion: input.expectedVersion,
    revision: line.mode.revision, uom: line.mode.uom,
    preview: line.mode.preview ? { ...line.mode.preview, mode: input.mode, quantity: input.quantity, sellingPaise } : null,
    scopes: [], issues: [] };
}

async function openEstimateLine(user: ReturnType<typeof userEvent.setup>, name: string) {
  const line = (await screen.findByText(name, { selector: ".purchase-orders__estimate-line > summary > span" })).closest("details")!;
  const ancestors: HTMLDetailsElement[] = [];
  for (let parent = line.parentElement?.closest("details"); parent; parent = parent.parentElement?.closest("details")) {
    ancestors.push(parent as HTMLDetailsElement);
  }
  for (const details of ancestors.reverse()) if (!details.open) await user.click(details.querySelector(":scope > summary")!);
  if (!(line as HTMLDetailsElement).open) await user.click(line.querySelector(":scope > summary")!);
}

beforeEach(() => {
  permissions = ["procurement.purchase_orders.read", "procurement.purchase_orders.manage"];
  vi.stubGlobal("crypto", { randomUUID: () => "key-12345678" });
  server.use(
    http.get("/api/v1/procurement/projects/project-one/purchase-orders", () => HttpResponse.json({ data: { items: [], total: 0, limit: 50, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-commitments", () => HttpResponse.json({ data: { approvedEstimatePaise: 1000000, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 1000000 } })),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: preparation })),
    http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-previews", async ({ request }) => {
      const input = await request.json() as PreviewPurchaseOrderModeInput;
      return HttpResponse.json({ data: modePreviewData(input) });
    }),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-requests", () => HttpResponse.json({ data: { items: [], total: 0, limit: 50, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/items", () => HttpResponse.json({ data: { items: [item], total: 1, limit: 20, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/items/item-one", () => HttpResponse.json({ data: item })),
    http.get("/api/v1/procurement/vendors", () => HttpResponse.json({ data: { items: [{ id: "vendor-one", code: "VEN-1", name: "Oak Works", status: "active", assignable: true }, { id: "vendor-two", code: "VEN-2", name: "Pending Works", status: "under_review", assignable: false }], total: 2, limit: 20, offset: 0 } }))
  );
});

describe("purchase order drafting", () => {
  it("does not register a page loader for collapsed recovery and loads items when expanded", async () => {
    let releaseItems!: () => void;
    const unassignedRead = vi.fn(async () => {
      await new Promise<void>((resolve) => { releaseItems = resolve; });
      return HttpResponse.json({ data: { items: [item], total: 1, limit: 20, offset: 0 } });
    });
    server.use(http.get("/api/v1/procurement/projects/project-one/items", unassignedRead));
    const user = userEvent.setup();
    renderWithQuery(<LoadingProvider><PurchaseOrderItemRecovery projectId="project-one"
      canReadItems canManageItems={false} disabled={false} onEdit={() => {}} onRemove={() => {}} /></LoadingProvider>);
    expect(screen.getByText("Items needing assignment review")).toBeVisible();
    expect(unassignedRead).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading items needing assignment…")).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Content status" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Items needing assignment review"));
    await waitFor(() => expect(unassignedRead).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Loading items needing assignment…")).toBeVisible();
    expect(screen.getByRole("status", { name: "Content status" })).toBeInTheDocument();
    act(() => releaseItems());
    expect(await screen.findByText("Kitchen cabinetry")).toBeVisible();
    expect(screen.queryByText("Loading items needing assignment…")).not.toBeInTheDocument();
  });

  it("shows every approved line, requires explicit GST and terms, then sends the reviewed backend quote", async () => {
    const writes: unknown[] = [];
    const quotes: unknown[] = [];
    let requests: unknown[] = [];
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-requests", () => HttpResponse.json({ data: { items: requests, total: requests.length, limit: 50, offset: 0 } })),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-requests/quote", async ({ request }) => {
        quotes.push(await request.json());
        return HttpResponse.json({ data: {
          projectId: "project-one", preparationDigest: preparation.digest, estimateSource: preparation.estimateSource,
          approvedEstimatePaise: 1000000, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 1000000,
          totals: { netPaise: 740000, gstPaise: 102000, totalPaise: 842000 },
          sectionTotals: [{ sectionId: "KIT", label: "Kitchen", totals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 } },
            { sectionId: "LIV", label: "Living", totals: { netPaise: 240000, gstPaise: 12000, totalPaise: 252000 } }],
          vendorTotals: [{ vendorId: "vendor-one", name: "Oak Works", totals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 } },
            { vendorId: "vendor-two", name: "Bright Works", totals: { netPaise: 240000, gstPaise: 12000, totalPaise: 252000 } }],
          modeSnapshots: [{ sourceLineItemKey: "line-one", source: "configuration", roomId: "room-kitchen", roomName: "Kitchen",
            mainBasketId: "basket-kitchen", mainBasketName: "Woodwork", subBasketId: "sub-kitchen", subBasketName: "Cabinetry",
            mainLineId: "main-kitchen", mainLineName: "Kitchen cabinetry", approvedQuantity: "2", approvedUnit: "sq ft",
            approvedAmountPaise: 600000, referenceAsOf: "2026-10-01", mode: preparation.estimateLines[0].mode,
            actualChildren: [{ procurementItemId: "item-one", vendorId: "vendor-one", quantityMilliUnits: 2000, unitPricePaise: 250000,
              gstBasisPoints: 1800, allocatedWorkPaise: 650000, netPaise: 500000, gstPaise: 90000, totalPaise: 590000, commercialExceptionReason: null }],
            actualTotals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 }, actualNetMinusConfiguredCostPaise: 100000 }],
          lines: [{ procurementItemId: "item-one", sourceSectionId: "KIT", itemName: "Kitchen cabinetry", vendorName: "Oak Works", gstBasisPoints: 1800, netPaise: 500000, gstPaise: 90000, totalPaise: 590000 },
            { procurementItemId: "item-two", sourceSectionId: "LIV", itemName: "Living room lights", vendorName: "Bright Works", gstBasisPoints: 500, netPaise: 240000, gstPaise: 12000, totalPaise: 252000 }]
        } });
      }),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-requests", async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        writes.push(body);
        const saved = {
          id: "request-one", projectId: "project-one", projectName: "Aurora Villa", requestNumber: "POR-20261001-ABCD1234", status: "pending_approval", version: 1, revision: 1,
          submittedRevisionId: "revision-one", estimateSource: preparation.estimateSource, preparationDigest: preparation.digest,
          approvedEstimatePaise: 1000000, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 1000000,
          totals: { netPaise: 740000, gstPaise: 102000, totalPaise: 842000 },
          sectionTotals: [{ sectionId: "KIT", label: "Kitchen", totals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 } },
            { sectionId: "LIV", label: "Living", totals: { netPaise: 240000, gstPaise: 12000, totalPaise: 252000 } }],
          vendorTotals: [{ vendorId: "vendor-one", code: "VEN-1", name: "Oak Works", terms: "Vendor confirmation required", totals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 } },
            { vendorId: "vendor-two", code: "VEN-2", name: "Bright Works", terms: "Vendor confirmation required", totals: { netPaise: 240000, gstPaise: 12000, totalPaise: 252000 } }],
          approvedOrderIds: [], decisions: [], revisions: [], createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z"
        };
        requests = [saved];
        return HttpResponse.json({ data: saved }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    expect(await screen.findByText("Estimate items and modes")).toBeVisible();
    expect(screen.getByText("2 of 2 estimate lines shown")).toBeVisible();
    expect(screen.getAllByText("Woodwork", { selector: ".purchase-orders__estimate-basket > summary > span" })).toHaveLength(2);
    expect(screen.getByText("Prepared vendor net, before GST").nextElementSibling).toHaveTextContent("7,400.00");
    expect(screen.getByText("Quoted GST").nextElementSibling).toHaveTextContent("Review quote");
    expect(screen.getByRole("button", { name: "Send purchase order to Super Admin" })).toBeDisabled();
    await openEstimateLine(user, "Kitchen cabinetry");
    await openEstimateLine(user, "Living room lights");
    expect(screen.getAllByText("Configured benchmark", { selector: ".purchase-orders__benchmark-title strong" })).toHaveLength(2);
    await user.type(screen.getByRole("textbox", { name: "GST for Kitchen cabinetry (%)" }), "18");
    await user.type(screen.getByRole("textbox", { name: "GST for Living room lights (%)" }), "5");
    await user.type(screen.getByRole("textbox", { name: "Oak Works" }), "Vendor confirmation required");
    await user.type(screen.getByRole("textbox", { name: "Bright Works" }), "Vendor confirmation required");
    expect((await axe.run(document.querySelector(".purchase-orders__project-request")!, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Review backend quote" }));
    await waitFor(() => expect(quotes).toHaveLength(1));
    expect(await screen.findByText("Vendor payable quote")).toBeVisible();
    expect(screen.getByText("Quoted GST").nextElementSibling).toHaveTextContent("1,020.00");
    expect(screen.getByText("Quoted vendor payable").nextElementSibling).toHaveTextContent("8,420.00");
    await user.click(screen.getByText("Compare configured cost and actual order"));
    expect(screen.getByText("Actual net minus configured cost").nextElementSibling).toHaveTextContent("1,000.00");
    await user.clear(screen.getByRole("textbox", { name: "GST for Living room lights (%)" }));
    await user.type(screen.getByRole("textbox", { name: "GST for Living room lights (%)" }), "5");
    expect(screen.getByRole("button", { name: "Send purchase order to Super Admin" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Review backend quote" }));
    await waitFor(() => expect(quotes).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send purchase order to Super Admin" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Send purchase order to Super Admin" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      expectedPreparationDigest: preparation.digest, idempotencyKey: "key-12345678",
      lines: [
        { procurementItemId: "item-one", expectedVersion: 1, gstBasisPoints: 1800, scopeType: "execution",
          description: "Kitchen cabinetry", targetDate: "2026-11-30", deliveryLocation: "Aurora Villa site" },
        { procurementItemId: "item-two", expectedVersion: 3, gstBasisPoints: 500, scopeType: "supply",
          description: "Living room lights", targetDate: "2026-11-30", deliveryLocation: "Aurora Villa site" }
      ],
      vendorTerms: [{ vendorId: "vendor-one", terms: "Vendor confirmation required" }, { vendorId: "vendor-two", terms: "Vendor confirmation required" }]
    });
    expect(await screen.findByText("Pending with Super Admin")).toBeVisible();
    expect(screen.getAllByText("₹8,420.00").length).toBeGreaterThan(0);
  });

  it("saves a pinned main-line mode with confirmed calculation quantity before a quote is allowed", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const unselected = { ...preparation.estimateLines[0], mode: { ...preparation.estimateLines[0].mode,
      state: "selection_required", decision: null, preview: null } };
    let current: Record<string, unknown> = { ...preparation, digest: "b".repeat(64), estimateLines: [unselected, preparation.estimateLines[1]] };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: current })),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-decisions", async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        writes.push(body);
        const decision = { ...preparation.estimateLines[0].mode.decision, id: "new-mode", version: 1, quantity: "1.25" };
        current = { ...preparation, digest: "c".repeat(64), estimateLines: [{ ...preparation.estimateLines[0],
          mode: { ...preparation.estimateLines[0].mode, decision, preview: { ...preparation.estimateLines[0].mode.preview, quantity: "1.25" } } }, preparation.estimateLines[1]] };
        return HttpResponse.json({ data: decision }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await screen.findByText("Estimate items and modes");
    await openEstimateLine(user, "Kitchen cabinetry");
    const kitchenLine = within(screen.getByText("Kitchen cabinetry", { selector: ".purchase-orders__estimate-line > summary > span" }).closest("details")!);
    expect(screen.getByText(/Kitchen cabinetry: Confirm a configured mode/)).toBeVisible();
    await user.click(kitchenLine.getByRole("radio", { name: /PMC Project management calculation/ }));
    await user.clear(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" }));
    await user.type(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" }), "1.25");
    await user.click(kitchenLine.getByRole("button", { name: "Discard changes" }));
    expect(kitchenLine.getByRole("radio", { name: /PMC Project management calculation/ })).not.toBeChecked();
    expect(kitchenLine.queryByRole("button", { name: "Discard changes" })).not.toBeInTheDocument();
    await user.click(kitchenLine.getByRole("radio", { name: /PMC Project management calculation/ }));
    await user.clear(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" }));
    await user.type(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" }), "1.25");
    await user.click(kitchenLine.getByRole("button", { name: "Save mode decision" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ sourceLineItemKey: "line-one", expectedVersion: 0, mode: "pmc", quantity: "1.25",
      discountBps: 0, markupBasis: "starting", expectedEstimateSource: preparation.estimateSource,
      expectedRevisionDigest: "digest-kitchen", idempotencyKey: "key-12345678" });
    expect(await screen.findByText("Mode decision saved. Review the updated calculation before quoting.")).toBeVisible();
    expect(kitchenLine.getByText("Explicit order quantity").nextElementSibling).toHaveTextContent("2 sq ft");
    expect(kitchenLine.getByText("Configured benchmark", { selector: ".purchase-orders__benchmark-title strong" })).toBeVisible();
  });

  it("guards an unverified mode preview and save with the observed digest, then refreshes before quoting", async () => {
    const activatedDigest = "a".repeat(64);
    const observedDigest = "b".repeat(64);
    const integrity = { status: "mismatch" as const, activatedDigest, observedDigest,
      candidateAvailability: [{ key: "pmc" as const, label: "PMC", available: true, issues: [] }] };
    const mismatchIssue = { code: "PINNED_DIGEST_MISMATCH", message: "The saved Configuration content does not match its activated digest." };
    const baseMode = preparation.estimateLines[0].mode;
    const mismatchLine = { ...preparation.estimateLines[0], mode: { ...baseMode,
      state: "unavailable", options: [], availability: [], decision: null, preview: null,
      issues: [mismatchIssue], integrity,
      revision: { ...baseMode.revision, contentDigest: activatedDigest } } };
    let current: Record<string, unknown> = { ...preparation, digest: "c".repeat(64),
      estimateLines: [mismatchLine, preparation.estimateLines[1]] };
    const previews: PreviewPurchaseOrderModeInput[] = [];
    const writes: Array<Record<string, unknown>> = [];
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: current })),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-previews", async ({ request }) => {
        const input = await request.json() as PreviewPurchaseOrderModeInput;
        previews.push(input);
        return HttpResponse.json({ data: { ...modePreviewData(input), revision: mismatchLine.mode.revision,
          integrity, issues: [mismatchIssue] } });
      }),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-decisions", async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        writes.push(body);
        const decision = { ...baseMode.decision, version: 1,
          revisionDigest: activatedDigest, integrityBasis: { kind: "observed_unverified", activatedDigest, observedDigest,
            reason: "Reviewed current values with the site lead.", actorId: "buyer-one", acknowledgedAt: "2026-10-04T00:00:00Z" } };
        current = { ...preparation, digest: "d".repeat(64), estimateLines: [{ ...mismatchLine,
          mode: { ...mismatchLine.mode, state: "ready", options: [{ key: "pmc", label: "PMC" }],
            availability: integrity.candidateAvailability, decision, preview: baseMode.preview, issues: [] } }, preparation.estimateLines[1]] };
        return HttpResponse.json({ data: decision }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await openEstimateLine(user, "Kitchen cabinetry");
    const kitchenLine = within(screen.getByText("Kitchen cabinetry", { selector: ".purchase-orders__estimate-line > summary > span" }).closest("details")!);
    await user.type(screen.getByRole("textbox", { name: "GST for Kitchen cabinetry (%)" }), "18");
    await user.type(screen.getByRole("textbox", { name: "GST for Living room lights (%)" }), "5");
    await user.type(screen.getByRole("textbox", { name: "Oak Works" }), "Vendor confirmation required");
    await user.type(screen.getByRole("textbox", { name: "Bright Works" }), "Vendor confirmation required");
    expect(screen.getByRole("button", { name: "Review backend quote" })).toBeDisabled();
    expect(kitchenLine.getByRole("radio", { name: /^PMC/ })).toBeDisabled();
    await user.click(kitchenLine.getByRole("button", { name: "Review current saved values" }));
    await user.click(kitchenLine.getByRole("radio", { name: /^PMC/ }));
    await waitFor(() => expect(previews).toHaveLength(1));
    expect(previews[0]).toMatchObject({ sourceLineItemKey: "line-one", expectedVersion: 0,
      expectedObservedDigest: observedDigest, estimateSource: preparation.estimateSource });
    expect(await kitchenLine.findByText("Current unverified saved values preview")).toBeVisible();
    expect(kitchenLine.queryByText(mismatchIssue.message)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review backend quote" })).toBeDisabled();
    await user.type(kitchenLine.getByRole("textbox", { name: "Why use these current unverified saved values?" }),
      "Reviewed current values with the site lead.");
    await user.click(kitchenLine.getByRole("checkbox", { name: /I reviewed the current saved values/ }));
    await user.click(kitchenLine.getByRole("button", { name: "Save mode decision" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ sourceLineItemKey: "line-one", expectedVersion: 0,
      expectedRevisionDigest: activatedDigest,
      recovery: { expectedObservedDigest: observedDigest, reason: "Reviewed current values with the site lead.", acknowledge: true } });
    await waitFor(() => expect(kitchenLine.getByText("Saved unverified benchmark")).toBeVisible());
    await waitFor(() => expect(screen.getByRole("button", { name: "Review backend quote" })).toBeEnabled());
    expect(screen.getByText(/Saved buyer reason: Reviewed current values with the site lead/)).toBeVisible();
  });

  it("blocks an open recovery draft when the observed saved content changes", async () => {
    const activatedDigest = "a".repeat(64);
    const observedDigest = "b".repeat(64);
    const availability = [{ key: "pmc" as const, label: "PMC", available: true, issues: [] }];
    const originalLine = { ...preparation.estimateLines[0], mode: { ...preparation.estimateLines[0].mode,
      state: "unavailable", options: [], availability: [], decision: null, preview: null,
      integrity: { status: "mismatch" as const, activatedDigest, observedDigest, candidateAvailability: availability },
      revision: { ...preparation.estimateLines[0].mode.revision, contentDigest: activatedDigest } } };
    let current: Record<string, unknown> = { ...preparation, estimateLines: [originalLine, preparation.estimateLines[1]] };
    let publishPreparation!: () => void;
    const writes: Array<Record<string, unknown>> = [];
    function Host() {
      const queryClient = useQueryClient();
      publishPreparation = () => queryClient.setQueryData(purchaseOrderKeys.preparation("project-one"), current);
      return <PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />;
    }
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: current })),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-decisions", async ({ request }) => {
        writes.push(await request.json() as Record<string, unknown>);
        return HttpResponse.json({ error: { code: "STALE_OBSERVED_CONTENT", message: "Saved values changed." } }, { status: 409 });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<Host />);
    await openEstimateLine(user, "Kitchen cabinetry");
    const kitchenLine = within(screen.getByText("Kitchen cabinetry", { selector: ".purchase-orders__estimate-line > summary > span" }).closest("details")!);
    await user.click(kitchenLine.getByRole("button", { name: "Review current saved values" }));
    await user.click(kitchenLine.getByRole("radio", { name: /^PMC/ }));
    current = { ...preparation, digest: "e".repeat(64), estimateLines: [{ ...originalLine,
      mode: { ...originalLine.mode, integrity: { ...originalLine.mode.integrity, observedDigest: "f".repeat(64) } } }, preparation.estimateLines[1]] };
    act(() => publishPreparation());
    await waitFor(() => expect(kitchenLine.getByText(/This mode decision or its saved configuration changed while you were editing/)).toBeVisible());
    expect(kitchenLine.getByRole("button", { name: "Save mode decision" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review backend quote" })).toBeDisabled();
    expect(writes).toHaveLength(0);
    await user.click(kitchenLine.getByRole("button", { name: "Discard changes" }));
    expect(kitchenLine.getByRole("radio", { name: /^PMC/ })).toBeDisabled();
  });

  it("clears an existing main-line mode decision through the versioned save contract", async () => {
    const writes: Array<Record<string, unknown>> = [];
    server.use(http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-decisions", async ({ request }) => {
      writes.push(await request.json() as Record<string, unknown>);
      return HttpResponse.json({ data: { ...preparation.estimateLines[0].mode.decision, version: 2,
        mode: null, quantity: null, exceptionReason: null } }, { status: 201 });
    }));
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await screen.findByText("Estimate items and modes");
    await openEstimateLine(user, "Kitchen cabinetry");
    const kitchenLine = within(screen.getByText("Kitchen cabinetry", { selector: ".purchase-orders__estimate-line > summary > span" }).closest("details")!);
    await user.click(kitchenLine.getByRole("radio", { name: /Clear decision/ }));
    await user.click(kitchenLine.getByRole("button", { name: "Clear mode decision" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ sourceLineItemKey: "line-one", expectedVersion: 1,
      mode: null, quantity: null, discountBps: 0, markupBasis: "starting", exceptionReason: null,
      expectedEstimateSource: preparation.estimateSource, expectedRevisionDigest: "digest-kitchen" });
  });

  it("previews each Execution source from the pinned draft and ignores a delayed PMC result", async () => {
    const allModes = [
      { key: "pmc", label: "PMC" }, { key: "sub_vendor", label: "Execution / Sub-vendor" },
      { key: "in_house", label: "Execution / In-house" }
    ];
    const current = { ...preparation, estimateLines: [{ ...preparation.estimateLines[0],
      mode: { ...preparation.estimateLines[0].mode, options: allModes } }, preparation.estimateLines[1]] };
    const previews: PreviewPurchaseOrderModeInput[] = [];
    let releasePmc!: () => void;
    const delayedPmc = new Promise<void>((resolve) => { releasePmc = resolve; });
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: current })),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-previews", async ({ request }) => {
        const input = await request.json() as PreviewPurchaseOrderModeInput;
        previews.push(input);
        if (input.mode === "pmc") await delayedPmc;
        return HttpResponse.json({ data: modePreviewData(input, input.mode === "pmc" ? 990000 : input.mode === "sub_vendor" ? 720000 : 830000) });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await openEstimateLine(user, "Kitchen cabinetry");
    const kitchenLine = within(screen.getByText("Kitchen cabinetry", { selector: ".purchase-orders__estimate-line > summary > span" }).closest("details")!);
    await user.clear(kitchenLine.getByRole("textbox", { name: "Additional discount (%)" }));
    await user.type(kitchenLine.getByRole("textbox", { name: "Additional discount (%)" }), "1");
    await waitFor(() => expect(previews).toHaveLength(1));
    expect(previews[0]).toMatchObject({ mode: "pmc", quantity: "2", discountBps: 100, expectedVersion: 1,
      estimateSource: preparation.estimateSource });
    await user.click(kitchenLine.getByRole("radio", { name: /Execution Choose Sub-vendor or In-house below/ }));
    expect(kitchenLine.queryByLabelText("Unsaved calculation preview for Kitchen cabinetry")).not.toBeInTheDocument();
    await user.click(kitchenLine.getByRole("radio", { name: /Sub-vendor Configured execution vendor margin/ }));
    await waitFor(() => expect(previews.some((input) => input.mode === "sub_vendor")).toBe(true));
    const draftPreview = await kitchenLine.findByLabelText("Unsaved calculation preview for Kitchen cabinetry");
    await waitFor(() => expect(within(draftPreview).getByText("Calculated selling for this main line").nextElementSibling).toHaveTextContent("₹7,200.00"));
    act(() => releasePmc());
    expect(within(draftPreview).getByText("Calculated selling for this main line").nextElementSibling).toHaveTextContent("₹7,200.00");
    await user.click(kitchenLine.getByRole("radio", { name: /In-house Configured labor and material calculation/ }));
    await waitFor(() => expect(previews.some((input) => input.mode === "in_house")).toBe(true));
    await waitFor(() => expect(within(kitchenLine.getByLabelText("Unsaved calculation preview for Kitchen cabinetry"))
      .getByText("Calculated selling for this main line").nextElementSibling).toHaveTextContent("₹8,300.00"));
    expect(screen.getByRole("button", { name: "Review backend quote" })).toBeDisabled();
    expect(kitchenLine.getByText("Agreed unit rate, before tax").nextElementSibling).toHaveTextContent("₹2,500.00");
  });

  it("keeps an edited mode and blocks saving when preparation advances the decision version", async () => {
    let current: Record<string, unknown> = preparation;
    let publishPreparation!: () => void;
    const writes: PreviewPurchaseOrderModeInput[] = [];
    function Host() {
      const queryClient = useQueryClient();
      publishPreparation = () => queryClient.setQueryData(purchaseOrderKeys.preparation("project-one"), current);
      return <PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />;
    }
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: current })),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-decisions", async ({ request }) => {
        writes.push(await request.json() as PreviewPurchaseOrderModeInput);
        return HttpResponse.json({ data: { ...preparation.estimateLines[0].mode.decision, version: 3 } }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<Host />);
    await openEstimateLine(user, "Kitchen cabinetry");
    const kitchenLine = within(screen.getByText("Kitchen cabinetry", { selector: ".purchase-orders__estimate-line > summary > span" }).closest("details")!);
    const quantity = kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" });
    await user.clear(quantity);
    await user.type(quantity, "2.5");
    current = { ...preparation, digest: "f".repeat(64), estimateLines: [{ ...preparation.estimateLines[0], mode: {
      ...preparation.estimateLines[0].mode, decision: { ...preparation.estimateLines[0].mode.decision, version: 2 }
    } }, preparation.estimateLines[1]] };
    act(() => publishPreparation());
    expect(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" })).toHaveValue("2.5");
    await waitFor(() => expect(kitchenLine.getByText(/This mode decision or its saved configuration changed while you were editing/)).toBeVisible());
    expect(kitchenLine.getByRole("button", { name: "Save mode decision" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review backend quote" })).toBeDisabled();
    expect(writes).toHaveLength(0);
    await user.click(kitchenLine.getByRole("button", { name: "Discard changes" }));
    await user.clear(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" }));
    await user.type(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" }), "2.75");
    await user.click(kitchenLine.getByRole("button", { name: "Save mode decision" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ sourceLineItemKey: "line-one", expectedVersion: 2,
      expectedEstimateSource: preparation.estimateSource, expectedRevisionDigest: "digest-kitchen", quantity: "2.75" });
  });

  it("requires explicit discard when an approved review round replaces an open mode draft", async () => {
    let current: Record<string, unknown> = preparation;
    let publishPreparation!: () => void;
    function Host() {
      const queryClient = useQueryClient();
      publishPreparation = () => queryClient.setQueryData(purchaseOrderKeys.preparation("project-one"), current);
      return <PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />;
    }
    server.use(http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: current })));
    const user = userEvent.setup();
    renderWithQuery(<Host />);
    await openEstimateLine(user, "Kitchen cabinetry");
    const kitchenLine = within(screen.getByText("Kitchen cabinetry", { selector: ".purchase-orders__estimate-line > summary > span" }).closest("details")!);
    await user.clear(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" }));
    await user.type(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" }), "2.5");
    current = { ...preparation, digest: "g".repeat(64), estimateSource: {
      ...preparation.estimateSource, estimateVersion: 3, estimateReviewRoundId: "review-two"
    } };
    act(() => publishPreparation());
    await waitFor(() => expect(screen.getByText(/The approved estimate or main line changed while a mode draft was open/)).toBeVisible());
    expect(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" })).toHaveValue("2");
    expect(screen.getByRole("button", { name: "Review backend quote" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Discard outdated mode changes" }));
    expect(screen.queryByText(/The approved estimate or main line changed while a mode draft was open/)).not.toBeInTheDocument();
  });

  it("retains the mode input and quote gate when a live calculation fails", async () => {
    server.use(http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-previews", () =>
      HttpResponse.json({ error: { code: "MODE_PREVIEW_UNAVAILABLE", message: "Calculation service unavailable." } }, { status: 503 })));
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await openEstimateLine(user, "Kitchen cabinetry");
    const kitchenLine = within(screen.getByText("Kitchen cabinetry", { selector: ".purchase-orders__estimate-line > summary > span" }).closest("details")!);
    await user.clear(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" }));
    await user.type(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" }), "2.5");
    const draftPreview = await kitchenLine.findByLabelText("Unsaved calculation preview for Kitchen cabinetry");
    expect(await within(draftPreview).findByText("Calculation service unavailable.")).toBeVisible();
    expect(kitchenLine.getByRole("textbox", { name: "Calculation quantity (sq ft)" })).toHaveValue("2.5");
    expect(screen.getByRole("button", { name: "Review backend quote" })).toBeDisabled();
  });

  it("keeps two main-line drafts and previews independent when one is discarded", async () => {
    const previews: PreviewPurchaseOrderModeInput[] = [];
    server.use(http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-previews", async ({ request }) => {
      const input = await request.json() as PreviewPurchaseOrderModeInput;
      previews.push(input);
      return HttpResponse.json({ data: modePreviewData(input) });
    }));
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await openEstimateLine(user, "Kitchen cabinetry");
    await openEstimateLine(user, "Living room lights");
    const kitchen = within(screen.getByText("Kitchen cabinetry", { selector: ".purchase-orders__estimate-line > summary > span" }).closest("details")!);
    const living = within(screen.getByText("Living room lights", { selector: ".purchase-orders__estimate-line > summary > span" }).closest("details")!);
    await user.clear(kitchen.getByRole("textbox", { name: "Calculation quantity (sq ft)" }));
    await user.type(kitchen.getByRole("textbox", { name: "Calculation quantity (sq ft)" }), "2.5");
    await user.clear(living.getByRole("textbox", { name: "Calculation quantity (unit)" }));
    await user.type(living.getByRole("textbox", { name: "Calculation quantity (unit)" }), "4");
    await waitFor(() => expect(previews.map((preview) => preview.sourceLineItemKey)).toEqual(expect.arrayContaining(["line-one", "line-two"])));
    expect(kitchen.getByLabelText("Unsaved calculation preview for Kitchen cabinetry")).toBeVisible();
    expect(living.getByLabelText("Unsaved calculation preview for Living room lights")).toBeVisible();
    expect(kitchen.getByRole("textbox", { name: "Calculation quantity (sq ft)" })).toHaveValue("2.5");
    expect(living.getByRole("textbox", { name: "Calculation quantity (unit)" })).toHaveValue("4");
    await user.click(kitchen.getByRole("button", { name: "Discard changes" }));
    expect(kitchen.getByRole("textbox", { name: "Calculation quantity (sq ft)" })).toHaveValue("2");
    expect(kitchen.queryByLabelText("Unsaved calculation preview for Kitchen cabinetry")).not.toBeInTheDocument();
    expect(living.getByRole("textbox", { name: "Calculation quantity (unit)" })).toHaveValue("4");
    expect(living.getByLabelText("Unsaved calculation preview for Living room lights")).toBeVisible();
    expect(screen.getByRole("button", { name: "Review backend quote" })).toBeDisabled();
  });

  it("requires a commercial reason when the agreed rate differs from the saved vendor reference", async () => {
    const quotes: Array<Record<string, unknown>> = [];
    const mismatchedLine = { ...preparation.estimateLines[0], mode: { ...preparation.estimateLines[0].mode,
      priceReferences: { "item-one": { ...preparation.estimateLines[0].mode.priceReferences["item-one"], unitPricePaise: 240000 } } } };
    const changed = { ...preparation, digest: "d".repeat(64), estimateLines: [mismatchedLine, preparation.estimateLines[1]] };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: changed })),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-requests/quote", async ({ request }) => {
        quotes.push(await request.json() as Record<string, unknown>);
        return HttpResponse.json({ data: { projectId: "project-one", preparationDigest: changed.digest,
          totals: { netPaise: 740000, gstPaise: 102000, totalPaise: 842000 }, modeSnapshots: [], sectionTotals: [], vendorTotals: [],
          lines: [{ procurementItemId: "item-one", itemName: "Kitchen cabinetry", vendorName: "Oak Works", gstBasisPoints: 1800, netPaise: 500000, gstPaise: 90000, totalPaise: 590000 },
            { procurementItemId: "item-two", itemName: "Living room lights", vendorName: "Bright Works", gstBasisPoints: 500, netPaise: 240000, gstPaise: 12000, totalPaise: 252000 }] } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await screen.findByText("Estimate items and modes");
    await openEstimateLine(user, "Kitchen cabinetry");
    await openEstimateLine(user, "Living room lights");
    await user.type(screen.getByRole("textbox", { name: "GST for Kitchen cabinetry (%)" }), "18");
    await user.type(screen.getByRole("textbox", { name: "GST for Living room lights (%)" }), "5");
    await user.type(screen.getByRole("textbox", { name: "Oak Works" }), "Vendor confirmation required");
    await user.type(screen.getByRole("textbox", { name: "Bright Works" }), "Vendor confirmation required");
    const reason = screen.getByRole("textbox", { name: "Commercial exception reason for Kitchen cabinetry (required)" });
    expect(reason).toBeVisible();
    expect(screen.getByRole("button", { name: "Review backend quote" })).toBeDisabled();
    await user.type(reason, "Agreed rate approved by supplier");
    await user.click(screen.getByRole("button", { name: "Review backend quote" }));
    await waitFor(() => expect(quotes).toHaveLength(1));
    expect((quotes[0].lines as Array<Record<string, unknown>>)[0]).toMatchObject({ procurementItemId: "item-one",
      commercialExceptionReason: "Agreed rate approved by supplier" });
    expect((quotes[0].lines as Array<Record<string, unknown>>)[1]).not.toHaveProperty("commercialExceptionReason");
  });

  it("requires a child commercial reason for a saved legacy mode exception", async () => {
    const quotes: Array<Record<string, unknown>> = [];
    const legacyLine = { ...preparation.estimateLines[1], source: "legacy", mainBasketId: null, mainBasketName: null,
      subBasketId: null, subBasketName: null, mainLineId: null,
      mode: { state: "exception", options: [], decision: { ...preparation.estimateLines[1].mode.decision,
        mode: null, quantity: null, exceptionReason: "Historical scope approved without saved configuration",
        revisionId: null, revisionDigest: null }, preview: null, issues: [], revision: null, uom: null, priceReferences: {} } };
    const legacyPreparation = { ...preparation, digest: "e".repeat(64), estimateLines: [preparation.estimateLines[0], legacyLine] };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: legacyPreparation })),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-requests/quote", async ({ request }) => {
        quotes.push(await request.json() as Record<string, unknown>);
        return HttpResponse.json({ data: { projectId: "project-one", preparationDigest: legacyPreparation.digest,
          totals: { netPaise: 740000, gstPaise: 102000, totalPaise: 842000 }, modeSnapshots: [], sectionTotals: [], vendorTotals: [],
          lines: [{ procurementItemId: "item-one", itemName: "Kitchen cabinetry", vendorName: "Oak Works", gstBasisPoints: 1800, netPaise: 500000, gstPaise: 90000, totalPaise: 590000 },
            { procurementItemId: "item-two", itemName: "Living room lights", vendorName: "Bright Works", gstBasisPoints: 500, netPaise: 240000, gstPaise: 12000, totalPaise: 252000 }] } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await screen.findByText("Estimate items and modes");
    await openEstimateLine(user, "Kitchen cabinetry");
    await openEstimateLine(user, "Living room lights");
    expect(screen.getByText("Manual exception", { selector: ".purchase-orders__mode-heading span" })).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "GST for Kitchen cabinetry (%)" }), "18");
    await user.type(screen.getByRole("textbox", { name: "GST for Living room lights (%)" }), "5");
    await user.type(screen.getByRole("textbox", { name: "Oak Works" }), "Vendor confirmation required");
    await user.type(screen.getByRole("textbox", { name: "Bright Works" }), "Vendor confirmation required");
    const reason = screen.getByRole("textbox", { name: "Commercial exception reason for Living room lights (required)" });
    expect(reason).toBeVisible();
    expect(screen.getByRole("button", { name: "Review backend quote" })).toBeDisabled();
    await user.type(reason, "Historical supplier rate agreed separately");
    await user.click(screen.getByRole("button", { name: "Review backend quote" }));
    await waitFor(() => expect(quotes).toHaveLength(1));
    expect((quotes[0].lines as Array<Record<string, unknown>>)[1]).toMatchObject({ procurementItemId: "item-two",
      commercialExceptionReason: "Historical supplier rate agreed separately" });
  });

  it("shows an incomplete amount and row-specific blocker without inventing a total", async () => {
    server.use(http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: {
      ...preparation, netPaise: null, readyItemCount: 1,
      sections: [preparation.sections[0], { ...preparation.sections[1], netPaise: null, items: [
        { ...preparation.sections[1].items[0], plannedOrderQuantityMilliUnits: null, plannedLineNetPaise: null,
          blockers: [{ code: "QUANTITY_MISSING", itemId: "item-two", message: "Enter the planned order quantity." }] }
      ] }],
      blockers: [{ code: "QUANTITY_MISSING", itemId: "item-two", message: "Enter the planned order quantity." }]
    } })));
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send purchase order to Super Admin" })).toBeDisabled());
    await waitFor(() => expect(screen.getByText("Prepared vendor net, before GST").nextElementSibling).toHaveTextContent("Incomplete"));
    expect(screen.getByText(/Living room lights: Enter the planned order quantity/)).toBeVisible();
  });

  it("shows backend allocation blockers without inventing tax-inclusive amounts", async () => {
    const kitchen = { ...preparation.sections[0].items[0], allocatedWorkPaise: 400000,
      blockers: [{ code: "ALLOCATION_INSUFFICIENT", itemId: "item-one", message: "The planned amount before GST exceeds this item's recorded vendor allocation." }] };
    const living = { ...preparation.sections[1].items[0], allocatedWorkPaise: 200000,
      blockers: [{ code: "ALLOCATION_INSUFFICIENT", itemId: "item-two", message: "The planned amount before GST exceeds this item's recorded vendor allocation." }] };
    server.use(http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: {
      ...preparation, sections: [{ ...preparation.sections[0], items: [kitchen] }, { ...preparation.sections[1], items: [living] }],
      blockers: [...kitchen.blockers, ...living.blockers]
    } })));
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    expect(await screen.findByText(/Kitchen cabinetry: The planned amount before GST exceeds/)).toBeVisible();
    expect(screen.getByText(/Living room lights: The planned amount before GST exceeds/)).toBeVisible();
    expect(screen.queryByText(/GST \(18%\)/)).not.toBeInTheDocument();
    expect(screen.getByText("Quoted GST").nextElementSibling).toHaveTextContent("Review quote");
    expect(screen.getByRole("button", { name: "Send purchase order to Super Admin" })).toBeDisabled();
  });

  it("blocks order entry when request history is unavailable or a grouped request is active", async () => {
    server.use(http.get("/api/v1/procurement/projects/project-one/purchase-order-requests", () =>
      HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Try again" } }, { status: 503 })));
    const view = renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    expect(await screen.findByRole("button", { name: "Retry request history" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send purchase order to Super Admin" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New purchase order" })).toBeDisabled();
    view.unmount();
    server.use(http.get("/api/v1/procurement/projects/project-one/purchase-order-requests", () =>
      HttpResponse.json({ data: { items: [{ id: "request-active", status: "pending_approval", projectId: "project-one",
        projectName: "Aurora Villa", requestNumber: "POR-20261001-ABCD1234", version: 1, revision: 1,
        totals: { netPaise: 740000, gstPaise: 0, totalPaise: 740000 }, sectionTotals: [], vendorTotals: [], decisions: [], revisions: [] }],
        total: 1, limit: 50, offset: 0 } })));
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    expect(await screen.findByText("Resolve the project request before creating an individual order.")).toBeVisible();
    expect(screen.getByRole("button", { name: "New purchase order" })).toBeDisabled();
  });

  it("creates a draft from the assigned item with exact paise, GST and stable source ID", async () => {
    const writes: unknown[] = [];
    let orders: PurchaseOrder[] = [];
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-orders", () => HttpResponse.json({ data: { items: orders, total: orders.length, limit: 50, offset: 0 } })),
      http.post("/api/v1/procurement/projects/project-one/purchase-orders", async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        writes.push(body);
        const lines = body.lines as Array<Record<string, unknown>>;
        const saved: PurchaseOrder = {
          id: "po-one", orderNumber: "PO-ONE", projectId: "project-one", vendor: { id: "vendor-one", code: "VEN-1", name: "Oak Works" },
          status: "draft", version: 1, revision: 0, estimateSource: { estimateId: "estimate-one", estimateVersion: 2, estimateReviewRoundId: "review-one" },
          terms: String(body.terms), draftLines: [{ ...lines[0], id: "po-line-one", procurementItemVersion: 1, netPaise: 500000, gstPaise: 90000, totalPaise: 590000 } as PurchaseOrder["draftLines"][number]],
          draftTotals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 }, submittedRevisionId: null, approvedRevisionId: null,
          approvedNetPaise: null, approvedGstPaise: null, approvedTotalPaise: null, decisions: [], revisions: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z"
        };
        orders = [saved];
        return HttpResponse.json({ data: saved }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await screen.findByText("No purchase orders yet. Assign active vendors to procurement items, then create the first order.");
    await user.click(screen.getByRole("button", { name: "New purchase order" }));
    const form = await screen.findByRole("form", { name: "New purchase order draft" });
    await waitFor(() => expect(within(form).getByRole("combobox", { name: "Vendor" })).toBeEnabled());
    expect(within(form).queryByRole("option", { name: "Pending Works" })).not.toBeInTheDocument();
    await user.selectOptions(within(form).getByRole("combobox", { name: "Vendor" }), "vendor-one");
    await user.type(within(form).getByRole("textbox", { name: "Terms" }), "Delivery within 30 days");
    await user.click(within(form).getByRole("checkbox", { name: /Kitchen cabinetry/ }));
    await user.type(within(form).getByRole("textbox", { name: "Quantity (sq ft)" }), "2");
    expect(within(form).getByRole("textbox", { name: "GST (%)" })).toHaveValue("18");
    fireEvent.change(within(form).getByLabelText(/Target date/), { target: { value: "2026-11-01" } });
    await user.type(within(form).getByRole("textbox", { name: "Delivery location" }), "Aurora Villa site");
    await user.click(within(form).getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      vendorId: "vendor-one", terms: "Delivery within 30 days", idempotencyKey: "key-12345678",
      lines: [{ procurementItemId: "item-one", quantityMilliUnits: 2000, unitPricePaise: 250000, gstBasisPoints: 1800,
        scopeType: "supply", description: "Kitchen cabinetry", targetDate: "2026-11-01", deliveryLocation: "Aurora Villa site" }]
    });
    expect(await screen.findByText("Draft purchase order saved. Review it, then submit for approval.")).toBeVisible();
  });

  it("keeps submission separate from an unsaved edit", async () => {
    const saved: PurchaseOrder = {
      id: "po-one", orderNumber: "PO-ONE", projectId: "project-one", vendor: { id: "vendor-one", code: "VEN-1", name: "Oak Works" }, status: "draft", version: 2, revision: 0,
      estimateSource: { estimateId: "estimate-one", estimateVersion: 2, estimateReviewRoundId: "review-one" }, terms: "Original terms",
      draftLines: [{ id: "line-one", procurementItemId: "item-one", procurementItemVersion: 1, quantityMilliUnits: 1000, unitPricePaise: 250000, gstBasisPoints: 0, scopeType: "supply", description: "Kitchen cabinetry", targetDate: "2026-11-01", deliveryLocation: "Site", netPaise: 250000, gstPaise: 0, totalPaise: 250000 }],
      draftTotals: { netPaise: 250000, gstPaise: 0, totalPaise: 250000 }, submittedRevisionId: null, approvedRevisionId: null, approvedNetPaise: null, approvedGstPaise: null, approvedTotalPaise: null,
      decisions: [], revisions: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z"
    };
    const submit = vi.fn();
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-orders", () => HttpResponse.json({ data: { items: [saved], total: 1, limit: 50, offset: 0 } })),
      http.post("/api/v1/procurement/projects/project-one/purchase-orders/po-one/submit", submit)
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await user.click(await screen.findByRole("button", { name: /PO-ONE/ }));
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
    const form = await screen.findByRole("form", { name: "Edit purchase order draft" });
    const terms = within(form).getByRole("textbox", { name: "Terms" });
    await user.type(terms, " revised");
    expect(screen.getByRole("button", { name: "Submit to Super Admin" })).toBeDisabled();
    expect(screen.getByText("Save the draft before submitting.")).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
  });

  it("adds a purchase item under the exact approved line and restores focus", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    const writes: Record<string, unknown>[] = [];
    server.use(
      http.get("/api/v1/procurement/uoms", () => HttpResponse.json({ data: [{ id: "uom-one", code: "sq ft", name: "Square feet", decimalScale: 2 }] })),
      http.post("/api/v1/procurement/projects/project-one/items", async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        writes.push(body);
        return HttpResponse.json({ data: { ...item, ...body, id: "item-new", version: 1,
          estimateSource: { estimateId: body.estimateId, estimateVersion: body.estimateVersion,
            sourceLineItemKey: body.sourceLineItemKey, estimateReviewRoundId: "review-one", sourceSectionId: "KIT" } } }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await openEstimateLine(user, "Kitchen cabinetry");
    const add = screen.getByRole("button", { name: /Add purchase item under Kitchen/ });
    await user.click(add);
    const dialog = await screen.findByRole("dialog", { name: "Add procurement item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Item name" }), "Cabinet hinges");
    await user.type(within(dialog).getByRole("textbox", { name: "Brand" }), "Oak Works");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "UOM" }), "uom-one");
    await user.type(within(dialog).getByRole("textbox", { name: "Price (INR)" }), "120.05");
    await user.type(within(dialog).getByRole("textbox", { name: /Planned order quantity/ }), "2.5");
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ estimateId: "estimate-one", estimateVersion: 2, sourceLineItemKey: "line-one",
      itemName: "Cabinet hinges", brand: "Oak Works", pricePaise: 12005, plannedOrderQuantityMilliUnits: 2500 });
    expect(await screen.findByText("Cabinet hinges added in this project.")).toBeVisible();
    expect(add).toHaveFocus();
  });

  it("fetches a project-scoped child before edit and blocks a changed source", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    const get = vi.fn(() => HttpResponse.json({ data: { ...item, estimateSource: { ...item.estimateSource, sourceLineItemKey: "other-line" } } }));
    server.use(http.get("/api/v1/procurement/projects/project-one/items/item-one", get));
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await openEstimateLine(user, "Kitchen cabinetry");
    await user.click(screen.getByRole("button", { name: /Edit Kitchen cabinetry under Kitchen/ }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/This item is linked to a different estimate item/)).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Edit procurement item" })).not.toBeInTheDocument();
  });

  it("removes with a reason and the displayed version, retaining a conflict for review", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    const writes: Record<string, unknown>[] = [];
    server.use(http.delete("/api/v1/procurement/projects/project-one/items/item-one", async ({ request }) => {
      writes.push(await request.json() as Record<string, unknown>);
      return HttpResponse.json({ error: { code: "PROCUREMENT_ITEM_VERSION_CONFLICT", message: "Someone updated this item." } }, { status: 409 });
    }));
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await openEstimateLine(user, "Kitchen cabinetry");
    await user.click(screen.getByRole("button", { name: /Remove Kitchen cabinetry under Kitchen/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Kitchen cabinetry?" });
    const confirm = within(dialog).getByRole("button", { name: "Remove item" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Supplier scope changed");
    await user.click(confirm);
    await waitFor(() => expect(writes).toEqual([{ expectedVersion: 1, reason: "Supplier scope changed" }]));
    expect(await within(dialog).findByText("Someone updated this item.")).toBeVisible();
    expect(confirm).toBeDisabled();
  });

  it("does not open removal confirmation when a fresh item read has a newer version", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    const remove = vi.fn();
    server.use(
      http.get("/api/v1/procurement/projects/project-one/items/item-one", () => HttpResponse.json({ data: { ...item, version: 2 } })),
      http.delete("/api/v1/procurement/projects/project-one/items/item-one", remove)
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await openEstimateLine(user, "Kitchen cabinetry");
    await user.click(screen.getByRole("button", { name: /Remove Kitchen cabinetry under Kitchen/ }));
    expect(await screen.findByText(/This item changed since it was displayed/)).toBeVisible();
    expect(screen.queryByRole("alertdialog", { name: /Remove Kitchen cabinetry/ })).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
  });

  it("shows older-version recovery items without direct reassignment and permits same-round review", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    const old = { ...item, id: "item-old", itemName: "Historical panel", estimateSource: { ...item.estimateSource!, estimateVersion: 1 } };
    const recoverable = { ...item, id: "item-recover", itemName: "Old allowance", estimateSource: { ...item.estimateSource!, sourceLineItemKey: "zero-line" } };
    const excluded = { ...item, id: "item-excluded", itemName: "Excluded allowance", estimateSource: { ...item.estimateSource!, sourceLineItemKey: "excluded-line" } };
    const zeroLine = { ...preparation.estimateLines[0], key: "zero-line", mainLineName: "Old allowance", amountPaise: 0, itemIds: [] };
    const excludedLine = { ...zeroLine, key: "excluded-line", mainLineName: "Excluded allowance", included: false };
    const current = { ...preparation, estimateLines: [...preparation.estimateLines, zeroLine, excludedLine] };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: current })),
      http.get("/api/v1/procurement/projects/project-one/items", ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json({ data: { items: url.searchParams.get("unassigned") === "true" ? [old, recoverable, excluded] : [item],
          total: url.searchParams.get("unassigned") === "true" ? 3 : 1, limit: 20, offset: 0 } });
      }),
      http.get("/api/v1/procurement/projects/project-one/items/item-recover", () => HttpResponse.json({ data: recoverable })),
      http.get("/api/v1/procurement/uoms", () => HttpResponse.json({ data: [{ id: "uom-one", code: "sq ft", name: "Square feet", decimalScale: 2 }] }))
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await user.click(await screen.findByText("Items needing assignment review"));
    expect(await screen.findByText("Historical panel")).toBeVisible();
    expect(screen.getByText("Excluded allowance", { selector: ".purchase-order-recovery__items strong" })).toBeVisible();
    expect(screen.getAllByText(/Direct reassignment is unavailable/)).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Review assignment" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Review assignment" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit procurement item" });
    expect(within(dialog).getByRole("combobox", { name: "Estimate item" })).toBeVisible();
  });

  it("pauses item and vendor writes when the project estimate is stale", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" projectSourceStale
      currentEstimate={{ estimateId: "estimate-one", estimateVersion: 2 }} />);
    expect(await screen.findByText(/Purchase details are hidden and changes are paused/)).toBeVisible();
    expect(screen.queryByText("Estimate items and modes")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New purchase order" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review backend quote" })).not.toBeInTheDocument();
  });

  it("retains an open item draft while hiding cached purchase data after a project becomes stale", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    server.use(http.get("/api/v1/procurement/uoms", () => HttpResponse.json({ data: [
      { id: "uom-one", code: "sq ft", name: "Square feet", decimalScale: 2 }
    ] })));
    let setStale!: (next: boolean) => void;
    function Host() {
      const [stale, update] = useState(false);
      setStale = update;
      return <PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" projectSourceStale={stale}
        currentEstimate={{ estimateId: "estimate-one", estimateVersion: 2 }} />;
    }
    const user = userEvent.setup();
    renderWithQuery(<Host />);
    await openEstimateLine(user, "Kitchen cabinetry");
    await user.click(screen.getByRole("button", { name: /Add purchase item under Kitchen/ }));
    const draft = await screen.findByRole("dialog", { name: "Add procurement item" });
    await user.type(within(draft).getByRole("textbox", { name: "Item name" }), "Saved draft details");
    act(() => setStale(true));
    expect(within(draft).getByRole("textbox", { name: "Item name" })).toHaveValue("Saved draft details");
    expect(within(draft).getByRole("button", { name: "Add item" })).toBeDisabled();
    expect(screen.queryByText("Estimate items and modes")).not.toBeInTheDocument();
    expect(screen.queryByText("Individual orders and amendments")).not.toBeInTheDocument();
    act(() => setStale(false));
    expect(within(draft).getByRole("textbox", { name: "Item name" })).toHaveValue("Saved draft details");
  });

  it("retains an open vendor-order draft while hiding order history after a project becomes stale", async () => {
    let setStale!: (next: boolean) => void;
    function Host() {
      const [stale, update] = useState(false);
      setStale = update;
      return <PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" projectSourceStale={stale}
        currentEstimate={{ estimateId: "estimate-one", estimateVersion: 2 }} />;
    }
    const user = userEvent.setup();
    renderWithQuery(<Host />);
    await screen.findByText("No purchase orders yet. Assign active vendors to procurement items, then create the first order.");
    await user.click(screen.getByRole("button", { name: "New purchase order" }));
    const draft = await screen.findByRole("form", { name: "New purchase order draft" });
    await user.type(within(draft).getByRole("textbox", { name: "Terms" }), "Stored vendor draft");
    act(() => setStale(true));
    expect(within(draft).getByRole("textbox", { name: "Terms" })).toHaveValue("Stored vendor draft");
    expect(within(draft).getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.queryByText("No purchase orders yet. Assign active vendors to procurement items, then create the first order.")).not.toBeInTheDocument();
    act(() => setStale(false));
    expect(within(draft).getByRole("textbox", { name: "Terms" })).toHaveValue("Stored vendor draft");
  });

  it("offers reasoned removal of an older-version child when preparation fails with a source conflict", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    const stale = { ...item, id: "item-old", itemName: "Historical panel", version: 4,
      estimateSource: { ...item.estimateSource!, estimateVersion: 1 } };
    let conflicted = true;
    const deletes: Record<string, unknown>[] = [];
    const reads = vi.fn(() => HttpResponse.json({ data: stale }));
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => conflicted
        ? HttpResponse.json({ error: { code: "PROCUREMENT_ITEM_SOURCE_CONFLICT", message: "An item belongs to an older approved estimate." } }, { status: 409 })
        : HttpResponse.json({ data: preparation })),
      http.get("/api/v1/procurement/projects/project-one/items", ({ request }) => {
        const unassigned = new URL(request.url).searchParams.get("unassigned") === "true";
        return HttpResponse.json({ data: { items: unassigned && conflicted ? [stale] : [item], total: 1, limit: 20, offset: 0 } });
      }),
      http.get("/api/v1/procurement/projects/project-one/items/item-old", reads),
      http.delete("/api/v1/procurement/projects/project-one/items/item-old", async ({ request }) => {
        deletes.push(await request.json() as Record<string, unknown>);
        conflicted = false;
        return HttpResponse.json({ data: { id: stale.id, projectId: stale.projectId, version: 5, removedAt: "2026-10-04T00:00:00Z" } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa"
      currentEstimate={{ estimateId: "estimate-one", estimateVersion: 2 }} />);
    expect(await screen.findByText("An item belongs to an older approved estimate.")).toBeVisible();
    expect(screen.queryByText("Estimate items and modes")).not.toBeInTheDocument();
    await user.click(screen.getByText("Items needing assignment review"));
    expect(await screen.findByText("Historical panel")).toBeVisible();
    expect(screen.getByText(/Linked to older approved estimate version 1/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Review assignment" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove item" }));
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Historical panel?" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Recreate under approved estimate version two");
    await user.click(within(dialog).getByRole("button", { name: "Remove item" }));
    await waitFor(() => expect(deletes).toEqual([{ expectedVersion: 4, reason: "Recreate under approved estimate version two" }]));
    expect(await screen.findByText("Estimate items and modes")).toBeVisible();
  });

  it("recovers after an in-session approval advance even when the failed preparation query retains old data", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    const old = { ...item, id: "item-old", itemName: "Old version timber", version: 4,
      estimateSource: { ...item.estimateSource!, estimateVersion: 1 } };
    const first = { ...preparation, estimateSource: { ...preparation.estimateSource, estimateVersion: 1 } };
    const current = { ...preparation, estimateSource: { ...preparation.estimateSource, estimateVersion: 2 },
      estimateLines: [{ ...preparation.estimateLines[0], itemIds: [] }, preparation.estimateLines[1]],
      sections: [{ ...preparation.sections[0], items: [] }, preparation.sections[1]] };
    let conflicted = false;
    let advance!: () => void;
    let refetchPreparation!: () => Promise<unknown>;
    const deletes: Record<string, unknown>[] = [];
    function Host() {
      const queryClient = useQueryClient();
      const [version, setVersion] = useState(1);
      advance = () => setVersion(2);
      refetchPreparation = () => queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.preparation("project-one") });
      return <PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa"
        currentEstimate={{ estimateId: "estimate-one", estimateVersion: version }} />;
    }
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => conflicted
        ? HttpResponse.json({ error: { code: "PROCUREMENT_ITEM_SOURCE_CONFLICT", message: "An old purchase item blocks preparation." } }, { status: 409 })
        : HttpResponse.json({ data: deletes.length ? current : first })),
      http.get("/api/v1/procurement/projects/project-one/items", ({ request }) => {
        const unassigned = new URL(request.url).searchParams.get("unassigned") === "true";
        return HttpResponse.json({ data: { items: unassigned && !deletes.length ? [old] : [item], total: 1, limit: 20, offset: 0 } });
      }),
      http.get("/api/v1/procurement/projects/project-one/items/item-old", () => HttpResponse.json({ data: old })),
      http.delete("/api/v1/procurement/projects/project-one/items/item-old", async ({ request }) => {
        deletes.push(await request.json() as Record<string, unknown>);
        conflicted = false;
        return HttpResponse.json({ data: { id: old.id, projectId: old.projectId, version: 5, removedAt: "2026-10-04T00:00:00Z" } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<Host />);
    expect(await screen.findByText("Estimate items and modes")).toBeVisible();
    await act(async () => { conflicted = true; advance(); await refetchPreparation(); });
    expect(await screen.findByText("An old purchase item blocks preparation.")).toBeVisible();
    expect(screen.queryByText("Estimate items and modes")).not.toBeInTheDocument();
    expect(screen.queryByText("Approved estimate, before GST")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send purchase order to Super Admin" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Items needing assignment review"));
    expect(await screen.findByText("Old version timber")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove item" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Old version timber?" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Recreate from the current approved estimate");
    await user.click(within(dialog).getByRole("button", { name: "Remove item" }));
    await waitFor(() => expect(deletes).toEqual([{ expectedVersion: 4, reason: "Recreate from the current approved estimate" }]));
    expect(await screen.findByText("Estimate items and modes")).toBeVisible();
  });

  it("keeps unrelated Add available during a pending request and defers referenced removal to the backend guard", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    const pending = { id: "request-pending", status: "pending_approval", projectId: "project-one",
      projectName: "Aurora Villa", requestNumber: "POR-ONE", version: 1, revision: 1,
      totals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 },
      sectionTotals: [], vendorTotals: [], decisions: [], revisions: [],
      lines: [{ procurementItemId: "item-one" }] };
    const remove = vi.fn(() => HttpResponse.json({ error: { code: "PROCUREMENT_ITEM_REQUEST_REFERENCED",
      message: "This item is in a pending purchase request." } }, { status: 409 }));
    server.use(
      http.get("/api/v1/procurement/projects/project-one/purchase-order-requests", () => HttpResponse.json({ data: { items: [pending], total: 1, limit: 50, offset: 0 } })),
      http.delete("/api/v1/procurement/projects/project-one/items/item-one", remove)
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await openEstimateLine(user, "Kitchen cabinetry");
    await openEstimateLine(user, "Living room lights");
    expect(screen.getByRole("button", { name: /Add purchase item under Living/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Remove Kitchen cabinetry under Kitchen/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Kitchen cabinetry?" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Duplicate supplier scope");
    await user.click(within(dialog).getByRole("button", { name: "Remove item" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByText("This item is in a pending purchase request.")).toBeVisible();
  });

  it("clears the backend quote after a successful item removal", async () => {
    permissions.push("procurement.items.read", "procurement.items.manage");
    server.use(
      http.post("/api/v1/procurement/projects/project-one/purchase-order-requests/quote", () => HttpResponse.json({ data: {
        projectId: "project-one", preparationDigest: preparation.digest,
        lines: [
          { procurementItemId: "item-one", gstBasisPoints: 1800, itemName: "Kitchen cabinetry", vendorName: "Oak Works", netPaise: 500000, gstPaise: 90000, totalPaise: 590000 },
          { procurementItemId: "item-two", gstBasisPoints: 500, itemName: "Living room lights", vendorName: "Bright Works", netPaise: 240000, gstPaise: 12000, totalPaise: 252000 }
        ],
        totals: { netPaise: 740000, gstPaise: 102000, totalPaise: 842000 }, vendorTotals: []
      } })),
      http.delete("/api/v1/procurement/projects/project-one/items/item-one", () => HttpResponse.json({ data: {
        id: "item-one", projectId: "project-one", version: 2, removedAt: "2026-10-04T00:00:00Z"
      } }))
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await openEstimateLine(user, "Kitchen cabinetry");
    await openEstimateLine(user, "Living room lights");
    await user.type(screen.getByRole("textbox", { name: "GST for Kitchen cabinetry (%)" }), "18");
    await user.type(screen.getByRole("textbox", { name: "GST for Living room lights (%)" }), "5");
    await user.type(screen.getByRole("textbox", { name: "Oak Works" }), "Vendor confirmation required");
    await user.type(screen.getByRole("textbox", { name: "Bright Works" }), "Vendor confirmation required");
    await user.click(screen.getByRole("button", { name: "Review backend quote" }));
    expect(await screen.findByText("Vendor payable quote")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Remove Kitchen cabinetry under Kitchen/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Kitchen cabinetry?" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Supplier scope removed");
    await user.click(within(dialog).getByRole("button", { name: "Remove item" }));
    expect(await screen.findByText("Kitchen cabinetry removed from active procurement items.")).toBeVisible();
    expect(screen.queryByText("Vendor payable quote")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send purchase order to Super Admin" })).toBeDisabled();
  });
});
