import { StyleSheet, Text, View } from "react-native";

import { ROLE_LABELS } from "../../contracts/authorization";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import type { UserInvitationStatus, UserInvitationSummary } from "./adminIdentityModel";
import { UserInvitationActions } from "./UserInvitationActions";

const STATUS_LABELS: Readonly<Record<UserInvitationStatus, string>> = {
  pending: "Pending",
  delivery_failed: "Delivery failed",
  expired: "Expired",
  accepted: "Accepted",
  revoked: "Revoked",
  superseded: "Superseded"
};

function expirationLabel(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Expiry unavailable" : `Expires ${parsed.toLocaleString()}`;
}

export interface UserInvitationListProps {
  readonly invitations: readonly UserInvitationSummary[];
  readonly canResend: boolean;
  readonly canRevoke: boolean;
  readonly onUpdated?: ((invitation: UserInvitationSummary) => void) | undefined;
}

export function UserInvitationList({
  invitations,
  canResend,
  canRevoke,
  onUpdated
}: UserInvitationListProps) {
  if (invitations.length === 0) {
    return <Text style={styles.empty}>No invitations match this view.</Text>;
  }

  return (
    <View accessibilityLabel="User invitations" style={styles.list}>
      {invitations.map((invitation) => (
        <View key={invitation.id} style={styles.row}>
          <View style={styles.heading}>
            <View style={styles.identity}>
              <Text style={styles.name}>{invitation.name}</Text>
              <Text style={styles.detail}>{invitation.email}</Text>
              <Text style={styles.detail}>{invitation.mobile}</Text>
            </View>
            <View accessibilityLabel={`Invitation status ${STATUS_LABELS[invitation.status]}`} style={styles.status}>
              <Text style={styles.statusText}>{STATUS_LABELS[invitation.status]}</Text>
            </View>
          </View>
          <Text style={styles.detail}>{ROLE_LABELS[invitation.role]}</Text>
          <Text style={styles.detail}>
            {invitation.deliveryStatus === "sent"
              ? "Email sent"
              : invitation.deliveryStatus === "queued"
                ? "Email queued"
                : "Email delivery failed"}
          </Text>
          <Text style={styles.detail}>{expirationLabel(invitation.expiresAt)}</Text>
          {invitation.status === "pending" && !invitation.currentLinkAvailable ? (
            <Text style={styles.warning}>
              {invitation.availableActions.includes("resend")
                ? "The current link is unavailable. Resend to issue a new link."
                : "The current link is unavailable and cannot be resent."}
            </Text>
          ) : null}
          <UserInvitationActions
            invitation={invitation}
            canResend={canResend}
            canRevoke={canRevoke}
            onUpdated={onUpdated}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.surface,
    backgroundColor: colors.surface,
    padding: spacing.md
  },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  identity: { flex: 1, gap: spacing.xxs },
  name: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  detail: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  status: {
    borderRadius: radii.pill,
    backgroundColor: colors.infoSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs
  },
  statusText: { color: colors.info, fontFamily: fonts.semibold, fontSize: 11 },
  warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  empty: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13 }
});

