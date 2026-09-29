import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { projectChatApi } from "./projectChatApi";
import type { ChatAvailability } from "../../../../shared/chat/dailyCriticalTasks";

interface ChatScheduleState {
  readonly canWrite: boolean;
  readonly pending: boolean;
  readonly error: boolean;
  readonly nextOpenAt: string | null;
  readonly refresh: () => void;
}

const ChatScheduleContext = createContext<ChatScheduleState | null>(null);

export function ChatScheduleProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const internal = Boolean(auth.user && auth.user.role !== "client");
  const availability = useQuery<ChatAvailability>({
    queryKey: ["chat-availability", auth.user?.id],
    queryFn: ({ signal }) => projectChatApi.availability(signal),
    enabled: internal,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true
  });
  const nextChangeAt = availability.data?.nextChangeAt;
  const previousWritable = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const writable = availability.data?.writable;
    if (writable === undefined) return;
    if (previousWritable.current !== undefined && previousWritable.current !== writable) {
      void queryClient.invalidateQueries({ queryKey: ["project-chat"] });
    }
    previousWritable.current = writable;
  }, [availability.data?.writable, queryClient]);
  useEffect(() => {
    if (!internal || !nextChangeAt) return;
    const delay = new Date(nextChangeAt).getTime() - Date.now();
    if (!Number.isFinite(delay) || delay < 0) return;
    const timeout = window.setTimeout(() => void availability.refetch(), Math.min(delay + 250, 2_147_000_000));
    return () => window.clearTimeout(timeout);
  }, [availability.refetch, internal, nextChangeAt]);

  const value: ChatScheduleState = {
    canWrite: !internal || (!availability.isError && availability.data?.writable === true),
    pending: internal && availability.isPending,
    error: internal && availability.isError,
    nextOpenAt: availability.data?.nextOpenAt ?? null,
    refresh: () => { void availability.refetch(); }
  };
  return <ChatScheduleContext.Provider value={value}>{children}</ChatScheduleContext.Provider>;
}

export function useChatSchedule(): ChatScheduleState {
  const value = useContext(ChatScheduleContext);
  if (!value) throw new Error("ChatScheduleProvider is required");
  return value;
}

export function useOptionalChatSchedule(): ChatScheduleState | null {
  return useContext(ChatScheduleContext);
}
