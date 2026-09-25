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

vi.mock("./knowledgeApi", () => ({
  listKnowledgeSubBaskets: vi.fn(),
  listKnowledgeBaskets: vi.fn(),
  createKnowledgeBasket: vi.fn(),
  createKnowledgeSubBasket: vi.fn(),
  createKnowledgeMainLine: vi.fn(),
  listKnowledgeMainLines: vi.fn(),
  getKnowledgeItem: vi.fn(),
  updateKnowledgeSubBasket: vi.fn(),
  updateKnowledgeMainLine: vi.fn(),
  permanentlyDeleteKnowledgeMainLine: vi.fn(),
  getKnowledgeSubBasketDeletionImpact: vi.fn(),
  permanentlyDeleteKnowledgeSubBasket: vi.fn()
}));
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
async function addDialogSubBasket(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, group: KnowledgeSubBasket) {
  vi.mocked(api.createKnowledgeSubBasket).mockResolvedValueOnce(group);
  vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async (basketId) => page([
    ...(basketId === sub.basketId ? [sub] : []),
    ...(basketId === group.basketId ? [{ ...group, version: group.version + (vi.mocked(api.createKnowledgeMainLine).mock.calls.length ? 1 : 0) }] : [])
  ]));
  const selector = within(dialog).getByRole("combobox", { name: "Sub basket" });
  await waitFor(() => expect(selector).toBeEnabled());
  await user.selectOptions(selector, "add-sub-basket");
  const input = within(dialog).getByRole("textbox", { name: "New Sub-Basket name" });
  await user.clear(input);
  await user.type(input, group.name);
  await user.click(within(dialog).getByRole("button", { name: "Save Sub-Basket" }));
  await waitFor(() => expect(selector).toHaveValue(group.id));
}
function setup(initial: KnowledgeJsonValue = [], options: { savedValue?: KnowledgeJsonValue; readOnly?: boolean; canCreate?: boolean; canUpdate?: boolean; canLifecycle?: boolean; canReadCatalog?: boolean; items?: KnowledgeItemListItem[]; catalogState?: KnowledgeBudgetCatalogState; onItemConfirmed?: (item: KnowledgeItemDetail) => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const change = vi.fn();
  let updateItems!: (items: KnowledgeItemListItem[]) => void;
  let updatePermissions!: (permissions: { canLifecycle: boolean; canReadCatalog: boolean }) => void;
  let switchSource!: (sourceId: string) => void;
  let validate!: () => void;
  let updateBaselineKey!: (value: string) => void;
  function Harness() {
    const [value, setValue] = useState(initial);
    const [permissions, setPermissions] = useState({ canLifecycle: options.canLifecycle ?? false, canReadCatalog: options.canReadCatalog ?? true });
    updatePermissions = setPermissions;
    const [sourceId, setSourceId] = useState("source");
    switchSource = setSourceId;
    const [validationAttempt, setValidationAttempt] = useState(0);
    validate = () => setValidationAttempt((value) => value + 1);
    const [resetKey, setResetKey] = useState("initial");
    updateBaselineKey = setResetKey;
    const [catalogItems, setCatalogItems] = useState(options.items ?? items);
    updateItems = setCatalogItems;
    return <main><h1>POP False Ceiling</h1><h2>Recommendation &amp; Exclusions</h2><KnowledgeBudgetAlterationBuilder value={value} mainLineId={sourceId} mainLineName="POP False Ceiling" baskets={baskets} items={catalogItems} catalogState={options.catalogState}
      readOnly={options.readOnly ?? false} canCreate={options.canCreate ?? true} canUpdate={options.canUpdate ?? false}
      canLifecycle={permissions.canLifecycle} canReadCatalog={permissions.canReadCatalog} issues={budgetAlterationIssues(value, "source")}
      savedValue={options.savedValue} validationAttempt={validationAttempt} resetKey={resetKey}
      onItemConfirmed={options.onItemConfirmed}
      onChange={(next) => { change(next); setValue(next); }} /></main>;
  }
  const view = render(<QueryClientProvider client={client}><MemoryRouter><Harness /></MemoryRouter></QueryClientProvider>);
  return { ...view, change, user: userEvent.setup(), client, updateItems, updatePermissions, switchSource, validate, updateBaselineKey };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async (basketId) => page(basketId === "basket-0" ? [sub] : []));
  vi.mocked(api.listKnowledgeBaskets).mockResolvedValue(page(baskets));
  vi.mocked(api.createKnowledgeBasket).mockResolvedValue({ ...baskets[0], id: "basket-new", name: "Lighting" });
  vi.mocked(api.createKnowledgeMainLine).mockImplementation(async (basketId, input) => ({ ...items[2], mainLineId: "new-temp", mainLineName: input.name, basketId, subBasketId: input.subBasketId ?? null, itemType: input.itemType ?? "main_line" } as KnowledgeItemDetail));
  vi.mocked(api.updateKnowledgeSubBasket).mockResolvedValue({ ...sub, version: 2 });
  vi.mocked(api.updateKnowledgeMainLine).mockResolvedValue({ ...items[1], version: 2 } as KnowledgeItemDetail);
  vi.mocked(api.getKnowledgeSubBasketDeletionImpact).mockResolvedValue({ basketId: sub.basketId, subBasketId: sub.id, subBasketName: sub.name, version: sub.version, mainLineCount: 1, referenceCount: 2, impactToken: "reviewed-impact" });
  vi.mocked(api.permanentlyDeleteKnowledgeSubBasket).mockImplementation(async () => {
    vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue(page([]));
    return { basketId: sub.basketId, subBasketId: sub.id, deleted: true, deletedAt: meta.updatedAt, deletedMainLineIds: ["lights"], deletedReferenceCount: 2 };
  });
  vi.mocked(api.permanentlyDeleteKnowledgeMainLine).mockResolvedValue({ mainLineId: items[1].mainLineId, deleted: true, deletedAt: "2026-09-23T00:00:00.000Z" });
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

  it.each(["main_line", "sub_basket"])("adds and selects a Main Basket from the %s rule dropdown without losing the rule draft", async (targetKind) => {
    const initial = { ...rule, targetKind, ...(targetKind === "sub_basket" ? { targetType: null, targetMainLineId: null } : {}) };
    const { user, change } = setup([initial]);
    await openRule(user);
    const basketSelect = screen.getByRole("combobox", { name: "Main Basket" });
    expect(within(basketSelect).getByRole("option", { name: "Add Main Basket" })).toHaveValue("add-main-basket");
    await user.selectOptions(basketSelect, "add-main-basket");
    const basketName = screen.getByRole("textbox", { name: "New Main Basket name" });
    expect(basketName).toHaveFocus();
    expect(basketSelect).toHaveValue("basket-0");
    expect(change).not.toHaveBeenCalled();
    await user.type(basketName, "  Lighting  ");
    await user.click(screen.getByRole("button", { name: "Save main basket" }));
    await waitFor(() => expect(basketSelect).toHaveValue("basket-new"));
    expect(basketSelect).toHaveDisplayValue("Lighting");
    expect(api.createKnowledgeBasket).toHaveBeenCalledExactlyOnceWith({ name: "Lighting" });
    expect(change.mock.lastCall![0]).toEqual([{ ...initial, targetBasketId: "basket-new", targetSubBasketId: null, targetMainLineId: null }]);
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Why is this change needed?" })).toHaveValue(rule.reason);
    expect(api.createKnowledgeMainLine).not.toHaveBeenCalled();

    // The catalog mock deliberately stays stale after creation and editor remount.
    await user.click(screen.getByRole("button", { name: "Done" }));
    await openRule(user);
    const reopenedSelect = screen.getByRole("combobox", { name: "Main Basket" });
    expect(reopenedSelect).toHaveValue("basket-new");
    expect(reopenedSelect).toHaveDisplayValue("Lighting");
    expect(within(reopenedSelect).getByRole("option", { name: "Lighting" })).toBeEnabled();
    expect(api.createKnowledgeBasket).toHaveBeenCalledTimes(1);
  });

  it("keeps the rule editor open until Main Basket creation finishes", async () => {
    let resolveBasket!: (basket: KnowledgeBasket) => void;
    vi.mocked(api.createKnowledgeBasket).mockImplementation(() => new Promise((resolve) => { resolveBasket = resolve; }));
    const { user } = setup([rule]);
    await openRule(user);
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "add-main-basket");
    await user.type(screen.getByRole("textbox", { name: "New Main Basket name" }), "Lighting");
    await user.click(screen.getByRole("button", { name: "Save main basket" }));
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove rule 1" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Edit scope rule 1" })).toBeVisible();
    await act(async () => resolveBasket({ ...baskets[0], id: "basket-new", name: "Lighting" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Main Basket" })).toHaveValue("basket-new"));
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
  });

  it("cancels Main Basket creation from the rule dropdown without clearing its existing targets", async () => {
    const { user, change } = setup([rule]);
    await openRule(user);
    await screen.findByRole("option", { name: sub.name });
    const basketSelect = screen.getByRole("combobox", { name: "Main Basket" });
    await user.selectOptions(basketSelect, "add-main-basket");
    await user.type(screen.getByRole("textbox", { name: "New Main Basket name" }), "Unsaved basket");
    await user.click(screen.getByRole("button", { name: "Cancel new basket" }));
    expect(screen.queryByRole("textbox", { name: "New Main Basket name" })).not.toBeInTheDocument();
    expect(basketSelect).toHaveValue(rule.targetBasketId);
    expect(basketSelect).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(rule.targetSubBasketId);
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue(rule.targetMainLineId);
    expect(change).not.toHaveBeenCalled();
    expect(api.createKnowledgeBasket).not.toHaveBeenCalled();
  });

  it.each([{ canCreate: false }, { readOnly: true }])("hides Main Basket creation from the rule dropdown without creation access: %j", async (options) => {
    const { user } = setup([rule], options);
    await openRule(user);
    const basketSelect = screen.getByRole("combobox", { name: "Main Basket" });
    expect(within(basketSelect).queryByRole("option", { name: "Add Main Basket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "New Main Basket name" })).not.toBeInTheDocument();
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
    let subBasketVersion = 0;
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async (basketId) => page(basketId === "basket-0" ? [{ ...sub, version: ++subBasketVersion }] : []));
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
    await within(dialog).findByRole("option", { name: "Carpentry" });
    expect(within(dialog).getByRole("combobox", { name: "Main basket" })).toBeEnabled();
    expect(within(dialog).getByRole("combobox", { name: "Sub basket" })).toHaveValue(sub.id);
    expect(within(dialog).getByRole("combobox", { name: "Sub basket" })).toBeDisabled();
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

  it("keeps inline actions ready when Add sub-item reuses an existing member at the same aggregate version", async () => {
    vi.mocked(api.createKnowledgeMainLine).mockRejectedValue(new ApiError(409, "CONFLICT", "Already exists"));
    vi.mocked(api.listKnowledgeMainLines).mockResolvedValue(page([{
      id: items[1].mainLineId,
      name: items[1].mainLineName,
      basketId: items[1].basketId,
      subBasketId: items[1].subBasketId,
      itemType: items[1].itemType,
      status: "draft"
    } as never]));
    vi.mocked(api.getKnowledgeItem).mockResolvedValue(items[1] as KnowledgeItemDetail);
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user } = setup([whole], { canCreate: true, canUpdate: true, canLifecycle: true });

    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    await user.click(within(childList).getByRole("button", { name: "Add sub-item" }));
    const dialog = screen.getByRole("dialog", { name: "Add sub-item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Sub-item name" }), items[1].mainLineName);
    await user.click(within(dialog).getByRole("button", { name: "Add sub-item" }));
    await user.click(await within(dialog).findByRole("button", { name: "Use existing item" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add sub-item" })).not.toBeInTheDocument());
    expect(within(childList).queryByText("Loading the latest Sub-Basket version before more catalog changes…")).not.toBeInTheDocument();
    expect(within(childList).getByRole("button", { name: "Edit Ceiling COB Lights" })).toBeEnabled();
    expect(within(childList).getByRole("button", { name: "Add sub-item" })).toBeEnabled();
  });

  it("renames Functional Lights and Supply to False Ceiling Lights without changing the unsaved rule", async () => {
    let serverSubBasket = { ...sub, name: "Functional Lights and Supply" };
    const child = { ...items[1], subBasketName: serverSubBasket.name };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([serverSubBasket]));
    vi.mocked(api.updateKnowledgeSubBasket).mockImplementation(async (_basketId, _subBasketId, input) => {
      serverSubBasket = { ...serverSubBasket, name: input.name, version: serverSubBasket.version + 1 };
      return serverSubBasket;
    });
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null,
      trigger: "added", action: "add", requirement: "can", reason: "Keep this unsaved reason.", active: false };
    const { user, change } = setup([whole], { items: [items[0], child], canUpdate: true });
    await openRule(user);
    await screen.findByRole("button", { name: "Edit Sub-Basket name Functional Lights and Supply" });
    await user.click(screen.getByRole("button", { name: "Edit Sub-Basket name Functional Lights and Supply" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Sub-Basket name" });
    const name = within(dialog).getByRole("textbox", { name: "Sub-Basket name" });
    expect(name).toHaveValue("Functional Lights and Supply");
    await user.clear(name);
    await user.type(name, "False Ceiling Lights");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Sub-Basket name" })).not.toBeInTheDocument());
    expect(api.updateKnowledgeSubBasket).toHaveBeenCalledExactlyOnceWith("basket-0", sub.id, {
      expectedVersion: 1,
      name: "False Ceiling Lights"
    });
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveDisplayValue("False Ceiling Lights · 1 item");
    expect(screen.getByLabelText("Scope change summary")).toHaveTextContent("False Ceiling Lights");
    expect(screen.getByRole("textbox", { name: "Why is this change needed?" })).toHaveValue("Keep this unsaved reason.");
    expect(screen.getByRole("checkbox", { name: "Enabled" })).not.toBeChecked();
    expect(change).not.toHaveBeenCalled();
  });

  it("submits the shown Sub-Basket version and retains entered text through explicit conflict refresh", async () => {
    let serverSubBasket = { ...sub, name: "Functional Lights Supply", version: 1 };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([serverSubBasket]));
    vi.mocked(api.updateKnowledgeSubBasket).mockImplementation(async (_basketId, _subBasketId, input) => {
      if (input.expectedVersion !== serverSubBasket.version) {
        throw new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere");
      }
      serverSubBasket = { ...serverSubBasket, name: input.name, version: serverSubBasket.version + 1 };
      return serverSubBasket;
    });
    const child = { ...items[1], subBasketName: serverSubBasket.name };
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user, client } = setup([whole], { items: [items[0], child], canUpdate: true });

    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit Sub-Basket name Functional Lights Supply" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Sub-Basket name" });
    const name = within(dialog).getByRole("textbox", { name: "Sub-Basket name" });

    serverSubBasket = { ...serverSubBasket, name: "Remote Ceiling Lights", version: 2 };
    act(() => client.setQueriesData(
      { queryKey: ["ai-estimator-knowledge", "sub-baskets", "basket-0"] },
      page([serverSubBasket])
    ));
    expect(name).toHaveValue("Functional Lights Supply");
    await user.clear(name);
    await user.type(name, "Stale Local Rename");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(api.updateKnowledgeSubBasket).toHaveBeenCalledExactlyOnceWith("basket-0", sub.id, {
      expectedVersion: 1,
      name: "Stale Local Rename"
    });
    expect(serverSubBasket.name).toBe("Remote Ceiling Lights");

    await user.click(within(dialog).getByRole("button", { name: "Refresh catalog" }));
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Remote Ceiling Lights"));
    expect(name).toHaveValue("Stale Local Rename");
    expect(api.updateKnowledgeSubBasket).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(api.updateKnowledgeSubBasket).toHaveBeenLastCalledWith("basket-0", sub.id, {
      expectedVersion: 2, name: "Stale Local Rename"
    }));
  });

  it("replaces a local Sub-Basket name bridge when a newer authoritative rename is observed", async () => {
    let serverSubBasket = { ...sub, name: "Functional Lights and Supply" };
    const child = { ...items[1], subBasketName: serverSubBasket.name };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([serverSubBasket]));
    vi.mocked(api.updateKnowledgeSubBasket).mockImplementation(async (_basketId, _subBasketId, input) => {
      serverSubBasket = { ...serverSubBasket, name: input.name, version: 2 };
      return serverSubBasket;
    });
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user, client } = setup([whole], { items: [items[0], child], canUpdate: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit Sub-Basket name Functional Lights and Supply" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Sub-Basket name" });
    const name = within(dialog).getByRole("textbox", { name: "Sub-Basket name" });
    await user.clear(name);
    await user.type(name, "False Ceiling Lights");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.getByLabelText("Scope change summary")).toHaveTextContent("False Ceiling Lights"));

    serverSubBasket = { ...serverSubBasket, name: "Architectural Ceiling Lights", version: 3 };
    await act(async () => {
      await client.refetchQueries({ queryKey: ["ai-estimator-knowledge", "sub-baskets", "basket-0"] });
    });

    await waitFor(() => expect(screen.getByLabelText("Scope change summary")).toHaveTextContent("Architectural Ceiling Lights"));
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveDisplayValue("Architectural Ceiling Lights · 1 item");
  });

  it.each([
    { itemType: "main_line" as const, initialName: "Ceiling COB Lights", nextName: "False Ceiling COB Lights" },
    { itemType: "temporary" as const, initialName: "Temporary ceiling light", nextName: "False Ceiling Lights" }
  ])("renames a Draft $itemType child with the aggregate guard", async ({ itemType, initialName, nextName }) => {
    let serverSubBasket = { ...sub };
    const child = { ...items[1], itemType, mainLineName: initialName, completionRequired: itemType === "temporary" };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([serverSubBasket]));
    vi.mocked(api.updateKnowledgeMainLine).mockImplementation(async () => {
      serverSubBasket = { ...serverSubBasket, version: 2 };
      return { ...child, mainLineName: nextName, version: 2 } as KnowledgeItemDetail;
    });
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user, change } = setup([whole], { items: [items[0], child], canUpdate: true });
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    await user.click(within(childList).getByRole("button", { name: `Edit ${initialName}` }));
    const dialog = screen.getByRole("dialog", { name: `Edit ${initialName}` });
    const name = within(dialog).getByRole("textbox", { name: "Sub-item name" });
    await user.clear(name);
    await user.type(name, nextName);
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(within(childList).getByText(nextName)).toBeVisible());
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledExactlyOnceWith(child.mainLineId, {
      expectedVersion: 1,
      name: nextName,
      draftSubBasketGuard: { subBasketId: sub.id, expectedVersion: 1 }
    });
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);
    expect(screen.getByRole("textbox", { name: "Why is this change needed?" })).toHaveValue(rule.reason);
    expect(change).not.toHaveBeenCalled();
  });

  it("keeps inline actions locked until Add sub-item refreshes the advanced aggregate version", async () => {
    let listCall = 0;
    let resolveRefresh!: (value: ReturnType<typeof page<KnowledgeSubBasket>>) => void;
    const refresh = new Promise<ReturnType<typeof page<KnowledgeSubBasket>>>((resolve) => { resolveRefresh = resolve; });
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => {
      listCall += 1;
      return listCall <= 2 ? page([sub]) : refresh;
    });
    const created = { ...items[1], mainLineId: "new-child", mainLineName: "New ceiling light" } as KnowledgeItemDetail;
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue(created);
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user } = setup([whole], { canUpdate: true, canLifecycle: true });
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    await user.click(within(childList).getByRole("button", { name: "Add sub-item" }));
    const dialog = screen.getByRole("dialog", { name: "Add sub-item" });
    await user.type(within(dialog).getByRole("textbox", { name: "Sub-item name" }), created.mainLineName);
    await user.click(within(dialog).getByRole("button", { name: "Add sub-item" }));
    await waitFor(() => expect(within(childList).getByText(created.mainLineName)).toBeVisible());
    expect(within(childList).getByRole("status")).toHaveTextContent("Loading the latest Sub-Basket version");
    expect(within(childList).queryByRole("button", { name: `Edit ${created.mainLineName}` })).not.toBeInTheDocument();
    expect(within(childList).queryByRole("button", { name: "Add sub-item" })).not.toBeInTheDocument();
    await act(async () => resolveRefresh(page([{ ...sub, version: 2 }])));
    await waitFor(() => expect(within(childList).getByRole("button", { name: `Edit ${created.mainLineName}` })).toBeEnabled());
    expect(within(childList).getByRole("button", { name: "Add sub-item" })).toBeEnabled();
  });

  it("confirms permanent removal, preserves the stable rule, and exposes the last-child empty state", async () => {
    let serverSubBasket = { ...sub };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([serverSubBasket]));
    vi.mocked(api.permanentlyDeleteKnowledgeMainLine).mockImplementation(async (mainLineId) => {
      serverSubBasket = { ...serverSubBasket, version: 2 };
      return { mainLineId, deleted: true, deletedAt: "2026-09-23T00:00:00.000Z" };
    });
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user, change } = setup([whole], { items: [items[0], items[1]], canLifecycle: true });
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    const remove = within(childList).getByRole("button", { name: "Remove Ceiling COB Lights" });
    await user.click(remove);
    let dialog = screen.getByRole("alertdialog", { name: "Remove Ceiling COB Lights?" });
    expect(dialog).toHaveTextContent("last sub-item");
    expect(dialog).toHaveTextContent("Save Recommendation & Exclusions remains a separate action");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(remove).toHaveFocus());
    await user.click(remove);
    dialog = screen.getByRole("alertdialog", { name: "Remove Ceiling COB Lights?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove permanently" }));
    await waitFor(() => expect(within(childList).queryByText("Ceiling COB Lights")).not.toBeInTheDocument());
    expect(within(childList).getByText("No sub-items are available in this Sub-Basket.")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);
    expect(screen.getByRole("textbox", { name: "Why is this change needed?" })).toHaveValue(rule.reason);
    expect(change).not.toHaveBeenCalled();
    expect(api.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledExactlyOnceWith("lights", {
      expectedVersion: 1,
      reason: "Removed from the draft Whole Sub-Basket recommendation editor.",
      draftSubBasketGuard: { subBasketId: sub.id, expectedVersion: 1 }
    });
    await waitFor(() => expect(within(childList).getByRole("button", { name: "Add sub-item" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("button", { name: "Edit rule 1: Lights Procurement" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit rule 1: Unavailable Sub-Basket" })).not.toBeInTheDocument();
  });

  it("uses the removal versions shown at confirmation open so a remotely changed child is retained", async () => {
    let serverSubBasket = { ...sub, version: 1 };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([serverSubBasket]));
    const remoteChild = { ...items[1], mainLineName: "Remote Renamed Light", version: 2 };
    vi.mocked(api.permanentlyDeleteKnowledgeMainLine).mockImplementation(async (_mainLineId, input) => {
      if (input.expectedVersion !== remoteChild.version || input.draftSubBasketGuard?.expectedVersion !== serverSubBasket.version) {
        throw new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere");
      }
      return { mainLineId: remoteChild.mainLineId, deleted: true, deletedAt: "2026-09-23T00:00:00.000Z" };
    });
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user, client, updateItems } = setup([whole], {
      items: [items[0], items[1]],
      canLifecycle: true
    });

    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    await user.click(within(childList).getByRole("button", { name: "Remove Ceiling COB Lights" }));
    const dialog = screen.getByRole("alertdialog", { name: "Remove Ceiling COB Lights?" });

    serverSubBasket = { ...serverSubBasket, version: 2 };
    act(() => {
      updateItems([items[0], remoteChild]);
      client.setQueriesData(
        { queryKey: ["ai-estimator-knowledge", "sub-baskets", "basket-0"] },
        page([serverSubBasket])
      );
    });
    expect(screen.getByRole("alertdialog", { name: "Remove Ceiling COB Lights?" })).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Remove permanently" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(api.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledExactlyOnceWith(items[1].mainLineId, {
      expectedVersion: 1,
      reason: "Removed from the draft Whole Sub-Basket recommendation editor.",
      draftSubBasketGuard: { subBasketId: sub.id, expectedVersion: 1 }
    });
    expect(within(childList).getByText("Remote Renamed Light")).toBeVisible();
  });

  it("moves focus to the adjacent child action after lifecycle-only removal", async () => {
    let serverSubBasket = { ...sub };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([serverSubBasket]));
    vi.mocked(api.permanentlyDeleteKnowledgeMainLine).mockImplementation(async (mainLineId) => {
      serverSubBasket = { ...serverSubBasket, version: 2 };
      return { mainLineId, deleted: true, deletedAt: "2026-09-23T00:00:00.000Z" };
    });
    const secondChild = {
      ...items[1],
      mainLineId: "pendant-light",
      mainLineName: "Pendant Light"
    } as KnowledgeItemListItem;
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user } = setup([whole], {
      items: [items[0], items[1], secondChild],
      canCreate: false,
      canUpdate: false,
      canLifecycle: true
    });

    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    await user.click(within(childList).getByRole("button", { name: "Remove Ceiling COB Lights" }));
    const dialog = screen.getByRole("alertdialog", { name: "Remove Ceiling COB Lights?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove permanently" }));

    await waitFor(() => expect(within(childList).queryByText("Ceiling COB Lights")).not.toBeInTheDocument());
    await waitFor(() => expect(within(childList).getByRole("button", { name: "Remove Pendant Light" })).toHaveFocus());
  });

  it("resolves an already-empty Whole Sub-Basket by stable ID and keeps its catalog name", async () => {
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user } = setup([whole], { items: [items[0]], canCreate: true, canUpdate: true, canLifecycle: true });

    await user.click(screen.getByText("Other scope rules", { selector: "summary" }));
    const target = await screen.findByRole("button", { name: "Edit rule 1: Lights Procurement" });
    expect(target).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit rule 1: Unavailable Sub-Basket" })).not.toBeInTheDocument();
    await user.click(target);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    expect(within(childList).getByText("No sub-items are available in this Sub-Basket.")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);
  });

  it("shows a frozen Sub-Basket without inline catalog mutations when any direct child has left Draft", async () => {
    const frozenItems = [
      items[0],
      { ...items[1], status: "active" as const },
      { ...items[1], mainLineId: "inactive-light", mainLineName: "Inactive light", status: "inactive" as const }
    ];
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user } = setup([whole], { items: frozenItems, canCreate: true, canUpdate: true, canLifecycle: true });
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    expect(within(childList).getByText("Frozen in Configuration")).toBeVisible();
    expect(within(childList).queryByRole("button", { name: /Edit Sub-Basket name/u })).not.toBeInTheDocument();
    expect(within(childList).queryByRole("button", { name: "Edit Ceiling COB Lights" })).not.toBeInTheDocument();
    expect(within(childList).queryByRole("button", { name: "Remove Ceiling COB Lights" })).not.toBeInTheDocument();
    expect(within(childList).queryByRole("button", { name: "Add sub-item" })).not.toBeInTheDocument();
    expect(within(childList).getByRole("link", { name: "Open Ceiling COB Lights in Configuration" }))
      .toHaveAttribute("href", "/admin/configuration/estimation/items/lights");
    expect(within(childList).getByRole("link", { name: "Open Inactive light in Configuration" }))
      .toHaveAttribute("href", "/admin/configuration/estimation/items/inactive-light");
  });

  it.each([
    { canUpdate: true, canLifecycle: false, edit: true, remove: false },
    { canUpdate: false, canLifecycle: true, edit: false, remove: true }
  ])("keeps update and lifecycle permissions separate: %j", async ({ canUpdate, canLifecycle, edit, remove }) => {
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user } = setup([whole], { canUpdate, canLifecycle });
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    expect(Boolean(within(childList).queryByRole("button", { name: "Edit Ceiling COB Lights" }))).toBe(edit);
    expect(Boolean(within(childList).queryByRole("button", { name: "Edit Sub-Basket name Lights Procurement" }))).toBe(edit);
    expect(Boolean(within(childList).queryByRole("button", { name: "Remove Ceiling COB Lights" }))).toBe(remove);
  });

  it.each([
    { status: 409, code: "VERSION_CONFLICT", message: "This catalog changed elsewhere", refreshable: true },
    { status: 409, code: "SUB_BASKET_FROZEN", message: "one or more sub-items are no longer Draft", refreshable: true },
    { status: 409, code: "SUB_BASKET_PARENT_MISMATCH", message: "no longer belongs to the selected Sub-Basket", refreshable: true },
    { status: 409, code: "DUPLICATE_IDENTITY", message: "name is already used", refreshable: false },
    { status: 404, code: "NOT_FOUND", message: "catalog entry no longer exists", refreshable: true },
    { status: 403, code: "FORBIDDEN", message: "no longer have permission", refreshable: false }
  ])("maps catalog mutation error $code without closing the editor", async ({ status, code, message, refreshable }) => {
    vi.mocked(api.updateKnowledgeSubBasket).mockRejectedValue(new ApiError(status, code, "Server message"));
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user } = setup([whole], { canUpdate: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit Sub-Basket name Lights Procurement" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Sub-Basket name" });
    const name = within(dialog).getByRole("textbox", { name: "Sub-Basket name" });
    await user.clear(name);
    await user.type(name, "False Ceiling Lights");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("dialog", { name: "Edit Sub-Basket name" })).toBeVisible();
    expect(Boolean(within(dialog).queryByRole("button", { name: "Refresh catalog" }))).toBe(refreshable);
  });

  it("closes a stale catalog dialog when relevant refreshes prove frozen even if an auxiliary refresh fails", async () => {
    vi.mocked(api.updateKnowledgeSubBasket).mockRejectedValue(new ApiError(409, "SUB_BASKET_FROZEN", "Frozen"));
    let updateCatalogItems!: (next: KnowledgeItemListItem[]) => void;
    let freezeDuringRefresh = false;
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => {
      if (freezeDuringRefresh) act(() => updateCatalogItems([items[0], { ...items[1], status: "active" }]));
      return page([sub]);
    });
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user, updateItems, client } = setup([whole], { items: [items[0], items[1]], canUpdate: true, canLifecycle: true });
    updateCatalogItems = updateItems;
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit Sub-Basket name Lights Procurement" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Sub-Basket name" });
    const name = within(dialog).getByRole("textbox", { name: "Sub-Basket name" });
    await user.clear(name);
    await user.type(name, "False Ceiling Lights");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    const refresh = await within(dialog).findByRole("button", { name: "Refresh catalog" });

    freezeDuringRefresh = true;
    const invalidate = client.invalidateQueries.bind(client);
    vi.spyOn(client, "invalidateQueries").mockImplementation(async (filters, options) => {
      if ((filters?.queryKey as readonly unknown[] | undefined)?.[1] === "history") throw new Error("History refresh failed");
      return invalidate(filters, options);
    });
    await user.click(refresh);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Sub-Basket name" })).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("now frozen in Configuration");
    const childList = screen.getByRole("region", { name: "Sub-items" });
    expect(within(childList).getByText("Frozen in Configuration")).toBeVisible();
    expect(within(childList).queryByRole("button", { name: /Edit Sub-Basket name/u })).not.toBeInTheDocument();
  });

  it("reports a saved child rename separately from a failed refresh and retries reads without repeating the mutation", async () => {
    let serverSubBasket = { ...sub };
    let rejectRefresh = false;
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => {
      if (rejectRefresh) {
        rejectRefresh = false;
        throw new Error("Offline");
      }
      return page([serverSubBasket]);
    });
    vi.mocked(api.updateKnowledgeMainLine).mockImplementation(async () => {
      serverSubBasket = { ...serverSubBasket, version: 2 };
      rejectRefresh = true;
      return { ...items[1], mainLineName: "False Ceiling Lights", version: 2 } as KnowledgeItemDetail;
    });
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const { user } = setup([whole], { canUpdate: true });
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    await user.click(within(childList).getByRole("button", { name: "Edit Ceiling COB Lights" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Ceiling COB Lights" });
    const name = within(dialog).getByRole("textbox", { name: "Sub-item name" });
    await user.clear(name);
    await user.type(name, "False Ceiling Lights");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    const retry = await screen.findByRole("button", { name: "Retry catalog refresh" });
    expect(screen.getByRole("status", { name: "Catalog refresh status" }))
      .toHaveTextContent(/sub-item name was saved, but the latest catalog version could not be loaded/u);
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledTimes(1);
    await user.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry catalog refresh" })).not.toBeInTheDocument());
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledTimes(1);
    expect(within(childList).getByRole("button", { name: "Edit False Ceiling Lights" })).toBeEnabled();
  });

  it("adds a Main Basket inside Add sub-item and retargets the same Whole Sub-Basket rule only after its child is saved", async () => {
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const created = {
      ...items[1], mainLineId: "new-light", mainLineName: "Pendant light", basketId: "basket-new", basketName: "Lighting",
      subBasketId: "sub-pendants", subBasketName: "Pendant lights"
    } as KnowledgeItemDetail;
    let complete!: (item: KnowledgeItemDetail) => void;
    vi.mocked(api.createKnowledgeMainLine).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const onItemConfirmed = vi.fn();
    const { user, change } = setup([whole], { onItemConfirmed });
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    await user.click(within(childList).getByRole("button", { name: "Add sub-item" }));
    const dialog = screen.getByRole("dialog", { name: "Add sub-item" });
    await within(dialog).findByRole("option", { name: "Carpentry" });
    const basketSelect = within(dialog).getByRole("combobox", { name: "Main basket" });
    expect(basketSelect).toBeEnabled();
    expect(within(basketSelect).getByRole("option", { name: "Add Main Basket" })).toHaveValue("add-main-basket");
    await user.type(within(dialog).getByRole("textbox", { name: "Sub-item name" }), created.mainLineName);
    await user.selectOptions(basketSelect, "add-main-basket");
    await user.type(within(dialog).getByRole("textbox", { name: "New Main Basket name" }), "Lighting");
    await user.click(within(dialog).getByRole("button", { name: "Save main basket" }));
    await waitFor(() => expect(basketSelect).toHaveValue("basket-new"));
    expect(api.createKnowledgeBasket).toHaveBeenCalledExactlyOnceWith({ name: "Lighting" });
    const subBasketName = within(dialog).getByRole("combobox", { name: "Sub basket" });
    expect(subBasketName).toBeEnabled();
    expect(subBasketName).toHaveValue("");
    expect(subBasketName).toBeRequired();
    expect(within(dialog).getByRole("textbox", { name: "Sub-item name" })).toHaveValue(created.mainLineName);
    expect(within(dialog).getByRole("button", { name: "Add sub-item" })).toBeDisabled();
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);

    await addDialogSubBasket(user, dialog, { ...sub, id: created.subBasketId!, basketId: created.basketId, name: created.subBasketName! });
    await user.click(within(dialog).getByRole("button", { name: "Add sub-item" }));
    expect(api.createKnowledgeMainLine).toHaveBeenCalledExactlyOnceWith("basket-new", { name: created.mainLineName, subBasketId: created.subBasketId });
    expect(change).not.toHaveBeenCalled();
    expect(onItemConfirmed).not.toHaveBeenCalled();
    await act(async () => complete(created));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add sub-item" })).not.toBeInTheDocument());
    expect(change.mock.lastCall![0]).toEqual([{ ...whole, targetBasketId: created.basketId, targetSubBasketId: created.subBasketId }]);
    expect(onItemConfirmed).toHaveBeenCalledExactlyOnceWith(created);
    expect(screen.getByRole("combobox", { name: "Addition type" })).toHaveValue("sub_basket");
    expect(screen.getByRole("combobox", { name: "Main Basket" })).toHaveDisplayValue("Lighting");
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(created.subBasketId);
    expect(within(screen.getByRole("region", { name: "Sub-items" })).getByText(created.mainLineName)).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Related item" })).not.toBeInTheDocument();
  });

  it("keeps the Whole Sub-Basket rule unchanged when a sub-item saves under a different parent than the newly selected Main Basket", async () => {
    const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetSubBasketId: sub.id, targetMainLineId: null };
    const wrongParent = { ...items[1], mainLineId: "wrong-new-parent", mainLineName: "New light", subBasketName: "Pendant lights" } as KnowledgeItemDetail;
    vi.mocked(api.createKnowledgeMainLine).mockResolvedValue(wrongParent);
    const onItemConfirmed = vi.fn();
    const { user, change } = setup([whole], { onItemConfirmed });
    await openRule(user);
    const childList = await screen.findByRole("region", { name: "Sub-items" });
    await user.click(within(childList).getByRole("button", { name: "Add sub-item" }));
    const dialog = screen.getByRole("dialog", { name: "Add sub-item" });
    await within(dialog).findByRole("option", { name: "Carpentry" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Main basket" }), "add-main-basket");
    await user.type(within(dialog).getByRole("textbox", { name: "New Main Basket name" }), "Lighting");
    await user.click(within(dialog).getByRole("button", { name: "Save main basket" }));
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Main basket" })).toHaveValue("basket-new"));
    await addDialogSubBasket(user, dialog, { ...sub, id: "sub-new-pendants", basketId: "basket-new", name: wrongParent.subBasketName! });
    await user.type(within(dialog).getByRole("textbox", { name: "Sub-item name" }), wrongParent.mainLineName);
    await user.click(within(dialog).getByRole("button", { name: "Add sub-item" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("catalog item is saved, but selection is incomplete");
    expect(onItemConfirmed).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    expect(within(childList).queryByText(wrongParent.mainLineName)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);
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
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("catalog item is saved, but selection is incomplete");
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
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Main basket" }), "add-main-basket");
    await user.type(within(dialog).getByRole("textbox", { name: "New Main Basket name" }), "Lighting");
    await user.click(within(dialog).getByRole("button", { name: "Save main basket" }));
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Main basket" })).toHaveValue("basket-new"));
    await user.type(within(dialog).getByRole("textbox", { name: "New Sub-Basket name" }), "False ceiling lights");
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
    expect(within(dialog).getByRole("combobox", { name: "Sub basket" })).toHaveValue("");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Sub basket" }), "add-sub-basket");
    expect(within(dialog).getByRole("textbox", { name: "New Sub-Basket name" })).toHaveValue("Ceiling lighting");
    await user.click(within(dialog).getByRole("button", { name: "Cancel new Sub-Basket" }));
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
    await addDialogSubBasket(user, dialog, { ...sub, id: created.subBasketId!, name: created.subBasketName! });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Add related item" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(first).toHaveValue(created.mainLineId));
    expect(first).toHaveDisplayValue(created.mainLineName);
    expect(change.mock.lastCall![0][0]).toMatchObject({ targetMainLineId: created.mainLineId, targetSubBasketId: created.subBasketId, targetBasketId: created.basketId, targetType: "catalog", trigger: "removed", action: "remove", reason: rule.reason });
    expect(JSON.stringify(change.mock.lastCall![0])).not.toContain("suggestion:");
    expect(change.mock.lastCall![0][1]).toMatchObject({ id: "rule-2", targetMainLineId: null });
    expect(screen.getAllByLabelText("Scope change summary")[0]).toHaveTextContent(created.mainLineName);
    expect(screen.getByText(/Save this section to keep the rule change/)).toBeVisible();
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
    await addDialogSubBasket(user, dialog, { ...sub, id: "custom-sub", basketId: "basket-1", name: "Joinery" });
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
    act(() => client.setQueriesData({ queryKey: ["ai-estimator-knowledge", "sub-baskets", "basket-0"] }, page([{ ...sub, version: 2 }])));
    await user.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry catalog refresh" })).not.toBeInTheDocument());
    expect(invalidation.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(expect.arrayContaining([
      ["ai-estimator-knowledge", "items"], ["ai-estimator-knowledge", "sub-baskets", "basket-0"]
    ]));
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

describe("Line item draft catalog actions", () => {
  it("renames the selected Sub-Basket from Line item mode while keeping the draft and identities", async () => {
    let group = { ...sub, name: "Functional lights Supply" };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([group]));
    vi.mocked(api.updateKnowledgeSubBasket).mockImplementation(async (_basketId, _groupId, input) => {
      group = { ...group, name: input.name, version: 2 };
      return group;
    });
    const initial = { ...rule, active: false, reason: "Keep my unsaved reason", action: "add", trigger: "added", requirement: "can" };
    const { user, change } = setup([initial], { canUpdate: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit Sub-Basket name Functional lights Supply" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Sub-Basket name" });
    const input = within(dialog).getByRole("textbox", { name: "Sub-Basket name" });
    await user.clear(input);
    await user.type(input, "False Ceiling Lights");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    expect(api.updateKnowledgeSubBasket).toHaveBeenCalledExactlyOnceWith("basket-0", sub.id, { expectedVersion: 1, name: "False Ceiling Lights" });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveDisplayValue("False Ceiling Lights"));
    expect(screen.getByRole("combobox", { name: "Addition type" })).toHaveValue("main_line");
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("lights");
    expect(screen.getByRole("textbox", { name: "Why is this change needed?" })).toHaveValue(initial.reason);
    expect(screen.getByRole("checkbox", { name: "Enabled" })).not.toBeChecked();
    expect(change).not.toHaveBeenCalled();
  });

  it.each(["main_line", "temporary"] as const)("renames a selected grouped %s through All Sub-Baskets using the authoritative group ID", async (itemType) => {
    let group = { ...sub };
    const child = { ...items[1], itemType };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([group]));
    vi.mocked(api.updateKnowledgeMainLine).mockImplementation(async () => {
      group = { ...group, version: 2 };
      return { ...child, mainLineName: "False Ceiling Lights", version: 2 } as KnowledgeItemDetail;
    });
    const initial = { ...rule, targetSubBasketId: null, targetType: itemType === "temporary" ? "temporary" : "catalog" };
    const { user, change } = setup([initial], { items: [items[0], child], canUpdate: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit item name" }));
    const dialog = screen.getByRole("dialog", { name: `Edit ${child.mainLineName}` });
    const input = within(dialog).getByRole("textbox", { name: "Item name" });
    await user.clear(input);
    await user.type(input, "False Ceiling Lights");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: `Edit ${child.mainLineName}` })).not.toBeInTheDocument());
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledExactlyOnceWith("lights", { expectedVersion: 1, name: "False Ceiling Lights", draftSubBasketGuard: { subBasketId: sub.id, expectedVersion: 1 } });
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue("");
    expect(screen.getByLabelText("Scope change summary")).toHaveTextContent("False Ceiling Lights");
    expect(change).not.toHaveBeenCalled();
    const result = await axe.run(screen.getByRole("dialog", { name: "Edit scope rule 1" }), { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it("renames a direct-parent temporary item with the exact draft guard without freezing unrelated siblings", async () => {
    const direct = items[2];
    vi.mocked(api.updateKnowledgeMainLine).mockResolvedValue({ ...direct, mainLineName: "False Ceiling Lights", version: 2 } as KnowledgeItemDetail);
    const initial = { ...rule, targetSubBasketId: null, targetMainLineId: direct.mainLineId, targetType: "temporary" };
    const { user, change } = setup([initial], { items: [items[0], { ...items[1], status: "archived" }, direct], canUpdate: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit item name" }));
    const dialog = screen.getByRole("dialog", { name: `Edit ${direct.mainLineName}` });
    const name = within(dialog).getByRole("textbox", { name: "Item name" });
    await user.clear(name);
    await user.type(name, "False Ceiling Lights");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledExactlyOnceWith(direct.mainLineId, { expectedVersion: 1, name: "False Ceiling Lights", draftItemGuard: { basketId: "basket-0", subBasketId: null } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: `Edit ${direct.mainLineName}` })).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "Edit item name" })).toBeEnabled();
    expect(change).not.toHaveBeenCalled();
  });

  it.each(["grouped", "direct"] as const)("confirms removal of a selected %s item and retains an unavailable rule target", async (scope) => {
    const target = scope === "grouped" ? items[1] : items[2];
    let group = { ...sub };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([group]));
    vi.mocked(api.permanentlyDeleteKnowledgeMainLine).mockImplementation(async (mainLineId) => {
      group = { ...group, version: 2 };
      return { mainLineId, deleted: true, deletedAt: meta.updatedAt };
    });
    const initial = { ...rule, targetMainLineId: target.mainLineId, targetSubBasketId: target.subBasketId ?? null, targetType: scope === "direct" ? "temporary" : "catalog", reason: "Do not lose this draft" };
    const savedRules = [initial, { ...rule, id: "other-rule" }];
    const { user, change } = setup(savedRules, { savedValue: savedRules, canLifecycle: true });
    await openRule(user);
    const remove = await screen.findByRole("button", { name: "Remove item" });
    if (scope === "direct") expect(screen.getByRole("link", { name: "Configure temporary item" })).toHaveAttribute("href", `/admin/configuration/estimation/items/${target.mainLineId}`);
    expect(screen.getByRole("button", { name: "Remove rule 1" })).toHaveTextContent("Remove rule");
    await user.click(remove);
    let dialog = screen.getByRole("alertdialog", { name: `Remove ${target.mainLineName}?` });
    expect(dialog).toHaveTextContent("will still reference the removed item");
    expect(dialog).not.toHaveTextContent("Whole Sub-Basket will remain selected");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(remove).toHaveFocus());
    expect(api.permanentlyDeleteKnowledgeMainLine).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    await user.click(remove);
    dialog = screen.getByRole("alertdialog", { name: `Remove ${target.mainLineName}?` });
    await user.click(within(dialog).getByRole("button", { name: "Remove permanently" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledExactlyOnceWith(target.mainLineId, {
      expectedVersion: target.version, reason: "Removed from the draft Line item recommendation editor.",
      ...(scope === "grouped" ? { draftSubBasketGuard: { subBasketId: sub.id, expectedVersion: 1 } } : { draftItemGuard: { basketId: "basket-0", subBasketId: null } })
    });
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue(target.mainLineId);
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveDisplayValue("Unavailable related item");
    expect(screen.queryByRole("link", { name: "Configure temporary item" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Related item" })).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Why is this change needed?" })).toHaveValue(initial.reason);
    expect(change).toHaveBeenCalledExactlyOnceWith(savedRules);
    expect(change.mock.calls[0][0]).toBe(savedRules);
    await user.click(screen.getByRole("button", { name: "Remove rule 1" }));
    expect(change).toHaveBeenLastCalledWith([{ ...rule, id: "other-rule" }]);
    expect(change).toHaveBeenCalledTimes(2);
  });

  it("offers rename for an empty selected group without inventing an item", async () => {
    const { user } = setup([{ ...rule, targetMainLineId: null }], { items: [items[0]], canUpdate: true });
    await openRule(user);
    expect(await screen.findByRole("button", { name: `Edit Sub-Basket name ${sub.name}` })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Edit item name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove item" })).not.toBeInTheDocument();
  });

  it.each(["active", "inactive", "archived"] as const)("freezes grouped actions for a %s sibling even when that sibling has another item type", async (status) => {
    const sibling = { ...items[1], mainLineId: "other-child", itemType: "temporary" as const, status };
    const { user } = setup([rule], { items: [items[0], items[1], sibling], canUpdate: true, canLifecycle: true });
    await openRule(user);
    const region = await screen.findByRole("region", { name: "Selected item" });
    expect(within(region).getByText("Frozen in Configuration")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit item name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Sub-Basket name/ })).not.toBeInTheDocument();
  });

  it.each([true, false])("shows the selected temporary item Configuration link only with catalog read permission: %s", async (canReadCatalog) => {
    const { user } = setup([{ ...rule, targetMainLineId: items[2].mainLineId, targetSubBasketId: null, targetType: "temporary" }], { canReadCatalog });
    await openRule(user);
    expect(Boolean(screen.queryByRole("link", { name: "Configure temporary item" }))).toBe(canReadCatalog);
  });

  it.each(["active", "inactive", "archived"] as const)("does not expose direct-parent editing for a %s temporary item", async (status) => {
    const target = { ...items[2], status };
    const { user } = setup([{ ...rule, targetMainLineId: target.mainLineId, targetSubBasketId: null, targetType: "temporary" }], { items: [items[0], target], canUpdate: true, canLifecycle: true });
    await openRule(user);
    expect(await screen.findByText("This item has left Draft.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit item name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove item" })).not.toBeInTheDocument();
  });

  it.each([{ status: "loading" as const }, { status: "error" as const }, { status: "ready" as const, refreshing: true }, { status: "ready" as const, refreshErrorMessage: "Offline" }])("requires complete sibling inventory before mutation: %j", async (catalogState) => {
    const { user } = setup([rule], { catalogState, canUpdate: true, canLifecycle: true });
    await openRule(user);
    await screen.findByRole("region", { name: "Selected item" });
    expect(screen.queryByRole("button", { name: "Edit item name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Sub-Basket name/ })).not.toBeInTheDocument();
  });

  it.each([
    { targetBasketId: "basket-1", targetSubBasketId: null },
    { targetBasketId: "basket-0", targetSubBasketId: "different-group" },
    { targetBasketId: "basket-0", targetSubBasketId: sub.id, targetType: "temporary" }
  ])("blocks editing when authoritative selected identity mismatches the row: %j", async (mismatch) => {
    const { user } = setup([{ ...rule, ...mismatch, targetType: mismatch.targetType ?? "catalog" }], { canUpdate: true, canLifecycle: true });
    await openRule(user);
    expect(await screen.findByText(/selected item is unavailable or its parent no longer matches/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit item name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Sub-Basket name/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Configure temporary item" })).not.toBeInTheDocument();
  });

  it.each([
    { canUpdate: true, canLifecycle: false, edit: true, remove: false },
    { canUpdate: false, canLifecycle: true, edit: false, remove: true },
    { canUpdate: false, canLifecycle: false, edit: false, remove: false },
    { canUpdate: true, canLifecycle: true, readOnly: true, edit: false, remove: false }
  ])("uses operation-specific selected-item permissions: %j", async ({ edit, remove, ...options }) => {
    const { user } = setup([rule], options);
    await openRule(user);
    await screen.findByRole("option", { name: sub.name });
    expect(Boolean(screen.queryByRole("button", { name: "Edit item name" }))).toBe(edit);
    expect(Boolean(screen.queryByRole("button", { name: "Remove item" }))).toBe(remove);
  });

  it("preserves typed item rename through conflict refresh and saves only after explicit renewed confirmation", async () => {
    let group = { ...sub };
    let remote = { ...items[1] };
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => page([group]));
    vi.mocked(api.updateKnowledgeMainLine).mockImplementation(async (_id, input) => {
      if (input.expectedVersion !== remote.version) throw new ApiError(409, "VERSION_CONFLICT", "Changed");
      group = { ...group, version: group.version + 1 };
      remote = { ...remote, version: remote.version + 1, mainLineName: input.name! };
      return remote as KnowledgeItemDetail;
    });
    const { user, client, updateItems } = setup([rule], { canUpdate: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit item name" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Ceiling COB Lights" });
    const input = within(dialog).getByRole("textbox", { name: "Item name" });
    await user.clear(input);
    await user.type(input, "My chosen name");
    remote = { ...remote, mainLineName: "Remote name", version: 2 };
    group = { ...group, version: 2 };
    act(() => { updateItems(items.map((item) => item.mainLineId === remote.mainLineId ? remote : item)); client.setQueriesData({ queryKey: ["ai-estimator-knowledge", "sub-baskets", "basket-0"] }, page([group])); });
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(input).toHaveValue("My chosen name");
    await user.click(within(dialog).getByRole("button", { name: "Refresh catalog" }));
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Remote name” (version 2)"));
    expect(input).toHaveValue("My chosen name");
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(api.updateKnowledgeMainLine).toHaveBeenLastCalledWith("lights", { expectedVersion: 2, name: "My chosen name", draftSubBasketGuard: { subBasketId: sub.id, expectedVersion: 2 } }));
  });

  it("reports a saved direct rename separately from failed refresh and retries reads only", async () => {
    const target = items[2];
    vi.mocked(api.updateKnowledgeMainLine).mockResolvedValue({ ...target, mainLineName: "Saved direct name", version: 2 } as KnowledgeItemDetail);
    const { user, client } = setup([{ ...rule, targetMainLineId: target.mainLineId, targetSubBasketId: null, targetType: "temporary" }], { canUpdate: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit item name" }));
    const invalidate = vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("Offline"));
    const dialog = screen.getByRole("dialog", { name: `Edit ${target.mainLineName}` });
    const input = within(dialog).getByRole("textbox", { name: "Item name" });
    await user.clear(input);
    await user.type(input, "Saved direct name");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    const retry = await screen.findByRole("button", { name: "Retry catalog refresh" });
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveDisplayValue("Saved direct name");
    invalidate.mockResolvedValue(undefined);
    await user.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry catalog refresh" })).not.toBeInTheDocument());
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledOnce();
  });
});

describe("new selected-item readiness and recovery", () => {
  it("waits for the new grouped item's aggregate version even when creation changes the All Sub-Baskets filter", async () => {
    const created = { ...items[1], mainLineId: "new-selected", mainLineName: "New fitting" } as KnowledgeItemDetail;
    let afterCreate = false;
    let resolveGroup!: (value: ReturnType<typeof page<KnowledgeSubBasket>>) => void;
    const nextGroup = new Promise<ReturnType<typeof page<KnowledgeSubBasket>>>((resolve) => { resolveGroup = resolve; });
    vi.mocked(api.listKnowledgeSubBaskets).mockImplementation(async () => afterCreate ? nextGroup : page([sub]));
    vi.mocked(api.createKnowledgeMainLine).mockImplementation(async () => { afterCreate = true; return created; });
    const { user } = setup([{ ...rule, targetSubBasketId: null, targetMainLineId: null }], { canUpdate: true, canLifecycle: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Add related item" }));
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await within(dialog).findByRole("option", { name: sub.name });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Sub basket" }), sub.id);
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), created.mainLineName);
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add related item" })).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);
    expect(screen.queryByRole("button", { name: "Edit item name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove item" })).not.toBeInTheDocument();
    await act(async () => resolveGroup(page([{ ...sub, version: 2 }])));
    expect(await screen.findByRole("button", { name: "Edit item name" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove item" })).toBeEnabled();
  });

  it("exposes guarded edit and removal for a newly created direct-parent temporary item", async () => {
    const { user } = setup([{ ...rule, targetSubBasketId: null, targetMainLineId: null }], { canUpdate: true, canLifecycle: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Add temporary item" }));
    const dialog = screen.getByRole("dialog", { name: "Add related item" });
    await within(dialog).findByRole("option", { name: sub.name });
    await user.type(within(dialog).getByRole("textbox", { name: "Related item name" }), "New temporary fitting");
    await user.click(within(dialog).getByRole("button", { name: "Add related item" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add related item" })).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "Edit item name" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove item" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Related item" })).toHaveValue("new-temp");
  });

  it.each([
    { code: "ITEM_FROZEN", message: "no longer Draft", refresh: true },
    { code: "ITEM_PARENT_MISMATCH", message: "no longer belongs directly", refresh: true },
    { code: "DUPLICATE_IDENTITY", message: "name is already used", refresh: false },
    { code: "FORBIDDEN", message: "no longer have permission", refresh: false }
  ])("keeps entered direct-item names and handles $code without retrying a mutation", async ({ code, message, refresh }) => {
    vi.mocked(api.updateKnowledgeMainLine).mockRejectedValue(new ApiError(code === "FORBIDDEN" ? 403 : 409, code, "Rejected"));
    const { user } = setup([{ ...rule, targetMainLineId: "temp", targetSubBasketId: null, targetType: "temporary" }], { canUpdate: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit item name" }));
    const dialog = screen.getByRole("dialog", { name: "Edit Temporary LED Lights" });
    const input = within(dialog).getByRole("textbox", { name: "Item name" });
    await user.clear(input);
    await user.type(input, "Keep this edit");
    await user.click(within(dialog).getByRole("button", { name: "Save name" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(input).toHaveValue("Keep this edit");
    expect(Boolean(within(dialog).queryByRole("button", { name: "Refresh catalog" }))).toBe(refresh);
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledOnce();
  });

  it("closes a direct-item edit when authoritative lifecycle changes and preserves the rule", async () => {
    const { user, change, updateItems } = setup([{ ...rule, targetMainLineId: "temp", targetSubBasketId: null, targetType: "temporary" }], { canUpdate: true });
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: "Edit item name" }));
    act(() => updateItems(items.map((item) => item.mainLineId === "temp" ? { ...item, status: "active", version: 2 } : item)));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Temporary LED Lights" })).not.toBeInTheDocument());
    expect(screen.getByText("This item is now frozen in Configuration. Inline catalog changes were closed.")).toBeVisible();
    expect(change).not.toHaveBeenCalled();
    expect(api.updateKnowledgeMainLine).not.toHaveBeenCalled();
  });
});


describe("Inline whole Sub-Basket removal", () => {
  const line = { ...rule, targetKind: "main_line" };
  const whole = { ...rule, targetKind: "sub_basket", targetType: null, targetMainLineId: null };
  async function openRemoval(user: ReturnType<typeof userEvent.setup>) {
    await openRule(user);
    await user.click(await screen.findByRole("button", { name: `Remove Sub-Basket ${sub.name}` }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Sub-Basket?" });
    await within(dialog).findByRole("textbox", { name: "Type Sub-Basket name to confirm" });
    return dialog;
  }
  async function confirmRemoval(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    await user.type(within(dialog).getByRole("textbox", { name: "Type Sub-Basket name to confirm" }), sub.name);
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Group no longer needed");
    await user.click(within(dialog).getByRole("button", { name: "Remove permanently" }));
  }

  it.each([whole, line])("removes the reviewed group in $targetKind while preserving the saved rule and child actions", async (initial) => {
    const { user, change, client } = setup([initial], { canUpdate: true, canLifecycle: true, savedValue: [initial] });
    await openRule(user);
    const groupRegion = screen.getByRole("region", { name: initial.targetKind === "sub_basket" ? "Sub-items" : "Sub-Basket" });
    expect(within(groupRegion).getByRole("button", { name: `Edit Sub-Basket name ${sub.name}` })).toBeVisible();
    const remove = within(groupRegion).getByRole("button", { name: `Remove Sub-Basket ${sub.name}` });
    expect(remove).toHaveClass("ui-button--destructive-outline");
    expect(screen.getByRole("button", { name: initial.targetKind === "sub_basket" ? "Remove Ceiling COB Lights" : "Remove item" })).toBeVisible();
    await user.click(remove);
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Sub-Basket?" });
    await within(dialog).findByRole("textbox", { name: "Reason" });
    expect(dialog).toHaveTextContent("Electrical");
    expect(dialog).toHaveTextContent("Items deleted with it1");
    expect(dialog).toHaveTextContent("References removed elsewhere2");
    expect(dialog).toHaveTextContent("This rule will keep its unavailable target");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    const accessibility = await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } });
    expect(accessibility.violations).toEqual([]);
    await confirmRemoval(user, dialog);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.permanentlyDeleteKnowledgeSubBasket).toHaveBeenCalledExactlyOnceWith(sub.basketId, sub.id, {
      expectedVersion: sub.version, confirmationName: sub.name, reason: "Group no longer needed", impactToken: "reviewed-impact", draftOnly: true
    });
    expect(change).toHaveBeenCalledExactlyOnceWith([initial]);
    expect(screen.getByRole("textbox", { name: "Why is this change needed?" })).toHaveValue(rule.reason);
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toHaveValue(sub.id);
    expect(screen.getByRole("option", { name: "Unavailable Sub-Basket" })).toBeDisabled();
    if (initial.targetKind !== "sub_basket") expect(screen.getByRole("option", { name: "Unavailable related item" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: initial.targetKind === "sub_basket" ? "Sub-items" : "Selected item" })).toHaveFocus();
    // A stale group response cannot resurrect the deleted group or its actions.
    act(() => client.setQueriesData({ queryKey: ["ai-estimator-knowledge", "sub-baskets", sub.basketId] }, page([sub])));
    expect(screen.queryByRole("button", { name: `Remove Sub-Basket ${sub.name}` })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Unavailable Sub-Basket" })).toBeDisabled();
  });

  it("requires exact name and a reason, and cancellation preserves the catalog and focus", async () => {
    const { user, change } = setup([whole], { canLifecycle: true });
    const dialog = await openRemoval(user);
    const confirm = within(dialog).getByRole("button", { name: "Remove permanently" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Type Sub-Basket name to confirm" }), sub.name.toLowerCase());
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "No longer needed");
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.permanentlyDeleteKnowledgeSubBasket).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: `Remove Sub-Basket ${sub.name}` })).toHaveFocus());
  });

  it("removes an empty group and retains a clean saved rule before refresh", async () => {
    vi.mocked(api.getKnowledgeSubBasketDeletionImpact).mockResolvedValue({ basketId: sub.basketId, subBasketId: sub.id, subBasketName: sub.name, version: sub.version, mainLineCount: 0, referenceCount: 1, impactToken: "empty-impact" });
    vi.mocked(api.permanentlyDeleteKnowledgeSubBasket).mockImplementation(async () => {
      vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue(page([]));
      return { basketId: sub.basketId, subBasketId: sub.id, deleted: true, deletedAt: meta.updatedAt, deletedMainLineIds: [], deletedReferenceCount: 1 };
    });
    const { user, change } = setup([whole], { canLifecycle: true, canCreate: false, items: items.filter((item) => item.subBasketId !== sub.id), savedValue: [whole] });
    const dialog = await openRemoval(user);
    expect(dialog).toHaveTextContent("This Sub-Basket is empty");
    await confirmRemoval(user, dialog);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(change).toHaveBeenCalledExactlyOnceWith([whole]);
    expect(screen.getByText("This Sub-Basket was removed from Configuration. Choose another target or remove this rule before saving.")).toBeVisible();
  });

  it.each(["active", "inactive", "archived"] as const)("includes a %s child of another item type in the freeze check", async (status) => {
    const { user } = setup([rule], { canLifecycle: true, items: [...items, { ...items[2], subBasketId: sub.id, status }] });
    await openRule(user);
    expect(screen.queryByRole("button", { name: `Remove Sub-Basket ${sub.name}` })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Sub-Basket" })).getByText("Frozen in Configuration")).toBeVisible();
  });

  it.each([whole, line])("blocks removal of the source item's own group in $targetKind", async (initial) => {
    const { user } = setup([initial], { canLifecycle: true, items: items.map((item) => item.mainLineId === "source" ? { ...item, subBasketId: sub.id } : item) });
    await openRule(user);
    expect(screen.queryByRole("button", { name: `Remove Sub-Basket ${sub.name}` })).not.toBeInTheDocument();
    expect(screen.getByText(/This Sub-Basket contains the item whose recommendations you are editing/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open source item in Configuration" })).toHaveAttribute("href", "/admin/configuration/estimation/items/source");
  });

  it.each([
    { canLifecycle: false }, { canReadCatalog: false }, { readOnly: true },
    { catalogState: { status: "loading" as const } },
    { catalogState: { status: "ready" as const, refreshing: true } },
    { catalogState: { status: "ready" as const, refreshErrorMessage: "Refresh failed" } },
    { items: items.filter((item) => item.mainLineId !== "source") }
  ])("requires lifecycle/read permission and complete source membership: %j", async (options) => {
    const { user } = setup([whole], { canLifecycle: true, ...options });
    await openRule(user);
    expect(screen.queryByRole("button", { name: `Remove Sub-Basket ${sub.name}` })).not.toBeInTheDocument();
  });

  it("does not infer group identity from the same name under another Main Basket", async () => {
    vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue(page([{ ...sub, basketId: "basket-1" }]));
    const { user } = setup([whole], { canLifecycle: true });
    await openRule(user);
    expect(screen.queryByRole("button", { name: `Remove Sub-Basket ${sub.name}` })).not.toBeInTheDocument();
  });

  it.each(["canLifecycle", "canReadCatalog"] as const)("blocks confirmation if %s is lost while open", async (permission) => {
    const { user, updatePermissions } = setup([whole], { canLifecycle: true });
    const dialog = await openRemoval(user);
    act(() => updatePermissions({ canLifecycle: true, canReadCatalog: true, [permission]: false }));
    await confirmRemoval(user, dialog);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("no longer have permission");
    expect(api.permanentlyDeleteKnowledgeSubBasket).not.toHaveBeenCalled();
  });

  it("blocks confirmation when another child freezes during review", async () => {
    const { user, updateItems } = setup([whole], { canLifecycle: true });
    const dialog = await openRemoval(user);
    act(() => updateItems(items.map((item) => item.mainLineId === "lights" ? { ...item, status: "active" } : item)));
    await confirmRemoval(user, dialog);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("frozen");
    expect(api.permanentlyDeleteKnowledgeSubBasket).not.toHaveBeenCalled();
  });

  it("requires a new explicit confirmation after changed impact and never retries deletion automatically", async () => {
    vi.mocked(api.permanentlyDeleteKnowledgeSubBasket).mockRejectedValueOnce(new ApiError(409, "DELETION_IMPACT_CHANGED", "Changed references"));
    const { user } = setup([whole], { canLifecycle: true });
    const dialog = await openRemoval(user);
    vi.mocked(api.getKnowledgeSubBasketDeletionImpact).mockResolvedValue({ basketId: sub.basketId, subBasketId: sub.id, subBasketName: sub.name, version: 2, mainLineCount: 2, referenceCount: 3, impactToken: "new-impact" });
    await confirmRemoval(user, dialog);
    expect(await within(dialog).findByText("Deletion impact changed")).toBeVisible();
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Type Sub-Basket name to confirm" })).toHaveValue(""));
    expect(within(dialog).getByRole("textbox", { name: "Reason" })).toHaveValue("Group no longer needed");
    expect(api.permanentlyDeleteKnowledgeSubBasket).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "Remove permanently" })).toBeDisabled();
  });

  it.each([
    [409, "SUB_BASKET_FROZEN", "frozen"], [403, "FORBIDDEN", "no longer have permission"], [404, "NOT_FOUND", "no longer available"]
  ] as const)("keeps %s %s failures actionable without replay", async (status, code, message) => {
    vi.mocked(api.permanentlyDeleteKnowledgeSubBasket).mockRejectedValue(new ApiError(status, code, "Server detail"));
    const { user, change } = setup([whole], { canLifecycle: true });
    const dialog = await openRemoval(user);
    await confirmRemoval(user, dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(within(dialog).getByRole("button", { name: "Remove permanently" })).toBeDisabled();
    expect(api.permanentlyDeleteKnowledgeSubBasket).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
  });

  it("retains committed state through cache pruning and retries only refresh after refresh failure", async () => {
    const { user, change } = setup([whole], { canLifecycle: true, savedValue: [whole] });
    const dialog = await openRemoval(user);
    vi.mocked(api.permanentlyDeleteKnowledgeSubBasket).mockImplementation(async () => {
      vi.mocked(api.listKnowledgeSubBaskets).mockRejectedValue(new Error("Catalog unavailable"));
      return { basketId: sub.basketId, subBasketId: sub.id, deleted: true, deletedAt: meta.updatedAt, deletedMainLineIds: ["lights"], deletedReferenceCount: 2 };
    });
    await confirmRemoval(user, dialog);
    expect(await within(dialog).findByText(/Retry the refresh; deletion will not run again/)).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Remove permanently" })).not.toBeInTheDocument();
    expect(change).toHaveBeenCalledExactlyOnceWith([whole]);
    vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue(page([]));
    await user.click(within(dialog).getByRole("button", { name: "Retry catalog refresh" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.permanentlyDeleteKnowledgeSubBasket).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Sub-items" })).toHaveFocus();
  });
});
