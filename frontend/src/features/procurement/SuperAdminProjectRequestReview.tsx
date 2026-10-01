import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "../../components/ui/Button";
import { Field, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { projectStatusKeys } from "../project-status/projectStatusApi";
import { procurementError } from "./procurementPresentation";
import {
  decideProjectPurchaseOrderRequest, getPendingProjectPurchaseOrderRequests, purchaseOrderKeys,
  type ProjectPurchaseOrderRequest, type PurchaseOrderRequestLine
} from "./purchaseOrderApi";

async function allPendingRequests(): Promise<ProjectPurchaseOrderRequest[]> {
  const requests: ProjectPurchaseOrderRequest[] = [];
  let offset = 0;
  do {
    const page = await getPendingProjectPurchaseOrderRequests(offset);
    requests.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || !page.items.length) break;
  } while (true);
  return requests;
}

function ReviewLine({ line }: { line: PurchaseOrderRequestLine }) {
  return <li className="purchase-orders__request-review-line">
    <div><strong>{line.itemName}</strong><small>{line.roomName} · {line.vendorName} · {line.description}</small>
      <small>{line.quantityMilliUnits / 1000} {line.uomCode} × {formatPaise(line.unitPricePaise)} · GST {line.gstBasisPoints / 100}%</small>
      <small>{line.scopeType.replaceAll("_", " ")} · {line.targetDate} · {line.deliveryLocation}</small></div>
    <dl><div><dt>Before GST</dt><dd>{formatPaise(line.netPaise)}</dd></div><div><dt>GST</dt><dd>{formatPaise(line.gstPaise)}</dd></div><div><dt>Total</dt><dd>{formatPaise(line.totalPaise)}</dd></div></dl>
  </li>;
}

export function SuperAdminProjectRequestReview() {
  const client = useQueryClient();
  const requests = useQuery({ queryKey: purchaseOrderKeys.pendingRequests, queryFn: allPendingRequests });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approve" | "request_changes" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingKey, setPendingKey] = useState<{ signature: string; key: string } | null>(null);
  const queueHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const reviewOpenerRef = useRef<HTMLButtonElement | null>(null);
  const selected = requests.data?.find((request) => request.id === selectedId) ?? null;
  const revision = selected?.revisions.find((item) => item.id === selected.submittedRevisionId) ?? null;
  const exceedsBudget = Boolean(revision && revision.committedPaise + revision.totals.netPaise > revision.approvedEstimatePaise);
  const act = useMutation({
    mutationFn: ({ request, idempotencyKey }: { request: ProjectPurchaseOrderRequest; idempotencyKey: string }) =>
      decideProjectPurchaseOrderRequest(request, {
        decision,
        reason: decision === "approve" ? null : reason.trim(),
        budgetOverrideReason: decision === "approve" ? overrideReason.trim() || null : null,
        idempotencyKey
      }),
    onSuccess: async (request) => {
      queueHeadingRef.current?.focus();
      reviewOpenerRef.current = null;
      setSelectedId(null); setPendingKey(null); setReason(""); setOverrideReason(""); setError("");
      setNotice(`${request.projectName} request ${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "returned for changes"}.`);
      await Promise.all([
        client.invalidateQueries({ queryKey: purchaseOrderKeys.pendingRequests }),
        client.invalidateQueries({ queryKey: purchaseOrderKeys.requests(request.projectId) }),
        client.invalidateQueries({ queryKey: purchaseOrderKeys.preparation(request.projectId) }),
        client.invalidateQueries({ queryKey: purchaseOrderKeys.project(request.projectId) }),
        client.invalidateQueries({ queryKey: purchaseOrderKeys.commitments(request.projectId) }),
        client.invalidateQueries({ queryKey: purchaseOrderKeys.pending }),
        client.invalidateQueries({ queryKey: ["vendor", "work"] }),
        client.invalidateQueries({ queryKey: projectStatusKeys.project(request.projectId) }),
        client.invalidateQueries({ queryKey: dashboardKeys.all })
      ]);
    }
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !revision) return setError("The submitted revision is unavailable. Refresh this queue.");
    if (decision === "approve" && exceedsBudget && !overrideReason.trim()) return setError("Explain the budget override before approving.");
    if (decision !== "approve" && !reason.trim()) return setError("Explain the changes or rejection.");
    const signature = JSON.stringify({ id: selected.id, version: selected.version, revisionId: revision.id,
      decision, reason: reason.trim(), overrideReason: overrideReason.trim() });
    const key = pendingKey?.signature === signature ? pendingKey.key : crypto.randomUUID();
    setPendingKey({ signature, key }); setError("");
    act.mutate({ request: selected, idempotencyKey: key });
  }
  function closeReview() {
    const opener = reviewOpenerRef.current;
    if (opener?.isConnected) opener.focus();
    else queueHeadingRef.current?.focus();
    reviewOpenerRef.current = null;
    setSelectedId(null);
  }

  return <section className="purchase-orders__project-queue" aria-labelledby="project-purchase-order-queue-title">
    <header><div><p className="eyebrow">Project approval queue</p><h2 id="project-purchase-order-queue-title" ref={queueHeadingRef} tabIndex={-1}>Project purchase order requests</h2>
      <p>One decision releases every vendor order in this project package.</p></div>
      {requests.isFetching && !requests.isPending ? <span className="purchase-orders__hint" role="status">Refreshing…</span> : null}</header>
    {notice ? <p role="status" className="purchase-orders__notice">{notice}</p> : null}
    {requests.isPending ? <PageState state="loading" message="Loading project purchase order requests…" />
      : requests.isError ? <PageState state="error" message={procurementError(requests.error, "The project request queue could not be loaded.")} action={{ label: "Try again", onAction: () => void requests.refetch() }} />
      : requests.data?.length ? <><div className="purchase-orders__queue-headings" aria-hidden="true"><span>Project request</span><span>Scope</span><span>Submitted total</span></div>
        <ul className="purchase-orders__list" aria-label="Pending project purchase order requests">
        {requests.data.map((request) => {
          const submittedRevision = request.revisions.find((item) => item.id === request.submittedRevisionId);
          return <li key={request.id}><button type="button" className="purchase-orders__row"
          aria-current={selectedId === request.id ? "true" : undefined}
          onClick={(event) => { reviewOpenerRef.current = event.currentTarget; setSelectedId(request.id); setDecision("approve"); setReason(""); setOverrideReason(""); setError(""); }}>
          <span className="purchase-orders__queue-identity"><strong>{request.projectName}</strong><small>{request.requestNumber ?? "Project request"} · Revision {request.revision}</small></span>
          <span className="purchase-orders__queue-scope"><small className="purchase-orders__field-label">Scope</small>{submittedRevision ? <>{submittedRevision.sectionTotals.length} estimate section{submittedRevision.sectionTotals.length === 1 ? "" : "s"} · {submittedRevision.vendorTotals.length} vendor{submittedRevision.vendorTotals.length === 1 ? "" : "s"}</> : "Unavailable"}</span>
          <span className="purchase-orders__queue-amount"><small className="purchase-orders__field-label">Submitted total</small>{submittedRevision ? formatPaise(submittedRevision.totals.totalPaise) : "Unavailable"}</span>
        </button></li>;
        })}
      </ul></> : <PageState state="empty" message="No project purchase order requests are waiting for approval." />}
    {selected ? <form className="purchase-orders__detail purchase-orders__request-review" aria-label={`Review ${selected.projectName} purchase order request`} onSubmit={submit}>
      <div className="purchase-orders__detail-head"><div><p className="eyebrow">Revision {selected.revision} · Submitted {revision ? new Date(revision.submittedAt).toLocaleDateString() : "unavailable"}</p>
        <h3>{selected.projectName}</h3><p>{selected.requestNumber ?? "Project request"}{revision ? ` · Submitted by account ${revision.submittedById}` : " · Submitted revision missing"}</p></div>
        <Button type="button" variant="quiet" onClick={closeReview}>Close review</Button></div>
      {!revision ? <InlineMessage tone="error">The submitted revision is unavailable. Refresh the queue before deciding.</InlineMessage> : <>
        <dl className="purchase-orders__totals" aria-label="Submitted project request total">
          <div><dt>Before GST</dt><dd>{formatPaise(revision.totals.netPaise)}</dd></div>
          <div><dt>GST</dt><dd>{formatPaise(revision.totals.gstPaise)}</dd></div>
          <div><dt>Project order total</dt><dd>{formatPaise(revision.totals.totalPaise)}</dd></div>
        </dl>
        <div className="purchase-orders__budget">
          <p><strong>Approved estimate before GST</strong> {formatPaise(revision.approvedEstimatePaise)}</p>
          <p><strong>Already approved commitments before GST</strong> {formatPaise(revision.committedPaise)}</p>
          <p><strong>Remaining before GST at submission</strong> {formatPaise(revision.remainingPaise)}</p>
          {exceedsBudget ? <InlineMessage tone="warning">The proposed before GST amount exceeds the approved estimate after existing commitments. Record an override reason to approve.</InlineMessage> : null}
          <small>Budget and commitments shown here are the immutable submission snapshot. Approval rechecks current source and allocations.</small>
        </div>
        <div className="purchase-orders__request-breakdown">
          <h4>Section review</h4>
          {revision.sectionTotals.map((section) => <details key={section.sectionId} className="purchase-orders__section">
            <summary><strong>{section.label}</strong><span className="purchase-orders__section-amounts"><small>Before GST {formatPaise(section.totals.netPaise)}</small><small>GST {formatPaise(section.totals.gstPaise)}</small><small>Total {formatPaise(section.totals.totalPaise)}</small></span></summary>
            {revision.lines.some((line) => line.sourceSectionId === section.sectionId)
              ? <ul>{revision.lines.filter((line) => line.sourceSectionId === section.sectionId).map((line) => <ReviewLine key={line.id} line={line} />)}</ul>
              : <p className="purchase-orders__hint">No ordered items in this estimate section.</p>}
          </details>)}
          <h4>Vendor orders</h4>
          {revision.vendorTotals.map((vendor) => <details key={vendor.vendorId} className="purchase-orders__section">
            <summary><strong>{vendor.name}</strong><span className="purchase-orders__section-amounts"><small>Before GST {formatPaise(vendor.totals.netPaise)}</small><small>GST {formatPaise(vendor.totals.gstPaise)}</small><small>Total {formatPaise(vendor.totals.totalPaise)}</small></span></summary>
            <p className="purchase-orders__terms"><strong>Terms:</strong> {vendor.terms}</p>
            <ul>{revision.lines.filter((line) => line.vendorId === vendor.vendorId).map((line) => <ReviewLine key={line.id} line={line} />)}</ul>
          </details>)}
        </div>
      </>}
      <fieldset className="purchase-orders__choice"><legend>Decision for the entire project request</legend>
        <label><input type="radio" name="project-purchase-order-decision" checked={decision === "approve"} onChange={() => setDecision("approve")} /> Approve all vendor orders</label>
        <label><input type="radio" name="project-purchase-order-decision" checked={decision === "request_changes"} onChange={() => setDecision("request_changes")} /> Request changes</label>
        <label><input type="radio" name="project-purchase-order-decision" checked={decision === "reject"} onChange={() => setDecision("reject")} /> Reject request</label>
      </fieldset>
      {decision === "approve" ? <Field id="project-order-budget-override" label="Budget override reason" required={exceedsBudget}
        hint="Required when the proposed amount before GST plus existing commitments exceeds the approved estimate.">{(props) =>
          <Textarea {...props} rows={2} maxLength={2000} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />}</Field>
        : <Field id="project-order-decision-reason" label="Reason for Procurement" required>{(props) =>
          <Textarea {...props} rows={2} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field>}
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {act.isError ? <InlineMessage tone="error">{procurementError(act.error, "The request changed or failed validation. Refresh the queue and review the latest version.")}</InlineMessage> : null}
      <div className="purchase-orders__actions"><Button type="submit" busy={act.isPending} disabled={!revision}>
        {decision === "approve" ? "Approve all vendor orders" : decision === "reject" ? "Reject project request" : "Return project request for changes"}</Button></div>
    </form> : null}
  </section>;
}
