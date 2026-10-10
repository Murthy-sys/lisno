import type { Request, Response } from "express";
import { executionDigest } from "../domain/vendor-execution.js";
import { ApiError } from "../middleware/errors.js";
import { ExecutionChangeEventModel } from "../models/ExecutionChangeEvent.js";
import { ExecutionNotificationModel } from "../models/ExecutionNotification.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { ExpiredTokenError, InvalidTokenError, type AuthService } from "./auth.service.js";
import { executionProjectIds, requireExecutionActor } from "./vendor-execution-access.js";
import { executionRecipientScope } from "./execution-notifications.js";

/** One cross-process change-stream wakeup, scoped revalidation per connection. */
export function createExecutionStream(options: { auth: AuthService; heartbeatMs?: number; recoveryMs?: number; maxStreams?: number; maxStreamsPerUser?: number }) {
  const connections = new Map<() => void, { userId: string; wake: () => void }>();
  let watcher: ReturnType<typeof ExecutionChangeEventModel.watch> | null = null;
  let recovery: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const wake = () => { for (const connection of connections.values()) connection.wake(); };
  const connect = () => {
    if (stopped || watcher || !connections.size) return;
    try {
      const stream = ExecutionChangeEventModel.watch([{ $match: { operationType: "insert" } }]);
      watcher = stream;
      stream.on("change", wake);
      stream.on("error", () => { if (watcher === stream) watcher = null; void stream.close().catch(() => {}); wake(); });
      stream.on("close", () => { if (watcher === stream) watcher = null; });
    } catch { watcher = null; }
  };
  const startRecovery = () => {
    if (recovery) return;
    recovery = setInterval(() => { if (!watcher) { connect(); wake(); } }, options.recoveryMs ?? 1000);
    recovery.unref();
  };
  return {
    async openStream(request: Request, response: Response) {
      if (stopped) throw new ApiError(503, "EXECUTION_STREAM_UNAVAILABLE", "Execution updates are temporarily unavailable.");
      const userId = request.authenticatedUser!.id;
      if (connections.size >= (options.maxStreams ?? 500) || [...connections.values()].filter(c => c.userId === userId).length >= (options.maxStreamsPerUser ?? 5)) throw new ApiError(429, "EXECUTION_STREAM_LIMIT", "Close another execution tab and retry.");
      const token = request.header("Authorization")?.replace(/^Bearer /u, "");
      if (!token) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
      let ended = false, initialized = false, pumping = false, dirty = false, signature = "";
      let identitySignature: string | null = null;
      let authorizedProjects: string[] | null | undefined;
      let timer: ReturnType<typeof setInterval> | undefined;
      const stop = () => {
        if (ended) return; ended = true;
        if (timer) clearInterval(timer);
        response.off("close", stop); connections.delete(stop); if (response.headersSent) response.end();
        if (response.writableNeedDrain) response.destroy();
        if (!connections.size) { if (recovery) clearInterval(recovery); recovery = undefined; const old = watcher; watcher = null; void old?.close().catch(() => {}); }
      };
      const snapshot = async () => {
        const actor = await options.auth.authenticate(token, { remoteAddress: request.socket.remoteAddress });
        await requireExecutionActor(actor);
        const ids = actor.role === "vendor" ? await VendorWorkAssignmentModel.distinct("projectId", { vendorId: actor.vendorId, status: { $ne: "superseded" } }) : await executionProjectIds(actor);
        const identity = executionDigest([actor.id, actor.role, actor.vendorId]);
        // Revocation clears inaccessible cached data. Newly assigned projects
        // remain on the healthy stream and trigger the ordinary authoritative refetch.
        const narrowed = authorizedProjects === null ? ids !== null : authorizedProjects?.some(id => ids !== null && !ids.includes(id));
        if (identitySignature && identity !== identitySignature || narrowed) throw new ApiError(403, "EXECUTION_SCOPE_CHANGED", "Execution access changed.");
        identitySignature = identity; authorizedProjects = ids;
        const nextScope = executionDigest([identity, ids?.sort()]);
        const scope = actor.role === "vendor" ? { $or: [{ vendorId: actor.vendorId }, { vendorId: null, projectId: { $in: ids ?? [] } }] } : ids === null ? {} : { projectId: { $in: ids } };
        const notificationScope = await executionRecipientScope(actor);
        const latest = await ExecutionChangeEventModel.findOne(scope).select({ _id: 1, occurredAt: 1 }).sort({ occurredAt: -1, _id: -1 }).lean();
        const count = await ExecutionChangeEventModel.countDocuments(scope);
        const unread = await ExecutionNotificationModel.countDocuments({ ...notificationScope, readAt: null });
        const notification = await ExecutionNotificationModel.findOne(notificationScope).select({ _id: 1, updatedAt: 1, deliveryStatus: 1 }).sort({ updatedAt: -1, _id: -1 }).lean();
        const next = executionDigest([nextScope, latest?._id, count, unread, notification?._id, notification?.updatedAt, notification?.deliveryStatus]);
        if (ended || response.destroyed) return;
        if (response.writableNeedDrain || response.writableLength > 32 * 1024) { stop(); return; }
        if (!response.headersSent) { response.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" }); response.flushHeaders(); }
        response.write(next !== signature ? `event: execution\ndata: ${JSON.stringify({ revision: next })}\n\n` : ": heartbeat\n\n");
        signature = next;
      };
      const fail = (error: unknown) => {
        const denied = error instanceof InvalidTokenError || error instanceof ExpiredTokenError || error instanceof ApiError && [401, 403, 404].includes(error.status);
        if (response.headersSent && !response.destroyed && !response.writableNeedDrain) response.write(`event: state\ndata: ${JSON.stringify({ status: denied ? "denied" : "unavailable" })}\n\n`);
        stop();
      };
      const pump = async () => {
        if (ended || !initialized || pumping) { dirty = true; return; }
        pumping = true;
        try { dirty = false; await snapshot(); } catch (error) { fail(error); }
        finally { pumping = false; if (dirty && !ended) setImmediate(() => { void pump(); }); }
      };
      connections.set(stop, { userId, wake: () => { void pump(); } }); response.once("close", stop);
      connect(); startRecovery();
      try { await snapshot(); initialized = true; timer = setInterval(() => { void pump(); }, Math.min(15000, options.heartbeatMs ?? 15000)); timer.unref(); if (dirty) void pump(); }
      catch (error) { if (response.headersSent) fail(error); else { stop(); throw error; } }
    },
    async stop() { stopped = true; if (recovery) clearInterval(recovery); for (const close of connections.keys()) close(); await watcher?.close().catch(() => {}); watcher = null; },
    health() { return { connections: connections.size, changeStreamConnected: watcher !== null }; }
  };
}
