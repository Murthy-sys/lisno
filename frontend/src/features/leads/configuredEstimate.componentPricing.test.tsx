import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { configuredAttributedAmountPaise, configuredComponentPricing, configuredLineAmountPaise, updateConfiguredLinePricing } from "./configuredEstimate";
import { componentDraftFixture } from "./estimateComponentPricing.testFixtures";
import { EstimateComponentPricingStatus, EstimateSubBasketAmounts } from "./EstimateComponentBreakdown";

describe("In-house exact component amount", () => {
  it("uses exact scope-rounded paise instead of a rounded effective unit rate", () => {
    const line = componentDraftFixture();
    expect(configuredLineAmountPaise(line)).toBe(78333);
    expect(configuredLineAmountPaise({ ...line, quantity: 3 })).toBeNull();
    expect(configuredLineAmountPaise({ ...line, componentPricing: undefined, rateInput: "300" })).toBeNull();
    expect(configuredLineAmountPaise({ ...line, included: false })).toBe(0);
  });
  it("preserves manual and other-mode arithmetic and clears a stale basis on changes", () => {
    const line = componentDraftFixture();
    expect(configuredLineAmountPaise(updateConfiguredLinePricing(line, { rateInput: "100.01" }))).toBe(20002);
    const pmc = updateConfiguredLinePricing(line, { pricingMode: "pmc" });
    expect(pmc.componentPricing).toBeUndefined();
    expect(configuredLineAmountPaise(pmc)).toBe(2000);
    expect(configuredComponentPricing(updateConfiguredLinePricing(line, { quantity: 4 }))).toBeNull();
    expect(configuredLineAmountPaise({ ...line, pricingMode: "sub_vendor", rateInput: "80" })).toBe(16000);
  });
  it("adds same-target contributions from different Main Lines even when component IDs repeat", () => {
    render(<EstimateSubBasketAmounts lines={[componentDraftFixture(), componentDraftFixture("line-b", 3, 45000)]} />);
    const summary = screen.getByRole("region", { name: "In-house amounts by component Sub-Basket" });
    expect(within(summary).getByText("Finishes / Ceiling · ₹1,233.33")).toBeInTheDocument();
    expect(within(summary).getByText("Main Line A · Bedroom · 2 sq ft")).toBeInTheDocument();
    expect(within(summary).getByText("Main Line B · Bedroom · 3 sq ft")).toBeInTheDocument();
  });
  it("attributes component money to targets while retaining other-mode source amounts", () => {
    const a = componentDraftFixture(), b = componentDraftFixture("line-b", 3, 45000);
    const manual = { ...componentDraftFixture("manual"), rateSource: "manual" as const, rateInput: "10" };
    expect(configuredAttributedAmountPaise([a, b, manual], "basket-target", "sub-target")).toBe(123333);
    expect(configuredAttributedAmountPaise([a, b, manual], "basket-source", "sub-source")).toBe(2000);
    expect(configuredAttributedAmountPaise([{ ...a, componentPricing: undefined }], "basket-target", "sub-target")).toBeNull();
  });
  it("shows a visible retry state outside the component selector", () => {
    render(<EstimateComponentPricingStatus line={{ ...componentDraftFixture(), componentPricing: undefined,
      componentPricingState: "error", componentPricingIssue: "Pricing unavailable", componentPricingRetry: () => {} }} editable />);
    expect(screen.getByRole("status")).toHaveTextContent("Pricing unavailable");
    expect(screen.getByRole("button", { name: "Retry component calculation for Main Line A" })).toBeEnabled();
  });
});
