import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { useProjectChat } from "./ProjectChatProvider";
import { chatKeys, projectChatApi } from "./projectChatApi";
import { useChatAction, useChatIdempotency } from "./projectChatQueries";
import type { ChatAssistantResult } from "./projectChatAssistantTypes";
import type { ChatMessage } from "./projectChatTypes";

/** A denied result is local to this resource; it does not revoke a valid conversation. */
export function useChatAssistantResult(projectId: string, resultId: string | null) {
  const chat = useProjectChat();
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
    enabled, retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: "always"
  });
  // Do not retain an old commercial answer onscreen while access is rechecked.
  const data = enabled && !query.isFetching && !query.isError ? query.data : undefined;
  return { ...query, result: data && "result" in data ? data.result : undefined, denied: Boolean(data && "denied" in data), enabled };
}

export function useChatAssistantRequest(projectId: string, message: ChatMessage) {
  const chat = useProjectChat();
  const action = useChatAction(projectId);
  const keyFor = useChatIdempotency();
  const canRequest = chat.enabled && !chat.denied.has(projectId) && message.author.kind !== "service" && message.author.role === "client" && message.author.id === chat.userId && Boolean(message.assistant?.canRequest);
  function request() {
    if (!canRequest || action.busy) return;
    const payload = { messageId: message.id, expectedVersion: message.version, generation: message.assistant?.generation };
    void action.run(signal => projectChatApi.requestAssistant(projectId, message.id, { expectedVersion: message.version, idempotencyKey: keyFor(payload) }, signal), () => {});
  }
  return { ...action, canRequest, request };
}
