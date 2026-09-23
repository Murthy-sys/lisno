import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { superAdminDashboardOverviewFixture } from "./dashboardFixtures";
import { DashboardModuleCharts } from "./DashboardModuleCharts";
import { GrowthComparisonChart } from "./DashboardOverviewCharts";
import { topLevelSeriesAreSpatial } from "./echarts/spatialScenes";
import type {
  DashboardChartTheme,
  DashboardEChartOption,
  DashboardEChartProps
} from "./echarts/types";
import type { DashboardTab, SuperAdminDashboardOverview } from "./superAdminDashboardApi";

const { capturedCharts } = vi.hoisted(() => ({
  capturedCharts: new Map<string, DashboardEChartProps>()
}));

vi.mock("./echarts/DashboardEChart", () => ({
  DashboardEChart: (props: DashboardEChartProps) => {
    capturedCharts.set(props.chartId, props);
    return <div role="img" aria-label={props.description} data-testid="dashboard-echart" data-chart-id={props.chartId} />;
  }
}));

const chartTheme = {
  series: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"],
  ordinal: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
  status: { good: "#008000", warning: "#a06000", serious: "#c04000", critical: "#a00020", neutral: "#777777" },
  text: "#111111",
  mutedText: "#666666",
  grid: "#dddddd",
  track: "#eeeeee",
  surface: "#ffffff",
  spatial: { field: "#17122f", plane: "#312951", line: "#736aa0", text: "#f7f4ff", muted: "#bbb4d1", gold: "#f4c84b", cyan: "#29d5c6" }
} satisfies DashboardChartTheme;

type CapturedDatum = { id?: string; name?: string; groupId?: string; value?: unknown; available?: boolean };
type CapturedSeries = { id?: string; type?: string; universalTransition?: unknown; data?: CapturedDatum[] };

const optionFor = (chartId: string) => {
  const chart = capturedCharts.get(chartId);
  if (!chart) throw new Error(`Missing captured chart ${chartId}`);
  return chart.createOption(chartTheme) as DashboardEChartOption & { series: CapturedSeries[] };
};

const plottedChartCounts: Array<[Exclude<DashboardTab, "overview">, number]> = [
  ["projects", 4],
  ["estimation", 2],
  ["design", 2],
  ["procurement", 2],
  ["finance", 5],
  ["execution", 4],
  ["workforce", 4],
  ["risk", 2]
];

describe("DashboardModuleCharts spatial atlas", () => {
  beforeEach(() => capturedCharts.clear());

  it.each(plottedChartCounts)("renders every %s analytical scene through the lazy ECharts adapter", (tab, expectedCharts) => {
    render(<DashboardModuleCharts tab={tab} data={superAdminDashboardOverviewFixture} />);
    expect(screen.getAllByTestId("dashboard-echart")).toHaveLength(expectedCharts);
  });

  it.each(plottedChartCounts)("uses only custom top-level series in the %s module", (tab) => {
    render(<DashboardModuleCharts tab={tab} data={superAdminDashboardOverviewFixture} />);
    for (const chart of capturedCharts.values()) {
      const option = chart.createOption(chartTheme);
      expect(topLevelSeriesAreSpatial(option), chart.chartId).toBe(true);
      const series = (option as { series?: Array<{ type?: string }> }).series ?? [];
      expect(series.every((entry) => entry.type === "custom"), chart.chartId).toBe(true);
    }
  });

  it("maps design, execution, and workforce to their required scene families", () => {
    const expected: Array<[Exclude<DashboardTab, "overview">, string]> = [
      ["design", "dashboard-design-approval-trend"],
      ["execution", "dashboard-execution-completion-trend"],
      ["workforce", "dashboard-governance-topology"]
    ];
    for (const [tab, chartId] of expected) {
      const view = render(<DashboardModuleCharts tab={tab} data={superAdminDashboardOverviewFixture} />);
      expect(capturedCharts.has(chartId)).toBe(true);
      view.unmount();
      capturedCharts.clear();
    }
  });

  it("keeps the existing exact incurred-date and reconciliation tables", async () => {
    const user = userEvent.setup();
    render(<DashboardModuleCharts tab="finance" data={superAdminDashboardOverviewFixture} />);

    const expenseFigure = screen.getByRole("heading", { name: "Recorded expenses" }).closest("figure")!;
    expect(expenseFigure).toHaveTextContent("incurred date");
    await user.click(within(expenseFigure).getByRole("button", { name: "Show values" }));
    const expenseTable = within(expenseFigure).getByRole("table");
    expect(within(expenseTable).getByRole("columnheader", { name: "Incurred date" })).toBeVisible();
    expect(within(expenseTable).getByRole("rowheader", { name: "30 Aug 2026" })).toBeVisible();
    expect(within(expenseTable).getByText("₹2,500.00")).toBeVisible();

    const capitalFigure = screen.getByRole("heading", { name: "Approved value and cost lineage" }).closest("figure")!;
    await user.click(within(capitalFigure).getByRole("button", { name: "Show values" }));
    const recordedRow = within(capitalFigure).getByRole("rowheader", { name: "Recorded cost" }).closest("tr")!;
    const remainingRow = within(capitalFigure).getByRole("rowheader", { name: "Remaining budget" }).closest("tr")!;
    const currentProfitRow = within(capitalFigure).getByRole("rowheader", { name: "Current profit" }).closest("tr")!;
    expect(recordedRow).toHaveTextContent("₹28,000.00");
    expect(recordedRow).toHaveTextContent("−₹28,000.00");
    expect(recordedRow).toHaveTextContent("₹52,000.00");
    expect(remainingRow).toHaveTextContent("₹52,000.00");
    expect(currentProfitRow).toHaveTextContent("₹72,000.00");
  });

  it("suppresses an unavailable capital scene instead of manufacturing zero", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
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
    const figure = screen.getByRole("heading", { name: "Approved value and cost lineage" }).closest("figure")!;
    expect(figure).toHaveTextContent("Not available.");
    expect(figure).toHaveTextContent("Recorded expense lineage could not be verified.");
    expect(within(figure).queryByTestId("dashboard-echart")).not.toBeInTheDocument();
  });

  it("renders verified zero corridor anchors instead of an empty placeholder", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
    Object.assign(data.estimation, {
      noEstimate: 0,
      draftInternal: 0,
      readyToSend: 0,
      awaitingClient: 0,
      changesRequested: 0,
      clientApproved: 0
    });
    render(<DashboardModuleCharts tab="estimation" data={data} />);
    const figure = screen.getByRole("heading", { name: "Estimate stage field" }).closest("figure")!;
    expect(within(figure).getByTestId("dashboard-echart")).toBeVisible();
    const dataItems = optionFor("dashboard-estimation-corridor").series[0].data ?? [];
    expect(dataItems).toHaveLength(6);
    expect(dataItems.every((datum) => Array.isArray(datum.value) && datum.value[0] === 0)).toBe(true);
  });

  it("keeps temporal IDs keyed by UTC date while values and membership change", () => {
    const initial = structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
    initial.trends = [
      { ...initial.trends[0], date: "2026-08-29", projectsCreated: 2 },
      { ...initial.trends[0] }
    ];
    const { rerender } = render(<DashboardModuleCharts tab="projects" data={initial} />);
    const first = optionFor("dashboard-project-flow").series;
    expect(first.map((series) => series.id)).toEqual(["created", "completed"]);
    expect(first[0].data?.map((datum) => datum.name)).toEqual(["2026-08-29", "2026-08-30"]);

    const next = structuredClone(initial) as SuperAdminDashboardOverview;
    next.trends = [
      { ...initial.trends[1], projectsCreated: 7 },
      { ...initial.trends[1], date: "2026-08-31", projectsCreated: 3 }
    ];
    rerender(<DashboardModuleCharts tab="projects" data={next} />);
    expect(optionFor("dashboard-project-flow").series[0].data?.map((datum) => datum.name))
      .toEqual(["2026-08-30", "2026-08-31"]);
  });

  it("keeps current comparison magnitude geometry fixed when the larger previous lane hides", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
    const comparison = data.comparison!;
    comparison.metrics.projects_created = {
      ...comparison.metrics.projects_created,
      current: 2,
      previous: 20,
      delta: -18
    };
    comparison.currentBuckets = comparison.currentBuckets.map((bucket) => ({ ...bucket, projectsCreated: 2 }));
    comparison.previousBuckets = comparison.previousBuckets.map((bucket) => ({ ...bucket, projectsCreated: 20 }));

    const view = render(<GrowthComparisonChart data={data} showComparison />);
    const pairedConstellation = optionFor("dashboard-operations-constellation");
    const pairedRibbon = optionFor("dashboard-growth-ribbon");
    view.rerender(<GrowthComparisonChart data={data} showComparison={false} />);
    const currentConstellation = optionFor("dashboard-operations-constellation");
    const currentRibbon = optionFor("dashboard-growth-ribbon");

    type RenderedChild = { name?: string; shape?: Record<string, number> };
    type RenderedGroup = { children: RenderedChild[] };
    type RenderSeries = CapturedSeries & { renderItem?: (params: unknown, api: unknown) => RenderedGroup };
    const shape = (option: DashboardEChartOption & { series: RenderSeries[] }, seriesId: string, suffix: string) => {
      const series = option.series.find((entry) => entry.id === seriesId)!;
      const group = series.renderItem!({ dataIndex: 0 }, { getWidth: () => 640, getHeight: () => 320, font: () => "10px sans-serif" });
      return group.children.find((child) => child.name?.endsWith(suffix))?.shape;
    };
    expect(shape(currentConstellation, "dashboard-operations-constellation", "--orb"))
      .toEqual(shape(pairedConstellation, "dashboard-operations-constellation", "--orb"));
    expect(shape(currentRibbon, "current-period", "--vertex"))
      .toEqual(shape(pairedRibbon, "current-period", "--vertex"));
  });

  it("uses stable backend keys for delivery waypoints and retains zero marks", () => {
    render(<DashboardModuleCharts tab="estimation" data={superAdminDashboardOverviewFixture} />);
    const series = optionFor("dashboard-estimation-corridor").series[0];
    expect(series.id).toBe("dashboard-estimation-corridor");
    expect(series.universalTransition).toBe(true);
    expect(series.data?.map((datum) => datum.name)).toEqual(["none", "draft", "ready", "awaiting", "changes", "approved"]);
    expect(series.data?.map((datum) => Array.isArray(datum.value) ? datum.value[0] : undefined)).toEqual([0, 0, 0, 1, 0, 1]);
  });

  it("preserves the two finance reconciliations and context-only GST/contract nodes", () => {
    render(<DashboardModuleCharts tab="finance" data={superAdminDashboardOverviewFixture} />);
    const data = optionFor("dashboard-finance-capital-flow").series[0].data ?? [];
    const value = (name: string) => {
      const datum = data.find((candidate) => candidate.name === name);
      return Array.isArray(datum?.value) ? Number(datum.value[0]) : NaN;
    };
    expect(value("net")).toBe(value("target-profit") + value("budget"));
    expect(value("budget")).toBe(value("recorded") + value("remaining"));
    expect(value("current-profit")).toBe(value("net") - value("recorded"));
    expect(data.find((datum) => datum.name === "contract")?.groupId).toBe("finance.approvedContractTotalPaise");
    expect(data.find((datum) => datum.name === "gst")?.groupId).toBe("finance.approvedGstPaise");
  });

  it("keeps risk reason identities and severity separate from project topology", () => {
    render(<DashboardModuleCharts tab="risk" data={superAdminDashboardOverviewFixture} />);
    const risk = optionFor("dashboard-risk-factor-occurrences").series[0];
    expect(risk.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "schedule-red-project_deadline_overdue",
        groupId: "risk.factorDistribution.schedule.project_deadline_overdue"
      })
    ]));
    expect(capturedCharts.get("dashboard-risk-factor-occurrences")?.description).toContain("Orb area");
  });

  it("keeps governance sources independently addressable and unavailable", () => {
    const data = structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
    data.dataQuality = {
      status: "partial",
      totalIssueCount: 1,
      unavailableMetricKeys: ["governance.failedClientDeliveries"],
      issues: [{
        code: "module_aggregate_unavailable",
        metricKey: "governance.failedClientDeliveries",
        message: "Client delivery failures could not be verified.",
        entityType: null,
        entityId: null
      }]
    };
    render(<DashboardModuleCharts tab="workforce" data={data} />);
    const option = optionFor("dashboard-governance-topology");
    const failedClient = option.series[0].data?.find((datum) => datum.groupId === "governance.failedClientDeliveries");
    const failedDesign = option.series[0].data?.find((datum) => datum.groupId === "governance.failedDesignDeliveries");
    expect(failedClient).toMatchObject({ available: false });
    expect(failedDesign).toMatchObject({ available: true });
    expect(option.series[0].data?.some((datum) => datum.groupId === "governance.failedDeliveries")).toBe(false);
  });

  it("replaces rectangular gauges with calibrated custom spatial paths", () => {
    render(<DashboardModuleCharts tab="finance" data={superAdminDashboardOverviewFixture} />);
    for (const id of ["dashboard-budget-consumption-path", "dashboard-margin-path"]) {
      const option = optionFor(id);
      expect(option.series).toHaveLength(1);
      expect(option.series[0]).toMatchObject({ id, type: "custom", universalTransition: true });
      expect(capturedCharts.get(id)?.description).toContain("Calibrated spatial checkpoint");
    }
  });
});
