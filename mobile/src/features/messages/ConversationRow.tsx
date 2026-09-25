import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { colors, fonts, radii, spacing } from "../../ui/tokens";
import {
  conversationAccessibilitySummary,
  conversationActivityInput,
  lastMessagePreviewText,
  projectInitials,
  type PresentedConversation
} from "./chatModel";
import { ChatIcon } from "./ChatIcon";
import { ConversationThumbnails, previewableImages } from "./ConversationThumbnails";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function isPreviousDay(date: Date, now: Date): boolean {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
}

/** "10:24 AM" today, "Yesterday", "Sep 16" this year, otherwise "Sep 16, 2025". */
export function formatConversationActivity(value: string | null, now = new Date()): string | null {
  const activity = conversationActivityInput(value, now);
  if (!activity) return null;
  const { date } = activity;
  if (activity.kind === "time") {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
  }
  if (isPreviousDay(date, now)) return "Yesterday";
  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day}, ${date.getFullYear()}`;
}

export function unreadBadgeText(unread: number): string {
  return unread > 99 ? "99+" : String(unread);
}

/** Deterministic pastel avatar tones keyed by the stable project ID, never the name. */
const AVATAR_TONES = Object.freeze([
  { fill: colors.primarySoft, ink: colors.primary },
  { fill: colors.warningSoft, ink: colors.warning },
  { fill: colors.lavenderSoft, ink: colors.lavender },
  { fill: colors.dangerSoft, ink: colors.danger },
  { fill: colors.infoSoft, ink: colors.info },
  { fill: colors.successSoft, ink: colors.success }
]);

export function conversationAvatarTone(projectId: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (const character of projectId) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

export interface ConversationRowProps {
  readonly conversation: PresentedConversation;
  readonly currentUserId?: string | null;
  readonly selected?: boolean;
  readonly compact?: boolean;
  readonly disabled?: boolean;
  readonly now?: Date;
  readonly onPress: () => void;
}

export function ConversationRow({
  conversation,
  currentUserId = null,
  selected = false,
  compact = false,
  disabled = false,
  now,
  onPress
}: ConversationRowProps) {
  const { fontScale } = useWindowDimensions();
  const stackTime = fontScale >= 1.5;
  const { counts, lastMessage } = conversation;
  const unread = counts.unread > 0;
  const activity = formatConversationActivity(lastMessage?.createdAt ?? conversation.lastMessageAt, now);
  const label = conversationAccessibilitySummary(conversation, activity, currentUserId);
  const tone = conversationAvatarTone(conversation.project.id);
  const priority = counts.openCritical > 0 ? "critical" : counts.openImportant > 0 ? "important" : null;
  const preview = lastMessage === null
    ? "No messages yet"
    : lastMessage
      ? lastMessagePreviewText(lastMessage, currentUserId)
      : null;
  const images = lastMessage ? previewableImages(lastMessage.attachments) : [];
  const firstFile = lastMessage && !images.length ? lastMessage.attachments[0] ?? null : null;
  const extraFiles = lastMessage && firstFile ? Math.max(lastMessage.attachmentCount - 1, 0) : 0;

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
        pressed ? styles.rowPressed : null,
        disabled && !selected ? styles.rowDisabled : null
      ]}
      testID={`conversation-${conversation.project.id}`}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.avatar, { backgroundColor: tone.fill }]}
        testID={`conversation-avatar-${conversation.project.id}`}
      >
        <Text maxFontSizeMultiplier={1.3} style={[styles.avatarText, { color: tone.ink }]}>
          {projectInitials(conversation.project.name)}
        </Text>
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.copy}
      >
        <View style={[styles.primaryLine, stackTime ? styles.primaryLineStacked : null]} testID="conversation-primary-line">
          <Text numberOfLines={1} style={styles.projectName}>
            {conversation.project.name}
          </Text>
          {activity || priority ? (
            <View style={styles.meta}>
              {priority ? (
                <View
                  style={[styles.priorityDot, priority === "critical" ? styles.priorityCritical : styles.priorityImportant]}
                  testID={`conversation-priority-${priority}`}
                />
              ) : null}
              {activity ? (
                <Text style={[styles.activity, unread ? styles.activityUnread : null]}>{activity}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {preview !== null || unread ? (
          <View style={styles.secondaryLine}>
            <Text numberOfLines={1} style={[styles.preview, unread ? styles.previewUnread : null]}>
              {preview ?? ""}
            </Text>
            {unread ? (
              <View style={styles.badge} testID={`conversation-unread-${conversation.project.id}`}>
                <Text style={styles.badgeText}>{unreadBadgeText(counts.unread)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {lastMessage && images.length ? (
          <ConversationThumbnails
            attachmentCount={lastMessage.attachmentCount}
            attachments={lastMessage.attachments}
            projectId={conversation.project.id}
          />
        ) : null}
        {firstFile ? (
          <View style={styles.fileLine}>
            <ChatIcon color={colors.inkMuted} name="paperclip" size={15} />
            <Text numberOfLines={1} style={styles.fileName}>{firstFile.filename}</Text>
            {extraFiles > 0 ? <Text style={styles.fileMore}>+{extraFiles}</Text> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 80,
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    backgroundColor: colors.surface
  },
  rowCompact: { minHeight: 78 },
  rowSelected: { backgroundColor: colors.primarySoft },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowDisabled: { opacity: 0.6 },
  avatar: {
    width: 52,
    height: 52,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: 0.2 },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 3,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingRight: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  primaryLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  primaryLineStacked: { flexDirection: "column", alignItems: "flex-start", gap: 0 },
  projectName: { flexShrink: 1, flexGrow: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  priorityDot: { width: 7, height: 7, borderRadius: radii.pill },
  priorityCritical: { backgroundColor: colors.danger },
  priorityImportant: { backgroundColor: colors.warning },
  activity: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  activityUnread: { color: colors.primary, fontFamily: fonts.semibold },
  secondaryLine: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  preview: { flex: 1, minWidth: 0, color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  previewUnread: { color: colors.ink },
  badge: {
    minWidth: 20,
    minHeight: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.danger
  },
  badgeText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16 },
  fileLine: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: 5 },
  fileName: { flexShrink: 1, color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  fileMore: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 }
});
