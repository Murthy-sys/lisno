import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import vendorHeader from "../../assets/vendor-directory-header.webp";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { ContextPanel } from "../../components/ui/ContextPanel";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { OwnProposalList } from "../vendor-basket-proposals/OwnProposalList";
import { ProposalWorkspace } from "../vendor-basket-proposals/ProposalWorkspace";
import { proposalKeys } from "../vendor-basket-proposals/proposalApi";
import { proposalDenied, proposalError, proposalStatusLabels } from "../vendor-basket-proposals/proposalPresentation";
import type { ProposalDetail } from "../vendor-basket-proposals/proposalTypes";
import { vendorDirectoryPageSizes, type VendorDirectoryPageSize } from "./VendorDirectoryTable";
import { listOwnVendorBasketRequests, vendorBasketRequestKeys, type OwnVendorBasketRequestFilters, type VendorBasketRequest } from "./vendorBasketRequestApi";
import "./vendorDirectory.css";
import "./procurementRequests.css";

const emptyFilters: OwnVendorBasketRequestFilters = { search: "", status: "", targetKind: "" };
const requestType = (request: VendorBasketRequest) => request.target?.kind === "new_sub_basket" ? "Sub-Basket" : "Main Basket";
const parentName = (request: VendorBasketRequest) => request.target?.kind === "new_sub_basket" ? request.targetParentName || "Unavailable Main Basket" : "Not applicable";
const dateLabel = (date: string) => Number.isNaN(Date.parse(date)) ? "Date unavailable" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));

function RequestStatus({ request }: { request: VendorBasketRequest }) {
  return <span className={`vendor-directory__status${request.status === "pending" ? " vendor-directory__status--review" : request.status === "rejected" ? " vendor-directory__status--inactive" : ""}`}>{proposalStatusLabels[request.status]}</span>;
}

export function ProcurementRequestsPage() {
  const auth = useAuth();
  const actor = auth.user?.id ?? "";
  const allowed = auth.user?.role === "procurement" && hasFrontendPermission(auth.authorization, "procurement.vendor_directory.read");
  const canReadProposals = allowed && hasFrontendPermission(auth.authorization, "procurement.vendor_basket_proposal.read");
  return <RequestDirectory key={`${actor}:${allowed}:${canReadProposals}`} actor={actor} allowed={allowed} canReadProposals={canReadProposals} />;
}

function RequestDirectory({ actor, allowed, canReadProposals }: { actor: string; allowed: boolean; canReadProposals: boolean }) {
  const client = useQueryClient();
  const id = useId();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<VendorDirectoryPageSize>(10);
  const [selected, setSelected] = useState<VendorBasketRequest | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decisions = useRef(new Map<string, VendorBasketRequest["status"]>());
  const query = useQuery({
    queryKey: vendorBasketRequestKeys.minePage(actor, filters, pageSize, offset),
    queryFn: ({ signal }) => listOwnVendorBasketRequests(pageSize, offset, filters, signal),
    enabled: allowed && !accessDenied, gcTime: 0, refetchInterval: 30_000, refetchOnWindowFocus: true
  });
  const denied = !allowed || accessDenied || proposalDenied(query.error);
  const total = query.data?.pagination.total;
  const selectedRequest = query.data?.items.find(request => request.id === selected?.id) ?? selected;
  useEffect(() => () => {
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    void client.cancelQueries({ queryKey: vendorBasketRequestKeys.mineActor(actor) });
    client.removeQueries({ queryKey: vendorBasketRequestKeys.mineActor(actor) });
  }, [actor, client]);
  useEffect(() => {
    if (!denied) return;
    setAccessDenied(true); setSelected(null); setDraftsOpen(false);
    void client.cancelQueries({ queryKey: vendorBasketRequestKeys.mineActor(actor) });
    client.removeQueries({ queryKey: vendorBasketRequestKeys.mineActor(actor) });
  }, [denied, actor, client]);
  useEffect(() => {
    if (total !== undefined && !query.isError && !query.isFetching && offset >= total && offset > 0) setOffset(Math.max(0, Math.ceil(total / pageSize) - 1) * pageSize);
  }, [total, offset, pageSize, query.isError, query.isFetching]);
  useEffect(() => {
    if (query.isError) return;
    let approved = false;
    for (const request of query.data?.items ?? []) {
      if (request.status === "fulfilled" && decisions.current.get(request.id) !== "fulfilled") approved = true;
      decisions.current.set(request.id, request.status);
    }
    if (approved) void client.invalidateQueries({ queryKey: ["ai-estimator-knowledge"] });
  }, [query.data, query.isError, client]);
  function changeFilters(next: Partial<OwnVendorBasketRequestFilters>) { setFilters(current => ({ ...current, ...next })); setOffset(0); setSelected(null); }
  function cancelSearch() { if (searchTimer.current !== null) { clearTimeout(searchTimer.current); searchTimer.current = null; } }
  function searchChanged(value: string) {
    setSearch(value); cancelSearch();
    searchTimer.current = setTimeout(() => { changeFilters({ search: value.trim() }); searchTimer.current = null; }, 300);
  }
  function apply(event: FormEvent) { event.preventDefault(); cancelSearch(); changeFilters({ search: search.trim() }); }
  function reset() { cancelSearch(); setSearch(""); setFilters(emptyFilters); setOffset(0); setSelected(null); }
  function submitted(proposal: ProposalDetail) {
    setSelected(null); setDraftsOpen(false); setNotice(`${proposal.name} submitted to Super Admin.`);
    void client.invalidateQueries({ queryKey: vendorBasketRequestKeys.mineActor(actor) });
    void client.invalidateQueries({ queryKey: proposalKeys.mine(actor) });
    requestAnimationFrame(() => refreshButton.current?.focus());
  }
  if (denied) return <PageState state="error" message="You do not have permission to view these requests." />;
  const items = query.data?.items ?? [];
  return <section className="vendor-directory procurement-requests" aria-labelledby={`${id}-title`}>
    <header className="vendor-directory__hero">
      <img className="vendor-directory__art" src={vendorHeader} alt="" width="1600" height="538" />
      <div className="vendor-directory__intro"><p className="vendor-directory__eyebrow">Procurement</p><h1 id={`${id}-title`}>All my requests</h1><p>Track your Main Basket and Sub-Basket requests and Super Admin decisions.</p></div>
    </header>
    <section className="vendor-directory__workspace" aria-labelledby={`${id}-submitted`}>
      <div className="vendor-directory__heading"><div><h2 id={`${id}-submitted`}>Submitted requests</h2><p>Requests you have sent for approval.</p></div><div className="procurement-requests__actions">{canReadProposals ? <Button variant="secondary" onClick={() => setDraftsOpen(true)}>Saved drafts</Button> : null}<Button ref={refreshButton} variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh</Button></div></div>
      <form className="vendor-directory__filters" role="search" aria-label="Search my requests" onSubmit={apply}>
        <Field id={`${id}-search`} label="Search requests" className="vendor-directory__search">{props => <Input {...props} type="search" value={search} maxLength={100} placeholder="Requested basket name" onChange={event => searchChanged(event.target.value)} />}</Field>
        <Field id={`${id}-status`} label="Status">{props => <Select {...props} value={filters.status} onChange={event => changeFilters({ status: event.target.value as OwnVendorBasketRequestFilters["status"] })}><option value="">All statuses</option><option value="pending">Awaiting Super Admin</option><option value="fulfilled">Approved and active</option><option value="rejected">Rejected</option></Select>}</Field>
        <Field id={`${id}-type`} label="Request type">{props => <Select {...props} value={filters.targetKind} onChange={event => changeFilters({ targetKind: event.target.value as OwnVendorBasketRequestFilters["targetKind"] })}><option value="">All types</option><option value="new_main_basket">Main Basket</option><option value="new_sub_basket">Sub-Basket</option></Select>}</Field>
        <Button variant="secondary" onClick={reset}>Reset</Button>
      </form>
      {notice ? <p role="status" className="vendor-directory__notice">{notice}</p> : null}
      {query.isPending ? <PageState state="loading" message="Loading your requests…" /> : query.isError && !query.data ? <PageState state="error" message={proposalError(query.error)} action={{ label: "Retry requests", onAction: () => void query.refetch() }} /> : <>
        {query.isError ? <InlineMessage tone="warning" action={<Button variant="secondary" onClick={() => void query.refetch()}>Retry requests</Button>}>Requests could not be refreshed. Showing the last loaded statuses.</InlineMessage> : null}
        {!items.length ? <PageState state="empty" message={Object.values(filters).some(Boolean) ? "No requests match this view. Adjust the filters or reset your search." : "No requests submitted yet. Configure a Main Basket or Sub-Basket from Vendors and send it for approval."} /> : <div className="vendor-directory__table-wrap"><table className="vendor-directory__table procurement-requests__table"><caption className="sr-only">Your submitted basket requests and statuses</caption>
          <colgroup><col className="procurement-requests__name-column" /><col /><col /><col className="procurement-requests__status-column" /><col /><col /></colgroup>
          <thead><tr><th scope="col">Requested item</th><th scope="col">Request type</th><th scope="col">Main Basket</th><th scope="col">Status</th><th scope="col">Submitted</th><th scope="col" data-placement="actions">Action</th></tr></thead>
          <tbody>{items.map(request => <tr key={request.id}>
            <th scope="row" data-placement="identity"><strong>{request.proposedName}</strong></th>
            <td data-placement="field" data-label="Request type">{requestType(request)}</td>
            <td data-placement="field" data-label="Main Basket">{parentName(request)}</td>
            <td data-placement="field" data-label="Status"><RequestStatus request={request} /></td>
            <td data-placement="field" data-label="Submitted"><time dateTime={request.createdAt}>{dateLabel(request.createdAt)}</time></td>
            <td data-placement="actions"><Button variant="quiet" aria-label={`View request: ${request.proposedName}`} onClick={() => setSelected(request)}>View request</Button></td>
          </tr>)}</tbody>
        </table></div>}
        {query.data ? <div className="vendor-directory__footer"><div className="vendor-directory__range"><p>Showing {items.length ? offset + 1 : 0} to {Math.min(offset + items.length, query.data.pagination.total)} of {query.data.pagination.total} requests</p><Field id={`${id}-page-size`} label="Rows per page" className="vendor-directory__page-size">{props => <Select {...props} value={pageSize} onChange={event => { setPageSize(Number(event.target.value) as VendorDirectoryPageSize); setOffset(0); setSelected(null); }}>{vendorDirectoryPageSizes.map(size => <option key={size} value={size}>{size}</option>)}</Select>}</Field></div><nav aria-label="Request pages"><Button variant="secondary" disabled={query.isFetching || offset === 0} onClick={() => setOffset(value => Math.max(0, value - pageSize))}>Previous</Button><span>Page {Math.floor(offset / pageSize) + 1} of {Math.max(1, Math.ceil(query.data.pagination.total / pageSize))}</span><Button variant="secondary" disabled={query.isFetching || !query.data.pagination.hasMore} onClick={() => setOffset(value => value + pageSize)}>Next</Button></nav></div> : null}
      </>}
      {query.isFetching && !query.isPending ? <p role="status" className="vendor-directory__notice">Refreshing requests…</p> : null}
    </section>
    {draftsOpen && canReadProposals ? <OwnProposalList draftsOnly onClose={() => setDraftsOpen(false)} onSubmitted={submitted} /> : null}
    {selectedRequest ? selectedRequest.kind === "configuration_proposal" && selectedRequest.proposalId && canReadProposals ? <ProposalWorkspace key={`${actor}:${selectedRequest.proposalId}`} proposalId={selectedRequest.proposalId} onClose={() => setSelected(null)} onSubmitted={submitted} /> : <ContextPanel title={selectedRequest.proposedName} eyebrow="My request" onClose={() => setSelected(null)}><dl className="procurement-requests__summary"><div><dt>Request type</dt><dd>{requestType(selectedRequest)}</dd></div>{selectedRequest.target?.kind === "new_sub_basket" ? <div><dt>Main Basket</dt><dd>{parentName(selectedRequest)}</dd></div> : null}<div><dt>Status</dt><dd><RequestStatus request={selectedRequest} /></dd></div><div><dt>Submitted</dt><dd>{dateLabel(selectedRequest.createdAt)}</dd></div>{selectedRequest.reason ? <div><dt>Reason</dt><dd>{selectedRequest.reason}</dd></div> : null}{selectedRequest.decidedAt ? <div><dt>Decision date</dt><dd>{dateLabel(selectedRequest.decidedAt)}</dd></div> : null}</dl>{selectedRequest.kind === "configuration_proposal" ? <InlineMessage tone="info">Configuration detail is unavailable with your current access.</InlineMessage> : null}</ContextPanel> : null}
  </section>;
}
