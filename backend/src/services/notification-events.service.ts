import { ChatNotificationModel } from "../models/ChatNotification.js";
export interface NotificationEventsHub {
  subscribe(recipientId: string, wake: () => void): () => void;
  wake(recipientId: string): void;
  close(): Promise<void>;
}
/** Dedicated recipient fanout. Periodic recovery also rechecks access/session changes. */
export function createNotificationEventsHub(options: {watchChanges?: boolean; recoveryMs?: number} = {}): NotificationEventsHub {
  const subscribers = new Map<string, Set<() => void>>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let watcher: ReturnType<typeof ChatNotificationModel.watch> | undefined;
  let closed = false;
  const wake = (id: string) => { for (const callback of subscribers.get(id) ?? []) callback(); };
  const startWatcher = () => {
    if (watcher || closed || options.watchChanges === false || !subscribers.size) return;
    try {
      const current = ChatNotificationModel.watch([
        {$match: {$or: [{operationType: "insert"}, {operationType: "update", "updateDescription.updatedFields.readAt": {$exists: true}}, {operationType: "delete"}, {operationType: "replace"}]}}
      ], {fullDocument: "updateLookup", maxAwaitTimeMS: 1_000});
      watcher = current;
      const recover = () => { if (watcher === current) { watcher = undefined; void current.close().catch(() => undefined); } };
      current.on("change", change => {
        const id = "fullDocument" in change ? change.fullDocument?.recipientId : undefined;
        if (typeof id === "string") wake(id);
        else for (const key of subscribers.keys()) wake(key);
      });
      current.on("error", recover); current.on("close", recover);
    } catch { /* Timer recovers both watcher setup and committed records. */ }
  };
  const stopIdle = () => {
    if (subscribers.size) return;
    if (timer) clearInterval(timer); timer = undefined;
    const previous = watcher; watcher = undefined;
    if (previous) void previous.close().catch(() => undefined);
  };
  return {
    wake,
    subscribe(id, callback) {
      if (closed) return () => {};
      const group = subscribers.get(id) ?? new Set(); group.add(callback); subscribers.set(id, group);
      if (!timer) { timer = setInterval(() => { for (const key of subscribers.keys()) wake(key); startWatcher(); }, Math.max(15_000, options.recoveryMs ?? 20_000)); timer.unref(); }
      startWatcher();
      return () => { group.delete(callback); if (!group.size) subscribers.delete(id); stopIdle(); };
    },
    async close() {
      closed = true; subscribers.clear();
      const previous = watcher; watcher = undefined; stopIdle();
      if (previous) await previous.close().catch(() => undefined);
    }
  };
}
