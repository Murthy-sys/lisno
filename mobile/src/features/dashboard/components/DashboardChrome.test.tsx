import { fireEvent, render } from "@testing-library/react-native";

import {
  DashboardSelector,
  DashboardSkeleton,
  FactRail,
  OperationsHeader
} from "./DashboardChrome";

describe("dashboard chrome", () => {
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

    await fireEvent.press(view.getByRole("tab", { name: "90 days" }));
    await fireEvent.press(view.getByRole("switch", { name: "Compare with previous period" }));
    await fireEvent.press(view.getByRole("button", { name: "Refresh dashboard" }));

    expect(onPeriodChange).toHaveBeenCalledWith(90);
    expect(onComparisonChange).toHaveBeenCalledWith(false);
    expect(onRefresh).toHaveBeenCalledTimes(1);
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
