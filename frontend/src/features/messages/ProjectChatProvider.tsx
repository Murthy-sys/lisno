import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { ApiError, tokenStorage } from "../../api/client";
import { chatErrorMessage, chatKeys, isChatDenied, projectChatApi } from "./projectChatApi";
import { emptyChatDraft, type ChatDraft, type ChatLocalAttachment } from "./projectChatState";
import { ChatTransferPool } from "./chatTransfers";
import { runProjectChatStream } from "./projectChatStream";
import type { ChatMessage, ChatMessagePage, ChatSendInput, ChatStreamState } from "./projectChatTypes";

export interface ChatSendAttempt {
  input: ChatSendInput; status: "sending" | "failed"; error?: string; reply?: ChatDraft["reply"];
  files?: ChatLocalAttachment[]; phase?: "uploading" | "committing" | "cancelling";
  /** Once submission starts, interrupted delivery must be replayed before editing/discarding. */
  commitStarted?: boolean;
}
interface ProjectMemory { draft: ChatDraft; attempts: ChatSendAttempt[] }
interface ChatContextValue {
  scope: string; enabled: boolean; userId: string; currentProjectId: string | null;
  connection: ChatStreamState["status"]; denied: ReadonlySet<string>;
  register: (projectId: string) => () => void;
  revoke: (projectId: string) => void;
  verifyAccess: (projectId: string) => Promise<void>;
  invalidate: (projectId: string) => Promise<void>;
  isCurrent: (projectId: string) => () => boolean;
  memory: Record<string, ProjectMemory>;
  overview: Record<string, { to: string; label: string }>;
  rememberOverview: (projectId: string, to: string, label: string) => void;
  setDraft: (projectId: string, draft: ChatDraft) => void;
  send: (projectId: string, input: ChatSendInput, clearDraft?: boolean) => Promise<void>;
  removeAttempt: (projectId: string, id: string) => void;
  cancelAttempt: (projectId: string, id: string, discard?: boolean) => Promise<void>;
  reconcileMessages: (projectId: string, messages: ChatMessage[]) => void;
  configureTransfers: (limit: number) => void;
  transfer: <T>(operation: () => Promise<T>, signal: AbortSignal) => Promise<T>;
}
const ChatContext = createContext<ChatContextValue | null>(null);

export function ProjectChatProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const token = tokenStorage.get();
  const authenticated = auth.status === "authenticated" && Boolean(auth.user) && hasFrontendPermission(auth.authorization, "chat.read");
  const identity = useMemo(() => crypto.randomUUID(), [authenticated, auth.user?.id, token]);
  // A remount or renewed session gets a fresh opaque cache namespace; tokens never enter keys.
  return <ChatSession key={identity} userId={authenticated ? auth.user!.id : ""} enabled={authenticated}>{children}</ChatSession>;
}

function ChatSession({ children, userId, enabled }: { children: ReactNode; userId: string; enabled: boolean }) {
  const queryClient = useQueryClient();
  const [scope] = useState(() => `${userId}:${crypto.randomUUID()}`);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [denied, setDenied] = useState<Set<string>>(new Set());
  const deniedRef = useRef(denied);
  const [memory, setMemory] = useState<Record<string, ProjectMemory>>({});
  const memoryRef = useRef(memory);
  const [pool] = useState(() => new ChatTransferPool());
  const configureTransfers = useCallback((limit: number) => pool.setLimit(limit), [pool]);
  const transfer = useCallback(<T,>(operation: () => Promise<T>, signal: AbortSignal) => pool.run(operation, signal), [pool]);
  const [overview, setOverview] = useState<Record<string, { to: string; label: string }>>({});
  const [connection, setConnection] = useState<ChatStreamState["status"]>("connecting");
  const leases = useRef(new Map<symbol, string>());
  const mounted = useRef(true);
  const activeProject = useRef(currentProjectId);
  activeProject.current = currentProjectId;
  const controllers = useRef(new Map<string, { controller: AbortController; projectId: string }>());

  const register = useCallback((projectId: string) => {
    const key = Symbol(projectId);
    leases.current.set(key, projectId);
    setCurrentProjectId(projectId);
    return () => {
      leases.current.delete(key);
      // Overview -> Messages unmount/mount must not tear down their shared project stream.
      queueMicrotask(() => {
        if (mounted.current) setCurrentProjectId([...leases.current.values()].at(-1) ?? null);
      });
    };
  }, []);
  const invalidate = useCallback(async (projectId: string) => {
    if (!mounted.current || deniedRef.current.has(projectId)) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chatKeys.project(scope, projectId), predicate: query => query.queryKey.at(-1) !== "attachment-policy" }),
      queryClient.invalidateQueries({ queryKey: chatKeys.list(scope) })
    ]);
  }, [queryClient, scope]);
  const revoke = useCallback((projectId: string) => {
    if (!mounted.current || deniedRef.current.has(projectId)) return;
    deniedRef.current = new Set([...deniedRef.current, projectId]);
    setDenied(deniedRef.current);
    for (const { controller, projectId: requestProject } of controllers.current.values()) if (projectId === requestProject) controller.abort();
    const nextMemory = { ...memoryRef.current }; delete nextMemory[projectId]; memoryRef.current = nextMemory; setMemory(nextMemory);
    setOverview(old => { const next = { ...old }; delete next[projectId]; return next; });
    void queryClient.cancelQueries({ queryKey: chatKeys.project(scope, projectId) }).then(() => {
      queryClient.removeQueries({ queryKey: chatKeys.project(scope, projectId) });
    });
    queryClient.removeQueries({ queryKey: chatKeys.list(scope) });
  }, [queryClient, scope]);
  const isCurrent = useCallback((projectId: string) => {
    const requestToken = tokenStorage.get();
    return () => mounted.current && tokenStorage.get() === requestToken && activeProject.current === projectId && !deniedRef.current.has(projectId);
  }, []);
  const verifyAccess = useCallback(async (projectId: string) => {
    const requestToken = tokenStorage.get();
    if (!mounted.current) return;
    try {
      await queryClient.fetchQuery({ queryKey: chatKeys.summary(scope, projectId), queryFn: ({ signal }) => projectChatApi.summary(projectId, signal), staleTime: 0, retry: false });
      if (mounted.current && tokenStorage.get() === requestToken && deniedRef.current.has(projectId)) {
        const next = new Set(deniedRef.current);
        next.delete(projectId);
        deniedRef.current = next;
        setDenied(next);
        if (activeProject.current === projectId) setConnection("connecting");
      }
    } catch (error) {
      if (mounted.current && tokenStorage.get() === requestToken && isChatDenied(error)) revoke(projectId);
    }
  }, [queryClient, revoke, scope]);
  const updateMemory = useCallback((projectId: string, change: (old: ProjectMemory) => ProjectMemory) => {
    if (!mounted.current || deniedRef.current.has(projectId)) return;
    const next = { ...memoryRef.current, [projectId]: change(memoryRef.current[projectId] ?? { draft: emptyChatDraft(), attempts: [] }) };
    memoryRef.current = next; setMemory(next);
  }, []);
  const setDraft = useCallback((projectId: string, draft: ChatDraft) => {
    if (!isCurrent(projectId)()) return;
    const removed = memoryRef.current[projectId]?.draft.files.filter(file => file.staged && !draft.files.some(next => next.localId === file.localId)) ?? [];
    updateMemory(projectId, old => ({ ...old, draft }));
    for (const file of removed) {
      const key = `discard:${file.staged!.attachment.id}`;
      const run = { projectId, controller: new AbortController() }; controllers.current.set(key, run);
      void projectChatApi.discardAttachment(projectId, file.staged!.attachment.id, run.controller.signal).catch(() => {}).finally(() => { if (controllers.current.get(key) === run) controllers.current.delete(key); });
    }
  }, [isCurrent, updateMemory]);
  const rememberOverview = useCallback((projectId: string, to: string, label: string) => {
    if (!mounted.current || deniedRef.current.has(projectId) || !to.startsWith("/") || to.startsWith("//")) return;
    setOverview(old => old[projectId]?.to === to && old[projectId]?.label === label ? old : { ...old, [projectId]: { to, label } });
  }, []);
  const removeAttempt = useCallback((projectId: string, id: string) => updateMemory(projectId, old => ({ ...old, attempts: old.attempts.filter(attempt => attempt.input.clientMessageId !== id) })), [updateMemory]);
  const reconcileMessages = useCallback((projectId: string, messages: ChatMessage[]) => {
    if (!isCurrent(projectId)()) return;
    const keys = new Set(messages.filter(message => message.author.id === userId).map(message => message.clientMessageId));
    if (!memoryRef.current[projectId]?.attempts.some(attempt => keys.has(attempt.input.clientMessageId))) return;
    for (const key of keys) {
      const request = controllers.current.get(key);
      if (request?.projectId === projectId) { request.controller.abort(); controllers.current.delete(key); }
    }
    updateMemory(projectId, old => ({ ...old, attempts: old.attempts.filter(attempt => !keys.has(attempt.input.clientMessageId)) }));
  }, [isCurrent, updateMemory, userId]);
  const cancelAttempt = useCallback(async (projectId: string, id: string, discard = false) => {
    const attempt = memoryRef.current[projectId]?.attempts.find(item => item.input.clientMessageId === id);
    if (!attempt || !isCurrent(projectId)()) return;
    const request = controllers.current.get(id);
    request?.controller.abort();
    if (controllers.current.get(id) === request) controllers.current.delete(id);
    const valid = isCurrent(projectId);
    if (attempt.commitStarted) {
      updateMemory(projectId, old => ({ ...old, attempts: old.attempts.map(item => item.input.clientMessageId === id ? { ...item, status: "failed", error: "Delivery is unconfirmed. Retry this same message to confirm it before editing or discarding." } : item) }));
      return;
    }
    const cleanup = { controller: new AbortController(), projectId };
    controllers.current.set(id, cleanup);
    const files = (attempt.files ?? []).map(file => file.staged ? { ...file, staged: undefined, progress: 0, clientUploadId: crypto.randomUUID() } : file);
    // Any replacement stages form a new immutable message payload. Switch the
    // identity before cleanup so navigation during cancellation is safe to retry.
    const retryId = crypto.randomUUID();
    updateMemory(projectId, old => ({ ...old, attempts: old.attempts.map(item => item.input.clientMessageId === id ? { ...item, input: { ...item.input, clientMessageId: retryId, attachmentIds: [] }, files, status: "sending", phase: "cancelling", error: undefined } : item) }));
    controllers.current.delete(id);
    controllers.current.set(retryId, cleanup);
    await Promise.allSettled((attempt.files ?? []).filter(file => file.staged).map(file => projectChatApi.discardAttachment(projectId, file.staged!.attachment.id, cleanup.controller.signal)));
    if (!valid() || controllers.current.get(retryId) !== cleanup) return;
    controllers.current.delete(retryId);
    updateMemory(projectId, old => ({ ...old, attempts: discard ? old.attempts.filter(item => item.input.clientMessageId !== retryId) : old.attempts.map(item => item.input.clientMessageId === retryId ? { ...item, status: "failed", phase: "uploading", error: "Transfer cancelled. Your files are kept for retry." } : item) }));
  }, [isCurrent, updateMemory]);
  const send = useCallback(async (projectId: string, input: ChatSendInput, clearDraft = false) => {
    if (!enabled || controllers.current.has(input.clientMessageId) || deniedRef.current.has(projectId)) return;
    const current = isCurrent(projectId);
    if (!current()) return;
    const old = memoryRef.current[projectId] ?? { draft: emptyChatDraft(), attempts: [] };
    let existing = old.attempts.find(item => item.input.clientMessageId === input.clientMessageId);
    if (existing && !existing.commitStarted && existing.files?.some(file => file.staged && new Date(file.staged.expiresAt).getTime() <= Date.now())) {
      const previousId = input.clientMessageId;
      existing = { ...existing, input: { ...existing.input, clientMessageId: crypto.randomUUID(), attachmentIds: [] } };
      input = existing.input;
      const replacement = existing;
      updateMemory(projectId, state => ({ ...state, attempts: state.attempts.map(item => item.input.clientMessageId === previousId ? replacement : item) }));
    }
    const controller = new AbortController();
    const run = { controller, projectId };
    controllers.current.set(input.clientMessageId, run);
    const valid = () => current() && !controller.signal.aborted && controllers.current.get(input.clientMessageId) === run;
    let attempt: ChatSendAttempt = existing ? { ...existing, status: "sending", error: undefined } : {
      input: { ...input, mentions: input.mentions.map(item => ({ ...item })) }, status: "sending", reply: old.draft.reply,
      files: (clearDraft ? old.draft.files : []).map(file => ({ ...file })), commitStarted: false
    };
    const publish = () => updateMemory(projectId, state => ({ ...state, attempts: state.attempts.map(item => item.input.clientMessageId === input.clientMessageId ? attempt : item) }));
    updateMemory(projectId, state => ({ draft: clearDraft ? emptyChatDraft() : state.draft, attempts: [...state.attempts.filter(item => item.input.clientMessageId !== input.clientMessageId), attempt] }));
    try {
      if (!attempt.commitStarted && attempt.files?.length) {
        const policy = await projectChatApi.attachmentPolicy(projectId, controller.signal);
        if (!valid()) return;
        if (!policy.enabled || !policy.capabilities.canUpload) throw new Error("Attachments are not currently available. Your files have not been sent.");
        pool.setLimit(policy.limits.maxConcurrentTransfers);
        if (attempt.files.length > policy.limits.maxAttachments || attempt.files.some(file => file.file.size > policy.limits.maxFileBytes) || attempt.files.reduce((total, file) => total + file.file.size, 0) > policy.limits.maxMessageBytes) throw new Error("The selected files exceed the current attachment limits. Edit the message to remove files.");
        attempt = { ...attempt, phase: "uploading" }; publish();
        const results = await Promise.allSettled(attempt.files!.map(async (file, index) => {
          if (file.staged && new Date(file.staged.expiresAt).getTime() > Date.now()) return;
          if (file.staged) file = { ...file, staged: undefined, clientUploadId: crypto.randomUUID() };
          const selected = file;
          const patch = (change: Partial<ChatLocalAttachment>) => {
            if (!valid()) return;
            attempt = { ...attempt, files: attempt.files!.map((item, position) => position === index ? { ...selected, ...item, clientUploadId: selected.clientUploadId, ...change } : item) }; publish();
          };
          patch({ staged: undefined, error: undefined, progress: 0 });
          try {
            const staged = await pool.run(() => projectChatApi.uploadAttachment(projectId, selected.clientUploadId, selected.file, progress => patch({ progress }), controller.signal), controller.signal);
            if (valid()) patch({ staged, progress: 100 });
          } catch (error) { patch({ error: chatErrorMessage(error) }); throw error; }
        }));
        if (!valid()) return;
        const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failed) throw failed.reason;
        if (attempt.files!.some(file => !file.staged)) throw new Error("Some files did not finish uploading. Retry before sending.");
        attempt = { ...attempt, input: { ...attempt.input, attachmentIds: attempt.files!.map(file => file.staged!.attachment.id) } };
      }
      if (!valid()) return;
      attempt = { ...attempt, phase: "committing", commitStarted: true }; publish();
      await projectChatApi.send(projectId, attempt.input, controller.signal);
      if (!valid()) return;
      removeAttempt(projectId, input.clientMessageId);
      await invalidate(projectId);
    } catch (error) {
      if (!valid()) return;
      if (isChatDenied(error)) await verifyAccess(projectId);
      if (!valid()) return;
      const unknownCommit = Boolean(attempt.commitStarted && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500));
      attempt = { ...attempt, status: "failed", commitStarted: unknownCommit, error: unknownCommit ? "Delivery is unconfirmed. Retry this same message to confirm it before editing or discarding." : error instanceof Error ? error.message : chatErrorMessage(error) }; publish();
    } finally { if (controllers.current.get(input.clientMessageId) === run) controllers.current.delete(input.clientMessageId); }
  }, [enabled, invalidate, isCurrent, pool, removeAttempt, updateMemory, verifyAccess]);

  const summary = useQuery({
    queryKey: chatKeys.summary(scope, currentProjectId ?? ""),
    queryFn: ({ signal }) => projectChatApi.summary(currentProjectId!, signal),
    enabled: enabled && Boolean(currentProjectId) && !denied.has(currentProjectId!),
    staleTime: 15_000, retry: (count, error) => !isChatDenied(error) && count < 1,
    refetchOnWindowFocus: true
  });
  useEffect(() => { if (currentProjectId && isChatDenied(summary.error)) revoke(currentProjectId); }, [currentProjectId, summary.error, revoke]);
  const cursor = useRef<string | undefined>(undefined);
  cursor.current = summary.data?.cursor;
  const ready = Boolean(summary.data);
  useEffect(() => {
    if (!enabled || !currentProjectId || denied.has(currentProjectId) || !ready || !cursor.current) return;
    const projectId = currentProjectId;
    const controller = new AbortController();
    const valid = isCurrent(projectId);
    let queued = false;
    let dirty = false;
    const refresh = () => {
      if (!valid() || controller.signal.aborted) return;
      if (queued) { dirty = true; return; }
      if (!queued) {
        queued = true;
        void invalidate(projectId).finally(() => {
          queued = false;
          if (dirty) { dirty = false; refresh(); }
        });
      }
    };
    const cachedHistory = queryClient.getQueryData<{ pages: ChatMessagePage[] }>(chatKeys.messages(scope, projectId, "all"));
    void runProjectChatStream({ projectId, cursor: cachedHistory?.pages[0]?.snapshotCursor ?? cursor.current, signal: controller.signal,
      onBatch: batch => { if (batch.resync || batch.events.length) refresh(); if (batch.resync || batch.events.some(event => event.type === "participants.changed")) void queryClient.invalidateQueries({ queryKey: [...chatKeys.project(scope, projectId), "attachment-policy"] }); },
      onStatus: state => { if (valid() && !controller.signal.aborted) { setConnection(state); if (state === "live") refresh(); } },
      onDenied: () => { if (valid()) revoke(projectId); }
    });
    const recover = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", recover); window.addEventListener("online", refresh);
    return () => { controller.abort(); document.removeEventListener("visibilitychange", recover); window.removeEventListener("online", refresh); };
  }, [currentProjectId, enabled, denied, ready, invalidate, isCurrent, queryClient, revoke, scope]);
  useEffect(() => {
    if (!currentProjectId || !enabled || denied.has(currentProjectId) || connection === "live") return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void invalidate(currentProjectId); }, 10_000);
    return () => clearInterval(timer);
  }, [connection, currentProjectId, denied, enabled, invalidate]);
  useEffect(() => () => {
    for (const [key, request] of controllers.current) if (request.projectId === currentProjectId) {
      request.controller.abort(); controllers.current.delete(key);
      updateMemory(request.projectId, old => ({ ...old, attempts: old.attempts.map(attempt => attempt.input.clientMessageId === key ? { ...attempt, status: "failed", error: "Delivery was interrupted. Retry safely to confirm delivery." } : attempt) }));
    }
  }, [currentProjectId, updateMemory]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const { controller } of controllers.current.values()) controller.abort();
      void queryClient.cancelQueries({ queryKey: chatKeys.root(scope) }).then(() => {
        if (!mounted.current) queryClient.removeQueries({ queryKey: chatKeys.root(scope) });
      });
    };
  }, [queryClient, scope]);

  const value = useMemo(() => ({ scope, enabled, userId, currentProjectId, connection, denied, register, revoke, verifyAccess, invalidate, isCurrent, memory, overview, rememberOverview, setDraft, send, removeAttempt, cancelAttempt, reconcileMessages, transfer, configureTransfers }), [scope, enabled, userId, currentProjectId, connection, denied, register, revoke, verifyAccess, invalidate, isCurrent, memory, overview, rememberOverview, setDraft, send, removeAttempt, cancelAttempt, reconcileMessages, transfer, configureTransfers]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useOptionalProjectChat() { return useContext(ChatContext); }
export function useProjectChat() {
  const value = useOptionalProjectChat();
  if (!value) throw new Error("ProjectChatProvider is required");
  return value;
}
export function useChatProjectRegistration(projectId: string) {
  const chat = useOptionalProjectChat();
  const register = chat?.register;
  useEffect(() => projectId && register ? register(projectId) : undefined, [projectId, register]);
}
