import { DashboardDataChart } from "../DashboardDataChart";
import { getDashboardChartDatasets } from "../dashboardChartData";
import type { DashboardTab, SuperAdminDashboardOverview } from "../superAdminDashboardApi";
import { formatPaise } from "../dashboardPresentation";
import type { SpatialFlowDatum } from "./spatialScenes";

function DatasetChart({ data, tab, index }: { data: SuperAdminDashboardOverview; tab: DashboardTab; index: number }) {
  return <DashboardDataChart dataset={getDashboardChartDatasets(tab, data)[index]} />;
}

export function ProjectFlowChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="projects" index={0} />; }
export function ProjectLifecycleChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="projects" index={1} />; }
export function RiskDistributionChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="risk" index={0} />; }
export function RiskFactorChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="risk" index={1} />; }
export function ApprovalThroughputChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="estimation" index={1} />; }
export function DesignApprovalTrendChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="design" index={1} />; }
export function ExecutionCompletionTrendChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="execution" index={0} />; }
export function ExpenseTrendChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="finance" index={0} />; }
export function EstimationDeliveryCorridor({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="estimation" index={0} />; }
export function DesignDeliveryCorridor({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="design" index={0} />; }
export function ProcurementDeliveryCorridor({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="procurement" index={0} />; }
export function ProcurementSpendPath({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="procurement" index={1} />; }
export function CapitalFlowChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="finance" index={3} />; }
export function SpendCompositionChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="finance" index={1} />; }
export function BudgetConsumptionPath({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="finance" index={2} />; }
export function MarginPath({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="finance" index={4} />; }
export function ExecutionStateChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="execution" index={1} />; }
export function ExecutionRoleChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="execution" index={2} />; }
export function ExecutionProgressPath({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="execution" index={3} />; }
export function WorkerRoleChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="workforce" index={0} />; }
export function WorkforceAssignmentChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="workforce" index={1} />; }
export function GovernanceQueueChart({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="workforce" index={2} />; }
export function WorkforceKpiPath({ data }: { data: SuperAdminDashboardOverview }) { return <DatasetChart data={data} tab="workforce" index={3} />; }

// Retained for the separate legacy overview-chart consumer.
export const createFinanceCapitalFlows = (data: SuperAdminDashboardOverview): SpatialFlowDatum[] => {
  const finance = data.finance;
  return [
    { key: "contract", metricKey: "finance.approvedContractTotalPaise", label: "Contract total", value: finance.approvedContractTotalPaise, displayValue: formatPaise(finance.approvedContractTotalPaise), kind: "context", fromKey: null, point: { x: -0.9, y: 0.82, z: -0.55 } },
    { key: "gst", metricKey: "finance.approvedGstPaise", label: "GST context", value: finance.approvedGstPaise, displayValue: formatPaise(finance.approvedGstPaise), kind: "context", fromKey: null, point: { x: -0.9, y: 0.5, z: 0.5 } },
    { key: "net", metricKey: "finance.approvedSubtotalPaise", label: "Net revenue", value: finance.approvedSubtotalPaise, displayValue: formatPaise(finance.approvedSubtotalPaise), kind: "source", fromKey: null, point: { x: -0.5, y: 0.5, z: 0 } },
    { key: "target-profit", metricKey: "finance.targetProfitPaise", label: "Target profit", value: finance.targetProfitPaise, displayValue: formatPaise(finance.targetProfitPaise), runningDisplayValue: "Allocation from net revenue", kind: "allocation", fromKey: "net", point: { x: 0.04, y: 0.79, z: -0.46 } },
    { key: "budget", metricKey: "finance.costBudgetPaise", label: "Cost budget", value: finance.costBudgetPaise, displayValue: formatPaise(finance.costBudgetPaise), runningDisplayValue: "Allocation from net revenue", kind: "allocation", fromKey: "net", point: { x: 0.02, y: 0.29, z: 0.42 } },
    { key: "recorded", metricKey: "finance.recordedCostPaise", label: "Recorded cost", value: finance.recordedCostPaise, displayValue: formatPaise(finance.recordedCostPaise), runningDisplayValue: "Applied against cost budget", kind: "outflow", fromKey: "budget", point: { x: 0.63, y: 0.52, z: -0.36 } },
    { key: "remaining", metricKey: "finance.remainingBudgetPaise", label: "Remaining budget", value: finance.remainingBudgetPaise, displayValue: formatPaise(finance.remainingBudgetPaise), runningDisplayValue: "Cost budget − recorded cost", kind: "outcome", fromKey: "budget", point: { x: 0.64, y: 0.16, z: 0.48 } },
    { key: "current-profit", metricKey: "finance.currentProfitPaise", label: "Current profit", value: finance.currentProfitPaise, displayValue: formatPaise(finance.currentProfitPaise), runningDisplayValue: "Net revenue − recorded cost", kind: "outcome", fromKey: null, point: { x: 0.9, y: 0.82, z: 0.06 } }
  ];
};
