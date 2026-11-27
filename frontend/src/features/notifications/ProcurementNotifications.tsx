import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, tokenStorage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { procurementNotificationApi, procurementNotificationKeys, type ProcurementNotificationPage, type ProcurementNotification } from "./procurementNotificationApi";

const foreground = () => document.visibilityState === "visible" && navigator.onLine;
function subscribeForeground(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    document.removeEventListener("visibilitychange", listener);
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
const deniedError = (error: unknown) => error instanceof ApiError && [401, 403].includes(error.status);
interface ProcurementNotificationsContext {
  enabled: boolean; denied: boolean; active: boolean; unread: number;
  page?: ProcurementNotificationPage; recent?: ProcurementNotificationPage; loading: boolean; error: boolean;
  offset: number; setOffset: (offset: number) => void; refresh: () => void;
  reading: string | null; readError: string | null;
  read: (item: ProcurementNotification) => Promise<boolean>;
}
const Context = createContext<ProcurementNotificationsContext | null>(null);
export const useProcurementNotifications = () => useContext(Context);

export function ProcurementNotificationProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const token = tokenStorage.get();
  const enabled = auth.status === "authenticated" && ["super_admin", "procurement"].includes(auth.user?.role ?? "") && Boolean(token)
    && hasFrontendPermission(auth.authorization, "procurement.lifecycle.notifications.read");
  const identity = useMemo(() => crypto.randomUUID(), [auth.user?.id, enabled, token]);
  return <Session key={identity} enabled={enabled} token={token}>{children}</Session>;
}

function Session({ children, enabled, token }: { children: ReactNode; enabled: boolean; token: string | null }) {
  const client = useQueryClient();
  const visible = useSyncExternalStore(subscribeForeground, foreground);
  const [scope] = useState(() => crypto.randomUUID());
  const root = useMemo(() => procurementNotificationKeys.root(scope), [scope]);
  const [denied, setDenied] = useState(false);
  const [offset, setOffset] = useState(0);
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const current = () => mounted.current && tokenStorage.get() === token;
  const allowed = enabled && !denied;
  const active = allowed && visible;
  const options = { retry: false as const, staleTime: 30_000, gcTime: 0, refetchOnMount: "always" as const,
    refetchOnWindowFocus: "always" as const, refetchOnReconnect: "always" as const,
    refetchInterval: active ? 30_000 : false as const, refetchIntervalInBackground: false };
  const first = useQuery({ ...options, queryKey: procurementNotificationKeys.page(scope), queryFn: ({ signal }) => procurementNotificationApi.list(0, signal), enabled: active });
  const older = useQuery({ ...options, queryKey: procurementNotificationKeys.page(scope, offset), queryFn: ({ signal }) => procurementNotificationApi.list(offset, signal), enabled: active && offset > 0 });
  const query = offset ? older : first;
  const revoke = useCallback(() => {
    setDenied(true); setReadError(null); setReading(null); request.current?.abort();
    void client.cancelQueries({ queryKey: root }); client.removeQueries({ queryKey: root });
  }, [client, root]);
  useEffect(() => { if (deniedError(first.error) || deniedError(older.error)) revoke(); }, [first.error, older.error, revoke]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; request.current?.abort();
      void client.cancelQueries({ queryKey: root }); client.removeQueries({ queryKey: root });
    };
  }, [client, root]);
  // A visible tab may have missed several polling cycles while offline/backgrounded.
  useEffect(() => { if (active) void client.invalidateQueries({ queryKey: root }); }, [active, client, root]);
  const read = async (item: ProcurementNotification) => {
    if (!allowed || !current() || request.current) return false;
    const controller = new AbortController(); request.current = controller;
    setReading(item.id); setReadError(null);
    try {
      const updated = await procurementNotificationApi.read(item.id, controller.signal);
      if (!current() || controller.signal.aborted) return false;
      client.setQueriesData<ProcurementNotificationPage>({ queryKey: root }, page => page ? {
        ...page, items: page.items.map(row => row.id === updated.id ? { ...row, readAt: updated.readAt } : row)
      } : page);
      await client.invalidateQueries({ queryKey: root });
      return current() && !controller.signal.aborted;
    } catch (error) {
      if (!current() || controller.signal.aborted) return false;
      if (deniedError(error)) revoke();
      else if (error instanceof ApiError && error.status === 404) {
        client.setQueriesData<ProcurementNotificationPage>({ queryKey: root }, page => page ? {
          ...page, items: page.items.filter(row => row.id !== item.id)
        } : page);
        setReadError("This Procurement alert is no longer available.");
        void client.invalidateQueries({ queryKey: root });
      } else setReadError("Could not open this alert. Please try again.");
      return false;
    } finally {
      request.current = null;
      if (current()) setReading(null);
    }
  };
  return <Context.Provider value={{ enabled, denied, active, page: allowed ? query.data : undefined, recent: allowed ? first.data : undefined,
    unread: allowed ? first.data?.unreadCount ?? 0 : 0, loading: active && query.isPending,
    error: allowed && query.isError && !deniedError(query.error), offset, setOffset,
    refresh: () => { if (allowed) void client.invalidateQueries({ queryKey: root }); }, reading, readError, read }}>{children}</Context.Provider>;
}

