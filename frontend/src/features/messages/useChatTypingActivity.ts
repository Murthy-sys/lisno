import { useCallback, useEffect, useRef } from "react";
import { tokenStorage } from "../../api/client";
import { createChatTypingActivity } from "./chatTypingActivity";
import { projectChatApi } from "./projectChatApi";

export function useChatTypingActivity(projectId: string, enabled: boolean) {
  const composerId = useRef(crypto.randomUUID());
  const sequence = useRef(0);
  const activity = useRef<ReturnType<typeof createChatTypingActivity> | null>(null);
  const session = tokenStorage.get();
  useEffect(() => {
    if (!enabled || !session) return;
    const publisher = createChatTypingActivity({
      composerId: composerId.current,
      nextSequence: () => ++sequence.current,
      publish: (input, signal) => {
        if (tokenStorage.get() !== session) return Promise.reject(new Error("Session changed"));
        return projectChatApi.typing(projectId, input, signal);
      }
    });
    activity.current = publisher;
    const hide = () => { if (document.visibilityState !== "visible") publisher.stop(); };
    const leave = () => publisher.stop();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      publisher.dispose();
      if (activity.current === publisher) activity.current = null;
    };
  }, [enabled, projectId, session]);
  const edit = useCallback((body: string) => {
    if (document.visibilityState === "visible") activity.current?.edit(body);
  }, []);
  const stop = useCallback(() => activity.current?.stop(), []);
  return { edit, stop };
}
