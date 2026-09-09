import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { StrictMode, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { CreateKnowledgeItemDialog } from "./CreateKnowledgeItemDialog";
import * as api from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeMainLine, KnowledgeSubBasket } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({
  listKnowledgeBaskets: vi.fn(), listKnowledgeSubBaskets: vi.fn(),
  createKnowledgeBasket: vi.fn(), createKnowledgeSubBasket: vi.fn(), createKnowledgeMainLine: vi.fn(), listKnowledgeMainLines: vi.fn(), getKnowledgeItem: vi.fn()
}));

const metadata = { version: 1, createdById: "admin", updatedById: "admin", createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z" };
const baskets: KnowledgeBasket[] = ["Carpentry", "Painting"].map((name, index) => ({ ...metadata, id: `basket-${index}`, name, displayOrder: index, status: "active", description: null }));
function page<T>(items: T[]) { return { items, pagination: { limit: 100, offset: 0, total: items.length, hasMore: false } }; }
const createdDetail = { mainLineId: "line-created", mainLineName: "Panelling", basketId: "basket-0", basketName: "Carpentry", subBasketId: "sub-walls", subBasketName: "Walls", itemType: "main_line", status: "draft" } as KnowledgeItemDetail;
const existingLine = { id: "line-created", name: "Panelling", basketId: "basket-0", subBasketId: "sub-walls", itemType: "main_line", status: "draft" } as KnowledgeMainLine;
const relatedProps = { context: "related-item", initialBasketId: "basket-0", initialSubBasketName: "Walls", initialName: "Panelling", excludeMainLineId: "source-line" } as const;
function setup(props: Partial<ComponentProps<typeof CreateKnowledgeItemDialog>> = {}, strictMode = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onCreated = vi.fn(async () => {});
  const onClose = vi.fn();
  const dialog = <QueryClientProvider client={client}><CreateKnowledgeItemDialog onClose={onClose} onCreated={onCreated} {...props} /></QueryClientProvider>;
  const view = render(strictMode ? <StrictMode>{dialog}</StrictMode> : dialog);
  return { user: userEvent.setup(), client, onCreated, onClose, unmount: view.unmount };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listKnowledgeBaskets).mockResolvedValue(page(baskets));
  vi.mocked(api.createKnowledgeMainLine).mockResolvedValue(createdDetail);
  vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([]));
  vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue(page([{ ...metadata, id: "sub-walls", basketId: "basket-0", name: "Walls", displayOrder: 0 } as KnowledgeSubBasket]));
  vi.mocked(api.getKnowledgeItem).mockResolvedValue(createdDetail);
});

describe("Main Line with a Sub Basket text field", () => {
  it("submits the typed Sub Basket with the selected Main Basket and exposes no add-basket buttons", async () => {
    const { user, onCreated } = setup();
    await screen.findByRole("option", { name: "Carpentry" });
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add main basket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add sub basket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Sub basket" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), baskets[0].id);
    await user.type(screen.getByRole("textbox", { name: "Main Line name" }), "Panelling");
    expect(screen.getByRole("button", { name: "Add estimation item" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Sub basket" }), "  Walls  ");
    const results = await axe.run(screen.getByRole("dialog"), { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Add estimation item" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("line-created"));
    expect(api.createKnowledgeMainLine).toHaveBeenCalledWith(baskets[0].id, { name: "Panelling", subBasketName: "Walls" });
    expect(api.listKnowledgeSubBaskets).not.toHaveBeenCalled();
    expect(api.createKnowledgeSubBasket).not.toHaveBeenCalled();
    expect(api.createKnowledgeBasket).not.toHaveBeenCalled();
  });

  it("keeps the typed name and maps it under the final selected Main Basket", async () => {
    const { user } = setup();
    await screen.findByRole("option", { name: "Carpentry" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), baskets[0].id);
    await user.type(screen.getByRole("textbox", { name: "Sub basket" }), "Walls");
    await user.type(screen.getByRole("textbox", { name: "Main Line name" }), "Panelling");
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), baskets[1].id);
    await user.click(screen.getByRole("button", { name: "Add estimation item" }));
    await waitFor(() => expect(api.createKnowledgeMainLine).toHaveBeenCalledWith(baskets[1].id, { name: "Panelling", subBasketName: "Walls" }));
  });

  it("retains entered values on failure and supports retry and cancellation", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValueOnce(new Error("Save failed"));
    const { user, onClose } = setup();
    await screen.findByRole("option", { name: "Carpentry" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), baskets[0].id);
    await user.type(screen.getByRole("textbox", { name: "Sub basket" }), "Walls");
    await user.type(screen.getByRole("textbox", { name: "Main Line name" }), "Panelling");
    await user.click(screen.getByRole("button", { name: "Add estimation item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    expect(screen.getByRole("textbox", { name: "Sub basket" })).toHaveValue("Walls");
    expect(screen.getByRole("textbox", { name: "Main Line name" })).toHaveValue("Panelling");
    await user.click(screen.getByRole("button", { name: "Add estimation item" }));
    await waitFor(() => expect(api.createKnowledgeMainLine).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reports unavailable or empty Main Baskets without offering creation buttons", async () => {
    vi.mocked(api.listKnowledgeBaskets).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(page([]));
    const { user } = setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Main Baskets could not be loaded");
    await user.click(screen.getByRole("button", { name: "Retry Main Baskets" }));
    expect(await screen.findByText("Create a Main Basket from Configuration before adding a Main Line.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add estimation item" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add main basket" })).not.toBeInTheDocument();
  });

  it("loads later Main Basket pages", async () => {
    vi.mocked(api.listKnowledgeBaskets).mockImplementation(async (params) => params?.offset === 0
      ? { ...page([baskets[0]]), pagination: { limit: 100, offset: 0, total: 2, hasMore: true } }
      : { ...page([baskets[1]]), pagination: { limit: 100, offset: 1, total: 2, hasMore: false } });
    setup();
    expect(await screen.findByRole("option", { name: "Painting" })).toBeVisible();
  });

  it("supports keyboard entry and prevents duplicate submissions while saving", async () => {
    let resolveSave!: (item: KnowledgeItemDetail) => void;
    vi.mocked(api.createKnowledgeMainLine).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const { user, onCreated } = setup();
    await screen.findByRole("option", { name: "Carpentry" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), baskets[0].id);
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Sub basket" })).toHaveFocus();
    await user.keyboard("Walls");
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Main Line name" })).toHaveFocus();
    await user.keyboard("Panelling{Enter}");
    expect(screen.getByRole("textbox", { name: "Sub basket" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(api.createKnowledgeMainLine).toHaveBeenCalledOnce();
    await act(async () => { resolveSave({ mainLineId: "line-created" } as KnowledgeItemDetail); });
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  });
});

describe("related item creation", () => {
  it("caches a save completed after unmount and refreshes catalog without selecting into a departed owner", async () => {
    let resolveSave!: (item: KnowledgeItemDetail) => void;
    vi.mocked(api.createKnowledgeMainLine).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const { user, client, onCreated, unmount } = setup(relatedProps);
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    expect(api.createKnowledgeMainLine).toHaveBeenCalledOnce();
    unmount();
    await act(async () => { resolveSave(createdDetail); });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    expect(client.getQueryData(knowledgeQueryKeys.item("line-created"))).toEqual(createdDetail);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("delivers selection in Strict Mode after the effect cleanup and setup cycle", async () => {
    const { user, onCreated } = setup(relatedProps, true);
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("line-created", createdDetail));
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("still delivers a delayed refresh warning to the owning row after successful selection closes the dialog", async () => {
    const onRefreshError = vi.fn();
    const { user, client, onCreated, unmount } = setup({ ...relatedProps, onRefreshError });
    let rejectRefresh!: (error: Error) => void;
    const refresh = new Promise<void>((_resolve, reject) => { rejectRefresh = reject; });
    const invalidate = vi.spyOn(client, "invalidateQueries").mockReturnValue(refresh);
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("line-created", createdDetail));
    expect(invalidate).toHaveBeenCalledTimes(4);
    unmount();
    await act(async () => { rejectRefresh(new Error("Catalog refresh failed")); });
    await waitFor(() => expect(onRefreshError).toHaveBeenCalledWith(expect.stringContaining("related item is saved")));
    expect(api.createKnowledgeMainLine).toHaveBeenCalledOnce();
  });

  it("prefills an editable suggestion and cancels without creating or changing the rule", async () => {
    const { user, onClose, onCreated } = setup(relatedProps);
    await screen.findByRole("option", { name: "Carpentry" });
    expect(screen.getByRole("dialog", { name: "Add related item" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Related item name" })).toHaveValue("Panelling");
    expect(screen.getByRole("textbox", { name: "Sub basket" })).toHaveValue("Walls");
    expect(screen.getByText(/Save the rule separately/)).toBeVisible();
    await user.clear(screen.getByRole("textbox", { name: "Related item name" }));
    await user.type(screen.getByRole("textbox", { name: "Related item name" }), "Fluted panelling");
    await user.selectOptions(screen.getByRole("combobox", { name: "Main basket" }), "basket-1");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onCreated).not.toHaveBeenCalled();
    expect(api.createKnowledgeMainLine).not.toHaveBeenCalled();
  });

  it("creates a custom item and delivers the authoritative detail before a delayed refresh", async () => {
    const { user, client, onCreated } = setup({ ...relatedProps, initialName: "" });
    let resolveRefresh!: () => void;
    const refresh = new Promise<void>((resolve) => { resolveRefresh = resolve; });
    const invalidate = vi.spyOn(client, "invalidateQueries").mockReturnValue(refresh);
    await screen.findByRole("option", { name: "Carpentry" });
    expect(screen.getByRole("button", { name: "Add related item" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Related item name" }), "  Panelling  ");
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("line-created", createdDetail));
    expect(client.getQueryData(knowledgeQueryKeys.item("line-created"))).toEqual(createdDetail);
    expect(api.createKnowledgeMainLine).toHaveBeenCalledWith("basket-0", { name: "Panelling", subBasketName: "Walls" });
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      knowledgeQueryKeys.itemLists(), knowledgeQueryKeys.mainLineLists("basket-0"), knowledgeQueryKeys.subBasketLists("basket-0"), knowledgeQueryKeys.basketDeletionImpact("basket-0")
    ]);
    expect(onCreated.mock.invocationCallOrder[0]).toBeLessThan(invalidate.mock.invocationCallOrder[0]);
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
    await act(async () => { resolveRefresh(); });
    expect(screen.getByRole("button", { name: "Add related item" })).toBeDisabled();
  });

  it("reports a refresh warning after successful creation without permitting another POST", async () => {
    const onRefreshError = vi.fn();
    const { user, client, onCreated } = setup({ ...relatedProps, onRefreshError });
    vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("Refresh unavailable"));
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("related item is saved, but some catalog lists could not refresh");
    expect(onCreated).toHaveBeenCalledWith("line-created", createdDetail);
    expect(onRefreshError).toHaveBeenCalledWith(expect.stringContaining("related item is saved"));
    expect(api.listKnowledgeMainLines).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add related item" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    expect(api.createKnowledgeMainLine).toHaveBeenCalledOnce();
  });

  it("keeps required values and accessible server errors after definite validation rejection", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "Correct the related item name.", { name: "Enter a valid name." }));
    const { user, onCreated } = setup(relatedProps);
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Correct the related item name");
    const name = screen.getByRole("textbox", { name: "Related item name" });
    expect(name).toHaveValue("Panelling");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription(expect.stringContaining("Enter a valid name"));
    expect(api.listKnowledgeMainLines).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    const results = await axe.run(screen.getByRole("dialog"), { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
    await user.clear(name);
    expect(screen.getByRole("button", { name: "Add related item" })).toBeDisabled();
    await user.type(name, "Slatted panelling");
    expect(screen.getByRole("button", { name: "Add related item" })).toBeEnabled();
  });

  it("prevents double submission while POST is pending", async () => {
    let resolveSave!: (item: KnowledgeItemDetail) => void;
    vi.mocked(api.createKnowledgeMainLine).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const { user, onCreated } = setup(relatedProps);
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("textbox", { name: "Related item name" }));
    await user.keyboard("{Enter}{Enter}");
    expect(screen.getByRole("textbox", { name: "Related item name" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(api.createKnowledgeMainLine).toHaveBeenCalledOnce();
    await act(async () => { resolveSave(createdDetail); });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("line-created", createdDetail));
  });

  it.each([new ApiError(409, "DUPLICATE", "Name already used"), new ApiError(500, "INTERNAL_ERROR", "Unknown outcome"), new Error("Response lost")])("reconciles a duplicate or uncertain response and requires explicit reuse (%s)", async (error) => {
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValueOnce(error);
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([existingLine]));
    const { user, onCreated } = setup(relatedProps);
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    const useExisting = await screen.findByRole("button", { name: "Use existing item" });
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add related item" })).toBeDisabled();
    await user.click(useExisting);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("line-created", createdDetail));
    expect(api.createKnowledgeMainLine).toHaveBeenCalledOnce();
    expect(api.getKnowledgeItem).toHaveBeenCalledTimes(2);
  });

  it.each([{ status: "inactive" }, { status: "archived" }, { id: "source-line" }, { subBasketId: "other-sub" }, { itemType: "temporary" }])("shows conflicting or unavailable matches and allows correction (%j)", async (change) => {
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValueOnce(new ApiError(409, "DUPLICATE", "Name already used"));
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([{ ...existingLine, ...change } as KnowledgeMainLine]));
    const { user, onCreated } = setup(relatedProps);
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a different name or correct the classification");
    expect(screen.queryByRole("button", { name: "Use existing item" })).not.toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add related item" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Related item name" }), " replacement");
    expect(screen.getByRole("button", { name: "Add related item" })).toBeEnabled();
  });

  it("blocks another create and edits until a failed reconciliation can be checked again", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValueOnce(new Error("Response lost"));
    vi.mocked(api.listKnowledgeMainLines).mockRejectedValueOnce(new Error("Offline"));
    const { user, onCreated } = setup(relatedProps);
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not confirm whether the item was added");
    expect(screen.getByRole("textbox", { name: "Related item name" })).toHaveValue("Panelling");
    expect(screen.getByRole("textbox", { name: "Related item name" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add related item" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(onCreated).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Check catalog again" }));
    expect(await screen.findByText(/No matching related item was found/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Add related item" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("line-created", createdDetail));
    expect(api.createKnowledgeMainLine).toHaveBeenCalledTimes(2);
  });

  it("does not select an existing match that became inactive before explicit reuse", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValueOnce(new Error("Response lost"));
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValueOnce(page([existingLine])).mockResolvedValueOnce(page([{ ...existingLine, status: "inactive" }]));
    const { user, onCreated } = setup(relatedProps);
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    await user.click(await screen.findByRole("button", { name: "Use existing item" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already used in this Main Basket");
    expect(onCreated).not.toHaveBeenCalled();
    expect(api.createKnowledgeMainLine).toHaveBeenCalledOnce();
  });

  it("requires another explicit choice if the matching stable ID changed during reuse", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValueOnce(new Error("Response lost"));
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValueOnce(page([existingLine])).mockResolvedValue(page([{ ...existingLine, id: "new-line" }]));
    vi.mocked(api.getKnowledgeItem).mockResolvedValueOnce(createdDetail).mockResolvedValue({ ...createdDetail, mainLineId: "new-line" });
    const { user, onCreated } = setup(relatedProps);
    await screen.findByRole("option", { name: "Carpentry" });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    await user.click(await screen.findByRole("button", { name: "Use existing item" }));
    await waitFor(() => expect(api.getKnowledgeItem).toHaveBeenCalledTimes(2));
    expect(onCreated).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use existing item" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("new-line", expect.objectContaining({ mainLineId: "new-line" })));
  });

  it.each([undefined, "related-item"] as const)("preserves temporary validation and payload in %s context", async (context) => {
    const temporaryDetail = { ...createdDetail, mainLineName: "Relocate light point", itemType: "temporary" as const, subBasketId: null, subBasketName: null };
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue(temporaryDetail);
    const { user, onCreated } = setup({ context, itemType: "temporary", initialBasketId: "basket-0" });
    await screen.findByRole("option", { name: "Carpentry" });
    expect(screen.getByRole("textbox", { name: "Sub basket" })).not.toBeRequired();
    await user.type(screen.getByRole("textbox", { name: context ? "Related item name" : "Temporary item name" }), "Relocate light point");
    await user.click(screen.getByRole("button", { name: context ? "Add related item" : "Add temporary item" }));
    expect(api.createKnowledgeMainLine).toHaveBeenCalledWith("basket-0", { name: "Relocate light point", itemType: "temporary" });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    if (context) expect(onCreated).toHaveBeenCalledWith("line-created", temporaryDetail);
    else expect(onCreated).toHaveBeenCalledWith("line-created");
  });
});
