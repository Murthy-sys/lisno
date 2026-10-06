import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";

import type { ProjectProcurementItem, ProcurementVendorOption } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import { projectStatusKeys } from "../project-status/projectStatusApi";
import { getProcurementVendors, getProjectProcurementItems, projectProcurementKeys } from "./projectProcurementApi";
import { procurementError } from "./procurementPresentation";
import { ProjectPurchaseOrderRequestPanel, allProjectRequests } from "./ProjectPurchaseOrderRequestPanel";
import {
  amendPurchaseOrder, cancelPurchaseOrder, createPurchaseOrder, getPurchaseOrderCommitments,
  getPurchaseOrderPreparation, listPurchaseOrders, purchaseOrderKeys, submitPurchaseOrder, updatePurchaseOrder,
  type PurchaseOrder, type PurchaseOrderLine, type PurchaseOrderLineInput, type PurchaseOrderScope
} from "./purchaseOrderApi";
import "./purchaseOrders.css";

interface EditableLine {
  item: ProjectProcurementItem;
  selected: boolean;
  quantity: string;
  unitPriceRupees: string;
  gstPercent: string;
  scopeType: PurchaseOrderScope;
  description: string;
  targetDate: string;
  deliveryLocation: string;
}

const statusLabel: Record<PurchaseOrder["status"], string> = {
  draft: "Draft", pending_approval: "Awaiting Super Admin", changes_requested: "Changes requested",
  rejected: "Rejected", approved: "Approved", cancelled: "Cancelled"
};

async function allProcurementItems(projectId: string): Promise<ProjectProcurementItem[]> {
  const items: ProjectProcurementItem[] = [];
  let offset = 0;
  while (true) {
    const page = await getProjectProcurementItems(projectId, "", offset);
    items.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || !page.items.length) return items;
  }
}

async function allVendors(): Promise<ProcurementVendorOption[]> {
  const vendors: ProcurementVendorOption[] = [];
  let offset = 0;
  while (true) {
    const page = await getProcurementVendors("", offset);
    vendors.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || !page.items.length) return vendors;
  }
}

async function allPurchaseOrders(projectId: string): Promise<PurchaseOrder[]> {
  const orders: PurchaseOrder[] = [];
  let offset = 0;
  while (true) {
    const page = await listPurchaseOrders(projectId, offset);
    orders.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || !page.items.length) return orders;
  }
}

function makeLine(item: ProjectProcurementItem, current?: PurchaseOrderLineInput | PurchaseOrderLine): EditableLine {
  return {
    item, selected: Boolean(current), quantity: current ? String(current.quantityMilliUnits / 1000) : "",
    unitPriceRupees: current ? (current.unitPricePaise / 100).toFixed(2) : (item.pricePaise / 100).toFixed(2),
    gstPercent: current ? String(current.gstBasisPoints / 100) : "18", scopeType: current?.scopeType ?? "supply",
    description: current?.description ?? item.itemName, targetDate: current?.targetDate ?? "",
    deliveryLocation: current?.deliveryLocation ?? ""
  };
}

function decimalScaled(value: string, factor: number): number | null {
  const number = Number(value);
  const scaled = Math.round(number * factor);
  return value.trim() && Number.isFinite(number) && Number.isSafeInteger(scaled) && Math.abs(number * factor - scaled) < 0.000001 ? scaled : null;
}

function linePayload(row: EditableLine): PurchaseOrderLineInput | null {
  const quantityMilliUnits = decimalScaled(row.quantity, 1000);
  const unitPricePaise = decimalScaled(row.unitPriceRupees, 100);
  const gstBasisPoints = decimalScaled(row.gstPercent, 100);
  if (!quantityMilliUnits || quantityMilliUnits <= 0 || !unitPricePaise || unitPricePaise <= 0 || gstBasisPoints === null || gstBasisPoints < 0 || gstBasisPoints > 10_000 || !row.description.trim() || !row.targetDate || !row.deliveryLocation.trim()) return null;
  return { procurementItemId: row.item.id, quantityMilliUnits, unitPricePaise, gstBasisPoints,
    scopeType: row.scopeType, description: row.description.trim(), targetDate: row.targetDate,
    deliveryLocation: row.deliveryLocation.trim() };
}

function useIdempotency() {
  const keys = useRef(new Map<string, string>());
  return {
    key(action: string, payload: unknown) {
      const signature = `${action}:${JSON.stringify(payload)}`;
      let key = keys.current.get(signature);
      if (!key) { key = crypto.randomUUID(); keys.current.set(signature, key); }
      return key;
    },
    clear() { keys.current.clear(); }
  };
}

export function PurchaseOrdersPanel({ projectId, projectName, projectSourceStale = false, currentEstimate }: {
  projectId: string; projectName: string; projectSourceStale?: boolean;
  currentEstimate?: { estimateId: string; estimateVersion: number };
}) {
  const auth = useAuth();
  const canRead = hasFrontendPermission(auth.authorization, "procurement.purchase_orders.read");
  const canManage = hasFrontendPermission(auth.authorization, "procurement.purchase_orders.manage");
  const canReadItems = hasFrontendPermission(auth.authorization, "procurement.items.read");
  const canManageItems = hasFrontendPermission(auth.authorization, "procurement.items.manage");
  const canCancel = hasFrontendPermission(auth.authorization, "procurement.purchase_orders.approve");
  const queryClient = useQueryClient();
  const orders = useQuery({ queryKey: purchaseOrderKeys.project(projectId), queryFn: () => allPurchaseOrders(projectId), enabled: canRead });
  const requestHistory = useQuery({ queryKey: purchaseOrderKeys.requests(projectId), queryFn: () => allProjectRequests(projectId), enabled: canRead });
  const activeProjectRequest = requestHistory.data?.some((request) => ["pending_approval", "changes_requested"].includes(request.status)) ?? false;
  const commitments = useQuery({ queryKey: purchaseOrderKeys.commitments(projectId), queryFn: () => getPurchaseOrderCommitments(projectId), enabled: canRead });
  const preparation = useQuery({ queryKey: purchaseOrderKeys.preparation(projectId),
    queryFn: ({ signal }) => getPurchaseOrderPreparation(projectId, signal), enabled: canRead });
  const sourceMismatch = Boolean(currentEstimate && preparation.data &&
    (currentEstimate.estimateId !== preparation.data.estimateSource.estimateId || currentEstimate.estimateVersion !== preparation.data.estimateSource.estimateVersion));
  const vendorWritesPaused = projectSourceStale || sourceMismatch || preparation.isFetching || preparation.isError;
  const hideLegacyWorkspace = projectSourceStale || sourceMismatch || preparation.isError;
  const items = useQuery({ queryKey: projectProcurementKeys.lists(projectId), queryFn: () => allProcurementItems(projectId), enabled: canRead && canManage });
  const vendors = useQuery({ queryKey: projectProcurementKeys.vendors, queryFn: allVendors, enabled: canRead && canManage });
  const [activeId, setActiveId] = useState<string | "new" | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const retainedEditorOrder = useRef<PurchaseOrder | null>(null);
  const loadedActive = orders.data?.find((order) => order.id === activeId) ?? null;
  if (loadedActive && !hideLegacyWorkspace) retainedEditorOrder.current = loadedActive;
  const active = hideLegacyWorkspace && retainedEditorOrder.current?.id === activeId
    ? retainedEditorOrder.current : loadedActive;
  const activeSourceUnavailable = Boolean(active && ["draft", "changes_requested", "rejected"].includes(active.status) && items.data && active.draftLines.some((line) => !items.data.some((item) => item.id === line.procurementItemId && item.vendor?.id === active.vendor.id)));
  const idempotency = useIdempotency();
  function changeActive(next: string | "new" | null) {
    if (editorDirty && !window.confirm("Discard unsaved purchase order changes?")) return;
    setEditorDirty(false);
    setActiveId(next);
    setNotice("");
  }
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.project(projectId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.commitments(projectId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.pending }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.preparation(projectId) }),
      queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.requests(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectStatusKeys.project(projectId) }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
    ]);
  };
  const submit = useMutation({
    mutationFn: (order: PurchaseOrder) => {
      if (vendorWritesPaused) throw new Error("Refresh the approved estimate before changing this purchase order.");
      return submitPurchaseOrder(projectId, order.id, order.version, idempotency.key("submit", { id: order.id, version: order.version }));
    },
    onSuccess: async () => { idempotency.clear(); setNotice("Purchase order sent to Super Admin for approval."); await refresh(); }
  });
  const changeStatus = useMutation({
    mutationFn: ({ order, action, reason }: { order: PurchaseOrder; action: "amend" | "cancel"; reason: string }) => {
      if (vendorWritesPaused) throw new Error("Refresh the approved estimate before changing this purchase order.");
      const key = idempotency.key(action, { id: order.id, version: order.version, reason });
      return action === "amend" ? amendPurchaseOrder(order, reason, key) : cancelPurchaseOrder(order, reason, key);
    },
    onSuccess: async () => { idempotency.clear(); setNotice("Purchase order updated."); await refresh(); }
  });

  if (!canRead) return null;
  return <section className="purchase-orders" aria-labelledby="purchase-orders-title">
    <header className="purchase-orders__header"><div><p className="eyebrow">Ordering</p><h2 id="purchase-orders-title">Purchase orders</h2><p>Review the total across estimate sections, then send one project request for approval.</p></div></header>
    <ProjectPurchaseOrderRequestPanel projectId={projectId} projectName={projectName} canManage={canManage}
      canReadItems={canReadItems} canManageItems={canManageItems} projectSourceStale={projectSourceStale} currentEstimate={currentEstimate} />
    {!hideLegacyWorkspace ? <>
    <div className="purchase-orders__legacy-header"><div><p className="eyebrow">Vendor orders</p><h3>Individual orders and amendments</h3><p>Use individual vendor orders for existing drafts and later amendments.</p></div>
      {canManage ? <Button variant="secondary" disabled={requestHistory.isPending || requestHistory.isError || activeProjectRequest || vendorWritesPaused} onClick={() => changeActive("new")}>New purchase order</Button> : null}</div>
    {activeProjectRequest ? <p className="purchase-orders__hint">Resolve the project request before creating an individual order.</p> : null}
    {commitments.data ? <dl className="purchase-orders__totals" aria-label="Approved budget and commitments">
      <div><dt>Approved estimate, before GST</dt><dd>{formatPaise(commitments.data.approvedEstimatePaise)}</dd></div>
      <div><dt>Approved PO commitments, before GST</dt><dd>{formatPaise(commitments.data.committedPaise)}</dd></div>
      <div><dt>Remaining, before GST</dt><dd>{formatPaise(commitments.data.remainingPaise)}</dd></div>
    </dl> : null}
    {commitments.isError ? <InlineMessage tone="error">{procurementError(commitments.error, "Commitments could not be loaded.")}</InlineMessage> : null}
    {notice ? <p role="status" className="purchase-orders__notice">{notice}</p> : null}
    {orders.isPending ? <PageState state="loading" message="Loading purchase orders…" /> : orders.isError ? <PageState state="error" message={procurementError(orders.error, "Purchase orders could not be loaded.")} action={{ label: "Try again", onAction: () => void orders.refetch() }} /> : <>
      {orders.data?.length ? <ul className="purchase-orders__list" aria-label={`${projectName} purchase orders`}>
        {orders.data.map((order) => <li key={order.id}>
          <button type="button" className="purchase-orders__row" onClick={() => changeActive(order.id)} aria-current={activeId === order.id ? "true" : undefined}>
            <span><strong>{order.orderNumber}</strong><small>{order.vendor.name}</small></span>
            <span>{formatPaise(order.approvedTotalPaise ?? order.draftTotals.totalPaise)}</span>
            <span className={`purchase-orders__status purchase-orders__status--${order.status}`}>{statusLabel[order.status]}</span>
          </button>
        </li>)}
      </ul> : <PageState state="empty" message="No purchase orders yet. Assign active vendors to procurement items, then create the first order." />}
    </>}
    {active && <article className="purchase-orders__detail" aria-labelledby="purchase-order-detail-title">
      <div className="purchase-orders__detail-head"><div><p className="eyebrow">{statusLabel[active.status]}</p><h3 id="purchase-order-detail-title">{active.orderNumber}</h3><p>{active.vendor.name} · Revision {active.revision || "draft"}</p></div><Button variant="quiet" onClick={() => changeActive(null)}>Close</Button></div>
      {active.decisions.length ? <div className="purchase-orders__history"><h4>Decision history</h4>{active.decisions.map((decision) => <p key={decision.id}><strong>{decision.decision.replaceAll("_", " ")}</strong> · {new Date(decision.decidedAt).toLocaleDateString()}{decision.reason ? ` · ${decision.reason}` : ""}</p>)}</div> : null}
      {active.status === "pending_approval" ? <p className="purchase-orders__hint">Submitted to Super Admin. Editing is available after a change request.</p> : null}
      {active.status === "approved" ? <p className="purchase-orders__hint">Approved vendor work is now available to the linked vendor account.</p> : null}
      {activeSourceUnavailable ? <InlineMessage tone="error">An order line no longer matches a currently assigned procurement item. Refresh the project and resolve the assignment before submission.</InlineMessage> : null}
      {canManage && ["draft", "changes_requested", "rejected"].includes(active.status) ? <div className="purchase-orders__actions"><Button busy={submit.isPending} disabled={Boolean(items.isPending || vendors.isPending || items.isError || vendors.isError || editorDirty || activeSourceUnavailable || vendorWritesPaused)} onClick={() => submit.mutate(active)}>Submit to Super Admin</Button>{editorDirty ? <span className="purchase-orders__hint">Save the draft before submitting.</span> : null}</div> : null}
      {canManage && active.status === "approved" && !active.projectRequestId ? <ReasonAction label="Start amendment" onConfirm={(reason) => changeStatus.mutate({ order: active, action: "amend", reason })} busy={changeStatus.isPending} disabled={vendorWritesPaused} /> : null}
      {canCancel && ["draft", "pending_approval", "changes_requested", "rejected"].includes(active.status) && !active.approvedRevisionId ? <ReasonAction label="Cancel order" onConfirm={(reason) => changeStatus.mutate({ order: active, action: "cancel", reason })} busy={changeStatus.isPending} disabled={vendorWritesPaused} /> : null}
      {submit.isError ? <InlineMessage tone="error">{procurementError(submit.error, "Order submission failed. Refresh and review the latest version before retrying.")}</InlineMessage> : null}
      {changeStatus.isError ? <InlineMessage tone="error">{procurementError(changeStatus.error, "The order could not be updated.")}</InlineMessage> : null}
    </article>}
    </> : null}
    {activeId === "new" && canManage ? <PurchaseOrderEditor key={`new-${projectId}`} projectId={projectId} order={null} items={items.data ?? []} vendors={vendors.data ?? []} loading={items.isPending || vendors.isPending} loadError={items.error ?? vendors.error} sourceStale={vendorWritesPaused} onDirtyChange={setEditorDirty} onClose={() => changeActive(null)} onSaved={async (order) => { setEditorDirty(false); setActiveId(order.id); setNotice("Draft purchase order saved. Review it, then submit for approval."); await refresh(); }} /> : null}
    {active && canManage && ["draft", "changes_requested", "rejected"].includes(active.status) ? <PurchaseOrderEditor key={`${active.id}-${active.version}`} projectId={projectId} order={active} items={items.data ?? []} vendors={vendors.data ?? []} loading={items.isPending || vendors.isPending} loadError={items.error ?? vendors.error} sourceStale={vendorWritesPaused} onDirtyChange={setEditorDirty} onClose={() => changeActive(null)} onSaved={async () => { setEditorDirty(false); setNotice("Draft updated."); await refresh(); }} /> : null}
  </section>;
}

function ReasonAction({ label, onConfirm, busy, disabled = false }: { label: string; onConfirm: (reason: string) => void; busy: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return <div className="purchase-orders__reason-action">{!open ? <Button variant="quiet" disabled={disabled} onClick={() => setOpen(true)}>{label}</Button> : <div className="purchase-orders__reason-form">
    <Field id={`${label.replaceAll(" ", "-")}-reason`} label="Reason" required>{(props) => <Textarea {...props} value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} />}</Field>
    <div className="purchase-orders__actions"><Button variant="secondary" busy={busy} disabled={disabled || !reason.trim()} onClick={() => onConfirm(reason.trim())}>Confirm {label.toLowerCase()}</Button><Button variant="quiet" onClick={() => setOpen(false)}>Keep order</Button></div>
  </div>}</div>;
}

function PurchaseOrderEditor({ projectId, order, items, vendors, loading, loadError, sourceStale, onDirtyChange, onClose, onSaved }: {
  projectId: string; order: PurchaseOrder | null; items: ProjectProcurementItem[]; vendors: ProcurementVendorOption[]; loading: boolean; loadError: unknown; sourceStale: boolean;
  onDirtyChange?: (dirty: boolean) => void; onClose: () => void; onSaved: (order: PurchaseOrder) => Promise<void>;
}) {
  const [vendorId, setVendorId] = useState(order?.vendor.id ?? "");
  const [terms, setTerms] = useState(order?.terms ?? "");
  const [rows, setRows] = useState<Record<string, EditableLine>>(() => Object.fromEntries(items.map((item) => [item.id, makeLine(item, order?.draftLines.find((line) => line.procurementItemId === item.id))])));
  const [validation, setValidation] = useState("");
  const idempotency = useIdempotency();
  const selectableItems = useMemo(() => items.filter((item) => item.vendor?.id === vendorId), [items, vendorId]);
  const unavailableLines = order?.draftLines.filter((line) => !selectableItems.some((item) => item.id === line.procurementItemId)) ?? [];
  const selectedRows = selectableItems.map((item) => rows[item.id] ?? makeLine(item, order?.draftLines.find((line) => line.procurementItemId === item.id))).filter((row) => row.selected);
  const save = useMutation({
    mutationFn: (input: { lines: PurchaseOrderLineInput[]; terms: string }) => {
      if (sourceStale) throw new Error("Refresh the approved estimate before saving this purchase order.");
      const payload = { ...input, ...(order ? { expectedVersion: order.version } : { vendorId }) };
      const key = idempotency.key(order ? "update" : "create", payload);
      return order ? updatePurchaseOrder(projectId, order.id, { ...input, expectedVersion: order.version, idempotencyKey: key })
        : createPurchaseOrder(projectId, { ...input, vendorId, idempotencyKey: key });
    },
    onSuccess: async (saved) => { idempotency.clear(); await onSaved(saved); }
  });
  function patchRow(id: string, change: Partial<EditableLine>) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    setRows((current) => ({ ...current, [id]: { ...(current[id] ?? makeLine(item, order?.draftLines.find((line) => line.procurementItemId === item.id))), ...change } }));
    setValidation("");
    onDirtyChange?.(true);
  }
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sourceStale) return setValidation("Refresh the approved estimate before saving this purchase order.");
    if (!vendorId) return setValidation("Choose an active vendor.");
    if (!terms.trim()) return setValidation("Enter purchase order terms.");
    if (!selectedRows.length) return setValidation("Select at least one item assigned to this vendor.");
    const lines = selectedRows.map(linePayload);
    if (lines.some((line) => !line)) return setValidation("Complete quantity, price, GST, scope, target date and delivery location for every selected item.");
    setValidation("");
    save.mutate({ lines: lines as PurchaseOrderLineInput[], terms: terms.trim() });
  }
  return <form className="purchase-orders__editor" onSubmit={handleSubmit} aria-label={order ? "Edit purchase order draft" : "New purchase order draft"}>
    <div className="purchase-orders__editor-heading"><h4>{order ? "Edit draft" : "New purchase order"}</h4><p>Prices and GST are per unit. The approved estimate comparison uses amounts before GST.</p></div>
    {sourceStale ? <InlineMessage tone="warning">The approved estimate is changing. Your draft remains open, but saving is paused until the project and preparation refresh.</InlineMessage> : null}
    {loading ? <PageState state="loading" message="Loading vendor items…" /> : loadError ? <InlineMessage tone="error">{procurementError(loadError, "Vendor items could not be loaded. Refresh before preparing this order.")}</InlineMessage> : <>
      <div className="purchase-orders__form-grid"><Field id="purchase-order-vendor" label="Vendor" required hint="Only active vendors with assigned procurement items can receive orders.">{(props) => <Select {...props} value={vendorId} disabled={Boolean(order)} onChange={(event) => { setVendorId(event.target.value); onDirtyChange?.(true); }}><option value="">Choose vendor</option>{vendors.filter((vendor) => vendor.status === "active" && vendor.assignable !== false).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}{order && !vendors.some((vendor) => vendor.id === order.vendor.id) ? <option value={order.vendor.id}>{order.vendor.name}</option> : null}</Select>}</Field>
        <Field id="purchase-order-terms" label="Terms" required hint="Payment, delivery, and acceptance terms appear on the approved order.">{(props) => <Textarea {...props} value={terms} maxLength={4000} rows={3} onChange={(event) => { setTerms(event.target.value); onDirtyChange?.(true); }} />}</Field></div>
      {unavailableLines.length ? <InlineMessage tone="error">{unavailableLines.length} existing order line{unavailableLines.length === 1 ? " is" : "s are"} no longer available under this vendor. Refresh procurement assignments before editing.</InlineMessage> : null}
      {vendorId ? selectableItems.length ? <div className="purchase-orders__items"><h5>Assigned procurement items</h5>{selectableItems.map((item) => {
        const row = rows[item.id] ?? makeLine(item, order?.draftLines.find((line) => line.procurementItemId === item.id));
        return <fieldset key={item.id} className="purchase-orders__line"><legend><label><input type="checkbox" checked={row.selected} onChange={(event) => patchRow(item.id, { selected: event.target.checked })} /> <strong>{item.itemName}</strong> <span>{item.brand} · {item.uom.code}</span></label></legend>
          {row.selected ? <div className="purchase-orders__line-grid">
            <Field id={`po-${item.id}-quantity`} label={`Quantity (${item.uom.code})`} required>{(props) => <Input {...props} inputMode="decimal" value={row.quantity} onChange={(event) => patchRow(item.id, { quantity: event.target.value })} />}</Field>
            <Field id={`po-${item.id}-price`} label="Unit price (₹)" required>{(props) => <Input {...props} inputMode="decimal" value={row.unitPriceRupees} onChange={(event) => patchRow(item.id, { unitPriceRupees: event.target.value })} />}</Field>
            <Field id={`po-${item.id}-gst`} label="GST (%)" required>{(props) => <Input {...props} inputMode="decimal" value={row.gstPercent} onChange={(event) => patchRow(item.id, { gstPercent: event.target.value })} />}</Field>
            <Field id={`po-${item.id}-scope`} label="Scope" required>{(props) => <Select {...props} value={row.scopeType} onChange={(event) => patchRow(item.id, { scopeType: event.target.value as PurchaseOrderScope })}><option value="supply">Supply</option><option value="execution">Execution</option><option value="supply_and_execution">Supply and execution</option></Select>}</Field>
            <Field id={`po-${item.id}-date`} label="Target date" required>{(props) => <Input {...props} type="date" value={row.targetDate} onChange={(event) => patchRow(item.id, { targetDate: event.target.value })} />}</Field>
            <Field id={`po-${item.id}-location`} label="Delivery location" required>{(props) => <Input {...props} value={row.deliveryLocation} maxLength={500} onChange={(event) => patchRow(item.id, { deliveryLocation: event.target.value })} />}</Field>
            <Field id={`po-${item.id}-description`} label="Work or material description" required>{(props) => <Textarea {...props} value={row.description} rows={2} maxLength={2000} onChange={(event) => patchRow(item.id, { description: event.target.value })} />}</Field>
          </div> : null}</fieldset>;
      })}</div> : <InlineMessage tone="warning">No active procurement items are assigned to this vendor. Assign items in the estimate list first.</InlineMessage> : null}
      {validation ? <InlineMessage tone="error">{validation}</InlineMessage> : null}
      {save.isError ? <InlineMessage tone="error">{procurementError(save.error, "The order could not be saved. Refresh and review the latest item or order version before retrying.")}</InlineMessage> : null}
      <div className="purchase-orders__actions"><Button type="submit" busy={save.isPending} disabled={Boolean(sourceStale || loadError || unavailableLines.length)}>Save draft</Button><Button variant="quiet" onClick={onClose}>Close editor</Button></div>
    </>}
  </form>;
}
