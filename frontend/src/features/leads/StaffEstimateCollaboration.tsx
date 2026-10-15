import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { enableEstimateCollaboration, releaseEstimatePreparation, withdrawEstimateReview } from "../estimates/estimateWorkflowApi";
import { refreshEstimateCollaboration } from "./estimateCollaborationQueries";
import type { EstimateDraft } from "./leadsApi";
import "./staffEstimateCollaboration.css";

type Action = "enable" | "withdraw" | "release";
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
const total = (value: { total: number; totalPaise?: number }) => money(value.totalPaise ?? Math.round(value.total * 100));

export function StaffEstimateCollaboration({ estimate, disabled = false, onVersionAdvance }: {
  estimate: EstimateDraft; disabled?: boolean; onVersionAdvance?: (before: number, after: number) => void;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ action: Action; estimate: EstimateDraft } | null>(null);
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const inFlight = useRef(false);
  const command = useMutation({
    mutationFn: async (input: { action: Action; source: EstimateDraft; reason: string }) => {
      const version = input.source.version;
      if (version === undefined) throw new Error("Refresh this estimate before continuing.");
      if (input.action === "enable") return enableEstimateCollaboration(input.source.id, version);
      if (input.action === "release") return releaseEstimatePreparation(input.source.id, version);
      const review = input.source.clientReview;
      if (!review) throw new Error("The current review is unavailable.");
      return withdrawEstimateReview(input.source.id, { expectedVersion: version, reviewRoundId: review.id, reviewRoundVersion: review.version, reason: input.reason });
    },
    onSuccess: async (result, input) => {
      if (input.action !== "release" && "version" in result && typeof result.version === "number" && input.source.version !== undefined) onVersionAdvance?.(input.source.version, result.version);
      setDialog(null);
      setMessage(input.action === "withdraw" ? "Review withdrawn. The client cannot approve that submission; its history is preserved." : input.action === "release" ? "Saved estimate released for procurement preparation. Final approval and initial payment are still required before work orders." : "Collaborative estimation enabled. The existing project and approval history are preserved.");
      await refreshEstimateCollaboration(queryClient);
      sectionRef.current?.focus();
    },
    onError: async (error) => {
      if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) {
        setConflict(true);
        await refreshEstimateCollaboration(queryClient);
      }
    },
    onSettled: () => { inFlight.current = false; }
  });
  const lifecycle = estimate.estimation;
  const editable = !lifecycle?.editClosedAt && !lifecycle?.finalApproval && ["draft", "designer_changes_requested", "client_changes_requested"].includes(lifecycle?.status ?? estimate.status);
  const canWithdraw = lifecycle && !lifecycle.editClosedAt && lifecycle.status === "sent_to_client" && estimate.clientReview?.status === "pending" && lifecycle.pendingReviewRoundId === estimate.clientReview.id;
  const canEnable = !lifecycle && estimate.projectId && estimate.designPlanStatus !== "approved" && ["draft", "designer_changes_requested", "client_changes_requested", "client_approved"].includes(estimate.status);
  const open = (action: Action, button: HTMLButtonElement) => {
    triggerRef.current = button; setReason(""); setValidation(""); setMessage(""); setConflict(false); command.reset(); setDialog({ action, estimate });
  };
  if (!lifecycle && !canEnable) return null;
  return <section className="staff-estimate-flow" aria-label="Estimate collaboration" ref={sectionRef} tabIndex={-1}>
    <div className="staff-estimate-flow__heading"><div><p className="eyebrow">{lifecycle ? lifecycle.phase === "post" ? "Post-estimation" : "Pre-estimation" : "Existing estimate"}</p><h2>{lifecycle?.editClosedAt || lifecycle?.finalApproval ? "Final estimate approved" : lifecycle ? "Estimate collaboration" : "Enable client collaboration"}</h2></div>
      {lifecycle ? <dl className="staff-estimate-flow__totals"><div><dt>Approved pre-estimate</dt><dd>{estimate.preApprovedReview ? total(estimate.preApprovedReview.snapshot) : lifecycle.preApproval ? "Source unavailable" : "Not approved yet"}</dd></div><div><dt>{lifecycle.finalApproval ? "Final approved total" : "Saved proposed total"}</dt><dd>{total(estimate)}</dd></div></dl> : null}
    </div>
    {lifecycle?.editClosedAt || lifecycle?.finalApproval ? <p>Design and final estimate approval are recorded. Estimate editing is closed. Super Admin confirms the initial payment before work orders can be issued.</p>
      : lifecycle?.status === "sent_to_client" ? <p>The client is reviewing a frozen submission. Withdraw that review with a reason before editing.</p>
        : lifecycle?.phase === "post" ? <p>Design and procurement preparation can continue. Resolve client requests and approve design for the current scope before submitting the final estimate.</p>
          : lifecycle ? <p>Prepare the pre-estimate and resolve client requirements before submission. Client approval starts design and procurement preparation.</p>
            : <p>Move an eligible project to pre/post estimation. Existing commitments and historical sources are checked before this change is accepted.</p>}
    {lifecycle?.phase === "post" && !lifecycle.finalApproval && (estimate.designPlanStatus !== "approved" || lifecycle.approvedDesignScopeRevision !== lifecycle.designScopeRevision) ? <p className="staff-estimate-flow__notice">Final submission is waiting for approved design that matches the current estimate scope.</p> : null}
    {lifecycle?.preparationSnapshotId ? <p className="staff-estimate-flow__notice">Procurement has a frozen preparation source. Later draft changes do not update that source automatically.</p> : null}
    {message ? <p role="status">{message}</p> : null}
    <div className="staff-estimate-flow__actions">
      {canEnable ? <Button variant="secondary" disabled={disabled || command.isPending || estimate.version === undefined} onClick={(event) => open("enable", event.currentTarget)}>Enable collaboration</Button> : null}
      {canWithdraw ? <Button variant="secondary" disabled={disabled || command.isPending || estimate.version === undefined} onClick={(event) => open("withdraw", event.currentTarget)}>Withdraw review to edit</Button> : null}
      {lifecycle?.phase === "post" && lifecycle.preApproval && editable ? <Button variant="secondary" disabled={disabled || command.isPending || estimate.version === undefined} onClick={(event) => open("release", event.currentTarget)}>Release saved estimate for preparation</Button> : null}
    </div>
    {dialog ? <Dialog title={dialog.action === "withdraw" ? "Withdraw this client review?" : dialog.action === "release" ? "Release saved estimate for preparation?" : "Enable collaborative estimation?"} eyebrow="Estimate workflow" onClose={() => setDialog(null)} busy={command.isPending} initialFocusRef={dialog.action === "withdraw" ? reasonRef : cancelRef} returnFocusRef={triggerRef} fallbackFocusRef={sectionRef}>
      <form className="ui-dialog__form" noValidate onSubmit={(event) => {
        event.preventDefault(); if (inFlight.current || conflict) return;
        if (dialog.action === "withdraw" && (!reason.trim() || reason.trim().length > 1000)) { setValidation("Explain why this review is being withdrawn in 1 to 1,000 characters."); reasonRef.current?.focus(); return; }
        inFlight.current = true; command.mutate({ action: dialog.action, source: dialog.estimate, reason: reason.trim() });
      }}>
        <div className="ui-dialog__body"><p>Saved estimate version {dialog.estimate.version} · {total(dialog.estimate)}</p>
          <p>{dialog.action === "withdraw" ? "The client will no longer be able to approve this submission. Its PDF, review history, and any earlier approvals remain recorded." : dialog.action === "release" ? "Only this saved version will be frozen for procurement. Save your draft first to include unsaved edits. This release does not approve the estimate or permit issuing work orders." : "The server will verify that this project can enter the new workflow safely. Existing approvals and project records will be retained."}</p>
          {dialog.action === "withdraw" ? <Field id="withdraw-estimate-reason" label="Withdrawal reason" required error={validation}>{(props) => <Textarea {...props} ref={reasonRef} value={reason} maxLength={1000} disabled={command.isPending} onChange={(event) => { setReason(event.target.value); setValidation(""); }} />}</Field> : null}
          {command.isError ? <p role="alert">{command.error instanceof ApiError ? command.error.message : "The action could not be completed. Please try again."}{conflict ? " The latest state has been refreshed. Close this dialog and review it before trying again." : ""}</p> : null}
        </div>
        <div className="ui-dialog__actions"><Button ref={cancelRef} variant="secondary" disabled={command.isPending} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" busy={command.isPending} disabled={conflict}>{dialog.action === "withdraw" ? "Withdraw review" : dialog.action === "release" ? "Release saved version" : "Confirm enable collaboration"}</Button></div>
      </form>
    </Dialog> : null}
  </section>;
}
