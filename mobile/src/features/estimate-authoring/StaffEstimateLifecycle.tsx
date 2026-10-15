import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { ProtectedDocumentViewer } from "../documents/ProtectedDocumentViewer";
import { estimateCommand, getAssignableEstimateDesigners, releaseEstimatePreparation, retryEstimateEmail, staffEstimateQueueKey } from "./staffEstimateApi";
import type { EstimateDraft } from "./types";
import { EstimateModal, EstimateSection, EstimateSelect, EstimateText, estimateStyles as styles } from "./EstimateUI";
import { estimateEditable, estimatePaise } from "./staffEstimateModel";

type Action = "send-client" | "assign" | "approve" | "request_changes" | "enable-collaboration" | "withdraw-review" | "release" | "retry";
export function StaffEstimateLifecycle({ estimate, session, disabled, execute }: {
  readonly estimate: EstimateDraft; readonly session: AuthenticatedSession; readonly disabled: boolean;
  readonly execute: (work: () => Promise<EstimateDraft | null>, notice: string) => Promise<boolean>;
}) {
  const context = useConfiguredRuntime();
  const [dialog, setDialog] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [designerId, setDesignerId] = useState("");
  const [validation, setValidation] = useState("");
  const [pdf, setPdf] = useState(false);
  const lifecycle = estimate.estimation;
  const status = lifecycle?.status ?? estimate.status;
  const review = estimate.clientReview;
  const op = (operation: Parameters<typeof canPerformOperation>[1]) => canPerformOperation(session, operation);
  const canAssign = status === "pending_manager_assignment" && op("POST /estimates/:estimateId/assign");
  const designers = useQuery({ queryKey: staffEstimateQueueKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "assignable-designers"), queryFn: ({ signal }) => getAssignableEstimateDesigners(context.runtime, signal), enabled: canAssign && op("GET /estimates/designers") });
  const open = (action: Action) => { setDialog(action); setReason(""); setDesignerId(""); setValidation(""); };
  async function confirm() {
    if (!dialog || disabled || estimate.version === undefined) return;
    if ((dialog === "withdraw-review" || dialog === "request_changes") && !reason.trim()) { setValidation("Explain the requested change before continuing."); return; }
    if (dialog === "assign" && (!designerId || !designers.data?.some((item) => item.id === designerId) || designers.isError)) { setValidation("Select a current assignable Designer."); return; }
    const action = dialog;
    await execute(async () => {
      if (action === "retry") { if (!review) throw new Error("Refresh the published review."); await retryEstimateEmail(context.runtime, estimate.id, review); return null; }
      if (action === "release") { await releaseEstimatePreparation(context.runtime, estimate.id, estimate.version!); return null; }
      if (action === "assign") return estimateCommand(context.runtime, estimate.id, "assign", { designerId });
      if (action === "approve" || action === "request_changes") return estimateCommand(context.runtime, estimate.id, "designer-decision", { decision: action, note: reason.trim() });
      if (action === "withdraw-review") {
        if (!review || review.status !== "pending" || lifecycle?.pendingReviewRoundId !== review.id) throw new Error("Refresh the current client review.");
        return estimateCommand(context.runtime, estimate.id, action, { expectedVersion: estimate.version, reviewRoundId: review.id, reviewRoundVersion: review.version, reason: reason.trim() });
      }
      return estimateCommand(context.runtime, estimate.id, action, { expectedVersion: estimate.version });
    }, action === "retry" ? "Email delivery updated." : action === "release" ? "Saved version released for procurement preparation. Work orders still require final approval and payment confirmation." : action === "withdraw-review" ? "Review withdrawn. Its immutable history remains available." : "Estimate workflow updated.");
    // Recovery controls live in the workspace/queue. Close after either result so a blocked action cannot trap the modal.
    setDialog(null);
  }
  const titles: Record<Action, string> = { "send-client": "Publish estimate to Client", assign: "Assign approval Designer", approve: "Approve for Client", request_changes: "Request estimate changes", "enable-collaboration": "Enable collaborative estimation", "withdraw-review": "Withdraw client review", release: "Release saved version for preparation", retry: "Retry estimate email" };
  return <EstimateSection title="Estimate workflow">
    <EstimateText>{lifecycle?.phase === "post" ? "Post-estimation" : lifecycle ? "Pre-estimation" : "Estimate"} · {status.replaceAll("_", " ")} · Version {estimate.version ?? "unavailable"}</EstimateText>
    <EstimateText>Saved total including GST: {estimatePaise(estimate.totalPaise ?? Math.round(estimate.total * 100))}</EstimateText>
    {lifecycle?.finalApproval || lifecycle?.editClosedAt ? <EstimateText>Design and final estimate approval are recorded. Estimate editing is closed. Initial payment confirmation is required before work orders.</EstimateText> : null}
    {lifecycle?.phase === "post" && !lifecycle.finalApproval && (estimate.designPlanStatus !== "approved" || lifecycle.approvedDesignScopeRevision !== lifecycle.designScopeRevision) ? <EstimateText>Final submission is waiting for approved Design matching the current estimate scope.</EstimateText> : null}
    {estimate.clientFeedback ? <EstimateText>Client feedback: {estimate.clientFeedback.note}</EstimateText> : null}
    {review ? <><EstimateText>Client review: {review.status.replaceAll("_", " ")} · Email {review.deliveryStatus}</EstimateText>{["failed", "disabled"].includes(review.deliveryStatus) ? <EstimateText>The submitted estimate remains in the Client portal. Retry delivery of the same submission when email is available.</EstimateText> : null}</> : null}
    <View style={styles.row}>
      {status === "ready_for_client" && op("POST /estimates/:estimateId/send-client") ? <Button label="Send to Client" disabled={disabled} onPress={() => open("send-client")} /> : null}
      {canAssign ? <Button label="Assign Designer" disabled={disabled} onPress={() => open("assign")} /> : null}
      {status === "pending_designer_approval" && session.user.role === "designer" && estimate.assignedDesignerId === session.user.id && op("POST /estimates/:estimateId/designer-decision") ? <><Button label="Approve for Client" disabled={disabled} onPress={() => open("approve")} /><Button label="Request estimate changes" variant="secondary" disabled={disabled} onPress={() => open("request_changes")} /></> : null}
      {lifecycle && !lifecycle.editClosedAt && status === "sent_to_client" && review?.status === "pending" && lifecycle.pendingReviewRoundId === review.id && op("POST /estimates/:estimateId/withdraw-review") ? <Button label="Withdraw review to edit" disabled={disabled} variant="secondary" onPress={() => open("withdraw-review")} /> : null}
      {!lifecycle && estimate.projectId && estimate.designPlanStatus !== "approved" && ["draft", "designer_changes_requested", "client_changes_requested", "client_approved"].includes(status) && op("POST /estimates/:estimateId/enable-collaboration") ? <Button label="Enable collaboration" disabled={disabled} variant="secondary" onPress={() => open("enable-collaboration")} /> : null}
      {lifecycle?.phase === "post" && lifecycle.preApproval && estimateEditable(estimate) && op("POST /estimates/:estimateId/preparation-snapshots") ? <Button label="Release saved estimate for preparation" disabled={disabled} variant="secondary" onPress={() => open("release")} /> : null}
      {review?.status === "pending" && ["failed", "disabled"].includes(review.deliveryStatus) && op("POST /estimates/:estimateId/client-email/retry") ? <Button label="Retry email" disabled={disabled} variant="secondary" onPress={() => open("retry")} /> : null}
      {op("GET /estimates/:estimateId/pdf") ? <Button label="Open saved proposal PDF" disabled={disabled} variant="secondary" onPress={() => setPdf(true)} /> : null}
    </View>
    {dialog ? <EstimateModal title={titles[dialog]} busy={disabled} onClose={() => setDialog(null)}>
      <EstimateText>Saved estimate version {estimate.version}. Unsaved changes are not part of this action.</EstimateText>
      {dialog === "send-client" ? <EstimateText>This publishes a frozen estimate for Client approval and requests email delivery.</EstimateText> : null}
      {dialog === "withdraw-review" ? <EstimateText>The Client can no longer approve this submission. Its PDF and previous approvals remain recorded.</EstimateText> : null}
      {dialog === "assign" ? <><EstimateSelect label="Approval Designer" value={designerId} options={(designers.data ?? []).map((item) => ({ value: item.id, label: item.name }))} onChange={setDesignerId} disabled={disabled || designers.isFetching || designers.isError} />{designers.isError ? <Button label="Refresh Designers" onPress={() => void designers.refetch()} /> : null}</> : null}
      {["withdraw-review", "request_changes", "approve"].includes(dialog) ? <Field label="Review reason" value={reason} onChangeText={setReason} multiline maxLength={1000} editable={!disabled} /> : null}
      {validation ? <EstimateText error>{validation}</EstimateText> : null}
      <Button label={`Confirm ${titles[dialog].toLowerCase()}`} disabled={disabled} onPress={() => void confirm()} />
    </EstimateModal> : null}
    <ProtectedDocumentViewer visible={pdf} source={pdf ? { path: `/estimates/${encodeURIComponent(estimate.id)}/pdf`, fileName: `estimate-${estimate.id}.pdf`, mimeType: "application/pdf", kind: "estimate-pdf" } : null} onClose={() => setPdf(false)} />
  </EstimateSection>;
}
