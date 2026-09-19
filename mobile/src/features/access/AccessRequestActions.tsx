import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";

function identity(record: Record<string, unknown>) {
  const id = typeof record.id === "string" ? record.id : typeof record.requestId === "string" ? record.requestId : null;
  const version = typeof record.version === "number" ? record.version : null;
  const status = typeof record.status === "string" ? record.status : null;
  return id && version ? { id, version, status } : null;
}

export function AccessRequestActions({ record, mode }: { readonly record: Record<string, unknown>; readonly mode: "self" | "review" }) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const request = identity(record);
  const [decision, setDecision] = useState<"reject" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (action: "approve" | "reject" | "cancel") => {
      if (!request) throw new Error("The request version is unavailable.");
      if (action === "cancel") {
        return context.runtime.api.authenticated.post(`/access-requests/${encodeURIComponent(request.id)}/cancel`, { version: request.version });
      }
      return context.runtime.api.authenticated.post(`/access-requests/${encodeURIComponent(request.id)}/decision`, action === "approve" ? { version: request.version, decision: "approved" } : { version: request.version, decision: "rejected", reason: reason.trim() });
    },
    onSuccess: async () => {
      setDecision(null);
      setReason("");
      await invalidate("access-changed");
    },
    onError: (cause) => setError(cause instanceof ApiError && cause.status === 409 ? "This request changed. Refresh it before deciding." : "The access request could not be updated.")
  });

  if (!request || request.status !== "pending") return null;
  if (mode === "self") {
    return <Button label="Cancel request" variant="secondary" loading={mutation.isPending} onPress={() => mutation.mutate("cancel")} />;
  }
  if (decision === "reject") {
    return (
      <View style={styles.form}>
        <Field label="Rejection reason" value={reason} onChangeText={setReason} error={error ?? undefined} multiline />
        <Text style={styles.hint}>The reason is stored with the review decision.</Text>
        <View style={styles.actions}>
          <View style={styles.action}><Button label="Back" variant="quiet" disabled={mutation.isPending} onPress={() => { setDecision(null); setError(null); }} /></View>
          <View style={styles.action}><Button label="Reject request" variant="danger" loading={mutation.isPending} onPress={() => { if (!reason.trim()) setError("Enter a reason."); else mutation.mutate("reject"); }} /></View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.actions}>
      <View style={styles.action}><Button label="Reject" variant="secondary" disabled={mutation.isPending} onPress={() => setDecision("reject")} /></View>
      <View style={styles.action}><Button label="Approve" loading={mutation.isPending} onPress={() => mutation.mutate("approve")} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm },
  hint: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 }
});
