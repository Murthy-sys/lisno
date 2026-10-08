import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { KnowledgeBaseIndexPage } from "./KnowledgeBaseIndexPage";
import * as knowledgeApi from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeItemListItem, KnowledgeSubBasket } from "./knowledgeTypes";

const auth = vi.hoisted(() => ({ lifecycle: true, role: "super_admin" }));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ status: "authenticated", user: { id: "admin-1", name: "Admin", role: auth.role }, authorization: {} })
}));
vi.mock("../../auth/authorization", () => ({
  hasFrontendPermission: (_authorization: unknown, permission: string) =>
    permission === "ai_estimator_knowledge.configuration.lifecycle" ? auth.lifecycle : true
}));
vi.mock("./knowledgeApi", async (importOriginal) => ({
  ...await importOriginal<typeof import("./knowledgeApi")>(),
  listKnowledgeItems: vi.fn(),
  listKnowledgeBaskets: vi.fn(),
  listKnowledgeSubBaskets: vi.fn(),
  listKnowledgeMasters: vi.fn(),
  getKnowledgeItem: vi.fn(),
  permanentlyDeleteKnowledgeMainLine: vi.fn()
}));

const timestamp = "2026-10-08T08:00:00.000Z";
const actor = { createdById: "admin-1", updatedById: "admin-1", createdAt: timestamp, updatedAt: timestamp };
const pagination = { limit: 100, offset: 0, total: 0, hasMore: false };
const basket: KnowledgeBasket = { ...actor, id: "basket-pop", name: "POP / Gypsum", description: null, displayOrder: 0, status: "active", version: 3 };
const otherBasket: KnowledgeBasket = { ...basket, id: "basket-other", name: "Carpentry", version: 9 };
const group: KnowledgeSubBasket = { ...actor, id: "sub-ceiling", basketId: basket.id, name: "False ceiling", displayOrder: 0, version: 4 };
const otherGroup: KnowledgeSubBasket = { ...group, id: "sub-other", basketId: otherBasket.id, name: "Wall finishes", version: 12 };

function line(overrides: Partial<KnowledgeItemListItem> = {}): KnowledgeItemListItem {
  return {
    ...actor, id: "line-pop", itemType: "main_line", completionRequired: false,
    basketId: basket.id, basketName: basket.name, subBasketId: group.id, subBasketName: group.name,
    mainLineId: "line-pop", mainLineName: "POP ceiling", description: null, status: "draft",
    activeRevisionId: null, draftRevisionId: "revision-pop", revisionNumber: 1,
    uomId: null, priorityId: null, modeIds: [], surfaceIds: [], vendorIds: [],
    completeness: { percentage: 25, sections: [], blockers: [], warnings: [] },
    allowedActions: ["archive"], version: 2, ...overrides
  };
}

function detail(item: KnowledgeItemListItem, overrides: Partial<KnowledgeItemDetail> = {}): KnowledgeItemDetail {
  return { ...item, activeRevision: null, draftRevision: null, blockers: [], warnings: [], ...overrides };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setupHierarchy(initialItems: KnowledgeItemListItem[] = [line()]) {
  const state = {
    items: initialItems,
    baskets: [basket, otherBasket],
    groups: [group, otherGroup],
    details: new Map(initialItems.map((item) => [item.mainLineId, detail(item, { version: item.version + 5 })]))
  };
  vi.mocked(knowledgeApi.listKnowledgeBaskets).mockImplementation(async () => ({ items: state.baskets, pagination: { ...pagination, total: state.baskets.length } }));
  vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockImplementation(async (basketId) => {
    const items = state.groups.filter((entry) => entry.basketId === basketId);
    return { items, pagination: { ...pagination, total: items.length } };
  });
  vi.mocked(knowledgeApi.listKnowledgeItems).mockImplementation(async (params = {}) => {
    const matched = state.items.filter((item) => !params.search || item.mainLineName.toLowerCase().includes(params.search.toLowerCase()));
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 20;
    return { items: matched.slice(offset, offset + limit), pagination: { offset, limit, total: matched.length, hasMore: offset + limit < matched.length } };
  });
  vi.mocked(knowledgeApi.getKnowledgeItem).mockImplementation(async (id) => {
    const current = state.details.get(id);
    if (!current) throw new ApiError(404, "NOT_FOUND", "Main Line no longer exists.");
    return current;
  });
  vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeMainLine).mockImplementation(async (id) => {
    state.items = state.items.filter((item) => item.mainLineId !== id);
    state.details.delete(id);
    return { mainLineId: id, deleted: true, deletedAt: timestamp };
  });
  return state;
}

function renderIndex() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const content = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/configuration/estimation"]}>
        <Routes><Route path="/admin/configuration/estimation" element={<main><KnowledgeBaseIndexPage /></main>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(content());
  return { ...view, queryClient, rerenderIndex: () => view.rerender(content()) };
}

async function expand(user: ReturnType<typeof userEvent.setup>, name = group.name) {
  const control = await screen.findByRole("button", { name });
  if (control.getAttribute("aria-expanded") !== "true") await user.click(control);
  return control;
}

async function openDelete(user: ReturnType<typeof userEvent.setup>, name = "POP ceiling", container: HTMLElement = document.body) {
  const trigger = await within(container).findByRole("button", { name: `Delete Main Line ${name} permanently` });
  await user.click(trigger);
  const dialog = screen.getByRole("alertdialog", { name: "Delete this Main Line?" });
  return { trigger, dialog };
}

async function enterReason(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "  Remove obsolete configuration  ");
  const confirm = within(dialog).getByRole("button", { name: "Delete permanently" });
  await waitFor(() => expect(confirm).toBeEnabled());
  return confirm;
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.role = "super_admin";
  auth.lifecycle = true;
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockResolvedValue({ items: [], pagination });
});

describe("direct Main Line deletion", () => {
  it.each(["draft", "inactive"] as const)("reviews fresh detail, requires a reason, deletes only the chosen same-named %s line and preserves its empty parent", async (status) => {
    const sameName = line({ id: "line-other", mainLineId: "line-other", basketId: otherBasket.id, basketName: otherBasket.name, subBasketId: otherGroup.id, subBasketName: otherGroup.name, version: 13 });
    const state = setupHierarchy([line({ status }), sameName]);
    const user = userEvent.setup();
    renderIndex();
    const header = await expand(user);
    await expand(user, otherGroup.name);
    const section = screen.getByRole("heading", { level: 2, name: basket.name }).closest("section")!;
    const { dialog } = await openDelete(user, "POP ceiling", section);
    expect(within(dialog).getByRole("button", { name: "Delete permanently" })).toBeDisabled();
    expect(await within(dialog).findByText(/POP ceiling/u)).toBeVisible();
    expect(dialog).toHaveTextContent(basket.name);
    expect(dialog).toHaveTextContent(group.name);
    const confirm = await enterReason(user, dialog);
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(knowledgeApi.getKnowledgeItem).toHaveBeenCalledWith("line-pop");
    expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledExactlyOnceWith("line-pop", { expectedVersion: 7, reason: "Remove obsolete configuration" });
    expect(state.items).toEqual([sameName]);
    expect(screen.getByRole("link", { name: "POP ceiling" })).toHaveAttribute("href", expect.stringContaining("line-other"));
    expect(screen.getByText("No items in this Sub-Basket yet.")).toBeVisible();
    expect(header).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(header).toHaveFocus());
  });

  it("cancels from the keyboard without a mutation and returns focus to the card action", async () => {
    setupHierarchy();
    const user = userEvent.setup();
    renderIndex();
    await expand(user);
    const { trigger, dialog } = await openDelete(user);
    await enterReason(user, dialog);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it.each([
    ["non Super Admin", () => { auth.role = "admin"; }, {}],
    ["missing lifecycle permission", () => { auth.lifecycle = false; }, {}],
    ["active line", () => {}, { status: "active" as const }],
    ["nondeletable line", () => {}, { allowedActions: [] }],
    ["temporary item", () => {}, { itemType: "temporary" as const }]
  ])("does not expose deletion for %s", async (_name, configure, overrides) => {
    configure();
    setupHierarchy([line(overrides as Partial<KnowledgeItemListItem>)]);
    const user = userEvent.setup();
    renderIndex();
    await expand(user);
    expect(screen.getByRole("link", { name: "POP ceiling" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Delete Main Line/u })).not.toBeInTheDocument();
  });

  it.each(["missing parent", "archived parent", "missing Sub-Basket", "wrong parent", "failed parent catalogue", "failed Sub-Basket catalogue"])("denies the card action for %s", async (scenario) => {
    const state = setupHierarchy();
    if (scenario === "missing parent") state.baskets = [otherBasket];
    if (scenario === "archived parent") state.baskets = [{ ...basket, status: "archived" }, otherBasket];
    if (scenario === "missing Sub-Basket") state.groups = [otherGroup];
    if (scenario === "wrong parent") state.groups = [{ ...group, basketId: otherBasket.id }];
    if (scenario === "failed parent catalogue") vi.mocked(knowledgeApi.listKnowledgeBaskets).mockRejectedValue(new Error("Catalogue unavailable"));
    if (scenario === "failed Sub-Basket catalogue") vi.mocked(knowledgeApi.listKnowledgeSubBaskets).mockRejectedValue(new Error("Catalogue unavailable"));
    const user = userEvent.setup();
    renderIndex();
    await expand(user);
    expect(screen.getByRole("link", { name: "POP ceiling" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Delete Main Line/u })).not.toBeInTheDocument();
  });

  it("cannot confirm while current detail is loading even when an old detail is cached", async () => {
    setupHierarchy();
    const current = deferred<KnowledgeItemDetail>();
    vi.mocked(knowledgeApi.getKnowledgeItem).mockReturnValue(current.promise);
    const user = userEvent.setup();
    const { queryClient } = renderIndex();
    queryClient.setQueryData(knowledgeQueryKeys.item("line-pop"), detail(line(), { version: 1 }));
    await expand(user);
    const { dialog } = await openDelete(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Obsolete");
    expect(within(dialog).getByRole("button", { name: "Delete permanently" })).toBeDisabled();
    await act(async () => current.resolve(detail(line(), { version: 23 })));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Delete permanently" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledWith("line-pop", { expectedVersion: 23, reason: "Obsolete" }));
  });

  it.each([
    ["moved Main Basket", { basketId: otherBasket.id }],
    ["moved Sub-Basket", { subBasketId: "sub-moved" }],
    ["different stable ID", { id: "line-other", mainLineId: "line-other" }],
    ["inconsistent detail ID", { id: "line-other" }],
    ["newly active", { status: "active" as const }],
    ["newly temporary", { itemType: "temporary" as const }],
    ["lost allowed action", { allowedActions: [] }]
  ])("blocks an invalid fresh detail: %s", async (_scenario, overrides) => {
    setupHierarchy();
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue(detail(line(), overrides));
    const user = userEvent.setup();
    renderIndex();
    await expand(user);
    const { dialog } = await openDelete(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Obsolete");
    expect(within(dialog).getByRole("button", { name: "Delete permanently" })).toBeDisabled();
    expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toBeVisible();
  });

  it.each([404, 403, 503])("blocks unreadable current detail (HTTP %s) without a destructive request", async (status) => {
    setupHierarchy();
    vi.mocked(knowledgeApi.getKnowledgeItem).mockRejectedValue(new ApiError(status, "UNAVAILABLE", "Main Line cannot be read."));
    const user = userEvent.setup();
    renderIndex();
    await expand(user);
    const { dialog } = await openDelete(user);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Main Line cannot be read.");
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Obsolete");
    expect(within(dialog).getByRole("button", { name: "Delete permanently" })).toBeDisabled();
    expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).not.toHaveBeenCalled();
  });

  it.each(["permission", "basket catalogue", "Sub-Basket catalogue"])("blocks confirmation after live %s loss", async (scenario) => {
    setupHierarchy();
    const user = userEvent.setup();
    const { queryClient, rerenderIndex } = renderIndex();
    await expand(user);
    const { dialog } = await openDelete(user);
    const confirm = await enterReason(user, dialog);
    if (scenario === "permission") {
      auth.lifecycle = false;
      rerenderIndex();
    } else {
      const api = scenario === "basket catalogue" ? knowledgeApi.listKnowledgeBaskets : knowledgeApi.listKnowledgeSubBaskets;
      vi.mocked(api).mockRejectedValue(new Error("Catalogue access lost"));
      await act(async () => { await queryClient.invalidateQueries({ queryKey: scenario === "basket catalogue" ? knowledgeQueryKeys.basketLists() : knowledgeQueryKeys.subBasketLists(basket.id) }); });
    }
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).not.toHaveBeenCalled();
  });

  it.each(["active", "moved", "missing", "unreadable"])("blocks confirmation when the live item list becomes %s", async (scenario) => {
    const state = setupHierarchy();
    const user = userEvent.setup();
    const { queryClient } = renderIndex();
    await expand(user);
    const { dialog } = await openDelete(user);
    const confirm = await enterReason(user, dialog);
    if (scenario === "active") state.items = [line({ status: "active" })];
    if (scenario === "moved") state.items = [line({ subBasketId: otherGroup.id })];
    if (scenario === "missing") state.items = [];
    if (scenario === "unreadable") vi.mocked(knowledgeApi.listKnowledgeItems).mockRejectedValue(new Error("Item access lost"));
    await act(async () => { await queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.itemLists() }); });
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(within(dialog).getByRole("alert")).toBeVisible();
    expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).not.toHaveBeenCalled();
  });

  it("protects against same-tick and pending duplicate submissions", async () => {
    setupHierarchy();
    const mutation = deferred<{ mainLineId: string; deleted: true; deletedAt: string }>();
    vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeMainLine).mockReturnValue(mutation.promise);
    const user = userEvent.setup();
    renderIndex();
    await expand(user);
    const { dialog } = await openDelete(user);
    const confirm = await enterReason(user, dialog);
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    await waitFor(() => expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledTimes(1));
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(confirm);
    expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledTimes(1);
    await act(async () => mutation.resolve({ mainLineId: "line-pop", deleted: true, deletedAt: timestamp }));
  });

  it("retains the line and reason after a failed mutation", async () => {
    setupHierarchy();
    vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeMainLine).mockRejectedValue(new Error("Deletion temporarily unavailable."));
    const user = userEvent.setup();
    renderIndex();
    await expand(user);
    const { dialog } = await openDelete(user);
    await user.click(await enterReason(user, dialog));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Deletion temporarily unavailable.");
    expect(within(dialog).getByRole("textbox", { name: "Reason" })).toHaveValue("  Remove obsolete configuration  ");
    expect(screen.getByRole("link", { name: "POP ceiling", hidden: true })).toBeInTheDocument();
  });

  it("requires an explicit fresh review and second confirmation after a version conflict", async () => {
    const state = setupHierarchy();
    const user = userEvent.setup();
    const deleteMock = vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeMainLine);
    deleteMock.mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "This Main Line changed. Reload its current details."));
    renderIndex();
    await expand(user);
    const { dialog } = await openDelete(user);
    await user.click(await enterReason(user, dialog));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This Main Line changed.");
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "Delete permanently" })).toBeDisabled();
    state.details.set("line-pop", detail(line(), { version: 28, mainLineName: "Reviewed POP ceiling" }));
    await user.click(within(dialog).getByRole("button", { name: "Load current Main Line" }));
    expect(await within(dialog).findByText("Reviewed POP ceiling")).toBeVisible();
    expect(deleteMock).toHaveBeenCalledTimes(1);
    const reason = within(dialog).getByRole("textbox", { name: "Reason" });
    await user.clear(reason);
    await user.type(reason, "Confirmed obsolete after review");
    const confirm = within(dialog).getByRole("button", { name: "Delete permanently" });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await waitFor(() => expect(deleteMock).toHaveBeenNthCalledWith(2, "line-pop", { expectedVersion: 28, reason: "Confirmed obsolete after review" }));
  });

  it("recovers from a failed current-detail read without automatically deleting", async () => {
    setupHierarchy();
    vi.mocked(knowledgeApi.getKnowledgeItem).mockRejectedValueOnce(new Error("Current detail is unavailable."));
    const user = userEvent.setup();
    renderIndex();
    await expand(user);
    const { dialog } = await openDelete(user);
    await within(dialog).findByText("Current detail is unavailable.");
    await user.click(within(dialog).getByRole("button", { name: "Retry Main Line" }));
    const confirm = await enterReason(user, dialog);
    expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).not.toHaveBeenCalled();
    await user.click(confirm);
    await waitFor(() => expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledTimes(1));
  });

  it("keeps committed removal after a refresh failure and retries only catalogue reads", async () => {
    const state = setupHierarchy([line(), line({ id: "line-sibling", mainLineId: "line-sibling", mainLineName: "Retained cove" })]);
    vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeMainLine).mockImplementation(async (id) => {
      state.items = state.items.filter((item) => item.mainLineId !== id);
      vi.mocked(knowledgeApi.listKnowledgeItems).mockRejectedValue(new Error("Catalogue refresh unavailable."));
      return { mainLineId: id, deleted: true, deletedAt: timestamp };
    });
    const user = userEvent.setup();
    const { queryClient } = renderIndex();
    await expand(user);
    const { dialog } = await openDelete(user);
    await user.click(await enterReason(user, dialog));
    const retry = await within(dialog).findByRole("button", { name: "Retry catalog refresh" });
    expect(dialog).toHaveTextContent(/deleted/iu);
    expect(within(dialog).queryByRole("button", { name: "Delete permanently" })).not.toBeInTheDocument();
    expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledTimes(1);
    const listCaches = queryClient.getQueriesData<{ items: KnowledgeItemListItem[] }>({ queryKey: knowledgeQueryKeys.itemLists() });
    for (const [, cached] of listCaches) expect(cached?.items.some((item) => item.mainLineId === "line-pop")).toBe(false);
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: state.items, pagination: { ...pagination, limit: 20, total: 1 } });
    await user.click(retry);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Retained cove" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "POP ceiling" })).not.toBeInTheDocument();
  });

  it("moves back to the previous page when deleting the only item on the final page", async () => {
    setupHierarchy(Array.from({ length: 21 }, (_, index) => line({ id: `line-${index}`, mainLineId: `line-${index}`, mainLineName: `Ceiling ${index}`, subBasketId: null, subBasketName: null })));
    const user = userEvent.setup();
    renderIndex();
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await screen.findByText("21–21 of 21");
    await expand(user, "Items directly under Main Basket");
    const { dialog } = await openDelete(user, "Ceiling 20");
    await user.click(await enterReason(user, dialog));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("link", { name: "Ceiling 0" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Ceiling 20" })).not.toBeInTheDocument();
    expect(knowledgeApi.listKnowledgeItems).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
  });

  it("preserves a search filter and restores focus when its last matching parent disappears", async () => {
    setupHierarchy();
    const user = userEvent.setup();
    renderIndex();
    await screen.findByRole("button", { name: group.name });
    await user.type(screen.getByRole("searchbox", { name: "Search Basket or Main Line" }), "POP ceiling");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const { dialog } = await openDelete(user);
    await user.click(await enterReason(user, dialog));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("searchbox", { name: "Search Basket or Main Line" })).toHaveValue("POP ceiling");
    expect(screen.getByRole("button", { name: "Remove Search filter" })).toBeVisible();
    expect(screen.queryByRole("button", { name: group.name })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toHaveAttribute("tabindex", "-1");
      expect(document.activeElement?.isConnected).toBe(true);
    });
  });

  it("deletes a direct Main Basket line and restores focus to its surviving basket", async () => {
    setupHierarchy([line({ subBasketId: null, subBasketName: null })]);
    const user = userEvent.setup();
    renderIndex();
    await expand(user, "Items directly under Main Basket");
    const basketHeader = screen.getByRole("button", { name: basket.name });
    const { dialog } = await openDelete(user);
    await user.click(await enterReason(user, dialog));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "POP ceiling" })).not.toBeInTheDocument();
    await waitFor(() => expect(basketHeader).toHaveFocus());
  });
});
