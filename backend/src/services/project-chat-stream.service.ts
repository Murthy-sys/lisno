import type { Request, Response } from "express";
import type { ChatEventBatch, ProjectChatService, ProjectChatTypingService } from "../contracts/project-chat.js";
import { CHAT_TYPING } from "../domain/project-chat-typing.js";
import { ApiError } from "../middleware/errors.js";
import { ExpiredTokenError, InvalidTokenError, type AuthService } from "./auth.service.js";
import { chatActorFromAuthenticatedUser } from "./project-chat-authentication.js";
import type { ProjectChatEventsHub } from "./project-chat-events.service.js";

export interface ProjectChatStreamService {
  open(request: Request, response: Response, projectId: string, initialCursor?: string): Promise<void>;
  close(): Promise<void>;
}

export function createProjectChatStreamService(options: {
  auth: AuthService;
  chat: ProjectChatService;
  hub: ProjectChatEventsHub;
  typing?: ProjectChatTypingService;
  heartbeatMs?: number;
  drainTimeoutMs?: number;
  maxStreams?: number;
  maxStreamsPerUser?: number;
}): ProjectChatStreamService {
  const connections = new Map<(destroy?: boolean) => void, string>();
  let closed = false;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const drainTimeoutMs = options.drainTimeoutMs ?? 5_000;

  return {
    async open(request, response, projectId, initialCursor) {
      const userId = request.authenticatedUser!.id;
      if (closed) throw new ApiError(503, "CHAT_UNAVAILABLE", "Messages are temporarily unavailable.");
      if (connections.size >= (options.maxStreams ?? 500) ||
        [...connections.values()].filter((id) => id === userId).length >= (options.maxStreamsPerUser ?? 5)) {
        response.setHeader("Retry-After", "5");
        throw new ApiError(429, "CHAT_CONNECTION_LIMIT", "Too many message connections. Close another tab and retry.");
      }
      const token = request.header("Authorization")!.slice("Bearer ".length);
      let cursor = initialCursor;
      let membershipVersion: string | undefined;
      let typingSignature: string | undefined;
      let pumping = false;
      let dirty = false;
      let ended = false;
      let initialized = false;
      let lastFrameAt = Date.now();
      let unsubscribe = () => {};
      let cancelDrain: (() => void) | undefined;
      const stop = (destroy = false) => {
        if (ended) return;
        ended = true;
        unsubscribe();
        cancelDrain?.();
        connections.delete(stop);
        response.off("close", stop);
        if (destroy) response.destroy();
        else {
          if (!response.writableEnded) response.end();
          if (!response.writableFinished) {
            const timer = setTimeout(() => response.destroy(), drainTimeoutMs);
            timer.unref();
            response.once("finish", () => clearTimeout(timer));
          }
        }
      };
      connections.set(stop, userId);
      response.once("close", stop);

      const waitForDrain = async (accepted: boolean): Promise<boolean> => {
        if (ended || response.destroyed) return false;
        // The buffer may have drained while the authorization transaction committed.
        if (accepted || !response.writableNeedDrain) return true;
        // write(false) has queued this frame already; never send it a second time.
        return new Promise<boolean>((resolve) => {
          let timer: ReturnType<typeof setTimeout>;
          const finish = (ok: boolean) => {
            clearTimeout(timer);
            response.off("drain", drained);
            cancelDrain = undefined;
            resolve(ok);
          };
          const drained = () => finish(!ended);
          cancelDrain = () => finish(false);
          response.once("drain", drained);
          timer = setTimeout(() => { finish(false); stop(); response.destroy(); }, drainTimeoutMs);
          timer.unref();
        });
      };
      const write = async (frame: string, protect = false): Promise<boolean> => {
        if (ended || response.destroyed || response.writableLength > 128 * 1024) { stop(); return false; }
        lastFrameAt = Date.now();
        let accepted = false;
        const enqueue = () => {
          if (!ended && !response.destroyed) accepted = response.write(frame);
        };
        if (protect) {
          const user = await options.auth.authenticate(token, { remoteAddress: request.socket.remoteAddress });
          // Enqueue synchronously under the same fence as assignment/session changes.
          // Network drain happens only after the coordinator transaction releases.
          await options.chat.authorizeDelivery(chatActorFromAuthenticatedUser(user, token), projectId, enqueue);
        } else enqueue();
        return waitForDrain(accepted);
      };
      const sendTyping = async () => {
        if (!options.typing || ended) return;
        try {
          const user = await options.auth.authenticate(token, { remoteAddress: request.socket.remoteAddress });
          let accepted = true;
          await options.typing.deliver(chatActorFromAuthenticatedUser(user, token), projectId, snapshot => {
            const signature = JSON.stringify(snapshot.participants);
            if (signature === typingSignature || ended || response.destroyed) return;
            // There is no presence queue: after drain the next pump obtains a fresh
            // snapshot, coalescing intervening changes instead of replaying them.
            if (response.writableNeedDrain || response.writableLength > CHAT_TYPING.maxFrameBytes) return;
            const frame = `event: typing\ndata: ${JSON.stringify(snapshot)}\n\n`;
            if (Buffer.byteLength(frame) > CHAT_TYPING.maxFrameBytes) return;
            accepted = response.write(frame);
            typingSignature = signature;
            lastFrameAt = Date.now();
          });
          await waitForDrain(accepted);
        } catch (error) {
          if (error instanceof InvalidTokenError || error instanceof ExpiredTokenError ||
            (error instanceof ApiError && [401, 403, 404].includes(error.status))) throw error;
          // Presence is best effort; a transient presence failure must not stop
          // delivery of committed messages. The next hub poll retries current state.
        }
      };
      const nextBatch = async (): Promise<ChatEventBatch> => {
        const user = await options.auth.authenticate(token, { remoteAddress: request.socket.remoteAddress });
        return options.chat.events(chatActorFromAuthenticatedUser(user, token), projectId, cursor, 100);
      };
      const sendBatch = async (batch: ChatEventBatch, force = false) => {
        const membershipChanged = membershipVersion !== undefined && batch.membershipVersion !== membershipVersion;
        membershipVersion = batch.membershipVersion;
        if (force || batch.events.length || batch.cursor !== cursor || batch.resync || membershipChanged) {
          const delivered = await write(`id: ${batch.cursor}\nevent: chat\ndata: ${JSON.stringify({ ...batch, resync: batch.resync || membershipChanged })}\n\n`, true);
          if (!delivered) return;
        } else if (Date.now() - lastFrameAt >= heartbeatMs) {
          await write(": heartbeat\n\n");
        }
        cursor = batch.cursor;
      };
      const fail = (error: unknown) => {
        const denied = error instanceof InvalidTokenError || error instanceof ExpiredTokenError ||
          (error instanceof ApiError && [401, 403, 404].includes(error.status));
        if (!ended && response.headersSent && !response.destroyed) {
          response.write(`event: state\ndata: ${JSON.stringify({ status: denied ? "denied" : "unavailable" })}\n\n`);
        }
        stop();
      };
      const pump = async () => {
        if (!initialized || pumping || ended) { dirty = true; return; }
        pumping = true;
        try {
          let pages = 0;
          do {
            dirty = false;
            const batch = await nextBatch();
            if (ended) return;
            await sendBatch(batch);
            if (!batch.hasMore) await sendTyping();
            if (batch.hasMore) dirty = true;
            pages += 1;
          } while (dirty && !ended && pages < 10);
        } catch (error) { fail(error); }
        finally {
          pumping = false;
          if (dirty && !ended) setImmediate(() => { void pump(); });
        }
      };

      // Listen before taking the initial snapshot, then replay from its cursor.
      unsubscribe = options.hub.subscribe(projectId, () => { dirty = true; void pump(); });
      try {
        const initial = await nextBatch();
        if (ended) return;
        response.status(200).set({
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "private, no-store, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff"
        });
        response.flushHeaders();
        await write('event: state\ndata: {"status":"live"}\n\n');
        await sendBatch(initial, true);
        if (!initial.hasMore) await sendTyping();
        initialized = true;
        if (initial.hasMore || dirty) void pump();
      } catch (error) {
        if (response.headersSent) fail(error);
        else {
          // Leave JSON error handling to Express before an SSE response begins.
          ended = true;
          unsubscribe();
          connections.delete(stop);
          response.off("close", stop);
          throw error;
        }
      }
    },
    async close() {
      closed = true;
      for (const stop of [...connections.keys()]) stop(true);
      await options.hub.close();
    }
  };
}
