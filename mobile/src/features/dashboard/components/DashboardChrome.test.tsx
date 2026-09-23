import { fireEvent, render } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import { StyleSheet } from "react-native";

import {
  AvailabilityBanner,
  DashboardSelector,
  DashboardSkeleton,
  FactRail,
  OperationsHeader
} from "./DashboardChrome";

const reportingProps = {
  comparisonEnabled: true,
  currentRangeLabel: "25 Aug 2026 – 23 Sep 2026",
  previousRangeLabel: "26 Jul 2026 – 24 Aug 2026",
  observedLabel: "23 Sep 2026, 18:14 UTC",
  rangeLabel: "Current and previous reporting windows",
  qualityStatus: "partial" as const,
  qualityDetail: "Some sources are unavailable.",
  refreshing: false,
  period: 30 as const,
  onPeriodChange: jest.fn(),
  onComparisonChange: jest.fn(),
  onRefresh: jest.fn()
};

describe("dashboard chrome", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });
  it("exposes reporting controls and their state through native semantics", async () => {
    const onPeriodChange = jest.fn();
    const onComparisonChange = jest.fn();
    const onRefresh = jest.fn();
    const view = await render(
      <OperationsHeader
        comparisonEnabled
        observedLabel="Observed 22 Sep, 10:30 UTC"
        onComparisonChange={onComparisonChange}
        onPeriodChange={onPeriodChange}
        onRefresh={onRefresh}
        period={30}
        qualityDetail="Some sources are unavailable."
        qualityStatus="partial"
        rangeLabel="Current 24 Aug–22 Sep · final day is partial"
        refreshing={false}
      />
    );

    expect(view.getByRole("header", { name: "Executive dashboard" })).toBeTruthy();
    expect(view.getByRole("tab", { name: "30 days" }).props.accessibilityState).toEqual({ selected: true });
    expect(view.getByRole("switch", { name: "Compare with previous period" }).props.accessibilityState).toEqual({ checked: true });
    expect(view.getByLabelText(/Partial coverage/)).toBeTruthy();
    expect(StyleSheet.flatten(view.getByRole("button", { name: "Refresh dashboard" }).props.style)).toEqual(expect.objectContaining({ width: 48, height: 48 }));
    for (const days of [7, 30, 90]) {
      expect(StyleSheet.flatten(view.getByRole("tab", { name: `${days} days` }).props.style).minHeight).toBeGreaterThanOrEqual(48);
    }

    await fireEvent.press(view.getByRole("tab", { name: "90 days" }));
    await fireEvent.press(view.getByRole("switch", { name: "Compare with previous period" }));
    await fireEvent.press(view.getByRole("button", { name: "Refresh dashboard" }));

    expect(onPeriodChange).toHaveBeenCalledWith(90);
    expect(onComparisonChange).toHaveBeenCalledWith(false);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows real reporting ranges, the greeting and UTC partial-day context", async () => {
    const view = await render(<OperationsHeader {...reportingProps} greeting="Good evening, Aditi" partialFinalDay />);

    expect(view.getByText("Good evening, Aditi")).toBeTruthy();
    expect(view.getByText(reportingProps.currentRangeLabel).props.numberOfLines).toBeUndefined();
    expect(view.getByText(`Prev: ${reportingProps.previousRangeLabel}`).props.numberOfLines).toBeUndefined();
    expect(view.getByText(reportingProps.observedLabel)).toBeTruthy();
    expect(view.getByText("Last updated")).toBeTruthy();
    expect(view.getByText("Times in UTC · Final day is partial")).toBeTruthy();
    expect(view.getByLabelText(/Partial coverage.*Some sources are unavailable.*Final day is partial/)).toBeTruthy();

    await view.rerender(<OperationsHeader {...reportingProps} comparisonEnabled={false} />);
    expect(view.queryByText(`Prev: ${reportingProps.previousRangeLabel}`)).toBeNull();
    expect(view.getByText(reportingProps.currentRangeLabel)).toBeTruthy();
    expect(view.getByText("Times in UTC")).toBeTruthy();
    expect(view.queryByText("Good evening, Aditi")).toBeNull();
  });

  it("prevents duplicate refresh while a refresh is running", async () => {
    const onRefresh = jest.fn();
    const view = await render(<OperationsHeader {...reportingProps} onRefresh={onRefresh} refreshing />);
    const button = view.getByRole("button", { name: "Refresh dashboard" });

    expect(button.props.accessibilityState).toEqual({ busy: true, disabled: true });
    await fireEvent.press(button);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it.each([
    { width: 360, fontScale: 1 },
    { width: 411, fontScale: 1.5 }
  ])("reflows dates and refresh controls at $width dp and font scale $fontScale", async ({ width, fontScale }) => {
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({ width, height: 800, scale: 3, fontScale });
    const view = await render(<OperationsHeader {...reportingProps} />);

    for (const testID of ["dashboard-reporting-dates", "dashboard-reporting-updates"]) {
      expect(StyleSheet.flatten(view.getByTestId(testID).props.style).flexDirection).toBe("column");
    }
    expect(view.getByText(reportingProps.currentRangeLabel).props.numberOfLines).toBeUndefined();
    expect(view.getByText(reportingProps.observedLabel).props.numberOfLines).toBeUndefined();
    expect(view.getByRole("switch", { name: "Compare with previous period" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Refresh dashboard" })).toBeTruthy();
  });

  it("offers a coverage detail action only when it can perform an action", async () => {
    const onAction = jest.fn();
    const view = await render(<AvailabilityBanner actionLabel="View details" message="53 metrics are unavailable or partial." onAction={onAction} title="Partial coverage" />);

    expect(view.getByText("53 metrics are unavailable or partial.")).toBeTruthy();
    const action = view.getByRole("button", { name: "View details" });
    expect(StyleSheet.flatten(action.props.style).minHeight).toBeGreaterThanOrEqual(48);
    await fireEvent.press(action);
    expect(onAction).toHaveBeenCalledTimes(1);

    await view.rerender(<AvailabilityBanner actionLabel="View details" message="Sources are unavailable." title="Unavailable" tone="unavailable" />);
    expect(view.queryByRole("button")).toBeNull();
    expect(view.getByText("Sources are unavailable.")).toBeTruthy();
  });

  it("keeps fact rails and selectors readable without chart interaction", async () => {
    const onSelect = jest.fn();
    const view = await render(
      <>
        <FactRail
          facts={[
            { label: "Active", value: "6" },
            { label: "At risk", value: "2", tone: "danger" }
          ]}
          headline="12"
          headlineLabel="stored projects"
          title="Projects"
        />
        <DashboardSelector
          accessibilityLabel="Dashboard module"
          items={[
            { id: "overview", label: "Overview" },
            { id: "capital", label: "Capital", available: false }
          ]}
          onSelect={onSelect}
          selected="overview"
        />
      </>
    );

    expect(view.getByText("12")).toBeTruthy();
    expect(view.getByText("At risk")).toBeTruthy();
    expect(view.getByRole("tab", { name: "Overview" }).props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(view.getByRole("tab", { name: "Capital" }).props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(StyleSheet.flatten(view.getByRole("tab", { name: "Capital" }).props.style).minHeight).toBeGreaterThanOrEqual(48);

    await fireEvent.press(view.getByRole("tab", { name: "Overview" }));
    expect(onSelect).toHaveBeenCalledWith("overview");
    await fireEvent.press(view.getByRole("tab", { name: "Capital" }));
    expect(onSelect).toHaveBeenCalledWith("capital");
  });

  it("uses a semantic progress state without fabricated values", async () => {
    const view = await render(<DashboardSkeleton />);

    expect(view.getByLabelText("Loading dashboard").props.accessibilityRole).toBe("progressbar");
    expect(view.queryByText(/[0-9]+%/)).toBeNull();
  });
});
