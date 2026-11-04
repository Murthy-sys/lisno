import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Textarea } from "../../components/ui/Field";
import { enableQuotationWorkflow, getQuotationTransitionPreview, releaseEstimatePreparation, withdrawEstimateReview } from "../estimates/estimateWorkflowApi";
import { refreshEstimateCollaboration } from "./estimateCollaborationQueries";
import type { EstimateDraft } from "./leadsApi";
import { unlockQuotation } from "../client/quotationApi";
import { currentQuotationApprovalState, currentQuotationIsApproved } from "../estimates/quotationApproval";
import "./staffEstimateCollaboration.css";

type Action = "enable" | "withdraw" | "release" | "unlock";
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
const total = (value: { total: number; totalPaise?: number }) => money(value.totalPaise ?? Math.round(value.total * 100));

function quotationStatusCopy(estimate: EstimateDraft) {
  const state = currentQuotationApprovalState(estimate);
  if (state === "initial_current" && currentQuotationIsApproved(estimate)) {
    return "Initial estimate approved. No quotation changes require Client review.";
  }
  if (state === "revision_current" && currentQuotationIsApproved(estimate)) {
    return "The Client approved the revised quotation. Design work can continue.";
  }
  if (state === "revision_draft") return "Client approval is required for the revised quotation before design work continues.";
  if (state === "revision_pending_client") return "The revised quotation is awaiting Client approval.";
  if (state === "revision_changes_requested") return "The Client requested quotation changes. Update and resubmit the revision before design work continues.";
  return "The current quotation approval could not be verified. Refresh before continuing design work.";
}

function quotationStatusHeading(estimate: EstimateDraft) {
  const state = currentQuotationApprovalState(estimate);
  if (state === "initial_current") return "Current approved quotation";
  if (state === "revision_current") return "Revised quotation approved";
  if (state === "revision_draft") return "Revised quotation draft";
  if (state === "revision_pending_client") return "Revised quotation under Client review";
  if (state === "revision_changes_requested") return "Quotation changes requested";
  return "Quotation approval unavailable";
}

export function StaffEstimateCollaboration({ estimate, disabled = false, onVersionAdvance, compact = false }: {
  estimate: EstimateDraft; disabled?: boolean; onVersionAdvance?: (before: number, after: number) => void; compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ action: Action; estimate: EstimateDraft; idempotencyKey: string } | null>(null);
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const inFlight = useRef(false);
  const preview = useQuery({
    queryKey: ["estimate-collaboration", estimate.id, "transition-preview", dialog?.estimate.version],
    queryFn: () => getQuotationTransitionPreview(estimate.id), enabled: dialog?.action === "enable", retry: false
  });
  const transitionReady = preview.data?.eligible === true && preview.data.estimateId === dialog?.estimate.id &&
    preview.data.estimateVersion === dialog?.estimate.version && !preview.isFetching && !preview.isError;
  const command = useMutation({
    mutationFn: async (input: { action: Action; source: EstimateDraft; reason: string; idempotencyKey: string }) => {
      const version = input.source.version;
      if (version === undefined) throw new Error("Refresh this estimate before continuing.");
      if (input.action === "enable") {
        if (!transitionReady || !preview.data) throw new Error("Review the current transition preview before continuing.");
        return enableQuotationWorkflow(input.source.id, { expectedVersion: version, targetVersion: 3, reason: input.reason, previewFingerprint: preview.data.previewFingerprint });
      }
      if (input.action === "release") return releaseEstimatePreparation(input.source.id, version);
      if (input.action === "unlock") {
        const approval = input.source.estimation?.finalApproval;
        if (!approval) throw new Error("The approved quotation is unavailable.");
        return unlockQuotation(input.source.id, { expectedVersion: version, reviewRoundId: approval.reviewRoundId, reason: input.reason, idempotencyKey: input.idempotencyKey });
      }
      const review = input.source.clientReview;
      if (!review) throw new Error("The current review is unavailable.");
      return withdrawEstimateReview(input.source.id, { expectedVersion: version, reviewRoundId: review.id, reviewRoundVersion: review.version, reason: input.reason });
    },
    onSuccess: async (result, input) => {
      if (input.action !== "release" && "version" in result && typeof result.version === "number" && input.source.version !== undefined) onVersionAdvance?.(input.source.version, result.version);
      setDialog(null);
      setMessage(input.action === "unlock" ? "Quotation reopened. Save and submit the revised quotation for client approval." : input.action === "withdraw" ? "Review withdrawn. The client cannot approve that submission; its history is preserved." : input.action === "release" ? "Saved estimate released for procurement preparation. Final approval and initial payment are still required before work orders." : "Quotation workflow enabled. The current Client approval remains effective until a saved quotation revision requires review.");
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
  const quotationWorkflow = lifecycle?.workflowVersion === 3;
  const quotationReapprovalStage = quotationWorkflow && lifecycle?.phase === "post";
  const quotationState = quotationReapprovalStage ? currentQuotationApprovalState(estimate) : undefined;
  const quotationCopy = quotationReapprovalStage ? quotationStatusCopy(estimate) : "";
  const closed = Boolean(lifecycle?.editClosedAt || !quotationWorkflow && lifecycle?.finalApproval);
  const canUnlock = quotationWorkflow && closed && estimate.capabilities?.canUnlockQuotation === true && Boolean(lifecycle.finalApproval);
  const editable = !closed && ["draft", "designer_changes_requested", "client_changes_requested"].includes(lifecycle?.status ?? estimate.status);
  const canWithdraw = lifecycle && !lifecycle.editClosedAt && lifecycle.status === "sent_to_client" && estimate.clientReview?.status === "pending" && lifecycle.pendingReviewRoundId === estimate.clientReview.id;
  const canEnable = !quotationWorkflow && !closed && estimate.projectId && ["draft", "designer_changes_requested", "client_changes_requested", "client_approved"].includes(lifecycle?.status ?? estimate.status);
  const canRelease = !quotationWorkflow && lifecycle?.phase === "post" && lifecycle.preApproval && editable;
  const hasActions = Boolean(canUnlock || canEnable || canWithdraw || canRelease);
  const open = (action: Action, button: HTMLButtonElement) => {
    triggerRef.current = button; setReason(""); setValidation(""); setMessage(""); setConflict(false); command.reset(); setDialog({ action, estimate, idempotencyKey: crypto.randomUUID() });
  };
  const actionControls = <div className="staff-estimate-flow__actions">
      {canUnlock ? <Button variant="secondary" disabled={disabled || command.isPending || estimate.version === undefined} onClick={(event) => open("unlock", event.currentTarget)}>Unlock quotation</Button> : null}
      {canEnable ? <Button variant="secondary" disabled={disabled || command.isPending || estimate.version === undefined} onClick={(event) => open("enable", event.currentTarget)}>Enable collaboration</Button> : null}
      {canWithdraw ? <Button variant="secondary" disabled={disabled || command.isPending || estimate.version === undefined} onClick={(event) => open("withdraw", event.currentTarget)}>Withdraw review to edit</Button> : null}
      {canRelease ? <Button variant="secondary" disabled={disabled || command.isPending || estimate.version === undefined} onClick={(event) => open("release", event.currentTarget)}>Release saved estimate for preparation</Button> : null}
    </div>;
  if ((!lifecycle && !canEnable || compact && !hasActions && !quotationReapprovalStage) && !dialog && !message) return null;
  return <section className={`staff-estimate-flow${compact ? " staff-estimate-flow--compact" : ""}`} aria-label="Estimate collaboration" ref={sectionRef} tabIndex={-1}>
    {compact ? hasActions ? <details className="staff-estimate-actions-menu" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary aria-label="Estimate actions">Actions</summary><div className="staff-estimate-actions-menu__options">
      <p className="staff-estimate-flow__notice">{closed ? "Approved estimate · editing locked" : (lifecycle?.status ?? estimate.status).replaceAll("_", " ")}</p>
      {lifecycle?.workflowVersion === 2 && lifecycle.phase === "post" && !lifecycle.finalApproval && (estimate.designPlanStatus !== "approved" || lifecycle.approvedDesignScopeRevision !== lifecycle.designScopeRevision) ? <p className="staff-estimate-flow__notice">Final submission needs approved design matching the current scope.</p> : null}
      {lifecycle?.preparationSnapshotId ? <p className="staff-estimate-flow__notice">Later draft changes do not update the saved procurement preparation source.</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {actionControls}
    </div></details> : message ? <p role="status">{message}</p> : quotationReapprovalStage ? <p className="staff-estimate-flow__notice" role={quotationState === "source_issue" ? "alert" : "status"}>{quotationCopy}</p> : null : <>
    <div className="staff-estimate-flow__heading"><div><p className="eyebrow">{quotationReapprovalStage ? "Quotation approval" : lifecycle ? lifecycle.phase === "post" ? "Post-estimation" : "Pre-estimation" : "Existing estimate"}</p><h2>{quotationReapprovalStage ? quotationStatusHeading(estimate) : closed ? "Final estimate approved" : lifecycle ? "Estimate collaboration" : "Enable client collaboration"}</h2></div>
      {lifecycle ? <dl className="staff-estimate-flow__totals"><div><dt>{quotationWorkflow ? "Pre-design approved total" : "Approved pre-estimate"}</dt><dd>{estimate.preApprovedReview ? total(estimate.preApprovedReview.snapshot) : lifecycle.preApproval ? "Source unavailable" : "Not approved yet"}</dd></div><div><dt>{closed ? "Approved total" : "Saved proposed total"}</dt><dd>{total(estimate)}</dd></div></dl> : null}
    </div>
    {quotationReapprovalStage ? <p role={quotationState === "source_issue" ? "alert" : "status"}>{quotationCopy}</p>
      : closed ? <p>Design and final estimate approval are recorded. Estimate editing is closed. Super Admin confirms the initial payment before work orders can be issued.</p>
      : lifecycle?.status === "sent_to_client" ? <p>The client is reviewing a frozen submission. Withdraw that review with a reason before editing.</p>
        : lifecycle?.phase === "post" ? <p>Design and procurement preparation can continue. Resolve client requests and approve design for the current scope before submitting the final estimate.</p>
          : lifecycle ? <p>{quotationWorkflow ? "Prepare the pre-design quotation and resolve client requirements before submission. Client approval starts design work." : "Prepare the pre-estimate and resolve client requirements before submission. Client approval starts design and procurement preparation."}</p>
            : <p>Move an eligible project to pre/post estimation. Existing commitments and historical sources are checked before this change is accepted.</p>}
    {lifecycle?.workflowVersion === 2 && lifecycle.phase === "post" && !lifecycle.finalApproval && (estimate.designPlanStatus !== "approved" || lifecycle.approvedDesignScopeRevision !== lifecycle.designScopeRevision) ? <p className="staff-estimate-flow__notice">Final submission is waiting for approved design that matches the current estimate scope.</p> : null}
    {lifecycle?.preparationSnapshotId ? <p className="staff-estimate-flow__notice">Procurement has a frozen preparation source. Later draft changes do not update that source automatically.</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {actionControls}
    </>}
    {dialog ? <Dialog title={dialog.action === "unlock" ? "Unlock this quotation?" : dialog.action === "withdraw" ? "Withdraw this client review?" : dialog.action === "release" ? "Release saved estimate for preparation?" : "Enable revised quotation workflow?"} eyebrow="Estimate workflow" onClose={() => setDialog(null)} busy={command.isPending} initialFocusRef={dialog.action === "withdraw" || dialog.action === "unlock" ? reasonRef : cancelRef} returnFocusRef={triggerRef} fallbackFocusRef={sectionRef}>
      <form className="ui-dialog__form" noValidate onSubmit={(event) => {
        event.preventDefault(); if (inFlight.current || conflict) return;
        if (dialog.action === "enable" && !transitionReady) return;
        if (dialog.action !== "release" && (!reason.trim() || reason.trim().length > 1000)) { setValidation("Enter a reason in 1 to 1,000 characters."); reasonRef.current?.focus(); return; }
        inFlight.current = true; command.mutate({ action: dialog.action, source: dialog.estimate, reason: reason.trim(), idempotencyKey: dialog.idempotencyKey });
      }}>
        <div className="ui-dialog__body"><p>Saved estimate version {dialog.estimate.version} · {total(dialog.estimate)}</p>
          <p>{dialog.action === "unlock" ? "This creates a new working revision. Earlier approvals and issued orders remain recorded. The client must approve the revised quotation again." : dialog.action === "withdraw" ? "The client will no longer be able to approve this submission. Its PDF, review history, and any earlier approvals remain recorded." : dialog.action === "release" ? "Only this saved version will be frozen for procurement. Save your draft first to include unsaved edits. This release does not approve the estimate or permit issuing work orders." : "The server will verify that this project can enter the new workflow safely. Existing approvals and project records will be retained."}</p>
          {dialog.action === "enable" ? <div>
            <p>The Client-approved quotation stays current while unchanged. If the Designer saves a material revision, the Client must approve that revision before design work continues.</p>
            {preview.isPending || preview.isFetching ? <p role="status">Checking this project's current approvals and commitments…</p> : preview.isError ? <p role="alert">The transition preview is unavailable. <Button variant="secondary" onClick={() => void preview.refetch()}>Retry preview</Button></p>
              : preview.data ? <>{preview.data.blockers.length ? <div role="status"><p>This project needs reconciliation before the workflow can change.</p><ul>{preview.data.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul></div> : null}
                {preview.data.estimateVersion !== dialog.estimate.version ? <p role="alert">The estimate changed. Close this dialog and review the latest saved estimate.</p> : preview.data.eligible ? <p>This saved draft is eligible. Existing approval history will be preserved.</p> : null}</> : null}
          </div> : null}
          {dialog.action !== "release" ? <Field id="estimate-action-reason" label={dialog.action === "enable" ? "Workflow change reason" : dialog.action === "unlock" ? "Unlock reason" : "Withdrawal reason"} required error={validation}>{(props) => <Textarea {...props} ref={reasonRef} value={reason} maxLength={1000} disabled={command.isPending} onChange={(event) => { setReason(event.target.value); setValidation(""); }} />}</Field> : null}
          {command.isError ? <p role="alert">{command.error instanceof ApiError ? command.error.message : "The action could not be completed. Please try again."}{conflict ? " The latest state has been refreshed. Close this dialog and review it before trying again." : ""}</p> : null}
        </div>
        <div className="ui-dialog__actions"><Button ref={cancelRef} variant="secondary" disabled={command.isPending} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" busy={command.isPending} disabled={conflict || dialog.action === "enable" && !transitionReady}>{dialog.action === "unlock" ? "Confirm unlock" : dialog.action === "withdraw" ? "Withdraw review" : dialog.action === "release" ? "Release saved version" : "Confirm enable collaboration"}</Button></div>
      </form>
    </Dialog> : null}
  </section>;
}
