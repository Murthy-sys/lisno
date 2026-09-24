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
  period: 30 as const,
  onPeriodChange: jest.fn()
};

describe("dashboard chrome", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });
  it("renders only a 7D / 30D / 1Y period selector with native tab semantics", async () => {
    const onPeriodChange = jest.fn();
    const view = await render(<OperationsHeader onPeriodChange={onPeriodChange} period={30} />);

    expect(view.getByRole("header", { name: "Executive dashboard" })).toBeTruthy();
    const tablist = view.getByTestId("dashboard-period-selector");
    expect(tablist.props).toEqual(expect.objectContaining({ accessibilityRole: "tablist", accessibilityLabel: "Reporting period" }));

    const tabs = view.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual(["7 days", "30 days", "1 year"]);
    expect(["7D", "30D", "1Y"].map((label) => view.getByText(label))).toHaveLength(3);
    expect(view.getByRole("tab", { name: "30 days" }).props.accessibilityState).toEqual({ selected: true });
    expect(view.getByRole("tab", { name: "7 days" }).props.accessibilityState).toEqual({ selected: false });
    expect(view.getByRole("tab", { name: "1 year" }).props.accessibilityState).toEqual({ selected: false });
    expect(view.queryByRole("tab", { name: "90 days" })).toBeNull();

    await fireEvent.press(view.getByRole("tab", { name: "1 year" }));
    expect(onPeriodChange).toHaveBeenCalledWith(365);
    await fireEvent.press(view.getByRole("tab", { name: "7 days" }));
    expect(onPeriodChange).toHaveBeenCalledWith(7);

    await view.rerender(<OperationsHeader onPeriodChange={onPeriodChange} period={365} />);
    expect(view.getByRole("tab", { name: "1 year" }).props.accessibilityState).toEqual({ selected: true });
    expect(view.getByRole("tab", { name: "30 days" }).props.accessibilityState).toEqual({ selected: false });
  });

  it("removes range, UTC, comparison, refresh and last-updated chrome", async () => {
    const view = await render(<OperationsHeader {...reportingProps} greeting="Good evening, Aditi" />);

    expect(view.getByText("Good evening, Aditi")).toBeTruthy();
    expect(view.queryByText(/Compare periods/)).toBeNull();
    expect(view.queryByRole("switch")).toBeNull();
    expect(view.queryByLabelText("Refresh dashboard")).toBeNull();
    expect(view.queryByRole("button")).toBeNull();
    expect(view.queryByText(/Last updated/)).toBeNull();
    expect(view.queryByText(/Times in UTC/)).toBeNull();
    expect(view.queryByText(/Prev:/)).toBeNull();

    await view.rerender(<OperationsHeader {...reportingProps} />);
    expect(view.queryByText("Good evening, Aditi")).toBeNull();
  });

  it.each([
    { width: 320, fontScale: 1 },
    { width: 360, fontScale: 2 }
  ])("keeps three equal single-line segments at $width dp and font scale $fontScale", async ({ width, fontScale }) => {
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({ width, height: 800, scale: 3, fontScale });
    const view = await render(<OperationsHeader {...reportingProps} />);

    const track = StyleSheet.flatten(view.getByTestId("dashboard-period-selector").props.style);
    expect(track).toEqual(expect.objectContaining({ flexDirection: "row", alignSelf: "stretch", padding: 4, gap: 4, borderRadius: 14 }));
    expect(track.borderWidth).toBeUndefined();
    for (const tab of view.getAllByRole("tab")) {
      const style = StyleSheet.flatten(tab.props.style);
      expect(style).toEqual(expect.objectContaining({ flex: 1, minWidth: 0, minHeight: 44 }));
    }
    for (const label of ["7D", "30D", "1Y"]) {
      expect(view.getByText(label).props).toEqual(expect.objectContaining({
        numberOfLines: 1,
        adjustsFontSizeToFit: true,
        minimumFontScale: 0.8
      }));
    }
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
