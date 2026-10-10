import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import type { PermissionCode } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { userInvitationKeys } from "../admin/userInvitationsApi";
import { vendorAccessKey } from "../execution/VendorAccessPanel";
import { VendorLoginAccessPanel } from "./VendorLoginAccessPanel";
import { vendorLoginAccessApi, vendorLoginAccessKeys, type VendorLoginAccess } from "./vendorLoginAccessApi";
import { vendorLoginAccessFixture } from "./vendorLoginAccessFixtures";

const auth = vi.hoisted(() => ({ actorId: "buyer-one", permissions: [] as PermissionCode[] }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: auth.actorId, role: "procurement" }, authorization: authorizationFor("procurement", auth.permissions) }) }));
let current: VendorLoginAccess;
function setup(props: { vendorId?: string; contactEditing?: boolean; onEditContact?: () => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const content = (next = props) => <QueryClientProvider client={client}><VendorLoginAccessPanel vendorId="vendor-one" {...next} /></QueryClientProvider>;
  const view = render(content());
  return { ...view, client, rerenderPanel: (next = props) => view.rerender(content(next)) };
}
beforeEach(() => {
  auth.actorId = "buyer-one"; auth.permissions = ["procurement.vendor_access.read", "procurement.vendor_access.manage"];
  current = structuredClone(vendorLoginAccessFixture);
  vi.spyOn(vendorLoginAccessApi, "get").mockImplementation(async () => current);
  vi.spyOn(vendorLoginAccessApi, "send").mockImplementation(async () => {
    current = { ...current, delivery: { ...current.delivery, state: "queued" }, availableActions: [] }; return current;
  });
  vi.spyOn(vendorLoginAccessApi, "resend").mockImplementation(async () => {
    current = { ...current, delivery: { ...current.delivery, state: "queued" }, availableActions: [] }; return current;
  });
});
describe("Procurement vendor login access", () => {
  it("sends before first work order using only saved vendor and invitation versions", async () => {
    const view = setup();
    view.client.setQueryData(userInvitationKeys.all, {});
    view.client.setQueryData(vendorAccessKey("project-one", "buyer-one"), {});
    expect(await screen.findByText("vendor@example.test")).toBeVisible();
    expect(screen.getByText("Email not requested")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(vendorLoginAccessApi.send).toHaveBeenCalledWith("vendor-one", {
      expectedVendorVersion: 4, invitationId: null, expectedInvitationVersion: null, idempotencyKey: expect.any(String)
    }));
    expect(await screen.findByText("Email queued. Delivery status will update after processing.")).toBeVisible();
    expect(screen.queryByText("Email sent")).not.toBeInTheDocument();
    expect(view.client.getQueryState(userInvitationKeys.all)?.isInvalidated).toBe(true);
    expect(view.client.getQueryState(vendorAccessKey("project-one", "buyer-one"))?.isInvalidated).toBe(true);
    current = { ...current, access: "setup_pending", delivery: { ...current.delivery, state: "sent", sentAt: "2026-10-09T08:00:00Z" } };
    await act(async () => { await view.client.invalidateQueries({ queryKey: vendorLoginAccessKeys.detail("buyer-one", "vendor-one") }); });
    expect(await screen.findByText("Email sent. Password setup is confirmed separately.")).toBeVisible();
    expect(screen.queryByText("Email queued. Delivery status will update after processing.")).not.toBeInTheDocument();
  });
  it("resends pending setup without treating accepted email delivery as an active account", async () => {
    current = { ...current, access: "setup_pending", invitation: { id: "invite-one", version: 3, status: "pending", deliveryStatus: "sent", expiresAt: "2026-10-12T08:00:00Z" },
      delivery: { ...current.delivery, state: "sent", sentAt: "2026-10-09T08:00:00Z" }, availableActions: ["resend_invitation"] };
    setup(); expect(await screen.findByText("Email sent")).toBeVisible();
    expect(screen.getByText("Password setup pending")).toBeVisible();
    expect(screen.queryByText("Account active")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resend invitation" }));
    expect(vendorLoginAccessApi.resend).toHaveBeenCalledWith("vendor-one", expect.objectContaining({ invitationId: "invite-one", expectedInvitationVersion: 3 }));
    expect(vendorLoginAccessApi.send).not.toHaveBeenCalled();
  });
  it("shows active account without password setup controls", async () => {
    current = { ...current, access: "active", availableActions: [] };
    setup(); expect(await screen.findByText("Account active")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Send invitation|Resend invitation/ })).not.toBeInTheDocument();
  });
  it.each(["paused", "unavailable"] as const)("explains %s and blocks send without claiming it was queued", async state => {
    current = { ...current, readiness: { state, reasonCode: null, lastProcessedAt: null }, availableActions: [] };
    setup(); expect(await screen.findByText(state === "paused" ? /delivery is paused/ : /delivery is unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send invitation" })).not.toBeInTheDocument();
    expect(vendorLoginAccessApi.send).not.toHaveBeenCalled();
  });
  it("keeps the original receipt and body on an uncertain retry after background refresh", async () => {
    vi.mocked(vendorLoginAccessApi.send).mockRejectedValue(new ApiError(503, "TEMPORARY", "private"));
    const view = setup(); await userEvent.click(await screen.findByRole("button", { name: "Send invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be confirmed");
    current = { ...current, vendorVersion: 9, availableActions: [] };
    await act(async () => { await view.client.invalidateQueries({ queryKey: vendorLoginAccessKeys.detail("buyer-one", "vendor-one") }); });
    await userEvent.click(screen.getByRole("button", { name: "Retry send request" }));
    await waitFor(() => expect(vendorLoginAccessApi.send).toHaveBeenCalledTimes(2));
    expect(vi.mocked(vendorLoginAccessApi.send).mock.calls[1]).toEqual(vi.mocked(vendorLoginAccessApi.send).mock.calls[0]);
  });
  it("clears a rejected conflict receipt and requires a new command against refreshed state", async () => {
    vi.mocked(vendorLoginAccessApi.send).mockRejectedValue(new ApiError(409, "STALE_VERSION", "private"));
    const view = setup(); await userEvent.click(await screen.findByRole("button", { name: "Send invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Access status changed");
    const first = vi.mocked(vendorLoginAccessApi.send).mock.calls[0][1];
    current = { ...current, vendorVersion: 8 };
    await act(async () => { await view.client.invalidateQueries({ queryKey: vendorLoginAccessKeys.detail("buyer-one", "vendor-one") }); });
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(vendorLoginAccessApi.send).toHaveBeenCalledTimes(2));
    expect(vi.mocked(vendorLoginAccessApi.send).mock.calls[1][1]).toMatchObject({ expectedVendorVersion: 8 });
    expect(vi.mocked(vendorLoginAccessApi.send).mock.calls[1][1].idempotencyKey).not.toBe(first.idempotencyKey);
  });
  it("disables duplicate submission and announces queued rather than sent", async () => {
    let resolve!: (detail: VendorLoginAccess) => void;
    vi.mocked(vendorLoginAccessApi.send).mockImplementation(() => new Promise(done => { resolve = done; }));
    setup(); const button = await screen.findByRole("button", { name: "Send invitation" });
    await userEvent.dblClick(button); expect(vendorLoginAccessApi.send).toHaveBeenCalledTimes(1); expect(button).toBeDisabled();
    current = { ...current, delivery: { ...current.delivery, state: "queued" }, availableActions: [] };
    await act(async () => resolve(current));
    expect(await screen.findByText("Email queued. Delivery status will update after processing.")).toBeVisible();
  });
  it("does not read without permission and never shows actions to read-only staff", async () => {
    auth.permissions = []; const hidden = setup(); expect(vendorLoginAccessApi.get).not.toHaveBeenCalled(); hidden.unmount();
    auth.permissions = ["procurement.vendor_access.read"];
    setup(); expect(await screen.findByText("vendor@example.test")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send invitation" })).not.toBeInTheDocument();
  });
  it("hides saved contact immediately when a mutation is denied even if the subsequent read is stale", async () => {
    vi.mocked(vendorLoginAccessApi.send).mockRejectedValue(new ApiError(403, "FORBIDDEN", "private"));
    setup(); await userEvent.click(await screen.findByRole("button", { name: "Send invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable for your current access");
    expect(screen.queryByText("vendor@example.test")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send invitation" })).not.toBeInTheDocument();
  });
  it("scopes cache and pending requests to the actor and rejects foreign vendor data", async () => {
    const view = setup(); await screen.findByText("vendor@example.test");
    expect(view.client.getQueryData(vendorLoginAccessKeys.detail("buyer-one", "vendor-one"))).toBeDefined();
    auth.actorId = "buyer-two"; current = { ...current, vendorId: "vendor-two" }; view.rerenderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("Vendor identity changed");
    expect(screen.queryByText("vendor@example.test")).not.toBeInTheDocument();
    expect(view.client.getQueryData(vendorLoginAccessKeys.detail("buyer-one", "vendor-one"))).toBeUndefined();
  });
  it("keeps dirty contact edits outside access refresh and disables send until edits close", async () => {
    const edit = vi.fn(); const view = setup({ contactEditing: true, onEditContact: edit });
    expect(await screen.findByRole("button", { name: "Send invitation" })).toBeDisabled();
    expect(screen.getByText(/Save or close vendor contact edits/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Refresh access" }));
    expect(screen.getByRole("button", { name: "Send invitation" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Edit vendor contact" })); expect(edit).toHaveBeenCalledOnce();
    view.rerenderPanel({ contactEditing: false, onEditContact: edit });
    expect(screen.getByRole("button", { name: "Send invitation" })).toBeEnabled();
  });
  it("has keyboard-accessible controls and no focused accessibility violations", async () => {
    const view = setup(); await screen.findByRole("button", { name: "Send invitation" });
    const user = userEvent.setup(); await user.tab(); expect(screen.getByRole("button", { name: "Refresh access" })).toHaveFocus();
    await user.tab(); expect(screen.getByRole("button", { name: "Send invitation" })).toHaveFocus();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  });
});
