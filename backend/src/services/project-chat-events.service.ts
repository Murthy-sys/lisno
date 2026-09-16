import { ProjectChatEventModel } from "../models/ProjectChat.js";

export interface ProjectChatEventsHub {
  subscribe(projectId: string, wake: () => void): () => void;
  close(): Promise<void>;
}

/** Change streams accelerate messages; the bounded active-project poll also
 * refreshes transient typing across processes and clears expired leases. */
export function createProjectChatEventsHub(options: {
  watchChanges?: boolean;
  pollIntervalMs?: number;
} = {}): ProjectChatEventsHub {
  const subscribers = new Map<string, Set<() => void>>();
  const pollIntervalMs = Math.max(50, options.pollIntervalMs ?? 750);
  let timer: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let watcher: ReturnType<typeof ProjectChatEventModel.watch> | undefined;
  let closed = false;

  const wakeAll = () => {
    for (const group of subscribers.values()) for (const wake of group) wake();
  };
  const startWatcher = () => {
    if (closed || watcher || options.watchChanges === false || !subscribers.size) return;
    try {
      const current = ProjectChatEventModel.watch([], { maxAwaitTimeMS: 1_000 });
      watcher = current;
      const recover = () => {
        if (watcher !== current) return;
        watcher = undefined;
        void current.close().catch(() => undefined);
        if (!closed && subscribers.size && !retry) {
          retry = setTimeout(() => { retry = undefined; startWatcher(); }, 5_000);
          retry.unref();
        }
      };
      current.on("change", (change) => {
        const projectId = "fullDocument" in change ? change.fullDocument?.projectId : undefined;
        if (typeof projectId === "string") {
          for (const wake of subscribers.get(projectId) ?? []) wake();
        } else wakeAll();
      });
      current.on("error", recover);
      current.on("close", recover);
    } catch {
      // The always-on durable-log poll still recovers committed events.
      if (!closed && !retry) {
        retry = setTimeout(() => { retry = undefined; startWatcher(); }, 5_000);
        retry.unref();
      }
    }
  };
  const stopIdle = () => {
    if (subscribers.size) return;
    if (timer) clearInterval(timer);
    if (retry) clearTimeout(retry);
    timer = undefined;
    retry = undefined;
    const previous = watcher;
    watcher = undefined;
    if (previous) void previous.close().catch(() => undefined);
  };
  return {
    subscribe(projectId, wake) {
      if (closed) return () => {};
      const group = subscribers.get(projectId) ?? new Set<() => void>();
      group.add(wake);
      subscribers.set(projectId, group);
      if (!timer) { timer = setInterval(wakeAll, pollIntervalMs); timer.unref(); }
      startWatcher();
      return () => {
        group.delete(wake);
        if (!group.size) subscribers.delete(projectId);
        stopIdle();
      };
    },
    async close() {
      closed = true;
      subscribers.clear();
      const previous = watcher;
      watcher = undefined;
      stopIdle();
      if (previous) {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          previous.close().catch(() => undefined),
          new Promise<void>((resolve) => { timeout = setTimeout(resolve, 1_000); timeout.unref(); })
        ]);
        if (timeout) clearTimeout(timeout);
      }
    }
  };
}
