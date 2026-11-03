import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { createRef, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import type { PermissionCode } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import * as api from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { KnowledgeSubBasketDeleteDialog } from "./KnowledgeSubBasketDialogs";
import { KnowledgeVendorBlockers, type KnowledgeVendorBlockersProps } from "./KnowledgeVendorBlockers";
import type { KnowledgeBasket, KnowledgeMaster, KnowledgeSubBasket } from "./knowledgeTypes";

let permissions: readonly PermissionCode[] | undefined;
let actorId = "admin-one";
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: actorId, role: "super_admin" }, authorization: authorizationFor("super_admin", permissions) }) }));
vi.mock("./knowledgeApi", async (original) => ({ ...await original<typeof import("./knowledgeApi")>(),
  listKnowledgeMasters: vi.fn(), getKnowledgeSubBasketDeletionImpact: vi.fn(), permanentlyDeleteKnowledgeSubBasket: vi.fn()
}));

const timestamp = "2026-11-03T08:00:00.000Z";
const vendor = (id: string, status: KnowledgeMaster["status"] = "active"): KnowledgeMaster => ({
  id, masterType: "vendors", name: "Stone specialists", code: `VEN-${id}`, description: null, displayOrder: 1,
  status, version: 1, createdAt: timestamp, updatedAt: timestamp, createdById: "admin-one", updatedById: "admin-one"
});
const page = (items: KnowledgeMaster[], total = items.length, offset = 0) => ({ items, pagination: { total, offset, limit: 20, hasMore: offset + items.length < total } });
const basket: KnowledgeBasket = { id: "basket-one", name: "Floor finishes", description: null, displayOrder: 1, status: "active", version: 2, createdById: actorId, updatedById: actorId, createdAt: timestamp, updatedAt: timestamp };
const subBasket: KnowledgeSubBasket = { ...basket, id: "sub-one", basketId: basket.id, name: "Stone" };
const impact = { basketId: basket.id, subBasketId: subBasket.id, subBasketName: subBasket.name, version: 2, mainLineCount: 0, referenceCount: 0, vendorReferenceCount: 1, impactToken: "one" };

function start(props: Partial<KnowledgeVendorBlockersProps> = {}) {
  const onOpenVendor = vi.fn(); const onRefreshImpact = vi.fn(); const onMismatchChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const element = () => <KnowledgeVendorBlockers basketId={basket.id} vendorReferenceCount={1}
    onOpenVendor={onOpenVendor} onRefreshImpact={onRefreshImpact} onMismatchChange={onMismatchChange} {...props} />;
  const view = render(<QueryClientProvider client={client}>{element()}</QueryClientProvider>);
  return { ...view, client, onOpenVendor, onRefreshImpact, onMismatchChange,
    rerenderBlockers: (replacement?: ReactElement) => view.rerender(<QueryClientProvider client={client}>{replacement ?? element()}</QueryClientProvider>) };
}

beforeEach(() => {
  permissions = undefined; actorId = "admin-one"; vi.resetAllMocks();
  vi.mocked(api.listKnowledgeMasters).mockResolvedValue(page([vendor("one")]));
  vi.mocked(api.getKnowledgeSubBasketDeletionImpact).mockResolvedValue(impact);
});

describe("vendors blocking basket deletion", () => {
  it.each([undefined, "sub-one"])("loads exact retained classifications for target %s", async (subBasketId) => {
    const view = start({ subBasketId });
    const open = await screen.findByRole("button", { name: "Open vendor details for Stone specialists (VEN-one)" });
    expect(api.listKnowledgeMasters).toHaveBeenCalledExactlyOnceWith("vendors", {
      includeArchived: true, limit: 20, offset: 0, ...(subBasketId ? { subBasketId } : { mainBasketId: basket.id })
    });
    await userEvent.setup().click(open); expect(view.onOpenVendor).toHaveBeenCalledExactlyOnceWith("one");
    expect(view.onMismatchChange).toHaveBeenLastCalledWith(false);
  });

  it("distinguishes duplicate names and archived vendors across pages and focuses page results", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => vendor(String(index + 1), index === 20 ? "archived" : index === 1 ? "inactive" : "active"));
    vi.mocked(api.listKnowledgeMasters).mockImplementation(async (_type, params) => page(rows.slice(params?.offset ?? 0, (params?.offset ?? 0) + 20), 21, params?.offset));
    const view = start({ vendorReferenceCount: 21 }); const user = userEvent.setup();
    expect(await screen.findByText("VEN-2 · Inactive")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    await user.click(screen.getByRole("button", { name: "Next assigned vendor page" }));
    expect(await screen.findByText("VEN-21 · Archived")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Next assigned vendor page" })).toBeDisabled();
    await waitFor(() => expect(document.querySelector(".knowledge-vendor-blockers__results")).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Open vendor details for Stone specialists (VEN-21)" }));
    expect(view.onOpenVendor).toHaveBeenCalledExactlyOnceWith("21");
    await user.click(screen.getByRole("button", { name: "Previous assigned vendor page" }));
    expect(await screen.findByText("VEN-1 · Active")).toBeVisible();
  });

  it("does not fetch vendor names without directory access", async () => {
    permissions = ["ai_estimator_knowledge.configuration.lifecycle"];
    start(); expect(screen.getByText(/You do not have access to the vendors/)).toBeVisible();
    expect(api.listKnowledgeMasters).not.toHaveBeenCalled();
  });

  it("shows permitted names without a details action when the destination route is denied", async () => {
    permissions = ["procurement.vendor_directory.read"];
    start(); expect(await screen.findByText("VEN-one · Active")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Open vendor details/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Vendor details navigation is unavailable/)).toBeVisible();
  });

  it.each([401, 403])("hides cached names after server revokes access with %s", async (status) => {
    const view = start(); await screen.findByText("VEN-one · Active");
    vi.mocked(api.listKnowledgeMasters).mockRejectedValue(new ApiError(status, "FORBIDDEN", "Access changed"));
    await act(async () => { await view.client.invalidateQueries({ queryKey: knowledgeQueryKeys.masterLists("vendors") }); });
    expect(await screen.findByText(/You do not have access to the vendors/)).toBeVisible();
    expect(screen.queryByText("Stone specialists")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open vendor details/ })).not.toBeInTheDocument();
    expect(view.onMismatchChange).toHaveBeenLastCalledWith(true);
  });

  it("hides cached names immediately when local permissions are revoked", async () => {
    const view = start(); await screen.findByText("VEN-one · Active");
    permissions = []; view.rerenderBlockers();
    expect(screen.queryByText("Stone specialists")).not.toBeInTheDocument();
    expect(screen.getByText(/You do not have access to the vendors/)).toBeVisible();
  });

  it("does not share cached blocker pages between actors", async () => {
    const view = start(); await screen.findByText("VEN-one · Active");
    vi.mocked(api.listKnowledgeMasters).mockImplementation(() => new Promise(() => {}));
    actorId = "admin-two"; view.rerenderBlockers();
    expect(screen.queryByText("Stone specialists")).not.toBeInTheDocument();
    expect(screen.getByText("Loading assigned vendors…")).toBeVisible();
    await waitFor(() => expect(api.listKnowledgeMasters).toHaveBeenCalledTimes(2));
  });

  it("keeps a failed load unverified and retries the list and authoritative impact", async () => {
    vi.mocked(api.listKnowledgeMasters).mockRejectedValueOnce(new Error("Directory unavailable"));
    const view = start(); const user = userEvent.setup();
    expect(await screen.findByText("Assigned vendors could not be loaded")).toBeVisible();
    expect(view.onMismatchChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Retry vendor list and impact" }));
    expect(await screen.findByText("VEN-one · Active")).toBeVisible();
    expect(view.onRefreshImpact).toHaveBeenCalledOnce();
    await waitFor(() => expect(view.onMismatchChange).toHaveBeenLastCalledWith(false));
  });

  it("does not reinterpret an empty vendor list as a safe deletion impact", async () => {
    vi.mocked(api.listKnowledgeMasters).mockResolvedValue(page([]));
    const view = start();
    expect(await screen.findByText("Vendor assignments changed")).toBeVisible();
    expect(screen.getByText(/No assigned vendors were found/)).toBeVisible();
    expect(view.onMismatchChange).toHaveBeenLastCalledWith(true);
    expect(view.onRefreshImpact).not.toHaveBeenCalled();
  });

  it("shows failed pagination with retry and keeps previous-page navigation", async () => {
    vi.mocked(api.listKnowledgeMasters).mockResolvedValue(page([vendor("one")], 21));
    const view = start({ vendorReferenceCount: 21 }); const user = userEvent.setup();
    await screen.findByText("VEN-one · Active");
    vi.mocked(api.listKnowledgeMasters).mockRejectedValueOnce(new Error("Page unavailable"));
    await user.click(screen.getByRole("button", { name: "Next assigned vendor page" }));
    expect(await screen.findByText("Assigned vendors could not be loaded")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous assigned vendor page" })).toBeEnabled();
    expect(view.onMismatchChange).toHaveBeenLastCalledWith(true);
    vi.mocked(api.listKnowledgeMasters).mockResolvedValue(page([vendor("last", "archived")], 21, 20));
    await user.click(screen.getByRole("button", { name: "Retry vendor list and impact" }));
    expect(await screen.findByText("VEN-last · Archived")).toBeVisible();
  });

  it("keeps refresh failures explicit and never triggers navigation or deletion", async () => {
    const view = start({ onRefreshImpact: vi.fn().mockRejectedValue(new Error("Impact unavailable")) });
    await screen.findByText("VEN-one · Active");
    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh vendor list and impact" }));
    expect(await screen.findByText(/latest vendor assignments or deletion impact could not be loaded/)).toBeVisible();
    expect(view.onOpenVendor).not.toHaveBeenCalled();
    expect(api.permanentlyDeleteKnowledgeSubBasket).not.toHaveBeenCalled();
  });

  it("supports keyboard activation and has no automated accessibility violations", async () => {
    const view = start(); const user = userEvent.setup();
    const open = await screen.findByRole("button", { name: /Open vendor details/ });
    open.focus(); await user.keyboard("{Enter}"); expect(view.onOpenVendor).toHaveBeenCalledWith("one");
    const result = await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it("requires matched fresh data and a new confirmation after Sub-basket blockers are removed", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const onOpenVendor = vi.fn();
    render(<QueryClientProvider client={client}><KnowledgeSubBasketDeleteDialog basket={basket} subBasket={subBasket}
      fallbackFocusRef={createRef()} onClose={vi.fn()} onDeleted={vi.fn()} onOpenVendor={onOpenVendor} /></QueryClientProvider>);
    const user = userEvent.setup(); const dialog = screen.getByRole("alertdialog");
    await within(dialog).findByText("VEN-one · Active");
    await user.click(within(dialog).getByRole("button", { name: /Open vendor details/ }));
    expect(onOpenVendor).toHaveBeenCalledWith("one");
    const name = within(dialog).getByRole("textbox", { name: "Type Sub-Basket name to confirm" });
    await user.type(name, subBasket.name);
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Duplicate group");
    const remove = within(dialog).getByRole("button", { name: "Delete Sub-Basket" });
    expect(remove).toBeDisabled();
    vi.mocked(api.getKnowledgeSubBasketDeletionImpact).mockResolvedValue({ ...impact, vendorReferenceCount: 0, impactToken: "two" });
    await user.click(within(dialog).getByRole("button", { name: "Refresh vendor list and impact" }));
    expect(await within(dialog).findByText("Vendor assignments changed")).toBeVisible();
    expect(name).toHaveValue(""); await user.type(name, subBasket.name); expect(remove).toBeDisabled();
    vi.mocked(api.listKnowledgeMasters).mockResolvedValue(page([]));
    await user.click(within(dialog).getByRole("button", { name: "Refresh vendor list and impact" }));
    await waitFor(() => expect(within(dialog).queryByText("Vendor assignments changed")).not.toBeInTheDocument());
    expect(name).toHaveValue(""); expect(remove).toBeDisabled();
    await user.type(name, subBasket.name); expect(remove).toBeEnabled();
    expect(api.permanentlyDeleteKnowledgeSubBasket).not.toHaveBeenCalled();
  });
});
