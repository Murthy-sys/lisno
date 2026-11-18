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
