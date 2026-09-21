import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { StateView } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { chatQueryKeys } from "./chatQueryKeys";
import {
  mergeConversationPages,
  presentConversationPage,
  type PresentedConversation,
  type PresentedConversationPage
} from "./chatModel";
import { ConversationRow } from "./ConversationRow";
import { ChatIcon } from "./ChatIcon";
import { chatColors } from "./chatTheme";

const PAGE_SIZE = 30;

function isDenied(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

function ListHeader({ compact, refreshing, refreshEnabled, total, onRefresh }: {
  readonly compact: boolean;
  readonly refreshing: boolean;
  readonly refreshEnabled: boolean;
  readonly total: number;
  readonly onRefresh: () => void;
}) {
  return (
    <View>
      <View style={[styles.header, compact ? styles.headerCompact : null]}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>Project conversations</Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh messages"
          accessibilityRole="button"
          accessibilityState={{ busy: refreshing, disabled: !refreshEnabled || refreshing }}
          disabled={!refreshEnabled || refreshing}
          hitSlop={4}
          onPress={onRefresh}
          style={({ pressed }) => [styles.refreshButton, pressed ? styles.refreshPressed : null]}
        >
          {refreshing ? <ActivityIndicator color={chatColors.green} size="small" /> : <ChatIcon name="refresh" />}
        </Pressable>
      </View>
      <View style={styles.contextRow}>
        <Text style={styles.contextLabel}>Your project groups</Text>
        <Text accessibilityLabel={`${total} project ${total === 1 ? "group" : "groups"}`} style={styles.contextCount}>{total}</Text>
      </View>
    </View>
  );
}

function ConversationSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading project conversations" accessibilityRole="progressbar" style={styles.skeletonList}>
      {[0, 1, 2, 3, 4].map((item) => (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" key={item} style={styles.skeletonRow}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonCopy}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonLine} />
          </View>
        </View>
      ))}
    </View>
  );
}

function StaleWarning({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.warning}>
      <View style={styles.warningCopy}>
        <Text style={styles.warningTitle}>Messages may be out of date</Text>
        <Text style={styles.warningText}>We kept the conversations already on this device.</Text>
      </View>
      <Pressable accessibilityLabel="Retry refreshing messages" accessibilityRole="button" onPress={onRetry} style={styles.inlineAction}>
        <Text style={styles.inlineActionText}>Retry</Text>
      </Pressable>
    </View>
  );
}

export interface ConversationListProps {
  readonly session: AuthenticatedSession;
  readonly selectedProjectId?: string | null;
  readonly compact?: boolean;
  readonly selectionDisabled?: boolean;
  readonly onSelectProject: (projectId: string) => void;
}

export function ConversationList({
  session,
  selectedProjectId = null,
  compact = false,
  selectionDisabled = false,
  onSelectProject
}: ConversationListProps) {
  const context = useConfiguredRuntime();
  const mayRead = canPerformOperation(session, "GET /project-messages");
  const scope = useMemo(() => ({
    environmentId: context.environment.environment.id,
    userId: session.user.id
  }), [context.environment.environment.id, session.user.id]);
  const conversationsKey = useMemo(() => chatQueryKeys.conversations(scope), [scope]);
  const queryClient = useQueryClient();
  const [accessDenied, setAccessDenied] = useState(false);
  const paging = useRef(false);

  useEffect(() => {
    setAccessDenied(false);
  }, [scope.environmentId, scope.userId]);

  const query = useInfiniteQuery({
    queryKey: conversationsKey,
    initialPageParam: 0,
    enabled: mayRead && !accessDenied && context.environment.status === "ready",
    queryFn: async ({ pageParam, signal }): Promise<PresentedConversationPage> => {
      const value = await context.runtime.api.authenticated.get<unknown>(
        `/project-messages?limit=${PAGE_SIZE}&offset=${pageParam}`,
        { signal }
      );
      const page = presentConversationPage(value);
      if (!page) throw new ApiProtocolError();
      return page;
    },
    getNextPageParam: (page) => page.pagination.hasMore
      ? page.pagination.offset + page.pagination.limit
      : undefined,
    retry: (count, error) => !isDenied(error) && !(error instanceof ApiProtocolError) && count < 1
  });

  const serverDenied = isDenied(query.error);
  useEffect(() => {
    if (!serverDenied) return;
    setAccessDenied(true);
    void queryClient.cancelQueries({ queryKey: conversationsKey }).finally(() => {
      queryClient.removeQueries({ queryKey: conversationsKey });
    });
  }, [conversationsKey, queryClient, serverDenied]);

  const listDenied = !mayRead || accessDenied || serverDenied;

  const conversations = useMemo(
    () => !listDenied ? mergeConversationPages(query.data?.pages ?? []) : [],
    [listDenied, query.data?.pages]
  );
  const total = !listDenied ? query.data?.pages[0]?.pagination.total ?? conversations.length : 0;
  const refresh = useCallback(() => {
    if (!listDenied) void query.refetch();
  }, [listDenied, query]);
  const loadNext = useCallback(() => {
    if (listDenied || !query.hasNextPage || query.isFetchingNextPage || paging.current) return;
    paging.current = true;
    void query.fetchNextPage().finally(() => {
      paging.current = false;
    });
  }, [listDenied, query]);

  const listEmpty = listDenied ? (
    <StateView
      message="Your current session cannot access project conversations."
      title="Messages are unavailable"
      tone="denied"
    />
  ) : query.isPending ? (
    <ConversationSkeleton />
  ) : query.isError && conversations.length === 0 ? (
    <StateView
      actionLabel="Retry"
      message="Check your connection and try again."
      onAction={refresh}
      title="Messages could not be loaded"
      tone="error"
    />
  ) : (
    <StateView
      message="Projects you actively participate in will appear here."
      title="No project conversations"
    />
  );

  const footer = query.isFetchingNextPage ? (
    <View accessible accessibilityLabel="Loading more conversations" accessibilityRole="progressbar" style={styles.footer}>
      <ActivityIndicator color={colors.violet} />
      <Text style={styles.footerText}>Loading more…</Text>
    </View>
  ) : query.isFetchNextPageError ? (
    <View accessibilityLiveRegion="polite" style={styles.footer}>
      <Text style={styles.footerError}>More conversations could not be loaded.</Text>
      <Pressable accessibilityLabel="Retry loading more conversations" accessibilityRole="button" onPress={loadNext} style={styles.footerButton}>
        <Text style={styles.footerButtonText}>Retry</Text>
      </Pressable>
    </View>
  ) : <View style={styles.footerSpace} />;

  return (
    <FlatList
      ListEmptyComponent={listEmpty}
      ListFooterComponent={footer}
      ListHeaderComponent={(
        <>
          <ListHeader
            compact={compact}
            onRefresh={refresh}
            refreshEnabled={!listDenied}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            total={total}
          />
          {query.isRefetchError && conversations.length > 0 ? <StaleWarning onRetry={refresh} /> : null}
        </>
      )}
      contentContainerStyle={[styles.content, compact ? styles.contentCompact : null, conversations.length === 0 ? styles.contentEmpty : null]}
      data={conversations}
      extraData={selectedProjectId}
      keyExtractor={(conversation) => conversation.project.id}
      keyboardShouldPersistTaps="handled"
      onEndReached={loadNext}
      onEndReachedThreshold={0.35}
      refreshControl={(
        <RefreshControl
          accessibilityLabel="Refresh project conversations"
          enabled={!listDenied}
          onRefresh={refresh}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          tintColor={colors.violet}
        />
      )}
      renderItem={({ item }: { readonly item: PresentedConversation }) => (
        <ConversationRow
          compact={compact}
          conversation={item}
          disabled={selectionDisabled}
          onPress={() => onSelectProject(item.project.id)}
          selected={item.project.id === selectedProjectId}
        />
      )}
      style={styles.list}
      testID="conversation-list"
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.surface },
  content: { width: "100%", maxWidth: 760, flexGrow: 1, alignSelf: "center", backgroundColor: colors.surface },
  contentCompact: { maxWidth: 520 },
  contentEmpty: { backgroundColor: colors.canvas },
  header: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface
  },
  headerCompact: { minHeight: 76 },
  headerCopy: { flex: 1 },
  title: { color: chatColors.ink, fontFamily: fonts.semibold, fontSize: 23, lineHeight: 30, letterSpacing: -0.45 },
  subtitle: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 1 },
  refreshButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: "transparent"
  },
  refreshPressed: { opacity: 0.7 },
  contextRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: chatColors.header },
  contextLabel: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 12 },
  contextCount: { minWidth: 24, color: chatColors.muted, fontFamily: fonts.medium, fontSize: 11, lineHeight: 20, textAlign: "center", borderRadius: radii.pill, backgroundColor: chatColors.header, overflow: "hidden", paddingHorizontal: 6 },
  skeletonList: { backgroundColor: colors.surface },
  skeletonRow: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  skeletonAvatar: { width: 48, height: 48, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted },
  skeletonCopy: { flex: 1, gap: spacing.sm },
  skeletonTitle: { width: "62%", height: 13, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted },
  skeletonLine: { width: "82%", height: 10, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted },
  warning: { flexDirection: "row", alignItems: "center", gap: spacing.sm, margin: spacing.sm, padding: spacing.sm, borderRadius: radii.control, backgroundColor: colors.warningSoft },
  warningCopy: { flex: 1, gap: 2 },
  warningTitle: { color: colors.warning, fontFamily: fonts.semibold, fontSize: 12 },
  warningText: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 15 },
  inlineAction: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  inlineActionText: { color: colors.warning, fontFamily: fonts.semibold, fontSize: 12 },
  footer: { minHeight: 68, alignItems: "center", justifyContent: "center", gap: spacing.xs, padding: spacing.sm, backgroundColor: colors.surface },
  footerText: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11 },
  footerError: { color: colors.danger, fontFamily: fonts.regular, fontSize: 11 },
  footerButton: { minWidth: 72, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.control, backgroundColor: colors.dangerSoft },
  footerButtonText: { color: colors.danger, fontFamily: fonts.semibold, fontSize: 12 },
  footerSpace: { height: spacing.lg }
});
