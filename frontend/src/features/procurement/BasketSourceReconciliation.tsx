import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError } from "../../api/client";
import type { EstimationPreparationSource } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { reconcileBasketEnquirySource, type BasketEnquiry } from "./procurementBasketApi";
import { refreshProcurementLifecycle } from "./procurementLifecycleQueries";
import "./procurementEstimateSource.css";

export function BasketSourceReconciliation({ enquiry, target, disabled }: {
  enquiry: BasketEnquiry; target?: EstimationPreparationSource; disabled: boolean;
}) {
  const client = useQueryClient();
  const [opened, setOpened] = useState<{ version: number; snapshotId: string } | null>(null);
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const keys = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const command = useMutation({
    mutationFn: (input: { expectedVersion: number; expectedSourceSnapshotId: string; reason: string }) => {
      const signature = JSON.stringify(input); let key = keys.current.get(signature);
      if (!key) { key = crypto.randomUUID(); keys.current.set(signature, key); }
      return reconcileBasketEnquirySource(enquiry.projectId, enquiry.mainBasketId, enquiry.id, { ...input, idempotencyKey: key });
    },
    onSuccess: async () => { setOpened(null); keys.current.clear(); setNotice("Final source reconciled. Existing bids are retained for unchanged scope. Revise the award and obtain fresh approval before issuing."); await refreshProcurementLifecycle(client); sectionRef.current?.focus(); },
    onError: async (error) => { if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) { setConflict(true); await refreshProcurementLifecycle(client); } },
    onSettled: () => { inFlight.current = false; }
  });
  if (!target || target.kind !== "approved_final" || !["sent", "award_pending"].includes(enquiry.status)) return null;
  const reconciled = enquiry.sourceReconciliation?.preparationSource.sourceSnapshotId === target.sourceSnapshotId;
  if (enquiry.preparationSource?.sourceSnapshotId === target.sourceSnapshotId && !opened) return null;
  const stale = opened && (opened.version !== enquiry.version || opened.snapshotId !== target.sourceSnapshotId);
  return <section className="procurement-source" aria-label="Final estimate reconciliation" ref={sectionRef} tabIndex={-1}>
    <strong>{reconciled ? "Enquiry reconciled with the final estimate" : "Review this enquiry against the final estimate"}</strong>
    <p>{reconciled ? "The original sent BOQ and bids remain in history. Revise and resubmit the award for fresh approval." : "The final estimate is approved. Reconciliation checks the physical scope before retaining existing vendor bids and reopens any award for fresh approval."}</p>
    {notice ? <p role="status">{notice}</p> : null}
    {!reconciled ? <Button variant="secondary" disabled={disabled} ref={triggerRef} onClick={() => { setOpened({ version: enquiry.version, snapshotId: target.sourceSnapshotId }); setReason(""); setValidation(""); setConflict(false); command.reset(); }}>Reconcile enquiry with final estimate</Button> : null}
    {opened ? <Dialog title="Reconcile enquiry with final estimate?" eyebrow="Procurement" onClose={() => setOpened(null)} busy={command.isPending} initialFocusRef={reasonRef} returnFocusRef={triggerRef} fallbackFocusRef={sectionRef}>
      <form className="ui-dialog__form" noValidate onSubmit={(event) => { event.preventDefault(); if (inFlight.current || disabled || conflict || stale) return;
        if (reason.trim().length < 3) { setValidation("Enter a reason with at least 3 characters."); reasonRef.current?.focus(); return; }
        inFlight.current = true; command.mutate({ expectedVersion: opened.version, expectedSourceSnapshotId: opened.snapshotId, reason: reason.trim() });
      }}><div className="ui-dialog__body"><p>Unchanged scope can retain existing bids. Changed scope requires withdrawing any award, revising the BOQ and sending it for new bids. Existing issued orders cannot change.</p>
        <Field id={`basket-reconcile-${enquiry.id}`} label="Reconciliation reason" required error={validation}>{(props) => <Textarea {...props} ref={reasonRef} value={reason} maxLength={2000} disabled={command.isPending} onChange={(event) => { setReason(event.target.value); setValidation(""); }} />}</Field>
        {command.isError ? <p role="alert">{command.error instanceof Error ? command.error.message : "Reconciliation failed."}{command.error instanceof ApiError && command.error.code === "PROCUREMENT_BASKET_SCOPE_RECONCILIATION_REQUIRED" ? " Close this dialog, withdraw any award, then use Start BOQ revision and resend for updated bids." : conflict ? " Close this dialog and review the refreshed source before trying again." : ""}</p> : null}
        {stale ? <p role="alert">The enquiry or final source changed. Close and review the current version.</p> : null}
      </div><div className="ui-dialog__actions"><Button type="button" variant="secondary" disabled={command.isPending} onClick={() => setOpened(null)}>Cancel</Button><Button type="submit" busy={command.isPending} disabled={disabled || conflict || Boolean(stale)}>Confirm reconciliation</Button></div></form>
    </Dialog> : null}
  </section>;
}
