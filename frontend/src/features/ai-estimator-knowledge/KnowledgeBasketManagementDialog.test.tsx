import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { KnowledgeBasketManagementDialog } from "./KnowledgeBasketManagementDialog";
import * as api from "./knowledgeApi";
import type { KnowledgeBasket, KnowledgeSubBasket, KnowledgeSubBasketDeletionImpact } from "./knowledgeTypes";

vi.mock("./knowledgeApi", async (original) => ({
  ...await original<typeof import("./knowledgeApi")>(),
  listKnowledgeBaskets: vi.fn(), listKnowledgeSubBaskets: vi.fn(), createKnowledgeSubBasket: vi.fn(),
  updateKnowledgeSubBasket: vi.fn(), getKnowledgeSubBasketDeletionImpact: vi.fn(), permanentlyDeleteKnowledgeSubBasket: vi.fn()
}));
const timestamp = "2026-09-23T12:00:00.000Z";
const basket: KnowledgeBasket = { id: "basket-one", name: "Floor finishes", description: null, displayOrder: 1, status: "active", version: 3, createdById: "super-admin", updatedById: "super-admin", createdAt: timestamp, updatedAt: timestamp };
const group: KnowledgeSubBasket = { id: "group-one", basketId: basket.id, name: "Polished stone", displayOrder: 1, version: 4, createdById: "super-admin", updatedById: "super-admin", createdAt: timestamp, updatedAt: timestamp };
const impact: KnowledgeSubBasketDeletionImpact = { basketId: basket.id, subBasketId: group.id, subBasketName: group.name, version: 4, mainLineCount: 2, referenceCount: 3, impactToken: "impact-one" };
const pagination = { limit: 100, offset: 0, hasMore: false, total: 1 };
let groups: KnowledgeSubBasket[];
function renderManager(props: Partial<Parameters<typeof KnowledgeBasketManagementDialog>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onCreate = vi.fn();
  return { queryClient, onCreate, ...render(<QueryClientProvider client={queryClient}><KnowledgeBasketManagementDialog canCreate canUpdate canLifecycle childDialogOpen={false} onClose={vi.fn()} onCreate={onCreate} onEdit={vi.fn()} onDelete={vi.fn()} {...props} /></QueryClientProvider>) };
}
async function openGroups(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: `Manage Sub-Baskets in ${basket.name}` }));
  await screen.findByRole("list", { name: `Sub-Baskets in ${basket.name}` });
}
async function openEditor(user: ReturnType<typeof userEvent.setup>, existing = true) {
  await openGroups(user);
  await user.click(screen.getByRole("button", { name: existing ? `Edit Sub-Basket ${group.name}` : "Add Sub-Basket" }));
  return screen.findByRole("dialog", { name: existing ? "Edit Sub-Basket name" : "Add Sub-Basket" });
}
async function openDelete(user: ReturnType<typeof userEvent.setup>) {
  await openGroups(user);
  await user.click(screen.getByRole("button", { name: `Delete Sub-Basket ${group.name} permanently` }));
  return screen.findByRole("alertdialog", { name: "Delete Sub-Basket?" });
}
async function confirmDelete(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.type(await within(dialog).findByRole("textbox", { name: "Type Sub-Basket name to confirm" }), group.name);
  await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Duplicate group");
  await user.click(within(dialog).getByRole("button", { name: "Delete Sub-Basket" }));
}
beforeEach(() => {
  vi.resetAllMocks(); groups = [group];
  vi.mocked(api.listKnowledgeBaskets).mockResolvedValue({ items: [basket], pagination });
  vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => ({ items: groups, pagination: { ...pagination, total: groups.length } }));
  vi.mocked(api.createKnowledgeSubBasket).mockImplementation(async (basketId, input) => {
    const created = { ...group, id: "group-new", basketId, name: input.name, version: 1 }; groups = [...groups, created]; return created;
  });
  vi.mocked(api.updateKnowledgeSubBasket).mockImplementation(async (_basketId, id, input) => {
    const updated = { ...group, id, name: input.name, version: input.expectedVersion + 1 }; groups = groups.map((entry) => entry.id === id ? updated : entry); return updated;
  });
  vi.mocked(api.getKnowledgeSubBasketDeletionImpact).mockResolvedValue(impact);
  vi.mocked(api.permanentlyDeleteKnowledgeSubBasket).mockImplementation(async () => {
    groups = []; return { basketId: basket.id, subBasketId: group.id, deleted: true, deletedAt: timestamp, deletedMainLineIds: ["child-a", "child-b"], deletedReferenceCount: 3 };
  });
});

describe("Configuration basket management", () => {
  it("loads authoritative groups on demand and reaches empty groups on later pages", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async (_id, params) => ({ items: params?.offset === 100 ? [{ ...group, id: "later", name: "Empty later group" }] : [group], pagination: { limit: 100, offset: params?.offset ?? 0, hasMore: params?.offset !== 100, total: 101 } }));
    renderManager(); expect(api.listKnowledgeSubBaskets).not.toHaveBeenCalled();
    await openGroups(user); await user.click(screen.getByRole("button", { name: "Next Sub-Basket page" }));
    expect(await screen.findByText("Empty later group")).toBeVisible();
    expect(api.listKnowledgeSubBaskets).toHaveBeenLastCalledWith(basket.id, { limit: 100, offset: 100 });
    await waitFor(() => expect(document.querySelector(".knowledge-basket-manager__results")).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Back to Main Baskets" })); expect(await screen.findByText(basket.name)).toBeVisible();
  });
  it("offers Main Basket creation and creates an independent empty Sub-Basket", async () => {
    const user = userEvent.setup(); const { onCreate } = renderManager();
    await user.click(screen.getByRole("button", { name: "Add main basket" })); expect(onCreate).toHaveBeenCalledOnce();
    const editor = await openEditor(user, false);
    await user.type(within(editor).getByRole("textbox", { name: "Sub-Basket name" }), "Lime plaster");
    await user.click(within(editor).getByRole("button", { name: "Add Sub-Basket" }));
    expect(await screen.findByText("Lime plaster")).toBeVisible(); expect(api.createKnowledgeSubBasket).toHaveBeenCalledWith(basket.id, { name: "Lime plaster" });
  });
  it("renames by stable identity with Configuration context", async () => {
    const user = userEvent.setup(); renderManager(); const editor = await openEditor(user);
    const name = within(editor).getByRole("textbox", { name: "Sub-Basket name" }); await user.clear(name); await user.type(name, "Honed stone");
    await user.click(within(editor).getByRole("button", { name: "Save name" })); expect(await screen.findByText("Honed stone")).toBeVisible();
    expect(api.updateKnowledgeSubBasket).toHaveBeenCalledWith(basket.id, group.id, { expectedVersion: 4, name: "Honed stone", managementContext: "configuration" });
  });
  it("preserves a proposed rename after conflict and requires loading the current version", async () => {
    const user = userEvent.setup(); vi.mocked(api.updateKnowledgeSubBasket).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere."));
    renderManager(); const editor = await openEditor(user); const name = within(editor).getByRole("textbox", { name: "Sub-Basket name" });
    await user.clear(name); await user.type(name, "Entered name"); await user.click(within(editor).getByRole("button", { name: "Save name" }));
    expect(await within(editor).findByText("Sub-Basket changed")).toBeVisible(); expect(name).toHaveValue("Entered name"); expect(within(editor).getByRole("button", { name: "Save name" })).toBeDisabled();
    groups = [{ ...group, version: 5, name: "Another editor’s name" }];
    await user.click(within(editor).getByRole("button", { name: "Load current Sub-Basket" })); expect(await within(editor).findByText(/Current saved name:/)).toHaveTextContent("Another editor’s name");
    await user.click(within(editor).getByRole("button", { name: "Save name" })); await waitFor(() => expect(api.updateKnowledgeSubBasket).toHaveBeenLastCalledWith(basket.id, group.id, { expectedVersion: 5, name: "Entered name", managementContext: "configuration" }));
  });
  it("shows counts and permits cancellation without mutation; exact name and reason are required", async () => {
    const user = userEvent.setup(); renderManager(); const dialog = await openDelete(user); await within(dialog).findByRole("textbox", { name: "Reason" });
    expect(within(dialog).getByText("2")).toBeVisible(); expect(within(dialog).getByText("3")).toBeVisible(); expect(within(dialog).getByRole("button", { name: "Delete Sub-Basket" })).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Type Sub-Basket name to confirm" }), group.name.toLowerCase()); await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Incorrect group");
    expect(within(dialog).getByRole("button", { name: "Delete Sub-Basket" })).toBeDisabled(); await user.click(within(dialog).getByRole("button", { name: "Cancel" })); expect(api.permanentlyDeleteKnowledgeSubBasket).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: `Delete Sub-Basket ${group.name} permanently` })).toHaveFocus());
  });
  it("deletes only with the confirmed token and returns focus to the surviving list", async () => {
    const user = userEvent.setup(); renderManager(); const dialog = await openDelete(user); await confirmDelete(user, dialog);
    expect(api.permanentlyDeleteKnowledgeSubBasket).toHaveBeenCalledWith(basket.id, group.id, { expectedVersion: 4, confirmationName: group.name, reason: "Duplicate group", impactToken: "impact-one" });
    expect(await screen.findByText("No Sub-Baskets have been added to this Main Basket.")).toBeVisible(); expect(screen.getByRole("status")).toHaveTextContent("was permanently deleted");
    await waitFor(() => expect(document.querySelector(".knowledge-basket-manager__results")).toHaveFocus());
  });
  it("clears exact-name confirmation after changed impact and never auto-retries", async () => {
    const user = userEvent.setup(); vi.mocked(api.permanentlyDeleteKnowledgeSubBasket).mockRejectedValueOnce(new ApiError(409, "DELETION_IMPACT_CHANGED", "References changed."));
    vi.mocked(api.getKnowledgeSubBasketDeletionImpact).mockResolvedValueOnce(impact).mockResolvedValue({ ...impact, impactToken: "impact-two", mainLineCount: 4 });
    renderManager(); const dialog = await openDelete(user); await confirmDelete(user, dialog);
    expect(await within(dialog).findByText("Deletion impact changed")).toBeVisible(); expect(within(dialog).getByRole("textbox", { name: "Type Sub-Basket name to confirm" })).toHaveValue(""); expect(within(dialog).getByRole("textbox", { name: "Reason" })).toHaveValue("Duplicate group"); expect(api.permanentlyDeleteKnowledgeSubBasket).toHaveBeenCalledTimes(1);
    await user.type(within(dialog).getByRole("textbox", { name: "Type Sub-Basket name to confirm" }), group.name); await user.click(within(dialog).getByRole("button", { name: "Delete Sub-Basket" }));
    await waitFor(() => expect(api.permanentlyDeleteKnowledgeSubBasket).toHaveBeenLastCalledWith(basket.id, group.id, expect.objectContaining({ impactToken: "impact-two" })));
  });
  it("blocks deletion until failed impact loads successfully", async () => {
    const user = userEvent.setup(); vi.mocked(api.getKnowledgeSubBasketDeletionImpact).mockRejectedValueOnce(new Error("Impact unavailable")); renderManager(); const dialog = await openDelete(user);
    expect(await within(dialog).findByText("Impact unavailable")).toBeVisible(); expect(within(dialog).getByRole("button", { name: "Delete Sub-Basket" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Retry impact check" })); expect(await within(dialog).findByRole("textbox", { name: "Reason" })).toBeVisible();
  });
  it("keeps confirmed creation separate from refresh failure and does not create twice", async () => {
    const user = userEvent.setup(); renderManager(); const editor = await openEditor(user, false);
    await user.type(within(editor).getByRole("textbox", { name: "Sub-Basket name" }), "Saved group"); vi.mocked(api.listKnowledgeSubBaskets).mockRejectedValueOnce(new Error("Refresh unavailable"));
    await user.click(within(editor).getByRole("button", { name: "Add Sub-Basket" })); expect(await within(editor).findByText("Sub-Basket saved")).toBeVisible(); expect(within(editor).queryByRole("button", { name: "Add Sub-Basket" })).not.toBeInTheDocument();
    await user.click(within(editor).getByRole("button", { name: "Retry catalog refresh" })); expect(await screen.findByText("Saved group")).toBeVisible(); expect(api.createKnowledgeSubBasket).toHaveBeenCalledTimes(1);
  });
  it("reconciles a lost create response and requires explicit reuse of the same existing ID", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createKnowledgeSubBasket).mockImplementationOnce(async (basketId, input) => {
      groups = [...groups, { ...group, id: "committed-group", basketId, name: input.name }];
      throw new Error("Response connection lost");
    });
    renderManager();
    const editor = await openEditor(user, false);
    const name = within(editor).getByRole("textbox", { name: "Sub-Basket name" });
    await user.type(name, "Committed group");
    await user.click(within(editor).getByRole("button", { name: "Add Sub-Basket" }));

    const reuse = await within(editor).findByRole("button", { name: "Use existing Sub-Basket" });
    expect(name).toBeDisabled();
    expect(name).toHaveValue("Committed group");
    expect(within(editor).getByRole("button", { name: "Add Sub-Basket" })).toBeDisabled();
    expect(api.createKnowledgeSubBasket).toHaveBeenCalledTimes(1);

    // A matching label on a different identity needs a fresh explicit choice.
    groups = groups.map((entry) => entry.id === "committed-group" ? { ...entry, id: "replacement-group" } : entry);
    await user.click(reuse);
    expect(await within(editor).findByRole("button", { name: "Use existing Sub-Basket" })).toBeVisible();
    expect(editor).toBeVisible();
    await user.click(within(editor).getByRole("button", { name: "Use existing Sub-Basket" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add Sub-Basket" })).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Sub-Basket “Committed group” saved.");
    expect(api.createKnowledgeSubBasket).toHaveBeenCalledTimes(1);
  });
  it("permits retry only after every parent-scoped catalog page confirms absence", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createKnowledgeSubBasket).mockRejectedValueOnce(new Error("Response connection lost"));
    renderManager();
    const editor = await openEditor(user, false);
    await user.type(within(editor).getByRole("textbox", { name: "Sub-Basket name" }), "New group");
    vi.mocked(api.listKnowledgeSubBaskets)
      .mockResolvedValueOnce({ items: [group], pagination: { ...pagination, hasMore: true, total: 2 } })
      .mockResolvedValueOnce({ items: [{ ...group, id: "other-parent", basketId: "different-basket", name: "New group" }], pagination: { ...pagination, offset: 1, total: 2 } });
    await user.click(within(editor).getByRole("button", { name: "Add Sub-Basket" }));

    expect(await within(editor).findByText("No matching Sub-Basket was found. You can try adding it again.")).toBeVisible();
    expect(api.listKnowledgeSubBaskets).toHaveBeenLastCalledWith(basket.id, { limit: 100, offset: 1 });
    expect(within(editor).getByRole("button", { name: "Add Sub-Basket" })).toBeEnabled();
    await user.click(within(editor).getByRole("button", { name: "Add Sub-Basket" }));
    expect(await screen.findByText("New group")).toBeVisible();
    expect(api.createKnowledgeSubBasket).toHaveBeenCalledTimes(2);
  });
  it("locks the name and create action when a complete reconciliation read fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createKnowledgeSubBasket).mockRejectedValueOnce(new Error("Response connection lost"));
    renderManager();
    const editor = await openEditor(user, false);
    const name = within(editor).getByRole("textbox", { name: "Sub-Basket name" });
    await user.type(name, "Unresolved group");
    vi.mocked(api.listKnowledgeSubBaskets)
      .mockResolvedValueOnce({ items: [{ ...group, name: "Unresolved group" }], pagination: { ...pagination, hasMore: true, total: 2 } })
      .mockRejectedValueOnce(new Error("Later catalog page unavailable"));
    await user.click(within(editor).getByRole("button", { name: "Add Sub-Basket" }));

    const checkAgain = await within(editor).findByRole("button", { name: "Check Sub-Baskets again" });
    expect(name).toBeDisabled();
    expect(name).toHaveValue("Unresolved group");
    expect(within(editor).getByRole("button", { name: "Add Sub-Basket" })).toBeDisabled();
    expect(within(editor).queryByRole("button", { name: "Use existing Sub-Basket" })).not.toBeInTheDocument();
    await user.type(name, "Different name");
    await user.click(within(editor).getByRole("button", { name: "Add Sub-Basket" }));
    expect(name).toHaveValue("Unresolved group");
    expect(api.createKnowledgeSubBasket).toHaveBeenCalledTimes(1);
    await user.click(checkAgain);
    expect(await within(editor).findByText("No matching Sub-Basket was found. You can try adding it again.")).toBeVisible();
    expect(name).toBeEnabled();
    expect(api.createKnowledgeSubBasket).toHaveBeenCalledTimes(1);
  });
  it("keeps confirmed deletion separate from refresh failure and does not delete twice", async () => {
    const user = userEvent.setup(); renderManager(); const dialog = await openDelete(user); vi.mocked(api.listKnowledgeSubBaskets).mockRejectedValueOnce(new Error("Refresh unavailable")); await confirmDelete(user, dialog);
    expect(await within(dialog).findByText("Sub-Basket deleted")).toBeVisible(); expect(within(dialog).queryByRole("button", { name: "Delete Sub-Basket" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Retry catalog refresh" })); expect(await screen.findByText("No Sub-Baskets have been added to this Main Basket.")).toBeVisible(); expect(api.permanentlyDeleteKnowledgeSubBasket).toHaveBeenCalledTimes(1);
  });
  it("respects action permissions and archived parents", async () => {
    const user = userEvent.setup(); const view = renderManager({ canCreate: false, canUpdate: false, canLifecycle: false });
    expect(screen.queryByRole("button", { name: "Add main basket" })).not.toBeInTheDocument(); await openGroups(user); expect(screen.queryByRole("button", { name: "Add Sub-Basket" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: `Edit Sub-Basket ${group.name}` })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: `Delete Sub-Basket ${group.name} permanently` })).not.toBeInTheDocument();
    view.unmount(); vi.mocked(api.listKnowledgeBaskets).mockResolvedValue({ items: [{ ...basket, status: "archived" }], pagination }); renderManager(); await openGroups(user);
    expect(screen.getByText(/Its Sub-Baskets are read-only/)).toBeVisible(); expect(screen.queryByRole("button", { name: "Add Sub-Basket" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: `Edit Sub-Basket ${group.name}` })).not.toBeInTheDocument();
  });
  it("exposes accessible deletion confirmation", async () => {
    const user = userEvent.setup(); renderManager(); const dialog = await openDelete(user); await within(dialog).findByRole("textbox", { name: "Reason" });
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  });
});
