import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { Surface } from "../../components/ui/Surface";
import { procurementRequestKey } from "../procurement/procurementPresentation";
import {
  decideVendorBasketRequest,
  listVendorBasketRequestsForReview,
  vendorBasketRequestKeys,
  type VendorBasketRequest
} from "../procurement/vendorBasketRequestApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import "./knowledge-basket-requests.css";

type Decision = "fulfill" | "reject";
type Selection = { request: VendorBasketRequest; decision: Decision; idempotencyKey: string; submittedReason?: string | null };

const PAGE_SIZE = 20;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function KnowledgeBasketRequestReview() {
  const id = useId();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"pending" | "">("pending");
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: vendorBasketRequestKeys.reviewPage(status, PAGE_SIZE, offset),
    queryFn: () => listVendorBasketRequestsForReview(status, PAGE_SIZE, offset)
  });
  const decision = useMutation({
    mutationFn: (selected: Selection) => decideVendorBasketRequest(selected.request.id, {
      decision: selected.decision,
      expectedVersion: selected.request.version,
      reason: selected.decision === "reject" ? selected.submittedReason ?? null : null,
      idempotencyKey: selected.idempotencyKey
    }),
    onSuccess: async (result) => {
      setSelection(null);
      setReason("");
      setNotice(result.status === "fulfilled"
        ? `${result.proposedName} is available in Configuration. Procurement can select it for the vendor.`
        : `${result.proposedName} request rejected.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: vendorBasketRequestKeys.review }),
        result.status === "fulfilled"
          ? queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.basketLists() })
          : Promise.resolve()
      ]);
    }
  });

  function openDecision(request: VendorBasketRequest, next: Decision) {
    setReason("");
    decision.reset();
    setSelection({ request, decision: next, idempotencyKey: procurementRequestKey() });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selection || (selection.decision === "reject" && selection.submittedReason === undefined && !reason.trim())) return;
    const command = selection.submittedReason === undefined
      ? { ...selection, submittedReason: selection.decision === "reject" ? reason.trim() : null }
      : selection;
    setSelection(command);
    decision.mutate(command);
  }

  return <Surface as="section" className="knowledge-basket-requests" aria-label="Main Basket requests" padding="compact">
    <div className="knowledge-basket-requests__heading">
      <div><h2>Main Basket requests</h2><p>Review categories requested for Procurement vendors.</p></div>
      <div className="knowledge-basket-requests__filters" role="group" aria-label="Request status">
        <Button variant={status === "pending" ? "primary" : "secondary"} aria-pressed={status === "pending"} onClick={() => { setStatus("pending"); setOffset(0); }}>Pending</Button>
        <Button variant={status === "" ? "primary" : "secondary"} aria-pressed={status === ""} onClick={() => { setStatus(""); setOffset(0); }}>All</Button>
      </div>
    </div>
    {notice ? <p role="status" className="knowledge-basket-requests__notice">{notice}</p> : null}
    {query.isPending ? <p role="status">Loading requests…</p> : query.isError
      ? <InlineMessage tone="error" action={<Button variant="secondary" onClick={() => void query.refetch()}>Retry requests</Button>}>{errorMessage(query.error, "Main Basket requests could not be loaded.")}</InlineMessage>
      : query.data.items.length === 0 ? <p className="knowledge-basket-requests__empty">{status === "pending" ? "No pending Main Basket requests." : "No Main Basket requests yet."}</p>
      : <ul className="knowledge-basket-requests__list">{query.data.items.map((request) => <li key={request.id}>
          <div className="knowledge-basket-requests__request">
            <strong>{request.proposedName}</strong>
            <span>{request.vendorName}{request.vendorId ? ` · ${request.vendorId}` : " · Vendor not saved"}</span>
            <small>Requested by {request.requesterId} · <time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString()}</time> · {request.status}</small>
            {request.status === "fulfilled" && request.basketId ? <small>Configuration basket: {request.basketId}</small> : null}
            {request.status === "rejected" && request.reason ? <small>Reason: {request.reason}</small> : null}
          </div>
          {request.status === "pending" ? <div className="knowledge-basket-requests__actions">
            <Button variant="secondary" onClick={() => openDecision(request, "reject")}>Reject</Button>
            <Button onClick={() => openDecision(request, "fulfill")}>Add to Configuration</Button>
          </div> : null}
        </li>)}</ul>}
    {query.data && query.data.pagination.total > PAGE_SIZE ? <nav className="knowledge-basket-requests__pages" aria-label="Main Basket request pages">
      <Button variant="secondary" disabled={offset === 0 || query.isFetching} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>Previous</Button>
      <span>{offset + 1}–{Math.min(offset + query.data.items.length, query.data.pagination.total)} of {query.data.pagination.total}</span>
      <Button variant="secondary" disabled={!query.data.pagination.hasMore || query.isFetching} onClick={() => setOffset((current) => current + PAGE_SIZE)}>Next</Button>
    </nav> : null}
    {selection ? <Dialog title={selection.decision === "fulfill" ? "Add Main Basket to Configuration" : "Reject Main Basket request"}
      eyebrow="Configuration" description={`${selection.request.proposedName} · ${selection.request.vendorName}`}
      onClose={() => { setSelection(null); setReason(""); }} busy={decision.isPending}>
      <form className="knowledge-basket-requests__decision" onSubmit={submit}>
        {selection.decision === "fulfill"
          ? <p>Use the matching active Main Basket, or add this name to Configuration. Procurement will select it for the vendor afterwards.</p>
          : <Field id={`${id}-reason`} label="Reason" required>{(props) => <Textarea {...props} value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} disabled={decision.isPending || selection.submittedReason !== undefined} />}</Field>}
        {decision.isError ? <InlineMessage tone="error" action={decision.error instanceof ApiError && decision.error.status === 409
          ? <Button variant="secondary" onClick={() => { setSelection(null); void query.refetch(); }}>Refresh requests</Button> : undefined}>
          {errorMessage(decision.error, "The request could not be reviewed. Retry this decision.")}
        </InlineMessage> : null}
        {decision.isError && selection.submittedReason !== undefined ? <p>Retry uses the same submitted decision.</p> : null}
        <div className="knowledge-basket-requests__dialog-actions">
          <Button variant="secondary" disabled={decision.isPending} onClick={() => { setSelection(null); setReason(""); }}>Cancel</Button>
          <Button type="submit" busy={decision.isPending} disabled={selection.decision === "reject" && selection.submittedReason === undefined && !reason.trim()}>{decision.isError ? "Retry decision" : selection.decision === "fulfill" ? "Add to Configuration" : "Reject request"}</Button>
        </div>
      </form>
    </Dialog> : null}
  </Surface>;
}
