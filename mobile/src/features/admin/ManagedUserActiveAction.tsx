import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import {
  managedUserActiveCommand,
  type ManagedUserMutationResult,
  type ManagedUserSummary
} from "./adminIdentityModel";

export interface ManagedUserActiveActionProps {
  readonly user: ManagedUserSummary;
  readonly canUpdate: boolean;
  readonly onUpdated?: ((result: ManagedUserMutationResult) => void) | undefined;
}

function updateFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "VERSION_CONFLICT") {
      return "This user changed elsewhere. Refresh the directory before trying again.";
    }
    if (error.code === "SOLE_SUPER_ADMIN_IMMUTABLE") return error.message;
  }
  return "The account status could not be updated. Try again.";
}

export function ManagedUserActiveAction({
  user,
  canUpdate,
  onUpdated
}: ManagedUserActiveActionProps) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);

  useEffect(() => {
    setConfirming(false);
    setError(null);
    setNotice(null);
    setConflictVersion(null);
  }, [user.id]);

  useEffect(() => {
    if (conflictVersion !== null && conflictVersion !== user.version) {
      setConflictVersion(null);
      setError(null);
    }
  }, [conflictVersion, user.version]);

  const mutation = useMutation({
    mutationFn: async (input: { readonly id: string; readonly version: number; readonly active: boolean }) => {
      const command = managedUserActiveCommand(
        { ...user, id: input.id, version: input.version },
        input.active
      );
      return context.runtime.api.authenticated.patch<ManagedUserMutationResult>(
        command.path,
        command.body
      );
    },
    retry: false,
    onSuccess: async (result) => {
      setConfirming(false);
      setError(null);
      setNotice(result.user.active ? "User activated." : "User deactivated.");
      onUpdated?.(result);
      await invalidate("user-changed");
    },
    onError: async (cause) => {
      if (cause instanceof ApiError && cause.code === "VERSION_CONFLICT") {
        setConflictVersion(user.version);
        await invalidate("user-changed");
      }
      setError(updateFailureMessage(cause));
      setConfirming(false);
    }
  });

  if (!canUpdate) return null;
  const blocked = mutation.isPending || conflictVersion !== null;
  const submit = (active: boolean) => {
    if (blocked || active === user.active) return;
    setError(null);
    setNotice(null);
    mutation.mutate({ id: user.id, version: user.version, active });
  };

  if (confirming) {
    return (
      <View accessibilityLabel={`Deactivate ${user.name}`} style={styles.confirmation}>
        <Text accessibilityRole="header" style={styles.title}>Deactivate {user.name}?</Text>
        <Text style={styles.copy}>
          Project access grants will be revoked immediately. Existing assignments remain and must be reassigned separately.
        </Text>
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              label="Cancel"
              variant="quiet"
              disabled={mutation.isPending}
              onPress={() => setConfirming(false)}
            />
          </View>
          <View style={styles.action}>
            <Button
              label="Confirm deactivation"
              variant="danger"
              loading={mutation.isPending}
              onPress={() => submit(false)}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title}>Account status</Text>
        <Text style={styles.copy}>
          {user.active ? "Active users can sign in." : "Inactive users cannot sign in."}
        </Text>
      </View>
      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
      {user.active ? (
        <Button
          label={`Deactivate ${user.name}`}
          variant="danger"
          disabled={blocked}
          onPress={() => {
            setError(null);
            setNotice(null);
            setConfirming(true);
          }}
        />
      ) : (
        <Button
          label={`Activate ${user.name}`}
          variant="secondary"
          loading={mutation.isPending}
          disabled={blocked}
          onPress={() => submit(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.surface,
    backgroundColor: colors.surface,
    padding: spacing.md
  },
  confirmation: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.surface,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md
  },
  heading: { gap: spacing.xxs },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  success: { color: colors.success, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 }
});

