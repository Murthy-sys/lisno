import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { Button } from "../../../components/ui/Button";
import { formatPaise } from "../../finance/financeFormat";
import { refreshProcurementLifecycle } from "../procurementLifecycleQueries";
import { EvidenceField, isoInputDate, localInputDate, newRecordId } from "./LifecycleShared";
import { lifecycleApi, type LifecycleAudience, type PaymentOrder, type ProcurementPaymentAction } from "./lifecycleApi";
import { paymentError, paymentLabel, paymentPaise, paymentRupees, paymentSum } from "./paymentValues";

export interface PaymentEditorSelection { action: ProcurementPaymentAction; transactionId?: string; requestId?: string; retentionId?: string; replacesTransactionId?: string; supersedesReconciliationId?: string; }
export const paymentActionLabels: Record<ProcurementPaymentAction, string> = {
  propose_dates: "Propose payment dates", confirm_dates: "Confirm payment dates", authorize: "Authorize milestone amounts",
  record: "Record payment", reverse: "Reverse payment record", request_correction: "Request payment correction",
  resolve_correction: "Resolve payment correction", reconcile: "Reconcile opening payments",
  approve_retention: "Approve retained balance", acknowledge_retention: "Acknowledge retained balance"
};
interface Props {
  projectId: string; actorId: string; audience: LifecycleAudience; order: PaymentOrder;
  selection: PaymentEditorSelection; disabled?: boolean; onClose: () => void; onSaved: () => void;
}
type AllocationDraft = Record<string, { amount: string; gross: string; withholding: string; dueDate: string }>;
export function PaymentCommandForm({ projectId, actorId, audience, order, selection, disabled, onClose, onSaved }: Props) {
  const { action } = selection;
  const correctingOpening = action === "reconcile" && Boolean(selection.supersedesReconciliationId);
  const actionLabel = correctingOpening ? "Correct opening balance" : paymentActionLabels[action];
  const api = lifecycleApi(projectId, audience), client = useQueryClient();
  const [base, setBase] = useState({ version: order.version, sourceDigest: order.sourceDigest });
  const [entityId] = useState(() => newRecordId(action === "reconcile" ? "opening" : "payment"));
  const [reason, setReason] = useState(""); const [note, setNote] = useState("");
  const [amount, setAmount] = useState(""); const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(() => localInputDate(new Date().toISOString()));
  const [method, setMethod] = useState("bank_transfer");
  const [basis, setBasis] = useState<"invoice" | "advance">(order.assessment ? "invoice" : "advance");
  const [milestoneId, setMilestoneId] = useState(order.milestones.find(row => row.remainingPaise !== null && row.remainingPaise > 0)?.id ?? "");
  const [dueDate, setDueDate] = useState(""); const [decision, setDecision] = useState("corrected");
  const [openingConfirmed, setOpeningConfirmed] = useState(false);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState(""); const [conflict, setConflict] = useState(false);
  const [rows, setRows] = useState<AllocationDraft>(() => Object.fromEntries(order.milestones.map(row => {
    const openingBalance = order.openingReconciliation?.balances.find(part => part.milestoneId === row.id);
    const openingAmount = correctingOpening ? (openingBalance ? paymentRupees(openingBalance.amountPaise) : "") : "0.00";
    return [row.id, { amount: action === "reconcile" ? openingAmount : "", gross: row.contractGrossPaise === 0 ? "0.00" : "",
      withholding: row.contractGrossPaise === 0 ? "0.00" : "", dueDate: row.proposedDueDate ?? row.dueDate ?? "" }];
  })));
  const keys = useRef(new Map<string, string>());
  const stale = conflict || order.version !== base.version || order.sourceDigest !== base.sourceDigest;
  const openingChanged = correctingOpening && order.openingReconciliation?.id !== selection.supersedesReconciliationId;
  const blocked = disabled || stale || openingChanged || !order.allowedActions.includes(action) || (audience === "procurement" && (action === "reconcile" || Boolean(selection.replacesTransactionId)));
  const updateRow = (id: string, field: keyof AllocationDraft[string], value: string) => setRows(current => ({ ...current, [id]: { ...(current[id] ?? { amount: "", gross: "", withholding: "", dueDate: "" }), [field]: value } }));
  const mutation = useMutation({ mutationFn: async (payload: Record<string, unknown>) => {
    const fingerprint = JSON.stringify(payload); let key = keys.current.get(fingerprint);
    if (!key) { key = crypto.randomUUID(); keys.current.set(fingerprint, key); }
    return api.paymentCommand({ ...payload, action, idempotencyKey: key });
  }, onSuccess: async () => { await refreshProcurementLifecycle(client); onSaved(); }, onError: async error => {
    if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) { setConflict(true); await refreshProcurementLifecycle(client); }
  } });

  function payload() {
    const common = { orderId: order.id, expectedVersion: base.version, sourceDigest: base.sourceDigest };
    const reasoned = { ...common, reason: reason.trim() };
    if (action !== "record" && reason.trim().length < 3) throw new Error("Record a reason with at least three characters.");
    if (action === "propose_dates" || action === "confirm_dates") {
      const dates = order.milestones.filter(row => row.contractGrossPaise > 0 && rows[row.id]?.dueDate).map(row => ({ milestoneId: row.id, dueDate: rows[row.id]!.dueDate }));
      if (!dates.length) throw new Error("Enter at least one milestone payment date.");
      return { ...reasoned, dates };
    }
    if (action === "authorize") {
      if (basis === "invoice" && !order.assessment) throw new Error("Save the Finance invoice assessment before allocating its amounts.");
      const milestones = basis === "advance" ? order.milestones.filter(row => row.id === "advance") : order.milestones;
      if (!milestones.length) throw new Error("This issued order has no advance milestone.");
      const allocations = milestones.map(row => {
        const grossPaise = paymentPaise(rows[row.id]?.gross ?? "", `${row.name} gross`);
        const withholdingPaise = paymentPaise(rows[row.id]?.withholding ?? "", `${row.name} withholding`);
        if (withholdingPaise > grossPaise) throw new Error(`${row.name}: withholding cannot exceed gross.`);
        if (grossPaise > row.contractGrossPaise) throw new Error(`${row.name}: gross cannot exceed its issued amount.`);
        return { milestoneId: row.id, grossPaise, withholdingPaise, netPaise: grossPaise - withholdingPaise };
      });
      if (basis === "invoice" && order.assessment && (paymentSum(allocations.map(row => row.grossPaise)) !== order.assessment.invoiceTotalPaise || paymentSum(allocations.map(row => row.withholdingPaise)) !== order.assessment.tdsPaise || paymentSum(allocations.map(row => row.netPaise)) !== order.assessment.netPayablePaise)) throw new Error("The gross, withholding and net allocations must match the Finance assessment exactly.");
      return { ...reasoned, basis, assessmentRevisionId: basis === "invoice" ? order.assessment!.revisionId : null, allocations };
    }
    if (action === "record") {
      const amountPaise = paymentPaise(amount, "Payment amount");
      const allocations = order.milestones.filter(row => rows[row.id]?.amount.trim()).map(row => ({ milestoneId: row.id, amountPaise: paymentPaise(rows[row.id]!.amount, row.name) })).filter(row => row.amountPaise > 0);
      if (!amountPaise || !allocations.length || paymentSum(allocations.map(row => row.amountPaise)) !== amountPaise) throw new Error("Payment amount must equal the total allocated to milestones.");
      for (const part of allocations) {
        const row = order.milestones.find(item => item.id === part.milestoneId)!;
        if (row.readiness !== "ready" || row.remainingPaise === null || part.amountPaise > row.remainingPaise) throw new Error(`${row.name}: use a certified, authorized remaining balance.`);
        if (row.retention && (row.retention.remainingPaise == null || part.amountPaise > row.retention.remainingPaise)) throw new Error(`${row.name}: payment cannot exceed the confirmed remaining retention.`);
      }
      if (!reference.trim() || !evidenceIds.length) throw new Error("Record the transaction reference and upload payment evidence.");
      return { ...common, transactionId: entityId, amountPaise, allocations, paidAt: isoInputDate(paidAt), method, reference: reference.trim(), evidenceIds, note: note.trim(), ...(selection.replacesTransactionId ? { replacesTransactionId: selection.replacesTransactionId } : {}) };
    }
    if (action === "reconcile") {
      if (!openingConfirmed) throw new Error("Confirm that the opening amounts cover all previous external payments on this order.");
      const openingBalances = order.milestones.map(row => ({ milestoneId: row.id, amountPaise: paymentPaise(rows[row.id]?.amount ?? "", row.name) }));
      if ((correctingOpening || paymentSum(openingBalances.map(row => row.amountPaise)) > 0) && !evidenceIds.length) throw new Error(correctingOpening ? "Upload evidence supporting the corrected opening balance, including a correction to zero." : "Upload evidence supporting the historical payments.");
      return { ...reasoned, reconciliationId: entityId, openingBalances, evidenceIds, ...(correctingOpening ? { supersedesReconciliationId: selection.supersedesReconciliationId } : {}) };
    }
    if (action === "approve_retention") {
      const milestone = order.milestones.find(row => row.id === milestoneId);
      if (!milestone || milestone.remainingPaise === null || milestone.remainingPaise <= 0) throw new Error("Choose a milestone with an authorized remaining balance.");
      return { ...reasoned, milestoneId, amountPaise: milestone.remainingPaise, dueDate, ownerId: actorId };
    }
    if (action === "acknowledge_retention") return { ...reasoned, retentionId: selection.retentionId };
    if (action === "resolve_correction") return { ...reasoned, requestId: selection.requestId, decision };
    return { ...reasoned, transactionId: selection.transactionId };
  }
  const selectedMilestone = order.milestones.find(row => row.id === milestoneId);
  return <section className="payment-form" aria-label={actionLabel}>
    <div className="payment-section-head"><h4>{actionLabel}</h4><Button variant="quiet" onClick={onClose} disabled={mutation.isPending}>Close form</Button></div>
    {stale ? <div role="alert"><p>The payment source or version changed. Your draft is retained. Review the latest order balances before continuing.</p><Button variant="secondary" disabled={disabled || mutation.isPending} onClick={() => { setBase({ version: order.version, sourceDigest: order.sourceDigest }); setConflict(false); mutation.reset(); setLocalError(""); }}>I reviewed the latest balances</Button></div> : null}
    {!order.allowedActions.includes(action) ? <p role="alert">This action is no longer available to your account.</p> : null}
    {openingChanged ? <p role="alert">Another opening balance correction was recorded. Close this form and review the latest opening record before starting a new correction.</p> : null}
    <form onSubmit={event => { event.preventDefault(); setLocalError(""); try { if (!blocked) mutation.mutate(payload()); } catch (error) { setLocalError(paymentError(error)); } }}>
      <fieldset disabled={blocked || mutation.isPending}>
        <legend className="payment-visually-hidden">{actionLabel} for {order.orderNumber}</legend>
        {(action === "propose_dates" || action === "confirm_dates") ? <><p>Confirmed changes retain the original deadline. A proposed extension leaves an overdue payment visible until Finance confirms it.</p><div className="payment-form-grid">{order.milestones.filter(row => row.contractGrossPaise > 0).map(row => <label key={row.id}>{row.name} payment date<input type="date" value={rows[row.id]?.dueDate ?? ""} onChange={event => updateRow(row.id, "dueDate", event.target.value)} /><small>Original: {row.originalDueDate ?? "Not scheduled"}; current: {row.dueDate ?? "Not confirmed"}</small></label>)}</div></> : null}
        {action === "authorize" ? <>
          <label>Authorization basis<select value={basis} onChange={event => setBasis(event.target.value as typeof basis)}><option value="invoice" disabled={!order.assessment}>Finance invoice assessment</option><option value="advance" disabled={Boolean(order.assessment)}>Issued advance before invoice</option></select></label>
          {order.assessment ? <p>Assessment: gross {formatPaise(order.assessment.invoiceTotalPaise)}, withholding {formatPaise(order.assessment.tdsPaise)}, vendor net {formatPaise(order.assessment.netPayablePaise)}. Allocate each explicitly.</p> : <p>Only the issued advance can be authorized before an invoice exists. Finance must reconcile it against the later invoice.</p>}
          {(basis === "advance" ? order.milestones.filter(row => row.id === "advance") : order.milestones).map(row => {
            let net = "Enter gross and withholding"; try { const gross = paymentPaise(rows[row.id]?.gross ?? ""), withheld = paymentPaise(rows[row.id]?.withholding ?? ""); if (gross >= withheld) net = formatPaise(gross - withheld); } catch { /* Incomplete form values are shown explicitly. */ }
            return <fieldset key={row.id} className="payment-allocation"><legend>{row.name} · issued {formatPaise(row.contractGrossPaise)}</legend><label>Gross allocation in rupees<input inputMode="decimal" required value={rows[row.id]?.gross ?? ""} onChange={event => updateRow(row.id, "gross", event.target.value)} aria-label={`${row.name} gross allocation in rupees`} /></label><label>Withholding in rupees<input inputMode="decimal" required value={rows[row.id]?.withholding ?? ""} onChange={event => updateRow(row.id, "withholding", event.target.value)} aria-label={`${row.name} withholding in rupees`} /></label><p>Vendor net: <strong>{net}</strong></p></fieldset>;
          })}
        </> : null}
        {action === "record" ? <><p>Record a completed payment made outside Lisno. This creates a payment-history entry and does not transfer money or create another expense.</p>{selection.replacesTransactionId ? <p>This entry replaces the reversed transaction selected in history.</p> : null}<div className="payment-form-grid"><label>Payment amount in rupees<input inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} /></label><label>Actual payment date and time<input type="datetime-local" aria-label="Actual payment date and time" required value={paidAt} onChange={event => setPaidAt(event.target.value)} /><small>Time shown in your device timezone.</small></label><label>Payment method<select value={method} onChange={event => setMethod(event.target.value)}>{["bank_transfer", "upi", "cheque", "cash", "other"].map(value => <option key={value} value={value}>{paymentLabel(value)}</option>)}</select></label><label>Transaction reference<input required maxLength={160} value={reference} onChange={event => setReference(event.target.value)} /></label></div><fieldset className="payment-allocation"><legend>Allocate the completed payment</legend>{order.milestones.filter(row => row.contractGrossPaise > 0).map(row => <label key={row.id}>{row.name} allocation in rupees<input inputMode="decimal" aria-label={`${row.name} allocation in rupees`} disabled={row.readiness !== "ready" || row.remainingPaise === null || row.remainingPaise === 0 || Boolean(row.retention && (row.retention.remainingPaise == null || row.retention.remainingPaise === 0))} value={rows[row.id]?.amount ?? ""} onChange={event => updateRow(row.id, "amount", event.target.value)} /><small>{paymentLabel(row.readiness)} · remaining {row.remainingPaise === null ? "Not known" : formatPaise(row.remainingPaise)}</small>{row.retention ? <small>Retention remaining: {row.retention.remainingPaise == null ? "Not yet confirmed" : formatPaise(row.retention.remainingPaise)}</small> : null}</label>)}</fieldset><label>Payment note<textarea value={note} maxLength={2000} onChange={event => setNote(event.target.value)} /></label></> : null}
        {action === "reconcile" ? <><p>{correctingOpening ? "Record corrected totals for payments made before Lisno payment recording began. This adds a new opening record linked to the original, which remains in history. Evidence is required even when correcting to zero." : "Confirm all payments made before Lisno payment recording began. Enter zero only when previous payments have been checked and none were made. This opening record cannot be overwritten."}</p><div className="payment-form-grid">{order.milestones.map(row => <label key={row.id}>{row.name} previously paid in rupees<input inputMode="decimal" required value={rows[row.id]?.amount ?? ""} onChange={event => updateRow(row.id, "amount", event.target.value)} /></label>)}</div><label className="payment-confirm"><input type="checkbox" checked={openingConfirmed} onChange={event => setOpeningConfirmed(event.target.checked)} required />I checked the previous payment records and confirm these opening amounts.</label></> : null}
        {(action === "record" || action === "reconcile") ? <EvidenceField projectId={projectId} actorId={actorId} audience={audience} entityId={entityId} purpose="payment" value={evidenceIds} onChange={setEvidenceIds} disabled={blocked || mutation.isPending} /> : null}
        {action === "approve_retention" ? <><p>Retain the full certified remaining balance on one milestone, with a future date. You remain its Finance owner and reminders continue after signoff.</p><label>Retention milestone<select value={milestoneId} onChange={event => setMilestoneId(event.target.value)} required><option value="">Choose milestone</option>{order.milestones.filter(row => row.remainingPaise !== null && row.remainingPaise > 0).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><p>Retained amount: {selectedMilestone?.remainingPaise == null ? "Select an eligible milestone" : formatPaise(selectedMilestone.remainingPaise)}</p><label>Retention payment due date<input type="date" required value={dueDate} onChange={event => setDueDate(event.target.value)} /></label></> : null}
        {action === "acknowledge_retention" ? <p>Acknowledge Finance's retained amount and responsible owner. The balance remains outstanding and reminders continue after project signoff.</p> : null}
        {action === "reverse" ? <p>The original payment stays in history. This reversal reopens its balance and does not issue a bank refund. Record a linked replacement only after the reversal is saved.</p> : null}
        {action === "resolve_correction" ? <label>Correction decision<select value={decision} onChange={event => setDecision(event.target.value)}><option value="corrected">Corrected with an immutable reversal</option><option value="rejected">Request rejected with reason</option></select></label> : null}
        {action !== "record" ? <label>Reason<textarea required minLength={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label> : null}
        <Button type="submit" busy={mutation.isPending}>{actionLabel}</Button>
      </fieldset>
      {localError || mutation.error ? <p role="alert" className="payment-error">{localError || paymentError(mutation.error)}</p> : null}
    </form>
  </section>;
}
