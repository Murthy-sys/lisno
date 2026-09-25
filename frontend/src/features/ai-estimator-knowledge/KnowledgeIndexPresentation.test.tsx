import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeIndexItemCard } from "./KnowledgeIndexItemCard";
import { priorityDisplay, sectionSummary, unitLabel, type CatalogState } from "./knowledgeIndexPresentation";
import type {
  KnowledgeCompleteness,
  KnowledgeCompletenessState,
  KnowledgeItemListItem,
  KnowledgeMaster,
  KnowledgePrioritySemanticTier
} from "./knowledgeTypes";

const meta = { version: 1, createdById: "user-1", updatedById: "user-1", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
const SECTION_KEYS = ["overview", "pricing", "quantity-margin", "scope", "recommendations", "quality", "execution", "advanced"] as const;

function completeness(states: readonly KnowledgeCompletenessState[], percentage = 40): KnowledgeCompleteness {
  return { percentage, blockers: [], warnings: [], sections: states.map((state, index) => ({ sectionKey: SECTION_KEYS[index], state, findings: [] })) };
}
function master(masterType: "uoms" | "priorities", id: string, name: string, semanticTier?: KnowledgePrioritySemanticTier): KnowledgeMaster {
  return { ...meta, id, masterType, code: id.toUpperCase(), name, description: null, displayOrder: 0, status: "active", ...(semanticTier ? { semanticTier } : {}) };
}

const uoms = [master("uoms", "uom-sqft", "Square feet"), master("uoms", "uom-rft", "Running feet")];
const priorities = [
  master("priorities", "p-critical", "Non-negotiable", "non_negotiable"),
  master("priorities", "p-high", "High", "high"),
  master("priorities", "p-medium", "Medium", "medium"),
  master("priorities", "p-low", "Low", "low"),
  master("priorities", "p-untiered", "Legacy")
];
const baseItem: KnowledgeItemListItem = {
  ...meta, id: "item-1", itemType: "main_line", completionRequired: false, basketId: "basket-1", basketName: "Finishes",
  mainLineId: "main line/1", mainLineName: "POP False Ceiling", description: null, status: "active", activeRevisionId: "rev-1",
  draftRevisionId: null, revisionNumber: 1, uomId: "uom-sqft", priorityId: "p-high", modeIds: [], surfaceIds: [], vendorIds: [],
  completeness: completeness(["complete", "complete", "needs_attention", "not_configured", "not_applicable"], 72), allowedActions: []
};

function renderCard(overrides: Partial<KnowledgeItemListItem> = {}, catalogState: CatalogState = "ready", onOpen = vi.fn()) {
  const item = { ...baseItem, ...overrides };
  const view = render(
    <MemoryRouter>
      <main>
        <h1>Knowledge base</h1>
        <h2>Finishes</h2>
        <KnowledgeIndexItemCard item={item} uoms={uoms} priorities={priorities} catalogState={catalogState} onOpen={onOpen} />
        <button type="button">Outside control</button>
      </main>
    </MemoryRouter>
  );
  return { item, onOpen, unmount: view.unmount, card: screen.getByRole("article"), trigger: screen.getByRole("button", { name: `More actions for ${item.mainLineName}` }) };
}

describe("knowledge index presentation helpers", () => {
  it("counts complete sections over applicable sections and excludes not-applicable ones", () => {
    expect(sectionSummary(completeness(["complete", "complete", "needs_attention", "not_configured", "not_applicable", "not_applicable"]))).toEqual({ complete: 2, applicable: 4 });
    expect(sectionSummary(completeness(["complete", "complete"]))).toEqual({ complete: 2, applicable: 2 });
    expect(sectionSummary(completeness(["needs_attention", "not_applicable"]))).toEqual({ complete: 0, applicable: 1 });
  });

  it("returns no section summary when no section applies", () => {
    expect(sectionSummary(completeness([]))).toBeNull();
    expect(sectionSummary(completeness(["not_applicable", "not_applicable"]))).toBeNull();
  });

  it("labels units from the loaded catalog with explicit fallbacks", () => {
    expect(unitLabel(null, uoms, "ready")).toBe("No unit");
    expect(unitLabel(null, [], "loading")).toBe("No unit");
    expect(unitLabel("uom-sqft", [], "loading")).toBe("…");
    expect(unitLabel("uom-rft", uoms, "ready")).toBe("Running feet");
    expect(unitLabel("uom-sqft", uoms, "error")).toBe("Square feet");
    expect(unitLabel("uom-unknown", uoms, "ready")).toBe("Unit unavailable");
    expect(unitLabel("uom-sqft", [], "error")).toBe("Unit unavailable");
  });

  it("derives priority labels and tones from the loaded catalog with explicit fallbacks", () => {
    expect(priorityDisplay(null, priorities, "ready")).toEqual({ label: "No priority", tone: "none" });
    expect(priorityDisplay(null, [], "loading")).toEqual({ label: "No priority", tone: "none" });
    expect(priorityDisplay("p-high", [], "loading")).toEqual({ label: "…", tone: "unavailable" });
    expect(priorityDisplay("p-critical", priorities, "ready")).toEqual({ label: "Non-negotiable", tone: "high" });
    expect(priorityDisplay("p-high", priorities, "ready")).toEqual({ label: "High", tone: "high" });
    expect(priorityDisplay("p-medium", priorities, "ready")).toEqual({ label: "Medium", tone: "medium" });
    expect(priorityDisplay("p-low", priorities, "ready")).toEqual({ label: "Low", tone: "low" });
    expect(priorityDisplay("p-untiered", priorities, "ready")).toEqual({ label: "Legacy", tone: "none" });
    expect(priorityDisplay("p-unknown", priorities, "ready")).toEqual({ label: "Priority unavailable", tone: "unavailable" });
    expect(priorityDisplay("p-high", [], "error")).toEqual({ label: "Priority unavailable", tone: "unavailable" });
  });
});

describe("knowledge index item card", () => {
  it("links the name to the item workspace and shows truthful metrics without images", async () => {
    const { card } = renderCard();
    expect(card).toHaveClass("knowledge-item-card", "knowledge-index-card");
    expect(card).toHaveAttribute("data-item-type", "main_line");
    const link = within(card).getByRole("link", { name: "POP False Ceiling" });
    expect(link).toHaveAttribute("href", "/admin/configuration/estimation/items/main%20line%2F1");
    expect(link).not.toHaveAttribute("aria-describedby");
    expect(within(card).getByRole("heading", { level: 3, name: "POP False Ceiling" })).toBeInTheDocument();
    expect(within(card).queryByText("Temporary item")).not.toBeInTheDocument();
    expect(within(card).getByText("72% complete")).toBeInTheDocument();
    const progress = within(card).getByRole("progressbar", { name: "POP False Ceiling completeness" });
    expect(progress).toHaveAttribute("aria-valuenow", "72");
    expect(progress).toHaveAttribute("aria-valuetext", "72% complete");

    const metrics = within(card).getByRole("list", { name: "POP False Ceiling details" });
    const sections = metrics.querySelector('[data-metric="sections"]');
    expect(sections).toHaveTextContent("2/4 sections");
    expect(within(metrics).getByText("2/4 sections")).toHaveAttribute("aria-hidden", "true");
    expect(within(metrics).getByText("2 of 4 sections complete")).toHaveClass("sr-only");
    expect(metrics.querySelector('[data-metric="unit"]')).toHaveTextContent("Square feet");
    const chip = metrics.querySelector(".knowledge-priority-chip");
    expect(chip).toHaveAttribute("data-tone", "high");
    expect(chip).toHaveTextContent("High");
    expect(within(metrics).getAllByRole("listitem")).toHaveLength(3);
    expect(card.querySelector(".knowledge-index-card__thumb")).toHaveAttribute("aria-hidden", "true");
    expect(card.querySelectorAll("svg:not([aria-hidden='true'])")).toHaveLength(0);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("keeps the completion requirement in the temporary badge's accessible description and tooltip", () => {
    renderCard({ id: "temp-1", itemType: "temporary", completionRequired: true });
    const badge = screen.getByText("Temporary item");
    expect(badge).toHaveAttribute("id", "temporary-kind-temp-1");
    expect(badge).toHaveClass("knowledge-temporary-badge");
    expect(badge).toHaveAttribute("title", "Temporary item · Must be completed");
    expect(badge).toHaveTextContent("Temporary item · Must be completed");
    expect(within(badge).getByText("· Must be completed")).toHaveClass("sr-only");
    const link = screen.getByRole("link", { name: "POP False Ceiling" });
    expect(link).toHaveAttribute("aria-describedby", "temporary-kind-temp-1");
    expect(link).toHaveAccessibleDescription("Temporary item · Must be completed");
    expect(screen.getByRole("article")).toHaveAttribute("data-item-type", "temporary");
  });

  it("shows only the temporary label when completion is not required", () => {
    renderCard({ id: "temp-2", itemType: "temporary", completionRequired: false });
    const badge = screen.getByText("Temporary item");
    expect(badge).toHaveTextContent(/^Temporary item$/);
    expect(badge).toHaveAttribute("title", "Temporary item");
    expect(screen.queryByText(/Must be completed/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "POP False Ceiling" })).toHaveAccessibleDescription("Temporary item");
  });

  it("omits the sections metric without applicable sections and shows catalog fallbacks", () => {
    const { card, item } = renderCard({ uomId: null, priorityId: null, completeness: completeness(["not_applicable"], 0) });
    const metrics = within(card).getByRole("list", { name: `${item.mainLineName} details` });
    expect(metrics.querySelector('[data-metric="sections"]')).toBeNull();
    expect(within(metrics).queryByText(/sections/)).not.toBeInTheDocument();
    expect(within(metrics).getAllByRole("listitem")).toHaveLength(2);
    expect(metrics.querySelector('[data-metric="unit"]')).toHaveTextContent("No unit");
    expect(metrics.querySelector(".knowledge-priority-chip")).toHaveAttribute("data-tone", "none");
    expect(metrics.querySelector(".knowledge-priority-chip")).toHaveTextContent("No priority");
    expect(within(card).getByText("0% complete")).toBeInTheDocument();
  });

  it("renders loading and unavailable catalog values without guessing", () => {
    const view = renderCard({ uomId: "uom-sqft", priorityId: "p-low" }, "loading");
    let metrics = within(view.card).getByRole("list", { name: "POP False Ceiling details" });
    expect(metrics.querySelector('[data-metric="unit"]')).toHaveTextContent(/^Unit: …$/);
    expect(metrics.querySelector(".knowledge-priority-chip")).toHaveAttribute("data-tone", "unavailable");
    view.unmount();
    const unknown = renderCard({ uomId: "uom-missing", priorityId: "p-missing" }, "error");
    metrics = within(unknown.card).getByRole("list", { name: "POP False Ceiling details" });
    expect(metrics.querySelector('[data-metric="unit"]')).toHaveTextContent("Unit unavailable");
    expect(metrics.querySelector(".knowledge-priority-chip")).toHaveTextContent("Priority unavailable");
    expect(metrics.querySelector(".knowledge-priority-chip")).toHaveAttribute("data-tone", "unavailable");
  });

  it.each([
    ["p-critical", "Non-negotiable", "high"],
    ["p-medium", "Medium", "medium"],
    ["p-low", "Low", "low"]
  ])("tones the priority chip for %s", (priorityId, label, tone) => {
    const { card } = renderCard({ priorityId });
    const chip = card.querySelector(".knowledge-priority-chip");
    expect(chip).toHaveTextContent(label);
    expect(chip).toHaveAttribute("data-tone", tone);
  });
});

describe("knowledge index item menu", () => {
  it("opens with ArrowDown, focuses the item, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    const { trigger } = renderCard();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
    expect(trigger).toHaveAttribute("title", "More actions");
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    const menu = screen.getByRole("menu", { name: "Actions for POP False Ceiling" });
    expect(menu).toHaveClass("knowledge-index-menu__items");
    expect(menu.closest(".knowledge-index-menu")).toContainElement(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", menu.id);
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(within(menu).getByRole("menuitem", { name: "Open item" })).toHaveFocus();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
  });

  it.each([["Enter", "{Enter}"], ["Space", " "]])("opens with %s and focuses the item", async (_key, keys) => {
    const user = userEvent.setup();
    const { trigger } = renderCard();
    trigger.focus();
    await user.keyboard(keys);
    expect(screen.getByRole("menuitem", { name: "Open item" })).toHaveFocus();
  });

  it("closes on Tab and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const { trigger } = renderCard();
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Open item" })).toHaveFocus();
    await user.tab();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Outside control" })).toHaveFocus();
  });

  it("closes on an outside pointerdown and ignores pointerdown inside the menu", async () => {
    const user = userEvent.setup();
    const { trigger, onOpen } = renderCard();
    await user.click(trigger);
    const item = screen.getByRole("menuitem", { name: "Open item" });
    await user.pointer({ keys: "[MouseLeft>]", target: item });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.pointer({ keys: "[/MouseLeft]", target: item });
    expect(onOpen).toHaveBeenCalledTimes(1);
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByRole("heading", { level: 1 }) });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("calls onOpen from Open item and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const { trigger, onOpen } = renderCard();
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Open item" }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
