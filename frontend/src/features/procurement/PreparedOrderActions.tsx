import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError } from "../../api/client";
import type { WorkOrderIssueReadiness } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { issuePreparedOrder, reconcilePreparedOrder } from "./purchaseOrderApi";
import { WorkOrderReadiness } from "./ProcurementEstimateSource";
import { refreshProcurementLifecycle } from "./procurementLifecycleQueries";

type Source = { id: string; projectId: string; version: number; status: string; issueReadiness?: WorkOrderIssueReadiness };
export function PreparedOrderActions({ source, kind, canManage, disabled = false, reconcileAllowed = true }: {
  source: Source; kind: "order" | "request"; canManage: boolean; disabled?: boolean; reconcileAllowed?: boolean;
}) {
  const client = useQueryClient();
  const [dialog, setDialog] = useState<{ action: "issue" | "reconcile"; source: Source } | null>(null);
  const [reason, setReason] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [scopeChanged, setScopeChanged] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState("");
  const keys = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const command = useMutation({
    mutationFn: (input: { action: "issue" | "reconcile"; source: Source; reason: string; acknowledge: boolean }) => {
      const signature = JSON.stringify(input); let key = keys.current.get(signature);
      if (!key) { key = crypto.randomUUID(); keys.current.set(signature, key); }
      const body = { expectedVersion: input.source.version, idempotencyKey: key };
      return input.action === "issue" ? issuePreparedOrder(input.source.projectId, input.source.id, kind, body)
        : reconcilePreparedOrder(input.source.projectId, input.source.id, kind, { ...body, reason: input.reason, acknowledgeScopeChanges: input.acknowledge });
    },
    onSuccess: async (_, input) => {
      setDialog(null); keys.current.clear();
      setNotice(input.action === "issue" ? "Work orders issued. The approved work is now available for execution." : "Preparation reconciled. Review quantities and terms, save and submit for fresh Super Admin approval.");
      await refreshProcurementLifecycle(client); sectionRef.current?.focus();
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === "PURCHASE_ORDER_SCOPE_REVIEW_REQUIRED") { setScopeChanged(true); return; }
      if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) { setConflict(true); await refreshProcurementLifecycle(client); }
    }, onSettled: () => { inFlight.current = false; }
  });
  if (!source.issueReadiness?.required || ["approved", "cancelled"].includes(source.status)) return null;
  const canReconcile = reconcileAllowed && (kind === "order" || ["pending_approval", "changes_requested", "ready_to_issue"].includes(source.status));
  const open = (action: "issue" | "reconcile", button: HTMLButtonElement) => {
    triggerRef.current = button; setReason(""); setAcknowledge(false); setScopeChanged(false); setConflict(false); setValidation(""); command.reset(); setDialog({ action, source });
  };
  return <section className="procurement-source" aria-label="Prepared order release" ref={sectionRef} tabIndex={-1}>
    {source.status === "ready_to_issue" ? <p><strong>Internally approved, awaiting issue</strong>. Vendor work has not been released.</p> : null}
    <WorkOrderReadiness readiness={source.issueReadiness} />
    {notice ? <p role="status">{notice}</p> : null}
    {canManage ? <div className="procurement-source__actions">
      {source.status === "ready_to_issue" ? <Button disabled={disabled || !source.issueReadiness.canIssue} onClick={(event) => open("issue", event.currentTarget)}>Issue approved work orders</Button> : null}
      {canReconcile ? <Button variant="secondary" disabled={disabled} onClick={(event) => open("reconcile", event.currentTarget)}>Reconcile estimate source</Button> : null}
    </div> : null}
    {dialog ? <Dialog title={dialog.action === "issue" ? "Issue approved work orders?" : "Reconcile estimate source?"} eyebrow="Procurement" busy={command.isPending} onClose={() => setDialog(null)} initialFocusRef={dialog.action === "issue" ? cancelRef : reasonRef} returnFocusRef={triggerRef} fallbackFocusRef={sectionRef}>
      <form className="ui-dialog__form" noValidate onSubmit={(event) => {
        event.preventDefault(); if (inFlight.current || conflict || disabled || source.version !== dialog.source.version) return;
        if (dialog.action === "reconcile" && reason.trim().length < 3) { setValidation("Enter a reason with at least 3 characters."); reasonRef.current?.focus(); return; }
        if (scopeChanged && !acknowledge) return;
        inFlight.current = true; command.mutate({ ...dialog, reason: reason.trim(), acknowledge });
      }}>
        <div className="ui-dialog__body"><p>{dialog.action === "issue" ? "This releases the approved vendor work. The server rechecks final estimate approval, initial payment and the current source before issuing." : "This moves unissued preparation to the current estimate source and reopens it for review. Earlier approval decisions stay in history. Fresh Super Admin approval is required."}</p>
          {dialog.action === "reconcile" ? <Field id={`reconcile-${source.id}`} label="Reconciliation reason" required error={validation}>{(props) => <Textarea {...props} ref={reasonRef} maxLength={2000} value={reason} disabled={command.isPending} onChange={(event) => { setReason(event.target.value); setValidation(""); }} />}</Field> : null}
          {scopeChanged ? <label className="procurement-source__check"><input type="checkbox" checked={acknowledge} disabled={command.isPending} onChange={(event) => setAcknowledge(event.target.checked)} /><span>Physical scope changed. I will review quantities and terms, then save and resubmit the preparation.</span></label> : null}
          {command.isError ? <p role="alert">{command.error instanceof Error ? command.error.message : "The action could not be completed."}{conflict ? " Current data has been refreshed. Close this dialog and review it before retrying." : ""}</p> : null}
          {source.version !== dialog.source.version ? <p role="alert">This preparation changed. Close this dialog and review its current version.</p> : null}
        </div><div className="ui-dialog__actions"><Button ref={cancelRef} type="button" variant="secondary" onClick={() => setDialog(null)} disabled={command.isPending}>Cancel</Button><Button type="submit" busy={command.isPending} disabled={disabled || conflict || source.version !== dialog.source.version || scopeChanged && !acknowledge}>{dialog.action === "issue" ? "Confirm issue" : "Confirm reconciliation"}</Button></div>
      </form>
    </Dialog> : null}
  </section>;
}
