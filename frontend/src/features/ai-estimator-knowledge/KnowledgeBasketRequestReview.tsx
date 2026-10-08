import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { Surface } from "../../components/ui/Surface";
import { procurementRequestKey } from "../procurement/procurementPresentation";
import { VENDOR_REQUEST_REFRESH_INTERVAL } from "../procurement/useVendorBasketRequestCount";
import {
  listVendorBasketRequestsForReview,
  vendorBasketRequestKeys,
  type VendorBasketRequest
} from "../procurement/vendorBasketRequestApi";
import { KnowledgeBasketRequestDecisionPanel } from "./KnowledgeBasketRequestDecisionPanel";
import "./knowledge-basket-requests.css";

type Selection = { request: VendorBasketRequest; decision: "fulfill" | "reject"; idempotencyKey: string };
const PAGE_SIZE = 20;

export function KnowledgeBasketRequestReview({ navigationKey, canDecide = true }: { readonly navigationKey?: string; readonly canDecide?: boolean }) {
  const [status, setStatus] = useState<"pending" | "">("pending");
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
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

  function openDecision(request: VendorBasketRequest, decision: Selection["decision"]) {
    setSelection({ request, decision, idempotencyKey: procurementRequestKey() });
  }

  return <Surface as="section" className="knowledge-basket-requests" aria-label="Main Basket requests" padding="compact">
    <div className="knowledge-basket-requests__heading">
      <div><h2>Main Basket requests</h2><p>Review categories requested for Procurement vendors.</p></div>
      <div className="knowledge-basket-requests__filters" role="group" aria-label="Request status">
        <Button ref={pendingRef} variant={status === "pending" ? "primary" : "secondary"} aria-pressed={status === "pending"} onClick={() => { setStatus("pending"); setOffset(0); }}>Pending</Button>
        <Button variant={status === "" ? "primary" : "secondary"} aria-pressed={status === ""} onClick={() => { setStatus(""); setOffset(0); }}>All</Button>
        <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh requests</Button>
      </div>
    </div>
    {notice ? <p role="status" className="knowledge-basket-requests__notice">{notice}</p> : null}
    {query.isPending ? <p role="status">Loading requests…</p> : null}
    {query.isError ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => void query.refetch()}>Retry requests</Button>}>
      {query.error instanceof ApiError ? query.error.message : "Main Basket requests could not be loaded."}
      {query.data ? " Showing the last loaded requests. Refresh before acting on changed requests." : ""}
    </InlineMessage> : null}
    {query.data?.items.length === 0 ? <p className="knowledge-basket-requests__empty">{status === "pending" ? "No pending Main Basket requests." : "No Main Basket requests yet."}</p> : null}
    {query.data && query.data.items.length > 0 ? <ul className="knowledge-basket-requests__list">{query.data.items.map((request) => <li key={request.id}>
      <div className="knowledge-basket-requests__request">
        <strong>{request.proposedName}</strong>
        <span>{request.vendorName}{request.vendorId ? ` · ${request.vendorId}` : " · Vendor not saved"}</span>
        <small>Requested by {request.requesterId} · <time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString()}</time> · {request.status}</small>
        {request.status === "fulfilled" && request.basketId ? <small>Configuration basket: {request.basketId}</small> : null}
        {request.status === "fulfilled" && request.subBasketId ? <small>Sub Basket: {request.subBasketId}</small> : null}
        {request.status === "fulfilled" && request.mainLineId ? <a href={`/admin/configuration/estimation/items/${encodeURIComponent(request.mainLineId)}`}>Open Main Line</a> : null}
        {request.status === "rejected" && request.reason ? <small>Reason: {request.reason}</small> : null}
      </div>
      {request.status === "pending" && canDecide ? <div className="knowledge-basket-requests__actions">
        <Button variant="secondary" onClick={() => openDecision(request, "reject")}>Reject</Button>
        <Button onClick={() => openDecision(request, "fulfill")}>Review and approve</Button>
      </div> : null}
    </li>)}</ul> : null}
    {query.data && query.data.pagination.total > PAGE_SIZE ? <nav className="knowledge-basket-requests__pages" aria-label="Main Basket request pages">
      <Button variant="secondary" disabled={offset === 0 || query.isFetching} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>Previous</Button>
      <span>{offset + 1}–{Math.min(offset + query.data.items.length, query.data.pagination.total)} of {query.data.pagination.total}</span>
      <Button variant="secondary" disabled={!query.data.pagination.hasMore || query.isFetching} onClick={() => setOffset((current) => current + PAGE_SIZE)}>Next</Button>
    </nav> : null}
    {selection && canDecide ? <KnowledgeBasketRequestDecisionPanel key={selection.idempotencyKey} {...selection}
      fallbackFocusRef={pendingRef}
      onClose={() => setSelection(null)}
      onRefreshRequests={() => { setSelection(null); void query.refetch(); }}
      onDecided={(result) => setNotice(result.status === "fulfilled"
        ? `${result.proposedName} is available in Configuration. Procurement can select it for the vendor.`
        : `${result.proposedName} request rejected.`)}
    /> : null}
  </Surface>;
}
