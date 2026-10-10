import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { VendorExecutionWorkspace } from "../execution/ExecutionWorkspace";
import "./vendorWork.css";

export function VendorWorkPage() {
  const auth = useAuth();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.vendor_work.read");
  return <section className="vendor-work" aria-labelledby="vendor-work-title">
    <PageHeader id="vendor-work-title" eyebrow="Vendor workspace" title="Assigned work" description="Acknowledge Main Line work, commit dates and report daily progress. Completed work is verified by the Site Manager before Client review." />
    {canRead ? <VendorExecutionWorkspace /> : <PageState state="error" message="You do not have permission to view vendor work." />}
  </section>;
}
