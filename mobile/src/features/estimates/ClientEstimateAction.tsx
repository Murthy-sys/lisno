import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";

type Decision = "approve" | "request_changes";

export function ClientEstimateAction({ record }: { readonly record: Record<string, unknown> }) {
  const context = useConfiguredRuntime(); const invalidate = useInvalidateEvent();
  const id = typeof record.id === "string" ? record.id : null; const status = typeof record.status === "string" ? record.status : null;
  const [decision, setDecision] = useState<Decision | null>(null); const [note, setNote] = useState(""); const [error, setError] = useState<string | null>(null); const [downloading, setDownloading] = useState(false);
  const actionable = status === "sent_to_client" || status === "client_changes_requested";
  const mutation = useMutation({ mutationFn: () => context.runtime.api.authenticated.post(`/client/estimates/${encodeURIComponent(id!)}/decision`, { decision, note: note.trim() }), onSuccess: async () => { setDecision(null); setNote(""); await invalidate("estimate-decision-changed"); }, onError: (cause) => setError(cause instanceof ApiError ? cause.message : "The estimate decision could not be recorded.") });
  if (!id) return null;
  const download = async () => { setDownloading(true); setError(null); try { const artifact = await context.runtime.transfers.download({ path: `/client/estimates/${encodeURIComponent(id)}/pdf`, fileName: `lisno-estimate-${id}.pdf`, mimeType: "application/pdf", maxBytes: 25 * 1024 * 1024 }).result; await artifact.share({ cleanupAfterShare: true }); } catch (cause) { setError(cause instanceof Error ? cause.message : "The estimate PDF could not be prepared."); } finally { setDownloading(false); } };
  return <View style={styles.section}><Button label="Export estimate PDF" variant="secondary" loading={downloading} onPress={() => void download()} />
    {actionable && !decision ? <View style={styles.actions}><View style={styles.action}><Button label="Request changes" variant="secondary" onPress={() => setDecision("request_changes")} /></View><View style={styles.action}><Button label="Approve estimate" onPress={() => setDecision("approve")} /></View></View> : null}
    {decision ? <View style={styles.form}><Text style={styles.copy}>{decision === "approve" ? "Approve this estimate as the Client." : "Explain the changes Lisno should make."}</Text><Field label={decision === "approve" ? "Review note (optional)" : "Requested changes"} value={note} onChangeText={setNote} multiline />{error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}<View style={styles.actions}><View style={styles.action}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={() => { setDecision(null); setError(null); }} /></View><View style={styles.action}><Button label="Confirm decision" loading={mutation.isPending} disabled={decision === "request_changes" && !note.trim()} onPress={() => mutation.mutate()} /></View></View></View> : null}
    {!decision && error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({ section: { gap: spacing.sm }, form: { gap: spacing.sm }, copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 }, error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 }, actions: { flexDirection: "row", gap: spacing.sm }, action: { flex: 1 } });
