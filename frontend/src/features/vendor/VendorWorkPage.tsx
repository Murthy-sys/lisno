import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { VendorExecutionWorkspace } from "../execution/ExecutionWorkspace";
import { PMVendorCoordination } from "../project-manager/PMCounterpartPanel";
import "./vendorWork.css";

export function VendorWorkPage() {
  const auth = useAuth();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.vendor_work.read");
  return <section className="vendor-work" aria-labelledby="vendor-work-title">
    <PageHeader id="vendor-work-title" eyebrow="Vendor workspace" title="Assigned work" description="Start work, share progress photos, report a hold or mark your work completed. The Project Manager verifies completion before Client acceptance." />
    {canRead ? <><PMVendorCoordination /><VendorExecutionWorkspace /></> : <PageState state="error" message="You do not have permission to view vendor work." />}
  </section>;
}
