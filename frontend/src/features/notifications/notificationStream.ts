import { apiClient } from "../../api/client";
import { ChatSseParser } from "../messages/projectChatStream";
import { notificationDenied, type NotificationPage } from "./notificationApi";

export type NotificationConnection = "connecting" | "live" | "reconnecting" | "paused" | "denied";

export function parseNotificationSnapshot(data: string): NotificationPage {
  const value = JSON.parse(data) as NotificationPage;
  const text = (input: unknown, max: number) => typeof input === "string" && input.length > 0 && input.length <= max;
  const date = (input: unknown) => typeof input === "string" && input.length <= 40 && Number.isFinite(Date.parse(input));
  const natural = (input: unknown) => Number.isSafeInteger(input) && (input as number) >= 0;
  if (!value || !Array.isArray(value.items) || value.items.length > 20 || !natural(value.unreadCount) ||
    !value.pagination || value.pagination.limit !== 20 || value.pagination.offset !== 0 ||
    !natural(value.pagination.total) || typeof value.pagination.hasMore !== "boolean") throw new Error("Invalid notification snapshot");
  const ids = new Set<string>();
  for (const item of value.items) {
    if (!item || !text(item.id, 200) || ids.has(item.id) || !["chat.mention", "chat.mention.oversight"].includes(item.type) ||
      !text(item.projectId, 200) || !text(item.projectName, 1000) || !text(item.messageId, 200) || !item.actor ||
      !text(item.actor.id, 200) || !text(item.actor.name, 1000) || typeof item.excerpt !== "string" || item.excerpt.length > 4000 ||
      !date(item.createdAt) || (item.readAt !== null && !date(item.readAt))) throw new Error("Invalid notification");
    ids.add(item.id);
  }
  return value;
}

function delay(signal: AbortSignal, milliseconds: number) {
  return new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

/** One transport per authenticated session. Visibility/offline suspension is owned by the provider. */
export async function runNotificationStream(options: {
  signal: AbortSignal;
  onSnapshot: (page: NotificationPage) => void;
  onStatus: (status: NotificationConnection) => void;
  onDenied: () => void;
  connect?: typeof apiClient.stream;
}) {
  const { signal, onSnapshot, onStatus, onDenied } = options;
  let failures = 0;
  while (!signal.aborted) {
    onStatus(failures ? "reconnecting" : "connecting");
    const connectedAt = Date.now();
    const controller = new AbortController();
    const stop = () => controller.abort();
    signal.addEventListener("abort", stop, { once: true });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { void reader?.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancel, { once: true });
    let denied = false;
    try {
      const response = await (options.connect ?? apiClient.stream)("/notifications/events", { signal: controller.signal });
      if (controller.signal.aborted) { await response.body?.cancel(); break; }
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("Notification stream unavailable");
      reader = response.body.getReader();
      const parser = new ChatSseParser(frame => {
        if (controller.signal.aborted) return;
        if (frame.event === "state" && (JSON.parse(frame.data) as { status: string }).status === "denied") {
          denied = true; controller.abort();
        } else if (frame.event === "notifications") {
          onSnapshot(parseNotificationSnapshot(frame.data));
          onStatus("live");
        }
      });
      while (!controller.signal.aborted) {
        clearTimeout(heartbeat);
        heartbeat = setTimeout(stop, 45_000);
        const next = await reader.read();
        if (next.done) { parser.finish(); break; }
        parser.push(next.value);
      }
    } catch (error) {
      if (notificationDenied(error)) denied = true;
    } finally {
      clearTimeout(heartbeat);
      signal.removeEventListener("abort", stop);
      controller.signal.removeEventListener("abort", cancel);
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      controller.abort();
    }
    if (signal.aborted) return;
    if (denied) { onStatus("denied"); onDenied(); return; }
    // A server repeatedly closing after its initial snapshot must still back off.
    if (Date.now() - connectedAt >= 30_000) failures = 0;
    failures += 1;
    onStatus("reconnecting");
    await delay(signal, Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5)) * (0.8 + Math.random() * 0.4));
  }
}
