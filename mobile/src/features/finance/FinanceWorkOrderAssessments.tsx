import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { Button, CommandState, Copy, denied, Field, Panel, Pager, QueryState, useDraftGuard, useNativeCommand, type NativeContext } from "../admin/nativeWorkspace";
import type { FinanceInvoiceAssessment, FinanceWorkOrderAssessmentRead, FinanceWorkOrderSummary } from "./financeTypes";
import { createIdempotencyKey, dateOnlyIso, formatBps, formatPaise, parseNonnegativeHundredths, parseInrToPaise } from "./money";

export function FinanceWorkOrderAssessments({ context: c, projectId }: { context: NativeContext; projectId: string }) {
  const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({ queryKey: c.key("work-orders", projectId, offset), queryFn: ({ signal }) => c.http.get<{ items: FinanceWorkOrderSummary[]; total: number; limit: number; offset: number }>(`/finance/projects/${encodeURIComponent(projectId)}/work-orders?limit=20&offset=${offset}`, { signal }), enabled: c.ready && c.can("GET /finance/projects/:projectId/work-orders") });
  if (!c.can("GET /finance/projects/:projectId/work-orders")) return null;
  return <Panel title="Work order invoice assessments"><QueryState query={query} title="Work orders" />{query.data && !query.isError ? <>{query.data.items.map(order => <Panel key={order.id} title={order.orderNumber}><Copy>{order.vendorName} · {formatPaise(order.totalPaise)} · {order.assessmentStatus}</Copy><Button label={`Assess invoice ${order.orderNumber}`} variant="secondary" onPress={() => c.navigate(() => setSelected(order.id))} /></Panel>)}<Pager offset={offset} total={query.data.total} onChange={value => c.navigate(() => setOffset(value))} /></> : null}{selected ? <InvoiceAssessment key={`${projectId}:${selected}`} context={c} projectId={projectId} orderId={selected} onClose={() => setSelected(null)} /> : null}</Panel>;
}
export function InvoiceAssessment({ context: c, projectId, orderId, onClose }: { context: NativeContext; projectId: string; orderId: string; onClose: () => void }) {
  const query = useQuery({ queryKey: c.key("invoice", orderId), queryFn: async ({ signal }) => { const value = await c.http.get<FinanceWorkOrderAssessmentRead>(`/finance/work-orders/${encodeURIComponent(orderId)}/invoice-assessment`, { signal }); if (value.order.id !== orderId || value.order.projectId !== projectId || value.assessment && value.assessment.orderId !== orderId) throw new Error("The invoice assessment does not match this project and work order."); return value; }, enabled: c.ready && c.can("GET /finance/work-orders/:orderId/invoice-assessment") });
  const canRead = c.ready && c.can("GET /finance/work-orders/:orderId/invoice-assessment") && !denied(query.error);
  return <Panel title="Invoice assessment"><QueryState query={query} title="Invoice assessment" />{query.data && canRead ? <AssessmentForm key={`${c.scope}:${projectId}:${orderId}`} context={c} data={query.data} readFailed={query.isError} reload={async () => (await query.refetch({ throwOnError: true })).data} onClose={onClose} /> : <Button label="Close assessment" variant="quiet" onPress={onClose} />}</Panel>;
}
function assessmentValues(saved: FinanceWorkOrderAssessmentRead["assessment"]) {
  return { invoiceNumber: saved?.invoiceNumber ?? "", invoiceDate: saved?.invoiceDate ?? "", invoiceEvidenceReference: saved?.invoiceEvidenceReference ?? "", invoiceTotal: saved ? (saved.invoiceTotalPaise / 100).toFixed(2) : "", basis: saved ? (saved.tdsBasisPaise / 100).toFixed(2) : "", rate: saved ? String(saved.tdsRateBasisPoints / 100) : "", withholdingEffectiveDate: saved?.withholdingEffectiveDate ?? "", withholdingRuleReference: saved?.withholdingRuleReference ?? "", reason: "" };
}
function AssessmentForm({ context: c, data, readFailed, reload, onClose }: { context: NativeContext; data: FinanceWorkOrderAssessmentRead; readFailed: boolean; reload: () => Promise<FinanceWorkOrderAssessmentRead | undefined>; onClose: () => void }) {
  // Background refresh may observe a committed request before its reply arrives.
  // Keep both the draft basis and the command owner until an explicit reload.
  const [basis, setBasis] = useState(data); const saved = basis.assessment;
  const [value, setValue] = useState(() => assessmentValues(saved));
  const [dirty, setDirty] = useState(false); const [reloading, setReloading] = useState(false);
  const alive = useRef(true); const loading = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const command = useNativeCommand(c.refresh); const close = useDraftGuard(dirty && !command.accessLost, (command.locked || reloading) && !command.accessLost, c);
  const stale = (data.assessment?.version ?? 0) !== (saved?.version ?? 0);
  const editable = c.session.user.role === "finance_head" && c.can("POST /finance/work-orders/:orderId/invoice-assessment") && !command.accessLost;
  async function loadCurrent() {
    if (command.busy || command.unknown || loading.current) return;
    loading.current = true; setReloading(true);
    try {
      const current = await reload();
      if (!alive.current || !current) return;
      await command.reload();
      if (!alive.current) return;
      setBasis(current); setValue(assessmentValues(current.assessment)); setDirty(false);
    } catch (error) { if (alive.current) command.validation(error instanceof Error ? error.message : "The current assessment could not be loaded."); }
    finally { loading.current = false; if (alive.current) setReloading(false); }
  }
  function requestReload() {
    if (command.busy || command.unknown || reloading) return;
    if (dirty) Alert.alert("Reload invoice assessment", "Discard your draft and load the current saved assessment?", [{ text: "Keep draft", style: "cancel" }, { text: "Discard and reload", style: "destructive", onPress: () => void loadCurrent() }]);
    else void loadCurrent();
  }
  function submit() {
    if (!editable || command.locked || reloading || stale || readFailed) return;
    const invoiceTotalPaise = parseInrToPaise(value.invoiceTotal); const tdsBasisPaise = parseNonnegativeHundredths(value.basis); const tdsRateBasisPoints = parseNonnegativeHundredths(value.rate);
    if (invoiceTotalPaise === null || tdsBasisPaise === null || tdsRateBasisPoints === null || tdsRateBasisPoints > 10000 || !dateOnlyIso(value.invoiceDate) || !dateOnlyIso(value.withholdingEffectiveDate) || !value.invoiceNumber.trim() || value.invoiceEvidenceReference.trim().length < 4 || !value.withholdingRuleReference.trim() || !value.reason.trim()) { command.validation("Enter the invoice, dates, evidence reference, amounts, TDS rate from 0 to 100%, withholding rule and reason."); return; }
    const input = { expectedVersion: saved?.version ?? 0, idempotencyKey: createIdempotencyKey(), invoiceNumber: value.invoiceNumber.trim(), invoiceDate: value.invoiceDate, invoiceEvidenceReference: value.invoiceEvidenceReference.trim(), invoiceTotalPaise, tdsBasisPaise, tdsRateBasisPoints, withholdingEffectiveDate: value.withholdingEffectiveDate, withholdingRuleReference: value.withholdingRuleReference.trim(), reason: value.reason.trim() };
    void command.execute(() => c.http.post<FinanceInvoiceAssessment>(`/finance/work-orders/${encodeURIComponent(basis.order.id)}/invoice-assessment`, input), result => { if (result.orderId !== basis.order.id) throw new Error("Saved assessment identity could not be verified."); setDirty(false); });
  }
  if (command.accessLost) return <><Copy error>Invoice assessment access is no longer available.</Copy><Button label="Close assessment" variant="quiet" onPress={onClose} /></>;
  const fields = [["invoiceNumber", "Invoice number"], ["invoiceDate", "Invoice date (YYYY-MM-DD)"], ["invoiceEvidenceReference", "Invoice evidence reference"], ["invoiceTotal", "Invoice total (INR)"], ["basis", "TDS basis (INR)"], ["rate", "TDS rate (%)"], ["withholdingEffectiveDate", "Withholding effective date (YYYY-MM-DD)"], ["withholdingRuleReference", "Withholding rule reference"], ["reason", "Assessment reason"]] as const;
  return <View><Copy>{basis.order.orderNumber} · {basis.order.vendorName}</Copy><Copy>Work order net {formatPaise(basis.order.netPaise)} · GST {formatPaise(basis.order.gstPaise)} · Total {formatPaise(basis.order.totalPaise)}</Copy>{saved ? <><Copy>Saved invoice {formatPaise(saved.invoiceTotalPaise)} · TDS {formatPaise(saved.tdsPaise)} at {formatBps(saved.tdsRateBasisPoints)}</Copy><Copy>Saved net payable: {formatPaise(saved.netPayablePaise)}</Copy><Copy>Assessed {new Date(saved.assessedAt).toLocaleString()} · Version {saved.version}</Copy></> : <Copy>No invoice assessment has been recorded.</Copy>}{!editable ? <Copy>Read-only finance assessment.</Copy> : null}{stale ? <Copy error>The saved assessment changed. Load the current assessment before starting another update. Any unresolved request must be retried first.</Copy> : null}{readFailed ? <Copy error>The latest assessment could not be verified. Your draft is retained; reload before saving.</Copy> : null}{fields.map(([key, label]) => <Field key={key} label={label} value={value[key]} editable={editable && !command.locked && !reloading && !stale && !readFailed} onChangeText={next => { setDirty(true); setValue(current => ({ ...current, [key]: next })); }} />)}<CommandState command={command} />{stale || readFailed || command.conflict ? <Button label="Load current assessment" variant="secondary" disabled={command.busy || command.unknown || reloading} loading={reloading} onPress={requestReload} /> : null}{editable ? <Button label="Save invoice assessment" disabled={command.locked || reloading || stale || readFailed || !dirty} loading={command.busy} onPress={submit} /> : null}<Button label="Close assessment" variant="quiet" disabled={command.locked || reloading} onPress={() => close(onClose)} /></View>;
}
