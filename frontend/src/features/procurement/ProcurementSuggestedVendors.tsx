import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ProcurementVendorReference } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { getVendorSuggestions, vendorSuggestionKeys } from "./vendorSuggestionsApi";
import { VendorKpiPlaceholder } from "./VendorKpiPlaceholder";
import "./vendorProcurement.css";

interface Props { projectId: string; onSelect: (vendor: ProcurementVendorReference) => void; disabled?: boolean }
export function ProcurementSuggestedVendors({ projectId, onSelect, disabled = false }: Props) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({ queryKey: vendorSuggestionKeys.page(projectId, offset), queryFn: ({ signal }) => getVendorSuggestions(projectId, offset, signal), staleTime: 30_000 });
  const suggestions = query.data?.items.filter((item) => item.status === "suggested" && item.vendor.status === "active") ?? [];
  return <section className="procurement-suggested-vendors" aria-label="Project vendor recommendations">
    <h3>Suggested by Sales Manager</h3>
    {query.isPending ? <p role="status">Loading vendor suggestions…</p> : query.isError ? <InlineMessage tone="warning">Suggestions are unavailable. You can still search saved vendors.<Button size="compact" variant="quiet" onClick={() => void query.refetch()}>Retry suggestions</Button></InlineMessage> : <>
      {suggestions.length ? <ul className="vendor-suggestions-list">{suggestions.map((item) => <li key={item.id}><div><strong>{item.vendor.name}</strong><small>Suggested by {item.suggestedBy.name}</small>{item.note ? <p>{item.note}</p> : null}</div><Button variant="secondary" size="compact" disabled={disabled || query.isFetching} aria-label={`Use ${item.vendor.name}`} onClick={() => onSelect(item.vendor)}>Use vendor</Button></li>)}</ul> : <p>No active suggestions on this page. Choose from the saved vendor directory below.</p>}
      {query.data && (query.data.total > 20 || offset > 0) ? <nav className="vendor-procurement__pagination" aria-label="Recommended vendor pages"><Button variant="quiet" size="compact" disabled={!offset || query.isFetching} onClick={() => setOffset((value) => Math.max(0, value - 20))}>Previous suggestions</Button><Button variant="quiet" size="compact" disabled={offset + 20 >= query.data.total || query.isFetching} onClick={() => setOffset((value) => value + 20)}>Next suggestions</Button></nav> : null}
    </>}
    <VendorKpiPlaceholder />
  </section>;
}
