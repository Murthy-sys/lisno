import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { VendorWorkPage } from "./VendorWorkPage";
import type { VendorWorkTask } from "./vendorWorkApi";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "vendor-user", role: "vendor" }, status: "authenticated", authorization: { role: "vendor", permissions: ["projects.status.read", "procurement.vendor_work.read", "procurement.vendor_work.update", "procurement.vendor_work.media.upload"] } })
}));

const baseTask: VendorWorkTask = {
  id: "assignment-one", projectId: "project-one", vendorId: "vendor-one", orderId: "order-one", orderRevision: 1,
  lineId: "line-one", sourceSectionId: "CA", sourceLineItemKey: "estimate-line-one", sectionLabel: "Carpentry", roomName: "Living room",
  itemName: "TV unit", scopeType: "supply_and_execution", description: "Build and fit oak TV unit", targetDate: "2026-11-01",
  deliveryLocation: "Project site", status: "changes_requested", version: 3, progress: 100,
  displayProgress: 100, progressSource: "vendor", currentRound: 2, note: "Original completion",
  requestedChangeReason: "Align the cabinet doors", imageCount: 1, submittedAt: null, acceptedAt: null
};

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "key-12345678" });
  server.use(http.get("/api/v1/vendor/purchase-orders/order-one", () => HttpResponse.json({ data: {
    id: "order-one", orderNumber: "PO-ONE", projectId: "project-one", vendor: { id: "vendor-one", code: "VEN-1", name: "Oak Works" }, revision: 1,
    approvedAt: "2026-10-01T00:00:00.000Z", terms: "Install at project site", lines: [{ id: "line-one", itemName: "TV unit", description: "Build and fit oak TV unit", quantityMilliUnits: 1000, uomCode: "unit", scopeType: "supply_and_execution", targetDate: "2026-11-01", deliveryLocation: "Project site", gstBasisPoints: 2000, totalPaise: 600000 }], totals: { netPaise: 500000, gstPaise: 100000, totalPaise: 600000 }
  } })));
});

describe("vendor assigned work", () => {
  it("shows Site Manager 100% separately from vendor progress and keeps vendor submit disabled", async () => {
    const task: VendorWorkTask = { ...baseTask, status: "ready", version: 1, progress: 20,
      displayProgress: 100, progressSource: "site_manager", note: "Vendor still working", requestedChangeReason: null };
    server.use(
      http.get("/api/v1/vendor/work", () => HttpResponse.json({ data: { items: [task], total: 1, limit: 50, offset: 0 } })),
      http.get("/api/v1/vendor/work/assignment-one", () => HttpResponse.json({ data: task }))
    );
    renderWithQuery(<VendorWorkPage />);
    const row = await screen.findByRole("button", { name: /TV unit/ });
    expect(row).toHaveTextContent("100% · Site Manager verified");
    await userEvent.click(row);
    expect(await screen.findByText(/Your reported section progress remains 20%/)).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Vendor reported progress (%)" })).toHaveValue(20);
    expect(screen.getByRole("button", { name: "Submit completed section" })).toBeDisabled();
  });

  it("shows client change reason and requires a fresh update before resubmission", async () => {
    let task = baseTask;
    const progressWrites: unknown[] = [];
    const submitWrites: unknown[] = [];
    server.use(
      http.get("/api/v1/vendor/work", () => HttpResponse.json({ data: { items: [task], total: 1, limit: 50, offset: 0 } })),
      http.get("/api/v1/vendor/work/assignment-one", () => HttpResponse.json({ data: task })),
      http.patch("/api/v1/vendor/work/assignment-one/progress", async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        progressWrites.push(body);
        task = { ...task, version: 4, status: "in_progress", note: String(body.note), progress: Number(body.progress) };
        return HttpResponse.json({ data: task });
      }),
      http.post("/api/v1/vendor/work/assignment-one/submit", async ({ request }) => {
        submitWrites.push(await request.json());
        task = { ...task, version: 5, status: "submitted_for_client" };
        return HttpResponse.json({ data: { id: "review-two", projectId: "project-one", assignmentId: task.id, round: 2, status: "pending", version: 1, imageIds: [], decision: null } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<VendorWorkPage />);
    await user.click(await screen.findByRole("button", { name: /TV unit/ }));
    expect(await screen.findByText(/Align the cabinet doors/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Submit completed section" })).toBeDisabled();
    expect(screen.getByText(/Record a new progress update/)).toBeVisible();
    await user.clear(screen.getByRole("textbox", { name: "Work note" }));
    await user.type(screen.getByRole("textbox", { name: "Work note" }), "Cabinet doors aligned and checked");
    await user.click(screen.getByRole("button", { name: "Save progress" }));
    await waitFor(() => expect(progressWrites).toHaveLength(1));
    expect(progressWrites[0]).toEqual({ expectedVersion: 3, idempotencyKey: "key-12345678", progress: 100, note: "Cabinet doors aligned and checked" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit completed section" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Submit completed section" }));
    await waitFor(() => expect(submitWrites).toHaveLength(1));
    expect(submitWrites[0]).toEqual({ expectedVersion: 4, idempotencyKey: "key-12345678", note: "Cabinet doors aligned and checked" });
    expect(await screen.findByText("Section sent to the client for review.")).toBeVisible();
  });

  it("loads every assignment page and shows one status control per project", async () => {
    server.use(http.get("/api/v1/vendor/work", ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get("offset"));
      const second = { ...baseTask, id: "assignment-two", projectId: "project-two", orderId: "order-two", itemName: "Kitchen unit" };
      return HttpResponse.json({ data: { items: [offset === 0 ? baseTask : second], total: 2, limit: 1, offset } });
    }));
    const user = userEvent.setup();
    renderWithQuery(<VendorWorkPage />);
    expect(await screen.findByRole("button", { name: /TV unit/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Kitchen unit/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more assignments" }));
    expect(await screen.findByRole("button", { name: /Kitchen unit/ })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Project status" })).toHaveLength(2);
  });

  it("shows tender work without invented scope, target date, or delivery location", async () => {
    const task: VendorWorkTask = { ...baseTask, scopeType: null, targetDate: null, deliveryLocation: null };
    server.use(
      http.get("/api/v1/vendor/work", () => HttpResponse.json({ data: { items: [task], total: 1, limit: 50, offset: 0 } })),
      http.get("/api/v1/vendor/work/assignment-one", () => HttpResponse.json({ data: task })),
      http.get("/api/v1/vendor/purchase-orders/order-one", () => HttpResponse.json({ data: {
        id: "order-one", orderNumber: "PO-ONE", projectId: "project-one", vendor: { id: "vendor-one", code: "VEN-1", name: "Oak Works" }, revision: 1,
        approvedAt: "2026-10-01T00:00:00.000Z", terms: null, lines: [{ id: "line-one", itemName: "TV unit", description: "Build and fit oak TV unit", quantityMilliUnits: 1000, uomCode: "unit", scopeType: null, targetDate: null, deliveryLocation: null, gstBasisPoints: 2000, totalPaise: 600000 }], totals: { netPaise: 500000, gstPaise: 100000, totalPaise: 600000 }
      } }))
    );
    const user = userEvent.setup();
    renderWithQuery(<VendorWorkPage />);
    const row = await screen.findByRole("button", { name: /TV unit/ });
    expect(row).toHaveTextContent("Living room · Not specified");
    await user.click(row);
    expect(await screen.findByText("Target date")).toBeVisible();
    expect(screen.getByText("Delivery location").nextSibling).toHaveTextContent("Not specified");
    await user.click(await screen.findByText("View approved purchase order PO-ONE"));
    expect(screen.getByText(/Target Not specified · Not specified · GST/)).toBeVisible();
    expect(screen.queryByText("Terms:")).not.toBeInTheDocument();
  });
});
