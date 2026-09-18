import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { ProcurementVendorDirectory } from "./ProcurementVendorDirectory";
import { SalesProcurementProjects } from "./SalesProcurementProjects";
import "../ai-estimator-knowledge/ai-estimator-knowledge.css";
import "../ai-estimator-knowledge/knowledge-configuration-ui.css";
import "./projectProcurementItems.css";
import "./vendorProcurement.css";

export function ProcurementManagementPage() {
  const auth = useAuth();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.vendor_suggestions.read");
  const superAdmin = auth.user?.role === "super_admin";
  if (!canRead || !["admin", "super_admin"].includes(auth.user?.role ?? "")) return <PageState state="error" message="You do not have permission to view this procurement workspace." />;
  return <section className="vendor-procurement" aria-labelledby="vendor-procurement-title">
    <PageHeader id="vendor-procurement-title" eyebrow="Procurement" title={superAdmin ? "Vendor directory" : "Project vendor suggestions"}
      description={superAdmin ? "Configure vendors shared across projects and review their performance availability." : "Suggest vendors for your Design-approved projects. Procurement makes the final selection."} />
    {superAdmin ? <ProcurementVendorDirectory /> : <SalesProcurementProjects />}
  </section>;
}
