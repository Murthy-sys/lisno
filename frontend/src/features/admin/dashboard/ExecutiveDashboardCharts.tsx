import { DashboardDataChart, createDashboardDataChartOption } from "./DashboardDataChart";
import { budgetDataset, clientBreakdownDataset, costCompositionDataset, lifecycleDataset, periodActivityComparisonDataset, projectActivityDataset, recordedExpenseDataset } from "./dashboardChartData";
import type { DashboardChartTheme, DashboardEChartOption } from "./echarts/types";
import type { DashboardProjectModuleStatus, DashboardTrendBucket, SuperAdminDashboardOverview } from "./superAdminDashboardApi";

export function createRecordedCostActivityOption({ trends, recordedCostsAvailable = true, theme }: {
  trends: readonly DashboardTrendBucket[];
  approvedNetRevenuePaise?: number | null;
  costBudgetPaise?: number | null;
  recordedCostsAvailable?: boolean;
  theme: Readonly<DashboardChartTheme>;
}): DashboardEChartOption {
  return createDashboardDataChartOption({
    id: "dashboard-recorded-cost-activity", title: "Recorded expenses over time", subtitle: "Daily expenses by incurred date.", kind: "line", unit: "paise", column: "Incurred date (UTC)",
    series: [{ id: "recorded-cost-activity", label: "Recorded expenses" }],
    rows: trends.map((bucket) => ({ id: bucket.date.slice(0, 10), label: bucket.date.slice(0, 10), values: [recordedCostsAvailable && Number.isFinite(bucket.ledgerExpensesPostedPaise) ? bucket.ledgerExpensesPostedPaise : null] }))
  }, theme);
}

export const createExecutiveLifecycleOption = ({ data, theme }: { data: SuperAdminDashboardOverview; theme: Readonly<DashboardChartTheme> }) => createDashboardDataChartOption(lifecycleDataset(data), theme);
export const createCostCompositionOption = ({ data, theme }: { data: SuperAdminDashboardOverview; theme: Readonly<DashboardChartTheme> }) => createDashboardDataChartOption(costCompositionDataset(data), theme);
export const createBudgetPositionOption = ({ data, theme }: { data: SuperAdminDashboardOverview; theme: Readonly<DashboardChartTheme> }) => createDashboardDataChartOption(budgetDataset(data), theme);

export function RecordedCostActivityChart({ data, compact = false }: { data: SuperAdminDashboardOverview; compact?: boolean }) {
  return <DashboardDataChart dataset={recordedExpenseDataset(data)} plotHeight={compact ? 180 : undefined} />;
}
export function ClientBreakdownChart({ data }: { data: SuperAdminDashboardOverview }) {
  return <DashboardDataChart dataset={clientBreakdownDataset(data)} />;
}
export function ProjectStatusChart({ data, onActivate }: { data: SuperAdminDashboardOverview; onActivate: (status: DashboardProjectModuleStatus) => void }) {
  return <DashboardDataChart dataset={lifecycleDataset(data)} onActivate={(id) => onActivate(id as DashboardProjectModuleStatus)} />;
}
export function CostCompositionChart({ data }: { data: SuperAdminDashboardOverview }) {
  return <DashboardDataChart dataset={costCompositionDataset(data)} />;
}
export function BudgetPositionChart({ data }: { data: SuperAdminDashboardOverview }) {
  return <DashboardDataChart dataset={budgetDataset(data)} />;
}

export function ProjectActivityChart({ data }: { data: SuperAdminDashboardOverview }) {
  return <DashboardDataChart dataset={projectActivityDataset(data)} />;
}
export function PeriodActivityComparisonChart({ data, showComparison = true, onActivate }: { data: SuperAdminDashboardOverview; showComparison?: boolean; onActivate?: (id: string) => void }) {
  return <DashboardDataChart dataset={periodActivityComparisonDataset(data, showComparison)} onActivate={onActivate} />;
}
