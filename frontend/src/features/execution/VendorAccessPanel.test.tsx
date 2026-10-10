import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { vendorLoginAccessKeys } from "../procurement/vendorLoginAccessApi";
import { vendorOrderAccessFixture, vendorOrderAccessPageFixture } from "../procurement/vendorLoginAccessFixtures";
import { VendorAccessPanel, vendorAccessApi, vendorAccessKey, type VendorAccessIntent } from "./VendorAccessPanel";
const auth = vi.hoisted(() => ({ allowed: true, actorId: "buyer-one" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: auth.actorId }, authorization: authorizationFor("procurement", auth.allowed ? ["execution.access.retry"] : []) }) }));
let current: VendorAccessIntent;
function setup(projectId = "project-one") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><VendorAccessPanel projectId={projectId} orderId="order-one" /></QueryClientProvider>), client };
}
beforeEach(() => {
  auth.allowed = true; auth.actorId = "buyer-one"; current = { ...vendorOrderAccessFixture };
  vi.spyOn(vendorAccessApi, "list").mockImplementation(async () => vendorOrderAccessPageFixture([current]));
  vi.spyOn(vendorAccessApi, "send").mockImplementation(async () => {
    current = { ...current, id: "access-one", state: "queued", version: 1, availableActions: [] };
    return vendorOrderAccessPageFixture([current]);
  });
});
describe("vendor order access panel", () => {
  it("sends a missing legacy intent with exact observed versions and human-readable labels", async () => {
    const view = setup();
    view.client.setQueryData(vendorLoginAccessKeys.detail("buyer-one", "vendor-one"), {});
    expect(await screen.findByText("Email not requested")).toBeVisible();
    expect(screen.getByText("Oak Works")).toBeVisible();
    expect(screen.queryByText("vendor-one")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send invitation for PO-ONE" }));
    await waitFor(() => expect(vendorAccessApi.send).toHaveBeenCalledWith("project-one", "order-one", {
      action: "send_invitation", expectedVendorVersion: 4, invitationId: null, expectedInvitationVersion: null,
      expectedOrderVersion: 5, expectedOrderRevision: 2, expectedAccessVersion: null, idempotencyKey: expect.any(String)
    }));
    expect(await screen.findByText("Email queued. Delivery status will update after processing.")).toBeVisible();
    expect(screen.queryByText("Email sent")).not.toBeInTheDocument();
    expect(view.client.getQueryState(vendorLoginAccessKeys.detail("buyer-one", "vendor-one"))?.isInvalidated).toBe(true);
    current = { ...current, access: "setup_pending", state: "sent", sentAt: "2026-10-09T08:00:00Z" };
    await act(async () => { await view.client.invalidateQueries({ queryKey: vendorAccessKey("project-one", "buyer-one") }); });
    expect(await screen.findByText("Email sent. Password setup is confirmed separately.")).toBeVisible();
    expect(screen.queryByText("Email queued. Delivery status will update after processing.")).not.toBeInTheDocument();
  });
  it("retains the exact request after uncertain delivery despite a background version change", async () => {
    vi.mocked(vendorAccessApi.send).mockRejectedValue(new Error("network"));
    const view = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Send invitation for PO-ONE" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed");
    current = { ...current, version: 5, orderVersion: 9, vendorVersion: 8, availableActions: [] };
    await act(async () => { await view.client.invalidateQueries({ queryKey: vendorAccessKey("project-one", "buyer-one") }); });
    await userEvent.click(screen.getByRole("button", { name: "Retry send request for PO-ONE" }));
    await waitFor(() => expect(vendorAccessApi.send).toHaveBeenCalledTimes(2));
    expect(vi.mocked(vendorAccessApi.send).mock.calls[0]).toEqual(vi.mocked(vendorAccessApi.send).mock.calls[1]);
    vi.mocked(vendorAccessApi.send).mockRejectedValue(new ApiError(409, "STALE_VERSION", "private"));
    await userEvent.click(screen.getByRole("button", { name: "Retry send request for PO-ONE" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Access status changed");
  });
  it("separates sent/setup-pending and resends the observed invitation", async () => {
    current = { ...current, id: "access-one", version: 3, state: "sent", access: "setup_pending", sentAt: "2026-10-09T08:00:00Z",
      availableActions: ["resend_invitation"], invitation: { id: "invite-one", version: 2, status: "pending", deliveryStatus: "sent", expiresAt: "2026-10-12T08:00:00Z" } };
    setup(); expect(await screen.findByText("Email sent")).toBeVisible();
    expect(screen.getByText("Password setup pending")).toBeVisible();
    expect(screen.queryByText("Account active")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resend invitation for PO-ONE" }));
    expect(vendorAccessApi.send).toHaveBeenCalledWith("project-one", "order-one", expect.objectContaining({ action: "resend_invitation", invitationId: "invite-one", expectedInvitationVersion: 2, expectedAccessVersion: 3 }));
  });
  it("uses a work-notification action for an active account", async () => {
    current = { ...current, access: "active", availableActions: ["send_work_notification"] };
    setup(); expect(await screen.findByText("Account active")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Send invitation/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send work notification for PO-ONE" }));
    expect(vendorAccessApi.send).toHaveBeenCalledWith("project-one", "order-one", expect.objectContaining({ action: "send_work_notification" }));
  });
  it.each(["paused", "unavailable"] as const)("shows %s delivery even with no issued orders", async state => {
    vi.mocked(vendorAccessApi.list).mockResolvedValue({ items: [], total: 0, readiness: { state, reasonCode: "DELIVERY_UNAVAILABLE", lastProcessedAt: null } });
    setup(); expect(await screen.findByText(state === "paused" ? /delivery is paused/ : /delivery is unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Send invitation/ })).not.toBeInTheDocument();
  });
  it("does not fetch without access and removes retained details on read or mutation revocation", async () => {
    auth.allowed = false; const hidden = setup(); expect(vendorAccessApi.list).not.toHaveBeenCalled(); hidden.unmount();
    auth.allowed = true; const view = setup(); await screen.findByText("PO-ONE");
    vi.mocked(vendorAccessApi.list).mockRejectedValue(new ApiError(403, "FORBIDDEN", "private"));
    await act(async () => { await view.client.invalidateQueries({ queryKey: vendorAccessKey("project-one", "buyer-one") }); });
    await waitFor(() => expect(screen.queryByText("PO-ONE")).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("unavailable for your current access");
  });
  it("rejects mismatched project data instead of displaying another project's order", async () => {
    setup("project-two");
    expect(await screen.findByRole("alert")).toHaveTextContent("Project identity changed");
    expect(screen.queryByText("Oak Works")).not.toBeInTheDocument();
  });
});
