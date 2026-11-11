import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toEstimateAggregatePricing } from "../../../../shared/estimation/estimateAggregatePricing";
import { componentPricingFixture } from "../leads/estimateComponentPricing.testFixtures";
import { ClientQuotationLine } from "./ClientQuotationLine";
import { draftQuotationItem } from "./clientQuotationDraft";
import type { QuotationLine } from "./quotationApi";

const aggregate = toEstimateAggregatePricing(componentPricingFixture());
const source = { revisionId: aggregate.revisionId, itemVersion: 2, revisionVersion: 3, uomId: "uom-a" };
const legacy: QuotationLine = { id: "saved", mainLineId: "line-a", mainLineName: "Ceiling", roomId: "room", roomName: "Living",
  included: true, source, quantity: 2, uomName: "sq ft", pricingMode: "in_house", modeTier: "signature", ratePaise: null, amountPaise: 78333,
  choices: [{ modeTier: "signature", available: true, unavailableReason: null, ratePaise: null, amountPaise: 78333, source,
    inHouseComponents: [{ id: "secret", label: "Hidden panel", ratePaise: 1000, available: true }] }] };
const governed: QuotationLine = { ...legacy, inHouseUsage: "estimator", aggregatePricing: aggregate, pricingBasis: aggregate.formulaVersion,
  choices: [{ ...legacy.choices[0]!, inHouseComponents: undefined, aggregatePricing: aggregate, pricingBasis: aggregate.formulaVersion, inHouseUsage: "estimator" }] };
const props = { item: { ...draftQuotationItem(legacy), quantity: "3" }, selected: true, disabled: false, grouped: false,
  canChangePricingMode: false, onTogglePmc: vi.fn(), onChange: vi.fn(), money: (paise: number | null) => paise === null ? "Unavailable" : `₹${(paise / 100).toFixed(2)}` };

describe("governed quotation line", () => {
  it("removes stale draft component choices when refreshed server policy restricts them", () => {
    const view = render(<ClientQuotationLine {...props} currentLine={legacy} />);
    expect(screen.getByText("Hidden panel")).toBeVisible();
    view.rerender(<ClientQuotationLine {...props} currentLine={governed} />);
    expect(screen.queryByText("Hidden panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Components/ })).not.toBeInTheDocument();
    expect(screen.getByText("Price including margin")).toBeVisible();
    expect(screen.getByLabelText("Configured price for Ceiling in Living")).toHaveTextContent("₹783.33");
    expect(screen.getByRole("spinbutton", { name: "Quantity for Ceiling in Living sq ft" })).toHaveValue(3);
    expect(screen.getByText(/calculated for the saved quantity/)).toBeVisible();
  });

  it("does not disclose cached components when explicit aggregate evidence is invalid", () => {
    render(<ClientQuotationLine {...props} currentLine={{ ...governed, choices: [{ ...governed.choices[0]!, amountPaise: 1, inHouseComponents: legacy.choices[0]!.inHouseComponents }] }} />);
    expect(screen.getByLabelText("Configured price for Ceiling in Living")).toHaveTextContent("Unavailable");
    expect(screen.queryByText("Hidden panel")).not.toBeInTheDocument();
  });
});
