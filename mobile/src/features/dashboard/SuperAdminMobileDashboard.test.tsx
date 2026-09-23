import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { AUTHORIZATION_POLICY_VERSION } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { buildDashboardViewModel, useDashboardOverview } from "./data";
import {
  createDashboardOverviewFixture,
  createOverspendDashboardOverviewFixture,
  createZeroDashboardOverviewFixture
} from "./data/testFixtures";
import { SuperAdminMobileDashboard } from "./SuperAdminMobileDashboard";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (...args: readonly unknown[]) => mockPush(...args) }
}));

jest.mock("./charts", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Pressable, Text, View } = jest.requireActual("react-native") as typeof import("react-native");
  return {
    FinanceActivityChart: ({ onSelectDay }: { readonly onSelectDay?: (id: string) => void }) => React.createElement(
      Pressable,
      { accessibilityLabel: "Recorded cost chart", onPress: () => onSelectDay?.("trends.ledgerExpensesPostedPaise:2026-09-21"), testID: "dashboard-finance-activity-chart" },
      React.createElement(Text, null, "Finance activity chart")
    ),
    LifecycleDonutChart: ({ centerDisplay }: { readonly centerDisplay: string }) => React.createElement(View, {
      accessibilityLabel: `Project status chart center ${centerDisplay}`,
      testID: "dashboard-lifecycle-chart"
    }),
    CostCompositionDonutChart: ({ centerDisplay }: { readonly centerDisplay: string }) => React.createElement(View, {
      accessibilityLabel: `Cost composition chart center ${centerDisplay}`,
      testID: "dashboard-cost-composition-chart"
    }),
    BudgetPositionChart: () => React.createElement(View, { testID: "dashboard-budget-position-chart" })
  };
});

jest.mock("../../runtime/RuntimeProvider", () => ({
  useConfiguredRuntime: jest.fn()
}));

jest.mock("./data", () => ({
  ...jest.requireActual("./data"),
  useDashboardOverview: jest.fn()
}));

const useDashboardOverviewMock = jest.mocked(useDashboardOverview);
const refetch = jest.fn(async () => ({ isSuccess: true }));

const session: AuthenticatedSession = {
  user: {
    id: "super-admin-1",
    name: "Super Admin",
    email: "super-admin@example.test",
    role: "super_admin"
  },
  authorization: {
    role: "super_admin",
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    permissions: ["admin.dashboard.read"]
  }
};

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: buildDashboardViewModel(createDashboardOverviewFixture(30)),
    error: null,
    isPending: false,
    isError: false,
    isRefetching: false,
    isPlaceholderData: false,
    refetch,
    ...overrides
  } as unknown as ReturnType<typeof useDashboardOverview>;
}

describe("SuperAdminMobileDashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardOverviewMock.mockReturnValue(queryResult());
  });

  it("renders the reference-led KPI and panel hierarchy from authorized fields", async () => {
    const view = await render(<SuperAdminMobileDashboard session={session} />);

    expect(view.getByRole("header", { name: "Executive dashboard" })).toBeTruthy();
    expect([
      "projects.total",
      "finance.approvedSubtotalPaise",
      "finance.approvedContractTotalPaise",
      "finance.currentMarginBps",
      "projects.liveOverdue"
    ].map((id) => view.getByTestId(`dashboard-kpi-${id}`))).toHaveLength(5);
    expect(view.getByTestId("dashboard-kpi-projects.total").props.accessibilityLabel).toContain("Total projects: 17");
    expect(view.getByTestId("dashboard-kpi-finance.approvedSubtotalPaise").props.accessibilityLabel).toContain("GST excluded");
    expect(view.getByTestId("dashboard-kpi-finance.approvedContractTotalPaise").props.accessibilityLabel).toContain("GST included");
    expect(view.getByTestId("dashboard-kpi-projects.liveOverdue").props.accessibilityLabel).toContain("Live overdue: 4");

    const headings = view.getAllByRole("header").map((heading) => String(heading.props.children));
    const order = [
      "Recorded cost activity",
      "Project status",
      "Priority project",
      "Action queue",
      "Cost composition",
      "Budget position",
      "Module progress",
      "Workforce summary"
    ].map((label) => headings.indexOf(label));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(view.getByText("EXACT DATA & QUALITY")).toBeTruthy();
    expect(view.getByRole("button", { name: "Show all verified values" })).toBeTruthy();
    expect(view.queryByText(/sample project|vendor leaderboard|employee leaderboard/i)).toBeNull();
  });

  it("changes periods and limits comparison copy to the period-derived KPI", async () => {
    const view = await render(<SuperAdminMobileDashboard session={session} />);

    expect(view.getByText(/\+2 \(\+66\.67%\) vs previous/)).toBeTruthy();
    await fireEvent.press(view.getByRole("tab", { name: "90 days" }));
    expect(useDashboardOverviewMock).toHaveBeenLastCalledWith(session, 90);

    await fireEvent.press(view.getByRole("switch", { name: "Compare with previous period" }));
    expect(view.getByText("5 created in the current window")).toBeTruthy();
  });

  it("retains the verified current project count when only the previous comparison is unavailable", async () => {
    const fixture = createDashboardOverviewFixture(30);
    fixture.comparison.metrics.projects_created = {
      ...fixture.comparison.metrics.projects_created,
      previous: null,
      delta: null,
      changeBps: null,
      changeKind: "unavailable",
      previousStatus: "unavailable",
      previousUnavailableReason: "Previous project activity is temporarily unavailable."
    };
    for (const bucket of fixture.comparison.previousBuckets) bucket.projectsCreated = null;
    useDashboardOverviewMock.mockReturnValue(queryResult({ data: buildDashboardViewModel(fixture) }));

    const view = await render(<SuperAdminMobileDashboard session={session} />);
    expect(view.getByText(/5 created · previous period unavailable/)).toBeTruthy();
    expect(view.getByText(/Previous project activity is temporarily unavailable/)).toBeTruthy();
  });

  it("provides 48-point native finance day stepping with exact UTC values", async () => {
    const view = await render(<SuperAdminMobileDashboard session={session} />);

    expect(view.getByLabelText(/Selected UTC day 2026-09-22/)).toBeTruthy();
    expect(view.getByRole("button", { name: "Next finance day" }).props.accessibilityState).toEqual({ disabled: true });
    expect(StyleSheet.flatten(view.getByRole("button", { name: "Previous finance day" }).props.style)).toEqual(expect.objectContaining({ width: 48, height: 48 }));

    await fireEvent.press(view.getByRole("button", { name: "Previous finance day" }));
    expect(view.getByLabelText(/Selected UTC day 2026-09-21/)).toBeTruthy();
    expect(view.getByRole("button", { name: "Next finance day" }).props.accessibilityState).toEqual({ disabled: false });

    await fireEvent.press(view.getByLabelText("Recorded cost chart"));
    expect(view.getByLabelText(/Selected UTC day 2026-09-21/)).toBeTruthy();
  });

  it("keeps all module snapshots reachable through native controls", async () => {
    const view = await render(<SuperAdminMobileDashboard session={session} />);

    await fireEvent.press(view.getByRole("tab", { name: "Procurement" }));
    expect(view.getByRole("tab", { name: "Procurement" }).props.accessibilityState).toEqual(expect.objectContaining({
      disabled: false,
      selected: true
    }));
    expect(view.getByText("Procurement exact snapshot")).toBeTruthy();
    expect(view.getByLabelText(/Posted spend: ₹46,000\.00/)).toBeTruthy();
  });

  it("keeps healthy cost metrics visible when one classification is unavailable", async () => {
    const fixture = createDashboardOverviewFixture(30);
    fixture.dataQuality = {
      status: "partial",
      totalIssueCount: 1,
      issues: [{
        code: "module_aggregate_unavailable",
        metricKey: "finance.procurementCostPaise",
        message: "Procurement cost lineage is temporarily unavailable.",
        entityType: null,
        entityId: null
      }],
      unavailableMetricKeys: ["finance.procurementCostPaise"]
    };
    useDashboardOverviewMock.mockReturnValue(queryResult({ data: buildDashboardViewModel(fixture) }));

    const view = await render(<SuperAdminMobileDashboard session={session} />);
    expect(view.getByLabelText(/Procurement: Not available.*Procurement cost lineage/)).toBeTruthy();
    expect(view.getByLabelText(/Employee payments: ₹24,000\.00/)).toBeTruthy();
    expect(view.getByTestId("dashboard-cost-composition-panel")).toBeTruthy();
    expect(view.getByLabelText("Cost composition chart center Partial")).toBeTruthy();
    expect(view.getByLabelText(/Partial chart.*Procurement cost lineage/)).toBeTruthy();
  });

  it("uses a partial lifecycle center and names the missing source beside the chart", async () => {
    const fixture = createDashboardOverviewFixture(30);
    fixture.dataQuality = {
      status: "partial",
      totalIssueCount: 1,
      issues: [{
        code: "module_aggregate_unavailable",
        metricKey: "projects.onHold",
        message: "On-hold project lineage is temporarily unavailable.",
        entityType: null,
        entityId: null
      }],
      unavailableMetricKeys: ["projects.onHold"]
    };
    useDashboardOverviewMock.mockReturnValue(queryResult({ data: buildDashboardViewModel(fixture) }));

    const view = await render(<SuperAdminMobileDashboard session={session} />);
    expect(view.getByLabelText("Project status chart center Partial")).toBeTruthy();
    expect(view.getByLabelText(/Partial chart.*On-hold project lineage/)).toBeTruthy();
  });

  it("distinguishes a verified zero budget from an overspent position without inventing utilization", async () => {
    useDashboardOverviewMock.mockReturnValue(queryResult({
      data: buildDashboardViewModel(createZeroDashboardOverviewFixture())
    }));
    const zeroView = await render(<SuperAdminMobileDashboard session={session} />);
    expect(zeroView.getByText("Verified zero cost budget · utilization is not calculated")).toBeTruthy();
    await zeroView.unmount();

    useDashboardOverviewMock.mockReturnValue(queryResult({
      data: buildDashboardViewModel(createOverspendDashboardOverviewFixture())
    }));
    const overspendView = await render(<SuperAdminMobileDashboard session={session} />);
    expect(overspendView.getByText(/Overspent by ₹20,000\.00/)).toBeTruthy();
  });

  it("shows a priority-project deep link only with list and read permissions", async () => {
    const noLink = await render(<SuperAdminMobileDashboard session={session} />);
    expect(noLink.queryByRole("link", { name: "Open Atrium Residence" })).toBeNull();
    await noLink.unmount();

    const projectSession: AuthenticatedSession = {
      ...session,
      authorization: {
        ...session.authorization,
        permissions: ["admin.dashboard.read", "projects.list", "projects.read"]
      }
    };
    const withLink = await render(<SuperAdminMobileDashboard session={projectSession} />);
    await fireEvent.press(withLink.getByRole("link", { name: "Open Atrium Residence" }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/record/[featureId]/[recordId]",
      params: { featureId: "projects", recordId: "project-alpha" }
    });
  });

  it("keeps priority-project availability independent from the risk distribution", async () => {
    const fixture = createDashboardOverviewFixture(30);
    fixture.dataQuality = {
      status: "partial",
      totalIssueCount: 1,
      issues: [{
        code: "module_aggregate_unavailable",
        metricKey: "risk.topProjects",
        message: "Priority-project ranking is temporarily unavailable.",
        entityType: null,
        entityId: null
      }],
      unavailableMetricKeys: ["risk.topProjects"]
    };
    useDashboardOverviewMock.mockReturnValue(queryResult({ data: buildDashboardViewModel(fixture) }));

    const view = await render(<SuperAdminMobileDashboard session={session} />);
    expect(view.getByText("Priority project is not available")).toBeTruthy();
    expect(view.getByText("Priority-project ranking is temporarily unavailable.")).toBeTruthy();
    expect(view.queryByText("No project currently requires priority review")).toBeNull();
    expect(view.getByText("Red risk")).toBeTruthy();
  });

  it("includes red-risk and live-overdue signals in the action queue with unavailable reasons intact", async () => {
    const fixture = createDashboardOverviewFixture(30);
    fixture.dataQuality = {
      status: "partial",
      totalIssueCount: 2,
      issues: [
        {
          code: "module_aggregate_unavailable",
          metricKey: "risk.projectDistribution",
          message: "Risk distribution is temporarily unavailable.",
          entityType: null,
          entityId: null
        },
        {
          code: "module_aggregate_unavailable",
          metricKey: "projects.liveOverdue",
          message: "Live overdue lineage is temporarily unavailable.",
          entityType: null,
          entityId: null
        }
      ],
      unavailableMetricKeys: ["risk.projectDistribution", "projects.liveOverdue"]
    };
    useDashboardOverviewMock.mockReturnValue(queryResult({ data: buildDashboardViewModel(fixture) }));

    const view = await render(<SuperAdminMobileDashboard session={session} />);
    expect(view.getAllByText("Red risk").length).toBeGreaterThan(0);
    expect(view.getAllByText("Live overdue").length).toBeGreaterThan(0);
    expect(view.getAllByText("Risk distribution is temporarily unavailable.").length).toBeGreaterThan(0);
    expect(view.getAllByText("Live overdue lineage is temporarily unavailable.").length).toBeGreaterThan(0);
    expect(view.getByText("Pending invitations")).toBeTruthy();
    expect(view.getByText("Over-budget projects")).toBeTruthy();
  });

  it("opens the native exact-value ledger with units and source detail", async () => {
    const view = await render(<SuperAdminMobileDashboard session={session} />);

    await fireEvent.press(view.getByRole("button", { name: "Show all verified values" }));
    expect(view.getByRole("header", { name: "Dashboard ledger" })).toBeTruthy();
    expect(view.getByLabelText(/Total: 17/)).toBeTruthy();
    expect(view.getByText(/Money is calculated in paise/)).toBeTruthy();
  });

  it("renders a safe first-load failure and retries", async () => {
    useDashboardOverviewMock.mockReturnValue(queryResult({
      data: undefined,
      error: new Error("bad dashboard"),
      isError: true
    }));
    const view = await render(<SuperAdminMobileDashboard session={session} />);

    expect(view.getByRole("header", { name: "Executive dashboard is unavailable" })).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: "TRY AGAIN" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
