import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { SuperAdminPurchaseOrdersPage } from "./SuperAdminPurchaseOrdersPage";
import type { PurchaseOrder } from "./purchaseOrderApi";

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
    committedTotalPaise: 400000, remainingPaise: 500000,
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

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "key-12345678" });
  server.use(
    http.get("/api/v1/admin/purchase-order-requests/pending", () => HttpResponse.json({ data: { items: [], total: 0, limit: 50, offset: 0 } })),
    http.get("/api/v1/admin/purchase-orders/pending", () => HttpResponse.json({ data: { items: [order], total: 1, limit: 50, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-commitments", () => HttpResponse.json({ data: { approvedEstimatePaise: 900000, committedPaise: 500000, committedGstPaise: 0, committedTotalPaise: 500000, remainingPaise: 400000 } }))
  );
});

describe("Super Admin purchase order approval", () => {
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
