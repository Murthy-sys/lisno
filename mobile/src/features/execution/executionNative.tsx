import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, BackHandler, ScrollView, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { canPerformOperation, type ProtectedOperationKey } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { TransferHttpError } from "../../platform/files";
import { StateView } from "../../ui/primitives";
import { createVendorWorkApi } from "../vendor-work/vendorWorkApi";
import { createCompletionApi } from "../completion/completionApi";
import { createExecutionApi } from "./executionApi";
export { CommandFeedback, Panel, Pager, QueryState, Choice, money, errorText, p } from "../procurement/procurementNative";
import { p, useProcurementCommand } from "../procurement/procurementNative";

export function useDeliveryCommand(refresh: () => Promise<unknown>) {
  const command = useProcurementCommand(refresh);
  return { ...command, accessLost: unavailable(command.error) };
}

export function useDeliveryContext(session: AuthenticatedSession) {
  const runtime = useConfiguredRuntime(); const invalidate = useInvalidateEvent(); const client = useQueryClient();
  const http = runtime.runtime.api.authenticated;
  const api = useMemo(() => ({ execution: createExecutionApi(http), vendor: createVendorWorkApi(http), completion: createCompletionApi(http) }), [http]);
  const guards = useRef(new Map<symbol, { dirty: boolean; locked: boolean }>());
  const [, render] = useState(0);
  const register = useCallback((id: symbol, state: { dirty: boolean; locked: boolean } | null) => {
    const prior = guards.current.get(id);
    if (state ? prior?.dirty === state.dirty && prior.locked === state.locked : !prior) return;
    if (state) guards.current.set(id, state); else guards.current.delete(id);
    render(version => version + 1);
  }, []);
  const scope = { environmentId: runtime.environment.environment.id, userId: session.user.id };
  const refresh = async () => {
    await Promise.all([invalidate("procurement-changed"), client.invalidateQueries({ queryKey: privateQueryKey(scope, "operations", "delivery") }), client.invalidateQueries({ queryKey: privateQueryKey(scope, "kpi") })]);
  };
  return { ...api, http, session, transfers: runtime.runtime.transfers, ready: runtime.environment.status === "ready", register,
    environmentId: scope.environmentId, sessionGeneration: runtime.session.generation,
    scope: `${scope.environmentId}:${session.user.id}:${runtime.environment.generation}:${runtime.session.generation}`,
    key: (...parts: readonly unknown[]) => privateQueryKey(scope, "operations", "delivery", ...parts), refresh,
    can: (operation: ProtectedOperationKey) => canPerformOperation(session, operation),
    locked: [...guards.current.values()].some(state => state.locked),
    navigate: (action: () => void) => {
      const states = [...guards.current.values()];
      if (states.some(state => state.locked)) return Alert.alert("Request still being resolved", "Recover the current request before leaving this screen.");
      if (states.some(state => state.dirty)) return Alert.alert("Unsaved changes", "Discard your unsaved changes and continue?", [{ text: "Stay", style: "cancel" }, { text: "Discard and continue", style: "destructive", onPress: action }]);
      action();
    }
  };
}
export type DeliveryContext = ReturnType<typeof useDeliveryContext>;
export function useDeliveryGuard(c: DeliveryContext, dirty: boolean, locked: boolean) {
  const guard = useScaffoldNavigationGuard(); const owner = useRef(Symbol("delivery-form"));
  useEffect(() => { guard?.setBlocked(dirty || locked); return () => guard?.setBlocked(false); }, [guard, dirty, locked]);
  useEffect(() => { c.register(owner.current, { dirty, locked }); return () => c.register(owner.current, null); }, [c.register, dirty, locked]);
  useEffect(() => {
    if (!dirty && !locked) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => { Alert.alert(locked ? "Request still being resolved" : "Unsaved changes", locked ? "Recover the request before leaving." : "Save or discard your changes using the screen controls."); return true; });
    return () => listener.remove();
  }, [dirty, locked]);
}
export function DeliveryFrame({ embedded = false, children }: { embedded?: boolean; children: ReactNode }) { return embedded ? <View style={p.stack}>{children}</View> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={p.screen}>{children}</ScrollView>; }
export const unavailable = (error: unknown) => (error instanceof ApiError || error instanceof TransferHttpError) && [401, 403, 404].includes(error.status);
export function AccessLost({ title = "Details unavailable" }: { title?: string }) { return <StateView title={title} tone="denied" message="Your current account cannot access this record. Refresh your access before continuing." />; }
export const label = (value: string) => value.replaceAll("_", " ").replace(/^\w/u, character => character.toUpperCase());
export const dateTime = (value: string | null | undefined, timezone?: string) => {
  if (!value) return "Not recorded";
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return "Unavailable";
  try { return date.toLocaleString("en-IN", timezone ? { timeZone: timezone } : undefined); } catch { return date.toISOString(); }
};
export function ScopeMismatch() { return <Text accessibilityRole="alert" style={p.error}>The response does not match the selected record. Refresh before continuing.</Text>; }
