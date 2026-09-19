import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Role } from "../../contracts/authorization";
import { WORKER_ROLES } from "../../contracts/authorization";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, Field } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { isRecord } from "../workspace/recordPresentation";

const progressRoles = new Set<Role>(["procurement", "finance_head", "site_manager", ...WORKER_ROLES]);

function taskValue(record: Record<string, unknown>) {
  const id = typeof record.id === "string" ? record.id : null;
  const version = typeof record.version === "number" ? record.version : null;
  const progress = typeof record.progress === "number" ? record.progress : null;
  return id && version && progress !== null ? { id, version, progress } : null;
}

export function OperationalTaskAction({ record, role }: { readonly record: Record<string, unknown>; readonly role: Role }) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const task = taskValue(record);
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState(task ? String(task.progress) : "");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (value: number) => {
      if (!task) throw new Error("Task version is unavailable.");
      return context.runtime.api.authenticated.patch(`/workflow-tasks/${encodeURIComponent(task.id)}`, {
        version: task.version,
        progress: value
      });
    },
    onSuccess: async () => {
      setEditing(false);
      await invalidate("operational-task-changed");
    },
    onError: (cause) => {
      setError(cause instanceof ApiError && cause.code === "WORKFLOW_TASK_STALE" ? "This task changed. Refresh and review the current progress before retrying." : "Progress could not be saved.");
    }
  });

  if (!task || !progressRoles.has(role) || !isRecord(record)) return null;
  if (!editing) return <Button label="Update progress" variant="secondary" onPress={() => setEditing(true)} />;

  const submit = () => {
    const value = Number(progress);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setError("Enter a whole number from 0 to 100.");
      return;
    }
    setError(null);
    mutation.mutate(value);
  };

  return (
    <View style={styles.form}>
      <Field label="Progress percentage" value={progress} onChangeText={setProgress} keyboardType="number-pad" error={error ?? undefined} />
      <Text style={styles.hint}>Current server version {task.version}. Completing the task requires 100%.</Text>
      <View style={styles.actions}>
        <View style={styles.action}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={() => { setEditing(false); setError(null); setProgress(String(task.progress)); }} /></View>
        <View style={styles.action}><Button label="Save progress" loading={mutation.isPending} onPress={submit} /></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm, paddingTop: spacing.sm },
  hint: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 }
});
