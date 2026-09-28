import { ChartNoAxesCombined } from "lucide-react";

export function VendorKpiPlaceholder() {
  return <aside className="vendor-kpi-placeholder" aria-label="Vendor performance">
    <ChartNoAxesCombined aria-hidden="true" />
    <div><strong>Vendor performance</strong><p>Procurement reviews vendor ratings in the vendor directory. Suggestions here remain a Sales Manager selection.</p></div>
  </aside>;
}
