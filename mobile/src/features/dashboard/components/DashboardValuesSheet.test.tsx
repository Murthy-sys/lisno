import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { DashboardValuesSheet } from "./DashboardValuesSheet";

describe("DashboardValuesSheet", () => {
  it("provides exact values and an explicit unavailable state", async () => {
    const onRequestClose = jest.fn();
    const view = await render(
      <DashboardValuesSheet
        groups={[
          {
            id: "projects",
            title: "Projects",
            description: "Current stored state",
            rows: [
              { id: "total", label: "All projects", value: "12", unit: "count", timeBasis: "snapshot" },
              {
                id: "history",
                label: "Previous period · 2026-09-15 UTC",
                value: "Not available",
                detail: "Source unavailable",
                unit: "count",
                timeBasis: "utc_day",
                unavailable: true
              }
            ]
          }
        ]}
        observedLabel="Observed 22 Sep, 10:30 UTC"
        onRequestClose={onRequestClose}
        rangeLabel="Current 24 Aug–22 Sep"
        visible
      />
    );

    expect(view.getByRole("header", { name: "Dashboard ledger" })).toBeTruthy();
    expect(view.getByLabelText("All projects: 12. Unit: Count · Time basis: Current stored snapshot")).toBeTruthy();
    expect(view.getByLabelText(
      "Previous period · 2026-09-15 UTC: Not available. Unit: Count · Time basis: UTC calendar day. Source unavailable"
    )).toBeTruthy();
    expect(view.getByText("Unit: Count · Time basis: UTC calendar day")).toBeTruthy();
    expect(StyleSheet.flatten(view.getByText("Unit: Count · Time basis: UTC calendar day").props.style).fontSize).toBeGreaterThanOrEqual(12);
    expect(StyleSheet.flatten(view.getByRole("button", { name: "Close dashboard values" }).props.style)).toEqual(expect.objectContaining({ width: 48, height: 48 }));

    await fireEvent.press(view.getByRole("button", { name: "Close dashboard values" }));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("does not expose value content while closed", async () => {
    const view = await render(
      <DashboardValuesSheet
        groups={[]}
        observedLabel="Observed now"
        onRequestClose={jest.fn()}
        rangeLabel="Current range"
        visible={false}
      />
    );

    expect(view.queryByRole("header", { name: "Dashboard ledger" })).toBeNull();
  });
});
