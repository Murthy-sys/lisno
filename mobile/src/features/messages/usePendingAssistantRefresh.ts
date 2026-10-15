import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { PresentedMessage } from "./chatModel";

export const ASSISTANT_REFRESH_MS = 10_000;
const MAX_REFRESHES = 60;
const pendingStates = new Set(["waiting_for_human", "ready", "leased"]);

/** Recover pending AI updates even if the event connection has stopped reconnecting. */
export function usePendingAssistantRefresh({ ownerKey, messages, enabled, refresh }: {
  readonly ownerKey: string;
  readonly messages: readonly PresentedMessage[];
  readonly enabled: boolean;
  readonly refresh: () => Promise<unknown>;
}) {
  const pendingKey = messages.flatMap(message => message.assistant && pendingStates.has(message.assistant.status)
    ? [`${message.assistant.runId}:${message.assistant.generation}`] : []).sort().join("\u0000");
  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;
  // Pausing does not reset the budget for the same run(s).
  const budget = useRef({ key: "", attempts: 0 });
  useEffect(() => {
    if (!enabled || !pendingKey) return;
    const key = `${ownerKey}\u0000${pendingKey}`;
    if (budget.current.key !== key) budget.current = { key, attempts: 0 };
    let live = true;
    let active = AppState.currentState === "active";
    let online = false;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const schedule = () => {
      clear();
      if (!live || !active || !online || refreshing || budget.current.attempts >= MAX_REFRESHES) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!live || !active || !online) return;
        refreshing = true;
        budget.current.attempts += 1;
        void Promise.resolve().then(() => live && active && online ? latestRefresh.current() : undefined)
          .catch(() => undefined) // Existing query error and retry controls remain visible.
          .finally(() => { refreshing = false; schedule(); });
      }, ASSISTANT_REFRESH_MS);
    };
    const app = AppState.addEventListener("change", state => { active = state === "active"; schedule(); });
    const network = NetInfo.addEventListener(state => {
      online = state.isConnected !== false && state.isInternetReachable !== false;
      schedule();
    });
    return () => { live = false; clear(); app.remove(); network(); };
  }, [enabled, ownerKey, pendingKey]);
}
