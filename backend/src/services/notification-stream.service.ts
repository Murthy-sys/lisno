import type { Request, Response } from "express";
import type { NotificationService } from "../contracts/notifications.js";
import { ApiError } from "../middleware/errors.js";
import { ExpiredTokenError, InvalidTokenError, type AuthService } from "./auth.service.js";
import type { NotificationEventsHub } from "./notification-events.service.js";
import { chatActorFromAuthenticatedUser } from "./project-chat-authentication.js";

export function createNotificationStreamService(options: {auth: AuthService; service: NotificationService; hub: NotificationEventsHub; drainTimeoutMs?: number; maxStreams?: number; maxStreamsPerUser?: number}) {
  const connections = new Map<() => void, string>();
  let closed = false;
  return {
    async open(request: Request, response: Response) {
      const userId = request.authenticatedUser!.id;
      if (closed) throw new ApiError(503, "NOTIFICATIONS_UNAVAILABLE", "Notifications are temporarily unavailable.");
      if (connections.size >= (options.maxStreams ?? 500) || [...connections.values()].filter(id => id === userId).length >= (options.maxStreamsPerUser ?? 5)) {
        response.setHeader("Retry-After", "5");
        throw new ApiError(429, "NOTIFICATION_CONNECTION_LIMIT", "Too many notification connections. Close another tab and retry.");
      }
      const token = request.header("Authorization")!.slice("Bearer ".length);
      let ended = false, initialized = false, pumping = false, dirty = false;
      let signature: string | undefined;
      let unsubscribe = () => {};
      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      let cancelDrain = () => {};
      const stop = () => {
        if (ended) return;
        ended = true; unsubscribe(); cancelDrain(); connections.delete(stop); response.off("close", stop);
        if (drainTimer) clearTimeout(drainTimer);
        response.end();
        if (response.writableNeedDrain) response.destroy();
      };
      connections.set(stop, userId); response.once("close", stop);
      const drain = () => new Promise<void>(resolve => {
        if (!response.writableNeedDrain || ended) { resolve(); return; }
        const done = () => { response.off("drain", done); if (drainTimer) clearTimeout(drainTimer); cancelDrain = () => {}; resolve(); };
        cancelDrain = done; response.once("drain", done);
        drainTimer = setTimeout(() => { done(); stop(); response.destroy(); }, options.drainTimeoutMs ?? 5_000); drainTimer.unref();
      });
      const snapshot = async () => {
        const user = await options.auth.authenticate(token, {remoteAddress: request.socket.remoteAddress});
        await options.service.deliver(chatActorFromAuthenticatedUser(user, token), page => {
          if (ended || response.destroyed) return;
          const next = JSON.stringify(page);
          const frame = next !== signature ? `event: notifications\ndata: ${next}\n\n` : ": heartbeat\n\n";
          if (response.writableLength > 128 * 1024 || Buffer.byteLength(frame) > 128 * 1024) { stop(); return; }
          if (!response.headersSent) {
            response.status(200).set({"Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff"});
            response.flushHeaders();
          }
          response.write(frame); signature = next;
        });
        await drain();
      };
      const fail = (error: unknown) => {
        const denied = error instanceof InvalidTokenError || error instanceof ExpiredTokenError || (error instanceof ApiError && [401,403,404].includes(error.status));
        if (response.headersSent && !response.destroyed && !response.writableNeedDrain) response.write(`event: state\ndata: ${JSON.stringify({status: denied ? "denied" : "unavailable"})}\n\n`);
        stop();
      };
      const pump = async () => {
        if (ended || !initialized || pumping) { dirty = true; return; }
        pumping = true;
        try { dirty = false; await snapshot(); } catch (error) { fail(error); }
        finally { pumping = false; if (dirty && !ended) setImmediate(() => { void pump(); }); }
      };
      unsubscribe = options.hub.subscribe(userId, () => { dirty = true; void pump(); });
      try { await snapshot(); initialized = true; if (dirty && !ended) void pump(); }
      catch (error) {
        if (response.headersSent) fail(error);
        else { ended = true; unsubscribe(); connections.delete(stop); response.off("close", stop); throw error; }
      }
    },
    async close() { closed = true; for (const stop of connections.keys()) stop(); await options.hub.close(); }
  };
}
