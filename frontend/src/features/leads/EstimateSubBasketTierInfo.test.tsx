import { useRef, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import type { EstimateTierComparison } from "../estimates/estimateTierComparisonApi";
import { EstimateSubBasketTierInfo, EstimateTierInfoButton, type EstimateTierInfoLine } from "./EstimateSubBasketTierInfo";

const moneyPaise = (value: number) => `₹${value / 100}`;
const comparison: EstimateTierComparison = {
  roomId: "living", roomName: "Living Room", mainBasketId: "interiors", mainBasketName: "Interiors",
  subBasketId: "finishes", subBasketName: "Finishes", estimateVersion: 4,
  tiers: (["signature", "premium", "functional"] as const).map((modeTier, index) => ({
    modeTier, label: modeTier, available: true, subtotalPaise: index === 2 ? 0 : 7000 + index * 3000,
    lines: [
      { mainLineId: "ceiling", name: "Ceiling", quantity: 2, uomName: "sq ft", ratePaise: index === 2 ? 0 : 2000 + index * 1000,
        amountPaise: index === 2 ? 0 : 4000 + index * 2000, unavailableReason: null },
      { mainLineId: "paint", name: "Paint", quantity: 3, uomName: "sq ft", ratePaise: null,
        amountPaise: index === 2 ? 0 : 3000 + index * 1000, unavailableReason: null }
    ]
  }))
};
const lines: EstimateTierInfoLine[] = [
  { key: "living-ceiling", label: "Ceiling in Living Room", mainLineId: "ceiling", state: { status: "ready", comparison } },
  { key: "living-paint", label: "Paint in Living Room", mainLineId: "paint", state: { status: "ready", comparison } }
];
const title = "Tier prices: Finishes in Living Room";

function Harness({ values = lines, removeTrigger = false }: { values?: readonly EstimateTierInfoLine[]; removeTrigger?: boolean }) {
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const fallbackFocusRef = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={fallbackFocusRef} type="button">Estimate items</button>
    {!open || !removeTrigger ? <EstimateTierInfoButton label="Finishes in Living Room" onClick={event => {
      returnFocusRef.current = event.currentTarget; setOpen(true);
    }} /> : null}
    {open ? <EstimateSubBasketTierInfo title={title} lines={values} moneyPaise={moneyPaise} onClose={() => setOpen(false)}
      returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef} /> : null}
  </>;
}

describe("Sub Basket tier information", () => {
  it("opens by keyboard and groups the supplied tier messages under each Main Line", async () => {
    const user = userEvent.setup(); render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Tier price information for Finishes in Living Room" });
    trigger.focus(); await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: title });
    const ceiling = within(dialog).getByRole("region", { name: "Ceiling in Living Room" });
    const paint = within(dialog).getByRole("region", { name: "Paint in Living Room" });
    expect(within(ceiling).getByRole("heading", { name: "Ceiling in Living Room" })).toBeVisible();
    expect(within(ceiling).getByText("If you choose Signature:").closest("p")).toHaveTextContent("₹20 / sq ft; ₹40 for 2 sq ft, excluding GST.");
    expect(within(ceiling).getByText("If you choose Premium:").closest("p")).toHaveTextContent("₹30 / sq ft; ₹60 for 2 sq ft, excluding GST.");
    expect(within(ceiling).getByText("If you choose Functional:").closest("p")).toHaveTextContent("₹0 / sq ft; ₹0 for 2 sq ft, excluding GST.");
    expect(within(paint).getByText("If you choose Premium:").closest("p")).toHaveTextContent("₹40 for 3 sq ft, excluding GST.");
    expect(within(paint).getByText("If you choose Premium:").closest("p")).not.toHaveTextContent("/ sq ft");
    expect(within(dialog).queryByRole("button", { name: /Download|Apply|Save/ })).not.toBeInTheDocument();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps loading, unavailable and retry messages within the appropriate Main Line", async () => {
    const user = userEvent.setup(); const retry = vi.fn();
    render(<Harness values={[
      { ...lines[0]!, state: { status: "loading" } },
      { ...lines[1]!, state: { status: "unavailable", message: "Choose components to calculate the price." } },
      { key: "living-floor", label: "Floor in Living Room", mainLineId: "floor", state: { status: "error", message: "Tier prices could not be loaded.", retry } }
    ]} />);
    await user.click(screen.getByRole("button", { name: "Tier price information for Finishes in Living Room" }));
    expect(within(screen.getByRole("region", { name: "Ceiling in Living Room" })).getAllByText("Checking current price…")).toHaveLength(3);
    expect(within(screen.getByRole("region", { name: "Paint in Living Room" })).getAllByText("Choose components to calculate the price.")).toHaveLength(3);
    const floor = screen.getByRole("region", { name: "Floor in Living Room" });
    expect(within(floor).getAllByText("Tier prices could not be loaded.")).toHaveLength(3);
    await user.click(within(floor).getByRole("button", { name: "Retry tier prices for Floor in Living Room" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("contains keyboard focus and closes with Escape", async () => {
    const user = userEvent.setup(); render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Tier price information for Finishes in Living Room" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: title });
    const close = within(dialog).getByRole("button", { name: "Close" });
    close.focus(); await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("returns focus to the fallback when the original trigger is removed", async () => {
    const user = userEvent.setup(); render(<Harness removeTrigger />);
    await user.click(screen.getByRole("button", { name: "Tier price information for Finishes in Living Room" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Estimate items" })).toHaveFocus());
  });
});
