import axe from "axe-core";
import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  subBasketId: null,
  mainLineId: null,
  reason: null,
  createdAt: "2026-10-05T08:00:00.000Z",
  decidedAt: null,
  decidedById: null
};

const response = (data: unknown, status = 200) => HttpResponse.json({ data }, { status });
let rows: VendorBasketRequest[];
let decisions: Array<Record<string, unknown>>;
const basket = { id: "configuration-painting", name: "Painting", status: "active", version: 1, displayOrder: 0, description: null };
const subBasket = { id: "sub-painting", name: "Interior", basketId: basket.id, version: 1, displayOrder: 0 };
const page = (items: unknown[]) => ({ items, pagination: { total: items.length, limit: 100, offset: 0, hasMore: false } });

async function openApproval(user: ReturnType<typeof userEvent.setup>) {
  const region = await screen.findByRole("region", { name: "Main Basket requests" });
  await user.click(await within(region).findByRole("button", { name: "Review and approve" }));
  const dialog = screen.getByRole("dialog", { name: "Review Main Basket request" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Approve request" })).toBeEnabled());
  return dialog;
}

beforeEach(() => {
  rows = [{ ...request }];
  decisions = [];
  server.use(
    http.get("/api/v1/admin/ai-estimator-knowledge/baskets", () => response(page([]))),
    http.get("/api/v1/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets", () => response(page([subBasket]))),
    http.get("/api/v1/admin/ai-estimator-knowledge/basket-requests", ({ request: incoming }) => {
      const params = new URL(incoming.url).searchParams;
      const filtered = params.get("status") ? rows.filter((row) => row.status === params.get("status")) : rows;
      return response({ items: filtered, pagination: { total: filtered.length, limit: 20, offset: 0, hasMore: false } });
    }),
    http.post("/api/v1/admin/ai-estimator-knowledge/basket-requests/:requestId/decision", async ({ request: incoming }) => {
      const body = await incoming.json() as Record<string, unknown>;
      decisions.push(body);
      const fulfilled = body.decision === "fulfill";
      const configuration = body.configuration as Record<string, string> | undefined;
      rows = [{ ...request, version: 3, status: fulfilled ? "fulfilled" : "rejected",
        basketId: fulfilled ? "configuration-painting" : null,
        subBasketId: fulfilled && configuration ? configuration.subBasketId ?? "new-sub-painting" : null,
        mainLineId: fulfilled && configuration?.mainLineName ? "main-line/painting" : null,
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
    const dialog = await openApproval(user);
    expect(dialog).toHaveAccessibleDescription("Painting · Sharma Interiors");
    expect((await axe.run(document.body)).violations).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Approve request" }));
    await waitFor(() => expect(decisions).toHaveLength(1));
    expect(decisions[0]).toMatchObject({ decision: "fulfill", expectedVersion: 2, reason: null });
    expect(decisions[0]?.idempotencyKey).toEqual(expect.any(String));
    expect(decisions[0]).not.toHaveProperty("configuration");
    await user.click(await within(dialog).findByRole("button", { name: "Done" }));
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
    await user.click(await within(dialog).findByRole("button", { name: "Done" }));
    await user.click(within(region).getByRole("button", { name: "All" }));
    expect(await within(region).findByText("Reason: Already covered by a different category")).toBeVisible();
  });

  it("shows a conflict and lets Super Admin reload current requests", async () => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/basket-requests/:requestId/decision", () =>
      HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "This request changed." } }, { status: 409 })));
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    await user.click(within(dialog).getByRole("button", { name: "Approve request" }));
    expect(await within(dialog).findByText("This request changed.")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Refresh requests" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review Main Basket request" })).not.toBeInTheDocument());
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

  it("approves a new hierarchy in one command and links the confirmed draft Main Line", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Set up Sub Basket and Main Line" }));
    expect(within(dialog).queryByRole("radio", { name: "Existing Sub Basket" })).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "New Sub Basket name" }), "  Interior   finishes  ");
    await user.type(within(dialog).getByRole("textbox", { name: "Main Line name (optional)" }), "  Wall   painting  ");
    expect((await axe.run(document.body)).violations).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Approve and save" }));
    expect(await within(dialog).findByText("Request approved and Configuration saved.")).toBeVisible();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ configuration: { subBasketName: "Interior finishes", mainLineName: "Wall painting" } });
    expect(within(dialog).getByText("Interior finishes")).toBeVisible();
    expect(within(dialog).getByText("Draft")).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Open Main Line" })).toHaveAttribute("href", "/admin/configuration/estimation/items/main-line%2Fpainting");
    expect(within(dialog).queryByRole("button", { name: "Approve and save" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pending" })).toHaveFocus());
  });

  it("allows Sub Basket-only setup without requiring a Main Line", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Set up Sub Basket and Main Line" }));
    await user.type(within(dialog).getByRole("textbox", { name: "New Sub Basket name" }), "Exterior");
    await user.click(within(dialog).getByRole("button", { name: "Approve and save" }));
    await waitFor(() => expect(decisions[0]).toMatchObject({ configuration: { subBasketName: "Exterior" } }));
    expect(decisions[0]?.configuration).not.toHaveProperty("mainLineName");
    expect(await within(dialog).findByText("Exterior")).toBeVisible();
    expect(within(dialog).queryByRole("link", { name: "Open Main Line" })).not.toBeInTheDocument();
  });

  it("resolves a parent from later catalogue pages and selects a Sub Basket by its ID", async () => {
    const user = userEvent.setup();
    const loadedOffsets: number[] = [];
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/baskets", ({ request: incoming }) => {
      const offset = Number(new URL(incoming.url).searchParams.get("offset"));
      loadedOffsets.push(offset);
      return response(offset === 0
        ? { items: [{ ...basket, id: "other-parent", name: "Other basket" }], pagination: { total: 2, limit: 1, offset: 0, hasMore: true } }
        : { items: [{ ...basket, name: "Ｐａｉｎｔｉｎｇ" }], pagination: { total: 2, limit: 1, offset: 1, hasMore: false } });
    }));
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    expect(loadedOffsets).toContain(1);
    expect(within(dialog).getByText("Existing Main Basket: Ｐａｉｎｔｉｎｇ")).toBeVisible();
    await user.click(within(dialog).getByRole("checkbox", { name: "Set up Sub Basket and Main Line" }));
    await user.click(within(dialog).getByRole("radio", { name: "Existing Sub Basket" }));
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Sub Basket" })).toBeEnabled());
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Sub Basket" }), subBasket.id);
    await user.type(within(dialog).getByRole("textbox", { name: "Main Line name (optional)" }), "Emulsion");
    await user.click(within(dialog).getByRole("button", { name: "Approve and save" }));
    await waitFor(() => expect(decisions[0]).toMatchObject({ configuration: { subBasketId: subBasket.id, mainLineName: "Emulsion" } }));
    expect(decisions[0]?.configuration).not.toHaveProperty("subBasketName");
    expect(await within(dialog).findByText("Interior")).toBeVisible();
  });

  it("validates blank setup names and retains entered details", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Set up Sub Basket and Main Line" }));
    const subName = within(dialog).getByRole("textbox", { name: "New Sub Basket name" });
    const mainName = within(dialog).getByRole("textbox", { name: "Main Line name (optional)" });
    await user.type(subName, "   ");
    await user.type(mainName, "   ");
    await user.click(within(dialog).getByRole("button", { name: "Approve and save" }));
    expect(subName).toHaveAttribute("aria-invalid", "true");
    expect(subName).toHaveAccessibleDescription("Enter a Sub Basket name between 1 and 240 characters.");
    expect(mainName).toHaveAttribute("aria-invalid", "true");
    expect(decisions).toHaveLength(0);
    await user.clear(subName);
    await user.type(subName, "Interior");
    await user.clear(mainName);
    expect(subName).not.toHaveAttribute("aria-invalid");
    expect(mainName).not.toHaveAttribute("aria-invalid");
  });

  it("requires an available child of the resolved parent for existing selection", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/admin/ai-estimator-knowledge/baskets", () => response(page([basket]))),
      http.get("/api/v1/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets", () => response(page([{ ...subBasket, basketId: "another-parent" }])))
    );
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Set up Sub Basket and Main Line" }));
    await user.click(within(dialog).getByRole("radio", { name: "Existing Sub Basket" }));
    expect(await within(dialog).findByText("No Sub Baskets yet. Choose New Sub Basket to add one.")).toBeVisible();
    expect(within(dialog).queryByRole("option", { name: "Interior" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Approve and save" }));
    expect(within(dialog).getByRole("combobox", { name: "Sub Basket" })).toHaveAttribute("aria-invalid", "true");
    expect(decisions).toHaveLength(0);
  });

  it("blocks approval when Main Basket catalogue fails instead of assuming a new basket", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/baskets", () => HttpResponse.error()));
    renderWithQuery(<KnowledgeBasketRequestReview />);
    await user.click(await screen.findByRole("button", { name: "Review and approve" }));
    const dialog = screen.getByRole("dialog", { name: "Review Main Basket request" });
    expect(await within(dialog).findByText("Main Baskets could not be checked. Try again before approving.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Approve request" })).toBeDisabled();
    expect(within(dialog).queryByText("New Main Basket: Painting")).not.toBeInTheDocument();
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/baskets", () => response(page([]))));
    await user.click(within(dialog).getByRole("button", { name: "Retry Main Baskets" }));
    expect(await within(dialog).findByText("New Main Basket: Painting")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Approve request" })).toBeEnabled();
  });

  it("shows an inactive Main Basket conflict and prevents fulfillment", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/baskets", () => response(page([{ ...basket, status: "inactive" }]))));
    renderWithQuery(<KnowledgeBasketRequestReview />);
    await user.click(await screen.findByRole("button", { name: "Review and approve" }));
    const dialog = screen.getByRole("dialog", { name: "Review Main Basket request" });
    expect(await within(dialog).findByText("The matching Main Basket is inactive. Resolve it in Configuration before approving this request.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Approve request" })).toBeDisabled();
    expect(decisions).toHaveLength(0);
  });

  it("retains setup after a child catalogue error and can retry the read", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/admin/ai-estimator-knowledge/baskets", () => response(page([basket]))),
      http.get("/api/v1/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets", () => HttpResponse.error())
    );
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Set up Sub Basket and Main Line" }));
    await user.type(within(dialog).getByRole("textbox", { name: "New Sub Basket name" }), "Exterior");
    expect(await within(dialog).findByText("Sub Baskets could not be checked. Your entries have been kept.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Approve and save" })).toBeDisabled();
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets", () => response(page([]))));
    await user.click(within(dialog).getByRole("button", { name: "Retry Sub Baskets" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Approve and save" })).toBeEnabled());
    expect(within(dialog).getByRole("textbox", { name: "New Sub Basket name" })).toHaveValue("Exterior");
  });

  it("retries uncertain hierarchy approval unchanged, including its idempotency key", async () => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/basket-requests/:requestId/decision", async ({ request: incoming }) => {
      decisions.push(await incoming.json() as Record<string, unknown>);
      rows = [{ ...request, status: "fulfilled", basketId: basket.id, subBasketId: subBasket.id, mainLineId: "saved-line", version: 3 }];
      return decisions.length === 1 ? HttpResponse.error() : response(rows[0]);
    }));
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Set up Sub Basket and Main Line" }));
    const subName = within(dialog).getByRole("textbox", { name: "New Sub Basket name" });
    await user.type(subName, "Interior");
    const mainName = within(dialog).getByRole("textbox", { name: "Main Line name (optional)" });
    await user.type(mainName, "Wall painting");
    await user.click(within(dialog).getByRole("button", { name: "Approve and save" }));
    expect(await within(dialog).findByText("The decision could not be confirmed. Retry this decision.")).toBeVisible();
    expect(subName).toBeDisabled();
    expect(mainName).toBeDisabled();
    expect(within(dialog).getByRole("checkbox")).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Retry decision" }));
    expect(await within(dialog).findByText("Request approved and Configuration saved.")).toBeVisible();
    expect(decisions).toHaveLength(2);
    expect(decisions[1]).toEqual(decisions[0]);
  });

  it("allows correction after a definitive conflict using a new command key", async () => {
    const user = userEvent.setup();
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/basket-requests/:requestId/decision", async ({ request: incoming }) => {
      decisions.push(await incoming.json() as Record<string, unknown>);
      return HttpResponse.json({ error: { code: "DUPLICATE_NAME", message: "A Main Line with that name already exists.", fields: { name: "Use a unique Main Line name." } } }, { status: 409 });
    }));
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Set up Sub Basket and Main Line" }));
    await user.type(within(dialog).getByRole("textbox", { name: "New Sub Basket name" }), "Interior");
    await user.type(within(dialog).getByRole("textbox", { name: "Main Line name (optional)" }), "Wall painting");
    await user.click(within(dialog).getByRole("button", { name: "Approve and save" }));
    expect(await within(dialog).findByText("A Main Line with that name already exists.")).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Main Line name (optional)" })).toHaveAccessibleDescription("The Main Line will be saved as a draft in this Sub Basket. Use a unique Main Line name.");
    await user.click(within(dialog).getByRole("button", { name: "Edit details" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Main Line name (optional)" }), " premium");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Approve and save" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Approve and save" }));
    await waitFor(() => expect(decisions).toHaveLength(2));
    expect(decisions[1]?.idempotencyKey).not.toEqual(decisions[0]?.idempotencyKey);
    expect(decisions[1]?.configuration).toEqual({ subBasketName: "Interior", mainLineName: "Wall painting premium" });
  });

  it("keeps a successful outcome when refresh fails and retries reads only", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    const invalidation = vi.spyOn(QueryClient.prototype, "invalidateQueries").mockRejectedValue(new Error("Refresh unavailable"));
    try {
      await user.click(within(dialog).getByRole("button", { name: "Approve request" }));
      expect(await within(dialog).findByText("Your decision was saved, but some lists could not refresh. Do not submit another approval.")).toBeVisible();
      expect(within(dialog).getByText("Request approved and Configuration saved.")).toBeVisible();
      expect(within(dialog).queryByRole("button", { name: "Retry decision" })).not.toBeInTheDocument();
      expect(invalidation.mock.calls.map(([filter]) => filter?.queryKey)).toEqual(expect.arrayContaining([
        ["vendor-basket-requests", "review"], ["vendor-basket-requests", "mine"],
        ["ai-estimator-knowledge", "baskets"], ["ai-estimator-knowledge", "sub-baskets", basket.id],
        ["ai-estimator-knowledge", "main-lines"], ["ai-estimator-knowledge", "items"], ["ai-estimator-knowledge", "item"]
      ]));
      invalidation.mockResolvedValue();
      await user.click(within(dialog).getByRole("button", { name: "Retry refresh" }));
      await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Retry refresh" })).not.toBeInTheDocument());
      expect(decisions).toHaveLength(1);
    } finally { invalidation.mockRestore(); }
  });

  it("cancels setup without a write and returns focus to the opening action", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Set up Sub Basket and Main Line" }));
    await user.type(within(dialog).getByRole("textbox", { name: "New Sub Basket name" }), "Interior");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    const discard = screen.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await user.click(within(discard).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review Main Basket request" })).not.toBeInTheDocument());
    expect(decisions).toHaveLength(0);
    await waitFor(() => expect(screen.getByRole("button", { name: "Review and approve" })).toHaveFocus());
  });

  it("returns to Pending on navigation without losing an open approval draft", async () => {
    const user = userEvent.setup();
    let navigate: (key: string) => void = () => {};
    function Harness() {
      const [key, setKey] = useState("first");
      navigate = setKey;
      return <KnowledgeBasketRequestReview navigationKey={key} />;
    }
    renderWithQuery(<Harness />);
    await user.click(await screen.findByRole("button", { name: "All" }));
    const dialog = await openApproval(user);
    await user.click(within(dialog).getByRole("checkbox", { name: "Set up Sub Basket and Main Line" }));
    await user.type(within(dialog).getByRole("textbox", { name: "New Sub Basket name" }), "Keep this draft");
    act(() => navigate("second"));
    expect(within(dialog).getByRole("textbox", { name: "New Sub Basket name" })).toHaveValue("Keep this draft");
    expect(screen.getByRole("button", { name: "Pending", hidden: true })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the queue without decision controls when approval permission is absent", async () => {
    renderWithQuery(<KnowledgeBasketRequestReview canDecide={false} />);
    expect(await screen.findByText("Sharma Interiors · vendor-one")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Review and approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh requests" })).toBeVisible();
  });

  it("blocks duplicate submissions and closing while the decision is pending", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    server.use(http.post("/api/v1/admin/ai-estimator-knowledge/basket-requests/:requestId/decision", async ({ request: incoming }) => {
      decisions.push(await incoming.json() as Record<string, unknown>);
      await waiting;
      return response({ ...request, status: "fulfilled", basketId: basket.id, version: 3 });
    }));
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    await user.dblClick(within(dialog).getByRole("button", { name: "Approve request" }));
    await waitFor(() => expect(decisions).toHaveLength(1));
    expect(within(dialog).getByRole("button", { name: "Approve request" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    release();
    expect(await within(dialog).findByText("Request approved and Configuration saved.")).toBeVisible();
  });

  it("supports keyboard focus within the approval panel and returns focus on Escape", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KnowledgeBasketRequestReview />);
    const dialog = await openApproval(user);
    const last = within(dialog).getByRole("button", { name: "Approve request" });
    last.focus();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review Main Basket request" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Review and approve" })).toHaveFocus();
  });
});
