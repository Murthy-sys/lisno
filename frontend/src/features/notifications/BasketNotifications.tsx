import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, tokenStorage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { basketNotificationApi, basketNotificationKeys, basketNotificationPath, basketNotificationTitle, type BasketNotificationPage, type BasketRequestNotification } from "./basketNotificationApi";

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
interface BasketNotificationsContext {
  enabled: boolean; denied: boolean; active: boolean; unread: number;
  page?: BasketNotificationPage; loading: boolean; error: boolean;
  offset: number; setOffset: (offset: number) => void; refresh: () => void;
  reading: string | null; readError: string | null;
  read: (item: BasketRequestNotification) => Promise<boolean>;
}
const Context = createContext<BasketNotificationsContext | null>(null);
export const useBasketNotifications = () => useContext(Context);

export function BasketNotificationProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const token = tokenStorage.get();
  const enabled = auth.status === "authenticated" && auth.user?.role === "super_admin" && Boolean(token)
    && hasFrontendPermission(auth.authorization, "ai_estimator_knowledge.configuration.read");
  const identity = useMemo(() => crypto.randomUUID(), [auth.user?.id, enabled, token]);
  return <Session key={identity} enabled={enabled} token={token}>{children}</Session>;
}

function Session({ children, enabled, token }: { children: ReactNode; enabled: boolean; token: string | null }) {
  const client = useQueryClient();
  const visible = useSyncExternalStore(subscribeForeground, foreground);
  const [scope] = useState(() => crypto.randomUUID());
  const root = useMemo(() => basketNotificationKeys.root(scope), [scope]);
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
  const first = useQuery({ ...options, queryKey: basketNotificationKeys.page(scope), queryFn: ({ signal }) => basketNotificationApi.list(0, signal), enabled: active });
  const older = useQuery({ ...options, queryKey: basketNotificationKeys.page(scope, offset), queryFn: ({ signal }) => basketNotificationApi.list(offset, signal), enabled: active && offset > 0 });
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
  const read = async (item: BasketRequestNotification) => {
    if (!allowed || !current() || request.current) return false;
    const controller = new AbortController(); request.current = controller;
    setReading(item.id); setReadError(null);
    try {
      const updated = await basketNotificationApi.read(item.id, controller.signal);
      if (!current() || controller.signal.aborted) return false;
      client.setQueriesData<BasketNotificationPage>({ queryKey: root }, page => page ? {
        ...page, items: page.items.map(row => row.id === updated.id ? updated : row)
      } : page);
      await client.invalidateQueries({ queryKey: root });
      return current() && !controller.signal.aborted;
    } catch (error) {
      if (!current() || controller.signal.aborted) return false;
      if (deniedError(error)) revoke();
      else if (error instanceof ApiError && error.status === 404) {
        client.setQueriesData<BasketNotificationPage>({ queryKey: root }, page => page ? {
          ...page, items: page.items.filter(row => row.id !== item.id)
        } : page);
        setReadError("This request notification is no longer available.");
        void client.invalidateQueries({ queryKey: root });
      } else setReadError("Could not open this request. Please try again.");
      return false;
    } finally {
      request.current = null;
      if (current()) setReading(null);
    }
  };
  return <Context.Provider value={{ enabled, denied, active, page: allowed ? query.data : undefined,
    unread: allowed ? first.data?.unreadCount ?? 0 : 0, loading: active && query.isPending,
    error: allowed && query.isError && !deniedError(query.error), offset, setOffset,
    refresh: () => { if (allowed) void client.invalidateQueries({ queryKey: root }); }, reading, readError, read }}>{children}</Context.Provider>;
}

const timestamp = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
export function BasketNotificationInbox({ onNavigate }: { onNavigate: (path: string) => void }) {
  const notifications = useBasketNotifications();
  if (!notifications) return null;
  const { page, offset, loading } = notifications;
  const select = async (item: BasketRequestNotification) => {
    if (await notifications.read(item)) onNavigate(basketNotificationPath(item));
  };
  return <>
    <p className="notification-state">Opening a notification marks it read. Requests still need a separate review and decision.</p>
    {loading ? <p role="status" className="notification-state">Loading basket requests…</p> : null}
    {!notifications.active ? <p role="status" className="notification-state">Updates resume when this window is active and online.</p> : null}
    {notifications.error ? <div role="alert" className="notification-state notification-state--error">{page ? "Notifications may be out of date. " : "Basket notifications could not be loaded. "}<button type="button" onClick={notifications.refresh}>Try again</button></div> : null}
    {notifications.readError ? <p role="alert" className="notification-state notification-state--error">{notifications.readError}</p> : null}
    {page && !page.items.length ? <div className="notification-empty"><p>{offset ? "No older basket notifications" : "No basket notifications yet"}</p><span>New Main Basket and Sub-Basket submissions appear here.</span></div> : null}
    <ul className="notification-list">
      {page?.items.map(item => <li key={item.id}><button type="button"
        className={`notification-item${item.readAt ? "" : " notification-item--unread"}`}
        aria-label={`${basketNotificationTitle(item)}${item.readAt ? "" : ", unread"}. Open request`}
        disabled={notifications.reading !== null} aria-busy={notifications.reading === item.id || undefined}
        onClick={() => void select(item)}>
        <span className="notification-item__body"><strong>{basketNotificationTitle(item)}</strong>
          <span className="notification-item__excerpt">{item.requester.name}{item.vendorName ? ` · ${item.vendorName}` : ""}{item.target.kind === "new_sub_basket" && item.targetParentName ? ` · ${item.targetParentName}` : ""}</span>
          <span>{item.status === "pending" ? "Awaiting review" : item.status === "fulfilled" ? "Approved" : "Rejected"}</span>
          <time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time>
        </span>
      </button></li>)}
    </ul>
    {page && (offset > 0 || page.pagination.hasMore) ? <nav className="notification-pagination" aria-label="Basket notification pages">
      <button type="button" disabled={offset === 0 || loading} onClick={() => notifications.setOffset(Math.max(0, offset - 20))}>Newer</button>
      <span>Page {Math.floor(offset / 20) + 1}</span>
      <button type="button" disabled={!page.pagination.hasMore || loading} onClick={() => notifications.setOffset(offset + 20)}>Older</button>
    </nav> : null}
  </>;
}
