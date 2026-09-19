import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { pickDocument, type SelectedAsset, TransferHttpError } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";

type Queue = "estimate" | "design";
type Decision = "approve" | "request_changes";
const PROOF_POLICY = { acceptedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"], maxBytes: 25 * 1024 * 1024 } as const;

function identity(record: Record<string, unknown>) {
  const id = typeof record.id === "string" ? record.id : typeof record.roundId === "string" ? record.roundId : null;
  const version = typeof record.version === "number" ? record.version : typeof record.expectedVersion === "number" ? record.expectedVersion : null;
  const status = typeof record.status === "string" ? record.status : null;
  return id && version ? { id, version, status } : null;
}

export function ProxyDecisionAction({ record, queue }: { readonly record: Record<string, unknown>; readonly queue: Queue }) {
  const context = useConfiguredRuntime(); const invalidate = useInvalidateEvent(); const task = identity(record);
  const [decision, setDecision] = useState<Decision | null>(null); const [note, setNote] = useState(""); const [proof, setProof] = useState<SelectedAsset | null>(null); const [error, setError] = useState<string | null>(null); const [progress, setProgress] = useState<number | null>(null); const [pending, setPending] = useState(false);
  if (!task || task.status !== "pending") return null;
  const chooseProof = async () => { try { const result = await pickDocument(PROOF_POLICY); if (result.status === "selected") { setProof(result.asset); setError(null); } } catch (cause) { setError(cause instanceof Error ? cause.message : "The proof file could not be selected."); } };
  const submit = async () => {
    if (!decision) return;
    if (!proof) { setError("Upload proof of the Client's decision."); return; }
    if (decision === "request_changes" && !note.trim()) { setError("Explain the Client's requested changes."); return; }
    setError(null); setPending(true); setProgress(0);
    const path = queue === "estimate" ? `/admin/estimate-client-response-tasks/${encodeURIComponent(task.id)}/decision` : `/admin/design-plan-response-tasks/${encodeURIComponent(task.id)}/decision`;
    const parameters = queue === "estimate" ? { decision, note: note.trim(), version: String(task.version) } : { decision, note: note.trim(), expectedVersion: String(task.version) };
    try {
      await context.runtime.transfers.upload({ path, fileUri: proof.uri, fileName: proof.name, mimeType: proof.mimeType, fieldName: "proof", parameters, maxBytes: PROOF_POLICY.maxBytes, onProgress: (value) => setProgress(value.fraction) }).result;
      setDecision(null); setNote(""); setProof(null); setProgress(null);
      await invalidate(queue === "estimate" ? "estimate-decision-changed" : "design-workflow-changed");
    } catch (cause) {
      setError(cause instanceof TransferHttpError && cause.status === 409 ? "This review changed. Refresh it before selecting new proof and deciding." : cause instanceof Error ? cause.message : "The Client decision could not be recorded.");
    } finally { setPending(false); }
  };
  if (!decision) return <View style={styles.actions}><View style={styles.action}><Button label="Request changes" variant="secondary" onPress={() => setDecision("request_changes")} /></View><View style={styles.action}><Button label="Approve" onPress={() => setDecision("approve")} /></View></View>;
  return <View style={styles.form}><Text accessibilityRole="header" style={styles.title}>{decision === "approve" ? "Record Client approval" : "Record requested changes"}</Text><Text style={styles.copy}>This immutable decision is recorded on behalf of the Client at server version {task.version}.</Text><Field label={decision === "approve" ? "Decision note (optional)" : "Requested changes"} value={note} onChangeText={setNote} multiline /><Button label={proof ? `Proof: ${proof.name}` : "Choose Client decision proof"} variant="secondary" disabled={pending} onPress={() => void chooseProof()} />{progress !== null ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{progress >= 1 ? "Upload complete. Recording decision…" : `Uploading ${Math.round(progress * 100)}%`}</Text> : null}{error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}<View style={styles.actions}><View style={styles.action}><Button label="Cancel" variant="quiet" disabled={pending} onPress={() => { setDecision(null); setNote(""); setProof(null); setError(null); }} /></View><View style={styles.action}><Button label="Record decision" loading={pending} onPress={() => void submit()} /></View></View></View>;
}

const styles = StyleSheet.create({ form: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.surface, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas }, title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 }, copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17 }, error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 }, actions: { flexDirection: "row", gap: spacing.sm }, action: { flex: 1 } });
