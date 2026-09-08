import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeBudgetAlterationBuilder } from "./KnowledgeBudgetAlterationBuilder";
import { budgetAlterationIssues, createBudgetAlteration } from "./knowledgeBudgetAlterations";
import * as api from "./knowledgeApi";
import type { KnowledgeBasket, KnowledgeItemDetail, KnowledgeItemListItem, KnowledgeJsonValue, KnowledgeSubBasket } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({ listKnowledgeSubBaskets: vi.fn(), listKnowledgeBaskets: vi.fn(), createKnowledgeMainLine: vi.fn() }));
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
function setup(initial: KnowledgeJsonValue = [], options: { readOnly?: boolean; canCreate?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const change = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    return <main><h1>POP False Ceiling</h1><h2>Recommendation &amp; Exclusions</h2><KnowledgeBudgetAlterationBuilder value={value} mainLineId="source" mainLineName="POP False Ceiling" baskets={baskets} items={items}
      readOnly={options.readOnly ?? false} canCreate={options.canCreate ?? true} issues={budgetAlterationIssues(value, "source")}
      onChange={(next) => { change(next); setValue(next); }} /></main>;
  }
  const view = render(<QueryClientProvider client={client}><MemoryRouter><Harness /></MemoryRouter></QueryClientProvider>);
  return { ...view, change, user: userEvent.setup(), client };
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
    const line = screen.getByRole("combobox", { name: "Main Line" });
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
    expect(screen.getByRole("combobox", { name: "Main Line" })).toHaveValue("");
  });

  it("supports optional additions and removals, independent triggers, disabling and deleting rules", async () => {
    const { user, change } = setup([rule]);
    await screen.findByRole("option", { name: sub.name });
    await user.selectOptions(screen.getByRole("combobox", { name: "What happens if?" }), "added");
    await user.selectOptions(screen.getByRole("combobox", { name: "Related item" }), "can_add");
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
    const dialog = screen.getByRole("dialog", { name: "Add temporary item" });
    await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Main basket" })).toHaveValue("basket-0"));
    await user.type(within(dialog).getByRole("textbox", { name: "Temporary item name" }), "Pendant alternative");
    await user.click(within(dialog).getByRole("button", { name: "Add temporary item" }));
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
    expect(screen.getByRole("combobox", { name: "Main Line" })).toHaveValue("lights");
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
    const temporary = screen.getByRole("combobox", { name: "Temporary item" });
    expect(within(temporary).getByRole("option", { name: "Temporary LED Lights" })).toBeInTheDocument();
    expect(within(temporary).queryByRole("option", { name: /Ceiling COB Lights/ })).not.toBeInTheDocument();
  });

  it("blocks empty explanations, self references and conflicting rules without changing legacy notes", () => {
    expect(budgetAlterationIssues([{ ...rule, reason: " " }])).toContainEqual(expect.objectContaining({ path: "budgetAlterations.0.reason" }));
    expect(budgetAlterationIssues([{ ...rule, targetMainLineId: "source" }], "source")).toContainEqual(expect.objectContaining({ path: "budgetAlterations.0.targetMainLineId" }));
    expect(budgetAlterationIssues([rule, { ...rule, id: "second", action: "add" }])).toContainEqual(expect.objectContaining({ path: "budgetAlterations.1" }));
    expect(budgetAlterationIssues([rule, { ...rule, id: "second", trigger: "added" }])).toEqual([]);
    expect(budgetAlterationIssues([rule, { ...rule, id: "second", active: false }])).toEqual([]);
  });
});
