import { useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { safeReturnPath } from "../../app/routePaths";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { PMBadge, PMEmpty, PMQueryState, pmDate } from "./PMShared";
import { PMVendorSuggestions } from "./PMVendorSuggestions";
import { usePMEstimate } from "./pmEstimatesApi";
import type { PMApprovedSourceRef, PMEstimateLine, PMEstimateView } from "./pmEstimateTypes";
import "./project-manager.css";
import "./pm-estimations.css";

export const pmApprovedPhaseLabel = (phase: PMApprovedSourceRef["phase"]) =>
  phase === "pre" ? "Approved pre-estimate" : phase === "post" ? "Approved final estimate" : "Approved estimate";

export function pmApprovedMoney(value: number | null): string {
  return value === null ? "Unavailable" : new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: value % 100 === 0 ? 0 : 2, maximumFractionDigits: 2
  }).format(value / 100);
}

export function pmEstimateReturnPath(projectId: string, candidate: string | null): string {
  const base = `/projects/${encodeURIComponent(projectId)}/execution`;
  const safe = safeReturnPath("site_manager", candidate);
  try {
    const parsed = new URL(safe, "https://lisno.invalid");
    if (parsed.pathname !== base) return base;
    const nested = parsed.searchParams.get("returnTo");
    if (nested) {
      const dashboard = new URL(safeReturnPath("site_manager", nested), "https://lisno.invalid");
      parsed.searchParams.set("returnTo", dashboard.pathname === "/execution" ? `${dashboard.pathname}${dashboard.search}` : "/execution");
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch { return base; }
}

interface ScopeGroup { key: string; roomName: string; basketName: string | null; lines: PMEstimateLine[]; }
function scopeGroups(lines: PMEstimateLine[]): ScopeGroup[] {
  const groups = new Map<string, ScopeGroup>();
  for (const line of lines) {
    const key = JSON.stringify([line.sectionId, line.roomId, line.mainBasketId]);
    const group = groups.get(key) ?? { key, roomName: line.roomName, basketName: line.mainBasketName, lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function ScopeTable({ group, estimate, disabled, onSuggest }: {
  group: ScopeGroup; estimate: PMEstimateView; disabled: boolean; onSuggest: (mainLineId: string, trigger: HTMLButtonElement) => void;
}) {
  return <section className="pm-estimates__scope" aria-label={`${group.roomName}${group.basketName ? ` · ${group.basketName}` : ""}`}>
    <div className="pm-estimates__scope-heading"><h2>{group.roomName}</h2>{group.basketName ? <span>{group.basketName}</span> : null}</div>
    <table className="pm-estimates__table">
      <caption className="sr-only">Approved scope for {group.roomName}{group.basketName ? `, ${group.basketName}` : ""}</caption>
      <thead><tr><th scope="col">Item / specification</th><th scope="col">Scope</th><th scope="col">Quantity</th><th scope="col">Approved rate</th><th scope="col">Approved amount</th><th scope="col">Vendor suggestion</th></tr></thead>
      <tbody>{group.lines.map(line => {
        const target = estimate.mainLines.find(item => item.mainLineId === line.mainLineId);
        const reason = !line.included ? "Excluded scope" : !target ? "Approved item mapping required" : target.unavailableReason;
        return <tr key={`${line.sectionId}:${line.sourceLineItemKey}`}>
          <th scope="row" className="pm-estimates__item"><strong>{line.mainLineName}</strong>
            {line.itemType === "temporary" ? <div><PMBadge value="Temporary item" /></div> : null}
            {line.specification || line.dimensions.length ? <details className="pm-estimates__spec"><summary>Specification{line.dimensions.length ? " & dimensions" : ""}</summary>
              {line.specification ? <p>{line.specification}</p> : null}
              {line.dimensions.length ? <dl>{line.dimensions.map((dimension, index) => <div key={`${dimension.label}:${index}`}><dt>{dimension.label}</dt><dd>{dimension.value}{dimension.unit ? ` ${dimension.unit}` : ""}</dd></div>)}</dl> : null}
            </details> : null}
          </th>
          <td data-label="Scope"><PMBadge value={line.included ? "Included" : "Excluded"} /></td>
          <td data-label="Quantity">{line.quantity === null ? "Unavailable" : line.quantity}{line.unit ? <span className="pm-estimates__unit"> {line.unit}</span> : null}</td>
          <td data-label="Approved rate" className="pm-estimates__number">{pmApprovedMoney(line.ratePaise)}</td>
          <td data-label="Approved amount" className="pm-estimates__number">{line.included ? pmApprovedMoney(line.amountPaise) : "Excluded"}</td>
          <td className="pm-estimates__suggest">
            <Button size="compact" variant="secondary" disabled={disabled || !line.included || !target?.canSuggest}
              aria-label={`Suggest vendor for ${line.mainLineName} in ${line.roomName}`} onClick={event => target && onSuggest(target.mainLineId, event.currentTarget)}>Suggest vendor</Button>
            {reason ? <small>{reason}</small> : null}
          </td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}

export function ProjectManagerEstimationsPage({ projectId: suppliedProjectId }: { projectId?: string }) {
  const { projectId: routeProjectId } = useParams();
  const { user } = useAuth();
  const projectId = suppliedProjectId ?? routeProjectId ?? "";
  const [params] = useSearchParams();
  return <EstimatePageContent key={`${user?.id}:${projectId}`} projectId={projectId} returnTo={pmEstimateReturnPath(projectId, params.get("returnTo"))} />;
}

function EstimatePageContent({ projectId, returnTo }: { projectId: string; returnTo: string }) {
  const query = usePMEstimate(projectId);
  const { user } = useAuth();
  const [request, setRequest] = useState<{ mainLineId?: string; sequence: number }>({ sequence: 0 });
  const suggestionTriggerRef = useRef<HTMLButtonElement | null>(null);
  if (!projectId || user?.role !== "site_manager") return <section className="pm-workspace pm-estimates"><PMEmpty title="Project access unavailable">Open an assigned project to view its approved estimate.</PMEmpty><Link to="/execution">Dashboard</Link></section>;
  return <section className="pm-workspace pm-estimates" aria-label="Project estimations">
    <Link to={returnTo} className="pm-estimates__back">Back to project</Link>
    <PMQueryState query={query}>{estimate => <>
      <header className="pm-estimates__header">
        <div><p className="pm-estimates__eyebrow">Project estimations</p><h1>{estimate.project.name}</h1>
          <div className="pm-estimates__source"><PMBadge value="Read only" />{estimate.source ? <span>{pmApprovedPhaseLabel(estimate.source.phase)} · Version {estimate.source.estimateVersion}</span> : null}</div>
          {estimate.approvedAt ? <p className="pm-estimates__approval">Approved {pmDate(estimate.approvedAt)}</p> : null}
        </div>
        <Button size="compact" variant="secondary" busy={query.isFetching} onClick={() => void query.refetch()}>Refresh estimate</Button>
      </header>
      {estimate.availability !== "available" || !estimate.source ? <PMEmpty title="Approved estimate unavailable">{estimate.reason ?? "An approved estimate will appear here when its source is ready."}</PMEmpty> : <>
        <section className="pm-estimates__commercial" aria-label="Approved commercial summary">
          <p>Approved amounts</p><dl>
            <div><dt>Subtotal before GST</dt><dd>{pmApprovedMoney(estimate.totals.subtotalPaise)}</dd></div>
            <div><dt>GST</dt><dd>{pmApprovedMoney(estimate.totals.gstPaise)}</dd></div>
            <div className="pm-estimates__total"><dt>Approved total</dt><dd>{pmApprovedMoney(estimate.totals.totalPaise)}</dd></div>
          </dl>
        </section>
        {!estimate.writeAvailability.available ? <p className="pm-quiet-state">{estimate.writeAvailability.reason ?? "Vendor suggestions are currently unavailable."}</p> : null}
        {estimate.lines.length ? <div className="pm-estimates__scope-list">{scopeGroups(estimate.lines).map(group => <ScopeTable key={group.key} group={group} estimate={estimate}
          disabled={query.isError || query.isFetching || !estimate.writeAvailability.available}
          onSuggest={(mainLineId, trigger) => { suggestionTriggerRef.current = trigger; setRequest(previous => ({ mainLineId, sequence: previous.sequence + 1 })); }} />)}</div>
          : <PMEmpty title="No approved scope lines">This approved source does not contain readable scope lines.</PMEmpty>}
      </>}
      <PMVendorSuggestions key={request.sequence} projectId={projectId} estimate={estimate} initialMainLineId={request.mainLineId} initialReturnFocusRef={suggestionTriggerRef} />
    </>}</PMQueryState>
  </section>;
}
