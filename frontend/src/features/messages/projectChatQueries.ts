import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { chatErrorMessage, chatKeys, isChatDenied, projectChatApi } from "./projectChatApi";
import { useOptionalProjectChat, useProjectChat } from "./ProjectChatProvider";
import type { ChatFilter } from "./projectChatTypes";

const retry = (count: number, error: unknown) => !isChatDenied(error) && count < 1;
export function useChatSummary(projectId: string) {
  const chat = useOptionalProjectChat();
  const query = useQuery({
    queryKey: chatKeys.summary(chat?.scope ?? "unavailable", projectId),
    queryFn: ({ signal }) => projectChatApi.summary(projectId, signal),
    enabled: Boolean(chat?.enabled && projectId && !chat.denied.has(projectId)),
    staleTime: 15_000, refetchOnWindowFocus: true, retry
  });
  const revoke = chat?.revoke;
  useEffect(() => { if (isChatDenied(query.error)) revoke?.(projectId); }, [projectId, query.error, revoke]);
  return query;
}
export function useChatParticipants(projectId: string, enabled = true) {
  const chat = useProjectChat();
  const query = useQuery({ queryKey: chatKeys.participants(chat.scope, projectId), queryFn: ({ signal }) => projectChatApi.participants(projectId, signal), enabled: enabled && chat.enabled && !chat.denied.has(projectId), retry, staleTime: 15_000, refetchOnWindowFocus: true });
  const { verifyAccess } = chat;
  useEffect(() => { if (isChatDenied(query.error)) void verifyAccess(projectId); }, [projectId, query.error, verifyAccess]);
  return query;
}
export function useChatMessages(projectId: string, filter: ChatFilter, around?: string, enabled = true) {
  const chat = useProjectChat();
  const query = useInfiniteQuery({
    queryKey: chatKeys.messages(chat.scope, projectId, filter, around),
    queryFn: ({ signal, pageParam }) => projectChatApi.messages(projectId, { filter, ...(pageParam ?? (around ? { around } : {})) }, signal),
    initialPageParam: undefined as { before?: string; after?: string } | undefined,
    getNextPageParam: (page): { before?: string; after?: string } | undefined => page.olderCursor ? { before: page.olderCursor } : undefined,
    // A bounded history window; older navigation remains available in either direction.
    maxPages: 6,
    getPreviousPageParam: (page): { before?: string; after?: string } | undefined => page.newerCursor ? { after: page.newerCursor } : undefined,
    enabled: enabled && chat.enabled && !chat.denied.has(projectId), retry, refetchOnWindowFocus: true
  });
  const { verifyAccess } = chat;
  useEffect(() => { if (isChatDenied(query.error)) void verifyAccess(projectId); }, [projectId, query.error, verifyAccess]);
  return query;
}
export function useChatAction(projectId: string) {
  const { isCurrent, invalidate, verifyAccess } = useProjectChat();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), [projectId]);
  async function run<T>(operation: (signal: AbortSignal) => Promise<T>, onSuccess: (result: T) => void) {
    if (active.current) return;
    const current = isCurrent(projectId);
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(null);
    try {
      const result = await operation(controller.signal);
      if (!controller.signal.aborted && current()) {
        await invalidate(projectId);
        if (!controller.signal.aborted && current()) onSuccess(result);
      }
    } catch (failure) {
      if (!controller.signal.aborted && current()) {
        if (isChatDenied(failure)) await verifyAccess(projectId);
        if (current()) { setError(chatErrorMessage(failure)); await invalidate(projectId); }
      }
    } finally {
      active.current = null;
      if (!controller.signal.aborted && current()) setBusy(false);
    }
  }
  return { error, busy, run };
}

/** Stable across retries; a changed version, action, or payload gets a fresh key. */
export function useChatIdempotency() {
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  return (payload: unknown) => {
    const value = JSON.stringify(payload);
    if (!attempt.current || attempt.current.payload !== value) attempt.current = { payload: value, key: crypto.randomUUID() };
    return attempt.current.key;
  };
}

/** A missing policy on an older server disables media, not text chat. */
export function useChatAttachmentPolicy(projectId: string, enabled: boolean) {
  const chat = useProjectChat();
  const query = useQuery({ queryKey: [...chatKeys.project(chat.scope, projectId), "attachment-policy"], queryFn: ({ signal }) => projectChatApi.attachmentPolicy(projectId, signal), enabled: enabled && chat.enabled && !chat.denied.has(projectId), retry: (count, error) => !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && count < 1, staleTime: 60_000, refetchOnWindowFocus: true });
  const { verifyAccess } = chat;
  useEffect(() => { if (isChatDenied(query.error)) void verifyAccess(projectId); }, [projectId, query.error, verifyAccess]);
  const { configureTransfers } = chat;
  useEffect(() => { if (query.data) configureTransfers(query.data.limits.maxConcurrentTransfers); }, [query.data, configureTransfers]);
  return { ...query, unsupported: query.error instanceof ApiError && query.error.status === 404 };
}

export function useChatActionTypes(projectId: string, enabled = true) {
  const chat = useProjectChat();
  const query = useQuery({ queryKey: chatKeys.actionTypes(chat.scope, projectId), queryFn: ({ signal }) => projectChatApi.actionTypes(projectId, signal), enabled: enabled && chat.enabled && !chat.denied.has(projectId), retry, staleTime: 15_000, refetchOnWindowFocus: true });
  const { verifyAccess } = chat;
  useEffect(() => { if (isChatDenied(query.error)) void verifyAccess(projectId); }, [projectId, query.error, verifyAccess]);
  return query;
}
