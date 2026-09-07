import { Surface } from "../../../components/ui/Surface";
import {
  ApprovalThroughputChart,
  BudgetConsumptionMeter,
  DesignPipelineChart,
  EstimationPipelineChart,
  ExecutionProgressMeter,
  ExecutionRoleChart,
  ExecutionStateChart,
  ExpenseTrendChart,
  FinanceWaterfallChart,
  MarginMeter,
  ProcurementPipelineChart,
  ProcurementSpendMeter,
  ProjectFlowChart,
  ProjectLifecycleChart,
  RiskDistributionChart,
  RiskFactorChart,
  SpendCompositionChart,
  WorkerRoleChart,
  WorkforceAssignmentChart,
  WorkforceKpiMeter
} from "./dashboardCharts";
import type { DashboardTab, SuperAdminDashboardOverview } from "./superAdminDashboardApi";

/*
 * The chart block that opens each drill-down tab, above its metric cards.
 *
 * A tab shows the same organization-wide totals the Overview does — the
 * drill-down filters below never reach these, so the shape a reader sees here
 * stays comparable across every filter they apply.
 */

function ChartCard({ children }: { children: React.ReactNode }) {
  return (
    <Surface as="article" className="dashboard-chart-card">
      {children}
    </Surface>
  );
}

export function DashboardModuleCharts({
  tab,
  data
}: {
  tab: Exclude<DashboardTab, "overview">;
  data: SuperAdminDashboardOverview;
}) {
  if (tab === "projects") {
    return (
      <div className="dashboard-chart-grid">
        <ChartCard><ProjectLifecycleChart data={data} /></ChartCard>
        <ChartCard><RiskDistributionChart data={data} /></ChartCard>
        <ChartCard><ProjectFlowChart data={data} /></ChartCard>
        <ChartCard><ApprovalThroughputChart data={data} /></ChartCard>
      </div>
    );
  }

  if (tab === "estimation") {
    return (
      <div className="dashboard-chart-grid dashboard-chart-grid--single">
        <ChartCard><EstimationPipelineChart data={data} /></ChartCard>
        <ChartCard><ApprovalThroughputChart data={data} /></ChartCard>
      </div>
    );
  }

  if (tab === "design") {
    return (
      <div className="dashboard-chart-grid dashboard-chart-grid--single">
        <ChartCard><DesignPipelineChart data={data} /></ChartCard>
      </div>
    );
  }

  if (tab === "procurement") {
    return (
      <div className="dashboard-chart-grid dashboard-chart-grid--single">
        <ChartCard><ProcurementPipelineChart data={data} /></ChartCard>
        <ChartCard>
          <ProcurementSpendMeter data={data} />
        </ChartCard>
      </div>
    );
  }

  /* Tall charts are paired with tall ones so neither row runs ragged. */
  if (tab === "finance") {
    return (
      <div className="dashboard-chart-grid">
        <ChartCard><FinanceWaterfallChart data={data} /></ChartCard>
        <ChartCard><ExpenseTrendChart data={data} /></ChartCard>
        <ChartCard><SpendCompositionChart data={data} /></ChartCard>
        <ChartCard>
          <div className="dashboard-meter-stack">
            <BudgetConsumptionMeter data={data} />
            <MarginMeter data={data} />
          </div>
        </ChartCard>
      </div>
    );
  }

  if (tab === "execution") {
    return (
      <div className="dashboard-chart-grid">
        <ChartCard><ExecutionStateChart data={data} /></ChartCard>
        <ChartCard><ExecutionRoleChart data={data} /></ChartCard>
        <ChartCard>
          <div className="dashboard-meter-stack">
            <ExecutionProgressMeter data={data} />
          </div>
        </ChartCard>
      </div>
    );
  }

  if (tab === "workforce") {
    return (
      <div className="dashboard-chart-grid">
        <ChartCard><WorkforceAssignmentChart data={data} /></ChartCard>
        <ChartCard><WorkerRoleChart data={data} /></ChartCard>
        <ChartCard>
          <div className="dashboard-meter-stack">
            <WorkforceKpiMeter data={data} />
          </div>
        </ChartCard>
      </div>
    );
  }

  return (
    <div className="dashboard-chart-grid">
      <ChartCard><RiskDistributionChart data={data} /></ChartCard>
      <ChartCard><RiskFactorChart data={data} /></ChartCard>
    </div>
  );
}
