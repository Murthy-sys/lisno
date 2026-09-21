import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radii, spacing } from "../../ui/tokens";
import {
  conversationAccessibilitySummary,
  conversationActivityInput,
  projectInitials,
  type PresentedConversation
} from "./chatModel";
import { chatColors } from "./chatTheme";

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function formatConversationActivity(value: string | null, now = new Date()): string | null {
  const activity = conversationActivityInput(value, now);
  if (!activity) return null;
  if (activity.kind === "time") {
    return activity.date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return activity.date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(activity.date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" })
  });
}

export interface ConversationRowProps {
  readonly conversation: PresentedConversation;
  readonly selected?: boolean;
  readonly compact?: boolean;
  readonly disabled?: boolean;
  readonly now?: Date;
  readonly onPress: () => void;
}

export function ConversationRow({
  conversation,
  selected = false,
  compact = false,
  disabled = false,
  now,
  onPress
}: ConversationRowProps) {
  const unread = conversation.counts.unread > 0;
  const activity = formatConversationActivity(conversation.lastMessageAt, now);
  const label = conversationAccessibilitySummary(conversation, activity);
  const participants = `${conversation.participantCount} ${conversation.participantCount === 1 ? "participant" : "participants"}`;

  return (
    <Pressable
      accessibilityHint="Opens this project conversation"
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        compact ? styles.rowCompact : null,
        selected ? styles.rowSelected : null,
        pressed ? styles.rowPressed : null
      ]}
      testID={`conversation-${conversation.project.id}`}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.avatar, selected ? styles.avatarSelected : null]}
      >
        <Text style={[styles.avatarText, selected ? styles.avatarTextSelected : null]}>
          {projectInitials(conversation.project.name)}
        </Text>
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.copy}
      >
        <View style={styles.primaryLine}>
          <Text numberOfLines={2} style={[styles.projectName, unread ? styles.projectNameUnread : null]}>
            {conversation.project.name}
          </Text>
          {activity ? (
            <Text style={[styles.activity, unread ? styles.activityUnread : null]}>{activity}</Text>
          ) : null}
        </View>
        <View style={styles.secondaryLine}>
          <Text numberOfLines={1} style={styles.secondaryText}>
            {participants} · {statusLabel(conversation.project.status)}
          </Text>
          <View style={styles.signals}>
            {conversation.counts.unreadMentions > 0 ? (
              <Text style={styles.mentionSignal}>@{conversation.counts.unreadMentions}</Text>
            ) : null}
            {unread ? (
              <View style={[styles.signal, styles.unreadSignal]}>
                <Text style={[styles.signalText, styles.unreadSignalText]}>{conversation.counts.unread}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {conversation.counts.openCritical > 0 ? (
          <View style={styles.criticalLine}>
            <View style={styles.criticalDot} />
            <Text style={styles.criticalText}>Critical {conversation.counts.openCritical}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface
  },
  rowCompact: { minHeight: 84 },
  rowSelected: { backgroundColor: "#E9EDEF" },
  rowPressed: { backgroundColor: "#F5F6F6" },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5ECE9"
  },
  avatarSelected: { backgroundColor: "#DCE5E4" },
  avatarText: { color: "#4D6860", fontFamily: fonts.medium, fontSize: 16, letterSpacing: 0.2 },
  avatarTextSelected: { color: "#476560" },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  primaryLine: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  projectName: { flex: 1, color: chatColors.ink, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  projectNameUnread: { fontFamily: fonts.semibold },
  activity: { color: "#667781", fontFamily: fonts.regular, fontSize: 11 },
  activityUnread: { color: "#086652", fontFamily: fonts.semibold },
  secondaryLine: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: 6 },
  secondaryText: { flex: 1, color: "#52636D", fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  signals: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xxs },
  signal: { minWidth: 20, minHeight: 20, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, paddingVertical: 1 },
  signalText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 18 },
  mentionSignal: { color: "#00855F", fontFamily: fonts.semibold, fontSize: 14 },
  unreadSignal: { backgroundColor: "#00855F" },
  unreadSignalText: { color: colors.surface },
  criticalLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  criticalDot: { width: 5, height: 5, borderRadius: radii.pill, backgroundColor: "#A82936" },
  criticalText: { color: "#A82936", fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16 }
});
