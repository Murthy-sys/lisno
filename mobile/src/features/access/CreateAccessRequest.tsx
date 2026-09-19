import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { REQUESTABLE_MODULES_BY_ROLE, type Role } from "../../contracts/authorization";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";

export function CreateAccessRequest({ role }: { readonly role: Role }) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const module = REQUESTABLE_MODULES_BY_ROLE[role][0];
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => context.runtime.api.authenticated.post("/access-requests", { projectId: projectId.trim(), module, reason: reason.trim() }),
    onSuccess: async () => {
      setProjectId("");
      setReason("");
      setOpen(false);
      await invalidate("access-changed");
    },
    onError: () => setError("The access request could not be submitted.")
  });
  if (!module) return null;
  if (!open) return <Button label="Request project access" variant="secondary" onPress={() => setOpen(true)} />;
  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>Request {module} access</Text>
      <Text style={styles.copy}>Use the stable project ID supplied by Lisno. Access remains subject to project scope and reviewer approval.</Text>
      <Field label="Project ID" value={projectId} onChangeText={setProjectId} autoCapitalize="none" />
      <Field label="Reason" value={reason} onChangeText={setReason} multiline error={error ?? undefined} />
      <View style={styles.actions}>
        <View style={styles.action}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={() => { setOpen(false); setError(null); }} /></View>
        <View style={styles.action}><Button label="Submit request" loading={mutation.isPending} onPress={() => { if (!projectId.trim() || !reason.trim()) setError("Enter the project ID and reason."); else { setError(null); mutation.mutate(); } }} /></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radii.surface, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 }
});
