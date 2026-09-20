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

vi.mock("./knowledgeApi", () => ({ listKnowledgeSubBaskets: vi.fn(), listKnowledgeBaskets: vi.fn(), createKnowledgeBasket: vi.fn(), createKnowledgeMainLine: vi.fn(), listKnowledgeMainLines: vi.fn(), getKnowledgeItem: vi.fn() }));
const meta = { version: 1, createdById: "admin", updatedById: "admin", createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z" };
const baskets = ["Electrical", "Carpentry"].map((name, i) => ({ ...meta, id: `basket-${i}`, name, description: null, status: "active", displayOrder: i })) as KnowledgeBasket[];
const sub = { ...meta, id: "sub-lights", name: "Lights Procurement", basketId: "basket-0", displayOrder: 0 } as KnowledgeSubBasket;
const items = [
  { mainLineId: "source", mainLineName: "POP False Ceiling", basketId: "basket-0", subBasketId: null },
  { mainLineId: "lights", mainLineName: "Ceiling COB Lights", basketId: "basket-0", subBasketId: sub.id, subBasketName: sub.name },
  { mainLineId: "temp", mainLineName: "Temporary LED Lights", basketId: "basket-0", subBasketId: null, itemType: "temporary" },
  { mainLineId: "cabinet", mainLineName: "Cabinet", basketId: "basket-1", subBasketId: null }
].map((item) => ({ ...meta, itemType: "main_line", completionRequired: item.itemType === "temporary", status: "draft", ...item })) as KnowledgeItemListItem[];
const page = <T,>(entries: T[]) => ({ items: entries, pagination: { offset: 0, limit: 100, total: entries.length, hasMore: false } });
const rule = { ...createBudgetAlteration(), id: "rule-1", targetBasketId: "basket-0", targetSubBasketId: sub.id, targetMainLineId: "lights", reason: "Recessed lights require the ceiling for fixing." };
async function openRule(user: ReturnType<typeof userEvent.setup>, index = 1) {
  const other = screen.getByText("Other scope rules", { selector: "summary" });
  if (!(other.parentElement as HTMLDetailsElement).open) await user.click(other);
  await user.click(screen.getByRole("button", { name: new RegExp(`^(Edit|View) rule ${index}:`) }));
}
function setup(initial: KnowledgeJsonValue = [], options: { savedValue?: KnowledgeJsonValue; readOnly?: boolean; canCreate?: boolean; items?: KnowledgeItemListItem[]; catalogState?: KnowledgeBudgetCatalogState; onItemConfirmed?: (item: KnowledgeItemDetail) => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const change = vi.fn();
  let updateItems!: (items: KnowledgeItemListItem[]) => void;
  let switchSource!: (sourceId: string) => void;
  let validate!: () => void;
  let updateBaselineKey!: (value: string) => void;
  function Harness() {
    const [value, setValue] = useState(initial);
    const [sourceId, setSourceId] = useState("source");
    switchSource = setSourceId;
    const [validationAttempt, setValidationAttempt] = useState(0);
    validate = () => setValidationAttempt((value) => value + 1);
    const [resetKey, setResetKey] = useState("initial");
    updateBaselineKey = setResetKey;
    const [catalogItems, setCatalogItems] = useState(options.items ?? items);
    updateItems = setCatalogItems;
    return <main><h1>POP False Ceiling</h1><h2>Recommendation &amp; Exclusions</h2><KnowledgeBudgetAlterationBuilder value={value} mainLineId={sourceId} mainLineName="POP False Ceiling" baskets={baskets} items={catalogItems} catalogState={options.catalogState}
      readOnly={options.readOnly ?? false} canCreate={options.canCreate ?? true} issues={budgetAlterationIssues(value, "source")}
      savedValue={options.savedValue} validationAttempt={validationAttempt} resetKey={resetKey}
      onItemConfirmed={options.onItemConfirmed}
      onChange={(next) => { change(next); setValue(next); }} /></main>;
  }
  const view = render(<QueryClientProvider client={client}><MemoryRouter><Harness /></MemoryRouter></QueryClientProvider>);
  return { ...view, change, user: userEvent.setup(), client, updateItems, switchSource, validate, updateBaselineKey };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async (basketId) => page(basketId === "basket-0" ? [sub] : []));
  vi.mocked(api.listKnowledgeBaskets).mockResolvedValue(page(baskets));
  vi.mocked(api.createKnowledgeBasket).mockResolvedValue({ ...baskets[0], id: "basket-new", name: "Lighting" });
  vi.mocked(api.createKnowledgeMainLine).mockResolvedValue({ ...items[2], mainLineId: "new-temp", itemType: "temporary" } as KnowledgeItemDetail);
});

describe("Budget Alterations", () => {
  it("authors the ceiling dependency, explains why, and resets the dependent catalog selections", async () => {
    const { user, change } = setup();
    await user.click(screen.getByText("Other scope rules", { selector: "summary" }));
    await user.click(screen.getByRole("button", { name: "Add other scope rule" }));
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
    await openRule(user);
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

  it("targets an existing whole Sub-Basket using the explicit union shape", async () => {
    const initial = [{ ...rule, targetKind: "main_line", targetSubBasketId: null, targetMainLineId: null }];
    const { user, change } = setup(initial);
    await openRule(user);
    await user.selectOptions(screen.getByRole("combobox", { name: "Addition type" }), "sub_basket");
    const subBasket = screen.getByRole("combobox", { name: "Sub Basket" });
    await screen.findByRole("option", { name: "Lights Procurement · 1 item" });
    await user.selectOptions(subBasket, sub.id);
    expect(change.mock.lastCall![0][0]).toMatchObject({
      targetKind: "sub_basket",
      targetType: null,
      targetBasketId: "basket-0",
      targetSubBasketId: sub.id,
      targetMainLineId: null
    });
    expect(budgetAlterationIssues(change.mock.lastCall![0], "source")).toEqual([]);
    expect(screen.queryByRole("combobox", { name: "Related item" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scope change summary")).toHaveTextContent("Lights Procurement");
  });

  it("adds repeated catalog and temporary sub-items while keeping the Whole Sub-Basket target unchanged", async () => {
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const catalogChild = { ...items[1], mainLineId: "twelve-watt", mainLineName: "12 watt lights", itemType: "main_line" as const, subBasketId: sub.id, subBasketName: sub.name } as KnowledgeItemDetail;
    const temporaryChild = { ...items[1], mainLineId: "open-lights", mainLineName: "Lights", itemType: "temporary" as const, completionRequired: true, subBasketId: sub.id, subBasketName: sub.name } as KnowledgeItemDetail;
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValueOnce(catalogChild).mockResolvedValueOnce(temporaryChild);
    const onItemConfirmed = vi.fn();
    const { user, change } = setup([whole], { onItemConfirmed });
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    expect(within(childList).getByText("Ceiling COB Lights")).toBeVisible();

    await user.click(within(childList).getByRole("button", { name: "Add sub-item" }));
    let dialog = screen.getByRole("dialog", { name: "Add sub-item" });
    expect(within(dialog).getByRole("combobox", { name: "Main basket" })).toBeDisabled();
    expect(within(dialog).getByRole("textbox", { name: "Sub basket" })).toHaveValue(sub.name);
    expect(within(dialog).getByRole("textbox", { name: "Sub basket" })).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Sub-item name" }), catalogChild.mainLineName);
    await user.click(within(dialog).getByRole("button", { name: "Add sub-item" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add sub-item" })).not.toBeInTheDocument());
    expect(api.createKnowledgeMainLine).toHaveBeenNthCalledWith(1, "basket-0", { name: catalogChild.mainLineName, subBasketId: sub.id });
    expect(within(childList).getByText(catalogChild.mainLineName)).toBeVisible();

    await user.click(within(childList).getByRole("button", { name: "Add sub-item" }));
    dialog = screen.getByRole("dialog", { name: "Add sub-item" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Sub-item type" }), "temporary");
    await user.type(within(dialog).getByRole("textbox", { name: "Sub-item name" }), temporaryChild.mainLineName);
    await user.click(within(dialog).getByRole("button", { name: "Add sub-item" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add sub-item" })).not.toBeInTheDocument());
    expect(api.createKnowledgeMainLine).toHaveBeenNthCalledWith(2, "basket-0", { name: temporaryChild.mainLineName, subBasketId: sub.id, itemType: "temporary" });
    expect(within(childList).getByText(temporaryChild.mainLineName)).toBeVisible();
    expect(within(within(childList).getByText(temporaryChild.mainLineName).closest("li")!).getByText("Must be completed")).toBeVisible();
    expect(change).not.toHaveBeenCalled();
    expect(onItemConfirmed).toHaveBeenNthCalledWith(1, catalogChild);
    expect(onItemConfirmed).toHaveBeenNthCalledWith(2, temporaryChild);
    expect(screen.getByRole("combobox", { name: "Addition type" })).toHaveValue("sub_basket");
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);
    expect(screen.queryByRole("combobox", { name: "Related item" })).not.toBeInTheDocument();
  });

  it("preserves the selected Whole Sub-Basket when sub-item creation is cancelled or fails", async () => {
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "Review the sub-item name."));
    const { user, change } = setup([whole]);
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    await user.click(within(childList).getByRole("button", { name: "Add sub-item" }));
    let dialog = screen.getByRole("dialog", { name: "Add sub-item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Sub-item name" }), "9 watt lights");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add sub-item" })).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);
    expect(change).not.toHaveBeenCalled();

    await user.click(within(childList).getByRole("button", { name: "Add sub-item" }));
    dialog = screen.getByRole("dialog", { name: "Add sub-item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Sub-item name" }), "9 watt lights");
    await user.click(within(dialog).getByRole("button", { name: "Add sub-item" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Review the sub-item name");
    expect(within(dialog).getByRole("textbox", { name: "Sub-item name" })).toHaveValue("9 watt lights");
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);
    expect(change).not.toHaveBeenCalled();
  });

  it("does not publish a returned child from the wrong Sub-Basket", async () => {
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const wrongParent = { ...items[1], mainLineId: "wrong-parent", mainLineName: "Wrong parent", subBasketId: "other-sub", subBasketName: "Other" } as KnowledgeItemDetail;
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue(wrongParent);
    const onItemConfirmed = vi.fn();
    const { user, change } = setup([whole], { onItemConfirmed });
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    await user.click(within(childList).getByRole("button", { name: "Add sub-item" }));
    const dialog = screen.getByRole("dialog", { name: "Add sub-item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Sub-item name" }), wrongParent.mainLineName);
    await user.click(within(dialog).getByRole("button", { name: "Add sub-item" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("saved in the catalog, but could not be selected");
    expect(onItemConfirmed).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    expect(within(childList).queryByText(wrongParent.mainLineName)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);
  });

  it.each([{ canCreate: false }, { readOnly: true }])("shows Sub-Basket children but hides Add sub-item without create access: %j", async (options) => {
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user } = setup([whole], options);
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    expect(within(childList).getByText("Ceiling COB Lights")).toBeVisible();
    expect(within(childList).queryByRole("button", { name: "Add sub-item" })).not.toBeInTheDocument();
  });

  it("keeps the selected line item until addition-type clearing is confirmed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user, change } = setup([rule]);
    await openRule(user);
    const additionType = screen.getByRole("combobox", { name: "Addition type" });
    await user.selectOptions(additionType, "sub_basket");
    expect(additionType).toHaveValue("main_line");
    expect(change).not.toHaveBeenCalled();
    await user.selectOptions(additionType, "sub_basket");
    expect(change.mock.lastCall![0][0]).toMatchObject({ targetKind: "sub_basket", targetType: null, targetSubBasketId: null, targetMainLineId: null });
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

  it("allows adding the first child to an empty Sub-Basket, disables self-containing targets and flags overlaps", async () => {
    const empty = { ...sub, id: "sub-empty", name: "Empty Sub-Basket" };
    const self = { ...sub, id: "sub-self", name: "Source group" };
    vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue(page([sub, empty, self]));
    const sourceInSub = { ...items[0], subBasketId: self.id, subBasketName: self.name };
    const whole = { ...rule, id: "whole-rule", targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user, change } = setup([rule, whole], { items: [sourceInSub, ...items.slice(1)] });
    expect(screen.getAllByText("Overlapping target")).toHaveLength(2);
    await openRule(user, 2);
    const selector = screen.getByRole("combobox", { name: "Sub Basket" });
    const emptyOption = within(selector).getByRole("option", { name: "Empty Sub-Basket · Empty · Add a sub-item" });
    expect(emptyOption).toBeEnabled();
    expect(within(selector).getByRole("option", { name: "Source group · Contains this item" })).toBeDisabled();
    await user.selectOptions(selector, empty.id);
    const childList = screen.getByRole("region", { name: "Sub-items" });
    expect(within(childList).getByText("No sub-items are available in this Sub-Basket.")).toBeVisible();
    expect(within(childList).getByRole("button", { name: "Add sub-item" })).toBeEnabled();
    expect(change.mock.lastCall![0][1]).toMatchObject({ targetKind: "sub_basket", targetSubBasketId: empty.id, targetMainLineId: null });
  });

  it("creates a missing Main Basket and Sub-Basket with a generic temporary child", async () => {
    const created = {
      ...items[2],
      mainLineId: "lights-placeholder",
      mainLineName: "Lights",
      basketId: "basket-new",
      basketName: "Lighting",
      subBasketId: "sub-false-ceiling",
      subBasketName: "False ceiling lights",
      itemType: "temporary"
    } as KnowledgeItemDetail;
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue(created);
    const { user, change } = setup();
    await user.click(screen.getByRole("button", { name: "Add Mandatory Item" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Addition type" }), "sub_basket");
    await user.click(screen.getByRole("button", { name: "Add Sub-Basket" }));
    const dialog = screen.getByRole("dialog", { name: "Add Sub-Basket" });
    await within(dialog).findByRole("option", { name: "Electrical" });
    await user.click(within(dialog).getByRole("button", { name: "Add main basket" }));
    await user.type(within(dialog).getByRole("textbox", { name: "New Main Basket name" }), "Lighting");
    await user.click(within(dialog).getByRole("button", { name: "Save main basket" }));
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Main basket" })).toHaveValue("basket-new"));
    await user.type(within(dialog).getByRole("textbox", { name: "Sub basket" }), "False ceiling lights");
    expect(within(dialog).getByRole("textbox", { name: "Temporary item name" })).toHaveValue("Lights");
    await user.click(within(dialog).getByRole("button", { name: "Add Sub-Basket" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add Sub-Basket" })).not.toBeInTheDocument());
    expect(api.createKnowledgeMainLine).toHaveBeenCalledWith("basket-new", {
      name: "Lights",
      subBasketName: "False ceiling lights",
      itemType: "temporary"
    });
    expect(change.mock.lastCall![0][0]).toMatchObject({
      targetKind: "sub_basket",
      targetType: null,
      targetBasketId: "basket-new",
      targetSubBasketId: "sub-false-ceiling",
      targetMainLineId: null
    });
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByText("Temporary child · Must be completed")).toBeVisible();
  });

  it("normalizes a legacy line-item rule when it is edited", async () => {
    const legacy = { ...rule };
    Reflect.deleteProperty(legacy, "targetKind");
    const { user, change } = setup([legacy]);
    await openRule(user);
    const reason = screen.getByRole("textbox", { name: "Why is this change needed?" });
    await user.type(reason, " Updated.");
    expect(change.mock.lastCall![0][0]).toMatchObject({ targetKind: "main_line", targetMainLineId: "lights" });
  });

  it("creates a reusable temporary item under the chosen Basket and links its identity", async () => {
    const onItemConfirmed = vi.fn();
    const { user, change, client } = setup([{ ...rule, targetSubBasketId: null, targetMainLineId: null }], { onItemConfirmed });
    await openRule(user);
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
    expect(onItemConfirmed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ mainLineId: "new-temp", itemType: "temporary" }));
    expect(screen.getByRole("link", { name: "Configure temporary item" })).toHaveAttribute("href", "/admin/configuration/estimation/items/new-temp");
    client.clear();
  });

  it("retains saved selections through catalog errors and prevents historical edits or unauthorized creation", async () => {
    vi.mocked(api.listKnowledgeSubBaskets).mockRejectedValue(new Error("Offline"));
    const { user, change } = setup([rule], { readOnly: true, canCreate: false });
    await openRule(user);
    await screen.findByRole("button", { name: "Retry Sub Baskets" });
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("lights");
    expect(screen.getByRole("textbox", { name: "Why is this change needed?" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add Mandatory Item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add temporary item" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Enabled" }));
    expect(change).not.toHaveBeenCalled();
  });

  it("loads later Sub Basket pages and filters temporary selections separately", async () => {
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async (_basketId, params) => params?.offset === 0
      ? { items: [{ ...sub, id: "first-sub", name: "Wiring" }], pagination: { offset: 0, limit: 100, total: 2, hasMore: true } }
      : { items: [sub], pagination: { offset: 1, limit: 100, total: 2, hasMore: false } });
    const { user } = setup([{ ...rule, targetSubBasketId: null }]);
    await openRule(user);
    await screen.findByRole("option", { name: sub.name });
    await user.selectOptions(screen.getByRole("combobox", { name: "Item type" }), "temporary");
    const temporary = screen.getByRole("combobox", { name: "Related item" });
    expect(within(temporary).getByRole("option", { name: "Temporary LED Lights" })).toBeInTheDocument();
    expect(within(temporary).queryByRole("option", { name: /Ceiling COB Lights/ })).not.toBeInTheDocument();
  });

  it("opens a starter without mutating the rule and restores the previous selection on cancel", async () => {
    const onItemConfirmed = vi.fn();
    const { user, change } = setup([{ ...rule, targetSubBasketId: null }], { onItemConfirmed });
    await openRule(user);
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
    expect(onItemConfirmed).not.toHaveBeenCalled();
  });

  it("creates a starter using its saved ID and name immediately, then makes it reusable in another rule", async () => {
    const created = { ...items[1], mainLineId: "created-downlight", mainLineName: "Recessed LED downlight", subBasketId: "sub-ceiling", subBasketName: "Ceiling lighting" } as KnowledgeItemDetail;
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue(created);
    const onItemConfirmed = vi.fn();
    const { user, change } = setup([{ ...rule, targetSubBasketId: null }, { ...rule, id: "rule-2", targetSubBasketId: null, targetMainLineId: null }], { onItemConfirmed });
    await openRule(user);
    await screen.findAllByRole("option", { name: sub.name });
    const first = screen.getByRole("combobox", { name: "Related item" });
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
    await user.click(screen.getByRole("button", { name: "Done" }));
    await openRule(user, 2);
    const second = screen.getByRole("combobox", { name: "Related item" });
    await screen.findByRole("option", { name: created.mainLineName + " · Ceiling lighting" });
    expect(within(second).queryByRole("option", { name: created.mainLineName + " · Ceiling lighting" })).toHaveValue(created.mainLineId);
    await user.selectOptions(second, created.mainLineId);
    expect(change.mock.lastCall![0][1]).toMatchObject({ targetMainLineId: created.mainLineId, targetSubBasketId: created.subBasketId });
    expect(api.createKnowledgeMainLine).toHaveBeenCalledTimes(1);
    expect(onItemConfirmed).toHaveBeenCalledExactlyOnceWith(created);
  });

  it("adds a custom catalog item in an unrecognized basket and preserves the selected context", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue({ ...items[3], mainLineId: "custom", mainLineName: "Custom panel", subBasketId: "custom-sub", subBasketName: "Joinery" } as KnowledgeItemDetail);
    const { user, change } = setup([{ ...rule, targetBasketId: "basket-1", targetSubBasketId: null, targetMainLineId: null }]);
    await openRule(user);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add related item" })).toBeEnabled());
    expect(screen.queryByRole("group", { name: "Suggested items — add to catalog" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), "Custom panel");
    await user.type(within(dialog).getByRole("textbox", { name: "Sub basket" }), "Joinery");
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add related item" })).not.toBeInTheDocument());
    expect(change.mock.lastCall![0][0]).toMatchObject({ targetMainLineId: "custom", targetBasketId: "basket-1", targetSubBasketId: "custom-sub", targetType: "catalog" });
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveDisplayValue("Custom panel");
  });

  it("does not publish related-item details or change the rule when catalog creation fails", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Review the related item name."));
    const onItemConfirmed = vi.fn();
    const { user, change } = setup([rule], { onItemConfirmed });
    await openRule(user);
    await screen.findByRole("option", { name: sub.name });
    await user.click(screen.getByRole("button", { name: "Add related item" }));
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), "New fitting");
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    expect(await within(dialog).findByText("Review the related item name.")).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    expect(onItemConfirmed).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("lights");
  });

  it.each([{ canCreate: false }, { readOnly: true }])("hides custom and starter creation for restricted access: %j", async (options) => {
    const { user } = setup([{ ...rule, targetSubBasketId: null }], options);
    await openRule(user);
    await screen.findByRole("option", { name: sub.name });
    expect(screen.queryByRole("button", { name: "Add related item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Suggested items — add to catalog" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("lights");
  });

  it.each([{ status: "loading" as const }, { status: "error" as const }, { status: "ready" as const, refreshErrorMessage: "Offline" }])("retains saved targets and disables creation during incomplete catalogs: %j", async (catalogState) => {
    const { user, change } = setup([{ ...rule, targetSubBasketId: null }], { catalogState });
    await openRule(user);
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
    await openRule(user);
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
    await openRule(user);
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
    expect(invalidation).toHaveBeenCalledTimes(10);
    expect(api.createKnowledgeMainLine).toHaveBeenCalledTimes(1);
  });

  it("uses newer confirmed reuse details until an equal or newer catalog version arrives", async () => {
    const stale = { ...items[1], mainLineName: "Old fitting name", status: "inactive" as const };
    const confirmed = { ...items[1], mainLineName: "Renamed fitting", status: "active" as const, version: 2 } as KnowledgeItemDetail;
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValue(new ApiError(409, "CONFLICT", "Already exists"));
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([{ ...meta, id: "lights", name: confirmed.mainLineName, basketId: "basket-0", subBasketId: sub.id, status: "active", itemType: "main_line", completionRequired: false, displayOrder: 0, description: null, activeRevisionId: "confirmed-active", draftRevisionId: null }]));
    vi.mocked(api.getKnowledgeItem).mockResolvedValue(confirmed);
    const onItemConfirmed = vi.fn();
    const { user, updateItems } = setup([rule, { ...rule, id: "second", targetMainLineId: null }], { items: items.map((item) => item.mainLineId === "lights" ? stale : item), onItemConfirmed });
    await openRule(user);
    await screen.findAllByRole("option", { name: sub.name });
    await user.click(screen.getAllByRole("button", { name: "Add related item" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), confirmed.mainLineName);
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await user.click(await within(dialog).findByRole("button", { name: "Use existing item" }));
    const first = screen.getByRole("combobox", { name: "Related item" });
    await waitFor(() => expect(first).toHaveDisplayValue(confirmed.mainLineName));
    expect(onItemConfirmed).toHaveBeenCalledExactlyOnceWith(confirmed);
    expect(within(first).getByRole("option", { name: confirmed.mainLineName })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await openRule(user, 2);
    const second = screen.getByRole("combobox", { name: "Related item" });
    await user.selectOptions(second, "lights");
    expect(second).toHaveDisplayValue(confirmed.mainLineName);
    await act(async () => updateItems(items.map((item) => item.mainLineId === "lights" ? confirmed : item)));
    await act(async () => updateItems(items.map((item) => item.mainLineId === "lights" ? { ...confirmed, version: 3, status: "inactive" } : item)));
    expect(within(second).getByRole("option", { name: confirmed.mainLineName })).toBeDisabled();
  });

  it("does not apply a delayed create response to a different source with the same rule ID", async () => {
    let complete!: (item: KnowledgeItemDetail) => void;
    vi.mocked(api.createKnowledgeMainLine).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const onItemConfirmed = vi.fn();
    const { user, change, switchSource, client } = setup([rule], { onItemConfirmed });
    await openRule(user);
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
    expect(onItemConfirmed).not.toHaveBeenCalled();
    await openRule(user);
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("lights");
    expect(client.getQueryData(["ai-estimator-knowledge", "item", "late-fitting"])).toEqual(detail);
  });

  it("renders compact groups without editing or rewriting mixed rules", async () => {
    const mixed = [
      { ...rule, id: "mandatory", trigger: "added", action: "add" },
      { ...rule, id: "probable", trigger: "added", action: "add", requirement: "can", targetMainLineId: "temp", targetType: "temporary" },
      { ...rule, id: "excluded", trigger: "added", action: "remove", requirement: "can", targetMainLineId: "cabinet", targetBasketId: "basket-1" },
      { ...rule, id: "removal", active: false }
    ];
    const { user, change } = setup(mixed, { savedValue: mixed });
    expect(screen.queryByRole("textbox", { name: "Why is this change needed?" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Non-Negotiable Additions" })).getByText("Required addition")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Probable Additions" })).getByText("Optional addition")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Exclusions" })).getByText("Optional removal")).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    await openRule(user, 4);
    await user.click(screen.getByRole("checkbox", { name: "Enabled" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(change.mock.lastCall![0].map((row: { id: string }) => row.id)).toEqual(mixed.map((row) => row.id));
    expect(change.mock.lastCall![0].slice(0, 3)).toEqual(mixed.slice(0, 3));
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it("uses the simpler exclusion columns while keeping required and optional removals editable", async () => {
    const exclusions = [{ ...rule, trigger: "added" }, { ...rule, id: "optional-exclusion", trigger: "added", requirement: "can", targetMainLineId: "temp", targetSubBasketId: null, targetType: "temporary" }];
    const { user, change } = setup(exclusions, { savedValue: exclusions });
    const table = screen.getByRole("table", { name: "Exclusions" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["#", "Related item", "Relationship", "Effect", "Condition", "Status", "Actions"]);
    expect(within(table).getByText("Required removal").closest("td")).toHaveAttribute("data-label", "Effect");
    expect(within(table).getByText("Optional removal")).toBeInTheDocument();
    for (const condition of within(table).getAllByText("When present in scope")) expect(condition.closest("td")).toHaveAttribute("data-label", "Condition");
    expect(change).not.toHaveBeenCalled();
    await openRule(user, 2);
    expect(screen.getByRole("combobox", { name: "What happens if?" })).toHaveValue("added");
    expect(screen.getByRole("combobox", { name: "Scope action" })).toHaveValue("can_remove");
    await user.selectOptions(screen.getByRole("combobox", { name: "Scope action" }), "can_add");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(change.mock.lastCall![0]).toEqual([exclusions[0], { ...exclusions[1], action: "add" }]);
    expect(within(screen.getByRole("table", { name: "Probable Additions" })).getByText("Optional addition")).toBeInTheDocument();
  });

  it("retains an incomplete addition after Done and reveals its first invalid field on save", async () => {
    const { user, change, validate } = setup([], { savedValue: [] });
    await user.click(screen.getByRole("button", { name: "Add Mandatory Item" }));
    expect(change.mock.lastCall![0][0]).toMatchObject({ trigger: "added", action: "add", requirement: "must" });
    const rowId = change.mock.lastCall![0][0].id;
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    await act(async () => validate());
    expect(await screen.findByRole("dialog", { name: "Edit scope rule 1" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Main Basket" })).toHaveFocus());
    expect(change.mock.lastCall![0][0].id).toBe(rowId);
    expect(api.createKnowledgeMainLine).not.toHaveBeenCalled();
  });

  it("opens hidden invalid removal rules only for a new validation attempt and preserves focus while typing", async () => {
    const { user, validate } = setup([{ ...rule, reason: "" }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => validate());
    const reason = await screen.findByRole("textbox", { name: "Why is this change needed?" });
    await waitFor(() => expect(reason).toHaveFocus());
    await user.type(reason, "Dependency");
    expect(reason).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps an open draft and field focus through a saved-version refresh", async () => {
    const { user, updateBaselineKey } = setup([rule]);
    await openRule(user);
    const reason = screen.getByRole("textbox", { name: "Why is this change needed?" });
    await user.type(reason, " Updated.");
    await act(async () => updateBaselineKey("server-version-2"));
    expect(screen.getByRole("textbox", { name: "Why is this change needed?" })).toBe(reason);
    expect(reason).toHaveValue(String(rule.reason) + " Updated.");
    expect(reason).toHaveFocus();
  });

  it("supports keyboard row actions and restores focus after closing the editor", async () => {
    const { user, change } = setup([{ ...rule, trigger: "added", action: "add" }]);
    const actions = screen.getByLabelText("Actions for rule 1");
    actions.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: "Disable rule 1" }));
    expect(change.mock.lastCall![0][0]).toMatchObject({ id: rule.id, active: false });
    await waitFor(() => expect(actions).toHaveFocus());
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: "Edit rule 1" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(actions).toHaveFocus());
    await user.keyboard("{Enter}{Escape}");
    expect(actions.parentElement).not.toHaveAttribute("open");
    expect(actions).toHaveFocus();
  });

  it("blocks empty explanations, self references and conflicting rules without changing legacy notes", () => {
    expect(budgetAlterationIssues([{ ...rule, reason: " " }])).toContainEqual(expect.objectContaining({ path: "budgetAlterations.0.reason" }));
    expect(budgetAlterationIssues([{ ...rule, targetMainLineId: "source" }], "source")).toContainEqual(expect.objectContaining({ path: "budgetAlterations.0.targetMainLineId" }));
    expect(budgetAlterationIssues([rule, { ...rule, id: "second", action: "add" }])).toContainEqual(expect.objectContaining({ path: "budgetAlterations.1" }));
    expect(budgetAlterationIssues([rule, { ...rule, id: "second", trigger: "added" }])).toEqual([]);
    expect(budgetAlterationIssues([rule, { ...rule, id: "second", active: false }])).toEqual([]);
  });
});
