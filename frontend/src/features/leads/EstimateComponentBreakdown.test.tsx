import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toEstimateAggregatePricing } from "../../../../shared/estimation/estimateAggregatePricing";
import { EstimateComponentPricingStatus, EstimateSubBasketAmounts } from "./EstimateComponentBreakdown";
import { componentDraftFixture, componentPricingFixture } from "./estimateComponentPricing.testFixtures";

const governed = () => ({ ...componentDraftFixture(), inHouseUsage: "estimator" as const, inHousePricingState: "ready" as const,
  aggregatePricing: toEstimateAggregatePricing(componentPricingFixture()) });

describe("governed estimate pricing presentation", () => {
  it("renders only the aggregate price even if obsolete detailed evidence is cached", () => {
    render(<><EstimateComponentPricingStatus line={governed()} editable /><EstimateSubBasketAmounts lines={[governed()]} /></>);
    expect(screen.getByLabelText("Price including margin for Main Line A in Bedroom")).toHaveTextContent("₹783.33");
    expect(screen.queryByText(/Component selling amounts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finishes/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Labour/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "In-house amounts by component Sub-Basket" })).not.toBeInTheDocument();
  });

  it("offers explicit refresh, rather than retry, for changed saved prices", () => {
    const refresh = vi.fn(); const retry = vi.fn();
    const line = { ...governed(), configurationPricingChanged: true, componentPricingIssue: "Configuration changed. Refresh price.", componentPricingRefresh: refresh, componentPricingRetry: retry };
    const view = render(<EstimateComponentPricingStatus line={line} editable />);
    expect(screen.getByText("Configuration changed. Refresh price.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh price for Main Line A" }));
    expect(refresh).toHaveBeenCalledOnce(); expect(retry).not.toHaveBeenCalled();
    view.rerender(<EstimateComponentPricingStatus line={line} editable={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("labels component subtotals as partial when aggregate-only lines share the estimate", () => {
    render(<EstimateSubBasketAmounts lines={[governed(), componentDraftFixture("line-b", 3, 123456)]} />);
    expect(screen.getByText(/These subtotals show visible components only/)).toBeVisible();
    expect(screen.getByText(/Finishes \/ Ceiling · ₹1,234.56/)).toBeInTheDocument();
    expect(screen.queryByText(/Main Line A/)).not.toBeInTheDocument();
  });
});
