import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type TextInput
} from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { StateView } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { chatQueryKeys, normalizeConversationSearch, type ConversationListFilter } from "./chatQueryKeys";
import {
  mergeConversationPages,
  presentConversationPage,
  type PresentedConversation,
  type PresentedConversationPage,
  type PresentedConversationTotals
} from "./chatModel";
import { ConversationFilters } from "./ConversationFilters";
import { ConversationRow } from "./ConversationRow";
import { ConversationSearchField, useDebouncedSearch } from "./ConversationSearchField";
import { ConversationSortMenu, sortConversations, type ConversationSortMode } from "./ConversationSortMenu";
import { ChatIcon } from "./ChatIcon";

const PAGE_SIZE = 30;

function isDenied(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

function conversationsPath(offset: number, filter: ConversationListFilter, search: string): string {
  // Omit default parameters so older servers with a strict query schema keep working.
  return `/project-messages?limit=${PAGE_SIZE}&offset=${offset}` +
    (filter !== "all" ? `&filter=${filter}` : "") +
    (search ? `&search=${encodeURIComponent(search)}` : "");
}

const FILTER_EMPTY_STATES: Readonly<Record<Exclude<ConversationListFilter, "all">, { readonly title: string; readonly message: string }>> = {
  unread: { title: "No unread conversations", message: "You are all caught up." },
  critical: { title: "No open critical issues", message: "Conversations with open critical issues will appear here." },
  important: { title: "No open important issues", message: "Conversations with open important issues will appear here." }
};

function HeaderIconButton({ label, icon, disabled, onPress }: {
  readonly label: string;
  readonly icon: "search" | "list";
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={2}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null, disabled ? styles.iconButtonDisabled : null]}
    >
      <ChatIcon color={colors.ink} name={icon} size={22} />
    </Pressable>
  );
}

function ListHeader({ compact, controlsEnabled, onSearch, onSort }: {
  readonly compact: boolean;
  readonly controlsEnabled: boolean;
  readonly onSearch: () => void;
  readonly onSort: () => void;
}) {
  return (
    <View style={[styles.header, compact ? styles.headerCompact : null]}>
      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" style={styles.title}>Messages</Text>
        <Text style={styles.subtitle}>Project conversations</Text>
      </View>
      <View style={styles.headerActions}>
        <HeaderIconButton disabled={!controlsEnabled} icon="search" label="Search messages" onPress={onSearch} />
        <HeaderIconButton disabled={!controlsEnabled} icon="list" label="Sort conversations" onPress={onSort} />
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
  const [filter, setFilter] = useState<ConversationListFilter>("all");
  const [searchText, setSearchText] = useState("");
  const search = normalizeConversationSearch(useDebouncedSearch(searchText));
  const [sortMode, setSortMode] = useState<ConversationSortMode>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const searchInput = useRef<TextInput>(null);
  const conversationsFamilyKey = useMemo(() => chatQueryKeys.conversations(scope), [scope]);
  const conversationsKey = useMemo(
    () => chatQueryKeys.conversations(scope, { filter, search }),
    [filter, scope, search]
  );
  const queryClient = useQueryClient();
  const [accessDenied, setAccessDenied] = useState(false);
  const [knownTotals, setKnownTotals] = useState<PresentedConversationTotals | null>(null);
  const paging = useRef(false);

  useEffect(() => {
    setAccessDenied(false);
    setKnownTotals(null);
  }, [scope.environmentId, scope.userId]);

  const query = useInfiniteQuery({
    queryKey: conversationsKey,
    initialPageParam: 0,
    enabled: mayRead && !accessDenied && context.environment.status === "ready",
    queryFn: async ({ pageParam, signal }): Promise<PresentedConversationPage> => {
      const value = await context.runtime.api.authenticated.get<unknown>(
        conversationsPath(pageParam, filter, search),
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
    // Denial clears every filtered/searched list in this scope, not only the visible one.
    void queryClient.cancelQueries({ queryKey: conversationsFamilyKey }).finally(() => {
      queryClient.removeQueries({ queryKey: conversationsFamilyKey });
    });
  }, [conversationsFamilyKey, queryClient, serverDenied]);

  const listDenied = !mayRead || accessDenied || serverDenied;

  const conversations = useMemo(
    () => !listDenied ? sortConversations(mergeConversationPages(query.data?.pages ?? []), sortMode) : [],
    [listDenied, query.data?.pages, sortMode]
  );
  const latestTotals = !listDenied ? query.data?.pages[0]?.totals ?? null : null;
  useEffect(() => {
    if (latestTotals) setKnownTotals(latestTotals);
  }, [latestTotals]);
  // Totals ignore filter and search, so the last server value stays valid while a new filter loads.
  const totals = listDenied ? null : latestTotals ?? knownTotals;
  const clearSearch = useCallback(() => setSearchText(""), []);
  const focusSearch = useCallback(() => searchInput.current?.focus(), []);
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
  ) : search ? (
    <StateView
      actionLabel="Clear"
      message="Try a different project name."
      onAction={clearSearch}
      title="No conversations match"
    />
  ) : filter !== "all" ? (
    <StateView message={FILTER_EMPTY_STATES[filter].message} title={FILTER_EMPTY_STATES[filter].title} />
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
    <>
      <FlatList
        ListEmptyComponent={listEmpty}
        ListFooterComponent={footer}
        ListHeaderComponent={(
          <>
            <ListHeader
              compact={compact}
              controlsEnabled={!listDenied}
              onSearch={focusSearch}
              onSort={() => setSortOpen(true)}
            />
            {!listDenied ? (
              <View style={styles.controls}>
                <ConversationSearchField
                  inputRef={searchInput}
                  onChangeText={setSearchText}
                  onClear={clearSearch}
                  value={searchText}
                />
                <ConversationFilters onChange={setFilter} totals={totals} value={filter} />
              </View>
            ) : null}
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
            currentUserId={session.user.id}
            disabled={selectionDisabled}
            onPress={() => onSelectProject(item.project.id)}
            selected={item.project.id === selectedProjectId}
          />
        )}
        style={styles.list}
        testID="conversation-list"
      />
      <ConversationSortMenu
        onChange={setSortMode}
        onRequestClose={() => setSortOpen(false)}
        value={sortMode}
        visible={sortOpen && !listDenied}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.surface },
  content: { width: "100%", maxWidth: 760, flexGrow: 1, alignSelf: "center", backgroundColor: colors.surface },
  contentCompact: { maxWidth: 520 },
  contentEmpty: { backgroundColor: colors.canvas },
  header: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface
  },
  headerCompact: { minHeight: 70 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", alignItems: "center" },
  title: { color: colors.ink, fontFamily: fonts.bold, fontSize: 28, lineHeight: 36, letterSpacing: -0.5 },
  subtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill
  },
  iconButtonPressed: { backgroundColor: colors.surfaceMuted },
  iconButtonDisabled: { opacity: 0.45 },
  controls: { gap: spacing.xxs, paddingBottom: spacing.xxs, backgroundColor: colors.surface },
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
