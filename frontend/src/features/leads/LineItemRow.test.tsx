import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineItemRow } from "./LineItemRow";

const props = {
  catalogueId: "legacy-one", description: "Legacy finish", unit: "sq ft", rate: 100, quantity: 2.5,
  included: true, specification: "Premium", options: ["Premium", "Functional"],
  onToggle: vi.fn(), onSpecChange: vi.fn(), onQuantityChange: vi.fn(), onRemove: vi.fn(),
  money: (rupees: number) => `₹${rupees}`
};

describe("legacy estimate item prices", () => {
  it("shows 18% GST on rate and authoritative line amount while callbacks retain only edited quantities", () => {
    render(<LineItemRow {...props} pricesIncludeGst />);
    expect(screen.getByText("₹118 per sq ft incl. GST")).toBeVisible();
    expect(screen.getByLabelText("Amount for Legacy finish, including 18% GST")).toHaveTextContent("₹295");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Legacy finish quantity" }), { target: { value: "3.5" } });
    expect(props.onQuantityChange).toHaveBeenCalledWith(3.5);
    expect(props.rate).toBe(100);
  });

  it("keeps existing net presentation for callers that do not request GST", () => {
    render(<LineItemRow {...props} />);
    expect(screen.getByText("₹100 per sq ft")).toBeVisible();
    expect(screen.getByLabelText("Amount for Legacy finish")).toHaveTextContent("₹250");
    expect(screen.queryByText(/incl\. GST/)).not.toBeInTheDocument();
  });

  it.each([Number.NaN, -1, Number.MAX_SAFE_INTEGER])("does not manufacture a gross price from invalid input %s", rate => {
    render(<LineItemRow {...props} rate={rate} pricesIncludeGst />);
    expect(screen.getByText("Unavailable per sq ft incl. GST")).toBeVisible();
    expect(screen.getByLabelText("Amount for Legacy finish, including 18% GST")).toHaveTextContent("Unavailable");
  });
});
