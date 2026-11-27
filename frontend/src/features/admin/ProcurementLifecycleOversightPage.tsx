import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { ProcurementSchedulerHealth } from "../../../../shared/procurement/notifications";
import { apiClient, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { LifecycleWorkspace } from "../procurement/lifecycle/LifecycleWorkspace";
import { lifecycleApi, lifecycleKeys } from "../procurement/lifecycle/lifecycleApi";
import { lifecycleDate } from "../procurement/lifecycle/LifecycleShared";
import { formatPaise } from "../finance/financeFormat";

export function ProcurementLifecycleOversightPage() {
  const { projectId = "" } = useParams(); const auth = useAuth(); const actorId = auth.user?.id ?? "";
  const canRead = auth.user?.role === "super_admin" && hasFrontendPermission(auth.authorization, "procurement.lifecycle.oversight");
  const summary = useQuery({ queryKey: lifecycleKeys.view(actorId, projectId, "admin", "summary"), queryFn: () => lifecycleApi(projectId, "admin").summary(), enabled: canRead && Boolean(projectId), retry: false });
  const health = useQuery({ queryKey: ["procurement-lifecycle", actorId, "scheduler-health"], queryFn: () => apiClient.get<ProcurementSchedulerHealth>("/admin/procurement-lifecycle/health"), enabled: canRead, refetchInterval: 60000, retry: false });
  const revoked = summary.error instanceof ApiError && [401, 403, 404].includes(summary.error.status);
  if (!canRead || revoked) return <p role="alert">This Procurement project is not available to your account.</p>;
  return <section aria-labelledby="procurement-oversight-title">
    <PageHeader id="procurement-oversight-title" eyebrow="Procurement oversight" title={summary.data?.projectName ?? "Project procurement"} description="Review vendor obligations, inspections and handover. Procurement declarations keep their own signer; final project completion remains a separate Super Admin decision." breadcrumb={<Link to="/admin/procurement">Back to Procurement</Link>} />
    <div className="lc-actions"><Link to={`/admin/projects/${encodeURIComponent(projectId)}`}>Open project</Link><Link to={`/admin/project-completion?projectId=${encodeURIComponent(projectId)}`}>Review final project completion</Link></div>
    <details className="lc-panel"><summary>Internal reminder service</summary>{health.data ? <dl className="lc-summary"><div><dt>Service status</dt><dd>{health.data.status.replaceAll("_", " ")}</dd></div><div><dt>Last successful pass</dt><dd>{lifecycleDate(health.data.lastSuccessAt)}</dd></div><div><dt>Projects awaiting a pass</dt><dd>{health.data.backlog}</dd></div><div><dt>Target reminder delay</dt><dd>{Math.ceil(health.data.targetDelaySeconds / 60)} minutes in healthy operation</dd></div></dl> : <p role={health.isError ? "alert" : "status"}>{health.isError ? "Reminder service health could not be loaded." : "Loading reminder service health…"}</p>}{health.data?.failureCode ? <p role="alert">The reminder service needs attention. Current payment balances and overdue dates remain visible.</p> : null}<Button variant="secondary" disabled={health.isFetching} onClick={() => void health.refetch()}>Refresh reminder health</Button></details>
    <LifecycleWorkspace key={`${actorId}:${projectId}`} actorId={actorId} projectId={projectId} audience="admin" disabled={summary.isError}>
      <div className="lc-panel"><h2>Bids & vendor appointment</h2><p>Issued vendor orders supply the payment and work records shown in these tabs.</p><Link to="/admin/purchase-orders">Open purchase order approvals</Link>{summary.isPending ? <p role="status">Loading issued orders…</p> : summary.isError ? <p role="alert">Issued orders could not be loaded. <Button variant="secondary" onClick={() => void summary.refetch()}>Retry project</Button></p> : !summary.data?.source.orders.length ? <p>No issued orders are available for this project.</p> : <ul className="lc-history">{summary.data.source.orders.map(order => <li key={order.id}><strong>{order.orderNumber} · {order.vendorName}</strong><span>Issued revision {order.revision} · {formatPaise(order.totalPaise)}</span></li>)}</ul>}</div>
    </LifecycleWorkspace>
  </section>;
}
