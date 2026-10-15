import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation, type ProtectedOperationKey } from "../../core/session/operationCapabilities";
import { TransferHttpError } from "../../platform/files";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button, StateView } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { createProcurementBasketApi } from "./procurementBasketApi";
import { createPurchaseOrderApi } from "./purchaseOrderApi";
import { createProjectProcurementApi } from "./projectProcurementApi";
import { createVendorSuggestionsApi } from "./vendorSuggestionsApi";

export const money = (paise: number | null | undefined) => paise == null ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
export const amountInput = (paise: number | null | undefined) => paise == null ? "" : (paise / 100).toFixed(2);
export function decimalUnits(value: string, scale = 3): number | null {
  const normalized = value.trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`).test(normalized)) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 10 ** scale + Number(fraction.padEnd(scale, "0"));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
export const denied = (error: unknown) => (error instanceof ApiError || error instanceof TransferHttpError) && (error.status === 401 || error.status === 403);
export const errorText = (error: unknown) => error instanceof Error ? error.message : "This operation could not be completed.";
export function useProcurementContext(session: AuthenticatedSession) {
  const runtime = useConfiguredRuntime(); const invalidate = useInvalidateEvent();
  const http = runtime.runtime.api.authenticated;
  const guards = useRef(new Map<symbol, { dirty: boolean; locked: boolean }>());
  const [, render] = useState(0);
  const register = useCallback((id: symbol, state: { dirty: boolean; locked: boolean } | null) => {
    const previous = guards.current.get(id);
    if (state ? previous?.dirty === state.dirty && previous.locked === state.locked : !previous) return;
    if (state) guards.current.set(id, state); else guards.current.delete(id);
    render(value => value + 1);
  }, []);
  const api = useMemo(() => ({ baskets: createProcurementBasketApi(http), orders: createPurchaseOrderApi(http), items: createProjectProcurementApi(http), suggestions: createVendorSuggestionsApi(http) }), [http]);
  return { ...api, http, transfers: runtime.runtime.transfers, session,
    guards, register, locked: [...guards.current.values()].some(state => state.locked),
    navigate: (action: () => void) => {
      const states = [...guards.current.values()];
      if (states.some(state => state.locked)) { Alert.alert("Request still being resolved", "Finish or recover the current request before leaving this screen."); return; }
      if (states.some(state => state.dirty)) { Alert.alert("Unsaved procurement changes", "Discard these unsaved changes and continue?", [{ text: "Stay", style: "cancel" }, { text: "Discard and continue", style: "destructive", onPress: action }]); return; }
      action();
    },
    ready: runtime.environment.status === "ready",
    scope: `${runtime.environment.environment.id}:${session.user.id}:${runtime.environment.generation}:${runtime.session.generation}`,
    key: (...parts: readonly unknown[]) => privateQueryKey({ environmentId: runtime.environment.environment.id, userId: session.user.id }, "procurement", ...parts),
    can: (operation: ProtectedOperationKey) => canPerformOperation(session, operation),
    refresh: () => invalidate("procurement-changed") };
}
export function useProcurementFormGuard(context: ProcurementContext, dirty: boolean, locked: boolean) {
  const scaffoldGuard = useScaffoldNavigationGuard();
  useEffect(() => { scaffoldGuard?.setBlocked(dirty || locked); return () => scaffoldGuard?.setBlocked(false); }, [scaffoldGuard, dirty, locked]);
  const id = useRef(Symbol("procurement-draft"));
  useEffect(() => { context.register(id.current, { dirty, locked }); return () => context.register(id.current, null); }, [context.register, dirty, locked]);
  useEffect(() => { if (!dirty && !locked) return; const listener = BackHandler.addEventListener("hardwareBackPress", () => { Alert.alert(locked ? "Request still being resolved" : "Unsaved procurement changes", locked ? "Finish or recover the request before leaving." : "Save your changes or use the screen controls to discard them."); return true; }); return () => listener.remove(); }, [dirty, locked]);
}
export type ProcurementContext = ReturnType<typeof useProcurementContext>;

/** Keep a command's owning form mounted while a background read observes its commit.
 * Authorization denial always takes precedence over the retained private view. */
export function useProcurementView<T extends { data: unknown; isPending: boolean; isError: boolean; error: unknown }>(query: T, context: ProcurementContext): T {
  const previous = useRef<T["data"]>(query.data);
  const unavailable = (query.error instanceof ApiError || query.error instanceof TransferHttpError) && [401, 403, 404].includes(query.error.status);
  if (unavailable) previous.current = undefined;
  else if (!context.locked && !query.isError) previous.current = query.data;
  return context.locked && !unavailable && previous.current !== undefined
    ? { ...query, data: previous.current, isPending: false, isError: false } : query;
}

/** An uncertain mutation retains its exact closure and request identity until recovered. */
export function useProcurementCommand(refresh: () => Promise<unknown>) {
  const [pending, setPending] = useState(false); const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState(""); const [uncertain, setUncertain] = useState(false); const [conflict, setConflict] = useState(false);
  const retry = useRef<null | (() => Promise<void>)>(null); const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function execute<T>(action: () => Promise<T>, success?: (value: T) => void, idempotent = true) {
    if (working.current || retry.current) return;
    const attempt = async () => {
      if (working.current || !alive.current) return;
      working.current = true; setPending(true); setError(null); setNotice("");
      let saved = false;
      try { const value = await action(); if (!alive.current) return; success?.(value); saved = true; retry.current = null; setUncertain(false); setConflict(false); setNotice("Saved."); }
      catch (cause) { if (alive.current) { setError(cause); const known = (cause instanceof ApiError || cause instanceof TransferHttpError) && cause.status >= 400 && cause.status < 500 && cause.status !== 408; setUncertain(!known); setConflict((cause instanceof ApiError || cause instanceof TransferHttpError) && cause.status === 409); retry.current = !known && idempotent ? attempt : null; } }
      finally { working.current = false; if (alive.current) setPending(false); }
      if (saved) { try { await refresh(); } catch { setNotice("Saved. Refresh the view to load the latest information."); } }
    };
    await attempt();
  }
  return { execute, pending, error, notice, uncertain, conflict, locked: pending || uncertain || conflict, accessLost: denied(error), canRetry: Boolean(retry.current), retry: () => retry.current?.(), reload: async () => { await refresh(); setConflict(false); setError(null); if (!retry.current) setUncertain(false); }, validation: (message: string) => { setError(new Error(message)); } };
}
export function CommandFeedback({ command }: { command: ReturnType<typeof useProcurementCommand> }) {
  return <View style={p.stack}>{command.error ? <Text accessibilityLiveRegion="assertive" style={p.error}>{errorText(command.error)}{command.conflict ? " Refresh to review the current version." : command.uncertain ? " The result is not confirmed. Do not create another request." : ""}</Text> : null}{command.notice ? <Text accessibilityLiveRegion="polite" style={p.copy}>{command.notice}</Text> : null}{command.canRetry ? <Button label="Retry same request" disabled={command.pending} onPress={() => void command.retry()} /> : command.conflict || command.uncertain ? <Button label="Reload current data" variant="secondary" onPress={() => void command.reload()} /> : null}</View>;
}
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <View style={p.panel}><Text accessibilityRole="header" style={p.heading}>{title}</Text>{children}</View>; }
export function Choice({ label, checked, onPress, disabled = false, radio = false }: { label: string; checked: boolean; onPress: () => void; disabled?: boolean; radio?: boolean }) { return <Pressable accessibilityRole={radio ? "radio" : "checkbox"} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress} style={[p.choice, checked && p.selected]}><Text style={p.copy}>{checked ? "Selected · " : ""}{label}</Text></Pressable>; }
export function QueryState({ query, title }: { query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => Promise<unknown> }; title: string }) { return query.isPending ? <Text style={p.copy}>Loading {title.toLowerCase()}…</Text> : query.isError ? <StateView title={`${title} unavailable`} message={errorText(query.error)} tone={denied(query.error) ? "denied" : "error"} actionLabel="Retry" onAction={() => void query.refetch()} /> : null; }
export function Pager({ offset, total, limit = 50, onChange }: { offset: number; total: number; limit?: number; onChange: (offset: number) => void }) { return total > limit ? <View style={p.row}><Button label="Previous page" variant="secondary" disabled={!offset} onPress={() => onChange(Math.max(0, offset - limit))} /><Text style={p.copy}>{offset + 1}–{Math.min(offset + limit, total)} of {total}</Text><Button label="Next page" variant="secondary" disabled={offset + limit >= total} onPress={() => onChange(offset + limit)} /></View> : null; }
export const p = StyleSheet.create({ screen: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg, backgroundColor: colors.canvas }, stack: { gap: spacing.sm }, panel: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm }, heading: { fontFamily: fonts.semibold, fontSize: 19, color: colors.ink }, title: { fontFamily: fonts.semibold, fontSize: 25, color: colors.ink }, copy: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.inkMuted }, strong: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }, error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger }, row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" }, choice: { minHeight: 48, borderWidth: 1, borderColor: colors.border, padding: spacing.sm }, selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft } });
