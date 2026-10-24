import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PeriodActivityComparisonChart, ProjectActivityChart, ProjectStatusChart } from "./ExecutiveDashboardCharts";
import { superAdminDashboardOverviewFixture } from "./dashboardFixtures";
import type { DashboardEChartProps } from "./echarts/types";

const { charts } = vi.hoisted(() => ({ charts: new Map<string, DashboardEChartProps>() }));
vi.mock("./echarts/DashboardEChart", () => ({ DashboardEChart: (props: DashboardEChartProps) => {
  charts.set(props.chartId, props);
  return <div role="img" aria-label={props.description} />;
} }));

describe("visual dashboard chart controls", () => {
  beforeEach(() => charts.clear());

  it("maps both grouped series to the real event target and provides keyboard DOM actions", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<PeriodActivityComparisonChart data={superAdminDashboardOverviewFixture} onActivate={onActivate} />);
    const interaction = charts.get("dashboard-period-activity")!.interaction!;
    expect(new Set(interaction.items.map((item) => item.id)).size).toBe(interaction.items.length);
    act(() => interaction.onActivate!("previous-period-projects_created"));
    expect(onActivate).toHaveBeenLastCalledWith("projects_created");
    const button = screen.getByRole("button", { name: "Estimates approved" });
    expect(button.id).toBe("dashboard-comparison-estimates_approved");
    await user.click(button);
    expect(onActivate).toHaveBeenLastCalledWith("estimates_approved");
  });

  it("selects exact dated activity locally without opening a detail filter", () => {
    render(<ProjectActivityChart data={superAdminDashboardOverviewFixture} />);
    const interaction = charts.get("dashboard-project-activity")!.interaction!;
    act(() => interaction.onActivate!("created-2026-08-30"));
    expect(screen.getByRole("status")).toHaveTextContent("30 Aug 2026");
    expect(screen.getByRole("status")).toHaveTextContent("Projects created: 1");
    expect(screen.getByRole("status")).toHaveTextContent("Projects completed: 0");
  });

  it("offers named lifecycle actions tied to stable status IDs", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<ProjectStatusChart data={superAdminDashboardOverviewFixture} onActivate={onActivate} />);
    const button = screen.getByRole("button", { name: "View on hold projects" });
    expect(button.id).toBe("dashboard-lifecycle-on_hold");
    await user.click(button);
    expect(onActivate).toHaveBeenLastCalledWith("on_hold");
  });
});
