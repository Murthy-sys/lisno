import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { superAdminDashboardOverviewFixture } from "./dashboardFixtures";
import { DashboardModuleCharts } from "./DashboardModuleCharts";
import { GrowthComparisonChart } from "./DashboardOverviewCharts";
import { ClientBreakdownChart, RecordedCostActivityChart } from "./ExecutiveDashboardCharts";
import { getDashboardChartDatasets, getDashboardChartTables } from "./dashboardChartData";
import type { DashboardChartTheme, DashboardEChartOption, DashboardEChartProps } from "./echarts/types";
import type { DashboardTab, SuperAdminDashboardOverview } from "./superAdminDashboardApi";

const { capturedCharts } = vi.hoisted(() => ({ capturedCharts: new Map<string, DashboardEChartProps>() }));
vi.mock("./echarts/DashboardEChart", () => ({ DashboardEChart: (props: DashboardEChartProps) => {
  capturedCharts.set(props.chartId, props);
  return <div role="img" aria-label={props.description} data-testid="dashboard-echart" />;
} }));
const chartTheme = {
  series: ["#168d53", "#717b75", "#9da5a0", "#ccd1ce"], ordinal: ["#168d53", "#717b75", "#9da5a0", "#ccd1ce"],
  status: { good: "#168d53", warning: "#a06000", serious: "#c04000", critical: "#a00020", neutral: "#777777" },
  text: "#111111", mutedText: "#666666", grid: "#dddddd", track: "#eeeeee", surface: "#fafbf9",
  spatial: { field: "#17122f", plane: "#312951", line: "#736aa0", text: "#f7f4ff", muted: "#bbb4d1", gold: "#f4c84b", cyan: "#29d5c6" }
} satisfies DashboardChartTheme;
type CapturedDatum = { id?: string; name?: string; groupId?: string; value?: unknown };
type CapturedSeries = { id?: string; type?: string; data?: CapturedDatum[] };
const optionFor = (id: string) => capturedCharts.get(id)!.createOption(chartTheme) as DashboardEChartOption & { series: CapturedSeries[] };
const tabs: Array<Exclude<DashboardTab, "overview">> = ["projects", "estimation", "design", "procurement", "finance", "execution", "workforce", "risk"];
const fixture = () => structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
const unavailable = (data: SuperAdminDashboardOverview, metricKey: string, message = "Source could not be verified.") => {
  data.dataQuality = { status: "partial", totalIssueCount: 1, unavailableMetricKeys: [metricKey], issues: [{ code: "module_aggregate_unavailable", metricKey, message, entityId: null, entityType: null }] };
};

describe("dashboard conventional analytical charts", () => {
  beforeEach(() => capturedCharts.clear());
  it.each(tabs)("renders %s as two primary charts with accessible supplementary analysis", (tab) => {
    const view = render(<DashboardModuleCharts tab={tab} data={fixture()} />);
    expect(within(view.container.querySelector(".dashboard-reference-chart-row") as HTMLElement).getAllByRole("img")).toHaveLength(2);
    for (const chart of capturedCharts.values()) {
      expect(chart.motion).toBe("disabled");
      expect(optionFor(chart.chartId).series.every((series) => ["bar", "line", "pie"].includes(series.type!))).toBe(true);
      expect(chart.interaction?.items.length).toBeGreaterThan(0);
    }
  });

  it("keeps exact expense dates and reconciled signed finance rows", async () => {
    const user = userEvent.setup();
    render(<DashboardModuleCharts tab="finance" data={fixture()} />);
    const expense = screen.getByRole("heading", { name: "Recorded expenses over time" }).closest("figure")!;
    await user.click(within(expense).getByRole("button", { name: "Show values" }));
    expect(within(expense).getByRole("columnheader", { name: "Incurred date (UTC)" })).toBeVisible();
    expect(within(expense).getByRole("rowheader", { name: "2026-08-30" })).toBeVisible();
    expect(expense).toHaveTextContent("₹2,500.00");
    await user.click(screen.getByText("More analysis"));
    const reconciliation = screen.getByRole("heading", { name: "Approved value and cost reconciliation" }).closest("figure")!;
    await user.click(within(reconciliation).getByRole("button", { name: "Show values" }));
    expect(within(reconciliation).getByRole("rowheader", { name: "Recorded expenses" }).closest("tr")).toHaveTextContent("₹28,000.00");
    expect(within(reconciliation).getByRole("rowheader", { name: "Remaining budget" }).closest("tr")).toHaveTextContent("₹52,000.00");
    expect(within(reconciliation).getByRole("rowheader", { name: "Current profit" }).closest("tr")).toHaveTextContent("₹72,000.00");
  });

  it("preserves healthy series when another event source is unavailable", async () => {
    const data = fixture();
    unavailable(data, "trends.projectsCompleted", "Completion history is unavailable.");
    render(<DashboardModuleCharts tab="projects" data={data} />);
    const series = optionFor("dashboard-project-flow").series;
    expect(series).toHaveLength(1);
    expect(series[0].id).toBe("created");
    expect(series[0].data?.[0].value).toBe(data.trends[0].projectsCreated);
    expect(screen.queryByText(/Completion history is unavailable/)).not.toBeInTheDocument();
    expect(capturedCharts.get("dashboard-project-flow")?.interaction?.items.map((item) => item.id)).toEqual([data.trends[0].date]);
  });

  it("keeps verified zero status bars while an empty Client donut has no invented segment", () => {
    const data = fixture();
    Object.assign(data.estimation, { noEstimate: 0, draftInternal: 0, readyToSend: 0, awaitingClient: 0, changesRequested: 0, clientApproved: 0 });
    const view = render(<DashboardModuleCharts tab="estimation" data={data} />);
    expect(optionFor("dashboard-estimation-status").series[0].data?.map((row) => row.value)).toEqual([0, 0, 0, 0, 0, 0]);
    view.unmount();
    data.clients = { ...data.clients!, registeredAccounts: 0, activeAccounts: 0, inactiveAccounts: 0 };
    render(<ClientBreakdownChart data={data} />);
    expect(screen.getByText("No recorded entries in this population yet.")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("uses stable UTC identities as event buckets change", () => {
    const data = fixture();
    data.trends = [{ ...data.trends[0], date: "2026-08-29" }, data.trends[0]];
    const view = render(<DashboardModuleCharts tab="projects" data={data} />);
    expect(optionFor("dashboard-project-flow").series[0].data?.map((row) => row.id)).toEqual(["2026-08-29", "2026-08-30"]);
    data.trends = [data.trends[1], { ...data.trends[1], date: "2026-08-31", projectsCreated: 7 }];
    view.rerender(<DashboardModuleCharts tab="projects" data={data} />);
    expect(optionFor("dashboard-project-flow").series[0].data?.map((row) => row.id)).toEqual(["2026-08-30", "2026-08-31"]);
  });

  it("keeps risk reason identities and distinct project scope", async () => {
    const user = userEvent.setup();
    render(<DashboardModuleCharts tab="risk" data={fixture()} />);
    expect(optionFor("dashboard-risk-factor-occurrences").series[0].data).toEqual(expect.arrayContaining([expect.objectContaining({ id: "schedule-red-project_deadline_overdue", groupId: "risk.factorDistribution.schedule.project_deadline_overdue" })]));
    const figure = screen.getByRole("heading", { name: "Risk factor occurrences" }).closest("figure")!;
    await user.click(within(figure).getByRole("button", { name: "Show values" }));
    expect(figure).toHaveTextContent("across 1 projects");
    expect(figure).toHaveTextContent("Occurrences may overlap");
  });

  it("retains independent governance availability and signed margin values", async () => {
    const user = userEvent.setup();
    const data = fixture();
    unavailable(data, "governance.failedClientDeliveries");
    render(<DashboardModuleCharts tab="workforce" data={data} />);
    await user.click(screen.getByText("More analysis"));
    const values = optionFor("dashboard-governance-queues").series[0].data!;
    expect(values.find((row) => row.groupId === "governance.failedClientDeliveries")).toBeUndefined();
    expect(values.find((row) => row.groupId === "governance.failedDesignDeliveries")?.value).toBe(data.governance.failedDesignDeliveries);
    const margin = getDashboardChartDatasets("finance", { ...data, finance: { ...data.finance, currentMarginBps: -1250 } }).at(-1)!;
    expect(margin.rows[0].values).toEqual([-1250]);
  });

  it("exposes a true expense total and exact INR report data from the plotted source", async () => {
    const data = fixture();
    data.trends = [{ ...data.trends[0], date: "2026-08-29", ledgerExpensesPostedPaise: 12345 }, { ...data.trends[0], ledgerExpensesPostedPaise: 67890 }];
    render(<RecordedCostActivityChart data={data} />);
    expect(screen.getByText("₹802.35")).toBeVisible();
    const table = getDashboardChartTables("overview", data)[0];
    expect(table.columns).toContain("Recorded expenses (INR)");
    expect(table.rows.slice(0, 2)).toEqual([["2026-08-29", 123.45], ["2026-08-30", 678.9]]);
    expect(table.rows).toContainEqual(["Selected-period total", 802.35]);
    expect(optionFor("dashboard-recorded-cost-activity").series).toHaveLength(1);
  });

  it("hides unavailable panels and empty analysis wrappers", () => {
    const data = fixture();
    data.dataQuality = { status: "partial", totalIssueCount: 2, issues: [], unavailableMetricKeys: ["finance", "trends.ledgerExpensesPostedPaise"] };
    const view = render(<DashboardModuleCharts tab="finance" data={data} />);
    expect(view.container).toBeEmptyDOMElement();
    expect(capturedCharts.size).toBe(0);
  });

  it("keeps one available primary chart without a blank neighboring panel", () => {
    const data = fixture();
    unavailable(data, "estimation");
    const view = render(<DashboardModuleCharts tab="estimation" data={data} />);
    expect(screen.queryByRole("heading", { name: "Estimate status" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Estimate approvals over time" })).toBeVisible();
    expect(view.container.querySelectorAll(".dashboard-chart-card")).toHaveLength(1);
    expect(view.container.querySelector(".dashboard-reference-chart-row")).toHaveClass("dashboard-chart-grid--single");
  });

  it("shows known Client counts as bars without a false share or warning", async () => {
    const user = userEvent.setup();
    const data = fixture();
    data.clients!.inactiveAccounts = null;
    render(<ClientBreakdownChart data={data} />);
    const option = optionFor("dashboard-client-breakdown");
    expect(option.series[0].type).toBe("bar");
    expect(option.series[0].data?.map((row) => row.id)).toEqual(["active"]);
    expect(screen.queryByText("Registered clients")).not.toBeInTheDocument();
    expect(screen.queryByText(/Partial data|unavailable/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show values" }));
    expect(screen.queryByRole("columnheader", { name: "Share (%)" })).not.toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Active" })).toBeVisible();
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

});
