import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PaymentsPanel } from "../procurement/lifecycle/PaymentsPanel";
import "../procurement/lifecycle/lifecycle.css";

export function ProcurementPaymentControls({ projectId }: { projectId: string }) {
  const auth = useAuth();
  if (auth.user?.role !== "finance_head" || !hasFrontendPermission(auth.authorization, "finance.procurement_payments.manage")) return null;
  return <section aria-label="Finance vendor payment controls" className="lc-workspace">
    <PaymentsPanel key={`${auth.user.id}:${projectId}`} projectId={projectId} actorId={auth.user.id} audience="finance" />
  </section>;
}
