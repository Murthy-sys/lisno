import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { ProtectedDocumentViewer } from "../documents/ProtectedDocumentViewer";
import type { ProtectedDocumentSource } from "../documents/useProtectedDocument";
import { clientEstimateListKey, clientEstimatePdfPath, decideClientEstimate, type ClientEstimateDecisionResult } from "./clientReviewApi";
import { canDecideClientEstimate, clientEstimateMoney, type ClientEstimate, type ClientPublishedReview } from "./clientReviewModel";

type Decision = "approve" | "request_changes";

export function ClientEstimateAction({ estimate, session, onDecision, onRefresh, decisionRecorded = false, decisionBlocked = false }: {
  readonly estimate: ClientEstimate;
  readonly session: AuthenticatedSession;
  readonly onDecision: (result: ClientEstimateDecisionResult) => void;
  readonly onRefresh: () => Promise<unknown>;
  readonly decisionRecorded?: boolean;
  readonly decisionBlocked?: boolean;
}) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openPdfId, setOpenPdfId] = useState<string | null>(null);
  const submitting = useRef(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const review = estimate.reviewSourceIssue ? null : estimate.publishedReview;
  const phaseName = review?.phase === "post" ? "final post-estimate" : review?.phase === "pre" ? "pre-estimate" : "estimate";
  const canDownload = session.user.role === "client" && Boolean(review) && canPerformOperation(session, "GET /client/estimates/:estimateId/pdf");
  const canDecide = session.user.role === "client" && !needsRefresh && canPerformOperation(session, "POST /client/estimates/:estimateId/decision") && canDecideClientEstimate(estimate) && !decisionRecorded && !decisionBlocked;
  const pdfOpen = openPdfId === review?.id;
  const pdfSource: ProtectedDocumentSource = {
    path: review ? clientEstimatePdfPath(estimate.id, review.id) : "",
    fileName: `lisno-estimate-${estimate.id}.pdf`,
    mimeType: "application/pdf",
    kind: "estimate-pdf"
  };

  const mutation = useMutation({
    mutationFn: ({ choice, message, round }: { choice: Decision; message: string; round: Pick<ClientPublishedReview, "id" | "version"> }) =>
      decideClientEstimate(context.runtime, estimate.id, choice, message, round),
    onSuccess: async (result) => {
      setDecision(null);
      setNote("");
      setError(null);
      onDecision(result);
      await invalidate("estimate-decision-changed").catch(() => { setError("Your decision was saved, but the latest details could not be loaded. Refresh the estimate."); });
    },
    onError: (cause) => {
      setNeedsRefresh(true);
      setDecision(null);
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        queryClient.setQueryData(clientEstimateListKey({ environmentId: context.environment.environment.id, userId: session.user.id }), []);
        void invalidate("estimate-decision-changed").catch(() => undefined);
      }
      if (cause instanceof ApiError && cause.status === 409) {
        setError("This estimate has changed. Refresh it before sending a decision again.");
        return;
      }
      setError(cause instanceof ApiError && [401, 403, 404].includes(cause.status)
        ? "This estimate is no longer available to your account. Refresh to check access."
        : "Your decision could not be confirmed. Refresh the submitted estimate before trying again.");
    },
    onSettled: () => { submitting.current = false; }
  });

  function confirm() {
    if (!decision || !canDecide || !review || mutation.isPending || submitting.current) return;
    const message = note.trim();
    if (message.length > 1000 || (decision === "request_changes" && !message)) {
      setError("Describe the changes you need before sending the request.");
      return;
    }
    setError(null);
    submitting.current = true;
    mutation.mutate({ choice: decision, message, round: { id: review.id, version: review.version } });
  }

  async function refresh() {
    setRefreshing(true);
    try { await onRefresh(); setNeedsRefresh(false); setError(null); mutation.reset(); }
    catch { setError("The latest estimate could not be loaded. Refresh again when you are connected."); }
    finally { setRefreshing(false); }
  }

  if (!canDownload && !canDecide && !error) return null;

  return (
    <View testID="client-estimate-actions" style={styles.section}>
      {canDownload ? <Button label="Open estimate PDF" variant="secondary" onPress={() => setOpenPdfId(review!.id)} /> : null}
      {canDecide && !decision ? (
        <View style={styles.actions}>
          <View style={styles.action}><Button label="Request changes" variant="secondary" onPress={() => { setError(null); setDecision("request_changes"); }} /></View>
          <View style={styles.action}><Button label={`Approve ${phaseName}`} onPress={() => { setError(null); setDecision("approve"); }} /></View>
        </View>
      ) : null}
      {canDecide && decision ? (
        <View style={styles.form}>
          <Text accessibilityRole="header" style={styles.formTitle}>{decision === "approve" ? "Confirm estimate approval" : "Request estimate changes"}</Text>
          <Text style={styles.copy}>{review?.snapshot.projectName} · Version {review?.estimateVersion} · Submission {review?.sendGeneration}</Text>
          <Text style={styles.copy}>Total including GST: {clientEstimateMoney(estimate.total)}</Text>
          {review?.phase === "post" && decision === "approve" ? <Text style={styles.copy}>Final approval closes estimate changes. Work orders remain subject to initial payment confirmation and procurement checks.</Text> : null}
          <Text style={styles.copy}>{decision === "approve"
            ? "Your approval records this estimate as accepted. Review the included items and total before confirming."
            : "Tell the team what must change in this estimate."}</Text>
          <Field label={decision === "approve" ? "Review note (optional)" : "Requested changes"} value={note} onChangeText={setNote} multiline maxLength={1000} />
          <View style={styles.actions}>
            <View style={styles.action}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={() => { setDecision(null); setError(null); }} /></View>
            <View style={styles.action}><Button label={decision === "approve" ? "Confirm approval" : "Send change request"} loading={mutation.isPending} disabled={decision === "request_changes" && !note.trim()} onPress={confirm} /></View>
          </View>
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorBlock}>
          <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>
          {error.includes("Refresh") ? <Button label="Refresh estimate" variant="quiet" loading={refreshing} onPress={() => void refresh()} /> : null}
        </View>
      ) : null}
      {canDownload ? <ProtectedDocumentViewer visible={pdfOpen} source={pdfOpen ? pdfSource : null} onClose={() => setOpenPdfId(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  form: { gap: spacing.sm, paddingVertical: spacing.sm },
  formTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  errorBlock: { gap: spacing.xs },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 132, minWidth: 0 }
});
