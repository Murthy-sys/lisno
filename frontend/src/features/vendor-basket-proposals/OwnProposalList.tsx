import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Select } from "../../components/ui/Field";
import { PageState } from "../../components/ui/PageState";
import { vendorBasketRequestKeys } from "../procurement/vendorBasketRequestApi";
import { listOwnProposals, proposalKeys } from "./proposalApi";
import { proposalDenied, proposalError, proposalStatusLabel, proposalStatusLabels } from "./proposalPresentation";
import { ProposalIntakeWorkspace } from "./ProposalIntakeWorkspace";
import { ProposalWorkspace } from "./ProposalWorkspace";
import type { ProposalDetail, ProposalStatus, ProposalSummary } from "./proposalTypes";
import "./proposal.css";

export function OwnProposalList({ onClose, onBusyChange, draftsOnly = false, onSubmitted }: { onClose: () => void; onBusyChange?: (busy: boolean) => void; draftsOnly?: boolean; onSubmitted?: (proposal: ProposalDetail) => void }) {
  const auth = useAuth();
  const client = useQueryClient();
  const actor = auth.user?.id ?? "";
  const allowed = auth.user?.role === "procurement" && hasFrontendPermission(auth.authorization, "procurement.vendor_basket_proposal.read");
  const [status, setStatus] = useState<ProposalStatus | "">(draftsOnly ? "draft" : "");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Pick<ProposalSummary, "id" | "requestMode"> | null>(null);
  const [deniedActor, setDeniedActor] = useState<string | null>(null);
  const decisions = useRef(new Map<string, ProposalStatus>());
  const query = useQuery({ queryKey: [...proposalKeys.mine(actor), draftsOnly ? "draft" : status, offset], queryFn: ({ signal }) => listOwnProposals(draftsOnly ? "draft" : status, offset, 20, signal), enabled: allowed && deniedActor !== actor, refetchInterval: 30_000, refetchOnWindowFocus: true, gcTime: 0 });
  const denied = proposalDenied(query.error) || !allowed || deniedActor === actor;
  useEffect(() => { setSelected(null); setOffset(0); decisions.current.clear(); }, [actor]);
  useEffect(() => {
    if (denied) { setDeniedActor(actor); setSelected(null); void client.cancelQueries({ queryKey: proposalKeys.actor(actor) }); client.removeQueries({ queryKey: proposalKeys.actor(actor) }); }
  }, [denied, client, actor]);
  useEffect(() => () => { void client.cancelQueries({ queryKey: proposalKeys.actor(actor) }); client.removeQueries({ queryKey: proposalKeys.actor(actor) }); }, [actor, client]);
  useEffect(() => {
    let approved = false;
    for (const proposal of query.data?.items ?? []) { if (proposal.status === "fulfilled" && decisions.current.get(proposal.id) !== "fulfilled") approved = true; decisions.current.set(proposal.id, proposal.status); }
    if (approved) { void client.invalidateQueries({ queryKey: ["ai-estimator-knowledge"] }); }
  }, [query.data, client]);
  const SelectedWorkspace = selected?.requestMode === "hierarchy_intake" ? ProposalIntakeWorkspace : ProposalWorkspace;
  return <><ContextPanel title={draftsOnly ? "Saved drafts" : "My basket requests"} eyebrow="Procurement" description={draftsOnly ? "Continue a saved basket request before sending it to Super Admin." : "Resume saved drafts and follow Super Admin decisions. Approved baskets can be selected in your vendor form."} onClose={onClose} width="wide">
    {denied ? <PageState state="error" message="You do not have permission to view basket proposals." /> : <>
      {!draftsOnly ? <Field id="own-basket-status" label="Request status">{props => <Select {...props} value={status} onChange={event => { setStatus(event.target.value as ProposalStatus | ""); setOffset(0); }}><option value="">All requests and drafts</option>{Object.entries({ ...proposalStatusLabels, fulfilled: "Approved", rejected: "Sent back / Rejected" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}</Field> : null}
      {query.isPending ? <PageState state="loading" message="Loading your basket requests…" /> : query.isError ? <PageState state="error" message={proposalError(query.error)} action={{ label: "Retry requests", onAction: () => void query.refetch() }} /> : !query.data.items.length ? <PageState state="empty" message={draftsOnly ? "No saved drafts. Create a Main Basket or Sub-Basket from the vendor editor to start." : "No basket requests in this view. Create a Main Basket from the vendor editor to start a request draft."} /> : <ul className="basket-proposal__request-list">{query.data.items.map(proposal => <li key={proposal.id}><div><h3>{proposal.name}</h3>{proposal.vendorName ? <p>{proposal.vendorName}</p> : null}<p>{proposal.target?.kind === "new_sub_basket" ? `Sub-Basket under ${proposal.targetParentName ?? "Unavailable Main Basket"}` : "New Main Basket"}</p><p>{proposalStatusLabel(proposal.status, proposal.requestMode)} · {proposal.counts.subBaskets} Sub-Baskets · {proposal.counts.mainLines} Main Lines</p>{proposal.reason ? <p>Reason: {proposal.reason}</p> : null}</div><Button variant="secondary" onClick={() => setSelected({ id: proposal.id, requestMode: proposal.requestMode })}>{proposal.status === "draft" ? "Resume draft" : proposal.requestMode === "hierarchy_intake" ? "View request" : "View configuration"}</Button></li>)}</ul>}
      {query.data ? <div className="basket-proposal__actions"><p>{query.data.pagination.total} {draftsOnly ? "drafts" : "requests"}</p><Button variant="quiet" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(value => Math.max(0, value - 20))}>Previous</Button><Button variant="quiet" disabled={!query.data.pagination.hasMore || query.isFetching} onClick={() => setOffset(value => value + 20)}>Next</Button></div> : null}
    </>}
  </ContextPanel>{selected && allowed && !denied ? <SelectedWorkspace key={`${actor}:${selected.id}`} proposalId={selected.id} scope="procurement" onClose={() => setSelected(null)} onBusyChange={onBusyChange} onSubmitted={proposal => { setSelected(null); void client.invalidateQueries({ queryKey: proposalKeys.mine(actor) }); void client.invalidateQueries({ queryKey: vendorBasketRequestKeys.mineActor(actor) }); onSubmitted?.(proposal); onClose(); }} /> : null}</>;
}
