import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientQuotationLine } from "./ClientQuotationLine";
import { draftQuotationItem } from "./clientQuotationDraft";
import type { QuotationLine } from "./quotationApi";

const source = { revisionId: "revision", itemVersion: 1, revisionVersion: 1, uomId: "sqft" };
const line: QuotationLine = { id: "line", mainLineId: "ceiling", mainLineName: "Ceiling", roomId: "living", roomName: "Living room",
  included: true, source, quantity: 10, uomName: "sq ft", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 10000, amountPaise: 100000,
  choices: [
    { modeTier: "signature", description: "Signature finish.\nIncludes installation.", available: true, unavailableReason: null, ratePaise: 10000, amountPaise: 100000, source },
    { modeTier: "premium", description: "Premium acoustic finish.", available: true, unavailableReason: null, ratePaise: 15000, amountPaise: 150000, source },
    { modeTier: "functional", description: "Functional ceiling finish.", available: true, unavailableReason: null, ratePaise: 5000, amountPaise: 50000, source }
  ] };
const props = { currentLine: line, item: draftQuotationItem(line), selected: true, disabled: false, grouped: false,
  canChangePricingMode: false, onTogglePmc: vi.fn(), onChange: vi.fn(), money: (value: number | null) => String(value) };

describe("client estimator description", () => {
  it("applies the inclusive PMC quantity threshold while preserving the recorded tax-inclusive amount", () => {
    const pmc: QuotationLine = { ...line, pricingMode: "pmc", taxInclusiveAmountPaise: 118001,
      choices: [{ ...line.choices[0]!, vendorRateSchedule: { lowQuantityLimit: "2.50", standardRatePaise: 10_000, lowQuantityRatePaise: 11_500 } }] };
    const item = draftQuotationItem(pmc);
    const view = render(<ClientQuotationLine {...props} currentLine={pmc} item={{ ...item, quantity: "2.5" }} />);
    expect(screen.getByLabelText(/Configured price including GST/)).toHaveTextContent("13570");
    expect(screen.getByLabelText(/Saved amount including GST/)).toHaveTextContent("118001");
    view.rerender(<ClientQuotationLine {...props} currentLine={pmc} item={{ ...item, quantity: "2.51" }} />);
    expect(screen.getByLabelText(/Configured price including GST/)).toHaveTextContent("11800");
    expect(screen.getByLabelText(/Saved amount including GST/)).toHaveTextContent("118001");
    expect(screen.queryByText(/Lisno margin/)).not.toBeInTheDocument();
    view.rerender(<ClientQuotationLine {...props} disabled useRecordedPmcRate currentLine={{ ...pmc, ratePaise: 7000 }} item={item} />);
    expect(screen.getByLabelText(/Configured price including GST/)).toHaveTextContent("8260");
  });

  it("keeps an incompatible saved row visible and removable while blocking new inclusion", () => {
    const saved = { ...line, roomMismatch: true };
    const view = render(<ClientQuotationLine {...props} currentLine={saved} />);
    expect(screen.getByText(/no longer applies to Living room/)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Include Ceiling in Living room" })).toBeEnabled();
    expect(screen.getByLabelText("Saved amount including GST for Ceiling in Living room")).toHaveTextContent("118000");
    view.rerender(<ClientQuotationLine {...props} currentLine={{ ...saved, included: false }} selected={false} />);
    expect(screen.getByRole("checkbox", { name: "Include Ceiling in Living room" })).toBeDisabled();
  });

  it("shows only the selected tier description and follows unsaved tier changes", () => {
    const view = render(<ClientQuotationLine {...props} />);
    expect(screen.getByText(/Signature finish/).textContent).toBe("Signature finish.\nIncludes installation.");
    expect(screen.getByRole("region", { name: /^Signature description for/ }).textContent).toBe("Signature finish.\nIncludes installation.");
    expect(screen.queryByText("Internal specifications")).not.toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Configured price including GST for Ceiling in Living room")).toHaveTextContent("11800");
    expect(screen.getByLabelText("Saved amount including GST for Ceiling in Living room")).toHaveTextContent("118000");
    view.rerender(<ClientQuotationLine {...props} item={{ ...props.item, modeTier: "premium" }} />);
    expect(screen.getByText("Premium acoustic finish.")).toBeVisible();
    expect(screen.getByRole("region", { name: /^Premium description for/ }).textContent).toBe("Premium acoustic finish.");
    expect(screen.queryByText(/Signature finish/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Configured price including GST for Ceiling in Living room")).toHaveTextContent("17700");
    view.rerender(<ClientQuotationLine {...props} item={{ ...props.item, modeTier: "functional" }} />);
    expect(screen.getByRole("region", { name: /^Functional description for/ }).textContent).toBe("Functional ceiling finish.");
    expect(screen.queryByText("Premium acoustic finish.")).not.toBeInTheDocument();
    expect(line.ratePaise).toBe(10000);
    expect(line.amountPaise).toBe(100000);
  });

  it("uses current server descriptions and removes stale copy if the source is unavailable", () => {
    const view = render(<ClientQuotationLine {...props} currentLine={{ ...line, choices: line.choices.map(choice => ({ ...choice, description: "Updated saved wording." })) }} />);
    expect(screen.getByText("Updated saved wording.")).toBeVisible();
    view.rerender(<ClientQuotationLine {...props} currentLine={{ ...line, source: null }} />);
    expect(screen.queryByRole("region", { name: /description for/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Signature finish/)).not.toBeInTheDocument();
    view.rerender(<ClientQuotationLine {...props} selected={false} />);
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });
});

it("keeps PMC recipient amounts tied to the saved row while quantity edits await save", () => {
  const pmc: QuotationLine = { ...line, pricingMode: "pmc", pmcPaymentSplit: {
    version: 1, marginBps: 2000, vendorAmountPaise: 100000, lisnoAmountPaise: 25000, estimatedValuePaise: 125000,
    vendorPayablePaise: 118000, lisnoPayablePaise: 29500, totalPayablePaise: 147500, taxBasis: { subtotalPaise: 100000, gstPaise: 18000 }
  } };
  render(<ClientQuotationLine {...props} currentLine={pmc} item={{ ...draftQuotationItem(pmc), quantity: "25" }} />);
  expect(screen.getByLabelText(/Saved amount including GST/)).toHaveTextContent("147500");
  expect(screen.getByText("Payable to Lisno · 20% of estimated value before tax").nextElementSibling).toHaveTextContent("₹295");
  expect(screen.getByText("Payable to vendor · remaining share").nextElementSibling).toHaveTextContent("₹1,180");
  expect(screen.getByLabelText(/Configured price including GST/)).toHaveTextContent("11800");
});
