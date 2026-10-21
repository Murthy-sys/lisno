import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeBudgetAlterationBuilder } from "./KnowledgeBudgetAlterationBuilder";
import { createBudgetAlteration } from "./knowledgeBudgetAlterations";
import * as api from "./knowledgeApi";
import type { KnowledgeBasket, KnowledgeItemListItem, KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({ listKnowledgeSubBaskets: vi.fn() }));

const meta = { version: 1, createdById: "admin", updatedById: "admin", createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z" };
const baskets = [{ ...meta, id: "basket", name: "Electrical", description: null, status: "active", displayOrder: 0 }] as KnowledgeBasket[];
const items = [
  { mainLineId: "source", mainLineName: "Ceiling", subBasketId: null },
  { mainLineId: "lights", mainLineName: "COB Lights", subBasketId: "lighting", subBasketName: "Lighting" },
  { mainLineId: "switches", mainLineName: "Switches", subBasketId: "switching", subBasketName: "Switching" }
].map((item) => ({ ...meta, basketId: "basket", status: "draft", itemType: "main_line", completionRequired: false, ...item })) as KnowledgeItemListItem[];
const rule: KnowledgeJsonObject = { ...createBudgetAlteration(), id: "rule-lights", trigger: "added", action: "add", requirement: "must", targetKind: "main_line", targetBasketId: "basket", targetSubBasketId: "lighting", targetMainLineId: "lights", reason: "Use lights with the ceiling.", extra: { retained: true } };

function setup(initial: KnowledgeJsonValue = [rule], initialReadOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const change = vi.fn();
  let update!: (next: Partial<{ value: KnowledgeJsonValue; owner: string; resetKey: string; readOnly: boolean }>) => void;
  function Harness() {
    const [state, setState] = useState({ value: initial, owner: "source", resetKey: "version-1", readOnly: initialReadOnly });
    update = (next) => setState((current) => ({ ...current, ...next }));
    return <main><h1>Configuration</h1><h2>Recommendations</h2><KnowledgeBudgetAlterationBuilder value={state.value} savedValue={initial}
      mainLineId={state.owner} mainLineName="Ceiling" resetKey={state.resetKey} readOnly={state.readOnly} canCreate={false}
      baskets={baskets} items={items} issues={[]} onChange={(value) => { change(value); setState((current) => ({ ...current, value })); }} /></main>;
  }
  const result = render(<QueryClientProvider client={client}><MemoryRouter><Harness /></MemoryRouter></QueryClientProvider>);
  return { ...result, change, update: (next: Parameters<typeof update>[0]) => act(() => update(next)), user: userEvent.setup() };
}

function section(title: string) {
  return screen.getByRole("heading", { name: new RegExp(`^${title}`) }).closest("section")!;
}

function transfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "uninitialized", dropEffect: "none",
    get types() { return [...data.keys()]; },
    setData: (format: string, value: string) => data.set(format, value),
    getData: (format: string) => data.get(format) ?? ""
  };
}

function itemRow(name = "COB Lights", container?: HTMLElement) {
  return (container ? within(container) : screen).getByRole("button", { name: new RegExp(`^(Edit|View) rule \\d+: ${name}$`) }).closest("tr")!;
}

function beginDrag(name = "COB Lights") {
  const dataTransfer = transfer();
  const row = itemRow(name);
  fireEvent.pointerDown(row);
  fireEvent.dragStart(row, { dataTransfer });
  return dataTransfer;
}

async function menu(user: ReturnType<typeof userEvent.setup>, index = 1) {
  await user.click(screen.getByLabelText(`Actions for rule ${index}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listKnowledgeSubBaskets).mockResolvedValue({ items: [{ ...meta, id: "lighting", basketId: "basket", name: "Lighting", displayOrder: 0 }], pagination: { total: 1, offset: 0, limit: 100, hasMore: false } });
});

describe("recommendation section movement", () => {
  it("moves through every section using existing actions, preserves fields, and focuses the relocated row", async () => {
    const { user, change } = setup();
    for (const [title, expected] of [
      ["Probable Additions", { trigger: "added", action: "add", requirement: "can" }],
      ["Exclusions", { trigger: "added", action: "remove", requirement: "can" }],
      ["Other scope rules", { trigger: "removed", action: "remove", requirement: "can" }],
      ["Non-Negotiable Additions", { trigger: "added", action: "add", requirement: "must" }]
    ] as const) {
      await menu(user);
      await user.click(screen.getByRole("button", { name: `Move to ${title}` }));
      expect(change.mock.lastCall![0]).toEqual([{ ...rule, ...expected }]);
      expect(within(section(title)).getByRole("button", { name: "Edit rule 1: COB Lights" })).toBeVisible();
      expect(screen.getByLabelText("Actions for rule 1")).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent(`COB Lights moved to ${title}.`);
    }
    expect(change).toHaveBeenCalledTimes(4);
  });

  it("keeps existing menu controls and offers keyboard-operated destinations", async () => {
    const { user, change } = setup();
    const actions = screen.getByLabelText("Actions for rule 1");
    actions.focus();
    expect(actions).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Edit rule 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Disable rule 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove rule 1" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Move to Non-Negotiable Additions" })).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("button", { name: "Edit rule 1" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Disable rule 1" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Move to Probable Additions" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(change.mock.lastCall![0][0]).toMatchObject({ requirement: "can" });
    expect(screen.getByLabelText("Actions for rule 1")).toHaveFocus();
  });

  it("makes the complete item row draggable and retains the touch menu without a separate handle", async () => {
    const { user, container } = setup();
    const row = itemRow();
    expect(container.querySelectorAll("[draggable=true]")).toHaveLength(1);
    expect(row).toHaveAttribute("draggable", "true");
    expect(row).toHaveAccessibleName(expect.stringContaining("COB Lights"));
    expect(row).toHaveAccessibleDescription("Drag this item row to another section, or use the rule actions to choose a destination.");
    expect(screen.queryByRole("button", { name: /^Drag / })).not.toBeInTheDocument();
    await menu(user);
    expect(screen.getByRole("button", { name: "Move to Exclusions" })).toBeVisible();
    expect(screen.getByLabelText("Actions for rule 1")).toHaveFocus();
  });

  it.each(["empty row area", "item name", "text cell"])("starts a move from the %s without opening Edit", (origin) => {
    const { change } = setup();
    const row = itemRow();
    const target = origin === "item name" ? within(row).getByRole("button", { name: "Edit rule 1: COB Lights" })
      : origin === "text cell" ? within(row).getByText("Mandatory") : row;
    const dataTransfer = transfer();
    fireEvent.pointerDown(target);
    fireEvent.dragStart(target, { dataTransfer });
    fireEvent.dragOver(section("Exclusions"), { dataTransfer });
    fireEvent.drop(section("Exclusions"), { dataTransfer });
    fireEvent.dragEnd(window, { dataTransfer });
    expect(change.mock.lastCall![0]).toEqual([{ ...rule, action: "remove" }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["Actions for rule 1", "Edit rule 1", "Move to Exclusions"])("does not start a row drag from the %s control", async (label) => {
    const { user, change } = setup();
    await menu(user);
    const control = label === "Actions for rule 1" ? screen.getByLabelText(label) : screen.getByRole("button", { name: label });
    const row = itemRow();
    const dataTransfer = transfer();
    fireEvent.pointerDown(control);
    // Native browsers may identify the ancestor draggable row as dragstart.target.
    expect(fireEvent.dragStart(row, { dataTransfer })).toBe(false);
    expect(fireEvent.dragStart(control, { dataTransfer })).toBe(false);
    fireEvent.drop(section("Exclusions"), { dataTransfer });
    expect(dataTransfer.types).toEqual([]);
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves a normal item-name click to Edit before and after dragging the row", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Edit rule 1: COB Lights" }));
    expect(screen.getByRole("dialog", { name: "Edit scope rule 1" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Done" }));
    const dataTransfer = beginDrag();
    fireEvent.drop(section("Exclusions"), { dataTransfer });
    fireEvent.dragEnd(window, { dataTransfer });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit rule 1: COB Lights" }));
    expect(screen.getByRole("dialog", { name: "Edit scope rule 1" })).toBeVisible();
  });

  it.each(["Probable Additions", "Exclusions"])("drops on an empty %s body and clears the destination feedback", (title) => {
    const { change } = setup();
    const dataTransfer = beginDrag();
    const destination = section(title);
    expect(screen.queryByText(/^Drop here/)).not.toBeInTheDocument();
    fireEvent.dragOver(within(destination).getByText(/No .* configured/), { dataTransfer });
    expect(destination).toHaveClass("knowledge-recommendations__drop-target");
    expect(screen.getAllByText(/^Drop here/)).toHaveLength(1);
    expect(within(destination).getByText(`Drop here to move to ${title}.`)).toBeVisible();
    expect(dataTransfer.dropEffect).toBe("move");
    fireEvent.drop(destination, { dataTransfer });
    expect(change).toHaveBeenCalledTimes(1);
    expect(within(destination).getByText("Unsaved")).toBeVisible();
    expect(destination).not.toHaveClass("knowledge-recommendations__drop-target");
    expect(screen.queryByText(/^Drop here/)).not.toBeInTheDocument();
  });

  it("accepts the collapsed Other summary, explains the trigger change, and expands it", () => {
    const { change } = setup();
    const other = screen.getByText("Other scope rules", { selector: "summary" });
    expect(other.closest("details")).not.toHaveAttribute("open");
    const dataTransfer = beginDrag();
    expect(screen.queryByText(/^Drop here/)).not.toBeInTheDocument();
    fireEvent.dragOver(other, { dataTransfer });
    expect(screen.getAllByText(/^Drop here/)).toHaveLength(1);
    expect(within(other).getByText("Drop here to apply this rule when the source item is removed.")).toBeVisible();
    fireEvent.drop(other, { dataTransfer });
    expect(change.mock.lastCall![0]).toEqual([{ ...rule, trigger: "removed" }]);
    expect(other.closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("status")).toHaveTextContent("This rule now applies when the source item is removed.");
  });

  it("keeps an earlier move notice in place when a new drag starts", async () => {
    const { user, change } = setup();
    await menu(user);
    await user.click(screen.getByRole("button", { name: "Move to Probable Additions" }));
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("COB Lights moved to Probable Additions.");
    const dataTransfer = beginDrag();
    expect(notice).toBeVisible();
    fireEvent.dragOver(section("Exclusions"), { dataTransfer });
    expect(notice).toBeVisible();
    fireEvent.drop(section("Exclusions"), { dataTransfer });
    expect(change).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("COB Lights moved to Exclusions.");
  });

  it("appends the moved item after destination entries and resolves the latest source fields", () => {
    const second = { ...rule, id: "rule-switches", targetMainLineId: "switches", targetSubBasketId: "switching", requirement: "can" };
    const { update, change } = setup([rule, second]);
    const dataTransfer = beginDrag();
    const updated = { ...rule, reason: "A newer explanation", extra: { retained: true, fresh: true }, active: false };
    update({ value: [updated, second] });
    fireEvent.drop(section("Probable Additions"), { dataTransfer });
    expect(change.mock.lastCall![0]).toEqual([second, { ...updated, requirement: "can" }]);
    const bodyRows = within(screen.getByRole("table", { name: "Probable Additions" })).getAllByRole("row").slice(1);
    expect(bodyRows[0]).toHaveTextContent("Switches");
    expect(bodyRows[1]).toHaveTextContent("COB Lights");
    expect(bodyRows[1]).toHaveTextContent("Disabled");
  });

  it.each(["same section", "Escape", "outside drop"])("does not change the draft after %s", (kind) => {
    const { change } = setup();
    const dataTransfer = beginDrag();
    if (kind === "Escape") fireEvent.keyDown(window, { key: "Escape" });
    if (kind === "outside drop") fireEvent.dragEnd(window, { dataTransfer });
    fireEvent.drop(section(kind === "same section" ? "Non-Negotiable Additions" : "Exclusions"), { dataTransfer });
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Drop here/)).not.toBeInTheDocument();
  });

  it("ignores foreign and mismatched drag payloads", () => {
    const { change } = setup();
    const external = transfer();
    external.setData("text/plain", "rule-lights");
    fireEvent.dragOver(section("Exclusions"), { dataTransfer: external });
    fireEvent.drop(section("Exclusions"), { dataTransfer: external });
    expect(section("Exclusions")).not.toHaveClass("knowledge-recommendations__drop-target");
    const local = beginDrag();
    const wrong = transfer();
    wrong.setData(local.types[0], "another-editor-or-old-gesture");
    fireEvent.drop(section("Exclusions"), { dataTransfer: wrong });
    expect(change).not.toHaveBeenCalled();
  });

  it("does not accept a gesture from another editor showing the same Main Line and rule IDs", () => {
    const first = setup();
    const second = setup();
    const firstTransfer = transfer();
    const secondTransfer = transfer();
    fireEvent.pointerDown(itemRow("COB Lights", first.container));
    fireEvent.dragStart(itemRow("COB Lights", first.container), { dataTransfer: firstTransfer });
    fireEvent.pointerDown(itemRow("COB Lights", second.container));
    fireEvent.dragStart(itemRow("COB Lights", second.container), { dataTransfer: secondTransfer });
    const destination = within(second.container).getByRole("heading", { name: /^Exclusions/ }).closest("section")!;
    fireEvent.dragOver(destination, { dataTransfer: firstTransfer });
    fireEvent.drop(destination, { dataTransfer: firstTransfer });
    expect(first.change).not.toHaveBeenCalled();
    expect(second.change).not.toHaveBeenCalled();
    expect(destination).not.toHaveClass("knowledge-recommendations__drop-target");
    fireEvent.drop(destination, { dataTransfer: secondTransfer });
    expect(second.change).toHaveBeenCalledTimes(1);
    expect(first.change).not.toHaveBeenCalled();
  });

  it.each(["owner", "reset", "permission", "source removed", "duplicate identity", "invalid semantics"])("cancels a pending drag when %s changes", (kind) => {
    const { change, update } = setup();
    const dataTransfer = beginDrag();
    if (kind === "owner") update({ owner: "another-source" });
    if (kind === "reset") update({ resetKey: "version-2" });
    if (kind === "permission") update({ readOnly: true });
    if (kind === "source removed") update({ value: [] });
    if (kind === "duplicate identity") update({ value: [rule, { ...rule, targetMainLineId: "switches" }] });
    if (kind === "invalid semantics") update({ value: [{ ...rule, action: "unsupported" }] });
    fireEvent.drop(section("Exclusions"), { dataTransfer });
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Drop here/)).not.toBeInTheDocument();
  });

  it("keeps movement unavailable after a permission loss even if edit permission returns", () => {
    const { change, update } = setup();
    const dataTransfer = beginDrag();
    update({ readOnly: true });
    update({ readOnly: false });
    fireEvent.drop(section("Exclusions"), { dataTransfer });
    expect(change).not.toHaveBeenCalled();
  });

  it("rejects active target/trigger conflicts without changing rows or menu focus", async () => {
    const removal = { ...rule, id: "remove-lights", trigger: "removed", action: "remove" };
    const { user, change } = setup([rule, removal]);
    await menu(user);
    const destination = screen.getByRole("button", { name: "Move to Other scope rules" });
    await user.click(destination);
    expect(change).not.toHaveBeenCalled();
    expect(destination).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("An active rule already exists for this item when the source item is removed.");
    expect(screen.getByRole("button", { name: "Edit rule 1: COB Lights" })).toBeVisible();
  });

  it.each([
    [{ ...rule, id: "" }, "Review this rule's identity before moving it."],
    [{ ...rule, trigger: "unsupported" }, "Review this rule's trigger and action before moving it."]
  ])("explains malformed movement restrictions while preserving the existing edit path", async (malformed, message) => {
    const { user, change, container } = setup([malformed as KnowledgeJsonObject]);
    await user.click(screen.getByText("Other scope rules", { selector: "summary" }));
    await menu(user);
    expect(screen.getByText(message as string)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Move to / })).not.toBeInTheDocument();
    expect(container.querySelectorAll("[draggable=true]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Edit rule 1" })).toBeVisible();
    expect(change).not.toHaveBeenCalled();
  });

  it("preserves whole-Sub-Basket identity and unavailable-target diagnostics", async () => {
    const grouped = { ...rule, targetKind: "sub_basket", targetMainLineId: null, targetType: null };
    const unavailable = { ...rule, id: "unavailable", targetMainLineId: "missing", targetSubBasketId: null };
    const { user, change } = setup([grouped, unavailable]);
    await waitFor(() => expect(itemRow("Lighting")).toHaveAttribute("draggable", "true"));
    await menu(user);
    await user.click(screen.getByRole("button", { name: "Move to Exclusions" }));
    expect(change.mock.lastCall![0]).toEqual([unavailable, { ...grouped, action: "remove" }]);
    expect(screen.getByText("Unavailable target")).toBeVisible();
    expect(within(section("Exclusions")).getByText(/Whole Sub-Basket/)).toBeVisible();
  });

  it("shows no move controls in read-only views and retains View", async () => {
    const { user, change, container } = setup([rule], true);
    expect(container.querySelectorAll("[draggable=true]")).toHaveLength(0);
    const dataTransfer = beginDrag();
    expect(dataTransfer.types).toEqual([]);
    fireEvent.drop(section("Exclusions"), { dataTransfer });
    await menu(user);
    expect(screen.queryByRole("button", { name: /^Move to / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View rule 1" })).toBeVisible();
    expect(change).not.toHaveBeenCalled();
  });

  it("keeps the open move menu accessible", async () => {
    const { user } = setup();
    await menu(user);
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});
