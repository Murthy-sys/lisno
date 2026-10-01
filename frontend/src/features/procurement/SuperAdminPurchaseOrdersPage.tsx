import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { procurementError } from "./procurementPresentation";
import { SuperAdminProjectRequestReview } from "./SuperAdminProjectRequestReview";
import { decidePurchaseOrder, getPendingPurchaseOrders, getPurchaseOrderCommitments, purchaseOrderKeys, type PurchaseOrder } from "./purchaseOrderApi";
import "./purchaseOrders.css";
import "./purchase-order-approvals.css";

async function allPendingOrders() {
  const orders: PurchaseOrder[] = [];
  let offset = 0;
  while (true) {
    const page = await getPendingPurchaseOrders(offset);
    orders.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || !page.items.length) return orders;
  }
}

export function SuperAdminPurchaseOrdersPage() {
  const auth = useAuth();
  const canApprove = hasFrontendPermission(auth.authorization, "procurement.purchase_orders.approve");
  const queryClient = useQueryClient();
  const orders = useQuery({ queryKey: purchaseOrderKeys.pending, queryFn: allPendingOrders, enabled: canApprove });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approve" | "request_changes" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState<{ signature: string; key: string } | null>(null);
  const queueHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const reviewOpenerRef = useRef<HTMLButtonElement | null>(null);
  const selected = orders.data?.find((order) => order.id === selectedId) ?? null;
  const commitments = useQuery({ queryKey: purchaseOrderKeys.commitments(selected?.projectId ?? ""), queryFn: () => getPurchaseOrderCommitments(selected!.projectId), enabled: Boolean(selected) });
  const submitted = selected?.revisions.find((revision) => revision.id === selected.submittedRevisionId) ?? null;
  const exceedsBudget = Boolean(submitted && commitments.data && commitments.data.committedPaise + submitted.totals.netPaise > commitments.data.approvedEstimatePaise);
  const act = useMutation({
    mutationFn: ({ order, idempotencyKey }: { order: PurchaseOrder; idempotencyKey: string }) => decidePurchaseOrder(order, {
      decision, reason: decision === "approve" ? null : reason.trim(), budgetOverrideReason: decision === "approve" ? overrideReason.trim() || null : null, idempotencyKey
    }),
    onSuccess: async (order) => {
      queueHeadingRef.current?.focus();
      reviewOpenerRef.current = null;
      setPendingKey(null); setSelectedId(null); setReason(""); setOverrideReason(""); setError("");
      setNotice(`${order.orderNumber} ${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "returned for changes"}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.pending }),
        queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.project(order.projectId) }),
        queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.commitments(order.projectId) }),
        queryClient.invalidateQueries({ queryKey: ["vendor", "work"] })
      ]);
    }
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected?.submittedRevisionId || !submitted) return setError("The submitted revision is unavailable. Refresh the queue.");
    if (decision === "approve" && !commitments.data) return setError("Load the approved budget before making a decision.");
    if (decision === "approve" && exceedsBudget && !overrideReason.trim()) return setError("Explain why this order exceeds the approved estimate before GST.");
    if (decision !== "approve" && !reason.trim()) return setError("Explain the changes or rejection.");
    const signature = JSON.stringify({ id: selected.id, version: selected.version, revisionId: selected.submittedRevisionId, decision, reason: reason.trim(), overrideReason: overrideReason.trim() });
    const key = pendingKey?.signature === signature ? pendingKey.key : crypto.randomUUID();
    setPendingKey({ signature, key }); setError("");
    act.mutate({ order: selected, idempotencyKey: key });
  }
  function closeReview() {
    const opener = reviewOpenerRef.current;
    if (opener?.isConnected) opener.focus();
    else queueHeadingRef.current?.focus();
    reviewOpenerRef.current = null;
    setSelectedId(null);
  }
  return <section className="purchase-orders purchase-orders--admin" aria-labelledby="super-admin-purchase-orders-title">
    <PageHeader id="super-admin-purchase-orders-title" eyebrow="Super Admin approval" title="Purchase order approvals" description="Review a full project request or an individual vendor order before releasing work." />
    {!canApprove ? <PageState state="error" message="You do not have permission to approve purchase orders." /> : <>
      <SuperAdminProjectRequestReview />
      <section className="purchase-orders__individual-queue" aria-labelledby="individual-purchase-order-queue-title">
        <header className="purchase-orders__legacy-header"><div><p className="eyebrow">Individual approval queue</p><h2 id="individual-purchase-order-queue-title" ref={queueHeadingRef} tabIndex={-1}>Individual vendor orders</h2><p>Review vendor orders created separately or amended after approval.</p></div>
          {orders.isFetching && !orders.isPending ? <span className="purchase-orders__hint" role="status">Refreshing…</span> : null}</header>
      {notice ? <p role="status" className="purchase-orders__notice">{notice}</p> : null}
      {orders.isPending ? <PageState state="loading" message="Loading approval queue…" /> : orders.isError ? <PageState state="error" message={procurementError(orders.error, "The approval queue could not be loaded.")} action={{ label: "Try again", onAction: () => void orders.refetch() }} /> : orders.data?.length ? <>
        <div className="purchase-orders__queue-headings" aria-hidden="true"><span>Order and vendor</span><span>Project</span><span>Submitted total</span></div>
        <ul className="purchase-orders__list" aria-label="Pending purchase orders">{orders.data.map((order) => {
          const submittedRevision = order.revisions.find((revision) => revision.id === order.submittedRevisionId);
          return <li key={order.id}><button type="button" className="purchase-orders__row" onClick={(event) => { reviewOpenerRef.current = event.currentTarget; setSelectedId(order.id); setDecision("approve"); setReason(""); setOverrideReason(""); setError(""); }} aria-current={selectedId === order.id ? "true" : undefined}>
            <span className="purchase-orders__queue-identity"><strong>{order.orderNumber}</strong><small>{order.vendor.name}</small></span>
            <span className="purchase-orders__queue-scope"><small className="purchase-orders__field-label">Project</small>{order.projectId}</span>
            <span className="purchase-orders__queue-amount"><small className="purchase-orders__field-label">Submitted total</small>{submittedRevision ? formatPaise(submittedRevision.totals.totalPaise) : "Unavailable"}</span>
          </button></li>;
        })}</ul>
      </> : <PageState state="empty" message="No purchase orders are waiting for approval." />}
      {selected ? <form className="purchase-orders__detail" onSubmit={submit} aria-label={`Review ${selected.orderNumber}`}>
        <div className="purchase-orders__detail-head"><div><p className="eyebrow">Revision {selected.revision}</p><h3>{selected.orderNumber}</h3><p>{selected.vendor.name}</p></div><Button type="button" variant="quiet" onClick={closeReview}>Close</Button></div>
        {submitted ? <dl className="purchase-orders__totals"><div><dt>Before GST</dt><dd>{formatPaise(submitted.totals.netPaise)}</dd></div><div><dt>GST</dt><dd>{formatPaise(submitted.totals.gstPaise)}</dd></div><div><dt>Order total</dt><dd>{formatPaise(submitted.totals.totalPaise)}</dd></div></dl> : null}
        {!submitted ? <InlineMessage tone="error">The submitted revision is unavailable. Refresh this request before deciding.</InlineMessage> : null}
        {submitted && (commitments.data ? <div className="purchase-orders__budget"><p><strong>Approved estimate before GST</strong><span>{formatPaise(commitments.data.approvedEstimatePaise)}</span></p><p><strong>Already committed before GST</strong><span>{formatPaise(commitments.data.committedPaise)}</span></p><p><strong>This order before GST</strong><span>{formatPaise(submitted.totals.netPaise)}</span></p>{exceedsBudget ? <InlineMessage tone="warning">This order would exceed the approved estimate before GST. Record a budget override reason to approve.</InlineMessage> : null}</div> : commitments.isError ? <InlineMessage tone="error">{procurementError(commitments.error, "The approved budget could not be loaded. Approval is unavailable until it is refreshed.")}</InlineMessage> : <p className="purchase-orders__hint">Loading approved budget…</p>)}
        <div className="purchase-orders__review-lines"><h3>Submitted lines</h3><ul>{submitted?.lines.map((line) => <li key={line.id}><div><strong>{line.itemName}</strong><small>{line.roomName} · {line.description}</small></div><div className="purchase-orders__line-quantity"><small className="purchase-orders__field-label">Quantity and unit price</small>{line.quantityMilliUnits / 1000} {line.uomCode} · {formatPaise(line.unitPricePaise)} / unit</div><div className="purchase-orders__line-amount"><small className="purchase-orders__field-label">Line total</small>{formatPaise(line.totalPaise)}</div></li>)}</ul></div>
        <p className="purchase-orders__terms"><strong>Terms:</strong> {submitted?.terms ?? "Submitted terms unavailable."}</p>
        <fieldset className="purchase-orders__choice"><legend>Decision</legend><label><input type="radio" name="purchase-order-decision" checked={decision === "approve"} onChange={() => setDecision("approve")} /> Approve</label><label><input type="radio" name="purchase-order-decision" checked={decision === "request_changes"} onChange={() => setDecision("request_changes")} /> Request changes</label><label><input type="radio" name="purchase-order-decision" checked={decision === "reject"} onChange={() => setDecision("reject")} /> Reject</label></fieldset>
        {decision === "approve" ? <Field id="purchase-order-budget-override" label="Budget override reason" required={exceedsBudget} hint="Required if approved commitments would exceed the estimate before GST.">{(props) => <Textarea {...props} rows={2} maxLength={2000} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />}</Field> : <Field id="purchase-order-decision-reason" label="Reason" required>{(props) => <Textarea {...props} rows={2} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} />}</Field>}
        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
        {act.isError ? <InlineMessage tone="error">{procurementError(act.error, "This decision could not be recorded. Refresh the queue and review its current version.")}</InlineMessage> : null}
        <div className="purchase-orders__actions"><Button type="submit" busy={act.isPending} disabled={!submitted || decision === "approve" && !commitments.data}>{decision === "approve" ? "Approve purchase order" : decision === "reject" ? "Reject purchase order" : "Send back for changes"}</Button></div>
      </form> : null}
      </section>
    </>}
  </section>;
}
