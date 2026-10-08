import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, Textarea } from "../../components/ui/Field";
import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "./ProjectFinancePanel";
import { financeWorkOrderKeys, getFinanceWorkOrderAssessment, listFinanceWorkOrders,
  saveFinanceWorkOrderAssessment, type FinanceWorkOrderAssessmentRead } from "./financeWorkOrdersApi";
import "./finance-work-orders.css";

const rupees = (paise: number) => (paise / 100).toFixed(2);
const percent = (bps: number) => (bps / 100).toFixed(2);

function paiseFromRupees(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  return amount > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(amount);
}

function basisPointsFromPercent(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  return amount > 10_000n ? null : Number(amount);
}

function AssessmentEditor({ data, projectId }: { data: FinanceWorkOrderAssessmentRead; projectId: string }) {
  const client = useQueryClient();
  const assessment = data.assessment;
  const [editingVersion, setEditingVersion] = useState(assessment?.version ?? 0);
  const [invoiceNumber, setInvoiceNumber] = useState(assessment?.invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(assessment?.invoiceDate ?? "");
  const [evidence, setEvidence] = useState(assessment?.invoiceEvidenceReference ?? "");
  const [invoiceTotal, setInvoiceTotal] = useState(assessment ? rupees(assessment.invoiceTotalPaise) : "");
  const [tdsBasis, setTdsBasis] = useState(assessment ? rupees(assessment.tdsBasisPaise) : "");
  const [tdsRate, setTdsRate] = useState(assessment ? percent(assessment.tdsRateBasisPoints) : "");
  const [effectiveDate, setEffectiveDate] = useState(assessment?.withholdingEffectiveDate ?? "");
  const [ruleReference, setRuleReference] = useState(assessment?.withholdingRuleReference ?? "");
  const [reason, setReason] = useState(assessment?.reason ?? "");
  const [localError, setLocalError] = useState("");
  const staleDraft = editingVersion !== (assessment?.version ?? 0);
  function loadLatestReview() {
    setInvoiceNumber(assessment?.invoiceNumber ?? "");
    setInvoiceDate(assessment?.invoiceDate ?? "");
    setEvidence(assessment?.invoiceEvidenceReference ?? "");
    setInvoiceTotal(assessment ? rupees(assessment.invoiceTotalPaise) : "");
    setTdsBasis(assessment ? rupees(assessment.tdsBasisPaise) : "");
    setTdsRate(assessment ? percent(assessment.tdsRateBasisPoints) : "");
    setEffectiveDate(assessment?.withholdingEffectiveDate ?? "");
    setRuleReference(assessment?.withholdingRuleReference ?? "");
    setReason(assessment?.reason ?? "");
    setEditingVersion(assessment?.version ?? 0);
    setLocalError("");
  }
  const save = useMutation({ mutationFn: () => {
    const totalPaise = paiseFromRupees(invoiceTotal);
    const basisPaise = paiseFromRupees(tdsBasis);
    const rateBasisPoints = basisPointsFromPercent(tdsRate);
    if (totalPaise === null || totalPaise <= 0 || totalPaise > data.order.totalPaise ||
      basisPaise === null || basisPaise > totalPaise || rateBasisPoints === null) {
      throw new Error("Check invoice, TDS basis and rate against the issued work order.");
    }
    if (!invoiceNumber.trim() || !invoiceDate || evidence.trim().length < 4 || !effectiveDate ||
      ruleReference.trim().length < 4 || reason.trim().length < 10) {
      throw new Error("Complete the invoice evidence, withholding reference, effective date and review reason.");
    }
    return saveFinanceWorkOrderAssessment(data.order.id, {
      expectedVersion: editingVersion, idempotencyKey: crypto.randomUUID(),
      invoiceNumber: invoiceNumber.trim(), invoiceDate,
      invoiceEvidenceReference: evidence.trim(), invoiceTotalPaise: totalPaise,
      tdsBasisPaise: basisPaise, tdsRateBasisPoints: rateBasisPoints,
      withholdingEffectiveDate: effectiveDate, withholdingRuleReference: ruleReference.trim(), reason: reason.trim()
    });
  }, onSuccess: async (saved) => {
    setLocalError("");
    setEditingVersion(saved.version);
    await Promise.all([
      client.invalidateQueries({ queryKey: financeWorkOrderKeys.assessment(data.order.id) }),
      client.invalidateQueries({ queryKey: ["finance", "work-orders", projectId] })
    ]);
  }, onError: (error) => setLocalError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "The invoice review could not be saved.") });

  return <section className="finance-work-orders__editor" aria-label={`Invoice review for ${data.order.orderNumber}`}>
    <div className="finance-work-orders__contract"><div><strong>{data.order.vendorName}</strong><span>{data.order.orderNumber}</span></div>
      <dl><div><dt>Contract net</dt><dd>{formatPaise(data.order.netPaise)}</dd></div>
        <div><dt>Quoted GST</dt><dd>{formatPaise(data.order.gstPaise)}</dd></div>
        <div><dt>Contract gross</dt><dd>{formatPaise(data.order.totalPaise)}</dd></div></dl></div>
    {assessment ? <p role="status">Reviewed version {assessment.version}: TDS {formatPaise(assessment.tdsPaise)}; net payable {formatPaise(assessment.netPayablePaise)}.</p> :
      <p>Invoice amount and withholding are pending Finance review. The schedule is contractual and does not record payment.</p>}
    {staleDraft ? <p role="alert" className="finance-work-orders__stale">This invoice review changed while you were editing. Load the latest version before saving. <button type="button" onClick={loadLatestReview}>Load latest review</button></p> : null}
    <form onSubmit={(event) => { event.preventDefault(); if (!staleDraft) save.mutate(); }}>
      <Field id="finance-invoice-number" label="Invoice number" required>{control => <Input {...control} value={invoiceNumber} maxLength={120} disabled={save.isPending} onChange={event => setInvoiceNumber(event.target.value)} />}</Field>
      <Field id="finance-invoice-date" label="Invoice date" required>{control => <Input {...control} type="date" value={invoiceDate} disabled={save.isPending} onChange={event => setInvoiceDate(event.target.value)} />}</Field>
      <Field id="finance-invoice-evidence" label="Invoice evidence reference" required hint="Record the authenticated document reference used in your review.">{control => <Input {...control} value={evidence} maxLength={500} disabled={save.isPending} onChange={event => setEvidence(event.target.value)} />}</Field>
      <Field id="finance-invoice-total" label="Invoice total (₹, including tax)" required>{control => <Input {...control} inputMode="decimal" value={invoiceTotal} disabled={save.isPending} onChange={event => setInvoiceTotal(event.target.value)} />}</Field>
      <Field id="finance-tds-basis" label="TDS basis (₹)" required>{control => <Input {...control} inputMode="decimal" value={tdsBasis} disabled={save.isPending} onChange={event => setTdsBasis(event.target.value)} />}</Field>
      <Field id="finance-tds-rate" label="TDS rate (%)" required>{control => <Input {...control} inputMode="decimal" value={tdsRate} disabled={save.isPending} onChange={event => setTdsRate(event.target.value)} />}</Field>
      <Field id="finance-withholding-date" label="Withholding effective date" required>{control => <Input {...control} type="date" value={effectiveDate} disabled={save.isPending} onChange={event => setEffectiveDate(event.target.value)} />}</Field>
      <Field id="finance-rule-reference" label="Withholding rule reference" required>{control => <Input {...control} value={ruleReference} maxLength={500} disabled={save.isPending} onChange={event => setRuleReference(event.target.value)} />}</Field>
      <Field id="finance-assessment-reason" label="Review reason" required>{control => <Textarea {...control} value={reason} maxLength={2000} disabled={save.isPending} onChange={event => setReason(event.target.value)} />}</Field>
      {localError ? <p role="alert">{localError}</p> : null}
      <Button type="submit" disabled={staleDraft} busy={save.isPending} busyLabel="Saving review…">{assessment ? "Revise invoice review" : "Record invoice review"}</Button>
    </form>
  </section>;
}

export function FinanceWorkOrderAssessments({ projectId }: { projectId: string }) {
  const [offset, setOffset] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const orders = useQuery({ queryKey: financeWorkOrderKeys.list(projectId, offset),
    queryFn: ({ signal }) => listFinanceWorkOrders(projectId, offset, signal) });
  const assessment = useQuery({ queryKey: financeWorkOrderKeys.assessment(selectedOrderId ?? ""),
    queryFn: ({ signal }) => getFinanceWorkOrderAssessment(selectedOrderId!, signal), enabled: selectedOrderId !== null });

  return <section className="finance-work-orders" aria-labelledby="finance-work-orders-title">
    <div className="finance-work-orders__heading"><div><p className="eyebrow">Issued vendor work</p><h2 id="finance-work-orders-title">Work order invoices</h2>
      <p>Record invoice and withholding evidence against an issued work order. Amounts in the procurement monitor update after Finance review.</p></div>
      <span>{orders.data?.total ?? 0} work orders</span></div>
    {orders.isPending ? <PageState state="loading" message="Loading issued work orders…" /> :
      orders.isError ? <PageState state="error" message="Issued work orders could not be loaded." action={{ label: "Retry", onAction: () => void orders.refetch() }} /> :
      !orders.data.items.length ? <PageState state="empty" message="No issued basket work orders are available for this project." /> : <>
        <ul className="finance-work-orders__list">{orders.data.items.map(order => <li key={order.id}>
          <button type="button" aria-pressed={selectedOrderId === order.id} onClick={() => setSelectedOrderId(order.id)}>
            <span><strong>{order.orderNumber}</strong><small>{order.vendorName}</small></span>
            <span><strong>{formatPaise(order.totalPaise)}</strong><small>{order.assessmentStatus === "reviewed" ? `Reviewed v${order.assessmentVersion}` : "Review pending"}</small></span>
          </button></li>)}</ul>
        <div className="finance-work-orders__pagination"><Button type="button" disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - 20)); setSelectedOrderId(null); }}>Previous</Button>
          <span>{offset + 1}–{Math.min(offset + orders.data.items.length, orders.data.total)} of {orders.data.total}</span>
          <Button type="button" disabled={offset + 20 >= orders.data.total} onClick={() => { setOffset(offset + 20); setSelectedOrderId(null); }}>Next</Button></div>
      </>}
    {selectedOrderId ? assessment.isPending ? <PageState state="loading" message="Loading invoice review…" /> :
      assessment.isError ? <PageState state="error" message="Invoice review could not be loaded." action={{ label: "Retry", onAction: () => void assessment.refetch() }} /> :
        <AssessmentEditor key={selectedOrderId} data={assessment.data} projectId={projectId} /> : null}
  </section>;
}
