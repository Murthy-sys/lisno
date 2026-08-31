import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import {
  dashboardProjectRowsFixture,
  dashboardWorkforceRowsFixture,
  superAdminDashboardOverviewFixture,
  superAdminDashboardProjectsPageFixture,
  superAdminDashboardWorkforcePageFixture
} from "../../features/admin/dashboard/dashboardFixtures";
import { SuperAdminDashboardPage } from "../../features/admin/dashboard/SuperAdminDashboardPage";
import { dashboardKeys } from "../../features/admin/dashboard/superAdminDashboardApi";
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

window.fetch = async (input) => {
  const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
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
      <FeedbackProvider>
        <main className="app-main"><SuperAdminDashboardPage /></main>
      </FeedbackProvider>
    </BrowserRouter>
  </QueryClientProvider>
);
