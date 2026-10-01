import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectProcurementItem } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { PurchaseOrdersPanel } from "./PurchaseOrdersPanel";
import type { PurchaseOrder } from "./purchaseOrderApi";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ authorization: { role: "procurement", permissions: ["procurement.purchase_orders.read", "procurement.purchase_orders.manage"] } })
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
  ]
};

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "key-12345678" });
  server.use(
    http.get("/api/v1/procurement/projects/project-one/purchase-orders", () => HttpResponse.json({ data: { items: [], total: 0, limit: 50, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-commitments", () => HttpResponse.json({ data: { approvedEstimatePaise: 1000000, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 1000000 } })),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: preparation })),
    http.get("/api/v1/procurement/projects/project-one/purchase-order-requests", () => HttpResponse.json({ data: { items: [], total: 0, limit: 50, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/items", () => HttpResponse.json({ data: { items: [item], total: 1, limit: 20, offset: 0 } })),
    http.get("/api/v1/procurement/vendors", () => HttpResponse.json({ data: { items: [{ id: "vendor-one", code: "VEN-1", name: "Oak Works", status: "active", assignable: true }, { id: "vendor-two", code: "VEN-2", name: "Pending Works", status: "under_review", assignable: false }], total: 2, limit: 20, offset: 0 } }))
  );
});

describe("purchase order drafting", () => {
  it("shows 18 percent GST and sends one complete project order without a detail card", async () => {
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
          totals: { netPaise: 740000, gstPaise: 133200, totalPaise: 873200 },
          sectionTotals: [{ sectionId: "KIT", label: "Kitchen", totals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 } },
            { sectionId: "LIV", label: "Living", totals: { netPaise: 240000, gstPaise: 43200, totalPaise: 283200 } }],
          vendorTotals: [{ vendorId: "vendor-one", name: "Oak Works", totals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 } },
            { vendorId: "vendor-two", name: "Bright Works", totals: { netPaise: 240000, gstPaise: 43200, totalPaise: 283200 } }],
          lines: [{ procurementItemId: "item-one", sourceSectionId: "KIT", itemName: "Kitchen cabinetry", vendorName: "Oak Works", netPaise: 500000, gstPaise: 90000, totalPaise: 590000 },
            { procurementItemId: "item-two", sourceSectionId: "LIV", itemName: "Living room lights", vendorName: "Bright Works", netPaise: 240000, gstPaise: 43200, totalPaise: 283200 }]
        } });
      }),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-requests", async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        writes.push(body);
        const saved = {
          id: "request-one", projectId: "project-one", projectName: "Aurora Villa", requestNumber: "POR-20261001-ABCD1234", status: "pending_approval", version: 1, revision: 1,
          submittedRevisionId: "revision-one", estimateSource: preparation.estimateSource, preparationDigest: preparation.digest,
          approvedEstimatePaise: 1000000, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 1000000,
          totals: { netPaise: 740000, gstPaise: 133200, totalPaise: 873200 },
          sectionTotals: [{ sectionId: "KIT", label: "Kitchen", totals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 } },
            { sectionId: "LIV", label: "Living", totals: { netPaise: 240000, gstPaise: 43200, totalPaise: 283200 } }],
          vendorTotals: [{ vendorId: "vendor-one", code: "VEN-1", name: "Oak Works", terms: "Vendor confirmation required", totals: { netPaise: 500000, gstPaise: 90000, totalPaise: 590000 } },
            { vendorId: "vendor-two", code: "VEN-2", name: "Bright Works", terms: "Vendor confirmation required", totals: { netPaise: 240000, gstPaise: 43200, totalPaise: 283200 } }],
          approvedOrderIds: [], decisions: [], revisions: [], createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z"
        };
        requests = [saved];
        return HttpResponse.json({ data: saved }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send purchase order to Super Admin" })).toBeEnabled());
    expect(screen.getByText("Planned amount, before GST").nextElementSibling).toHaveTextContent("7,400.00");
    expect(screen.getByText("GST (18%)").nextElementSibling).toHaveTextContent("1,332.00");
    expect(screen.getByText("Planned amount, with GST").nextElementSibling).toHaveTextContent("8,732.00");
    expect(screen.queryByRole("form", { name: "Review project purchase order request" })).not.toBeInTheDocument();
    expect((await axe.run(document.querySelector(".purchase-orders__project-request")!, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Send purchase order to Super Admin" }));
    await waitFor(() => expect(quotes).toHaveLength(1));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      expectedPreparationDigest: preparation.digest, idempotencyKey: "key-12345678",
      lines: [
        { procurementItemId: "item-one", expectedVersion: 1, gstBasisPoints: 1800, scopeType: "execution",
          description: "Kitchen cabinetry", targetDate: "2026-11-30", deliveryLocation: "Aurora Villa site" },
        { procurementItemId: "item-two", expectedVersion: 3, gstBasisPoints: 1800, scopeType: "supply",
          description: "Living room lights", targetDate: "2026-11-30", deliveryLocation: "Aurora Villa site" }
      ],
      vendorTerms: [{ vendorId: "vendor-one", terms: expect.stringContaining("Vendor confirmation") }, { vendorId: "vendor-two", terms: expect.stringContaining("Vendor confirmation") }]
    });
    expect(await screen.findByText("Pending with Super Admin")).toBeVisible();
    expect(screen.getAllByText("₹8,732.00").length).toBeGreaterThan(0);
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
    const user = userEvent.setup();
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send purchase order to Super Admin" })).toBeDisabled());
    await waitFor(() => expect(screen.getByText("Planned amount, before GST").nextElementSibling).toHaveTextContent("Incomplete"));
    expect(screen.getByText(/Living room lights: Enter the planned order quantity/)).toBeVisible();
  });

  it("shows one actionable tax-inclusive allocation issue per affected item", async () => {
    const kitchen = { ...preparation.sections[0].items[0], allocatedWorkPaise: 400000,
      blockers: [{ code: "ALLOCATION_INSUFFICIENT", itemId: "item-one", message: "The planned amount before GST exceeds this item's recorded vendor allocation." }] };
    const living = { ...preparation.sections[1].items[0], allocatedWorkPaise: 200000,
      blockers: [{ code: "ALLOCATION_INSUFFICIENT", itemId: "item-two", message: "The planned amount before GST exceeds this item's recorded vendor allocation." }] };
    server.use(http.get("/api/v1/procurement/projects/project-one/purchase-order-preparation", () => HttpResponse.json({ data: {
      ...preparation, sections: [{ ...preparation.sections[0], items: [kitchen] }, { ...preparation.sections[1], items: [living] }],
      blockers: [...kitchen.blockers, ...living.blockers]
    } })));
    renderWithQuery(<PurchaseOrdersPanel projectId="project-one" projectName="Aurora Villa" />);
    expect(await screen.findByText(/Kitchen cabinetry \(Kitchen\):/)).toHaveTextContent("2 sq ft × ₹2,500.00 = ₹5,000.00");
    expect(screen.getByText(/Kitchen cabinetry \(Kitchen\):/)).toHaveTextContent("GST (18%) ₹900.00; order total ₹5,900.00. Allocated work: ₹4,000.00");
    expect(screen.getByText(/Living room lights \(Living\):/)).toHaveTextContent("order total ₹2,832.00. Allocated work: ₹2,000.00");
    expect(screen.queryByText(/planned amount before GST exceeds/)).not.toBeInTheDocument();
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
});
