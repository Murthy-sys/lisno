import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, tokenStorage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { notificationApi, notificationDenied, notificationKeys, type NotificationPage, type ProjectNotification } from "./notificationApi";
import { runNotificationStream, type NotificationConnection } from "./notificationStream";

import { ExecutionNotificationProvider } from "./ExecutionNotifications";

const foreground = () => document.visibilityState === "visible" && navigator.onLine;
const alertKey = (item: ProjectNotification) => JSON.stringify(item.routing ? [item.id, item.routing.messageVersion] : [item.id]);
const alertTime = (item: ProjectNotification) => Date.parse(item.routing?.lastAlertAt ?? item.createdAt);
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
interface NotificationsContextValue {
  scope: string;
  enabled: boolean;
  active: boolean;
  denied: boolean;
  page?: NotificationPage;
  loading: boolean;
  error: boolean;
  connection: NotificationConnection;
  banners: ProjectNotification[];
  dismiss: (id: string) => void;
  retry: () => void;
  read: (item: ProjectNotification) => Promise<boolean>;
  readError: string | null;
  reading: ReadonlySet<string>;
}
const NotificationsContext = createContext<NotificationsContextValue | null>(null);
export const useNotifications = () => useContext(NotificationsContext);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const token = tokenStorage.get();
  const enabled = auth.status === "authenticated" && Boolean(auth.user && token) && hasFrontendPermission(auth.authorization, "chat.read");
  const identity = useMemo(() => crypto.randomUUID(), [auth.user?.id, enabled, token]);
  return <ExecutionNotificationProvider><NotificationSession key={identity} enabled={enabled} sessionToken={token}>{children}</NotificationSession></ExecutionNotificationProvider>;
}

function NotificationSession({ children, enabled, sessionToken }: { children: ReactNode; enabled: boolean; sessionToken: string | null }) {
  const queryClient = useQueryClient();
  const [scope] = useState(() => crypto.randomUUID());
  const visible = useSyncExternalStore(subscribeForeground, foreground);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [connection, setConnection] = useState<NotificationConnection>("connecting");
  const [banners, setBanners] = useState<ProjectNotification[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState<Set<string>>(new Set());
  const [retryVersion, setRetryVersion] = useState(0);
  const initialized = useRef(false);
  const seen = useRef(new Set<string>());
  const latestAlertAt = useRef(0);
  const snapshotRevision = useRef(0);
  const httpRequestVersion = useRef(0);
  const requests = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const current = useCallback(() => mounted.current && tokenStorage.get() === sessionToken, [sessionToken]);
  const active = enabled && visible && !denied;
  const pageQuery = useQuery<NotificationPage>({ queryKey: notificationKeys.page(scope), queryFn: ({ signal }) => notificationApi.list(0, signal), enabled: false, staleTime: Infinity });

  const dismiss = useCallback((id: string) => setBanners(items => items.filter(item => item.id !== id)), []);
  const dismissAlert = useCallback((item: ProjectNotification) => setBanners(items => items.filter(next => alertKey(next) !== alertKey(item))), []);
  const revoke = useCallback(() => {
    if (!current()) return;
    setDenied(true); setBanners([]); setReadError(null); setReading(new Set()); setLoading(false);
    for (const controller of requests.current.values()) controller.abort();
    void queryClient.cancelQueries({ queryKey: notificationKeys.root(scope) });
    queryClient.removeQueries({ queryKey: notificationKeys.root(scope) });
  }, [current, queryClient, scope]);
  const accept = useCallback((page: NotificationPage) => {
    if (!current()) return;
    snapshotRevision.current += 1;
    const additions = initialized.current ? page.items.filter(item => !item.readAt && !seen.current.has(alertKey(item)) && alertTime(item) >= latestAlertAt.current) : [];
    for (const item of page.items) { seen.current.add(alertKey(item)); latestAlertAt.current = Math.max(latestAlertAt.current, alertTime(item)); }
    // Reconnects carry a complete current snapshot. Keep deduplication bounded.
    if (seen.current.size > 2000) seen.current = new Set([...seen.current].slice(-1000));
    initialized.current = true;
    queryClient.setQueryData(notificationKeys.page(scope), page);
    const unread = new Map(page.items.filter(item => !item.readAt).map(item => [item.id, item]));
    const addedIds = new Set(additions.map(item => item.id));
    setBanners(existing => [...additions, ...existing.flatMap(item => {
      const latest = unread.get(item.id);
      // A routed escalation reuses its row ID. Refresh retained content, and
      // keep only one banner when that new logical alert was just announced.
      return latest && !addedIds.has(latest.id) ? [latest] : [];
    })].slice(0, 3));
    setLoading(false); setError(false);
    // Membership revocation can also remove older-page entries. Clear stale
    // excerpts immediately; fetch replacement content only for an open drawer.
    void queryClient.resetQueries({ queryKey: notificationKeys.root(scope), predicate: query => query.queryKey[2] !== 0 });
  }, [current, queryClient, scope]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const controller of requests.current.values()) controller.abort();
      void queryClient.cancelQueries({ queryKey: notificationKeys.root(scope) });
      queryClient.removeQueries({ queryKey: notificationKeys.root(scope) });
    };
  }, [queryClient, scope]);

  useEffect(() => {
    if (!active) {
      setConnection(denied ? "denied" : "paused");
      setLoading(false);
      for (const controller of requests.current.values()) controller.abort();
      void queryClient.cancelQueries({ queryKey: notificationKeys.root(scope) });
      return;
    }
    const controller = new AbortController();
    const valid = () => current() && !controller.signal.aborted;
    void (async () => {
      // Seed the seen IDs before connecting so the stream's first snapshot can
      // announce a mention which arrived between the HTTP response and connection.
      if (!initialized.current || retryVersion > 0) {
        setLoading(true);
        const revision = snapshotRevision.current;
        const requestVersion = ++httpRequestVersion.current;
        try {
          const page = await notificationApi.list(0, controller.signal);
          if (!valid()) return;
          if (revision === snapshotRevision.current && requestVersion === httpRequestVersion.current) accept(page);
        } catch (failure) {
          if (!valid()) return;
          if (revision === snapshotRevision.current && requestVersion === httpRequestVersion.current) {
            if (notificationDenied(failure)) { revoke(); return; }
            setError(true);
          }
        }
        if (valid()) setLoading(false);
      }
      if (!valid()) return;
      await runNotificationStream({
        signal: controller.signal,
        onSnapshot: page => { if (valid()) accept(page); },
        onDailyCriticalTasks: () => { if (valid()) void queryClient.invalidateQueries({ queryKey: ["daily-critical-tasks"] }); },
        onStatus: status => { if (valid()) setConnection(status); },
        onDenied: () => { if (valid()) revoke(); }
      });
    })();
    return () => controller.abort();
  }, [accept, active, current, denied, queryClient, retryVersion, revoke, scope]);

  const read = useCallback(async (item: ProjectNotification) => {
    if (!current() || denied || !enabled || requests.current.has(item.id)) return false;
    if (item.readAt) { dismissAlert(item); return true; }
    const controller = new AbortController();
    requests.current.set(item.id, controller);
    setReading(new Set(requests.current.keys())); setReadError(null);
    try {
      const updated = await notificationApi.read(item.id, item.routing?.messageVersion, controller.signal);
      if (!current() || controller.signal.aborted) return false;
      queryClient.setQueriesData<NotificationPage>({ queryKey: notificationKeys.root(scope) }, page => page ? {
        ...page,
        items: page.items.map(next => alertKey(next) === alertKey(updated) ? updated : next)
      } : page);
      dismissAlert(updated);
      // A snapshot can arrive before the PUT resolves, especially for an older
      // page. Reconcile the authoritative count instead of decrementing twice.
      const revision = snapshotRevision.current;
      const requestVersion = ++httpRequestVersion.current;
      try {
        const page = await notificationApi.list(0, controller.signal);
        if (!current() || controller.signal.aborted) return false;
        if (revision === snapshotRevision.current && requestVersion === httpRequestVersion.current) accept(page);
      } catch (failure) {
        if (!current() || controller.signal.aborted) return false;
        if (revision === snapshotRevision.current && requestVersion === httpRequestVersion.current) {
          if (notificationDenied(failure)) { revoke(); return false; }
          setError(true);
        }
      }
      return true;
    } catch (failure) {
      if (current() && !controller.signal.aborted) {
        if (notificationDenied(failure)) revoke();
        else if (failure instanceof ApiError && failure.status === 409) {
          setReadError("This notification changed. Review the latest alert before opening it.");
          const revision = snapshotRevision.current;
          const requestVersion = ++httpRequestVersion.current;
          try {
            const page = await notificationApi.list(0, controller.signal);
            if (current() && !controller.signal.aborted && revision === snapshotRevision.current && requestVersion === httpRequestVersion.current) accept(page);
          } catch (refreshFailure) {
            if (current() && !controller.signal.aborted && revision === snapshotRevision.current && requestVersion === httpRequestVersion.current) {
              if (notificationDenied(refreshFailure)) revoke();
              else setError(true);
            }
          }
        } else if (failure instanceof ApiError && failure.status === 404) {
          dismiss(item.id);
          queryClient.setQueriesData<NotificationPage>({ queryKey: notificationKeys.root(scope) }, page => page ? { ...page, items: page.items.filter(next => next.id !== item.id) } : page);
          setReadError("This notification is no longer available.");
          const revision = snapshotRevision.current;
          const requestVersion = ++httpRequestVersion.current;
          try {
            const page = await notificationApi.list(0, controller.signal);
            if (current() && !controller.signal.aborted && revision === snapshotRevision.current && requestVersion === httpRequestVersion.current) accept(page);
          } catch (refreshFailure) {
            if (current() && !controller.signal.aborted && revision === snapshotRevision.current && requestVersion === httpRequestVersion.current) {
              if (notificationDenied(refreshFailure)) revoke();
              else setError(true);
            }
          }
        } else setReadError("Could not open this notification. Please try again.");
      }
      return false;
    } finally {
      requests.current.delete(item.id);
      if (current()) setReading(new Set(requests.current.keys()));
    }
  }, [accept, current, denied, dismiss, dismissAlert, enabled, queryClient, revoke, scope]);

  return <NotificationsContext.Provider value={{ scope, enabled, active, denied, page: denied ? undefined : pageQuery.data, loading, error, connection,
    banners, dismiss, retry: () => setRetryVersion(value => value + 1), read, readError, reading }}>{children}</NotificationsContext.Provider>;
}
