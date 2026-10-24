import { Surface } from "../../../components/ui/Surface";
import { DashboardDataChart } from "./DashboardDataChart";
import { getDashboardChartDatasets, getVisibleDashboardChartDataset } from "./dashboardChartData";
import type { DashboardTab, SuperAdminDashboardOverview } from "./superAdminDashboardApi";

export function DashboardModuleCharts({ tab, data }: {
  tab: Exclude<DashboardTab, "overview">;
  data: SuperAdminDashboardOverview;
  showComparison?: boolean;
}) {
  const datasets = getDashboardChartDatasets(tab, data);
  const primary = datasets.slice(0, 2).flatMap((dataset) => getVisibleDashboardChartDataset(dataset) ?? []);
  const secondary = datasets.slice(2).flatMap((dataset) => getVisibleDashboardChartDataset(dataset) ?? []);
  return <>
    {primary.length > 0 ? <div className={`dashboard-reference-chart-row${primary.length === 1 ? " dashboard-chart-grid--single" : ""}`} data-module={tab}>
      {primary.map((dataset) => <Surface as="article" className="dashboard-chart-card" key={dataset.id}><DashboardDataChart dataset={dataset} /></Surface>)}
    </div> : null}
    {secondary.length > 0 ? <details className="dashboard-secondary-charts">
      <summary>More analysis</summary>
      <div className={`dashboard-chart-grid${secondary.length === 1 ? " dashboard-chart-grid--single" : ""}`}>
        {secondary.map((dataset) => <Surface as="article" className="dashboard-chart-card" key={dataset.id}><DashboardDataChart dataset={dataset} /></Surface>)}
      </div>
    </details> : null}
  </>;
}
