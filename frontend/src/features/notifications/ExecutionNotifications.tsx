import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, tokenStorage } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { executionApi, executionKeys, type ExecutionNotificationDto, type ExecutionNotificationPage } from "../execution/executionApi";
import { useExecutionConnection } from "../execution/ExecutionLiveProvider";

interface ExecutionNotificationsContext {
  enabled: boolean; denied: boolean; scope: string; role: string | undefined;
  page?: ExecutionNotificationPage; loading: boolean; error: boolean; unread: number;
  offset: number; setOffset: (offset: number) => void; retry: () => void;
  reading: string | null; readError: string | null; read: (item: ExecutionNotificationDto) => Promise<boolean>;
}
const Context = createContext<ExecutionNotificationsContext | null>(null);
export const useExecutionNotifications = () => useContext(Context);
const deniedError = (error: unknown) => error instanceof ApiError && [401, 403].includes(error.status);

export function ExecutionNotificationProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const token = tokenStorage.get();
  const enabled = auth.status === "authenticated" && Boolean(token) && hasFrontendPermission(auth.authorization, "execution.notifications.read");
  const identity = useMemo(() => crypto.randomUUID(), [auth.user?.id, enabled, token]);
  return <Session key={identity} enabled={enabled} token={token} role={auth.user?.role}>{children}</Session>;
}
function Session({ children, enabled, token, role }: { children: ReactNode; enabled: boolean; token: string | null; role: string | undefined }) {
  const client = useQueryClient();
  const connection = useExecutionConnection();
  const [scope] = useState(() => crypto.randomUUID());
  const root = useMemo(() => [...executionKeys.notifications, scope], [scope]);
  const [denied, setDenied] = useState(false);
  const [offset, setOffset] = useState(0);
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const valid = () => mounted.current && tokenStorage.get() === token;
  const active = enabled && !denied && connection !== "denied";
  const first = useQuery({ queryKey: [...root, 0], queryFn: ({ signal }) => executionApi.notifications({ limit: 20, offset: 0 }, signal), enabled: active, retry: false, staleTime: 15_000 });
  const older = useQuery({ queryKey: [...root, offset], queryFn: ({ signal }) => executionApi.notifications({ limit: 20, offset }, signal), enabled: active && offset > 0, retry: false, staleTime: 15_000 });
  const query = offset ? older : first;
  const revoke = useCallback(() => {
    setDenied(true); setReadError(null); setReading(null); request.current?.abort();
    void client.cancelQueries({ queryKey: root }); client.removeQueries({ queryKey: root });
  }, [client, root]);
  useEffect(() => { if (deniedError(first.error) || deniedError(older.error) || connection === "denied") revoke(); }, [first.error, older.error, connection, revoke]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); void client.cancelQueries({ queryKey: root }); client.removeQueries({ queryKey: root }); };
  }, [client, root]);
  const read = async (item: ExecutionNotificationDto) => {
    if (!active || !valid() || request.current) return false;
    if (item.readAt) return true;
    const controller = new AbortController(); request.current = controller; setReading(item.id); setReadError(null);
    try {
      await executionApi.readNotification(item.id, controller.signal);
      if (!valid() || controller.signal.aborted) return false;
      await client.invalidateQueries({ queryKey: root });
      return valid() && !controller.signal.aborted;
    } catch (error) {
      if (!valid() || controller.signal.aborted) return false;
      if (deniedError(error)) revoke();
      else if (error instanceof ApiError && error.status === 404) {
        client.setQueriesData<ExecutionNotificationPage>({ queryKey: root }, page => page ? { ...page, items: page.items.filter(row => row.id !== item.id) } : page);
        setReadError("This notification is no longer available."); void client.invalidateQueries({ queryKey: root });
      } else setReadError("Could not open this notification. Please try again.");
      return false;
    } finally { request.current = null; if (valid()) setReading(null); }
  };
  return <Context.Provider value={{ enabled, denied: denied || connection === "denied", scope, role,
    page: active ? query.data : undefined, loading: active && query.isPending, error: query.isError && !deniedError(query.error),
    unread: active ? first.data?.unreadCount ?? 0 : 0, offset, setOffset,
    retry: () => { void query.refetch(); }, reading, readError, read }}>{children}</Context.Provider>;
}
export function executionNotificationPath(item: ExecutionNotificationDto, role: string | undefined) {
  const base = role === "vendor" ? "/vendor" : `/projects/${encodeURIComponent(item.projectId)}/execution`;
  return item.assignmentIds.length === 1 ? `${base}?assignment=${encodeURIComponent(item.assignmentIds[0])}` : base;
}
