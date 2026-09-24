import { useEffect, useRef } from "react";

import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";

export function NotificationRealtimeBridge({ onSnapshot }: { readonly onSnapshot: () => void }) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const callback = useRef(onSnapshot);
  callback.current = onSnapshot;
  useEffect(() => {
    const stream = context.runtime.realtime.createStream({
      path: "/notifications/events",
      onEvent: (event) => { if (event.event === "notifications") callback.current(); },
      heartbeatTimeoutMs: 45_000,
      isDeniedEvent: (event) => {
        if (event.event !== "state") return false;
        try {
          return (JSON.parse(event.data) as { status?: unknown }).status === "denied";
        } catch {
          return false;
        }
      },
      onResync: () => callback.current(),
      onDenied: () => {
        void invalidate("access-changed").then(() => callback.current());
      }
    });
    stream.start();
    return () => stream.stop();
  }, [context.runtime.realtime, invalidate]);
  return null;
}
