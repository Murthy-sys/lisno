import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { superAdminDashboardOverviewFixture } from "./dashboardFixtures";
import { DashboardModuleCharts } from "./DashboardModuleCharts";
import type {
  DashboardChartTheme,
  DashboardEChartOption,
  DashboardEChartProps
} from "./echarts/types";
import type {
  DashboardTab,
  SuperAdminDashboardOverview
} from "./superAdminDashboardApi";

const { capturedCharts } = vi.hoisted(() => ({
  capturedCharts: new Map<string, DashboardEChartProps>()
}));

vi.mock("./echarts/DashboardEChart", () => ({
  DashboardEChart: (props: DashboardEChartProps) => {
    capturedCharts.set(props.chartId, props);
    return (
      <div
        role="img"
        aria-label={props.description}
        data-testid="dashboard-echart"
        data-chart-id={props.chartId}
      />
    );
  }
}));

const chartTheme = {
  series: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"],
  ordinal: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
  status: {
    good: "#008000",
    warning: "#a06000",
    serious: "#c04000",
    critical: "#a00020",
    neutral: "#777777"
  },
  text: "#111111",
  mutedText: "#666666",
  grid: "#dddddd",
  track: "#eeeeee",
  surface: "#ffffff"
} satisfies DashboardChartTheme;

interface CapturedSeries {
  id: string;
  universalTransition?: boolean;
  data: Array<null | number | { name?: string; value?: unknown }>;
}

const optionFor = (chartId: string) => {
  const chart = capturedCharts.get(chartId);
  if (!chart) throw new Error(`Missing captured chart ${chartId}`);
  return chart.createOption(chartTheme) as DashboardEChartOption & {
    series: CapturedSeries[];
  };
};

const datumFor = (series: CapturedSeries[], seriesId: string, name: string) => {
  const match = series.find((entry) => entry.id === seriesId);
  if (!match) throw new Error(`Missing series ${seriesId}`);
  const datum = match.data.find(
    (entry): entry is { name: string; value?: unknown } =>
      typeof entry === "object" && entry !== null && entry.name === name
  );
  if (!datum) throw new Error(`Missing datum ${seriesId}/${name}`);
  return datum;
};

const plottedChartCounts: Array<[
  Exclude<DashboardTab, "overview">,
  number
]> = [
  ["projects", 4],
  ["estimation", 2],
  ["design", 1],
  ["procurement", 1],
  ["finance", 3],
  ["execution", 2],
  ["workforce", 2],
  ["risk", 2]
];

describe("DashboardModuleCharts", () => {
  beforeEach(() => capturedCharts.clear());

  it.each(plottedChartCounts)(
    "renders the %s module plots through the dashboard ECharts adapter",
    (tab, expectedCharts) => {
      render(
        <DashboardModuleCharts
          tab={tab}
          data={superAdminDashboardOverviewFixture}
        />
      );

      expect(screen.getAllByTestId("dashboard-echart")).toHaveLength(
        expectedCharts
      );
    }
  );

  it("keeps exact incurred-date finance values in semantic tables", async () => {
    const user = userEvent.setup();
    render(
      <DashboardModuleCharts
        tab="finance"
        data={superAdminDashboardOverviewFixture}
      />
    );

    expect(
      screen.queryByRole("heading", { name: "Expenses posted" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Recorded cost")).not.toBeInTheDocument();

    const expenseFigure = screen
      .getByRole("heading", { name: "Recorded expenses" })
      .closest("figure");
    expect(expenseFigure).not.toBeNull();
    expect(expenseFigure).toHaveTextContent("selected by incurred date");
    await user.click(
      within(expenseFigure!).getByRole("button", { name: "Show values" })
    );
    const expenseTable = within(expenseFigure!).getByRole("table");
    expect(
      within(expenseTable).getByRole("columnheader", { name: "Incurred date" })
    ).toBeVisible();
    expect(within(expenseTable).getByRole("rowheader", { name: "30 Aug 2026" }))
      .toBeVisible();
    expect(within(expenseTable).getByText("₹2,500.00")).toBeVisible();

    const waterfallFigure = screen
      .getByRole("heading", { name: "Contract value to remaining budget" })
      .closest("figure");
    expect(waterfallFigure).not.toBeNull();
    await user.click(
      within(waterfallFigure!).getByRole("button", { name: "Show values" })
    );
    const recordedRow = within(waterfallFigure!)
      .getByRole("rowheader", { name: "Recorded expenses" })
      .closest("tr");
    expect(recordedRow).not.toBeNull();
    expect(within(recordedRow!).getByText("−₹28,000.00")).toBeVisible();
    expect(within(recordedRow!).getByText("₹52,000.00")).toBeVisible();
  });

  it("suppresses an unavailable financial plot instead of drawing zeroes", () => {
    const data = structuredClone(
      superAdminDashboardOverviewFixture
    ) as SuperAdminDashboardOverview;
    data.dataQuality = {
      status: "partial",
      totalIssueCount: 1,
      unavailableMetricKeys: ["finance.recordedCostPaise"],
      issues: [{
        code: "finance_project_lineage_mismatch",
        metricKey: "finance.recordedCostPaise",
        message: "Recorded expense lineage could not be verified.",
        entityType: "finance_bucket",
        entityId: "bucket-1"
      }]
    };

    render(<DashboardModuleCharts tab="finance" data={data} />);

    const waterfallFigure = screen
      .getByRole("heading", { name: "Contract value to remaining budget" })
      .closest("figure");
    expect(waterfallFigure).not.toBeNull();
    expect(waterfallFigure).toHaveTextContent("Not available.");
    expect(waterfallFigure).toHaveTextContent(
      "Recorded expense lineage could not be verified."
    );
    expect(
      within(waterfallFigure!).queryByTestId("dashboard-echart")
    ).not.toBeInTheDocument();
    expect(
      within(waterfallFigure!).queryByRole("button", { name: "Show values" })
    ).not.toBeInTheDocument();
  });

  it("keeps verified empty categories distinct from unavailable data", () => {
    const data = structuredClone(
      superAdminDashboardOverviewFixture
    ) as SuperAdminDashboardOverview;
    data.risk.factorDistribution = [];

    render(<DashboardModuleCharts tab="risk" data={data} />);

    const riskFigure = screen
      .getByRole("heading", { name: "Risk factor occurrences" })
      .closest("figure");
    expect(riskFigure).not.toBeNull();
    expect(riskFigure).toHaveTextContent(
      "No eligible risk factors are currently tracked."
    );
    expect(riskFigure).not.toHaveTextContent("Not available.");
  });

  it("keys time-series transitions by UTC date across added, updated, and removed points", () => {
    const initial = structuredClone(
      superAdminDashboardOverviewFixture
    ) as SuperAdminDashboardOverview;
    initial.trends = [
      { ...initial.trends[0], date: "2026-08-29", projectsCreated: 2 },
      { ...initial.trends[0] }
    ];
    const { rerender } = render(
      <DashboardModuleCharts tab="projects" data={initial} />
    );

    const firstSeries = optionFor("dashboard-project-flow").series;
    expect(firstSeries.map((entry) => entry.id)).toEqual(["created", "completed"]);
    expect(firstSeries.every((entry) => entry.universalTransition === true)).toBe(true);
    expect(firstSeries[0].data).toEqual([
      expect.objectContaining({ name: "2026-08-29", value: 2 }),
      expect.objectContaining({ name: "2026-08-30", value: 1 })
    ]);

    const next = structuredClone(initial) as SuperAdminDashboardOverview;
    next.trends = [
      { ...initial.trends[1], projectsCreated: 7 },
      { ...initial.trends[1], date: "2026-08-31", projectsCreated: 3 }
    ];
    rerender(<DashboardModuleCharts tab="projects" data={next} />);

    const nextSeries = optionFor("dashboard-project-flow").series;
    expect(nextSeries.map((entry) => entry.id)).toEqual(["created", "completed"]);
    expect(nextSeries[0].data).toEqual([
      expect.objectContaining({ name: "2026-08-30", value: 7 }),
      expect.objectContaining({ name: "2026-08-31", value: 3 })
    ]);
  });

  it("uses semantic keys for pipeline, composition, and category transitions", () => {
    const { unmount } = render(
      <DashboardModuleCharts
        tab="estimation"
        data={superAdminDashboardOverviewFixture}
      />
    );
    const pipeline = optionFor("dashboard-estimation-pipeline").series;
    expect(pipeline.map((entry) => entry.id)).toEqual([
      "none",
      "draft",
      "ready",
      "awaiting",
      "changes",
      "approved"
    ]);
    expect(pipeline.every((entry) => entry.universalTransition === true)).toBe(true);
    expect(pipeline.map((entry) => entry.data[0])).toEqual([
      expect.objectContaining({ name: "none", value: 0 }),
      expect.objectContaining({ name: "draft", value: 0 }),
      expect.objectContaining({ name: "ready", value: 0 }),
      expect.objectContaining({ name: "awaiting", value: 1 }),
      expect.objectContaining({ name: "changes", value: 0 }),
      expect.objectContaining({ name: "approved", value: 1 })
    ]);

    unmount();
    render(
      <DashboardModuleCharts
        tab="finance"
        data={superAdminDashboardOverviewFixture}
      />
    );
    const composition = optionFor("dashboard-expense-composition").series;
    expect(composition.map((entry) => entry.id)).toEqual([
      "procurement",
      "employee",
      "other",
      "overhead"
    ]);
    expect(composition.every((entry) => entry.universalTransition === true)).toBe(true);
    expect(composition.map((entry) => entry.data[0])).toEqual([
      expect.objectContaining({ name: "procurement", value: 1_200_000 }),
      expect.objectContaining({ name: "employee", value: 900_000 }),
      expect.objectContaining({ name: "other", value: 400_000 }),
      expect.objectContaining({ name: "overhead", value: 300_000 })
    ]);
  });

  it("retains zero-valued pipeline marks for positive-to-zero transition continuity", () => {
    render(
      <DashboardModuleCharts
        tab="estimation"
        data={superAdminDashboardOverviewFixture}
      />
    );

    const pipeline = optionFor("dashboard-estimation-pipeline").series;
    expect(pipeline.find((entry) => entry.id === "none")).toMatchObject({
      id: "none",
      universalTransition: true,
      data: [expect.objectContaining({ name: "none", value: 0 })]
    });
    expect(pipeline.find((entry) => entry.id === "awaiting")).toMatchObject({
      id: "awaiting",
      universalTransition: true,
      data: [expect.objectContaining({ name: "awaiting", value: 1 })]
    });
  });

  it("keeps category identities stable as risk marks update and enter", () => {
    const initial = structuredClone(
      superAdminDashboardOverviewFixture
    ) as SuperAdminDashboardOverview;
    const { rerender } = render(
      <DashboardModuleCharts tab="risk" data={initial} />
    );
    expect(optionFor("dashboard-risk-factor-occurrences").series[0]).toMatchObject({
      id: "categories",
      universalTransition: true,
      data: [expect.objectContaining({
        name: "schedule-red-project_deadline_overdue",
        value: 2
      })]
    });

    const next = structuredClone(initial) as SuperAdminDashboardOverview;
    next.risk.factorDistribution = [
      { ...next.risk.factorDistribution[0], occurrenceCount: 5 },
      {
        kind: "finance",
        level: "yellow",
        reasonCode: "cost_budget_headroom_low",
        occurrenceCount: 1,
        projectCount: 1
      }
    ];
    rerender(<DashboardModuleCharts tab="risk" data={next} />);

    expect(optionFor("dashboard-risk-factor-occurrences").series[0].data).toEqual([
      expect.objectContaining({
        name: "schedule-red-project_deadline_overdue",
        value: 5
      }),
      expect.objectContaining({
        name: "finance-yellow-cost_budget_headroom_low",
        value: 1
      })
    ]);
  });

  it("preserves waterfall reconciliation while naming every transition mark", () => {
    render(
      <DashboardModuleCharts
        tab="finance"
        data={superAdminDashboardOverviewFixture}
      />
    );
    const waterfall = optionFor("dashboard-finance-waterfall").series;
    const stepKeys = [
      "contract",
      "gst",
      "net",
      "profit",
      "budget",
      "recorded",
      "remaining"
    ];

    expect(waterfall.map((entry) => entry.id)).toEqual([
      "waterfall-offset",
      "waterfall-total",
      "waterfall-increase",
      "waterfall-decrease"
    ]);
    expect(waterfall.every((entry) => entry.universalTransition === true)).toBe(true);
    for (const series of waterfall) {
      expect(series.data.map((entry) =>
        typeof entry === "object" && entry !== null ? entry.name : undefined
      )).toEqual(stepKeys);
    }
    expect(datumFor(waterfall, "waterfall-total", "remaining").value).toBe(5_200_000);
    expect(datumFor(waterfall, "waterfall-decrease", "recorded").value).toBe(2_800_000);
    expect(datumFor(waterfall, "waterfall-offset", "recorded").value).toBe(5_200_000);
    expect(
      Number(datumFor(waterfall, "waterfall-offset", "recorded").value) +
      Number(datumFor(waterfall, "waterfall-decrease", "recorded").value)
    ).toBe(8_000_000);
  });
});
