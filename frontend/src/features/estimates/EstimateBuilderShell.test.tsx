import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createConfiguredEstimateViewState } from "../leads/useConfiguredEstimateViewState";
import { EstimateBuilderShell } from "./EstimateBuilderShell";

function SafeQuotationShell({ onRemove, scrollMode }: { onRemove?: () => void; scrollMode?: "pane" | "document" }) {
  const [state, setState] = useState(createConfiguredEstimateViewState);
  return <EstimateBuilderShell
    rooms={[{ id: "kitchen", label: "Kitchen", hasSelectedItems: true }]}
    activeRoomId="kitchen" onSelectRoom={vi.fn()} selectedCount={1}
    baskets={[{ id: "cabinetry", name: "Cabinetry" }]}
    groups={[{ id: "cabinetry", name: "Cabinetry", count: 1, subtotalLabel: "Visible items: ₹2,000",
      directLines: [], subBaskets: [{ id: "base-units", name: "Base units", count: 1,
        subtotalLabel: "Visible items: ₹2,000", lines: [{ id: "safe-line" }],
        ...(onRemove ? { removal: { label: "Remove visible Base units items from Kitchen", onRemove } } : {}) }] }]}
    renderLine={id => <p data-testid={id}>Configured kitchen unit</p>}
    viewState={state} onViewStateChange={setState} onRefresh={vi.fn()} refreshing={false}
    scrollMode={scrollMode}
  />;
}

describe("EstimateBuilderShell safe presentation", () => {
  it("keeps empty rooms available in selected-only editors without changing historical room views", () => {
    const { rerender } = render(<EstimateBuilderShell rooms={[{ id: "empty", label: "Empty bedroom", hasSelectedItems: false }]}
      activeRoomId="empty" onSelectRoom={vi.fn()} selectedCount={0} baskets={[]} groups={[]} renderLine={() => null}
      viewState={{ ...createConfiguredEstimateViewState(), railView: "selected" }} onViewStateChange={vi.fn()}
      onRefresh={vi.fn()} refreshing={false} selectedItemsOnly />);
    expect(screen.getByRole("button", { name: "Empty bedroom" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Room view" })).not.toBeInTheDocument();
    rerender(<EstimateBuilderShell rooms={[{ id: "empty", label: "Empty bedroom", hasSelectedItems: false }]}
      activeRoomId="empty" onSelectRoom={vi.fn()} selectedCount={0} baskets={[]} groups={[]} renderLine={() => null}
      viewState={{ ...createConfiguredEstimateViewState(), railView: "selected" }} onViewStateChange={vi.fn()}
      onRefresh={vi.fn()} refreshing={false} />);
    expect(screen.queryByRole("button", { name: "Empty bedroom" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Room view" })).toBeVisible();
  });
  it.each(["pane", "document"] as const)("opens a collapsed basket and jumps in %s scroll mode", async (scrollMode) => {
    const user = userEvent.setup();
    render(<SafeQuotationShell scrollMode={scrollMode === "document" ? "document" : undefined} />);
    const pane = screen.getByRole("region", { name: "Estimate items for Kitchen" });
    const basket = screen.getByRole("region", { name: "Cabinetry" });
    const paneScroll = vi.fn();
    const documentScroll = vi.fn();
    Object.defineProperty(pane, "scrollTo", { configurable: true, value: paneScroll });
    Object.defineProperty(basket, "scrollIntoView", { configurable: true, value: documentScroll });
    vi.spyOn(pane, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(basket, "getBoundingClientRect").mockReturnValue({ top: 480 } as DOMRect);
    await user.click(within(basket).getByRole("button", { name: /Collapse Cabinetry/ }));
    expect(screen.getByTestId("safe-line")).not.toBeVisible();
    const jump = within(screen.getByRole("navigation", { name: "Jump to Main Basket" })).getByRole("button", { name: "Cabinetry" });
    jump.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("safe-line")).toBeVisible();
    expect(jump).toHaveFocus();
    if (scrollMode === "document") {
      await waitFor(() => expect(documentScroll).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" }));
      expect(paneScroll).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(paneScroll).toHaveBeenCalledWith({ top: 380, behavior: "smooth" }));
      expect(documentScroll).not.toHaveBeenCalled();
    }
  });

  it("renders room and basket navigation without inventing area or privileged edit fields", () => {
    render(<SafeQuotationShell />);
    expect(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: "Kitchen" })).toBeVisible();
    expect(screen.queryByText(/sqft/)).not.toBeInTheDocument();
    expect(screen.getByTestId("safe-line")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /rate|price/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Estimate items for Kitchen" })).toHaveAttribute("tabindex", "0");
  });

  it("keeps an authorized group action available beside a collapsed Sub Basket", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<SafeQuotationShell onRemove={onRemove} />);
    const group = screen.getByRole("region", { name: "Base units" });
    const disclosure = within(group).getByRole("button", { name: /Base units.*1 item/ });
    await user.click(disclosure);
    expect(screen.getByTestId("safe-line")).not.toBeVisible();
    const remove = within(group).getByRole("button", { name: "Remove visible Base units items from Kitchen" });
    remove.focus();
    await user.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledOnce();
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await user.click(disclosure);
    expect(screen.getByTestId("safe-line")).toBeVisible();
  });
});
