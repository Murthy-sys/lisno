import { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { EstimateRecommendations, type EstimateRecommendationsProps } from "./EstimateRecommendations";

const row = { id: "primer", name: "Wall primer", sourceNames: ["Wall painting"], selected: false };
const base: EstimateRecommendationsProps = {
  roomName: "Bedroom", contextKey: "bedroom:painting", items: [row], total: 1, offset: 0,
  onOffsetChange: vi.fn(), state: "ready", onAdd: vi.fn(), onRemove: vi.fn()
};

describe("inline non-negotiable recommendations", () => {
  it("opens relevant suggestions without stealing focus and collapsing never changes selections", async () => {
    const user = userEvent.setup();
    const add = vi.fn(); const remove = vi.fn();
    render(<><input aria-label="Quantity" autoFocus /><EstimateRecommendations {...base} onAdd={add} onRemove={remove} /></>);
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveFocus();
    const disclosure = screen.getByRole("button", { name: "Non-negotiable recommendations (1)" });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(disclosure);
    expect(screen.queryByRole("button", { name: "Add Wall primer" })).not.toBeInTheDocument();
    expect(add).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });

  it("permits explicit add and removal while keeping action focus on the same suggestion", async () => {
    const user = userEvent.setup();
    function Editable() {
      const [selected, setSelected] = useState(false);
      return <EstimateRecommendations {...base} items={[{ ...row, selected }]}
        onAdd={() => { setSelected(true); return true; }} onRemove={() => { setSelected(false); return true; }} />;
    }
    render(<Editable />);
    screen.getByRole("button", { name: "Add Wall primer" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Remove Wall primer" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Add Wall primer" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Wall primer removed from Bedroom");
  });

  it("does not claim setup navigation added an item and rejects unavailable actions", async () => {
    const user = userEvent.setup(); const onAdd = vi.fn(() => true);
    const { rerender } = render(<EstimateRecommendations {...base} onAdd={onAdd} items={[{ ...row, addLabel: "Configure basket" }]} />);
    await user.click(screen.getByRole("button", { name: "Configure basket Wall primer" }));
    expect(screen.getByRole("status")).toHaveTextContent("Configure basket: Wall primer");
    expect(screen.getByRole("status")).not.toHaveTextContent("added");
    rerender(<EstimateRecommendations {...base} onAdd={onAdd} state="stale" />);
    expect(screen.getByRole("button", { name: "Add Wall primer" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Configuration changed");
  });

  it("bounds rendered recommendations and keeps the read-only state non-mutating", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({ ...row, id: String(index), name: `Recommended ${index}` }));
    render(<EstimateRecommendations {...base} items={items} total={100} disabled />);
    const list = screen.getByRole("list", { name: "Recommended items" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(20);
    expect(within(list).getAllByRole("button").every(button => button.hasAttribute("disabled"))).toBe(true);
  });

  it("omits an empty successful disclosure, but shows failures and retry", async () => {
    const user = userEvent.setup(); const retry = vi.fn();
    const { rerender } = render(<EstimateRecommendations {...base} items={[]} total={0} />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    rerender(<EstimateRecommendations {...base} state="error" items={[]} total={0} onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
    await user.click(screen.getByRole("button", { name: "Retry recommendations" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

function PopupHarness({ overrides = {}, initiallyOpen, allItems, onOpenChange = () => {} }: {
  overrides?: Partial<EstimateRecommendationsProps>;
  initiallyOpen?: boolean;
  allItems?: EstimateRecommendationsProps["items"];
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState<boolean | undefined>(initiallyOpen);
  const [selected, setSelected] = useState(false);
  const [offset, setOffset] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const fallbackFocusRef = useRef<HTMLInputElement>(null);
  return <>
    <input aria-label="Quantity" ref={fallbackFocusRef} autoFocus />
    <p>Estimate details</p>
    <div ref={toolbarRef} data-testid="toolbar"><EstimateRecommendations {...base}
      contextKey={selected ? "bedroom:painting,primer" : "bedroom:painting"}
      items={allItems ? allItems.slice(offset, offset + 20) : [{ ...row, selected }]} total={allItems?.length ?? 1}
      offset={offset} onOffsetChange={setOffset}
      onAdd={() => { setSelected(true); return true; }} onRemove={() => { setSelected(false); return true; }}
      {...overrides} popup={{ open, onOpenChange: value => { onOpenChange(value); setOpen(value); }, toolbarRef, footerRef, fallbackFocusRef }} />
    </div>
    <footer ref={footerRef} data-testid="footer"><button type="button">Save estimate</button></footer>
  </>;
}

const popupRegion = () => screen.getByRole("region", { name: "Non-negotiable recommendations for Bedroom" });

function RefreshingSalesPopup({ ready = false, initiallySelected = false, overrides = {} }: {
  ready?: boolean;
  initiallySelected?: boolean;
  overrides?: Partial<EstimateRecommendationsProps>;
}) {
  const [selected, setSelected] = useState(initiallySelected);
  const [refreshing, setRefreshing] = useState(false);
  const loading = refreshing && !ready;
  const select = (value: boolean) => { setSelected(value); setRefreshing(true); return true; };
  return <PopupHarness overrides={{
    selectionFeedback: { contextKey: "workspace:bedroom" },
    contextKey: selected ? "bedroom:painting,primer" : "bedroom:painting",
    items: loading ? [] : [{ ...row, selected }], total: loading ? 0 : 1,
    state: loading ? "loading" : "ready", onAdd: () => select(true), onRemove: () => select(false),
    ...overrides
  }} />;
}

function CompletingSalesPopup({ ready = false, acknowledge = true, remainingCount = 0, completionBlocked = false,
  completionContext = "actor:estimate:bedroom", overrides = {}, onOpenChange, onAdd = () => true }: {
  ready?: boolean;
  acknowledge?: boolean;
  remainingCount?: number;
  completionBlocked?: boolean;
  completionContext?: string;
  overrides?: Partial<EstimateRecommendationsProps>;
  onOpenChange?: (open: boolean) => void;
  onAdd?: () => boolean;
}) {
  const [selected, setSelected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loading = refreshing && !ready;
  return <PopupHarness onOpenChange={onOpenChange} overrides={{
    selectionFeedback: { contextKey: "workspace:bedroom" },
    contextKey: selected ? "bedroom:painting,primer" : "bedroom:painting",
    completion: { contextKey: completionContext, selectedTargetIds: new Set(selected && acknowledge ? [row.id] : []),
      remainingCount: selected ? remainingCount : 1, blocked: completionBlocked },
    state: loading ? "loading" : "ready", items: loading ? [] : [{ ...row, selected }], total: loading ? 0 : 1,
    onAdd: () => {
      if (!onAdd()) return false;
      setSelected(true); setRefreshing(true); return true;
    },
    onRemove: () => { setSelected(false); setRefreshing(true); return true; },
    ...overrides
  }} />;
}

describe("Sales recommendation Add completion", () => {
  it("closes a final accepted Add with current cached results, returns focus, and permits manual review/removal", async () => {
    const user = userEvent.setup(); const changed = vi.fn(), add = vi.fn(() => true);
    render(<CompletingSalesPopup ready onOpenChange={changed} onAdd={add} />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Recommendations (1)" });
    expect(trigger).toHaveFocus();
    expect(changed.mock.calls.map(call => call[0])).toEqual([true, false]);
    expect(add).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Added 1 item: Wall primer to Bedroom.");
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Remove Wall primer" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove Wall primer" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Wall primer" })).toBeVisible();
    expect(add).toHaveBeenCalledOnce();
  });

  it("waits through an empty loading page and requires acknowledgement from the current draft", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CompletingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(within(popupRegion()).queryAllByRole("listitem")).toHaveLength(0);
    rerender(<CompletingSalesPopup ready acknowledge={false} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    rerender(<CompletingSalesPopup ready />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("finishes a pending interaction without closing when current results contain further suggestions", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CompletingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    rerender(<CompletingSalesPopup ready remainingCount={1} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    // An ordinary later result cannot close a popup whose Add interaction already settled.
    rerender(<CompletingSalesPopup ready remainingCount={0} />);
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it.each(["error", "stale", "forbidden"] as const)("keeps the pending popup open through %s", async state => {
    const user = userEvent.setup();
    const { rerender } = render(<CompletingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    rerender(<CompletingSalesPopup ready overrides={{ state }} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
    rerender(<CompletingSalesPopup ready />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps unresolved review results open and does not arm rejected Adds or setup navigation", async () => {
    const user = userEvent.setup(); const rejected = vi.fn(() => false);
    const { rerender } = render(<CompletingSalesPopup ready onAdd={rejected} />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Could not add Wall primer");
    rerender(<CompletingSalesPopup ready />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    // A normal ready Add closes, so reopen for an accepted setup action instead.
    await user.click(screen.getByRole("button", { name: "Recommendations (1)" }));
    rerender(<CompletingSalesPopup ready overrides={{ items: [{ ...row, addLabel: "Configure basket" }] }} />);
    await user.click(screen.getByRole("button", { name: "Configure basket Wall primer" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Configure basket: Wall primer");
  });

  it("waits for review issues to resolve before completing the final Add", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CompletingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    rerender(<CompletingSalesPopup ready completionBlocked overrides={{ message: "Review current Configuration." }} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("Review current Configuration.")).toBeVisible();
    rerender(<CompletingSalesPopup ready />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancels completion on manual dismissal so late results cannot close a manually reopened popup", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CompletingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Recommendations Checking…" }));
    rerender(<CompletingSalesPopup ready />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
  });

  it("cancels completion across actor, estimate, or room identity changes even if an old result returns", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CompletingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    rerender(<CompletingSalesPopup ready completionContext="other-actor:estimate:bedroom" />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    rerender(<CompletingSalesPopup ready />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
  });

  it("closes controlled popup state and retains the receipt when no recommendation row survives", async () => {
    const user = userEvent.setup(); const changed = vi.fn();
    const { rerender } = render(<CompletingSalesPopup onOpenChange={changed} />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    rerender(<CompletingSalesPopup ready onOpenChange={changed} overrides={{ items: [], total: 0 }} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(changed.mock.calls.map(call => call[0])).toEqual([true, false]);
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Added 1 item: Wall primer to Bedroom.");
  });
});

describe("opt-in recommendations popup", () => {
  it("opens ready suggestions in a standard modal and preserves the builder value", async () => {
    const user = userEvent.setup(); const changed = vi.fn();
    const { rerender } = render(<PopupHarness overrides={{ state: "loading" }} onOpenChange={changed} />);
    const input = screen.getByRole("textbox", { name: "Quantity" });
    await user.type(input, "12");
    expect(screen.getByRole("button", { name: "Recommendations Checking…" })).toHaveAttribute("aria-expanded", "false");
    rerender(<PopupHarness onOpenChange={changed} />);
    const dialog = screen.getByRole("dialog", { name: "Non-negotiable recommendations" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus());
    expect(input).toHaveValue("12");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Bedroom");
    expect(input.closest("[inert]")).not.toBeNull();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(screen.getByTestId("toolbar")).not.toContainElement(dialog);
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    await user.type(input, "3");
    expect(input).toHaveValue("123");
  });

  it("respects dismissal through source changes, traps keyboard focus and closes with Escape", async () => {
    const user = userEvent.setup(); const changed = vi.fn();
    const { rerender } = render(<PopupHarness onOpenChange={changed} />);
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    const trigger = screen.getByRole("button", { name: "Recommendations (1)" });
    expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute("aria-expanded", "false");
    rerender(<PopupHarness overrides={{ contextKey: "bedroom:painting,ceiling" }} onOpenChange={changed} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-controls", popupRegion().id);
    const dialog = screen.getByRole("dialog", { name: "Non-negotiable recommendations" });
    for (let index = 0; index < 5; index++) { await user.tab(); expect(dialog).toContainElement(document.activeElement as HTMLElement); }
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(changed.mock.calls.map(call => call[0])).toEqual([true, false, true, false]);
  });

  it("keeps accepted Add/Remove focused and open, and never announces a rejected action", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PopupHarness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus());
    screen.getByRole("button", { name: "Add Wall primer" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Remove Wall primer" })).toHaveFocus();
    expect(within(popupRegion()).getByRole("status")).toHaveTextContent("Wall primer added to Bedroom.");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Add Wall primer" })).toHaveFocus();
    expect(within(popupRegion()).getByRole("status")).toHaveTextContent("Wall primer removed from Bedroom.");
    rerender(<PopupHarness overrides={{ contextKey: "bedroom:new-source", onAdd: () => false }} />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    expect(within(popupRegion()).getByRole("status")).toHaveTextContent("Wall primer removed from Bedroom.");
    expect(screen.getByRole("button", { name: "Close recommendations" })).toBeVisible();
  });

  it.each([false, true])("restores the chosen Sales action after an empty source refresh (initial selection: %s)", async initiallySelected => {
    const user = userEvent.setup();
    const { rerender } = render(<RefreshingSalesPopup initiallySelected={initiallySelected} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus());
    screen.getByRole("button", { name: `${initiallySelected ? "Remove" : "Add"} Wall primer` }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Checking non-negotiable recommendations…")).toBeVisible();
    expect(within(popupRegion()).queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();

    rerender(<RefreshingSalesPopup initiallySelected={initiallySelected} ready />);
    expect(screen.getByRole("button", { name: `${initiallySelected ? "Add" : "Remove"} Wall primer` })).toHaveFocus();
    expect(within(popupRegion()).getByRole("status")).toHaveTextContent(initiallySelected
      ? "Wall primer removed from Bedroom." : "Added 1 item: Wall primer to Bedroom.");
  });

  it("does not reclaim Sales action focus after the user closes during source loading", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RefreshingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    await user.click(screen.getByRole("textbox", { name: "Quantity" }));
    await user.keyboard("12");
    rerender(<RefreshingSalesPopup ready />);
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveFocus();
    await user.keyboard("3");
    expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveValue("123");
  });

  it("cancels restored Sales action focus after clicking its non-focusable receipt", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RefreshingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    rerender(<RefreshingSalesPopup ready />);
    expect(screen.getByRole("button", { name: "Remove Wall primer" })).toHaveFocus();
    await user.click(screen.getByText("Added 1 item: Wall primer to Bedroom."));
    expect(screen.getByRole("dialog", { name: "Non-negotiable recommendations" })).toHaveFocus();

    rerender(<RefreshingSalesPopup />);
    expect(screen.getByText("Checking non-negotiable recommendations…")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Non-negotiable recommendations" })).toHaveFocus();
    rerender(<RefreshingSalesPopup ready />);
    expect(screen.getByRole("button", { name: "Remove Wall primer" })).not.toHaveFocus();
    expect(screen.getByRole("dialog", { name: "Non-negotiable recommendations" })).toHaveFocus();
  });

  it.each([[370, 186], [150, 50]])("reveals the restored Sales action at y=%s once and preserves later manual scrolling", async (actionTop, expectedScroll) => {
    const user = userEvent.setup();
    const { rerender } = render(<RefreshingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    const content = popupRegion().querySelector<HTMLElement>(".estimate-recommendations-popup__content")!;
    content.scrollTop = 100;
    const measure = HTMLElement.prototype.getBoundingClientRect;
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === content) return new DOMRect(0, 200, 380, 120);
      if (this.dataset.recommendationItem === "primer") return new DOMRect(0, actionTop, 100, 36);
      return measure.call(this);
    });
    const scrollPage = vi.spyOn(window, "scrollTo");
    rerender(<RefreshingSalesPopup ready />);
    expect(screen.getByRole("button", { name: "Remove Wall primer" })).toHaveFocus();
    expect(content.scrollTop).toBe(expectedScroll);
    fireEvent.wheel(content, { deltaY: -60 });
    content.scrollTop = 10;
    rerender(<RefreshingSalesPopup ready />);
    expect(screen.getByRole("button", { name: "Remove Wall primer" })).toHaveFocus();
    expect(content.scrollTop).toBe(10);
    expect(scrollPage).not.toHaveBeenCalled();
    bounds.mockRestore();
    scrollPage.mockRestore();
  });

  it("cancels pending Sales action focus when the stable room changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RefreshingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    const nextRoom = { selectionFeedback: { contextKey: "workspace:another-bedroom" } };
    rerender(<RefreshingSalesPopup overrides={nextRoom} />);
    rerender(<RefreshingSalesPopup overrides={nextRoom} ready />);
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
    expect(within(popupRegion()).getByRole("status")).toBeEmptyDOMElement();
    rerender(<RefreshingSalesPopup ready />);
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
  });

  it("cancels pending Sales action focus when the popup closes during loading", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RefreshingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    rerender(<RefreshingSalesPopup ready />);
    const trigger = screen.getByRole("button", { name: "Recommendations (1)" });
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
  });

  it("keeps a safe surviving control focused when the refreshed Sales target disappears", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RefreshingSalesPopup />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    rerender(<RefreshingSalesPopup ready overrides={{ items: [{ ...row, id: "other", name: "Other finish" }] }} />);
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Add Other finish" })).not.toHaveFocus();
    rerender(<RefreshingSalesPopup ready />);
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
  });

  it("shows one visible Sales receipt through source refresh and clears it for a different stable room", async () => {
    const user = userEvent.setup();
    const selectionFeedback = { contextKey: "workspace:bedroom-one" };
    const { rerender } = render(<PopupHarness overrides={{ selectionFeedback }} />);
    expect(screen.getByText("Add selects this item for this room.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus());
    screen.getByRole("button", { name: "Add Wall primer" }).focus();
    await user.keyboard("{Enter}");
    let receipt = within(popupRegion()).getByRole("status");
    expect(receipt).toBeVisible();
    expect(receipt).not.toHaveClass("sr-only");
    expect(receipt).toHaveAttribute("aria-live", "polite");
    expect(receipt).toHaveTextContent("Added 1 item: Wall primer to Bedroom.");
    expect(screen.getByRole("button", { name: "Remove Wall primer" })).toHaveFocus();
    expect(within(popupRegion()).getAllByRole("status")).toHaveLength(1);

    rerender(<PopupHarness overrides={{ selectionFeedback, contextKey: "bedroom:painting,primer,new-source", state: "loading" }} />);
    expect(screen.getByText("Added 1 item: Wall primer to Bedroom.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
    rerender(<PopupHarness overrides={{ selectionFeedback, contextKey: "bedroom:painting,primer,new-source" }} />);
    expect(screen.getByRole("button", { name: "Remove Wall primer" })).toHaveFocus();
    receipt = within(popupRegion()).getByRole("status");
    expect(receipt).toHaveTextContent("Added 1 item: Wall primer to Bedroom.");
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    await user.click(screen.getByRole("button", { name: "Recommendations (1)" }));
    expect(screen.getByText("Added 1 item: Wall primer to Bedroom.")).toBeVisible();

    // Same display name, distinct stable room ID: the old room's receipt must disappear.
    rerender(<PopupHarness overrides={{ selectionFeedback: { contextKey: "workspace:bedroom-two" } }} />);
    expect(within(popupRegion()).getByRole("status")).toBeEmptyDOMElement();
    rerender(<PopupHarness overrides={{ selectionFeedback }} />);
    expect(within(popupRegion()).getByRole("status")).toBeEmptyDOMElement();
  });

  it("replaces a Sales receipt with an actionable rejection without claiming another successful change", async () => {
    const user = userEvent.setup();
    const selectionFeedback = { contextKey: "workspace:bedroom" };
    const remove = vi.fn(() => false);
    const { rerender } = render(<PopupHarness overrides={{ selectionFeedback }} />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    rerender(<PopupHarness overrides={{ selectionFeedback, onRemove: remove }} />);
    await user.click(screen.getByRole("button", { name: "Remove Wall primer" }));
    expect(remove).toHaveBeenCalledExactlyOnceWith("primer");
    expect(within(popupRegion()).getByRole("status")).toHaveTextContent(
      "Could not remove Wall primer from Bedroom. Refresh available items and try again."
    );
    expect(screen.queryByText("Added 1 item: Wall primer to Bedroom.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Wall primer" })).toHaveFocus();

    rerender(<PopupHarness overrides={{ selectionFeedback }} />);
    await user.click(screen.getByRole("button", { name: "Remove Wall primer" }));
    expect(within(popupRegion()).getByRole("status")).toHaveTextContent("Wall primer removed from Bedroom.");
    const add = vi.fn(() => false);
    rerender(<PopupHarness overrides={{ selectionFeedback, onAdd: add }} />);
    await user.click(screen.getByRole("button", { name: "Add Wall primer" }));
    expect(add).toHaveBeenCalledExactlyOnceWith("primer");
    expect(within(popupRegion()).getByRole("status")).toHaveTextContent(
      "Could not add Wall primer to Bedroom. Refresh available items and try again."
    );
  });

  it("preserves full Sales names and grouping without treating setup navigation as an addition", async () => {
    const user = userEvent.setup();
    const name = "Primer for the east-facing living room ceiling and adjoining entrance passage";
    const context = "Painting and protective finishes / Ceiling preparation and primer";
    const onAdd = vi.fn(() => true);
    render(<PopupHarness overrides={{ selectionFeedback: { contextKey: "room-bedroom" },
      items: [{ ...row, name, context, addLabel: "Configure basket" }], onAdd }} />);
    expect(within(popupRegion()).getByText(name)).toBeVisible();
    expect(within(popupRegion()).getByText(context)).toBeVisible();
    await user.click(screen.getByRole("button", { name: `Configure basket ${name}` }));
    expect(within(popupRegion()).getByRole("status")).toHaveTextContent(`Configure basket: ${name}.`);
    expect(within(popupRegion()).getByRole("status")).not.toHaveTextContent("Added 1 item");
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("primer");
  });

  it("returns focus after backdrop dismissal without changing selected items", async () => {
    const user = userEvent.setup(); const add = vi.fn(); const remove = vi.fn();
    render(<PopupHarness initiallyOpen={false} overrides={{ onAdd: add, onRemove: remove }} />);
    const trigger = screen.getByRole("button", { name: "Recommendations (1)" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Close Non-negotiable recommendations" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(add).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });

  it("returns focus to a surviving builder input when the final recommendation disappears", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PopupHarness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus());
    screen.getByRole("button", { name: "Add Wall primer" }).focus();
    rerender(<PopupHarness overrides={{ items: [], total: 0 }} />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveFocus());
    expect(screen.queryByRole("button", { name: /Recommendations/ })).not.toBeInTheDocument();
    rerender(<PopupHarness />);
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    screen.getByRole("button", { name: "Save estimate" }).focus();
    rerender(<PopupHarness overrides={{ items: [], total: 0 }} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Save estimate" })).toHaveFocus();
  });

  it.each([
    ["loading", "Checking…", "Checking non-negotiable recommendations…"],
    ["error", "Could not load", "Recommendations could not be loaded."],
    ["stale", "Refresh needed", "Configuration changed. Refresh recommendations."],
    ["forbidden", "Unavailable", "Recommendations are unavailable for this account."]
  ] as const)("keeps %s discoverable when closed without claiming an available count", async (state, triggerStatus, message) => {
    const user = userEvent.setup(); const retry = vi.fn(); const add = vi.fn();
    render(<PopupHarness initiallyOpen={false} overrides={{ state, onRetry: retry, onAdd: add }} />);
    const trigger = screen.getByRole("button", { name: `Recommendations ${triggerStatus}` });
    expect(trigger).not.toHaveTextContent("(1)");
    await user.click(trigger);
    expect(within(popupRegion()).getByText(message, { exact: false })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Wall primer" })).toBeDisabled();
    if (state !== "loading") {
      await user.click(screen.getByRole("button", { name: "Retry recommendations" }));
      expect(retry).toHaveBeenCalledOnce();
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("keeps unavailable warnings visible at zero items and retains their refresh action", async () => {
    const user = userEvent.setup(); const refresh = vi.fn();
    render(<PopupHarness initiallyOpen={false} overrides={{ items: [], total: 0, message: "A recommendation is unavailable in current Configuration.", onRetry: refresh }} />);
    await user.click(screen.getByRole("button", { name: "Recommendations (0) Review needed" }));
    expect(screen.getByText("A recommendation is unavailable in current Configuration.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Refresh recommendations" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("bounds rows to 20 and retains a valid page when closed and reopened", async () => {
    const user = userEvent.setup(); const add = vi.fn(); const remove = vi.fn();
    const allItems = Array.from({ length: 45 }, (_, index) => ({ ...row, id: String(index), name: `Recommended ${index}` }));
    render(<PopupHarness allItems={allItems} overrides={{ onAdd: add, onRemove: remove }} />);
    expect(within(popupRegion()).getAllByRole("listitem")).toHaveLength(20);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("21–40 of 45")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    await user.click(screen.getByRole("button", { name: "Recommendations (45)" }));
    expect(screen.getByText("21–40 of 45")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Recommended 20" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(within(popupRegion()).getAllByRole("listitem")).toHaveLength(5);
    expect(add).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
  });

  it("uses the shared dialog without geometry dependencies and has no automated accessibility violations", async () => {
    render(<PopupHarness />);
    const dialog = screen.getByRole("dialog", { name: "Non-negotiable recommendations" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus());
    expect(dialog).toHaveClass("ui-dialog", "estimate-recommendations-dialog");
    expect(popupRegion().style.position).toBe("");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    const result = await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
