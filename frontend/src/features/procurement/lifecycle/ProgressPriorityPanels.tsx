import { useState, type ReactNode } from "react";
import type { LifecycleItem, ProcurementReviewRound } from "./lifecycleApi";

type Priority = LifecycleItem["priority"];

function groupState(priority: Priority, items: LifecycleItem[], round?: ProcurementReviewRound, statusMessage?: string) {
  if (statusMessage) return statusMessage;
  if (!items.length) return "No appointed items";
  if (priority === null) return "Set priority in Configuration";
  if (!round || round.version === 0) return "Open review to record checks";
  if (round.status === "paused") return "Reviews paused";
  if (round.status === "submitted") return "Review submitted";
  if (round.status === "missed") return "Review missed";
  if (round.sourceChanged) return "Reconcile source changes";
  const members = round.members.filter(member => member.item.priority === priority);
  if (members.some(member => member.blockingItemIds.length > 0)) return "Waiting for earlier-priority checks";
  return members.every(member => member.check) ? "Checks recorded" : "Checks pending";
}

function PriorityPanel({ priority, items, round, unavailable, loading, statusMessage, renderItem }: {
  priority: Priority; items: LifecycleItem[]; round?: ProcurementReviewRound; unavailable?: string; loading?: boolean;
  statusMessage?: string; renderItem: (item: LifecycleItem) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(priority === "P1");
  const label = priority ?? "Priority not set";
  const checked = round?.members.filter(member => member.item.priority === priority && member.check).length;
  const count = unavailable ? unavailable : `${items.length} ${items.length === 1 ? "item" : "items"}${round && round.version > 0 ? ` · ${checked} of ${items.length} checked` : ""}`;
  const state = loading ? "Loading project records" : unavailable ? "Refresh project records" : groupState(priority, items, round, statusMessage);
  return <details className="lc-priority" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary aria-label={`${label}: ${count}. ${state}`}><span className="lc-priority-heading"><strong>{label}</strong><span className="lc-priority-count">{count}</span><span className="lc-priority-state">{state}</span></span></summary>
    <div className="lc-priority-content">
      {unavailable ? <p className="lc-muted">{loading ? "Loading appointed items and review checks." : "Item records are unavailable. Refresh before reviewing this priority."}</p> : items.length ? items.map(renderItem) : <p className="lc-muted">No {label} items in {round ? "this review round" : "the current appointed work"}.</p>}
    </div>
  </details>;
}

export function ProgressPriorityPanels({ items, round, ...props }: {
  items: LifecycleItem[]; round?: ProcurementReviewRound; unavailable?: string; loading?: boolean; statusMessage?: string;
  renderItem: (item: LifecycleItem) => ReactNode;
}) {
  return <div className="lc-priorities">{(["P1", "P2", "P3", null] as const).map(priority => {
    const members = items.filter(item => item.priority === priority);
    if (priority === null && !members.length) return null;
    return <PriorityPanel key={priority ?? "unresolved"} priority={priority} items={members} round={round} {...props} />;
  })}</div>;
}
