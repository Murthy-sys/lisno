import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { KnowledgeSubBasketRequestPanel } from "./KnowledgeSubBasketRequestPanel";

const auth = vi.hoisted(() => ({ role: "super_admin" as "super_admin" | "procurement" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "admin-one", role: auth.role }, authorization: authorizationFor(auth.role) }) }));
const path = "/api/v1/admin/ai-estimator-knowledge/sub-basket-requests";
const pending = { id: "request-one", kind: "configuration_sub_basket", requesterId: "admin-one", target: { kind: "new_sub_basket", basketId: "materials" }, targetParentName: "Materials",
  proposedName: "Boards", description: "Board supplies", vendorName: null, vendorId: null, status: "pending", version: 1,
  basketId: null, subBasketId: null, mainLineId: null, reason: null, createdAt: "2026-10-25T00:00:00.000Z", decidedAt: null, decidedById: null };
let bodies: Record<string, unknown>[];
let catalogWrites: number;
beforeEach(() => {
  auth.role = "super_admin"; bodies = []; catalogWrites = 0;
  server.use(http.post(path, async ({ request }) => { bodies.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: pending }, { status: 201 }); }),
    http.post("/api/v1/admin/ai-estimator-knowledge/baskets/:id/sub-baskets", () => { catalogWrites++; return HttpResponse.json({ data: {} }); }));
});

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: "Sub-Basket name" }), "  Boards  ");
  await user.type(screen.getByRole("textbox", { name: "Description" }), "  Board supplies  ");
}

describe("Configuration Sub-Basket request panel", () => {
  it("submits a pending approval request without creating or selecting a catalog group", async () => {
    const onRequested = vi.fn(); const user = userEvent.setup();
    renderWithQuery(<KnowledgeSubBasketRequestPanel basketId="materials" basketName="Materials" onClose={vi.fn()} onRequested={onRequested} />);
    const panel = screen.getByRole("dialog", { name: "Request Sub-Basket" });
    expect(panel).toHaveTextContent("Main Basket: Materials");
    expect(within(panel).queryByRole("textbox", { name: /Main Line/i })).not.toBeInTheDocument();
    await fill(user); await user.click(screen.getByRole("button", { name: "Submit for approval" }));
    await waitFor(() => expect(onRequested).toHaveBeenCalledWith(pending));
    expect(bodies).toEqual([{ basketId: "materials", name: "Boards", description: "Board supplies", idempotencyKey: expect.any(String) }]);
    expect(catalogWrites).toBe(0);
    expect(within(panel).getByRole("status")).toHaveTextContent("pending approval and has not been added to the catalog");
    expect(screen.queryByRole("button", { name: "Submit for approval" })).not.toBeInTheDocument();
  });

  it("preserves the exact idempotent request after uncertain failure", async () => {
    server.use(http.post(path, async ({ request }) => {
      bodies.push(await request.json() as Record<string, unknown>);
      return bodies.length === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Result not confirmed" } }, { status: 503 }) : HttpResponse.json({ data: pending }, { status: 201 });
    }));
    const user = userEvent.setup(); const onRequested = vi.fn();
    renderWithQuery(<KnowledgeSubBasketRequestPanel basketId="materials" basketName="Materials" onClose={vi.fn()} onRequested={onRequested} />);
    await fill(user); await user.click(screen.getByRole("button", { name: "Submit for approval" }));
    await screen.findByText("Result not confirmed");
    expect(screen.getByRole("textbox", { name: "Sub-Basket name" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Edit request" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry request" }));
    await waitFor(() => expect(onRequested).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]); expect(catalogWrites).toBe(0);
  });

  it("retains entries on a pending duplicate and allows a corrected request", async () => {
    server.use(http.post(path, async ({ request }) => {
      bodies.push(await request.json() as Record<string, unknown>);
      return HttpResponse.json({ error: { code: "REQUEST_PENDING", message: "A request is already pending approval." } }, { status: 409 });
    }));
    const user = userEvent.setup(); const onRequested = vi.fn();
    renderWithQuery(<KnowledgeSubBasketRequestPanel basketId="materials" basketName="Materials" onClose={vi.fn()} onRequested={onRequested} />);
    await fill(user); await user.click(screen.getByRole("button", { name: "Submit for approval" }));
    await screen.findByText("A request is already pending approval.");
    expect(onRequested).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Edit request" }));
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("  Board supplies  ");
    await user.type(screen.getByRole("textbox", { name: "Sub-Basket name" }), " fittings");
    await user.click(screen.getByRole("button", { name: "Submit for approval" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]!.idempotencyKey).not.toBe(bodies[0]!.idempotencyKey);
  });

  it("reports the latest approved status when an uncertain submission is replayed after review", async () => {
    server.use(http.post(path, async ({ request }) => {
      bodies.push(await request.json() as Record<string, unknown>);
      return bodies.length === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Result not confirmed" } }, { status: 503 })
        : HttpResponse.json({ data: { ...pending, status: "fulfilled", basketId: "materials", subBasketId: "boards" } });
    }));
    const user = userEvent.setup(); const onRequested = vi.fn();
    renderWithQuery(<KnowledgeSubBasketRequestPanel basketId="materials" basketName="Materials" onClose={vi.fn()} onRequested={onRequested} />);
    await fill(user); await user.click(screen.getByRole("button", { name: "Submit for approval" }));
    await screen.findByText("Result not confirmed");
    await user.click(screen.getByRole("button", { name: "Retry request" }));
    await screen.findByText("This request has already been approved. Refresh the catalog to select the Sub-Basket.");
    expect(onRequested).toHaveBeenCalledWith(expect.objectContaining({ status: "fulfilled" }));
    expect(bodies[1]).toEqual(bodies[0]); expect(catalogWrites).toBe(0);
  });

  it("does not submit from a procurement session", async () => {
    auth.role = "procurement";
    renderWithQuery(<KnowledgeSubBasketRequestPanel basketId="materials" basketName="Materials" onClose={vi.fn()} onRequested={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("do not have permission");
    expect(screen.getByRole("button", { name: "Submit for approval" })).toBeDisabled();
    expect(bodies).toHaveLength(0);
  });
});
