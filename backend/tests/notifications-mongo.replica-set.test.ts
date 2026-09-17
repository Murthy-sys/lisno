import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AuditEventModel } from "../src/models/AuditEvent.js";
import { ChatNotificationModel } from "../src/models/ChatNotification.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import {
  ProjectChatEventModel,
  ProjectChatMessageModel,
  ProjectChatOperationModel,
  ProjectChatStateModel
} from "../src/models/ProjectChat.js";
import type { NotificationEmail, NotificationRecord } from "../src/repositories/notifications.js";
import { createMongoProjectChatRepository } from "../src/repositories/project-chat-mongo.js";
import { createNotificationService } from "../src/services/notifications.service.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { CHAT_NOW, chatSend } from "./helpers/project-chat.js";
import { chatModels, insertChatMongoFixture } from "./helpers/project-chat-mongo.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("chat-notifications");
  for (const model of [...chatModels, ChatNotificationModel]) await model.syncIndexes();
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

function taggedMessage(userId: string, name: string, clientMessageId: string) {
  const body = `@${name} please review.`;
  return chatSend(body, {
    clientMessageId,
    mentions: [{ userId, start: 0, end: name.length + 1 }]
  });
}

function sentEmail(row: NotificationRecord, deliveredAt: string): NotificationEmail {
  return {
    ...row.email,
    status: "sent",
    leaseToken: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
    deliveredAt,
    failureCode: null
  };
}

describe("chat notification Mongo transactions", () => {
  it("deduplicates concurrent sends and repeated tags, and enforces the recipient/message index", async () => {
    const f = await insertChatMongoFixture();
    const second = createProjectChatService({
      repository: f.repository,
      audit: f.audit,
      chatRepository: createMongoProjectChatRepository(),
      clock: f.clock
    });
    const body = "@Designer A please check. @Designer A and @super please reply.";
    const secondDesignerStart = body.indexOf("@Designer A", 1);
    const superStart = body.indexOf("@super");
    const input = chatSend(body, {
      clientMessageId: "concurrent-notification-send",
      mentions: [
        { userId: "designer-a", start: 0, end: "@Designer A".length },
        { userId: "designer-a", start: secondDesignerStart, end: secondDesignerStart + "@Designer A".length },
        { userId: "super", start: superStart, end: superStart + "@super".length }
      ]
    });

    const results = await Promise.all(Array.from({ length: 6 }, (_, index) =>
      (index % 2 ? second : f.service).send(f.actor("client-a"), "a", input)
    ));

    expect(new Set(results.map(row => row.id)).size).toBe(1);
    expect(await ProjectChatMessageModel.countDocuments()).toBe(1);
    expect(await ProjectChatOperationModel.countDocuments()).toBe(1);
    expect(await ProjectChatEventModel.countDocuments()).toBe(1);
    expect(await AuditEventModel.countDocuments()).toBe(1);
    const notifications = await ChatNotificationModel.find().sort({ recipientId: 1 }).lean();
    expect(notifications).toHaveLength(2);
    expect(notifications.map(row => [row.recipientId, row.type])).toEqual([
      ["designer-a", "chat.mention"],
      ["super", "chat.mention"]
    ]);
    for (const row of notifications) {
      expect(row).toMatchObject({
        messageId: results[0]!.id,
        readAt: null,
        email: { status: "pending", attempts: 0, leaseToken: null, nextAttemptAt: CHAT_NOW }
      });
    }
    await expect(ChatNotificationModel.create({
      ...notifications[0]!,
      _id: "duplicate-recipient-message"
    })).rejects.toMatchObject({ code: 11000 });

    const restarted = createNotificationService({ repository: createMongoProjectChatRepository(), clock: f.clock });
    expect((await restarted.list(f.actor("designer-a"), { limit: 20, offset: 0 })).items.map(row => row.messageId))
      .toEqual([results[0]!.id]);
  }, 30_000);

  it("rolls back message, notifications, email intent and audit together", async () => {
    const f = await insertChatMongoFixture();
    const service = createProjectChatService({
      repository: f.repository,
      chatRepository: f.chatRepository,
      clock: f.clock,
      audit: {
        ...f.audit,
        async appendInMongoTransaction(input, session) {
          await f.audit.appendInMongoTransaction(input, session);
          throw new Error("injected notification audit failure");
        }
      }
    });
    const input = taggedMessage("designer-a", "Designer A", "rollback-notification-send");
    await expect(service.send(f.actor("client-a"), "a", input))
      .rejects.toThrow("injected notification audit failure");

    for (const model of [
      ProjectChatMessageModel, ProjectChatOperationModel, ProjectChatEventModel,
      ProjectChatStateModel, ChatNotificationModel, AuditEventModel
    ]) expect(await model.countDocuments()).toBe(0);

    const committed = await f.service.send(f.actor("client-a"), "a", input);
    expect(committed.sequence).toBe(1);
    expect(await ChatNotificationModel.countDocuments({ messageId: committed.id, "email.status": "pending" })).toBe(2);
    expect(await ChatNotificationModel.countDocuments({ recipientId: "super", type: "chat.mention.oversight" })).toBe(1);
  });

  it("allows one email lease winner and rejects expired and replaced lease settlements", async () => {
    const f = await insertChatMongoFixture();
    await f.service.send(f.actor("client-a"), "a", taggedMessage("super", "super", "lease-notification-send"));
    const independent = createMongoProjectChatRepository();
    const expires = new Date(f.clock().getTime() + 60_000).toISOString();
    const results = await Promise.all([
      f.chatRepository.mutate(tx => tx.claimNotificationEmail(CHAT_NOW, expires, "first-worker")),
      independent.mutate(tx => tx.claimNotificationEmail(CHAT_NOW, expires, "second-worker"))
    ]);
    const winners = results.filter((row): row is NotificationRecord => row !== null);
    expect(winners).toHaveLength(1);
    const first = winners[0]!;
    expect(first.email.attempts).toBe(1);
    const originalToken = first.email.leaseToken!;

    expect(await independent.mutate(tx => tx.settleNotificationEmail(
      first.id, "unowned-token", CHAT_NOW, sentEmail(first, CHAT_NOW)
    ))).toBe(false);
    expect(await independent.mutate(tx => tx.settleNotificationEmail(
      first.id, originalToken, expires, sentEmail(first, expires)
    ))).toBe(false);

    const reclaimed = await independent.mutate(tx => tx.claimNotificationEmail(
      expires, new Date(Date.parse(expires) + 60_000).toISOString(), "replacement-worker"
    ));
    expect(reclaimed).toMatchObject({
      id: first.id,
      email: { status: "leased", attempts: 2, leaseToken: "replacement-worker" }
    });
    expect(await f.chatRepository.mutate(tx => tx.settleNotificationEmail(
      first.id, originalToken, expires, sentEmail(first, expires)
    ))).toBe(false);
    expect(await independent.mutate(tx => tx.settleNotificationEmail(
      first.id, "replacement-worker", expires, sentEmail(reclaimed!, expires)
    ))).toBe(true);
    expect(await independent.mutate(tx => tx.settleNotificationEmail(
      first.id, "replacement-worker", expires, sentEmail(reclaimed!, expires)
    ))).toBe(false);
    expect(await ChatNotificationModel.findById(first.id).lean()).toMatchObject({
      email: { status: "sent", attempts: 2, leaseToken: null, leaseExpiresAt: null, deliveredAt: expires }
    });
    expect(await f.chatRepository.mutate(tx => tx.claimNotificationEmail(
      expires, new Date(Date.parse(expires) + 60_000).toISOString(), "third-worker"
    ))).toBeNull();
  });

  it("filters revoked projects before unread counts and pagination without crossing recipients", async () => {
    const f = await insertChatMongoFixture();
    const grant = (await ProjectAccessGrantModel.findById("grant-admin-a").lean())!;
    await ProjectAccessGrantModel.create({ ...grant, _id: "grant-admin-a-project-b", projectId: "b" });
    let now = Date.parse(CHAT_NOW);
    const clock = () => new Date(now);
    const chat = createProjectChatService({ repository: f.repository, audit: f.audit, chatRepository: f.chatRepository, clock });
    const notifications = createNotificationService({ repository: f.chatRepository, clock });
    const allowedMessages: string[] = [];
    for (let index = 0; index < 2; index++) {
      now += 1_000;
      const message = await chat.send(f.actor("client-b"), "b", taggedMessage("admin-a", "admin-a", `allowed-${index}`));
      allowedMessages.push(message.id);
    }
    // Revoked messages are deliberately newer: paging first would return an empty page.
    for (let index = 0; index < 3; index++) {
      now += 1_000;
      await chat.send(f.actor("client-a"), "a", taggedMessage("admin-a", "admin-a", `revoked-${index}`));
    }
    const initial = await notifications.list(f.actor("admin-a"), { limit: 20, offset: 0 });
    expect(initial.pagination.total).toBe(5);
    expect(initial.unreadCount).toBe(5);
    const allowedRead = initial.items.find(row => row.messageId === allowedMessages[0])!;
    await notifications.read(f.actor("admin-a"), allowedRead.id);
    await expect(notifications.read(f.actor("super"), allowedRead.id)).rejects.toMatchObject({ status: 404 });

    await ProjectAccessGrantModel.updateOne({ _id: "grant-admin-a" }, {
      $set: { active: false, revokedAt: clock().toISOString(), revokedById: "super", revocationReason: "Test reassignment" }
    });

    const page = await notifications.list(f.actor("admin-a"), { limit: 1, offset: 0 });
    expect(page.pagination).toEqual({ limit: 1, offset: 0, total: 2, hasMore: true });
    expect(page.unreadCount).toBe(1);
    expect(page.items.map(row => row.messageId)).toEqual([allowedMessages[1]]);
    expect(page.items[0]).not.toHaveProperty("email");
    expect(page.items[0]).not.toHaveProperty("recipientId");
    const tail = await notifications.list(f.actor("admin-a"), { limit: 1, offset: 1 });
    expect(tail.pagination).toEqual({ limit: 1, offset: 1, total: 2, hasMore: false });
    expect(tail.unreadCount).toBe(1);
    expect(tail.items.map(row => row.messageId)).toEqual([allowedMessages[0]]);
    const revoked = initial.items.find(row => row.projectId === "a")!;
    await expect(notifications.read(f.actor("admin-a"), revoked.id)).rejects.toMatchObject({ status: 404 });
    expect(await ChatNotificationModel.countDocuments({ recipientId: "admin-a" })).toBe(5);
    expect((await notifications.list(f.actor("admin-b"), { limit: 20, offset: 0 })).items).toEqual([]);
    expect((await notifications.list(f.actor("super"), { limit: 20, offset: 0 })).items)
      .toHaveLength(5);
  });
});
