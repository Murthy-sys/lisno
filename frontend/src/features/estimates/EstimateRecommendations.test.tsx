import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
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
