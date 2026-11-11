import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProcurementComponentBreakdown } from "./ProcurementComponentBreakdown";
import type { ProcurementInHouseComponentBreakdown } from "./procurementBasketApi";

const breakdown: ProcurementInHouseComponentBreakdown = { complete: true, unavailableSourceLineItemKeys: [], adjustedCostPaise: 105000, sellingPaise: 123333,
  subBaskets: [{ basketId: "target", basketName: "Finishes", subBasketId: "ceiling", subBasketName: "Ceiling", adjustedCostPaise: 105000, sellingPaise: 123333,
    contributions: [{ sourceLineItemKey: "line-a", componentId: "same", roomId: "room-a", quantity: "2", unit: "sq ft", laborAdjustedCostPaise: 20000, materialAdjustedCostPaise: 40000, laborSellingPaise: 25000, materialSellingPaise: 53333 },
      { sourceLineItemKey: "line-b", componentId: "same", roomId: "room-b", quantity: "3", unit: "sq ft", laborAdjustedCostPaise: 15000, materialAdjustedCostPaise: 30000, laborSellingPaise: 15000, materialSellingPaise: 30000 }] }] };

describe("Procurement component cost disclosure", () => {
  it("labels a mixed-policy subtotal and removes stale detail when the refreshed response hides everything", () => {
    const view = render(<ProcurementComponentBreakdown breakdown={{ ...breakdown, visibleComponentsOnly: true }} />);
    expect(screen.getByText(/Visible-component subtotal:/)).toHaveTextContent("1,050");
    expect(screen.getByText(/basket and project totals include every source line/)).toBeInTheDocument();
    expect(screen.queryByText(/Current component cost:/)).not.toBeInTheDocument();
    view.rerender(<ProcurementComponentBreakdown />);
    expect(screen.queryByText(/Finishes/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("renders only the server-supplied breakdown and distinguishes cost from selling", async () => {
    const user = userEvent.setup(), open = vi.fn();
    const view = render(<ProcurementComponentBreakdown />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    view.rerender(<ProcurementComponentBreakdown breakdown={breakdown} sources={new Map([["line-a", "Main Line A"], ["line-b", "Main Line B"]])} onOpenSource={open} />);
    expect(screen.getByText(/Current component cost:/)).toHaveTextContent("1,050");
    await user.click(screen.getByText(/Finishes \/ Ceiling/));
    expect(screen.getByText("Selling benchmark").nextElementSibling).toHaveTextContent("1,233.33");
    await user.click(screen.getByRole("button", { name: "Main Line B" }));
    expect(open).toHaveBeenCalledWith("line-b");
  });
  it("never labels a partial sum complete", () => {
    render(<ProcurementComponentBreakdown breakdown={{ ...breakdown, complete: false, unavailableSourceLineItemKeys: ["missing"], adjustedCostPaise: null, sellingPaise: null }} />);
    expect(screen.getByText(/Current component cost:/)).toHaveTextContent("Incomplete");
    expect(screen.getByRole("status")).toHaveTextContent("1 source line needs current component pricing");
  });
});
