import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { validateLeadDraft, type LeadDraft } from "./leadValidation";

const initialDraft = (): LeadDraft => ({ clientName: "", clientEmail: "", clientMobile: "", projectName: "", location: "", propertyType: "", budgetMin: "", budgetMax: "", source: "", nextAction: "", nextActionAt: new Date(Date.now() + 86_400_000).toISOString() });

export function LeadCreateForm() {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LeadDraft>(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof LeadDraft) => (value: string) => { setDraft((current) => ({ ...current, [key]: value })); setError(null); };
  const mutation = useMutation({
    mutationFn: async () => {
      const result = validateLeadDraft(draft);
      if (!result.value) throw new Error(result.error);
      return context.runtime.api.authenticated.post("/leads", result.value);
    },
    onSuccess: async () => { setDraft(initialDraft()); setOpen(false); await invalidate("project-initiated"); },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "The lead could not be created.")
  });
  if (!open) return <Button label="Create lead" onPress={() => setOpen(true)} />;
  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={styles.title}>Create lead</Text>
      <Text style={styles.copy}>Capture the Client, project, budget, source and next commitment.</Text>
      <Field label="Client name" value={draft.clientName} onChangeText={set("clientName")} />
      <Field label="Client email" value={draft.clientEmail} onChangeText={set("clientEmail")} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Client mobile" value={draft.clientMobile} onChangeText={set("clientMobile")} keyboardType="phone-pad" />
      <Field label="Project name" value={draft.projectName} onChangeText={set("projectName")} />
      <Field label="Location" value={draft.location} onChangeText={set("location")} />
      <Field label="Property type" value={draft.propertyType} onChangeText={set("propertyType")} />
      <View style={styles.row}><View style={styles.half}><Field label="Minimum budget" value={draft.budgetMin} onChangeText={set("budgetMin")} keyboardType="decimal-pad" /></View><View style={styles.half}><Field label="Maximum budget" value={draft.budgetMax} onChangeText={set("budgetMax")} keyboardType="decimal-pad" /></View></View>
      <Field label="Lead source" value={draft.source} onChangeText={set("source")} />
      <Field label="Next action" value={draft.nextAction} onChangeText={set("nextAction")} />
      <Field label="Next action time (ISO 8601)" value={draft.nextActionAt} onChangeText={set("nextActionAt")} autoCapitalize="none" />
      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
      <View style={styles.row}><View style={styles.half}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={() => { setOpen(false); setError(null); }} /></View><View style={styles.half}><Button label="Save lead" loading={mutation.isPending} onPress={() => mutation.mutate()} /></View></View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { borderRadius: radii.surface, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18 }, copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: "row", gap: spacing.sm }, half: { flex: 1 }, error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 }
});
