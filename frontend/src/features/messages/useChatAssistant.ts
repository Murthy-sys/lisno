import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { assistantFailureMessage } from "../ask-lisno/assistantFailureMessage";
import { useProjectChat } from "./ProjectChatProvider";
import { chatKeys, projectChatApi } from "./projectChatApi";
import { useChatAction, useChatIdempotency } from "./projectChatQueries";
import type { ChatAssistantResult } from "./projectChatAssistantTypes";
import type { ChatMessage } from "./projectChatTypes";

export function retryAssistantResult(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ApiError) return error.code !== "ASSISTANT_INVALID_RESPONSE" && [502, 503, 504].includes(error.status);
  // Fetch uses TypeError for transport failures. Do not retry parsing errors,
  // cancellation, or arbitrary TypeErrors from application code.
  return error instanceof TypeError && /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i.test(error.message);
}

/** A denied result is local to this resource; it does not revoke a valid conversation. */
export function useChatAssistantResult(projectId: string, resultId: string | null) {
  const chat = useProjectChat();
  const [foreground, setForeground] = useState(document.visibilityState !== "hidden");
  const enabled = Boolean(resultId && chat.enabled && !chat.denied.has(projectId));
  const query = useQuery({
    queryKey: chatKeys.assistantResult(chat.scope, projectId, resultId ?? "unavailable"),
    queryFn: async ({ signal }): Promise<{ result: ChatAssistantResult } | { denied: true }> => {
      try { return { result: await projectChatApi.assistantResult(projectId, resultId!, signal) }; }
      catch (error) {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          if (error.status === 401) void chat.verifyAccess(projectId);
          return { denied: true };
        }
        throw error;
      }
    },
    enabled, retry: retryAssistantResult, retryDelay: 500, staleTime: 0, gcTime: 0, refetchOnWindowFocus: "always"
  });
  useEffect(() => {
    setForeground(document.visibilityState !== "hidden");
    let current = true;
    let generation = 0;
    const hide = () => { generation += 1; setForeground(false); };
    const resume = () => {
      if (!enabled || document.visibilityState === "hidden") return;
      const version = ++generation;
      setForeground(false);
      void query.refetch().finally(() => { if (current && version === generation && document.visibilityState !== "hidden") setForeground(true); });
    };
    const visibility = () => document.visibilityState === "hidden" ? hide() : resume();
    document.addEventListener("visibilitychange", visibility); window.addEventListener("blur", hide); window.addEventListener("focus", resume);
    return () => { current = false; document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", hide); window.removeEventListener("focus", resume); };
  }, [enabled, chat.scope, projectId, resultId, query.refetch]);
  // Do not retain an old commercial answer onscreen while access is rechecked.
  const data = enabled && foreground && !query.isFetching && !query.isError ? query.data : undefined;
  return { ...query, isFetching: query.isFetching || !foreground, result: data && "result" in data ? data.result : undefined, denied: Boolean(data && "denied" in data), enabled };
}

export function useChatAssistantRequest(projectId: string, message: ChatMessage) {
  const chat = useProjectChat();
  const action = useChatAction(projectId);
  const keyFor = useChatIdempotency();
  const canRequest = chat.enabled && !chat.denied.has(projectId) && message.author.kind !== "service" && message.author.role === "client" && message.author.id === chat.userId && Boolean(message.assistant?.canRequest);
  function request() {
    if (!canRequest || action.busy) return;
    const payload = { messageId: message.id, expectedVersion: message.version, generation: message.assistant?.generation };
    void action.run(async signal => {
      try {
        return await projectChatApi.requestAssistant(projectId, message.id, { expectedVersion: message.version, idempotencyKey: keyFor(payload) }, signal);
      } catch (error) {
        // Keep the action hook's access/version checks; all other assistant
        // errors use safe recovery text instead of a provider response body.
        if (error instanceof ApiError && ![401, 403, 404, 409].includes(error.status) && error.code !== "CHAT_CLOSED") {
          throw new ApiError(error.status, error.code, assistantFailureMessage(error));
        }
        throw error;
      }
    }, () => {});
  }
  return { ...action, canRequest, request };
}
