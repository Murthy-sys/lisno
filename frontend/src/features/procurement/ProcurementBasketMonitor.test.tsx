import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProcurementBasketMonitor } from "./ProcurementBasketMonitor";
import type { BasketEnquiry, BasketPackageMonitor } from "./procurementBasketApi";

const enquiry: BasketEnquiry = { id: "enquiry-one", projectId: "project-one", mainBasketId: "basket-one", version: 8,
  status: "issued", estimateSource: { estimateId: "estimate-one", estimateVersion: 2, estimateReviewRoundId: null },
  preparationDigest: "a".repeat(64), vendorScopeCurrent: true, boqRevisionId: "boq-one", boqRevision: 1, boqDigest: "b".repeat(64),
  lines: [], invitations: [], bidCount: 1, awardId: "award-one" };
const monitor: BasketPackageMonitor = {
  award: { id: "award-one", status: "issued", vendorId: "vendor-one" },
  order: { id: "order-one", orderNumber: "WO-24", status: "approved", revision: 1, terms: "Use the approved primer system.",
    vendor: { name: "Sharma Interiors" }, lines: [{ id: "line-one", description: "Primer coat", quantityMilliUnits: 2000,
      uomCode: "sq-ft", unitPricePaise: 25000, gstBasisPoints: 1800, netPaise: 50000, gstPaise: 9000,
      totalPaise: 59000, targetDate: "2026-11-30", deliveryLocation: "Aurora Villa site" }],
    totals: { netPaise: 50000, gstPaise: 9000, totalPaise: 59000 } },
  boqLines: [{ id: "boq-line-one", description: "Primer coat", roomName: "Living Room", quantityMilliUnits: 2000, uomCode: "sq-ft" }],
  site: { status: "awaiting_vendor", progressPercent: 0, tasks: [{ id: "task-one", label: "Complete primer coat", status: "awaiting_vendor",
    progressPercent: 0, evidenceCount: 0, reviewOwnerName: "Vendor" }] },
  finance: { assessmentStatus: "pending", invoiceTotalPaise: null, tdsPaise: null, netPayablePaise: null,
    recordedCostPaise: null, paidPaise: null, gstRegistration: { registered: null, gstin: null },
    paymentSchedule: [{ id: "advance", name: "Advance", basisPoints: 2000, amountPaise: 11800 }] },
  vendorAlerts: [{ id: "finance-assessment", message: "Invoice and withholding review is pending.",
    ownerName: "Finance", createdAt: "2026-10-05T00:00:00Z", severity: "info" }]
};

describe("issued basket package monitor", () => {
  it("shows frozen order details and honest pending finance states across keyboard accessible tabs", async () => {
    const comparisonLookup = vi.fn();
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/comparison", () => { comparisonLookup(); return HttpResponse.json({ error: "Preparation changed" }, { status: 409 }); }),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/awards/award-one/monitor", () => HttpResponse.json({ data: monitor })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/awards/award-one/share-intent", () => HttpResponse.json({ data: {
        available: false, shareUrl: null, blocker: "A vendor phone number is required." } }))
    );
    const user = userEvent.setup();
    const view = renderWithQuery(<ProcurementBasketMonitor projectId="project-one" basketId="basket-one" enquiry={enquiry} />);
    expect(await screen.findByRole("heading", { name: "Sharma Interiors · WO-24" })).toBeVisible();
    expect(comparisonLookup).not.toHaveBeenCalled();
    expect(screen.getByText("Target 2026-11-30 · Delivery Aurora Villa site")).toBeVisible();
    expect(screen.getByText("Use the approved primer system.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Prepare WhatsApp work order" }));
    expect(await screen.findByText("A vendor phone number is required.")).toBeVisible();
    const tabs = screen.getByRole("tablist", { name: "Package monitor" });
    within(tabs).getByRole("tab", { name: "Order" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(tabs).getByRole("tab", { name: "Site performance" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Complete primer coat")).toBeVisible();
    await user.click(within(tabs).getByRole("tab", { name: "Finance" }));
    expect(screen.getByText("Approver chips not recorded")).toBeVisible();
    expect(screen.getByText(/Awaiting Finance review/u)).toBeVisible();
    expect(screen.getByText("No linked payment record")).toBeVisible();
    expect(screen.getByText(/Vendor GST registration: Not confirmed/u)).toBeVisible();
    expect(screen.queryByText("Net payable")).not.toBeInTheDocument();
    await user.click(within(tabs).getByRole("tab", { name: "Vendor alerts" }));
    expect(screen.getByText("Invoice and withholding review is pending.")).toBeVisible();
    const report = await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } });
    expect(report.violations).toEqual([]);
  });

  it("shows an explicit empty state when an issued enquiry has no award link", async () => {
    renderWithQuery(<ProcurementBasketMonitor projectId="project-one" basketId="basket-one" enquiry={{ ...enquiry, awardId: null }} />);
    expect(await screen.findByText(/issued work order is not yet linked/u)).toBeVisible();
  });

  it("omits line metadata that was never specified on the BOQ", async () => {
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/awards/award-one/monitor", () =>
      HttpResponse.json({ data: { ...monitor, order: { ...monitor.order, terms: null, lines: monitor.order.lines.map((line) => ({
        ...line, targetDate: null, deliveryLocation: null })) } } })));
    renderWithQuery(<ProcurementBasketMonitor projectId="project-one" basketId="basket-one" enquiry={enquiry} />);
    expect(await screen.findByRole("heading", { name: "Sharma Interiors · WO-24" })).toBeVisible();
    expect(screen.getByText("Primer coat")).toBeVisible();
    expect(screen.queryByText(/Target null|Delivery null/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Work order terms" })).not.toBeInTheDocument();
  });

  it("shows the saved payment approver chips as read-only on the issued order", async () => {
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/awards/award-one/monitor", () =>
      HttpResponse.json({ data: { ...monitor, finance: { ...monitor.finance, paymentSchedule: [
        { id: "advance", name: "Advance", basisPoints: 2000, amountPaise: 11800, reviewerSlots: ["procurement", "designer"] }
      ] } } })));
    const user = userEvent.setup();
    renderWithQuery(<ProcurementBasketMonitor projectId="project-one" basketId="basket-one" enquiry={enquiry} />);
    await screen.findByRole("heading", { name: "Sharma Interiors · WO-24" });
    await user.click(screen.getByRole("tab", { name: "Finance" }));
    const chips = screen.getByRole("group", { name: "Advance saved approvers" });
    expect(within(chips).getByText("Proc")).toBeVisible();
    expect(within(chips).getByText("Design")).toBeVisible();
    expect(within(chips).queryByRole("button")).not.toBeInTheDocument();
  });
});
