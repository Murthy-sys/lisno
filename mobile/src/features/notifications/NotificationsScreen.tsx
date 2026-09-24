import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { NavigationIcon } from "../../navigation/NavigationIcon";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { StateView } from "../../ui/primitives";
import { colors, fonts, spacing, typography } from "../../ui/tokens";
import type { FeatureDefinition } from "../workspace/featureDefinitions";
import { BotanicalAccent } from "./BotanicalAccent";
import { NotificationRealtimeBridge } from "./NotificationRealtimeBridge";
import {
  type ChatNotification,
  formatNotificationTime,
  groupNotifications,
  isUnread,
  notificationAccessibilityLabel,
  notificationMessage,
  notificationTone,
  parseNotifications
} from "./notificationPresentation";

/** Above this font scale the time moves under the title so neither clips. */
const STACKED_FONT_SCALE = 1.3;

export function NotificationsScreen({
  definition,
  data,
  refreshing,
  onRefresh,
  now = new Date()
}: {
  readonly definition: FeatureDefinition;
  readonly data: unknown;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  /** Injectable clock for deterministic grouping in tests. */
  readonly now?: Date;
}) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACKED_FONT_SCALE;
  const markRead = useMutation({
    mutationFn: (id: string) => context.runtime.api.authenticated.put(`/notifications/${encodeURIComponent(id)}/read`),
    onSuccess: () => invalidate("notification-changed")
  });
  const groups = groupNotifications(parseNotifications(data), now);

  const open = (item: ChatNotification) => {
    // A failed mark-read is not surfaced as success; the next refetch shows the true read state.
    if (isUnread(item)) markRead.mutate(item.id, { onError: () => undefined });
    router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId: item.projectId } });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <NotificationRealtimeBridge onSnapshot={onRefresh} />
      <View style={styles.header}>
        <BotanicalAccent />
        <Text style={styles.eyebrow}>{definition.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{definition.title}</Text>
        <Text style={styles.description}>{definition.description}</Text>
        {refreshing ? <Text accessibilityLiveRegion="polite" style={styles.updating}>Updating…</Text> : null}
      </View>

      {groups.length === 0 ? (
        <StateView title={`No ${definition.title.toLowerCase()}`} message={definition.emptyMessage} />
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionLabel}>{group.label}</Text>
            <View style={styles.list}>
              {group.items.map((item) => (
                <NotificationCard key={item.id} item={item} now={now} stacked={stacked} onPress={() => open(item)} />
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function NotificationCard({ item, now, stacked, onPress }: { readonly item: ChatNotification; readonly now: Date; readonly stacked: boolean; readonly onPress: () => void }) {
  const tone = notificationTone(item.type);
  const unread = isUnread(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={notificationAccessibilityLabel(item, now)}
      accessibilityHint="Opens the conversation"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      <View style={[styles.tile, { backgroundColor: tone.tile }]}>
        <NavigationIcon name={tone.icon} color={tone.iconColor} size={22} />
      </View>
      <View style={styles.body}>
        <View style={[styles.topRow, stacked ? styles.topRowStacked : null]}>
          <Text numberOfLines={1} style={[styles.cardTitle, unread ? styles.cardTitleUnread : null, stacked ? null : styles.cardTitleInline]}>{item.projectName}</Text>
          <View style={styles.meta}>
            {unread ? <View testID={`notification-unread-dot-${item.id}`} style={styles.unreadDot} /> : null}
            <Text style={styles.time}>{formatNotificationTime(item.createdAt, now)}</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.message}>{notificationMessage(item)}</Text>
      </View>
      <NavigationIcon name="chevron" color={colors.ink} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, width: "100%", maxWidth: 980, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.xl },
  header: { gap: spacing.xs, minHeight: 112, paddingRight: spacing.xxl },
  eyebrow: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4 },
  title: { color: colors.ink, ...typography.pageTitle },
  description: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, maxWidth: 680 },
  updating: { color: colors.info, fontFamily: fonts.medium, fontSize: 12 },
  section: { gap: spacing.sm },
  sectionLabel: { color: colors.inkMuted, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  list: { gap: spacing.sm },
  card: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 1
  },
  cardPressed: { opacity: 0.72 },
  tile: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0, gap: spacing.xxs },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  topRowStacked: { flexDirection: "column", alignItems: "flex-start", gap: 2 },
  cardTitle: { color: colors.ink, ...typography.cardTitle, fontSize: 15 },
  cardTitleInline: { flex: 1 },
  cardTitleUnread: { fontFamily: fonts.bold },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.xxs, paddingTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  time: { color: colors.inkMuted, ...typography.metadata, flexShrink: 1 },
  message: { color: colors.inkMuted, ...typography.metadata, fontSize: 13, lineHeight: 19 }
});
