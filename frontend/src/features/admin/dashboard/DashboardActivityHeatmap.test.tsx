import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DashboardActivityHeatmap } from "./DashboardActivityHeatmap";
import { superAdminDashboardOverviewFixture } from "./dashboardFixtures";
import type { SuperAdminDashboardOverview } from "./superAdminDashboardApi";

function fixture() {
  const data = structuredClone(superAdminDashboardOverviewFixture) as SuperAdminDashboardOverview;
  data.period = { days: 7, startAt: "2026-08-29T00:00:00.000Z", endAt: "2026-09-04T12:00:00.000Z" };
  data.trends = [{ ...data.trends[0], date: "2026-08-29", projectsCreated: 0 }, { ...data.trends[0], date: "2026-09-01", projectsCreated: 6 }];
  return data;
}

describe("project activity calendar", () => {
  it("exposes exact measured zeroes, unknown days, and a keyboard-selectable date", async () => {
    const user = userEvent.setup();
    render(<DashboardActivityHeatmap data={fixture()} />);
    const zero = screen.getByRole("button", { name: "29 Aug 2026: 0 projects created" });
    expect(zero).toHaveAttribute("data-level", "0");
    const unknown = screen.getByRole("button", { name: "30 Aug 2026: No observation available" });
    expect(unknown).toHaveAttribute("data-level", "unknown");
    await user.click(zero);
    expect(screen.getByRole("status")).toHaveTextContent("29 Aug 2026");
    expect(screen.getByRole("status")).toHaveTextContent("0 projects created");
    await user.keyboard("{ArrowDown}");
    expect(unknown).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("No observation available");
    await user.keyboard("{End}");
    expect(screen.getByRole("button", { name: "4 Sept 2026: No observation available" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Show values" }));
    const row = screen.getByRole("rowheader", { name: "2026-08-29" }).closest("tr")!;
    expect(within(row).getByRole("cell")).toHaveTextContent("0");
  });

  it("omits an unavailable daily source without a diagnostic placeholder", () => {
    const data = fixture();
    data.dataQuality.unavailableMetricKeys = ["trends.projectsCreated"];
    const { container } = render(<DashboardActivityHeatmap data={data} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps a verified zero-activity calendar visible", () => {
    const data = fixture();
    data.trends = Array.from({ length: 7 }, (_, day) => ({ ...data.trends[0], date: new Date(Date.UTC(2026, 7, 29 + day)).toISOString().slice(0, 10), projectsCreated: 0 }));
    render(<DashboardActivityHeatmap data={data} />);
    expect(screen.getByRole("figure", { name: "Project activity heatmap" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /0 projects created/ })).toHaveLength(7);
    expect(screen.queryByText("No observation")).not.toBeInTheDocument();
  });
});
