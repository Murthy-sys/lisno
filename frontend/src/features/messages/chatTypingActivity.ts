import type { ChatTypingInput, ChatTypingResult } from "./projectChatTypes";

export const CHAT_TYPING_IDLE_MS = 3_000;
export const CHAT_TYPING_REFRESH_MS = 3_000;
export const CHAT_TYPING_LEASE_MS = 8_000;

/** User-edit driven activity. Draft restoration must not call edit(). */
export function createChatTypingActivity(options: {
  composerId: string;
  nextSequence: () => number;
  publish: (input: ChatTypingInput, signal: AbortSignal) => Promise<ChatTypingResult>;
}) {
  let active = false;
  let disposed = false;
  let lastEdit = 0;
  let lastPublished = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let refresh: ReturnType<typeof setTimeout> | undefined;
  let flight: { controller: AbortController; timeout: ReturnType<typeof setTimeout> } | undefined;

  function publish(typing: boolean) {
    if (flight) { clearTimeout(flight.timeout); flight.controller.abort(); }
    const controller = new AbortController();
    const run = { controller, timeout: setTimeout(() => controller.abort(), 10_000) };
    flight = run;
    lastPublished = Date.now();
    void options.publish({ composerId: options.composerId, sequence: options.nextSequence(), typing }, controller.signal)
      .catch(() => { /* Presence failures never prevent sending a message. */ })
      .finally(() => { clearTimeout(run.timeout); if (flight === run) flight = undefined; });
  }
  function stop() {
    clearTimeout(idle); clearTimeout(refresh); idle = undefined; refresh = undefined;
    if (!active) return;
    active = false;
    publish(false);
  }
  function edit(body: string) {
    if (disposed) return;
    if (!body.trim()) { stop(); return; }
    lastEdit = Date.now();
    clearTimeout(idle);
    idle = setTimeout(stop, CHAT_TYPING_IDLE_MS);
    if (!active) { active = true; publish(true); return; }
    if (Date.now() - lastPublished >= CHAT_TYPING_REFRESH_MS) {
      clearTimeout(refresh); refresh = undefined; publish(true);
    } else if (!refresh) {
      refresh = setTimeout(() => {
        refresh = undefined;
        if (active && !disposed && Date.now() - lastEdit < CHAT_TYPING_IDLE_MS) publish(true);
      }, CHAT_TYPING_REFRESH_MS - (Date.now() - lastPublished));
    }
  }
  return {
    edit,
    stop,
    dispose() {
      stop();
      disposed = true;
      // Let the final stop finish with its bounded timeout. Its server lease
      // still expires if navigation or connectivity prevents delivery.
    }
  };
}
