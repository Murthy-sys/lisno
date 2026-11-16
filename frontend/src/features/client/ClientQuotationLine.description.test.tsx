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
    { modeTier: "premium", description: "Premium acoustic finish.", available: true, unavailableReason: null, ratePaise: 15000, amountPaise: 150000, source }
  ] };
const props = { currentLine: line, item: draftQuotationItem(line), selected: true, disabled: false, grouped: false,
  canChangePricingMode: false, onTogglePmc: vi.fn(), onChange: vi.fn(), money: (value: number | null) => String(value) };

describe("client estimator description", () => {
  it("shows only the selected tier description and follows unsaved tier changes", () => {
    const view = render(<ClientQuotationLine {...props} />);
    expect(screen.getByText(/Signature finish/).textContent).toBe("Signature finish.\nIncludes installation.");
    expect(screen.queryByText("Internal specifications")).not.toBeInTheDocument();
    view.rerender(<ClientQuotationLine {...props} item={{ ...props.item, modeTier: "premium" }} />);
    expect(screen.getByText("Premium acoustic finish.")).toBeVisible();
    expect(screen.queryByText(/Signature finish/)).not.toBeInTheDocument();
  });

  it("uses current server descriptions and removes stale copy if the source is unavailable", () => {
    const view = render(<ClientQuotationLine {...props} currentLine={{ ...line, choices: line.choices.map(choice => ({ ...choice, description: "Updated saved wording." })) }} />);
    expect(screen.getByText("Updated saved wording.")).toBeVisible();
    view.rerender(<ClientQuotationLine {...props} currentLine={{ ...line, source: null }} />);
    expect(screen.getByText("Description not added.")).toBeVisible();
    expect(screen.queryByText(/Signature finish/)).not.toBeInTheDocument();
    view.rerender(<ClientQuotationLine {...props} selected={false} />);
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });
});
