import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { tokenStorage } from "../../api/client";
import { AuthProvider } from "../../auth/AuthProvider";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { AppShell } from "../../components/layout/AppShell";
import {
  dashboardProjectRowsFixture,
  dashboardWorkforceRowsFixture,
  superAdminDashboardOverviewFixture,
  superAdminDashboardProjectsPageFixture,
  superAdminDashboardWorkforcePageFixture
} from "../../features/admin/dashboard/dashboardFixtures";
import { SuperAdminDashboardPage } from "../../features/admin/dashboard/SuperAdminDashboardPage";
import { dashboardKeys } from "../../features/admin/dashboard/superAdminDashboardApi";
import { authorizationFor } from "../authFixtures";
import "../../styles/index.css";
import "../../styles/role-themes.css";

const qaState = new URLSearchParams(window.location.search).get("qaState") ?? "populated";
const partialMetricKeys = [
  "procurement.approvedAmountPaise",
  "procurement.variancePaise",
  "projects.completionRate",
  "risk.projectDistribution",
  "risk.factorDistribution",
  "risk.topProjects",
  "workforce.capacity"
];
const { clients: _legacyClients, comparison: _legacyComparison, ...oldResponseOverview } =
  superAdminDashboardOverviewFixture;
const comparison = superAdminDashboardOverviewFixture.comparison!;
const previousUnavailableOverview = {
  ...superAdminDashboardOverviewFixture,
  comparison: {
    ...comparison,
    metrics: {
      ...comparison.metrics,
      projects_created: {
        ...comparison.metrics.projects_created,
        previous: null,
        delta: null,
        changeBps: null,
        changeKind: "unavailable" as const,
        previousStatus: "unavailable" as const,
        previousUnavailableReason: "Previous project history could not be verified."
      }
    }
  }
};
const motionOverview: typeof superAdminDashboardOverviewFixture = {
  ...superAdminDashboardOverviewFixture,
  projects: {
    ...superAdminDashboardOverviewFixture.projects,
    total: 6,
    createdInPeriod: 4,
    completedInPeriod: 1,
    planning: 2,
    active: 2,
    onHold: 1,
    completed: 1,
    completionRate: { numerator: 1, denominator: 6, rateBps: 1667 }
  },
  clients: {
    ...superAdminDashboardOverviewFixture.clients!,
    registeredAccounts: 5,
    activeAccounts: 4,
    inactiveAccounts: 1,
    accountsCreatedInPeriod: 3,
    clientsWithProjects: 4,
    clientsWithActiveProjects: 2
  },
  finance: {
    ...superAdminDashboardOverviewFixture.finance,
    procurementCostPaise: 1_600_000,
    employeePaymentPaise: 1_400_000,
    otherExpensePaise: 800_000,
    directSpendPaise: 3_800_000,
    overheadPaise: 400_000,
    recordedCostPaise: 4_200_000,
    remainingBudgetPaise: 3_800_000,
    currentProfitPaise: 5_800_000,
    currentMarginBps: 5800
  },
  comparison: {
    ...comparison,
    metrics: {
      ...comparison.metrics,
      projects_created: {
        ...comparison.metrics.projects_created,
        current: 4,
        delta: 2,
        changeBps: 10_000,
        changeKind: "percentage"
      },
      clients_created: {
        ...comparison.metrics.clients_created,
        current: 3,
        delta: 3,
        changeBps: null,
        changeKind: "new"
      },
      recorded_expenses_paise: {
        ...comparison.metrics.recorded_expenses_paise,
        current: 650_000,
        delta: 500_000,
        changeBps: 33_333,
        changeKind: "percentage"
      }
    },
    currentBuckets: comparison.currentBuckets.map((bucket) => ({
      ...bucket,
      projectsCreated: [6, 14, 22, 29].includes(bucket.dayIndex) ? 1 : 0,
      clientsCreated: [9, 20, 29].includes(bucket.dayIndex) ? 1 : 0,
      projectsCompleted: bucket.dayIndex === 24 ? 1 : 0,
      recordedExpensesPaise: bucket.dayIndex === 29 ? 650_000 : 0
    }))
  },
  trends: [{
    date: "2026-08-30",
    projectsCreated: 4,
    projectsCompleted: 1,
    estimatesApproved: 1,
    designPlansApproved: 0,
    workflowTasksCompleted: 2,
    ledgerExpensesPostedPaise: 650_000
  }]
};
type MotionPeriodDays = 7 | 30 | 90;

const normalizeMotionPeriodDays = (value: string | null): MotionPeriodDays => {
  const parsed = Number(value);
  return parsed === 7 || parsed === 90 ? parsed : 30;
};

const distributeCount = (
  total: number,
  dayIndex: number,
  days: number,
  offset: number
) => {
  if (total <= 0) return 0;
  const base = Math.floor(total / days);
  const remainder = total % days;
  const shiftedIndex = (dayIndex + offset) % days;
  return base + (shiftedIndex >= days - remainder ? 1 : 0);
};

const overviewForMotionPeriod = (
  source: typeof superAdminDashboardOverviewFixture,
  days: MotionPeriodDays
): typeof superAdminDashboardOverviewFixture => {
  const sourceComparison = source.comparison!;
  const observedAt = new Date(source.observedAt);
  const currentStart = new Date(Date.UTC(
    observedAt.getUTCFullYear(),
    observedAt.getUTCMonth(),
    observedAt.getUTCDate()
  ));
  currentStart.setUTCDate(currentStart.getUTCDate() - (days - 1));
  const previousStart = new Date(currentStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - days);
  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  previousEnd.setUTCHours(
    observedAt.getUTCHours(),
    observedAt.getUTCMinutes(),
    observedAt.getUTCSeconds(),
    observedAt.getUTCMilliseconds()
  );

  const createBuckets = (
    start: Date,
    values: {
      projectsCreated: number;
      clientsCreated: number;
      projectsCompleted: number;
      executionTasksCompleted: number;
      estimatesApproved: number;
      designPlansApproved: number;
      recordedExpensesPaise: number;
    },
    offset: number
  ) => Array.from({ length: days }, (_, dayIndex) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + dayIndex);
    return {
      dayIndex,
      date: date.toISOString().slice(0, 10),
      projectsCreated: distributeCount(values.projectsCreated, dayIndex, days, offset),
      clientsCreated: distributeCount(values.clientsCreated, dayIndex, days, offset + 1),
      projectsCompleted: distributeCount(values.projectsCompleted, dayIndex, days, offset + 2),
      executionTasksCompleted: distributeCount(values.executionTasksCompleted, dayIndex, days, offset + 3),
      estimatesApproved: distributeCount(values.estimatesApproved, dayIndex, days, offset + 4),
      designPlansApproved: distributeCount(values.designPlansApproved, dayIndex, days, offset + 5),
      recordedExpensesPaise: dayIndex === days - 1 ? values.recordedExpensesPaise : 0
    };
  });

  const currentValues = {
    projectsCreated: sourceComparison.metrics.projects_created.current ?? 0,
    clientsCreated: sourceComparison.metrics.clients_created.current ?? 0,
    projectsCompleted: sourceComparison.metrics.projects_completed.current ?? 0,
    executionTasksCompleted: sourceComparison.metrics.execution_tasks_completed.current ?? 0,
    estimatesApproved: sourceComparison.metrics.estimates_approved.current ?? 0,
    designPlansApproved: sourceComparison.metrics.design_plans_approved.current ?? 0,
    recordedExpensesPaise: sourceComparison.metrics.recorded_expenses_paise.current ?? 0
  };
  const previousValues = {
    projectsCreated: sourceComparison.metrics.projects_created.previous ?? 0,
    clientsCreated: sourceComparison.metrics.clients_created.previous ?? 0,
    projectsCompleted: sourceComparison.metrics.projects_completed.previous ?? 0,
    executionTasksCompleted: sourceComparison.metrics.execution_tasks_completed.previous ?? 0,
    estimatesApproved: sourceComparison.metrics.estimates_approved.previous ?? 0,
    designPlansApproved: sourceComparison.metrics.design_plans_approved.previous ?? 0,
    recordedExpensesPaise: sourceComparison.metrics.recorded_expenses_paise.previous ?? 0
  };
  const currentBuckets = createBuckets(currentStart, currentValues, days === 7 ? 1 : days === 90 ? 3 : 2);
  const previousBuckets = createBuckets(previousStart, previousValues, days === 7 ? 4 : days === 90 ? 6 : 5);

  return {
    ...source,
    period: {
      days,
      startAt: currentStart.toISOString(),
      endAt: source.observedAt
    },
    comparison: {
      ...sourceComparison,
      window: {
        ...sourceComparison.window,
        current: { days, startAt: currentStart.toISOString(), endAt: source.observedAt },
        previous: {
          days,
          startAt: previousStart.toISOString(),
          endAt: previousEnd.toISOString()
        }
      },
      currentBuckets,
      previousBuckets
    },
    trends: currentBuckets.map((bucket) => ({
      date: bucket.date,
      projectsCreated: bucket.projectsCreated,
      projectsCompleted: bucket.projectsCompleted,
      estimatesApproved: bucket.estimatesApproved,
      designPlansApproved: bucket.designPlansApproved,
      workflowTasksCompleted: bucket.executionTasksCompleted,
      ledgerExpensesPostedPaise: bucket.recordedExpensesPaise
    }))
  };
};
const overview = qaState === "empty"
  ? {
      ...superAdminDashboardOverviewFixture,
      projects: { ...superAdminDashboardOverviewFixture.projects, total: 0, createdInPeriod: 0, planning: 0, active: 0, onHold: 0, completed: 0, liveOverdue: 0, completedLate: 0, atRisk: 0, completionRate: { numerator: 0, denominator: 0, rateBps: null } },
      risk: { ...superAdminDashboardOverviewFixture.risk, projectDistribution: { gray: 0, green: 0, yellow: 0, red: 0 }, factorDistribution: [], topProjects: [] },
      trends: []
    }
  : qaState === "partial"
    ? {
        ...superAdminDashboardOverviewFixture,
        dataQuality: {
          status: "partial" as const,
          totalIssueCount: partialMetricKeys.length,
          issues: partialMetricKeys.map((metricKey) => ({
            code: "module_aggregate_unavailable" as const,
            metricKey,
            message: `${metricKey} is unavailable because its authoritative source could not be verified.`,
            entityType: null,
            entityId: null
          })),
          unavailableMetricKeys: partialMetricKeys
        }
      }
    : qaState === "old-response"
      ? oldResponseOverview
      : qaState === "previous-unavailable"
        ? previousUnavailableOverview
        : superAdminDashboardOverviewFixture;
const projectPage = qaState === "empty" || qaState === "no-match"
  ? { ...superAdminDashboardProjectsPageFixture, items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } }
  : qaState === "partial"
    ? {
        ...superAdminDashboardProjectsPageFixture,
        items: dashboardProjectRowsFixture,
        dataQuality: {
          status: "partial" as const,
          totalIssueCount: 1,
          issues: [{
            code: "module_aggregate_unavailable" as const,
            metricKey: "risk.projectDistribution",
            message: "Project risk is unavailable because its authoritative source could not be verified.",
            entityType: null,
            entityId: null
          }],
          unavailableMetricKeys: ["risk.projectDistribution"]
        }
      }
  : { ...superAdminDashboardProjectsPageFixture, items: dashboardProjectRowsFixture };
const workforcePage = qaState === "empty"
  ? { ...superAdminDashboardWorkforcePageFixture, items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false } }
  : { ...superAdminDashboardWorkforcePageFixture, items: dashboardWorkforceRowsFixture };

// Like the dashboard metrics, this QA session is served entirely by the stub transport.
tokenStorage.set("dashboard-qa-token");
const overviewReadCountByPeriod = new Map<MotionPeriodDays, number>();
window.fetch = async (input) => {
  const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (path.includes("/auth/me")) return Response.json({ data: { id: "dashboard-qa-super-admin", name: "Dashboard reviewer", email: "dashboard-reviewer@lisno.example", role: "super_admin" } });
  if (path.includes("/auth/authorization")) return Response.json({ data: authorizationFor("super_admin", [
    ...authorizationFor("super_admin").permissions,
    "projects.design_workflow.payments.read",
    "estimation.client_response_tasks.read"
  ]) });
  if (path.includes("/design-workflow/payment-confirmations")) return Response.json({ data: [] });
  if (path.includes("/admin/dashboard/overview")) {
    if (qaState === "loading" || qaState === "background-refresh") {
      return new Promise<Response>(() => undefined);
    }
    if (qaState === "full-error") {
      return Response.json({ error: { code: "DASHBOARD_UNAVAILABLE", message: "The dashboard could not be loaded." } }, { status: 500 });
    }
    if (qaState === "permission-loss") {
      return Response.json({ error: { code: "UNAUTHORIZED", message: "Your dashboard permission is no longer active." } }, { status: 401 });
    }
    if (qaState === "motion") {
      const requestUrl = new URL(path, window.location.origin);
      const periodDays = normalizeMotionPeriodDays(requestUrl.searchParams.get("periodDays"));
      const overviewReadCount = overviewReadCountByPeriod.get(periodDays) ?? 0;
      const responseOverview = overviewReadCount % 2 === 0
        ? superAdminDashboardOverviewFixture
        : motionOverview;
      overviewReadCountByPeriod.set(periodDays, overviewReadCount + 1);
      await new Promise((resolve) => window.setTimeout(
        resolve,
        periodDays === 90 ? 360 : periodDays === 30 ? 220 : 120
      ));
      return Response.json({ data: overviewForMotionPeriod(responseOverview, periodDays) });
    }
    return Response.json({ data: overview });
  }
  if (path.includes("/admin/dashboard/projects")) {
    if (qaState === "project-page-failure") {
      return Response.json({ error: { code: "PROJECT_PAGE_UNAVAILABLE", message: "Project details could not be loaded." } }, { status: 500 });
    }
    return Response.json({ data: projectPage });
  }
  if (path.includes("/admin/dashboard/workforce")) return Response.json({ data: workforcePage });
  return Response.json({ error: { code: "QA_REQUEST_BLOCKED", message: "The deterministic QA harness blocks non-dashboard requests." } }, { status: 404 });
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
if (qaState === "background-refresh") {
  queryClient.setQueryData(dashboardKeys.overview(30), superAdminDashboardOverviewFixture, { updatedAt: 1 });
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <FeedbackProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="*" element={<SuperAdminDashboardPage />} />
            </Route>
          </Routes>
        </FeedbackProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);
