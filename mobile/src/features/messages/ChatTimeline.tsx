import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewabilityConfigCallbackPair,
  type ViewToken
} from "react-native";

import { StateView } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { useReducedMotion } from "../onboarding/useReducedMotion";
import {
  buildMessageTimeline,
  type PresentedMessage,
  type PresentedMessageTimelineItem
} from "./chatModel";
import { MessageBubble } from "./MessageBubble";
import { ChatWallpaper } from "./ChatWallpaper";
import { chatColors } from "./chatTheme";

function dayLabel(dayKey: string | null): string {
  if (!dayKey) return "Date unavailable";
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export interface TimelineScrollState {
  readonly initialScrollComplete: boolean;
  readonly handledRequest: number;
}

export function nextTimelineScroll(
  state: TimelineScrollState,
  input: {
    readonly event: "content-size" | "request";
    readonly hasContent: boolean;
    readonly request: number;
  }
): { readonly state: TimelineScrollState; readonly action: "none" | "initial" | "requested" } {
  if (!input.hasContent) return { state, action: "none" };
  if (input.event === "content-size") {
    if (state.initialScrollComplete) return { state, action: "none" };
    return {
      state: { initialScrollComplete: true, handledRequest: input.request },
      action: "initial"
    };
  }
  if (!state.initialScrollComplete || input.request <= state.handledRequest) {
    return { state, action: "none" };
  }
  return {
    state: { ...state, handledRequest: input.request },
    action: "requested"
  };
}

function TimelineMessageBubble({
  item,
  compact,
  reducedMotion,
  onOpenActions,
  onReply,
  onDenied
}: {
  readonly item: PresentedMessageTimelineItem;
  readonly compact: boolean;
  readonly reducedMotion: boolean;
  readonly onOpenActions: (message: PresentedMessage, originHandle: number | null) => void;
  readonly onReply?: ((message: PresentedMessage) => void) | undefined;
  readonly onDenied: () => void;
}) {
  const openActions = useCallback(
    (originHandle: number | null) => onOpenActions(item.message, originHandle),
    [item.message, onOpenActions]
  );
  const reply = useCallback(
    () => onReply?.(item.message),
    [item.message, onReply]
  );

  return (
    <MessageBubble
      item={item}
      compact={compact}
      onDenied={onDenied}
      onOpenActions={openActions}
      onReply={onReply ? reply : undefined}
      reducedMotion={reducedMotion}
    />
  );
}

export function ChatTimeline({
  messages,
  currentUserId,
  lastReadSequence,
  compact,
  hasOlderHistory,
  loadingOlder,
  olderError,
  newMessagesAvailable,
  scrollToEndRequest,
  onLoadOlder,
  onOpenActions,
  onReply,
  onNearBottomChange,
  onClearNewMessages,
  onVisibleMessagesChange,
  onDenied
}: {
  readonly messages: readonly PresentedMessage[];
  readonly currentUserId: string;
  readonly lastReadSequence: number;
  readonly compact: boolean;
  readonly hasOlderHistory: boolean;
  readonly loadingOlder: boolean;
  readonly olderError: string | null;
  readonly newMessagesAvailable: boolean;
  readonly scrollToEndRequest: number;
  readonly onLoadOlder: () => void;
  readonly onOpenActions: (message: PresentedMessage, originHandle: number | null) => void;
  readonly onReply?: ((message: PresentedMessage) => void) | undefined;
  readonly onNearBottomChange: (value: boolean) => void;
  readonly onClearNewMessages: () => void;
  readonly onVisibleMessagesChange: (ids: ReadonlySet<string>) => void;
  readonly onDenied: () => void;
}) {
  const reducedMotion = useReducedMotion() ?? true;
  const list = useRef<FlatList<PresentedMessageTimelineItem>>(null);
  const scrollState = useRef<TimelineScrollState>({ initialScrollComplete: false, handledRequest: 0 });
  const visibleMessagesChange = useRef(onVisibleMessagesChange);
  visibleMessagesChange.current = onVisibleMessagesChange;
  const timeline = useMemo(
    () => buildMessageTimeline(messages, { currentUserId, lastReadSequence }),
    [currentUserId, lastReadSequence, messages]
  );
  const visibleByRule = useRef<[ReadonlySet<string>, ReadonlySet<string>]>([new Set(), new Set()]);
  const viewabilityPairs = useRef<ViewabilityConfigCallbackPair[]>(
    [
      { itemVisiblePercentThreshold: 60, minimumViewTime: 600 },
      { viewAreaCoveragePercentThreshold: 55, minimumViewTime: 600 }
    ].map((viewabilityConfig, index) => ({
      viewabilityConfig,
      onViewableItemsChanged: (info: { viewableItems: ViewToken<PresentedMessageTimelineItem>[] }) => {
        visibleByRule.current[index as 0 | 1] = new Set(
          info.viewableItems.flatMap((token) => token.item?.message.id ? [token.item.message.id] : [])
        );
        visibleMessagesChange.current(new Set([
          ...visibleByRule.current[0],
          ...visibleByRule.current[1]
        ]));
      }
    }))
  );

  useEffect(() => {
    const transition = nextTimelineScroll(scrollState.current, {
      event: "request",
      hasContent: timeline.length > 0,
      request: scrollToEndRequest
    });
    scrollState.current = transition.state;
    if (transition.action !== "requested") return;
    requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
  }, [scrollToEndRequest, timeline.length]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    onNearBottomChange(distance < 96);
  }, [onNearBottomChange]);

  const renderItem = useCallback(({ item }: { item: PresentedMessageTimelineItem }) => (
    <View>
      {item.showDateSeparator ? (
        <View accessibilityRole="text" style={styles.separatorRow}>
          <Text style={styles.dateSeparator}>{dayLabel(item.dayKey)}</Text>
        </View>
      ) : null}
      {item.showUnreadSeparator ? (
        <View accessibilityRole="text" accessibilityLabel="Unread messages" style={styles.unreadRow}>
          <View style={styles.unreadLine} />
          <Text style={styles.unreadText}>Unread messages</Text>
          <View style={styles.unreadLine} />
        </View>
      ) : null}
      <TimelineMessageBubble
        item={item}
        compact={compact}
        reducedMotion={reducedMotion}
        onDenied={onDenied}
        onOpenActions={onOpenActions}
        onReply={onReply}
      />
    </View>
  ), [compact, onDenied, onOpenActions, onReply, reducedMotion]);

  if (!timeline.length) {
    return <View style={styles.container}><ChatWallpaper /><StateView title="No messages yet" message="Start the project conversation with an update or question." /></View>;
  }

  return (
    <View style={styles.container}>
      <ChatWallpaper />
      <FlatList
        ref={list}
        testID="chat-message-list"
        data={timeline}
        keyExtractor={(item) => item.message.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onContentSizeChange={() => {
          const transition = nextTimelineScroll(scrollState.current, {
            event: "content-size",
            hasContent: timeline.length > 0,
            request: scrollToEndRequest
          });
          scrollState.current = transition.state;
          if (transition.action !== "initial") return;
          list.current?.scrollToEnd({ animated: false });
        }}
        onScroll={handleScroll}
        scrollEventThrottle={80}
        onStartReached={() => {
          if (hasOlderHistory && !loadingOlder) onLoadOlder();
        }}
        onStartReachedThreshold={0.2}
        viewabilityConfigCallbackPairs={viewabilityPairs.current}
        ListHeaderComponent={
          <View style={styles.historyHeader}>
            {loadingOlder ? <ActivityIndicator accessibilityLabel="Loading earlier messages" color={colors.violet} /> : null}
            {olderError ? (
              <Pressable accessibilityRole="button" onPress={onLoadOlder} style={styles.retryOlder}>
                <Text style={styles.retryOlderText}>Earlier messages unavailable · Retry</Text>
              </Pressable>
            ) : !hasOlderHistory ? <Text style={styles.beginning}>Beginning of conversation</Text> : null}
          </View>
        }
      />
      {newMessagesAvailable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLiveRegion="polite"
          accessibilityLabel="New messages. Move to latest message"
          onPress={onClearNewMessages}
          style={({ pressed }) => [styles.newMessages, pressed ? styles.pressed : null]}
        >
          <Text style={styles.newMessagesText}>New messages ↓</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: chatColors.canvas },
  content: { flexGrow: 1, justifyContent: "flex-end", paddingTop: spacing.sm, paddingBottom: spacing.md },
  historyHeader: { minHeight: 32, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  beginning: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 10 },
  retryOlder: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md },
  retryOlderText: { color: colors.danger, fontFamily: fonts.medium, fontSize: 11 },
  separatorRow: { alignItems: "center", marginVertical: spacing.sm },
  dateSeparator: {
    color: colors.inkMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.82)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    overflow: "hidden"
  },
  unreadRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginVertical: spacing.sm, paddingHorizontal: spacing.md },
  unreadLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.violet },
  unreadText: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 10 },
  newMessages: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.sm,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: colors.midnight,
    paddingHorizontal: spacing.md,
    elevation: 4
  },
  newMessagesText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 12 },
  pressed: { opacity: 0.82 }
});
