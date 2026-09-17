import { once } from "node:events";
import mongoose, { type Connection } from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatNotificationModel } from "../src/models/ChatNotification.js";
import { createNotificationEventsHub, type NotificationEventsHub } from "../src/services/notification-events.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { CHAT_NOW } from "./helpers/project-chat.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let writer: Connection;
let remoteNotifications: typeof ChatNotificationModel;
let hub: NotificationEventsHub | undefined;

beforeAll(async () => {
  replica = await startMongoReplicaSet("notification-events");
  await ChatNotificationModel.syncIndexes();
  // An independent connection writes without calling the process-local hub.
  writer = await mongoose.createConnection(replica.uri, {autoIndex: false}).asPromise();
  remoteNotifications = writer.model(ChatNotificationModel.modelName, ChatNotificationModel.schema);
}, 120_000);
beforeEach(async () => replica.clear());
afterEach(async () => { await hub?.close(); hub = undefined; vi.restoreAllMocks(); });
afterAll(async () => { await writer?.close(); await replica?.stop(); });

function notification(id: string, recipientId: string) {
  return {
    _id: id, recipientId, projectId: "project-a", messageId: `message-${id}`,
    type: "chat.mention", projectName: "Synthetic project", actor: {id: "sender", name: "Test sender"},
    excerpt: "Please check this message", createdAt: CHAT_NOW, readAt: null,
    email: {status: "pending", attempts: 0, nextAttemptAt: CHAT_NOW, leaseToken: null, leaseExpiresAt: null, deliveredAt: null, failureCode: null}
  };
}

async function cursorReady(stream: ReturnType<typeof ChatNotificationModel.watch>) {
  // The initial batch's resume token proves Mongo has opened the cursor before
  // writes begin. This is the actual driver stream, observed by a pass-through spy.
  await Promise.race([
    once(stream, "resumeTokenChanged"),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Notification change stream did not open")), 5_000);
      timer.unref();
      stream.once("resumeTokenChanged", () => clearTimeout(timer));
    })
  ]);
}

describe("real Mongo notification event fanout", () => {
  it("wakes only the recipient for remote inserts/read changes and excludes email-only updates", async () => {
    const watch = vi.spyOn(ChatNotificationModel, "watch");
    hub = createNotificationEventsHub({recoveryMs: 30_000});
    const recipientA = vi.fn(), recipientB = vi.fn();
    const unsubscribeA = hub.subscribe("recipient-a", recipientA);
    const unsubscribeB = hub.subscribe("recipient-b", recipientB);
    expect(watch).toHaveBeenCalledOnce();
    const stream = watch.mock.results[0]!.value as ReturnType<typeof ChatNotificationModel.watch>;
    await cursorReady(stream);

    await remoteNotifications.create(notification("notification-a", "recipient-a"));
    await vi.waitFor(() => expect(recipientA).toHaveBeenCalledOnce(), {timeout: 3_000, interval: 10});
    expect(recipientB).not.toHaveBeenCalled();

    await remoteNotifications.updateOne({_id: "notification-a"}, {$set: {readAt: CHAT_NOW}});
    await vi.waitFor(() => expect(recipientA).toHaveBeenCalledTimes(2), {timeout: 3_000, interval: 10});
    expect(recipientB).not.toHaveBeenCalled();

    await remoteNotifications.updateOne({_id: "notification-a"}, {$set: {
      "email.status": "leased", "email.leaseToken": "worker-a", "email.leaseExpiresAt": "2026-09-16T10:15:00.000Z"
    }, $inc: {"email.attempts": 1}});
    await remoteNotifications.updateOne({_id: "notification-a"}, {$set: {
      email: {status: "sent", attempts: 1, nextAttemptAt: null, leaseToken: null, leaseExpiresAt: null, deliveredAt: CHAT_NOW, failureCode: null}
    }});
    // Observing a later insert is an ordered stream barrier: both earlier email
    // updates have been consumed/excluded without relying on a fixed sleep.
    await remoteNotifications.create(notification("notification-b", "recipient-b"));
    await vi.waitFor(() => expect(recipientB).toHaveBeenCalledOnce(), {timeout: 3_000, interval: 10});
    expect(recipientA).toHaveBeenCalledTimes(2);

    unsubscribeA();
    await remoteNotifications.create(notification("notification-a-after-unsubscribe", "recipient-a"));
    await remoteNotifications.updateOne({_id: "notification-b"}, {$set: {readAt: CHAT_NOW}});
    await vi.waitFor(() => expect(recipientB).toHaveBeenCalledTimes(2), {timeout: 3_000, interval: 10});
    expect(recipientA).toHaveBeenCalledTimes(2);

    unsubscribeB();
    await vi.waitFor(() => expect(stream.closed).toBe(true), {timeout: 3_000, interval: 10});
    await hub.close();
  }, 15_000);

  it("closes the real watcher and refuses new subscriptions when shut down with active subscribers", async () => {
    const watch = vi.spyOn(ChatNotificationModel, "watch");
    hub = createNotificationEventsHub({recoveryMs: 30_000});
    const recipient = vi.fn();
    hub.subscribe("recipient-a", recipient);
    const stream = watch.mock.results[0]!.value as ReturnType<typeof ChatNotificationModel.watch>;
    await cursorReady(stream);
    await remoteNotifications.create(notification("notification-before-close", "recipient-a"));
    await vi.waitFor(() => expect(recipient).toHaveBeenCalledOnce(), {timeout: 3_000, interval: 10});

    await hub.close();
    expect(stream.closed).toBe(true);
    hub.subscribe("recipient-a", recipient);
    expect(watch).toHaveBeenCalledOnce();
    await remoteNotifications.create(notification("notification-after-close", "recipient-a"));
    expect(recipient).toHaveBeenCalledOnce();
  }, 15_000);
});
