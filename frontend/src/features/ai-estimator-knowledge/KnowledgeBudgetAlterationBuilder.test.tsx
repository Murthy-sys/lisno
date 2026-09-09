import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { KnowledgeBudgetAlterationBuilder } from "./KnowledgeBudgetAlterationBuilder";
import type { KnowledgeBudgetCatalogState } from "./KnowledgeBudgetBuilder";
import { budgetAlterationIssues, createBudgetAlteration } from "./knowledgeBudgetAlterations";
import * as api from "./knowledgeApi";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeItemListItem, KnowledgeJsonValue, KnowledgeSubBasket } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({ listKnowledgeSubBaskets: vi.fn(), listKnowledgeBaskets: vi.fn(), createKnowledgeMainLine: vi.fn(), listKnowledgeMainLines: vi.fn(), getKnowledgeItem: vi.fn() }));
const meta = { version: 1, createdById: "admin", updatedById: "admin", createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z" };
const baskets = ["Electrical", "Carpentry"].map((name, i) => ({ ...meta, id: `basket-${i}`, name, description: null, status: "active", displayOrder: i })) as KnowledgeBasket[];
const sub = { ...meta, id: "sub-lights", name: "Lights Procurement", basketId: "basket-0", displayOrder: 0 } as KnowledgeSubBasket;
const items = [
  { mainLineId: "source", mainLineName: "POP False Ceiling", basketId: "basket-0", subBasketId: null },
  { mainLineId: "lights", mainLineName: "Ceiling COB Lights", basketId: "basket-0", subBasketId: sub.id, subBasketName: sub.name },
  { mainLineId: "temp", mainLineName: "Temporary LED Lights", basketId: "basket-0", subBasketId: null, itemType: "temporary" },
  { mainLineId: "cabinet", mainLineName: "Cabinet", basketId: "basket-1", subBasketId: null }
].map((item) => ({ ...meta, itemType: "main_line", status: "draft", ...item })) as KnowledgeItemListItem[];
const page = <T,>(entries: T[]) => ({ items: entries, pagination: { offset: 0, limit: 100, total: entries.length, hasMore: false } });
const rule = { ...createBudgetAlteration(), id: "rule-1", targetBasketId: "basket-0", targetSubBasketId: sub.id, targetMainLineId: "lights", reason: "Recessed lights require the ceiling for fixing." };
function setup(initial: KnowledgeJsonValue = [], options: { readOnly?: boolean; canCreate?: boolean; items?: KnowledgeItemListItem[]; catalogState?: KnowledgeBudgetCatalogState } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const change = vi.fn();
  let updateItems!: (items: KnowledgeItemListItem[]) => void;
  let switchSource!: (sourceId: string) => void;
  function Harness() {
    const [value, setValue] = useState(initial);
    const [sourceId, setSourceId] = useState("source");
    switchSource = setSourceId;
    const [catalogItems, setCatalogItems] = useState(options.items ?? items);
    updateItems = setCatalogItems;
    return <main><h1>POP False Ceiling</h1><h2>Recommendation &amp; Exclusions</h2><KnowledgeBudgetAlterationBuilder value={value} mainLineId={sourceId} mainLineName="POP False Ceiling" baskets={baskets} items={catalogItems} catalogState={options.catalogState}
      readOnly={options.readOnly ?? false} canCreate={options.canCreate ?? true} issues={budgetAlterationIssues(value, "source")}
      onChange={(next) => { change(next); setValue(next); }} /></main>;
  }
  const view = render(<QueryClientProvider client={client}><MemoryRouter><Harness /></MemoryRouter></QueryClientProvider>);
  return { ...view, change, user: userEvent.setup(), client, updateItems, switchSource };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async (basketId) => page(basketId === "basket-0" ? [sub] : []));
  vi.mocked(api.listKnowledgeBaskets).mockResolvedValue(page(baskets));
  vi.mocked(api.createKnowledgeMainLine).mockResolvedValue({ ...items[2], mainLineId: "new-temp", itemType: "temporary" } as KnowledgeItemDetail);
});

describe("Budget Alterations", () => {
  it("authors the ceiling dependency, explains why, and resets the dependent catalog selections", async () => {
    const { user, change } = setup();
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "basket-0");
    await screen.findByRole("option", { name: sub.name });
    const line = screen.getByRole("combobox", { name: "Related item" });
    expect(within(line).queryByRole("option", { name: /POP False Ceiling|Temporary|Cabinet/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub Basket" }), sub.id);
    await user.selectOptions(line, "lights");
    await user.type(screen.getByRole("textbox", { name: "Why is this change needed?" }), String(rule.reason));
    expect(screen.getByLabelText("Scope change summary")).toHaveTextContent("If POP False Ceiling is removed from scope, Ceiling COB Lights must be removed.");
    expect(budgetAlterationIssues(change.mock.lastCall![0], "source")).toEqual([]);
    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "basket-1");
    expect(change.mock.lastCall![0][0]).toMatchObject({ targetBasketId: "basket-1", targetSubBasketId: null, targetMainLineId: null });
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("");
  });

  it("supports optional additions and removals, independent triggers, disabling and deleting rules", async () => {
    const { user, change } = setup([rule]);
    await screen.findByRole("option", { name: sub.name });
    await user.selectOptions(screen.getByRole("combobox", { name: "What happens if?" }), "added");
    await user.selectOptions(screen.getByRole("combobox", { name: "Scope action" }), "can_add");
    expect(screen.getByLabelText("Scope change summary")).toHaveTextContent("If POP False Ceiling is added to scope, Ceiling COB Lights can be added.");
    expect(screen.getByLabelText("Scope change summary")).toHaveTextContent("only if it is missing from scope");
    await user.click(screen.getByRole("checkbox", { name: "Enabled" }));
    expect(change.mock.lastCall![0][0]).toMatchObject({ trigger: "added", action: "add", requirement: "can", active: false });
    expect(screen.getByLabelText("Scope change summary")).toHaveTextContent("Disabled");
    await user.click(screen.getByRole("button", { name: "Remove rule 1" }));
    expect(change).toHaveBeenLastCalledWith([]);
  });

  it("creates a reusable temporary item under the chosen Basket and links its identity", async () => {
    const { user, change, client } = setup([{ ...rule, targetSubBasketId: null, targetMainLineId: null }]);
    await screen.findByRole("option", { name: sub.name });
    await user.click(screen.getByRole("button", { name: "Add temporary item" }));
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Main basket" })).toHaveValue("basket-0"));
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), "Pendant alternative");
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(change).toHaveBeenCalled());
    expect(api.createKnowledgeMainLine).toHaveBeenCalledWith("basket-0", { name: "Pendant alternative", itemType: "temporary" });
    expect(change.mock.lastCall![0][0]).toMatchObject({ targetType: "temporary", targetBasketId: "basket-0", targetMainLineId: "new-temp", targetSubBasketId: null });
    expect(change.mock.lastCall![0][0]).not.toHaveProperty("temporaryItemName");
    expect(screen.getByRole("link", { name: "Configure temporary item" })).toHaveAttribute("href", "/admin/configuration/estimation/items/new-temp");
    client.clear();
  });

  it("retains saved selections through catalog errors and prevents historical edits or unauthorized creation", async () => {
    vi.mocked(api.listKnowledgeSubBaskets).mockRejectedValue(new Error("Offline"));
    const { user, change } = setup([rule], { readOnly: true, canCreate: false });
    await screen.findByRole("button", { name: "Retry Sub Baskets" });
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("lights");
    expect(screen.getByRole("textbox", { name: "Why is this change needed?" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add rule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add temporary item" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Enabled" }));
    expect(change).not.toHaveBeenCalled();
  });

  it("loads later Sub Basket pages and filters temporary selections separately", async () => {
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async (_basketId, params) => params?.offset === 0
      ? { items: [{ ...sub, id: "first-sub", name: "Wiring" }], pagination: { offset: 0, limit: 100, total: 2, hasMore: true } }
      : { items: [sub], pagination: { offset: 1, limit: 100, total: 2, hasMore: false } });
    const { user } = setup([{ ...rule, targetSubBasketId: null }]);
    await screen.findByRole("option", { name: sub.name });
    await user.selectOptions(screen.getByRole("combobox", { name: "Item type" }), "temporary");
    const temporary = screen.getByRole("combobox", { name: "Related item" });
    expect(within(temporary).getByRole("option", { name: "Temporary LED Lights" })).toBeInTheDocument();
    expect(within(temporary).queryByRole("option", { name: /Ceiling COB Lights/ })).not.toBeInTheDocument();
  });

  it("opens a starter without mutating the rule and restores the previous selection on cancel", async () => {
    const { user, change } = setup([{ ...rule, targetSubBasketId: null }]);
    await screen.findByRole("option", { name: sub.name });
    const select = screen.getByRole("combobox", { name: "Related item" });
    const suggestion = within(select).getByRole("option", { name: "Recessed LED downlight · Ceiling lighting" }) as HTMLOptionElement;
    await user.selectOptions(select, suggestion.value);
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    expect(within(dialog).getByRole("textbox", { name: "Related item name" })).toHaveValue("Recessed LED downlight");
    expect(within(dialog).getByRole("textbox", { name: "Sub basket" })).toHaveValue("Ceiling lighting");
    expect(api.createKnowledgeMainLine).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(select).toHaveValue("lights");
    await waitFor(() => expect(select).toHaveFocus());
    expect(change).not.toHaveBeenCalled();
  });

  it("creates a starter using its saved ID and name immediately, then makes it reusable in another rule", async () => {
    const created = { ...items[1], mainLineId: "created-downlight", mainLineName: "Recessed LED downlight", subBasketId: "sub-ceiling", subBasketName: "Ceiling lighting" } as KnowledgeItemDetail;
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue(created);
    const { user, change } = setup([{ ...rule, targetSubBasketId: null }, { ...rule, id: "rule-2", targetSubBasketId: null, targetMainLineId: null }]);
    await screen.findAllByRole("option", { name: sub.name });
    const [first, second] = screen.getAllByRole("combobox", { name: "Related item" });
    const option = within(first).getByRole("option", { name: "Recessed LED downlight · Ceiling lighting" }) as HTMLOptionElement;
    await user.selectOptions(first, option.value);
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Add related item" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(first).toHaveValue(created.mainLineId));
    expect(first).toHaveDisplayValue(created.mainLineName);
    expect(change.mock.lastCall![0][0]).toMatchObject({ targetMainLineId: created.mainLineId, targetSubBasketId: created.subBasketId, targetBasketId: created.basketId, targetType: "catalog", trigger: "removed", action: "remove", reason: rule.reason });
    expect(JSON.stringify(change.mock.lastCall![0])).not.toContain("suggestion:");
    expect(change.mock.lastCall![0][1]).toMatchObject({ id: "rule-2", targetMainLineId: null });
    expect(screen.getAllByLabelText("Scope change summary")[0]).toHaveTextContent(created.mainLineName);
    expect(screen.getByRole("status")).toHaveTextContent("Save this section");
    expect(within(second).queryByRole("option", { name: created.mainLineName + " · Ceiling lighting" })).toHaveValue(created.mainLineId);
    await user.selectOptions(second, created.mainLineId);
    expect(change.mock.lastCall![0][1]).toMatchObject({ targetMainLineId: created.mainLineId, targetSubBasketId: created.subBasketId });
    expect(api.createKnowledgeMainLine).toHaveBeenCalledTimes(1);
  });

  it("adds a custom catalog item in an unrecognized basket and preserves the selected context", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue({ ...items[3], mainLineId: "custom", mainLineName: "Custom panel", subBasketId: "custom-sub", subBasketName: "Joinery" } as KnowledgeItemDetail);
    const { user, change } = setup([{ ...rule, targetBasketId: "basket-1", targetSubBasketId: null, targetMainLineId: null }]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add related item" })).toBeEnabled());
    expect(screen.queryByRole("group", { name: "Suggested items — add to catalog" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), "Custom panel");
    await user.type(within(dialog).getByRole("textbox", { name: "Sub basket" }), "Joinery");
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(change.mock.lastCall![0][0]).toMatchObject({ targetMainLineId: "custom", targetBasketId: "basket-1", targetSubBasketId: "custom-sub", targetType: "catalog" });
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveDisplayValue("Custom panel");
  });

  it.each([{ canCreate: false }, { readOnly: true }])("hides custom and starter creation for restricted access: %j", async (options) => {
    setup([{ ...rule, targetSubBasketId: null }], options);
    await screen.findByRole("option", { name: sub.name });
    expect(screen.queryByRole("button", { name: "Add related item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Suggested items — add to catalog" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("lights");
  });

  it.each([{ status: "loading" as const }, { status: "error" as const }, { status: "ready" as const, refreshErrorMessage: "Offline" }])("retains saved targets and disables creation during incomplete catalogs: %j", async (catalogState) => {
    const { change } = setup([{ ...rule, targetSubBasketId: null }], { catalogState });
    await screen.findByRole("option", { name: sub.name });
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("lights");
    expect(screen.getByRole("combobox", { name: "Related item" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add related item" })).toBeDisabled();
    expect(screen.queryByRole("group", { name: "Suggested items — add to catalog" })).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it("uses catalog lifecycle updates after the newly created selection is acknowledged", async () => {
    const created = { ...items[1], mainLineId: "created", mainLineName: "Created fitting" } as KnowledgeItemDetail;
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue(created);
    const { user, updateItems } = setup([rule]);
    await screen.findByRole("option", { name: sub.name });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), "Created fitting");
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("created"));
    await act(async () => updateItems([...items, created]));
    await act(async () => updateItems([...items, { ...created, status: "inactive" }]));
    expect(screen.getByRole("option", { name: "Created fitting" })).toBeDisabled();
  });

  it("retains a successfully created target through refresh failure and retries only catalog reads", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue({ ...items[1], mainLineId: "saved-fitting", mainLineName: "Saved fitting" } as KnowledgeItemDetail);
    const { user, client } = setup([rule]);
    await screen.findByRole("option", { name: sub.name });
    const invalidation = vi.spyOn(client, "invalidateQueries").mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(undefined);
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), "Saved fitting");
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    const retry = await screen.findByRole("button", { name: "Retry catalog refresh" });
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveDisplayValue("Saved fitting");
    await user.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry catalog refresh" })).not.toBeInTheDocument());
    expect(invalidation).toHaveBeenCalledTimes(8);
    expect(api.createKnowledgeMainLine).toHaveBeenCalledTimes(1);
  });

  it("uses newer confirmed reuse details until an equal or newer catalog version arrives", async () => {
    const stale = { ...items[1], mainLineName: "Old fitting name", status: "inactive" as const };
    const confirmed = { ...items[1], mainLineName: "Renamed fitting", status: "active" as const, version: 2 } as KnowledgeItemDetail;
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValue(new ApiError(409, "CONFLICT", "Already exists"));
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([{ ...meta, id: "lights", name: confirmed.mainLineName, basketId: "basket-0", subBasketId: sub.id, status: "active", itemType: "main_line", displayOrder: 0, description: null, activeRevisionId: "confirmed-active", draftRevisionId: null }]));
    vi.mocked(api.getKnowledgeItem).mockResolvedValue(confirmed);
    const { user, updateItems } = setup([rule, { ...rule, id: "second", targetMainLineId: null }], { items: items.map((item) => item.mainLineId === "lights" ? stale : item) });
    await screen.findAllByRole("option", { name: sub.name });
    await user.click(screen.getAllByRole("button", { name: "Add related item" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), confirmed.mainLineName);
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await user.click(await within(dialog).findByRole("button", { name: "Use existing item" }));
    const [first, second] = screen.getAllByRole("combobox", { name: "Related item" });
    await waitFor(() => expect(first).toHaveDisplayValue(confirmed.mainLineName));
    expect(within(first).getByRole("option", { name: confirmed.mainLineName })).toBeEnabled();
    await user.selectOptions(second, "lights");
    expect(second).toHaveDisplayValue(confirmed.mainLineName);
    await act(async () => updateItems(items.map((item) => item.mainLineId === "lights" ? confirmed : item)));
    await act(async () => updateItems(items.map((item) => item.mainLineId === "lights" ? { ...confirmed, version: 3, status: "inactive" } : item)));
    expect(within(first).getByRole("option", { name: confirmed.mainLineName })).toBeDisabled();
  });

  it("does not apply a delayed create response to a different source with the same rule ID", async () => {
    let complete!: (item: KnowledgeItemDetail) => void;
    vi.mocked(api.createKnowledgeMainLine).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const { user, change, switchSource, client } = setup([rule]);
    await screen.findByRole("option", { name: sub.name });
    const invalidation = vi.spyOn(client, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), "Late fitting");
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await act(async () => switchSource("different-source"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const detail = { ...items[1], mainLineId: "late-fitting", mainLineName: "Late fitting" } as KnowledgeItemDetail;
    await act(async () => complete(detail));
    await waitFor(() => expect(invalidation).toHaveBeenCalled());
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("lights");
    expect(client.getQueryData(["ai-estimator-knowledge", "item", "late-fitting"])).toEqual(detail);
  });

  it("blocks empty explanations, self references and conflicting rules without changing legacy notes", () => {
    expect(budgetAlterationIssues([{ ...rule, reason: " " }])).toContainEqual(expect.objectContaining({ path: "budgetAlterations.0.reason" }));
    expect(budgetAlterationIssues([{ ...rule, targetMainLineId: "source" }], "source")).toContainEqual(expect.objectContaining({ path: "budgetAlterations.0.targetMainLineId" }));
    expect(budgetAlterationIssues([rule, { ...rule, id: "second", action: "add" }])).toContainEqual(expect.objectContaining({ path: "budgetAlterations.1" }));
    expect(budgetAlterationIssues([rule, { ...rule, id: "second", trigger: "added" }])).toEqual([]);
    expect(budgetAlterationIssues([rule, { ...rule, id: "second", active: false }])).toEqual([]);
  });
});
