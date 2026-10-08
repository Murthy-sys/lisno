import axe from "axe-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import type { VendorBasketRequest } from "../procurement/vendorBasketRequestApi";
import { KnowledgeBasketRequestReview } from "./KnowledgeBasketRequestReview";

const request: VendorBasketRequest = {
  id: "basket-request-one",
  requesterId: "procurement-one",
  vendorId: "vendor-one",
  vendorName: "Sharma Interiors",
  proposedName: "Painting",
  status: "pending",
  version: 2,
  basketId: null,
  reason: null,
  createdAt: "2026-10-05T08:00:00.000Z",
  decidedAt: null,
  decidedById: null
};

const response = (data: unknown, status = 200) => HttpResponse.json({ data }, { status });
let rows: VendorBasketRequest[];
let decisions: Array<Record<string, unknown>>;

beforeEach(() => {
  rows = [{ ...request }];
  decisions = [];
  server.use(
    http.get("/api/v1/admin/ai-estimator-knowledge/basket-requests", ({ request: incoming }) => {
      const params = new URL(incoming.url).searchParams;
      const filtered = params.get("status") ? rows.filter((row) => row.status === params.get("status")) : rows;
      return response({ items: filtered, pagination: { total: filtered.length, limit: 20, offset: 0, hasMore: false } });
    }),
    http.post("/api/v1/admin/ai-estimator-knowledge/basket-requests/:requestId/decision", async ({ request: incoming }) => {
      const body = await incoming.json() as Record<string, unknown>;
      decisions.push(body);
      const fulfilled = body.decision === "fulfill";
      rows = [{ ...request, version: 3, status: fulfilled ? "fulfilled" : "rejected",
        basketId: fulfilled ? "configuration-painting" : null,
        reason: fulfilled ? null : String(body.reason),
        decidedById: "super-admin-one", decidedAt: "2026-10-05T09:00:00.000Z" }];
      return response(rows[0]);
    })
  );
});

describe("Super Admin Main Basket requests", () => {
  it("fulfills a request into Configuration without selecting it for the vendor", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const region = await screen.findByRole("region", { name: "Main Basket requests" });
    expect(await within(region).findByText("Sharma Interiors · vendor-one")).toBeVisible();
    await user.click(within(region).getByRole("button", { name: "Add to Configuration" }));
    const dialog = screen.getByRole("dialog", { name: "Add Main Basket to Configuration" });
    expect(dialog).toHaveAccessibleDescription("Painting · Sharma Interiors");
    expect((await axe.run(document.body)).violations).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Add to Configuration" }));
    await waitFor(() => expect(decisions).toHaveLength(1));
    expect(decisions[0]).toMatchObject({ decision: "fulfill", expectedVersion: 2, reason: null });
    expect(decisions[0]?.idempotencyKey).toEqual(expect.any(String));
    expect(await screen.findByText("Painting is available in Configuration. Procurement can select it for the vendor.")).toBeVisible();
    await waitFor(() => expect(within(region).getByText("No pending Main Basket requests.")).toBeVisible());
  });

  it("requires a reason to reject and shows the resulting status in history", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const region = await screen.findByRole("region", { name: "Main Basket requests" });
    await user.click(await within(region).findByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", { name: "Reject Main Basket request" });
    expect(within(dialog).getByRole("button", { name: "Reject request" })).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Already covered by a different category");
    await user.click(within(dialog).getByRole("button", { name: "Reject request" }));
    await waitFor(() => expect(decisions[0]).toMatchObject({ decision: "reject", expectedVersion: 2, reason: "Already covered by a different category" }));
    await user.click(within(region).getByRole("button", { name: "All" }));
    expect(await within(region).findByText("Reason: Already covered by a different category")).toBeVisible();
  });

  it("shows a conflict and lets Super Admin reload current requests", async () => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/basket-requests/:requestId/decision", () =>
      HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "This request changed." } }, { status: 409 })));
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const region = await screen.findByRole("region", { name: "Main Basket requests" });
    await user.click(await within(region).findByRole("button", { name: "Add to Configuration" }));
    const dialog = screen.getByRole("dialog", { name: "Add Main Basket to Configuration" });
    await user.click(within(dialog).getByRole("button", { name: "Add to Configuration" }));
    expect(await within(dialog).findByText("This request changed.")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Refresh requests" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add Main Basket to Configuration" })).not.toBeInTheDocument());
  });

  it("retries an uncertain rejection with the same reason and idempotency key", async () => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/basket-requests/:requestId/decision", async ({ request: incoming }) => {
      const body = await incoming.json() as Record<string, unknown>;
      decisions.push(body);
      rows = [{ ...request, version: 3, status: "rejected", basketId: null,
        reason: String(body.reason), decidedById: "super-admin-one", decidedAt: "2026-10-05T09:00:00.000Z" }];
      return decisions.length === 1
        ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Response unavailable" } }, { status: 503 })
        : response(rows[0]);
    }));
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const region = await screen.findByRole("region", { name: "Main Basket requests" });
    await user.click(await within(region).findByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", { name: "Reject Main Basket request" });
    const reason = within(dialog).getByRole("textbox", { name: "Reason" });
    await user.type(reason, "Already covered");
    await user.click(within(dialog).getByRole("button", { name: "Reject request" }));
    expect(await within(dialog).findByText("Response unavailable")).toBeVisible();
    expect(reason).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Retry decision" }));
    await waitFor(() => expect(decisions).toHaveLength(2));
    expect(decisions[1]).toEqual(decisions[0]);
    expect(await screen.findByText("Painting request rejected.")).toBeVisible();
  });
});
