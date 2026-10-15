import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { createClientMessageId } from "./chatModel";
import { createChatTypingActivity, type ChatTypingResult } from "./chatTypingActivity";
import { chatPath } from "./chatEnhancementsApi";
export function useChatTypingActivity(projectId: string, enabled: boolean) {
 const context = useConfiguredRuntime(); const owner = `${context.environment.environment.id}:${context.environment.generation}:${context.session.generation}:${projectId}`;
 const ownerRef = useRef(owner); ownerRef.current = owner;
 const publisher = useRef<ReturnType<typeof createChatTypingActivity> | null>(null);
 useEffect(() => {
  if (!enabled) return;
  let sequence = 0; const currentOwner = owner;
  const activity = createChatTypingActivity({ composerId: createClientMessageId(), nextSequence: () => ++sequence,
   publish: (input, signal) => ownerRef.current === currentOwner ? context.runtime.api.authenticated.put<ChatTypingResult>(`${chatPath(projectId)}/typing`, input, { signal }) : Promise.reject(new Error("Chat session changed")) });
  publisher.current = activity;
  const subscription = AppState.addEventListener("change", state => { if (state !== "active") activity.stop(); });
  return () => { subscription.remove(); activity.dispose(); if (publisher.current === activity) publisher.current = null; };
 }, [context.runtime, enabled, owner, projectId]);
 return { edit: useCallback((body: string) => { if (AppState.currentState === "active") publisher.current?.edit(body); }, []), stop: useCallback(() => publisher.current?.stop(), []) };
}
