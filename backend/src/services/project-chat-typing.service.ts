import { createHash } from "node:crypto";
import type { ChatActor, ChatTypingInput, ChatTypingResult, ChatTypingSnapshot, ProjectChatTypingService } from "../contracts/project-chat.js";
import { hasPermission } from "../domain/authorization.js";
import { resolveChatMembership } from "../domain/project-chat-membership.js";
import { chatNotFound } from "../domain/project-chat.js";
import { CHAT_TYPING, chatTypingSchema } from "../domain/project-chat-typing.js";
import { ApiError } from "../middleware/errors.js";
import type { ChatTypingRecord, ProjectChatRepository } from "../repositories/project-chat.js";
import { authenticatedChatUser, projectChatContext } from "./project-chat-context.js";
import type { Clock } from "./workflow.js";

const digest = (...values: unknown[]) => createHash("sha256").update(JSON.stringify(values)).digest("hex");
const limited = (seconds = 3) => new ApiError(429, "CHAT_TYPING_LIMIT", "Typing updates are temporarily limited.", undefined, { "Retry-After": String(seconds) });
const timely = (receivedAt: number) => {
  const elapsed = Date.now() - receivedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > CHAT_TYPING.requestLifetimeMs) {
    throw new ApiError(408, "CHAT_TYPING_EXPIRED", "This typing update has expired.");
  }
};
const effective = (record: ChatTypingRecord, now: string): ChatTypingResult => ({
  sequence: record.sequence,
  typing: record.expiresAt !== null && record.expiresAt > now,
  expiresAt: record.expiresAt !== null && record.expiresAt > now ? record.expiresAt : null
});

interface Delivery {
  actor: ChatActor;
  enqueue: (snapshot: ChatTypingSnapshot) => void;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/** Operational presence only: no messages, durable events, audits or read state. */
export function createProjectChatTypingService(options: { chatRepository: ProjectChatRepository; clock?: Clock }): ProjectChatTypingService {
  const clock = options.clock ?? (() => new Date());
  const store = options.chatRepository;
  const pending = new Map<string, Delivery[]>();
  let pendingCount = 0;

  const flush = async (projectId: string) => {
    const deliveries = pending.get(projectId) ?? [];
    pending.delete(projectId);
    try {
      // All current identities and names are resolved inside this fence. Batching
      // shares reads only for this transaction, never a name cache across viewers.
      let results: Array<{ delivery: Delivery; error?: unknown }> = [];
      await store.mutate(async tx => {
        const sources = await tx.sources(projectId);
        if (!sources) chatNotFound();
        const membership = resolveChatMembership(sources, await tx.selections(projectId));
        const memberIds = new Set(membership.participants.map(person => person.id));
        const users = new Map(sources.users.map(user => [user.id, user]));
        const authorized: Array<Delivery | { delivery: Delivery; error: unknown }> = [];
        for (const delivery of deliveries) {
          try {
            await authenticatedChatUser(tx, delivery.actor, clock);
            if (!memberIds.has(delivery.actor.id)) chatNotFound();
            authorized.push(delivery);
          } catch (error) { authorized.push({ delivery, error }); }
        }
        const now = clock().toISOString();
        const leases = await tx.activeTyping(projectId, now, CHAT_TYPING.maxProjectLeases + 1);
        if (leases.length > CHAT_TYPING.maxProjectLeases) throw limited();
        const currentTime = clock().getTime();
        const people = new Map<string, ChatTypingSnapshot["participants"][number]>();
        for (const lease of leases) {
          const user = users.get(lease.userId);
          if (!user || !user.active || !memberIds.has(user.id) || !hasPermission(user.role, "chat.send") ||
            user.role !== lease.role || (user.sessionVersion ?? 1) !== lease.sessionVersion ||
            lease.sessionExpiresAt * 1000 <= currentTime || !lease.expiresAt || Date.parse(lease.expiresAt) <= currentTime) continue;
          const previous = people.get(user.id);
          if (!previous || previous.expiresAt < lease.expiresAt) {
            people.set(user.id, { userId: user.id, name: user.name.slice(0, 300), expiresAt: lease.expiresAt });
          }
        }
        const snapshot: ChatTypingSnapshot = {
          projectId, serverTime: new Date(currentTime).toISOString(),
          participants: [...people.values()].sort((a, b) => a.userId.localeCompare(b.userId))
        };
        if (Buffer.byteLength(JSON.stringify(snapshot)) > CHAT_TYPING.maxFrameBytes - 100) throw limited();
        results = authorized.map(result => {
          if ("error" in result) return result;
          try {
            if (result.actor.expiresAt * 1000 <= clock().getTime()) throw new ApiError(401, "TOKEN_EXPIRED", "Authentication token has expired.");
            // Synchronous enqueue before releasing the shared mutation coordinator.
            result.enqueue(snapshot);
            return { delivery: result };
          } catch (error) { return { delivery: result, error }; }
        });
      });
      for (const result of results) {
        if ("error" in result) result.delivery.reject(result.error);
        else result.delivery.resolve();
      }
    } catch (error) { for (const delivery of deliveries) delivery.reject(error); }
    finally { pendingCount -= deliveries.length; }
  };

  return {
    async update(actor, projectId, unvalidated, receivedAt = Date.now()) {
      timely(receivedAt);
      const parsed = chatTypingSchema.safeParse(unvalidated);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid typing update.");
      const input: ChatTypingInput = parsed.data;
      const sessionScope = digest(actor.id, actor.role, actor.sessionVersion, actor.expiresAt);
      return store.mutate(async tx => {
        await projectChatContext(tx, actor, projectId, clock, "chat.send");
        timely(receivedAt);
        const nowMs = clock().getTime();
        const now = new Date(nowMs).toISOString();
        const stored = await tx.typingByComposer(projectId, actor.id, sessionScope, input.composerId);
        const previous = stored && stored.cleanupAt > now ? stored : null;
        if (previous && input.sequence <= previous.sequence) return effective(previous, now);
        const own = await tx.typingByUser(projectId, actor.id, now, CHAT_TYPING.maxRetainedComposers + 1);
        if (!previous && own.length >= CHAT_TYPING.maxRetainedComposers) throw limited(60);
        const wasActive = previous?.expiresAt !== null && previous?.expiresAt !== undefined && previous.expiresAt > now;
        if (input.typing) {
          if (wasActive && nowMs - Date.parse(previous!.updatedAt) < CHAT_TYPING.refreshMs) throw limited();
          if (!wasActive && own.filter(row => row.expiresAt !== null && row.expiresAt > now).length >= CHAT_TYPING.maxActiveComposers) throw limited();
          if (!wasActive && (await tx.activeTyping(projectId, now, CHAT_TYPING.maxProjectLeases)).length >= CHAT_TYPING.maxProjectLeases) throw limited();
          const rate = await tx.typingRate(projectId, actor.id);
          const current = rate && Date.parse(rate.windowStartedAt) + CHAT_TYPING.rateWindowMs > nowMs ? rate : null;
          if (current && current.activeUpdates >= CHAT_TYPING.maxActiveUpdatesPerWindow) throw limited(Math.max(1, Math.ceil((Date.parse(current.windowStartedAt) + CHAT_TYPING.rateWindowMs - nowMs) / 1000)));
          await tx.saveTypingRate({
            id: digest("typing-rate", projectId, actor.id), projectId, userId: actor.id,
            windowStartedAt: current?.windowStartedAt ?? now, activeUpdates: (current?.activeUpdates ?? 0) + 1,
            cleanupAt: new Date(nowMs + CHAT_TYPING.retentionMs).toISOString()
          });
        }
        // Stops retain the greatest accepted sequence for at least 60 seconds.
        const record: ChatTypingRecord = {
          id: digest("typing", projectId, actor.id, sessionScope, input.composerId),
          projectId, userId: actor.id, sessionScope, composerId: input.composerId,
          role: actor.role, sessionVersion: actor.sessionVersion, sessionExpiresAt: actor.expiresAt,
          sequence: input.sequence,
          expiresAt: input.typing ? new Date(Math.min(nowMs + CHAT_TYPING.leaseMs, actor.expiresAt * 1000)).toISOString() : null,
          updatedAt: now, cleanupAt: new Date(nowMs + CHAT_TYPING.retentionMs).toISOString()
        };
        timely(receivedAt);
        await tx.saveTyping(record);
        return effective(record, now);
      });
    },
    deliver(actor, projectId, enqueue) {
      if (pendingCount >= CHAT_TYPING.maxPendingDeliveries) return Promise.reject(limited());
      return new Promise<void>((resolve, reject) => {
        const group = pending.get(projectId);
        const delivery = { actor, enqueue, resolve, reject };
        pendingCount++;
        if (group) group.push(delivery);
        else {
          pending.set(projectId, [delivery]);
          setTimeout(() => { void flush(projectId); }, CHAT_TYPING.deliveryBatchMs);
        }
      });
    }
  };
}
