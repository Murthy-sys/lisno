import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { Surface } from "../../components/ui/Surface";
import { procurementRequestKey } from "../procurement/procurementPresentation";
import { VENDOR_REQUEST_REFRESH_INTERVAL } from "../procurement/useVendorBasketRequestCount";
import {
  listVendorBasketRequestsForReview,
  getVendorBasketRequestForReview,
  vendorBasketRequestKeys,
  type VendorBasketRequest
} from "../procurement/vendorBasketRequestApi";
import { ProposalIntakeWorkspace } from "../vendor-basket-proposals/ProposalIntakeWorkspace";
import type { ProposalRequestMode } from "../vendor-basket-proposals/proposalTypes";
import { proposalStatusLabel } from "../vendor-basket-proposals/proposalPresentation";
import { ProposalWorkspace } from "../vendor-basket-proposals/ProposalWorkspace";
import { KnowledgeBasketRequestDecisionPanel } from "./KnowledgeBasketRequestDecisionPanel";
import "./knowledge-basket-requests.css";

type Selection = { request: VendorBasketRequest; decision: "fulfill" | "reject"; idempotencyKey: string };
const PAGE_SIZE = 20;

interface ReviewProps { readonly navigationKey?: string; readonly requestId?: string | null; readonly canDecide?: boolean }

export function KnowledgeBasketRequestReview(props: ReviewProps) {
  const { user } = useAuth();
  const actorId = user?.id ?? "";
  return <KnowledgeBasketRequestReviewSession key={actorId} {...props} actorId={actorId} />;
}

function KnowledgeBasketRequestReviewSession({ navigationKey, requestId, canDecide = true, actorId }: ReviewProps & { actorId: string }) {
  const [status, setStatus] = useState<"pending" | "">("pending");
  const [offset, setOffset] = useState(0);
  const [proposalSelection, setProposalSelection] = useState<{ id: string; name: string; requestMode?: ProposalRequestMode } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [history, setHistory] = useState<VendorBasketRequest | null>(null);
  const openedLink = useRef("");
  const [notice, setNotice] = useState("");
  const pendingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setStatus("pending"); setOffset(0); }, [navigationKey]);
  const query = useQuery({
    queryKey: vendorBasketRequestKeys.reviewPage(status, PAGE_SIZE, offset),
    queryFn: () => listVendorBasketRequestsForReview(status, PAGE_SIZE, offset),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: VENDOR_REQUEST_REFRESH_INTERVAL,
    refetchIntervalInBackground: false
  });
  const exactRequest = useQuery({
    queryKey: vendorBasketRequestKeys.detail(actorId, requestId ?? ""),
    queryFn: ({ signal }) => getVendorBasketRequestForReview(requestId!, signal),
    enabled: Boolean(requestId && actorId), gcTime: 0,
    refetchOnMount: "always", refetchOnWindowFocus: "always"
  });
  useEffect(() => {
    openedLink.current = ""; setProposalSelection(null); setSelection(null); setHistory(null);
  }, [actorId, requestId]);
  useEffect(() => {
    if (!requestId || !exactRequest.data || exactRequest.isFetching || exactRequest.isError) return;
    const link = `${actorId}:${navigationKey}:${requestId}`;
    if (openedLink.current === link) return;
    openedLink.current = link;
    if (exactRequest.data.kind === "configuration_proposal" || (exactRequest.data.status === "pending" && canDecide)) openDecision(exactRequest.data, "fulfill");
    else setHistory(exactRequest.data);
  }, [actorId, navigationKey, requestId, exactRequest.data, exactRequest.isFetching, exactRequest.isError, canDecide]);
  useEffect(() => {
    if (exactRequest.error instanceof ApiError && [401, 403, 404].includes(exactRequest.error.status)) { setSelection(null); setProposalSelection(null); setHistory(null); }
  }, [exactRequest.error]);

  function openDecision(request: VendorBasketRequest, decision: Selection["decision"]) {
    if (request.kind === "configuration_proposal") {
      if (request.proposalId) setProposalSelection({ id: request.proposalId, name: request.proposedName, requestMode: request.requestMode });
      else setNotice("This proposal could not be opened. Refresh requests before reviewing it.");
      return;
    }
    setSelection({ request, decision, idempotencyKey: procurementRequestKey() });
  }

  const SelectedWorkspace = proposalSelection?.requestMode === "hierarchy_intake" ? ProposalIntakeWorkspace : ProposalWorkspace;
  return <Surface as="section" className="knowledge-basket-requests" aria-label="Main Basket requests" padding="compact">
    <div className="knowledge-basket-requests__heading">
      <div><h2>Main Basket requests</h2><p>Review Main Baskets and Sub-Baskets requested for Procurement vendors.</p></div>
      <div className="knowledge-basket-requests__filters" role="group" aria-label="Request status">
        <Button ref={pendingRef} variant={status === "pending" ? "primary" : "secondary"} aria-pressed={status === "pending"} onClick={() => { setStatus("pending"); setOffset(0); }}>Pending</Button>
        <Button variant={status === "" ? "primary" : "secondary"} aria-pressed={status === ""} onClick={() => { setStatus(""); setOffset(0); }}>All</Button>
        <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh requests</Button>
      </div>
    </div>
    {notice ? <p role="status" className="knowledge-basket-requests__notice">{notice}</p> : null}
    {requestId && exactRequest.isPending ? <p role="status">Loading the selected basket request…</p> : null}
    {requestId && exactRequest.isError ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => void exactRequest.refetch()}>Retry selected request</Button>}>{exactRequest.error instanceof ApiError ? exactRequest.error.message : "The selected request could not be loaded."}</InlineMessage> : null}
    {query.isPending ? <p role="status">Loading requests…</p> : null}
    {query.isError ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => void query.refetch()}>Retry requests</Button>}>
      {query.error instanceof ApiError ? query.error.message : "Main Basket requests could not be loaded."}
      {query.data ? " Showing the last loaded requests. Refresh before acting on changed requests." : ""}
    </InlineMessage> : null}
    {query.data?.items.length === 0 ? <p className="knowledge-basket-requests__empty">{status === "pending" ? "No pending Main Basket requests." : "No Main Basket requests yet."}</p> : null}
    {query.data && query.data.items.length > 0 ? <ul className="knowledge-basket-requests__list">{query.data.items.map((request) => <li key={request.id}>
      <div className="knowledge-basket-requests__request">
        <strong>{request.proposedName}</strong>
        {request.target?.kind === "new_sub_basket" ? <small>Sub-Basket under {request.targetParentName ?? request.target.basketId}</small> : null}
        {request.kind === "configuration_proposal" ? <small>{request.requestMode === "hierarchy_intake" ? "Basket request" : "Full configuration"}{request.proposalCounts ? ` · ${request.proposalCounts.subBaskets} Sub-Baskets · ${request.proposalCounts.mainLines} Main Lines` : ""}</small> : null}
        {request.vendorName ? <span>{request.vendorName}{request.vendorId ? ` · ${request.vendorId}` : " · Vendor not saved"}</span> : null}
        <small>Requested by {request.requesterId} · <time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString()}</time> · {request.requestMode === "hierarchy_intake" ? proposalStatusLabel(request.status, request.requestMode) : request.status}</small>
        {request.status === "fulfilled" && request.basketId ? <small>Configuration basket: {request.basketId}</small> : null}
        {request.status === "fulfilled" && request.subBasketId ? <small>Sub Basket: {request.subBasketId}</small> : null}
        {request.status === "fulfilled" && request.mainLineId ? <a href={`/admin/configuration/estimation/items/${encodeURIComponent(request.mainLineId)}`}>Open Main Line</a> : null}
        {request.status === "rejected" && request.reason ? <small>Reason: {request.reason}</small> : null}
      </div>
      {request.status === "pending" && canDecide ? <div className="knowledge-basket-requests__actions">
        {request.kind !== "configuration_proposal" ? <Button variant="secondary" onClick={() => openDecision(request, "reject")}>Reject</Button> : null}
        <Button onClick={() => openDecision(request, "fulfill")}>{request.kind === "configuration_proposal" ? request.requestMode === "hierarchy_intake" ? "Review request" : "Review configuration" : "Review and approve"}</Button>
      </div> : null}
      {request.kind === "configuration_proposal" && request.status !== "pending" && request.proposalId ? <Button variant="secondary" onClick={() => openDecision(request, "fulfill")}>{request.requestMode === "hierarchy_intake" ? "View request" : "View configuration"}</Button> : null}
    </li>)}</ul> : null}
    {query.data && query.data.pagination.total > PAGE_SIZE ? <nav className="knowledge-basket-requests__pages" aria-label="Main Basket request pages">
      <Button variant="secondary" disabled={offset === 0 || query.isFetching} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>Previous</Button>
      <span>{offset + 1}–{Math.min(offset + query.data.items.length, query.data.pagination.total)} of {query.data.pagination.total}</span>
      <Button variant="secondary" disabled={!query.data.pagination.hasMore || query.isFetching} onClick={() => setOffset((current) => current + PAGE_SIZE)}>Next</Button>
    </nav> : null}
    {proposalSelection ? <SelectedWorkspace proposalId={proposalSelection.id} scope="admin"
      onClose={() => { setProposalSelection(null); void query.refetch(); }}
      onDecision={result => { setNotice(proposalSelection.requestMode === "hierarchy_intake" ? result.status === "fulfilled" ? `${proposalSelection.name} was approved. Main Lines are drafts for Super Admin to configure.` : `${proposalSelection.name} was sent back for correction.` : result.status === "fulfilled" ? `${proposalSelection.name} was approved and activated. Procurement can select it for the vendor.` : `${proposalSelection.name} request rejected.`); void query.refetch(); }} /> : null}
    {selection && canDecide ? <KnowledgeBasketRequestDecisionPanel key={selection.idempotencyKey} {...selection}
      fallbackFocusRef={pendingRef}
      onClose={() => setSelection(null)}
      onRefreshRequests={() => { setSelection(null); void query.refetch(); }}
      onDecided={(result) => setNotice(result.status === "fulfilled"
        ? `${result.proposedName} is available in Configuration. Procurement can select it for the vendor.`
        : `${result.proposedName} request rejected.`)}
    /> : null}
    {history ? <Dialog title="Basket request history" onClose={() => setHistory(null)}><div className="ui-dialog__body"><p><strong>{history.proposedName}</strong>{history.vendorName ? ` · ${history.vendorName}` : ""}</p><p>Status: {history.status}</p>{history.reason ? <p>Reason: {history.reason}</p> : null}{history.basketId ? <p>Configuration basket: {history.basketId}</p> : null}</div><div className="ui-dialog__actions"><Button onClick={() => setHistory(null)}>Close history</Button></div></Dialog> : null}
  </Surface>;
}
