import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet, useWindowDimensions } from "react-native";

import { CostCompositionGauge, ProjectStatusLandscape } from "./ReferenceStatusCharts";
import { buildCostGaugeModel, buildProjectLandscapeModel, gaugeArcPath, landscapeHillPath } from "./referenceStatusGeometry";
import type { StageDatum } from "./types";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 411, height: 900, scale: 3, fontScale: 1 }))
}));

const projectStages = [
  { id: "lifecycle.planning", label: "Planning" },
  { id: "lifecycle.active", label: "Active" },
  { id: "lifecycle.onHold", label: "On hold" },
  { id: "lifecycle.completed", label: "Completed" }
];
const costStages = [
  { id: "finance.procurementCostPaise", label: "Procurement" },
  { id: "finance.employeePaymentPaise", label: "Employee payments" },
  { id: "finance.otherExpensePaise", label: "Other expenses" },
  { id: "finance.overheadPaise", label: "Overheads" }
];

function projects(amounts: readonly (number | null)[]): readonly StageDatum[] {
  return projectStages.map((stage, index) => ({
    ...stage,
    value: amounts[index] ?? null,
    available: amounts[index] !== null,
    displayValue: amounts[index]?.toString() ?? "Not available"
  }));
}

function costs(amounts: readonly (number | null)[]): readonly StageDatum[] {
  return costStages.map((stage, index) => ({
    ...stage,
    value: amounts[index] ?? null,
    available: amounts[index] !== null,
    displayValue: amounts[index] === null || amounts[index] === undefined
      ? "Not available"
      : `₹${(amounts[index]! / 100).toFixed(2)}`
  }));
}

describe("reference project landscape", () => {
  afterEach(() => jest.restoreAllMocks());

  it("uses proportional counts in canonical order and a current snapshot insight", async () => {
    const values = projects([2, 9, 3, 0]);
    const model = buildProjectLandscapeModel([...values].reverse(), "14");
    expect(model.stages.map((stage) => stage.heightRatio)).toEqual([2 / 9, 1, 1 / 3, 0]);
    const view = await render(<ProjectStatusLandscape centerDisplay="14" values={values} />);
    expect(view.getByLabelText("Total projects: 14")).toBeTruthy();
    expect(view.getByLabelText("Active: 9")).toBeTruthy();
    expect(view.getByLabelText("On hold: 3")).toBeTruthy();
    expect(view.getByText("Active has the most projects")).toBeTruthy();
    expect(view.getByText("9 of 14 projects in this state.")).toBeTruthy();
    expect(view.queryByText(/peak|previous|increase/i)).toBeNull();
    expect(view.queryByTestId("project-hill-completed", { includeHiddenElements: true })).toBeNull();
  });

  it("keeps zero hills flat and presents an honest empty state", async () => {
    const model = buildProjectLandscapeModel(projects([0, 0, 0, 0]), "0");
    expect(model.stages.map((stage) => stage.heightRatio)).toEqual([0, 0, 0, 0]);
    expect(landscapeHillPath(45, 118, 0)).not.toContain("NaN");
    const view = await render(<ProjectStatusLandscape centerDisplay="0" values={projects([0, 0, 0, 0])} />);
    expect(view.getByText("No projects recorded")).toBeTruthy();
    expect(view.queryByTestId("project-hill-active", { includeHiddenElements: true })).toBeNull();
    expect(view.getByLabelText("Active: 0")).toBeTruthy();
  });

  it("retains known states and makes null, omitted and invalid counts unavailable", async () => {
    const values = projects([2, null, -1, 1]).slice(0, 3);
    const model = buildProjectLandscapeModel(values, "Partial");
    expect(model.stages.map((stage) => stage.value)).toEqual([2, null, null, null]);
    const view = await render(<ProjectStatusLandscape centerDisplay="Partial" values={values} />);
    expect(view.getByLabelText("Planning: 2")).toBeTruthy();
    expect(view.getByLabelText("Active: Not available")).toBeTruthy();
    expect(view.getByLabelText("On hold: Not available")).toBeTruthy();
    expect(view.getByLabelText("Completed: Not available")).toBeTruthy();
    expect(view.getByText("Some project counts are unavailable")).toBeTruthy();
  });

  it("does not invent a leader for equal counts or unavailable snapshot totals", () => {
    expect(buildProjectLandscapeModel(projects([2, 2, 2, 2]), "8").title).toBe("Project counts are evenly distributed");
    expect(buildProjectLandscapeModel(projects([2, 9, 3, 1]), "Partial").complete).toBe(false);
  });
});

describe("reference cost gauge", () => {
  beforeEach(() => jest.mocked(useWindowDimensions).mockReturnValue({ width: 411, height: 900, scale: 3, fontScale: 1 }));
  afterEach(() => jest.restoreAllMocks());

  it("calculates the largest share from unequal exact paise amounts without integer-rupee rounding", async () => {
    const values = costs([101, 503, 307, 89]);
    const model = buildCostGaugeModel([...values].reverse(), "₹10.00");
    expect(model.share).toBe(0.503);
    expect(model.largest?.label).toBe("Employee payments");
    const view = await render(<CostCompositionGauge centerDisplay="₹10.00" values={values} />);
    expect(view.getByLabelText("Procurement: ₹1.01")).toBeTruthy();
    expect(view.getByLabelText("Employee payments: ₹5.03")).toBeTruthy();
    expect(view.getByLabelText("Other expenses: ₹3.07")).toBeTruthy();
    expect(view.getByLabelText("Overheads: ₹0.89")).toBeTruthy();
    expect(view.getByText("50.3%")).toBeTruthy();
    expect(view.getByLabelText("Recorded cost: ₹10.00. Employee payments · largest share: 50.3%.")).toBeTruthy();
    expect(view.getByTestId("cost-gauge-share-arc", { includeHiddenElements: true }).props.d).toBe(gaugeArcPath(0.503));
  });

  it.each([
    { amounts: [null, 200, 300, 400], center: "Partial", reason: /incomplete/ },
    { amounts: [100, 200, 300, 400], center: "Partial", reason: /incomplete/ },
    { amounts: [100, 200, 300, 400], center: "Not available", reason: /incomplete/ },
    { amounts: [0, 0, 0, 0], center: "₹0.00", reason: /No recorded cost/ },
    { amounts: [-100, 200, 300, 400], center: "₹8.00", reason: /negative adjustments/ }
  ])("withholds a share for $center and $amounts", async ({ amounts, center, reason }) => {
    const model = buildCostGaugeModel(costs(amounts), center);
    expect(model.share).toBeNull();
    const view = await render(<CostCompositionGauge centerDisplay={center} values={costs(amounts)} />);
    expect(view.queryByTestId("cost-gauge-share-arc", { includeHiddenElements: true })).toBeNull();
    expect(view.queryByText(/%/, { includeHiddenElements: true })).toBeNull();
    expect(view.getByText(reason)).toBeTruthy();
    expect(view.getByLabelText(`Procurement: ${amounts[0] === null ? "Not available" : `₹${(amounts[0]! / 100).toFixed(2)}`}`)).toBeTruthy();
  });

  it("requires all four source categories and honors explicit source unavailability", () => {
    const values = costs([100, 200, 300, 400]);
    expect(buildCostGaugeModel(values.slice(0, 3), "₹6.00").share).toBeNull();
    expect(buildCostGaugeModel(values.map((stage, index) => index === 0 ? { ...stage, available: false } : stage), "₹10.00").share).toBeNull();
    expect(buildCostGaugeModel(costs([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0, 0]), "Total").share).toBeNull();
  });

  it("recognizes a joint largest category and full share without dividing by zero", () => {
    expect(buildCostGaugeModel(costs([100, 100, 0, 0]), "₹2.00")).toEqual(expect.objectContaining({ share: 0.5, tied: true }));
    expect(buildCostGaugeModel(costs([0, 100, 0, 0]), "₹1.00")).toEqual(expect.objectContaining({ share: 1, tied: false }));
    expect(gaugeArcPath(1)).toContain("A 75 75 0 1 1");
    expect(gaugeArcPath(0.5)).toContain("A 75 75 0 0 1");
  });

  it.each([
    { width: 411, fontScale: 1, expectedDirection: "row" },
    { width: 864, fontScale: 1, expectedDirection: "row" },
    { width: 411, fontScale: 1.5, expectedDirection: "column" },
    { width: 320, fontScale: 1, expectedDirection: "column" }
  ])("keeps exact amounts and category labels readable at $width dp, font scale $fontScale", async ({ width, fontScale, expectedDirection }) => {
    jest.mocked(useWindowDimensions).mockReturnValue({ width, height: 900, scale: 3, fontScale });
    const view = await render(<CostCompositionGauge centerDisplay="₹10,000.00" values={costs([990000, 9000, 600, 400])} />);
    await fireEvent(view.getByTestId("dashboard-cost-composition-chart"), "layout", { nativeEvent: { layout: { width: width - 72, height: 220, x: 0, y: 0 } } });
    expect(StyleSheet.flatten(view.getByTestId("cost-gauge-layout").props.style).flexDirection).toBe(expectedDirection);
    for (const label of ["Procurement", "Employee payments", "Other expenses", "Overheads"]) {
      expect(view.getByText(label).props.numberOfLines).toBeUndefined();
    }
    expect(view.getByText("₹10,000.00").props).toEqual(expect.objectContaining({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.8 }));
    expect(view.queryAllByRole("button")).toHaveLength(0);
  });

  it("gives very long currency a larger ring and stacked layout while retaining the full accessible value", async () => {
    const view = await render(<CostCompositionGauge centerDisplay="₹12,34,56,789.01" values={costs([123456780001, 600, 200, 100])} />);
    await fireEvent(view.getByTestId("dashboard-cost-composition-chart"), "layout", { nativeEvent: { layout: { width: 339, height: 400, x: 0, y: 0 } } });
    expect(StyleSheet.flatten(view.getByTestId("cost-gauge-layout").props.style).flexDirection).toBe("column");
    const total = view.getByLabelText(/^Recorded cost: ₹12,34,56,789.01\./);
    expect(StyleSheet.flatten(total.props.style).width).toBe(320);
    expect(view.getByText("₹12,34,56,789.01").props).toEqual(expect.objectContaining({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.8 }));
    expect(StyleSheet.flatten(view.getByText("₹12,34,56,789.01").props.style)).toEqual(expect.objectContaining({ fontSize: 14, lineHeight: 20 }));
    await view.rerender(<CostCompositionGauge centerDisplay="Not available" values={costs([null, 600, 200, 100])} />);
    for (const unavailable of view.getAllByText("Not available")) expect(unavailable.props.numberOfLines).toBeUndefined();
  });
});
