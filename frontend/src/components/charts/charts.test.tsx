import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import { CategoryBarChart } from "./CategoryBarChart";
import { MeterChart } from "./MeterChart";
import { StackedBarChart } from "./StackedBarChart";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { WaterfallChart } from "./WaterfallChart";

const labels = ["1 Aug", "2 Aug", "3 Aug", "4 Aug"];
const series = [
  { key: "created", label: "Created", values: [2, 4, 3, 4] },
  { key: "completed", label: "Completed", values: [3, 1, 2, 1] }
];

const openTable = async (figure: HTMLElement) => {
  const user = userEvent.setup();
  await user.click(within(figure).getByRole("button", { name: "Show values" }));
  return within(figure).getByRole("table");
};

describe("chart primitives", () => {
  it("keeps every plotted value reachable in the table view, not only on hover", async () => {
    render(
      <TimeSeriesChart title="Projects created and completed" labels={labels} series={series} />
    );
    const figure = screen.getByRole("figure", { name: "Projects created and completed" });
    const table = await openTable(figure);

    for (const label of labels) {
      expect(within(table).getByRole("rowheader", { name: label })).toBeInTheDocument();
    }
    for (const column of ["Point", "Created", "Completed"]) {
      expect(within(table).getByRole("columnheader", { name: column })).toBeInTheDocument();
    }
    expect(within(table).getAllByRole("row")).toHaveLength(labels.length + 1);
  });

  it("names every series in a legend so identity never rests on colour alone", () => {
    render(<TimeSeriesChart title="Trend" labels={labels} series={series} />);
    const legend = within(screen.getByRole("figure", { name: "Trend" })).getByRole("list");
    expect(within(legend).getByText("Created")).toBeVisible();
    expect(within(legend).getByText("Completed")).toBeVisible();
  });

  it("omits the legend box for a single series, whose title already names it", () => {
    render(
      <StackedBarChart
        title="Only one"
        segments={[{ key: "one", label: "One", value: 4 }]}
      />
    );
    const figure = screen.getByRole("figure", { name: "Only one" });
    expect(within(figure).queryByRole("list")).not.toBeInTheDocument();
  });

  it("reads out each point on keyboard focus, matching what hover would show", async () => {
    const user = userEvent.setup();
    render(<TimeSeriesChart title="Trend" labels={labels} series={series} />);

    /* The table toggle comes first in the frame; the plot is the next stop. */
    await user.tab();
    await user.tab();
    await user.keyboard("{Home}");
    expect(screen.getByText("1 Aug: Created 2, Completed 3")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("2 Aug: Created 4, Completed 1")).toBeInTheDocument();
    await user.keyboard("{End}");
    expect(screen.getByText("4 Aug: Created 4, Completed 1")).toBeInTheDocument();
  });

  it("shows the verified reason instead of a plot, a table, or a fabricated zero", () => {
    render(
      <TimeSeriesChart
        title="Trend"
        labels={labels}
        series={series}
        unavailableReason="Lineage could not be verified."
      />
    );
    const figure = screen.getByRole("figure", { name: "Trend" });
    expect(within(figure).getByText("Lineage could not be verified.")).toBeVisible();
    expect(within(figure).queryByRole("button", { name: /values/i })).not.toBeInTheDocument();
    expect(within(figure).queryByRole("table")).not.toBeInTheDocument();
    expect(within(figure).queryByRole("img")).not.toBeInTheDocument();
  });

  it("distinguishes a verified empty from a suppressed metric", () => {
    render(
      <StackedBarChart
        title="Risk mix"
        segments={[{ key: "red", label: "Red risk", value: 0 }]}
        emptyMessage="No projects are tracked."
      />
    );
    const figure = screen.getByRole("figure", { name: "Risk mix" });
    expect(within(figure).getByText("No projects are tracked.")).toBeVisible();
    expect(within(figure).queryByText(/Not available/)).not.toBeInTheDocument();
    /* The values table stays available: an empty chart is still explainable. */
    expect(within(figure).getByRole("button", { name: "Show values" })).toBeVisible();
  });

  it("carries the share of the whole alongside every stacked value", async () => {
    render(
      <StackedBarChart
        title="Projects by stage"
        segments={[
          { key: "planning", label: "Planning", value: 25 },
          { key: "active", label: "Active", value: 75 }
        ]}
        totalLabel="Total"
      />
    );
    const table = await openTable(screen.getByRole("figure", { name: "Projects by stage" }));
    expect(within(table).getByRole("row", { name: "Planning 25 25%" })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: "Active 75 75%" })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: "Total 100 100%" })).toBeInTheDocument();
  });

  it("steps a waterfall through its running total and signs every change", async () => {
    render(
      <WaterfallChart
        title="Contract value to remaining budget"
        formatValue={(value) => `₹${value}`}
        steps={[
          { key: "contract", label: "Contract value", value: 100, type: "total" },
          { key: "gst", label: "GST", value: -18, type: "step" },
          { key: "net", label: "Net revenue", value: 82, type: "total" }
        ]}
      />
    );
    const figure = screen.getByRole("figure", { name: "Contract value to remaining budget" });
    /* Nothing adds here, so the legend never offers an "adds" swatch. */
    expect(within(figure).queryByText("Adds")).not.toBeInTheDocument();
    expect(within(figure).getByText("Subtracts")).toBeVisible();

    const table = await openTable(figure);
    expect(within(table).getByRole("row", { name: "GST −₹18 ₹82" })).toBeInTheDocument();
  });

  it("reports a meter's value to assistive technology, and suppresses it when unverified", () => {
    const { rerender } = render(
      <MeterChart label="Cost budget consumed" value={0.73} valueText="73%" />
    );
    const meter = screen.getByRole("meter", { name: "Cost budget consumed" });
    expect(meter).toHaveAttribute("aria-valuenow", "73");
    expect(meter).toHaveAttribute("aria-valuetext", "73%");

    rerender(
      <MeterChart
        label="Cost budget consumed"
        value={null}
        valueText="73%"
        unavailableReason="No authoritative denominator."
      />
    );
    const suppressed = screen.getByRole("meter", { name: "Cost budget consumed" });
    expect(suppressed).not.toHaveAttribute("aria-valuenow");
    expect(suppressed).toHaveAttribute("aria-valuetext", "Not available");
    expect(screen.getByText("No authoritative denominator.")).toBeVisible();
    expect(screen.queryByText("73%")).not.toBeInTheDocument();
  });

  it("names a bar chart's value column in both the plot and the table", async () => {
    render(
      <CategoryBarChart
        title="Active workers by trade"
        data={[
          { key: "electrician", label: "Electrician", value: 24 },
          { key: "plumber", label: "Plumber", value: 19 }
        ]}
        categoryColumnLabel="Trade"
        valueColumnLabel="Workers"
      />
    );
    const table = await openTable(screen.getByRole("figure", { name: "Active workers by trade" }));
    expect(within(table).getByRole("columnheader", { name: "Trade" })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: "Electrician 24" })).toBeInTheDocument();
  });

  it("passes an accessibility audit with the table view both closed and open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <main>
        <TimeSeriesChart title="Trend" labels={labels} series={series} />
        <CategoryBarChart
          title="By trade"
          data={[{ key: "a", label: "Electrician", value: 24 }]}
        />
        <StackedBarChart
          title="By stage"
          segments={[
            { key: "planning", label: "Planning", value: 25 },
            { key: "active", label: "Active", value: 75 }
          ]}
        />
        <MeterChart label="Consumed" value={0.4} valueText="40%" />
      </main>
    );

    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations)
      .toEqual([]);

    for (const toggle of screen.getAllByRole("button", { name: "Show values" })) {
      await user.click(toggle);
    }
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations)
      .toEqual([]);
  });
});
