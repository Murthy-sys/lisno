import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { VendorAllocationBaseline } from "./VendorAllocationBaseline";
const row = { itemId: "item-old", projectId: "project-old", projectName: "Synthetic House", itemName: "Cabinets", brand: "Example", version: 7 };
const data = (value: unknown) => HttpResponse.json({ data: value });
beforeEach(() => { server.use(http.get("/api/v1/admin/ai-estimator-knowledge/vendors/vendor-one/allocation-baseline", () => data({ items: [row], total: 1, offset: 0, limit: 20 }))); });
function start(canUpdate = true) { return renderWithQuery(<VendorAllocationBaseline vendorId="vendor-one" canUpdate={canUpdate} disabled={false} onBusyChange={vi.fn()} onDirtyChange={vi.fn()} />); }
describe("Historical vendor allocation correction", () => {
  it("requires a reason and retries an uncertain result with exactly the same item version and identity", async () => {
    const writes: unknown[] = [];
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/vendors/vendor-one/allocation-baseline/item-old", async ({ request }) => {
      writes.push(await request.json());
      return writes.length === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Response unavailable" } }, { status: 503 }) : data({ itemId: row.itemId, projectId: row.projectId, vendorId: "vendor-one", allocatedWorkPaise: 6000000, version: 8, recordedAt: "2026-09-24T00:00:00Z" });
    }));
    start(); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Review missing historical allocations" }));
    await user.click(await screen.findByRole("button", { name: "Record historical amount" }));
    const group = screen.getByRole("group", { name: "Correct historical amount for Cabinets" });
    fireEvent.change(within(group).getByRole("textbox", { name: "Historical allocated work (INR)" }), { target: { value: "60000" } });
    await user.click(within(group).getByRole("button", { name: "Record historical amount" }));
    expect(writes).toHaveLength(0); expect(screen.getByText(/Enter a positive amount/)).toBeVisible();
    await user.type(within(group).getByRole("textbox", { name: "Historical correction reason" }), "Recorded from historical work order");
    await user.click(within(group).getByRole("button", { name: "Record historical amount" }));
    await screen.findByText(/Retry the same correction/); expect(within(group).getByRole("textbox", { name: "Historical correction reason" })).toBeDisabled();
    await user.click(within(group).getByRole("button", { name: "Retry same correction" }));
    await screen.findByText(/Historical allocation recorded/); expect(writes).toHaveLength(2); expect(writes[0]).toEqual(writes[1]);
    expect(writes[0]).toMatchObject({ expectedVersion: 7, allocatedWorkPaise: 6000000, reason: "Recorded from historical work order", idempotencyKey: expect.any(String) });
  });
  it("supports read-only historical review without a correction control", async () => {
    start(false); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Review missing historical allocations" }));
    await screen.findByText("Synthetic House: Cabinets"); expect(screen.getByText("Not recorded")).toBeVisible(); expect(screen.queryByRole("button", { name: "Record historical amount" })).not.toBeInTheDocument();
  });
  it("blocks stale correction until eligibility is reloaded", async () => {
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/vendors/vendor-one/allocation-baseline/item-old", () => HttpResponse.json({ error: { code: "PROCUREMENT_ITEM_VERSION_CONFLICT", message: "Item changed" } }, { status: 409 })));
    start(); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Review missing historical allocations" })); await user.click(await screen.findByRole("button", { name: "Record historical amount" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Historical allocated work (INR)" }), { target: { value: "10" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Historical correction reason" }), { target: { value: "Correct historical value" } });
    const group = screen.getByRole("group", { name: "Correct historical amount for Cabinets" }); await user.click(within(group).getByRole("button", { name: "Record historical amount" })); await screen.findByText("Item changed");
    expect(within(group).getByRole("button", { name: "Record historical amount" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reload eligible historical items" })); await waitFor(() => expect(screen.queryByRole("group", { name: "Correct historical amount for Cabinets" })).not.toBeInTheDocument());
  });
});
