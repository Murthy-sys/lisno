import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";

import type { ChatAvailability } from "../../../../shared/chat/dailyCriticalTasks";
import type { AuthenticatedSession } from "../../contracts/session";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";

/** The server decides whether internal chat writes are open. Refresh at the boundary and on return. */
export function useChatAvailability(session: AuthenticatedSession) {
  const context = useConfiguredRuntime();
  const internal = session.user.role !== "client";
  const query = useQuery({
    queryKey: ["chat-availability", context.environment.environment.id, session.user.id],
    queryFn: () => context.runtime.api.authenticated.get<ChatAvailability>("/chat/availability"),
    enabled: internal,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true
  });

  useEffect(() => {
    if (!internal) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void query.refetch();
    });
    return () => subscription.remove();
  }, [internal, query.refetch]);

  useEffect(() => {
    if (!internal || !query.data?.nextChangeAt) return;
    const delay = Math.max(1_000, Math.min(Date.parse(query.data.nextChangeAt) - Date.now() + 500, 2_147_483_647));
    const timeout = setTimeout(() => void query.refetch(), delay);
    return () => clearTimeout(timeout);
  }, [internal, query.data?.nextChangeAt, query.refetch]);

  return {
    writable: !internal || query.data?.writable === true,
    unavailable: internal && query.isError,
    nextOpenAt: query.data?.nextOpenAt ?? null,
    refreshing: internal && query.isFetching
  };
}
