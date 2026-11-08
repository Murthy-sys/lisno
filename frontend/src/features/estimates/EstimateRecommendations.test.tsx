import { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("opt-in recommendations popup", () => {
  it("opens the first ready suggestions without interrupting typing, scrolling, or locking the builder", async () => {
    const user = userEvent.setup(); const changed = vi.fn();
    const { rerender } = render(<PopupHarness overrides={{ state: "loading" }} onOpenChange={changed} />);
    const input = screen.getByRole("textbox", { name: "Quantity" });
    await user.type(input, "12");
    expect(screen.getByRole("button", { name: "Recommendations Checking…" })).toHaveAttribute("aria-expanded", "false");
    rerender(<PopupHarness onOpenChange={changed} />);
    await user.keyboard("3");
    expect(input).toHaveValue("123"); expect(input).toHaveFocus();
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
    expect(popupRegion()).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Add Wall primer" })).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByTestId("toolbar")).not.toContainElement(popupRegion());
  });

  it("respects close through source changes and supports keyboard reopening and scoped Escape", async () => {
    const user = userEvent.setup(); const changed = vi.fn();
    const { rerender } = render(<PopupHarness onOpenChange={changed} />);
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    const trigger = screen.getByRole("button", { name: "Recommendations (1)" });
    expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute("aria-expanded", "false");
    rerender(<PopupHarness overrides={{ contextKey: "bedroom:painting,ceiling" }} onOpenChange={changed} />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-controls", popupRegion().id);
    await user.click(screen.getByRole("textbox", { name: "Quantity" }));
    await user.keyboard("{Escape}");
    expect(popupRegion()).toBeVisible();
    screen.getByRole("button", { name: "Add Wall primer" }).focus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus(); expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(changed.mock.calls.map(call => call[0])).toEqual([true, false, true, false]);
  });

  it("keeps accepted Add/Remove focused and open, and never announces a rejected action", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PopupHarness />);
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

  it("waits for the first measured popup to become visible before focusing Close on keyboard opening", async () => {
    const user = userEvent.setup();
    const focus = HTMLElement.prototype.focus;
    const hiddenAttempts: HTMLElement[] = [];
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      // Browsers cannot focus visibility:hidden content; JSDOM otherwise permits it.
      const popup = this.closest<HTMLElement>(".estimate-recommendations-popup");
      if (popup?.style.visibility === "hidden") { hiddenAttempts.push(this); return; }
      focus.call(this, options);
    });
    render(<PopupHarness initiallyOpen={false} overrides={{ state: "error", items: [], total: 0 }} />);
    screen.getByRole("button", { name: "Recommendations Could not load" }).focus();
    await user.keyboard("{Enter}");
    expect(hiddenAttempts).toEqual([]);
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
  });

  it("returns focus to the builder when focused content becomes empty but never steals external focus", async () => {
    const { rerender } = render(<PopupHarness />);
    screen.getByRole("button", { name: "Add Wall primer" }).focus();
    rerender(<PopupHarness overrides={{ items: [], total: 0 }} />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Quantity" })).toHaveFocus());
    expect(screen.queryByRole("button", { name: /Recommendations/ })).not.toBeInTheDocument();
    rerender(<PopupHarness />);
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

  it("measures the visible toolbar and footer and adapts to a narrow viewport", async () => {
    let footerTop = 650;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === "toolbar") return { top: 80, bottom: 120, left: 20, right: 1000, width: 980, height: 40 } as DOMRect;
      if (this.dataset.testid === "footer") return { top: footerTop, bottom: footerTop + 80, left: 20, right: 1000, width: 980, height: 80 } as DOMRect;
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect;
    });
    render(<PopupHarness />);
    expect(popupRegion()).toHaveStyle({ left: "620px", top: "128px", width: "380px", maxHeight: "514px" });
    footerTop = 1000;
    vi.stubGlobal("innerWidth", 390); vi.stubGlobal("innerHeight", 500);
    fireEvent.resize(window);
    await waitFor(() => expect(popupRegion()).toHaveStyle({ left: "8px", width: "374px", maxHeight: "364px" }));
    footerTop = 125;
    fireEvent.resize(window);
    await waitFor(() => expect(popupRegion()).toHaveStyle({ top: "128px", maxHeight: "0" }));
    expect(screen.getByTestId("toolbar")).not.toContainElement(popupRegion());
    vi.unstubAllGlobals();
  });
});
