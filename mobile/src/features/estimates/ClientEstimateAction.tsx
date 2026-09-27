import { useMutation } from "@tanstack/react-query";
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
import { decideClientEstimate, type ClientEstimateDecisionResult } from "./clientReviewApi";
import { canDecideClientEstimate, type ClientEstimate } from "./clientReviewModel";

type Decision = "approve" | "request_changes";

export function ClientEstimateAction({ estimate, session, onDecision, onRefresh, decisionRecorded = false }: {
  readonly estimate: ClientEstimate;
  readonly session: AuthenticatedSession;
  readonly onDecision: (result: ClientEstimateDecisionResult) => void;
  readonly onRefresh: () => void;
  readonly decisionRecorded?: boolean;
}) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openPdfId, setOpenPdfId] = useState<string | null>(null);
  const submitting = useRef(false);
  const canDownload = canPerformOperation(session, "GET /client/estimates/:estimateId/pdf");
  const canDecide = canPerformOperation(session, "POST /client/estimates/:estimateId/decision") && canDecideClientEstimate(estimate) && !decisionRecorded;
  const pdfOpen = openPdfId === estimate.id;
  const pdfSource: ProtectedDocumentSource = {
    path: `/client/estimates/${encodeURIComponent(estimate.id)}/pdf`,
    fileName: `lisno-estimate-${estimate.id}.pdf`,
    mimeType: "application/pdf",
    kind: "estimate-pdf"
  };

  const mutation = useMutation({
    mutationFn: ({ choice, message }: { choice: Decision; message: string }) =>
      decideClientEstimate(context.runtime, estimate.id, choice, message),
    onSuccess: async (result) => {
      setDecision(null);
      setNote("");
      setError(null);
      onDecision(result);
      await invalidate("estimate-decision-changed");
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.status === 409) {
        setError("This estimate has changed. Refresh it before sending a decision again.");
        return;
      }
      setError(cause instanceof ApiError && [401, 403, 404].includes(cause.status)
        ? "This estimate is no longer available to your account. Refresh to check access."
        : "The estimate decision could not be recorded. Check your connection and retry.");
    },
    onSettled: () => { submitting.current = false; }
  });

  function confirm() {
    if (!decision || mutation.isPending || submitting.current) return;
    const message = note.trim();
    if (decision === "request_changes" && !message) {
      setError("Describe the changes you need before sending the request.");
      return;
    }
    setError(null);
    submitting.current = true;
    mutation.mutate({ choice: decision, message });
  }

  if (!canDownload && !canDecide && !error) return null;

  return (
    <View testID="client-estimate-actions" style={styles.section}>
      {canDownload ? <Button label="Open estimate PDF" variant="secondary" onPress={() => setOpenPdfId(estimate.id)} /> : null}
      {canDecide && !decision ? (
        <View style={styles.actions}>
          <View style={styles.action}><Button label="Request changes" variant="secondary" onPress={() => { setError(null); setDecision("request_changes"); }} /></View>
          <View style={styles.action}><Button label="Approve estimate" onPress={() => { setError(null); setDecision("approve"); }} /></View>
        </View>
      ) : null}
      {canDecide && decision ? (
        <View style={styles.form}>
          <Text accessibilityRole="header" style={styles.formTitle}>{decision === "approve" ? "Confirm estimate approval" : "Request estimate changes"}</Text>
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
          {error.includes("Refresh") ? <Button label="Refresh estimate" variant="quiet" onPress={onRefresh} /> : null}
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
