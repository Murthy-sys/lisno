import type { EstimationPreparationSource, WorkOrderIssueReadiness } from "../../api/types";
import "./procurementEstimateSource.css";

export function WorkOrderReadiness({ readiness }: { readiness?: WorkOrderIssueReadiness }) {
  if (!readiness?.required) return null;
  return <div className="procurement-source__readiness" aria-label="Work order release conditions">
    <strong>{readiness.canIssue ? "Ready for work order issue" : "Work order issue is blocked"}</strong>
    {readiness.blockers.length ? <ul>{readiness.blockers.map((message, index) => <li key={index}>{message}</li>)}</ul> : null}
    {readiness.canIssue ? <p>Release conditions are satisfied. Issue the approved order explicitly to release vendor work.</p> : null}
  </div>;
}

export function ProcurementEstimateSource({ source, readiness, stale = false }: {
  source?: EstimationPreparationSource; readiness?: WorkOrderIssueReadiness; stale?: boolean;
}) {
  if (!source) return null;
  return <section className="procurement-source" aria-label="Procurement estimate source">
    <p className="eyebrow">{source.kind === "approved_final" ? "Final approved estimate" : source.kind === "approved_pre" ? "Approved pre-estimate" : "Released post-estimate"} · Version {source.estimateVersion}</p>
    <h2>{source.kind === "approved_final" ? "Prepare and release approved work" : "Procurement preparation is open"}</h2>
    <p>{source.kind === "approved_final" ? "Reconcile earlier preparation with this final source before issuing work orders. Issued orders retain their original approved records." : "Prepare quantities, obtain vendor bids and seek internal approval using this frozen estimate. Final client approval and initial payment are required before work orders can be issued."}</p>
    {stale ? <p role="status">Refreshing the estimate source and release conditions. Changes are paused.</p> : <WorkOrderReadiness readiness={readiness} />}
  </section>;
}
