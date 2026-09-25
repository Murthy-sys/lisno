import { Surface } from "../../../components/ui/Surface";
import {
  ApprovalThroughputChart,
  BudgetConsumptionPath,
  CapitalFlowChart,
  DesignApprovalTrendChart,
  DesignDeliveryCorridor,
  EstimationDeliveryCorridor,
  ExecutionProgressPath,
  ExecutionCompletionTrendChart,
  ExecutionRoleChart,
  ExecutionStateChart,
  ExpenseTrendChart,
  GovernanceQueueChart,
  MarginPath,
  ProcurementDeliveryCorridor,
  ProcurementSpendPath,
  ProjectFlowChart,
  ProjectLifecycleChart,
  RiskDistributionChart,
  RiskFactorChart,
  SpendCompositionChart,
  WorkerRoleChart,
  WorkforceAssignmentChart,
  WorkforceKpiPath
} from "./echarts/DashboardModuleECharts";
import type { DashboardTab, SuperAdminDashboardOverview } from "./superAdminDashboardApi";

/*
 * The chart block that opens each drill-down tab, above its metric cards.
 *
 * A tab shows the same organization-wide totals the Overview does — the
 * drill-down filters below never reach these, so the shape a reader sees here
 * stays comparable across every filter they apply.
 */

function ChartCard({ children, featured = false }: { children: React.ReactNode; featured?: boolean }) {
  return (
    <Surface as="article" className={`dashboard-chart-card dashboard-atlas-panel${featured ? " dashboard-atlas-panel--featured" : ""}`}>
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
      <div className="dashboard-chart-grid dashboard-atlas-module-grid" data-module="projects">
        <ChartCard featured><ProjectLifecycleChart data={data} /></ChartCard>
        <ChartCard><RiskDistributionChart data={data} /></ChartCard>
        <ChartCard><ProjectFlowChart data={data} /></ChartCard>
        <ChartCard><ApprovalThroughputChart data={data} /></ChartCard>
      </div>
    );
  }

  if (tab === "estimation") {
    return (
      <div className="dashboard-chart-grid dashboard-atlas-module-grid" data-module="estimation">
        <ChartCard featured><EstimationDeliveryCorridor data={data} /></ChartCard>
        <ChartCard><ApprovalThroughputChart data={data} /></ChartCard>
      </div>
    );
  }

  if (tab === "design") {
    return (
      <div className="dashboard-chart-grid dashboard-atlas-module-grid" data-module="design">
        <ChartCard featured><DesignDeliveryCorridor data={data} /></ChartCard>
        <ChartCard><DesignApprovalTrendChart data={data} /></ChartCard>
      </div>
    );
  }

  if (tab === "procurement") {
    return (
      <div className="dashboard-chart-grid dashboard-atlas-module-grid" data-module="procurement">
        <ChartCard featured><ProcurementDeliveryCorridor data={data} /></ChartCard>
        <ChartCard>
          <ProcurementSpendPath data={data} />
        </ChartCard>
      </div>
    );
  }

  /* Tall charts are paired with tall ones so neither row runs ragged. */
  if (tab === "finance") {
    return (
      <div className="dashboard-chart-grid dashboard-atlas-module-grid" data-module="finance">
        <ChartCard featured><CapitalFlowChart data={data} /></ChartCard>
        <ChartCard><ExpenseTrendChart data={data} /></ChartCard>
        <ChartCard><SpendCompositionChart data={data} /></ChartCard>
        <ChartCard>
          <div className="dashboard-path-stack">
            <BudgetConsumptionPath data={data} />
            <MarginPath data={data} />
          </div>
        </ChartCard>
      </div>
    );
  }

  if (tab === "execution") {
    return (
      <div className="dashboard-chart-grid dashboard-atlas-module-grid" data-module="execution">
        <ChartCard featured><ExecutionStateChart data={data} /></ChartCard>
        <ChartCard><ExecutionRoleChart data={data} /></ChartCard>
        <ChartCard><ExecutionCompletionTrendChart data={data} /></ChartCard>
        <ChartCard>
          <div className="dashboard-path-stack">
            <ExecutionProgressPath data={data} />
          </div>
        </ChartCard>
      </div>
    );
  }

  if (tab === "workforce") {
    return (
      <div className="dashboard-chart-grid dashboard-atlas-module-grid" data-module="workforce">
        <ChartCard featured><WorkforceAssignmentChart data={data} /></ChartCard>
        <ChartCard><WorkerRoleChart data={data} /></ChartCard>
        <ChartCard><GovernanceQueueChart data={data} /></ChartCard>
        <ChartCard>
          <div className="dashboard-path-stack">
            <WorkforceKpiPath data={data} />
          </div>
        </ChartCard>
      </div>
    );
  }

  return (
    <div className="dashboard-chart-grid dashboard-atlas-module-grid" data-module="risk">
      <ChartCard featured><RiskDistributionChart data={data} /></ChartCard>
      <ChartCard><RiskFactorChart data={data} /></ChartCard>
    </div>
  );
}
