import { fireEvent, render } from "@testing-library/react-native";

import { FinanceCylinderChart, financeCylinderLabel, financeCylinderScale } from "./FinanceCylinderChart";
import type { FinanceActivityChartData } from "./executive";

function fixture(): FinanceActivityChartData {
  return {
    points: [
      { id: "large", date: "2026-09-20", valuePaise: 90000, displayValue: "₹900.00", available: true },
      { id: "small", date: "2026-09-21", valuePaise: 30000, displayValue: "₹300.00", available: true },
      { id: "zero", date: "2026-09-22", valuePaise: 0, displayValue: "₹0.00", available: true },
      { id: "missing", date: "2026-09-23", valuePaise: null, displayValue: "Not available", available: false, unavailableReason: "Ledger unavailable" },
      { id: "refund", date: "2026-09-24", valuePaise: -30000, displayValue: "−₹300.00", available: true }
    ],
    approvedNetRevenue: { id: "revenue", label: "Net revenue", valuePaise: 999000, displayValue: "₹9,990.00", available: true },
    costBudget: { id: "budget", label: "Budget", valuePaise: 700000, displayValue: "₹7,000.00", available: true }
  };
}

describe("finance cylinder graph", () => {
  it("uses one signed paise scale with proportional height and no snapshot-guide distortion", () => {
    const scale = financeCylinderScale(fixture(), 160);
    expect(scale.minimum).toBe(-30000);
    expect(scale.maximum).toBe(90000);
    expect(scale.zero - scale.endpoint(90000)).toBeCloseTo(3 * (scale.zero - scale.endpoint(30000)));
    expect(scale.endpoint(-30000)).toBeGreaterThan(scale.zero);
    expect(scale.endpoint(0)).toBe(scale.zero);
    expect(financeCylinderLabel(125)).toBe("₹1.25");
    expect(financeCylinderLabel(-125)).toBe("−₹1.25");
    expect(financeCylinderLabel(120000)).toBe("₹1.2k");
  });

  it("distinguishes zero, unavailable and signed daily costs while preserving native selection", async () => {
    const onSelectDay = jest.fn();
    const view = await render(<FinanceCylinderChart data={fixture()} selectedDayId="small" onSelectDay={onSelectDay} />);
    expect(view.getByRole("button", { name: "2026-09-21 UTC. Recorded cost ₹300.00" }).props.accessibilityState.selected).toBe(true);
    expect(view.getByRole("button", { name: /2026-09-23.*Not available.*Ledger unavailable/ })).toBeTruthy();
    expect(view.getByTestId("finance-cylinder-zero-2", { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId("finance-cylinder-body-2", { includeHiddenElements: true })).toBeNull();
    expect(view.queryByTestId("finance-cylinder-zero-3", { includeHiddenElements: true })).toBeNull();
    expect(view.queryByTestId("finance-cylinder-body-3", { includeHiddenElements: true })).toBeNull();
    expect(view.getByTestId("finance-cylinder-body-4", { includeHiddenElements: true }).props.height).toBeGreaterThan(0);
    await fireEvent.press(view.getByRole("button", { name: "2026-09-24 UTC. Recorded cost −₹300.00" }));
    expect(onSelectDay).toHaveBeenCalledWith("refund");
    await view.rerender(<FinanceCylinderChart data={fixture()} selectedDayId="refund" onSelectDay={onSelectDay} />);
    expect(view.getByRole("button", { name: "2026-09-24 UTC. Recorded cost −₹300.00" }).props.accessibilityState.selected).toBe(true);
  });

  it("handles empty and all-zero windows without fabricated positive columns", async () => {
    const data = fixture();
    const view = await render(<FinanceCylinderChart data={{ ...data, points: [] }} />);
    expect(view.getByText("No daily finance values are available.")).toBeTruthy();
    const zero = { ...data, points: [data.points[2]!] };
    const scale = financeCylinderScale(zero, 160);
    expect(scale.endpoint(0)).toBe(scale.zero);
    await view.rerender(<FinanceCylinderChart data={zero} />);
    expect(view.queryByTestId("finance-cylinder-body-0", { includeHiddenElements: true })).toBeNull();
    expect(view.getByTestId("finance-cylinder-zero-0", { includeHiddenElements: true })).toBeTruthy();
  });

  it.each([7, 90])("keeps every date selectable in a %i-day window", async (days) => {
    const base = fixture();
    const points = Array.from({ length: days }, (_, index) => ({
      id: `day-${index}`, date: new Date(Date.UTC(2026, 6, index + 1)).toISOString().slice(0, 10),
      valuePaise: (index + 1) * 100, displayValue: `₹${index + 1}.00`, available: true
    }));
    const onSelectDay = jest.fn();
    const view = await render(<FinanceCylinderChart data={{ ...base, points }} selectedDayId={`day-${days - 1}`} onSelectDay={onSelectDay} />);
    expect(view.getAllByRole("button")).toHaveLength(days);
    expect(view.getByRole("button", { name: `${points[days - 1]!.date} UTC. Recorded cost ₹${days}.00` }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(view.getByRole("button", { name: "2026-07-01 UTC. Recorded cost ₹1.00" }));
    expect(onSelectDay).toHaveBeenCalledWith("day-0");
  });
});
