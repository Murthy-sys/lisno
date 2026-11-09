import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EstimateTierComparison } from "../estimates/estimateTierComparisonApi";
import { EstimateLineTierSuggestions } from "./EstimateLineTierSuggestions";

const moneyPaise = (value: number) => `₹${value / 100}`;
const comparison: EstimateTierComparison = { roomId: "room", roomName: "Living", mainBasketId: "basket", mainBasketName: "Finishes", subBasketId: "sub", subBasketName: "Walls", estimateVersion: 7,
  tiers: [
    { modeTier: "signature", label: "Signature", available: true, subtotalPaise: 0, lines: [{ mainLineId: "line", name: "Finish", quantity: 1.25, uomName: "sq ft", ratePaise: 0, amountPaise: 0, unavailableReason: null }] },
    { modeTier: "premium", label: "Premium", available: true, subtotalPaise: 3125, lines: [{ mainLineId: "line", name: "Finish", quantity: 1.25, uomName: "sq ft", ratePaise: 2500, amountPaise: 3125, unavailableReason: null }] },
    { modeTier: "functional", label: "Functional", available: false, subtotalPaise: null, lines: [{ mainLineId: "line", name: "Finish", quantity: 1.25, uomName: "sq ft", ratePaise: null, amountPaise: null, unavailableReason: "Price not configured" }] }
  ] };
const props = { label: "Wall finish in Living", mainLineId: "line", moneyPaise };

describe("Main Line tier suggestion messages", () => {
  it("keeps all tier suggestions visible with genuine zero, fractional prices and unavailable reasons", () => {
    render(<EstimateLineTierSuggestions {...props} state={{ status: "ready", comparison }} />);
    const group = screen.getByRole("group", { name: "Tier price suggestions for Wall finish in Living" });
    expect(group).toHaveTextContent("If you choose Signature: ₹0 / sq ft; ₹0 for 1.25 sq ft, excluding GST.");
    expect(group).toHaveTextContent("If you choose Premium: ₹25 / sq ft; ₹31.25 for 1.25 sq ft, excluding GST.");
    expect(group).toHaveTextContent("If you choose Functional: Price not configured");
    expect(within(group).queryByRole("button")).not.toBeInTheDocument();
  });

  it("uses stable line identity and shows component amounts without inventing a rate", () => {
    const next = structuredClone(comparison);
    next.tiers[1]!.lines.unshift({ ...next.tiers[1]!.lines[0]!, mainLineId: "other-line", amountPaise: 99999 });
    next.tiers[1]!.lines[1]!.ratePaise = null;
    render(<EstimateLineTierSuggestions {...props} state={{ status: "ready", comparison: next }} />);
    expect(screen.getByText("If you choose Premium:").parentElement).toHaveTextContent("If you choose Premium: ₹31.25 for 1.25 sq ft, excluding GST.");
    expect(screen.queryByText(/₹999/)).not.toBeInTheDocument();
    expect(screen.getByText("If you choose Premium:").parentElement).not.toHaveTextContent("/ sq ft");
  });

  it("replaces previous prices with persistent pending/unavailable messages", () => {
    const view = render(<EstimateLineTierSuggestions {...props} state={{ status: "ready", comparison }} />);
    view.rerender(<EstimateLineTierSuggestions {...props} state={{ status: "loading" }} />);
    expect(screen.getAllByText("Checking current price…")).toHaveLength(3);
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
    view.rerender(<EstimateLineTierSuggestions {...props} state={{ status: "unavailable", message: "Review item dimensions." }} />);
    expect(screen.getAllByText("Review item dimensions.")).toHaveLength(3);
    expect(screen.getAllByText(/If you choose/)).toHaveLength(3);
  });

  it("offers an accessible keyboard retry without altering the line", async () => {
    const retry = vi.fn(); const user = userEvent.setup();
    render(<EstimateLineTierSuggestions {...props} state={{ status: "error", message: "Tier prices could not be loaded. Try again.", retry }} />);
    expect(screen.getAllByText("Tier prices could not be loaded. Try again.")).toHaveLength(3);
    const button = screen.getByRole("button", { name: "Retry tier prices for Wall finish in Living" });
    button.focus(); await user.keyboard("{Enter}");
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/If you choose/)).toHaveLength(3);
  });

  it("never borrows another line or tier when an expected cell is absent", () => {
    render(<EstimateLineTierSuggestions {...props} mainLineId="missing" state={{ status: "ready", comparison }} />);
    expect(screen.getAllByText("Price unavailable for the current item details.")).toHaveLength(3);
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
  });
});
