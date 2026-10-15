import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import {
  mergeMessagePages,
  presentChatSummary,
  presentMessagePage,
  selectSafelyReadableMessage,
  type ChatMessageFilter,
  type PresentedChatSummary,
  type PresentedMessage,
  type PresentedMessagePage
} from "./chatModel";
import { parseTypingSnapshot } from "./chatEnhancementsApi";
import { usePendingAssistantRefresh } from "./usePendingAssistantRefresh";
import { chatQueryKeys } from "./chatQueryKeys";

const MESSAGE_PAGE_SIZE = 50;

function denied(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

export function buildMessageHistoryPath(projectId: string, before?: string, options?: { filter?: ChatMessageFilter; around?: string; after?: string }): string {
  const path = `/projects/${encodeURIComponent(projectId)}/chat/messages?limit=${MESSAGE_PAGE_SIZE}`;
  return `${path}${before ? `&before=${encodeURIComponent(before)}` : options?.after ? `&after=${encodeURIComponent(options.after)}` : options?.around ? `&around=${encodeURIComponent(options.around)}` : ""}${options?.filter && options.filter !== "all" ? `&filter=${options.filter}` : ""}`;
}

function requireSummary(value: unknown, projectId: string): PresentedChatSummary {
  const summary = presentChatSummary(value, projectId);
  if (!summary) throw new ApiProtocolError();
  return summary;
}

function requirePage(value: unknown, projectId: string): PresentedMessagePage {
  const page = presentMessagePage(value, projectId);
  if (!page) throw new ApiProtocolError();
  return page;
}

export interface ChatThreadState {
  readonly ownerKey: string;
  readonly typing?: readonly { userId: string; name: string }[];
  readonly hasNewerHistory?: boolean;
  readonly loadingNewer?: boolean;
  loadNewer?(): Promise<void>;
  readonly summary: PresentedChatSummary | null;
  readonly messages: readonly PresentedMessage[];
  readonly loading: boolean;
  readonly denied: boolean;
  readonly error: string | null;
  readonly refreshing: boolean;
  readonly hasOlderHistory: boolean;
  readonly loadingOlder: boolean;
  readonly olderError: string | null;
  readonly newMessagesAvailable: boolean;
  readonly scrollToEndRequest: number;
  readonly readError: string | null;
  readonly acknowledgingRead: boolean;
  revokeAccess(): Promise<void>;
  setReadActive(value: boolean): void;
  refresh(): Promise<void>;
  refreshParticipantContext(participantCount?: number): Promise<void>;
  loadOlder(): Promise<void>;
  setNearBottom(value: boolean): void;
  clearNewMessages(): void;
  acknowledgeVisible(messageIds: ReadonlySet<string>): void;
  retryRead(): void;
}

export function useChatThread(
  projectId: string,
  session: AuthenticatedSession,
  options: { filter?: ChatMessageFilter; around?: string | null; active?: boolean } = {}
): ChatThreadState {
  const context = useConfiguredRuntime();
  const queryClient = useQueryClient();
  const scope = useMemo(() => ({
    environmentId: context.environment.environment.id,
    userId: session.user.id
  }), [context.environment.environment.id, session.user.id]);
  const ownerKey = `${context.environment.environment.id}\u0000${context.environment.generation}\u0000${context.session.generation}\u0000${session.user.id}\u0000${projectId}`;
  const projectKey = useMemo(
    () => chatQueryKeys.project(scope, projectId),
    [projectId, scope]
  );
  const conversationsKey = useMemo(
    () => chatQueryKeys.conversations(scope),
    [scope]
  );
  const filter = options.filter ?? "all"; const around = options.around ?? null;
  const [typing, setTyping] = useState<ReturnType<typeof parseTypingSnapshot>>([]);
  const [accessDenied, setAccessDenied] = useState(false);
  const [newMessagesAvailable, setNewMessagesAvailable] = useState(false);
  const [scrollToEndRequest, setScrollToEndRequest] = useState(0);
  const [readError, setReadError] = useState<string | null>(null);
  const nearBottom = useRef(true);
  const priorLatestSequence = useRef<number | null>(null);
  const lastVisibleIds = useRef<ReadonlySet<string>>(new Set());
  const highestReadRequested = useRef(0);
  const readingActive = useRef(true);

  useEffect(() => {
    setTyping([]);
    setAccessDenied(false);
    setNewMessagesAvailable(false);
    setReadError(null);
    nearBottom.current = true;
    priorLatestSequence.current = null;
    highestReadRequested.current = 0;
    lastVisibleIds.current = new Set();
  }, [projectId, scope.environmentId, scope.userId]);

  const summaryQuery = useQuery({
    queryKey: chatQueryKeys.summary(scope, projectId),
    queryFn: async ({ signal }) => requireSummary(
      await context.runtime.api.authenticated.get<unknown>(
        `/projects/${encodeURIComponent(projectId)}/chat`,
        { signal }
      ),
      projectId
    ),
    enabled: Boolean(projectId) && !accessDenied,
    staleTime: 15_000,
    retry: (count, error) => !denied(error) && !(error instanceof ApiProtocolError) && count < 1
  });

  const messageQuery = useInfiniteQuery({
    queryKey: filter === "all" && !around ? chatQueryKeys.messages(scope, projectId) : [...chatQueryKeys.messages(scope, projectId), filter, around ?? "latest"],
    queryFn: async ({ signal, pageParam }) => requirePage(
      await context.runtime.api.authenticated.get<unknown>(
        buildMessageHistoryPath(projectId, pageParam?.direction === "before" ? pageParam.cursor : undefined, { filter, ...(around ? { around } : {}), ...(pageParam?.direction === "after" ? { after: pageParam.cursor } : {}) }),
        { signal }
      ),
      projectId
    ),
    initialPageParam: null as { direction: "before" | "after"; cursor: string } | null,
    getNextPageParam: (page) => page.olderCursor ? { direction: "before" as const, cursor: page.olderCursor } : undefined,
    getPreviousPageParam: (page) => page.newerCursor ? { direction: "after" as const, cursor: page.newerCursor } : undefined,
    enabled: Boolean(projectId) && !accessDenied,
    staleTime: 10_000,
    retry: (count, error) => !denied(error) && !(error instanceof ApiProtocolError) && count < 1
  });

  const messages = useMemo(
    () => mergeMessagePages(messageQuery.data?.pages ?? []),
    [messageQuery.data?.pages]
  );
  const summary = summaryQuery.data ?? null;
  const messageHistoryReady = Boolean(messageQuery.data);
  const lastReadSequence = summary?.lastReadSequence ?? 0;
  const hasOlderHistory = Boolean(messageQuery.hasNextPage);

  const invalidateProject = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectKey }),
      queryClient.invalidateQueries({ queryKey: conversationsKey })
    ]);
  }, [conversationsKey, projectKey, queryClient]);

  const denyProject = useCallback(async () => {
    setTyping([]);
    setAccessDenied(true);
    setNewMessagesAvailable(false);
    setReadError(null);
    lastVisibleIds.current = new Set();
    await queryClient.cancelQueries({ queryKey: projectKey });
    queryClient.removeQueries({ queryKey: projectKey });
    await queryClient.invalidateQueries({ queryKey: conversationsKey });
  }, [conversationsKey, projectKey, queryClient]);

  useEffect(() => {
    if (denied(summaryQuery.error) || denied(messageQuery.error)) void denyProject();
  }, [denyProject, messageQuery.error, summaryQuery.error]);

  useEffect(() => {
    if (accessDenied || summaryQuery.error || messageQuery.error || !messageHistoryReady || !projectId || !summary) return;
    let active = true;
    const stream = context.runtime.realtime.createStream({
      path: `/projects/${encodeURIComponent(projectId)}/chat/events`,
      cursor: summary.cursor,
      cursorTransport: "query",
      deniedStatusCodes: [401, 403, 404],
      heartbeatTimeoutMs: 45_000,
      isDeniedEvent: (event) => {
        if (event.event !== "state") return false;
        try {
          const value = JSON.parse(event.data) as { status?: unknown };
          return value.status === "denied";
        } catch {
          return false;
        }
      },
      onEvent: (event) => {
        if (!active) return;
        if (event.event === "typing") { try { setTyping(parseTypingSnapshot(JSON.parse(event.data), projectId, session.user.id)); } catch { setTyping([]); } }
        if (event.event === "state") { try { if (JSON.parse(event.data).status !== "live") setTyping([]); } catch { setTyping([]); } }
        if (event.event === "chat") void invalidateProject();
      },
      onResync: () => { if (!active) return; setTyping([]); return invalidateProject(); },
      onDenied: () => { if (active) return denyProject(); }
    });
    stream.start();
    return () => { active = false; stream.stop(); setTyping([]); };
  }, [
    accessDenied,
    ownerKey,
    context.runtime.realtime,
    denyProject,
    invalidateProject,
    messageHistoryReady,
    projectId,
    messageQuery.error,
    summaryQuery.error,
    summary?.project.id
  ]);

  useEffect(() => {
    if (!typing.length) return;
    const timeout = setTimeout(() => setTyping(current => current.filter(person => person.expiresAt > Date.now())), Math.max(0, Math.min(...typing.map(person => person.expiresAt)) - Date.now()) + 1);
    return () => clearTimeout(timeout);
  }, [typing]);
  const latestSequence = messages.at(-1)?.sequence ?? 0;
  useEffect(() => {
    const previous = priorLatestSequence.current;
    priorLatestSequence.current = latestSequence;
    if (previous === null || latestSequence <= previous) return;
    if (nearBottom.current) setScrollToEndRequest((value) => value + 1);
    else setNewMessagesAvailable(true);
  }, [latestSequence]);

  const readMutation = useMutation({
    retry: false,
    mutationFn: (message: PresentedMessage) =>
      context.runtime.api.authenticated.put(
        `/projects/${encodeURIComponent(projectId)}/chat/read`,
        { messageId: message.id, sequence: message.sequence }
      ),
    onSuccess: async (_result, message) => {
      highestReadRequested.current = Math.max(highestReadRequested.current, message.sequence);
      setReadError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.summary(scope, projectId) }),
        queryClient.invalidateQueries({ queryKey: conversationsKey })
      ]);
    },
    onError: (error) => {
      if (denied(error)) {
        void denyProject();
        return;
      }
      setReadError("Read status could not be updated. Retry when your connection is available.");
    }
  });

  const acknowledgeVisible = useCallback((messageIds: ReadonlySet<string>) => {
    lastVisibleIds.current = new Set(messageIds);
    if (
      accessDenied || filter !== "all" ||
      !readingActive.current ||
      summaryQuery.error !== null ||
      messageQuery.error !== null ||
      readMutation.isPending ||
      !session.authorization.permissions.includes("chat.read_state") ||
      !summary
    ) return;
    const message = selectSafelyReadableMessage({
      messages,
      visibleMessageIds: messageIds,
      lastReadSequence: Math.max(summary.lastReadSequence, highestReadRequested.current),
      hasOlderHistory,
      projectId,
      active: readingActive.current
    });
    if (!message || message.sequence <= highestReadRequested.current) return;
    highestReadRequested.current = message.sequence;
    setReadError(null);
    readMutation.mutate(message);
  }, [accessDenied, filter, hasOlderHistory, messageQuery.error, messages, projectId, readMutation, session.authorization.permissions, summary, summaryQuery.error]);

  const retryRead = useCallback(() => {
    highestReadRequested.current = summary?.lastReadSequence ?? 0;
    setReadError(null);
    acknowledgeVisible(lastVisibleIds.current);
  }, [acknowledgeVisible, summary?.lastReadSequence]);

  const setReadActive = useCallback((value: boolean) => {
    readingActive.current = value;
    if (value) acknowledgeVisible(lastVisibleIds.current);
  }, [acknowledgeVisible]);

  const refresh = useCallback(async () => {
    await Promise.all([summaryQuery.refetch(), messageQuery.refetch()]);
  }, [messageQuery, summaryQuery]);

  usePendingAssistantRefresh({
    ownerKey, messages, refresh,
    enabled: options.active !== false && Boolean(projectId) && !accessDenied && !denied(summaryQuery.error) && !denied(messageQuery.error)
      && !(summaryQuery.error instanceof ApiProtocolError) && !(messageQuery.error instanceof ApiProtocolError)
  });

  const refreshParticipantContext = useCallback(async (participantCount?: number) => {
    const summaryKey = chatQueryKeys.summary(scope, projectId);
    if (typeof participantCount === "number") {
      queryClient.setQueryData<PresentedChatSummary>(summaryKey, (current) => current
        ? { ...current, participantCount }
        : current);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.participants(scope, projectId) }),
      queryClient.invalidateQueries({ queryKey: summaryKey }),
      queryClient.invalidateQueries({ queryKey: conversationsKey })
    ]);
  }, [conversationsKey, projectId, queryClient, scope]);

  const loadOlder = useCallback(async () => {
    if (!messageQuery.hasNextPage || messageQuery.isFetchingNextPage) return;
    await messageQuery.fetchNextPage();
  }, [messageQuery]);

  const loadNewer = useCallback(async () => {
    if (!messageQuery.hasPreviousPage || messageQuery.isFetchingPreviousPage) return;
    await messageQuery.fetchPreviousPage();
  }, [messageQuery]);
  const setNearBottom = useCallback((value: boolean) => {
    nearBottom.current = value;
    if (value) setNewMessagesAvailable(false);
  }, []);

  const clearNewMessages = useCallback(() => {
    nearBottom.current = true;
    setNewMessagesAvailable(false);
    setScrollToEndRequest((value) => value + 1);
  }, []);

  const primaryError = summaryQuery.error ?? messageQuery.error;
  const primaryDenied = accessDenied || denied(primaryError);
  const protocolFailure = summaryQuery.error instanceof ApiProtocolError || messageQuery.error instanceof ApiProtocolError;
  return {
    ownerKey,
    typing: primaryDenied || primaryError ? [] : typing,
    hasNewerHistory: Boolean(messageQuery.hasPreviousPage), loadingNewer: messageQuery.isFetchingPreviousPage, loadNewer,
    summary: primaryDenied || protocolFailure ? null : summary,
    messages: primaryDenied || protocolFailure ? [] : messages,
    loading: summaryQuery.isPending || messageQuery.isPending,
    denied: primaryDenied,
    error: primaryDenied || !primaryError
      ? null
      : primaryError instanceof Error
        ? primaryError.message
        : "The conversation could not be loaded.",
    refreshing: summaryQuery.isRefetching || (messageQuery.isRefetching && !messageQuery.isFetchingNextPage && !messageQuery.isFetchingPreviousPage),
    hasOlderHistory,
    loadingOlder: messageQuery.isFetchingNextPage,
    olderError: messageQuery.isFetchNextPageError ? "Earlier messages could not be loaded." : null,
    newMessagesAvailable,
    scrollToEndRequest,
    readError,
    acknowledgingRead: readMutation.isPending,
    revokeAccess: denyProject,
    setReadActive,
    refresh,
    refreshParticipantContext,
    loadOlder,
    setNearBottom,
    clearNewMessages,
    acknowledgeVisible,
    retryRead
  };
}
