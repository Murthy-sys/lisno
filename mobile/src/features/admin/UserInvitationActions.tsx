import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import {
  invitationActionCommand,
  invitationDeliveryMessage,
  type UserInvitationAction,
  type UserInvitationSummary
} from "./adminIdentityModel";

interface Selection {
  readonly invitation: UserInvitationSummary;
  readonly action: UserInvitationAction;
}

export interface UserInvitationActionsProps {
  readonly invitation: UserInvitationSummary;
  readonly canResend: boolean;
  readonly canRevoke: boolean;
  readonly onUpdated?: ((invitation: UserInvitationSummary) => void) | undefined;
}

function failureMessage(cause: unknown, action: UserInvitationAction): string {
  if (cause instanceof ApiError) {
    if (cause.code === "VERSION_CONFLICT") {
      return "This invitation changed elsewhere. Refresh the invitation list before trying again.";
    }
    if (cause.code === "INVITATION_DELIVERY_UNAVAILABLE") {
      return "Invitation delivery is unavailable. The invitation was not changed; try again later.";
    }
  }
  return `The invitation could not be ${action === "resend" ? "resent" : "revoked"}. Try again.`;
}

export function UserInvitationActions({
  invitation,
  canResend,
  canRevoke,
  onUpdated
}: UserInvitationActionsProps) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [conflicted, setConflicted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setSelection(null);
    setConflicted(false);
    setError(null);
    setNotice(null);
  }, [invitation.id]);

  const isAllowed = (candidate: UserInvitationAction, record = invitation) =>
    record.availableActions.includes(candidate) &&
    (candidate === "resend" ? canResend : canRevoke);

  const mutation = useMutation({
    mutationFn: async (input: Selection) => {
      const command = invitationActionCommand(input.invitation, input.action);
      return context.runtime.api.authenticated.post<UserInvitationSummary>(
        command.path,
        command.body
      );
    },
    retry: false,
    onSuccess: async (result, input) => {
      setSelection(null);
      setConflicted(false);
      setError(null);
      setNotice(
        input.action === "revoke"
          ? "Invitation revoked."
          : `Invitation resent. ${invitationDeliveryMessage(result.deliveryStatus)}`
      );
      onUpdated?.(result);
      await invalidate("user-changed");
    },
    onError: async (cause, input) => {
      if (cause instanceof ApiError && cause.code === "VERSION_CONFLICT") {
        setConflicted(true);
        await invalidate("user-changed");
      }
      setError(failureMessage(cause, input.action));
    }
  });

  const selectionIsCurrent =
    selection !== null &&
    selection.invitation.id === invitation.id &&
    selection.invitation.version === invitation.version;
  const blocked =
    mutation.isPending ||
    conflicted ||
    !selection ||
    !selectionIsCurrent ||
    !isAllowed(selection.action, selection.invitation);

  if (selection) {
    const verb = selection.action === "resend" ? "Resend" : "Revoke";
    return (
      <View accessibilityLabel={`${verb} invitation for ${selection.invitation.name}`} style={styles.confirmation}>
        <Text accessibilityRole="header" style={styles.title}>
          {verb} invitation for {selection.invitation.name}?
        </Text>
        <Text style={styles.identity}>{selection.invitation.email}</Text>
        <Text style={styles.copy}>
          {selection.action === "resend"
            ? "A new email will replace the current invitation link."
            : "The current invitation will no longer be usable."}
        </Text>
        {!selectionIsCurrent && !conflicted ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            This invitation is no longer current. Close this confirmation and reopen it from the refreshed list.
          </Text>
        ) : null}
        {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              label="Cancel"
              variant="quiet"
              disabled={mutation.isPending}
              onPress={() => {
                setSelection(null);
                setConflicted(false);
                setError(null);
              }}
            />
          </View>
          <View style={styles.action}>
            <Button
              label={`Confirm ${selection.action}`}
              variant={selection.action === "revoke" ? "danger" : "primary"}
              loading={mutation.isPending}
              disabled={blocked}
              onPress={() => mutation.mutate(selection)}
            />
          </View>
        </View>
      </View>
    );
  }

  const actions = (["resend", "revoke"] as const).filter((action) => isAllowed(action));
  if (actions.length === 0) return null;
  return (
    <View style={styles.container}>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
      <View style={styles.actions}>
        {actions.map((action) => (
          <View key={action} style={styles.action}>
            <Button
              label={`${action === "resend" ? "Resend" : "Revoke"} invitation for ${invitation.name}`}
              variant={action === "revoke" ? "quiet" : "secondary"}
              onPress={() => {
                setNotice(null);
                setError(null);
                setConflicted(false);
                setSelection({ invitation, action });
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  confirmation: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.surface,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md
  },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 },
  identity: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  success: { color: colors.success, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, minWidth: 136 }
});

