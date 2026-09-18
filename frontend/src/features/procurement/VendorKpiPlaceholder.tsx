import { ChartNoAxesCombined } from "lucide-react";

export function VendorKpiPlaceholder() {
  return <aside className="vendor-kpi-placeholder" aria-label="Vendor performance">
    <ChartNoAxesCombined aria-hidden="true" />
    <div><strong>Vendor performance</strong><p>KPI is not rated yet. Performance-based recommendations will appear here when vendor performance is recorded.</p></div>
  </aside>;
}
