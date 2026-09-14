import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { AsyncState } from "../../components/ui/AsyncState";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { getLead, getLeadActivities, leadKeys } from "./leadsApi";

export function LeadQuickReview({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { authorization } = useAuth();
  const canRead = hasFrontendPermission(authorization, "estimation.lead.read");
  const canReadActivities = hasFrontendPermission(authorization, "estimation.lead_activity.read");
  const lead = useQuery({ queryKey: leadKeys.detail(leadId), queryFn: () => getLead(leadId), enabled: canRead });
  const activities = useQuery({ queryKey: leadKeys.activities(leadId), queryFn: () => getLeadActivities(leadId), enabled: canRead && canReadActivities });
  const item = lead.isSuccess ? lead.data : null;

  return <ContextPanel title="Lead review" description={canRead && item ? item.projectName : undefined} onClose={onClose} width="medium">
    {!canRead ? <p role="status">You do not have access to this lead.</p> : lead.isPending ? <AsyncState state="loading" message="Loading lead details…" /> : lead.isError ? <AsyncState state="error" message="This lead is unavailable." actionLabel="Try again" onAction={() => void lead.refetch()} /> : item ? <div className="lead-quick-review">
      <header><h3>{item.clientName}</h3><p>{item.stage.replaceAll("_", " ")}</p></header>
      <dl className="lead-quick-review__metadata">
        <div><dt>Project</dt><dd>{item.projectName}</dd></div>
        <div><dt>Property</dt><dd>{item.propertyType} · {item.location}</dd></div>
        <div><dt>Email</dt><dd>{item.clientEmail}</dd></div>
        <div><dt>Mobile</dt><dd>{item.clientMobile}</dd></div>
        <div><dt>Budget</dt><dd>₹{item.budgetMin?.toLocaleString("en-IN") ?? "—"} – ₹{item.budgetMax?.toLocaleString("en-IN") ?? "—"}</dd></div>
        <div><dt>Next action</dt><dd>{item.nextAction}<small>{new Date(item.nextActionAt).toLocaleString()}</small></dd></div>
      </dl>
      {canReadActivities ? <section aria-label="Recent follow-ups"><h3>Recent follow-ups</h3>
        {activities.isPending ? <p role="status">Loading follow-ups…</p> : activities.isError ? <AsyncState state="error" message="Follow-ups are unavailable." actionLabel="Retry follow-ups" onAction={() => void activities.refetch()} /> : activities.data.items.length ? <ol className="lead-timeline">{activities.data.items.map((entry) => <li key={entry.id}><strong>{entry.type}</strong><span>{entry.note}</span><small>{new Date(entry.occurredAt).toLocaleString()}</small></li>)}</ol> : <p>No follow-ups recorded.</p>}
      </section> : null}
      <Link className="ui-button ui-button--primary" to={`/estimator-sales/leads/${encodeURIComponent(leadId)}`}>Open lead workspace</Link>
    </div> : null}
  </ContextPanel>;
}
