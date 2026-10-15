import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, BackHandler, ScrollView, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthenticatedSession } from "../../contracts/session";
import { TransferHttpError } from "../../platform/files";
import { ApiError } from "../../core/http/apiClient";
import type { QueryFamily } from "../../core/query/invalidationRegistry";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation, type ProtectedOperationKey } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { Button } from "../../ui/primitives";
import { KnowledgeCard, KnowledgeDetailProvider, KnowledgeText, knowledgeStyles } from "../knowledge/knowledgeDetailUi";

export { Button, Field } from "../../ui/primitives";
export { KnowledgeCard as Panel, KnowledgeSelect as Select, KnowledgeText as Copy, knowledgeStyles as styles } from "../knowledge/knowledgeDetailUi";
export const failure = (error: unknown) => error instanceof Error ? error.message : "This request could not be completed.";
export const denied = (error: unknown) => (error instanceof ApiError || error instanceof TransferHttpError) && [401, 403, 404].includes(error.status);
export const uncertain = (error: unknown) => !((error instanceof ApiError || error instanceof TransferHttpError) && error.status >= 400 && error.status < 500 && error.status !== 408);
export function useNativeWorkspace(session: AuthenticatedSession, family: QueryFamily) {
  const runtime = useConfiguredRuntime(); const client = useQueryClient();
  const guards = useRef(new Map<symbol, { dirty: boolean; locked: boolean }>());
  const identity = { environmentId: runtime.environment.environment.id, userId: session.user.id };
  return { session, http: runtime.runtime.api.authenticated, transfers: runtime.runtime.transfers, guards,
    navigate: (action: () => void) => { const states = [...guards.current.values()]; if (states.some(state => state.locked)) { Alert.alert("Request not confirmed", "Resolve the current request before leaving."); return; } if (states.some(state => state.dirty)) Alert.alert("Unsaved changes", "Discard these changes and continue?", [{ text: "Stay", style: "cancel" }, { text: "Discard", style: "destructive", onPress: action }]); else action(); },
    scope: `${identity.environmentId}:${session.user.id}:${runtime.environment.generation}:${runtime.session.generation}`,
    ready: runtime.environment.status === "ready", key: (...parts: unknown[]) => privateQueryKey(identity, family, ...parts),
    can: (operation: ProtectedOperationKey) => canPerformOperation(session, operation),
    refresh: () => client.invalidateQueries({ predicate: query => query.queryKey[0] === identity.environmentId && query.queryKey[1] === session.user.id }) };
}
export type NativeContext = ReturnType<typeof useNativeWorkspace>;
export function Workspace({ children }: { children: ReactNode }) { return <KnowledgeDetailProvider><ScrollView contentContainerStyle={knowledgeStyles.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView></KnowledgeDetailProvider>; }
export function QueryState({ query, title }: { query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => Promise<unknown> }; title: string }) { return query.isPending ? <KnowledgeText>Loading {title.toLowerCase()}…</KnowledgeText> : query.isError ? <KnowledgeCard title={`${title} unavailable`}><KnowledgeText error>{failure(query.error)}</KnowledgeText><Button label={`Retry ${title.toLowerCase()}`} variant="secondary" onPress={() => void query.refetch()} /></KnowledgeCard> : null; }
export function Pager({ offset, total, limit = 20, onChange }: { offset: number; total: number; limit?: number; onChange: (value: number) => void }) { return <View style={knowledgeStyles.row}><KnowledgeText>{total === 0 ? "0 results" : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}</KnowledgeText><Button label="Previous page" variant="secondary" disabled={offset === 0} onPress={() => onChange(Math.max(0, offset - limit))} /><Button label="Next page" variant="secondary" disabled={offset + limit >= total} onPress={() => onChange(offset + limit)} /></View>; }
export function useDraftGuard(dirty: boolean, locked: boolean, context?: NativeContext) {
  const guard = useScaffoldNavigationGuard();
  const owner = useRef(Symbol("native-draft"));
  useEffect(() => { context?.guards.current.set(owner.current, { dirty, locked }); return () => { context?.guards.current.delete(owner.current); }; }, [context?.guards, dirty, locked]);
  useEffect(() => { guard?.setBlocked(dirty || locked); return () => guard?.setBlocked(false); }, [guard, dirty, locked]);
  useEffect(() => { if (!dirty && !locked) return; const listener = BackHandler.addEventListener("hardwareBackPress", () => { Alert.alert(locked ? "Request not confirmed" : "Unsaved changes", locked ? "Resolve the current request before leaving." : "Save or discard your changes using the screen controls."); return true; }); return () => listener.remove(); }, [dirty, locked]);
  return (next: () => void) => { if (locked) return; if (!dirty) next(); else Alert.alert("Unsaved changes", "Discard your changes and continue?", [{ text: "Stay", style: "cancel" }, { text: "Discard", style: "destructive", onPress: next }]); };
}
/** Captures the exact command through uncertain responses. Version conflicts require an explicit fresh read. */
export function useNativeCommand(refresh: () => Promise<unknown>) {
  const alive = useRef(true); const working = useRef(false); const retry = useRef<(() => Promise<void>) | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [unknown, setUnknown] = useState(false); const [conflict, setConflict] = useState(false); const [notice, setNotice] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function execute<T>(work: () => Promise<T>, saved?: (value: T) => void, retryable = true) {
    if (working.current || retry.current) return;
    const run = async () => { if (working.current || !alive.current) return; working.current = true; setBusy(true); setError(null); let success = false;
      try { const value = await work(); if (!alive.current) return; saved?.(value); success = true; retry.current = null; setUnknown(false); setConflict(false); setNotice("Saved."); }
      catch (cause) { if (alive.current) { setError(cause); setUnknown(uncertain(cause)); setConflict((cause instanceof ApiError || cause instanceof TransferHttpError) && cause.status === 409); retry.current = uncertain(cause) && retryable ? run : null; } }
      finally { working.current = false; if (alive.current) setBusy(false); }
      if (success) await refresh().catch(() => { if (alive.current) setNotice("Saved. Refresh to load current information."); });
    }; await run();
  }
  return { execute, busy, unknown, conflict, notice, error, accessLost: denied(error), locked: busy || unknown || conflict, validation: (message: string) => setError(new Error(message)), canRetry: Boolean(retry.current), retry: () => retry.current?.(), reload: async () => { if (retry.current || working.current) return; await refresh(); if (alive.current) { setUnknown(false); setConflict(false); setError(null); } } };
}
export function CommandState({ command }: { command: ReturnType<typeof useNativeCommand> }) { return <>{command.error ? <KnowledgeText error>{failure(command.error)}{command.unknown ? " The result is not confirmed. Resolve this request before making another change." : command.conflict ? " Reload and review the current saved version before continuing." : ""}</KnowledgeText> : null}{command.notice ? <KnowledgeText>{command.notice}</KnowledgeText> : null}{command.canRetry ? <Button label="Retry same request" disabled={command.busy} onPress={() => void command.retry()} /> : command.conflict || command.unknown ? <Button label="Reload current data" variant="secondary" onPress={() => void command.reload()} /> : null}</>; }
