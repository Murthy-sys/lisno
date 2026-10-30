import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { ApiError } from "../../api/client";
import { getProcurementMainLineSuggestions, procurementBasketKeys } from "./procurementBasketApi";
import { procurementError } from "./procurementPresentation";
import type { PMVendorSuggestionQuery } from "../project-manager/pmEstimateTypes";
import "./ProcurementBasketSuggestions.css";

const PAGE_SIZE = 20;
export interface BasketSelectedVendor { vendorId: string; name: string; }
interface Props {
  projectId: string;
  basketId: string;
  sourceKey: string | null;
  disabled: boolean;
  isSelected: (vendorId: string) => boolean;
  onToggle: (vendor: BasketSelectedVendor, selected: boolean) => void;
}

export function ProcurementBasketSuggestions(props: Props) {
  const { user } = useAuth();
  return <BasketSuggestionsContent key={`${user?.id}:${props.projectId}:${props.basketId}:${props.sourceKey}`} {...props} />;
}

function BasketSuggestionsContent({ projectId, basketId, sourceKey, disabled, isSelected, onToggle }: Props) {
  const headingId = useId();
  const { user } = useAuth();
  const client = useQueryClient();
  const [mainLineId, setMainLineId] = useState("");
  const [source, setSource] = useState<PMVendorSuggestionQuery["source"]>("current");
  const [offset, setOffset] = useState(0);
  const filters = { source, mainLineId: mainLineId || undefined, limit: PAGE_SIZE, offset };
  const key = procurementBasketKeys.suggestions(projectId, basketId, user?.id, sourceKey, filters);
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getProcurementMainLineSuggestions(projectId, basketId, filters, signal),
    refetchInterval: 15000, refetchIntervalInBackground: false, retry: false });
  const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  useEffect(() => {
    if (!denied) return;
    for (const item of client.getQueryCache().findAll({ queryKey: ["procurement", "basket-vendor-suggestions", projectId, basketId, user?.id] })) item.setState({ data: undefined, dataUpdatedAt: 0 });
  }, [client, projectId, basketId, user?.id, denied]);

  return <section className="procurement-basket-suggestions" aria-labelledby={headingId}>
    <div className="procurement-basket-suggestions__heading"><div><h4 id={headingId}>Vendor suggestions</h4><p>Review the recommended work before selecting a vendor. Invitations cover the basket BOQ, which may include other approved items.</p></div>
      <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh suggestions</button>
    </div>
    {denied ? <p role="alert">Suggestions are unavailable for your current project access.</p> : <>
      <div className="procurement-basket-suggestions__filters"><label>Suggested item<select value={mainLineId} onChange={event => { setMainLineId(event.target.value); setOffset(0); }}><option value="">All approved items</option>{query.data?.mainLines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}</select></label>
        <label>Suggestion source<select value={source} onChange={event => { setSource(event.target.value as PMVendorSuggestionQuery["source"]); setOffset(0); }}><option value="current">Current approved source</option><option value="history">Previous sources</option><option value="all">All sources</option></select></label></div>
      {query.isPending ? <p role="status">Loading vendor suggestions…</p> : query.isError ? <div role="alert"><p>{procurementError(query.error, "Vendor suggestions could not be loaded.")}</p><p>The vendor directory remains available below.</p><button type="button" onClick={() => void query.refetch()}>Retry suggestions</button></div> : null}
      {query.data ? <>
        {query.data.items.length ? <div className="procurement-basket-suggestions__list">{query.data.items.map(suggestion => {
          const selectable = suggestion.scope === "main_line" && suggestion.mainLine?.mainBasketId === basketId && suggestion.sourceState === "current" && suggestion.status === "suggested" && suggestion.bidEligible;
          return <article key={suggestion.id} className="procurement-basket-suggestion" aria-label={`${suggestion.vendor.name} suggested for ${suggestion.mainLine?.mainLineName ?? "project-wide scope"}`}>
            <label><input type="checkbox" checked={selectable && isSelected(suggestion.vendor.id)} disabled={disabled || !selectable || query.isFetching || query.isError}
              onChange={event => onToggle({ vendorId: suggestion.vendor.id, name: suggestion.vendor.name }, event.target.checked)} />
              <span><strong>{suggestion.vendor.name}</strong><span>Suggested for {suggestion.mainLine?.mainLineName ?? "project-wide scope"}</span>{suggestion.mainLine?.itemType === "temporary" ? <small>Temporary item</small> : null}<small>{suggestion.suggestedBy.name} · Approved version {suggestion.storedSource.estimateVersion}</small></span>
            </label>
            <span className="procurement-basket-suggestion__state">{suggestion.status === "withdrawn" ? "Withdrawn" : suggestion.sourceState === "historical" ? "Previous source" : suggestion.sourceState === "unverified" ? "Source unverified" : selectable ? "Eligible for selection" : "Readiness needs review"}</span>
            {suggestion.mainLine ? <details><summary>Recommended room scope ({suggestion.mainLine.occurrences.length})</summary><ul>{suggestion.mainLine.occurrences.map(item => <li key={`${item.sectionId}:${item.sourceLineItemKey}`}>{item.roomName}</li>)}</ul></details> : null}
            {suggestion.note ? <details><summary>Recommendation note</summary><p>{suggestion.note}</p></details> : null}
            {!selectable && suggestion.readinessReasons.length ? <details><summary>Readiness details</summary>{suggestion.readinessReasons.map((reason, index) => <p key={index}>{reason}</p>)}</details> : null}
          </article>;
        })}</div> : <p className="procurement-basket-suggestions__empty">No saved suggestions match this item and source.</p>}
        <nav className="procurement-basket-suggestions__pages" aria-label="Vendor suggestion pages"><span>{query.data.total} suggestions</span><div><button type="button" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>Previous suggestions</button><button type="button" disabled={offset + PAGE_SIZE >= query.data.total || query.isFetching} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next suggestions</button></div></nav>
      </> : null}
    </>}
  </section>;
}
