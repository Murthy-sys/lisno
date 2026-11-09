import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EstimateSubBasketModes, type EstimateSubBasketMode } from "./EstimateSubBasketModes";
import { ApiError } from "../../api/client";
import { downloadEstimateTierComparison, getEstimateTierComparison, type EstimateTierComparison, type EstimateTierComparisonRequest } from "./estimateTierComparisonApi";

vi.mock("./estimateTierComparisonApi", () => ({ getEstimateTierComparison: vi.fn(), downloadEstimateTierComparison: vi.fn() }));
const comparison: EstimateTierComparisonRequest = { target: { kind: "project", id: "project-a" }, input: {
  expectedVersion: 3, mainBasketId: "basket-a", subBasketId: "sub-a", roomId: "room-a", lines: [{
    mainLineId: "line-a", lineItemId: "saved-a", revisionId: "rev-a", itemVersion: 1, revisionVersion: 2,
    uomId: "sqm", quantity: 2, pricingMode: "sub_vendor", modeTier: "signature"
  }]
} };
const choices = [{ tier: "signature", available: true }, { tier: "premium", available: true }, { tier: "functional", available: false, reason: "One included item has no Functional price." }] as const;
const result: EstimateTierComparison = { mainBasketId: "basket-a", subBasketId: "sub-a", roomId: "room-a", roomName: "Living room",
  mainBasketName: "Finishes", subBasketName: "Walls", estimateVersion: 3,
  tiers: [
    { modeTier: "current", label: "Mode", available: true, subtotalPaise: 40000, lines: [{ mainLineId: "line-a", name: "Wall finish", quantity: 2, uomName: "sqm", ratePaise: 20000, amountPaise: 40000, unavailableReason: null }] },
    { modeTier: "premium", label: "Premium", available: true, subtotalPaise: 50000, lines: [{ mainLineId: "line-a", name: "Wall finish", quantity: 2, uomName: "sqm", ratePaise: 25000, amountPaise: 50000, unavailableReason: null }] },
    { modeTier: "functional", label: "Functional", available: false, subtotalPaise: null, lines: [{ mainLineId: "line-a", name: "Wall finish", quantity: 2, uomName: "sqm", ratePaise: null, amountPaise: null, unavailableReason: "Select components" }] }
  ] };

describe("sub-basket modes and comparison", () => {
  it("keeps Mode selected until an explicit accessible group choice, allowing return to Mode", async () => {
    const user = userEvent.setup(); const changed = vi.fn();
    function Harness() { const [value, setValue] = useState<EstimateSubBasketMode>("mode"); return <EstimateSubBasketModes label="Walls" value={value} options={choices}
      onChange={next => { changed(next); setValue(next); }} comparison={comparison} />; }
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "Mode for Walls" })).toBeChecked(); expect(changed).not.toHaveBeenCalled();
    screen.getByRole("radio", { name: "Mode for Walls" }).focus(); await user.keyboard("{ArrowRight}");
    expect(changed).toHaveBeenLastCalledWith("signature");
    await user.click(screen.getByRole("radio", { name: "Premium tier for Walls" })); expect(changed).toHaveBeenLastCalledWith("premium");
    expect(screen.getByRole("radio", { name: "Functional tier for Walls" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Functional tier for Walls" })).toHaveAccessibleDescription("One included item has no Functional price.");
    await user.click(screen.getByRole("radio", { name: "Mode for Walls" })); expect(changed).toHaveBeenLastCalledWith("mode");
  });

  it.each([[false, false], [true, false], [true, true]])("opens the unchanged comparison and PDF (comparisonOnly: %s, inline: %s)", async (comparisonOnly, inline) => {
    const user = userEvent.setup(); const changed = vi.fn(); vi.mocked(getEstimateTierComparison).mockResolvedValue(result);
    vi.mocked(downloadEstimateTierComparison).mockResolvedValue({ blob: new Blob(["pdf"], { type: "application/pdf" }), filename: "comparison.pdf" });
    const createUrl = vi.fn(() => "blob:comparison"); const revokeUrl = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const control = <EstimateSubBasketModes label="Walls" value="mode" options={choices} readOnly onChange={changed} comparison={comparison} comparisonOnly={comparisonOnly} inline={inline} />;
    const { container } = render(inline ? <h3>Walls {control}</h3> : control);
    if (inline) {
      expect(container.querySelector("h3 > span.estimate-sub-basket-modes--inline")).not.toBeNull();
      expect(container.querySelector("h3 div, h3 fieldset")).toBeNull();
    }
    if (comparisonOnly) {
      expect(screen.queryByRole("group", { name: "Modes for Walls" })).not.toBeInTheDocument();
      expect(screen.queryByRole("radio")).not.toBeInTheDocument();
      expect(screen.queryByText("Mode keeps current line choices.")).not.toBeInTheDocument();
    } else screen.getAllByRole("radio").forEach(radio => expect(radio).toBeDisabled());
    const trigger = screen.getByRole("button", { name: "Check tier comparison for Walls" }); await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Price comparison: Walls" });
    expect(await within(dialog).findByRole("rowheader", { name: /Wall finish/ })).toHaveTextContent("2 sqm");
    expect(within(dialog).getByRole("columnheader", { name: "Mode" })).toBeVisible();
    expect(getEstimateTierComparison).toHaveBeenCalledWith(comparison, expect.any(AbortSignal));
    expect(within(dialog).getByText("₹250 / sqm")).toBeVisible(); expect(within(dialog).getByText("Select components")).toBeVisible();
    expect(within(dialog).getByRole("rowheader", { name: "Sub-basket total" }).closest("tr")).toHaveTextContent("₹400₹500Incomplete");
    await user.click(within(dialog).getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce()); expect(downloadEstimateTierComparison).toHaveBeenCalledWith(comparison, expect.any(AbortSignal));
    expect(changed).not.toHaveBeenCalled(); await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(trigger).toHaveFocus()); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith("blob:comparison"));
  });

  it.each([[false, false], [true, false], [true, true]])("keeps stale comparison unavailable until retry succeeds (comparisonOnly: %s, inline: %s)", async (comparisonOnly, inline) => {
    const user = userEvent.setup(); vi.mocked(getEstimateTierComparison).mockRejectedValueOnce(new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "Refresh the changed estimate."))
      .mockResolvedValueOnce(result);
    render(<EstimateSubBasketModes label="Walls" value="mode" options={choices} onChange={vi.fn()} comparison={comparison} comparisonOnly={comparisonOnly} inline={inline} />);
    await user.click(screen.getByRole("button", { name: "Check tier comparison for Walls" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh the changed estimate.");
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry comparison" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled());
  });

  it("keeps the unavailable reason accessible in the inline heading control", () => {
    const reason = "Refresh the estimate and complete quantities to compare current tier prices.";
    render(<h3>Walls <EstimateSubBasketModes label="Walls" value="mode" options={[]} onChange={vi.fn()}
      comparisonOnly inline detailsDisabledReason={reason} /></h3>);
    const trigger = screen.getByRole("button", { name: "Check tier comparison for Walls" });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAccessibleDescription(reason);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});
