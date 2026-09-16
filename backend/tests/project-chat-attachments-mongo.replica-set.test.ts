import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { chatModels, insertChatMongoFixture } from "./helpers/project-chat-mongo.js";
import { createAttachmentFixture } from "./helpers/project-chat-attachments.js";
import { createProjectChatAttachmentService } from "../src/services/project-chat-attachments.service.js";
import { createMongoProjectChatRepository } from "../src/repositories/project-chat-mongo.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { ProjectChatAttachmentModel } from "../src/models/ProjectChatAttachment.js";
import { ProjectChatEventModel, ProjectChatMessageModel, ProjectChatOperationModel } from "../src/models/ProjectChat.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { chatSend } from "./helpers/project-chat.js";
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {replica = await startMongoReplicaSet("chat-attachment-replica"); for (const model of chatModels) await model.syncIndexes();}, 120000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());
async function setup() {
  const fixture = await insertChatMongoFixture();
  const {storage, files, tombstones, faults} = createAttachmentFixture();
  const attachments = createProjectChatAttachmentService({...fixture, storage});
  const second = createProjectChatAttachmentService({...fixture, storage, chatRepository: createMongoProjectChatRepository()});
  const stage = async (id = "client-a", projectId = "a") => {
    const actor = fixture.actor(id), bytes = Buffer.from("Replica-set attachment");
    const reservation = await attachments.beginUpload(actor, projectId, {uploadId: `replica-${randomUUID()}`, sizeBytes: bytes.length});
    return attachments.receiveUpload(actor, reservation, {source: Readable.from([bytes]), filename: "site.txt", mimeType: "text/plain"});
  };
  return {...fixture, storage, files, tombstones, faults, attachments, second, stage};
}
describe("project chat attachment Mongo transactions", () => {
  it("enforces global quotas and upload-key uniqueness across independent API adapters", async () => {
    const f = await setup(), actor = f.actor("client-a");
    const results = await Promise.allSettled([f.attachments, f.second, f.attachments].map((service, index) => service.beginUpload(actor, "a", {uploadId: `parallel-upload-${index}`, sizeBytes: 10})));
    expect(results.filter(value => value.status === "fulfilled")).toHaveLength(2);
    expect(results.find(value => value.status === "rejected")).toMatchObject({reason: {status: 429}});
    expect(await ProjectChatAttachmentModel.countDocuments()).toBe(2);
    expect(await ProjectChatEventModel.countDocuments()).toBe(0);
    const record = (await ProjectChatAttachmentModel.findOne().lean())!;
    await expect(ProjectChatAttachmentModel.create({...record, _id: "duplicate-upload-key"})).rejects.toMatchObject({code: 11000});
  });
  it("commits attachments, message, operation and one durable event atomically with concurrent retries", async () => {
    const f = await setup(), one = await f.stage(), two = await f.stage();
    const secondChat = createProjectChatService({...f, chatRepository: createMongoProjectChatRepository()});
    const actor = f.actor("client-a"), input = chatSend("", {attachmentIds: [one.attachment.id, two.attachment.id], clientMessageId: "concurrent-media-send"});
    const messages = await Promise.all([f.service.send(actor, "a", input), secondChat.send(actor, "a", input)]);
    expect(messages[0]!.id).toBe(messages[1]!.id);
    expect(await ProjectChatMessageModel.countDocuments()).toBe(1);
    expect(await ProjectChatOperationModel.countDocuments()).toBe(1);
    expect(await ProjectChatEventModel.countDocuments()).toBe(1);
    expect(await ProjectChatAttachmentModel.countDocuments({status: "attached", messageId: messages[0]!.id})).toBe(2);
    expect((await f.service.messages(f.actor("electric-a"), "a", {})).items[0]!.attachments).toEqual([one.attachment, two.attachment]);
  });
  it("rolls attachment association back when message auditing fails and rejects another project's upload", async () => {
    const f = await setup(), one = await f.stage(), other = await f.stage("client-b", "b");
    const failure = createProjectChatService({...f, audit: {...f.audit, async appendInMongoTransaction(input, session) {await f.audit.appendInMongoTransaction(input, session); throw new Error("Atomic audit failure");}}});
    const actor = f.actor("client-a"), input = chatSend("", {attachmentIds: [one.attachment.id]});
    await expect(failure.send(actor, "a", input)).rejects.toThrow("Atomic audit failure");
    expect(await ProjectChatAttachmentModel.countDocuments({status: "ready"})).toBe(2);
    expect(await ProjectChatMessageModel.countDocuments()).toBe(0);
    await expect(f.service.send(actor, "a", {...input, attachmentIds: [one.attachment.id, other.attachment.id]})).rejects.toMatchObject({status: 404});
    expect(await ProjectChatAttachmentModel.countDocuments({status: "ready"})).toBe(2);
  });
  it("serializes cleanup against send so only the winner can own or remove file bytes", async () => {
    const f = await setup(), actor = f.actor("client-a");
    for (const order of ["send-first", "cleanup-first"]) {
      const staged = await f.stage();
      const send = () => f.service.send(actor, "a", chatSend("", {attachmentIds: [staged.attachment.id]}));
      const discard = () => f.second.discard(actor, "a", staged.attachment.id);
      const result = await Promise.allSettled(order === "send-first" ? [send(), discard()] : [discard(), send()]);
      expect(result.filter(value => value.status === "fulfilled")).toHaveLength(1);
      const row = (await ProjectChatAttachmentModel.findById(staged.attachment.id).lean())!;
      if (row.status === "attached") {expect(f.files.has(row.originalReference)).toBe(true); expect(await ProjectChatMessageModel.countDocuments({_id: row.messageId})).toBe(1);}
      else {expect(row.status).toBe("deleted"); expect(f.files.has(row.originalReference)).toBe(false); expect(await ProjectChatMessageModel.countDocuments({"attachments.id": row._id})).toBe(0);}
    }
  });
  it("rejects a revoked worker's finalization and allows cleanup after process-style abandoned reservations", async () => {
    const f = await setup(), actor = f.actor("electric-a"), bytes = Buffer.from("Worker update");
    const reservation = await f.attachments.beginUpload(actor, "a", {uploadId: "worker-upload-start", sizeBytes: bytes.length});
    await f.chatRepository.mutate(async tx => {await ProjectWorkflowTaskModel.updateOne({_id: "trade-electric"}, {$set: {assigneeUserId: "electric-b"}}, {session: tx.session});});
    await expect(f.attachments.receiveUpload(actor, reservation, {source: Readable.from([bytes]), filename: "worker.txt", mimeType: "text/plain"})).rejects.toMatchObject({status: 404});
    const old = await f.attachments.beginUpload(f.actor("client-a"), "a", {uploadId: "crashed-upload-start", sizeBytes: 10});
    await ProjectChatAttachmentModel.updateOne({_id: old.record.id}, {$set: {cleanupAfter: "2020-01-01T00:00:00.000Z", "transfer.expiresAt": "2020-01-01T00:00:00.000Z"}});
    expect(await f.second.cleanup()).toMatchObject({deleted: 1});
    expect(f.tombstones.has(old.record.originalReference)).toBe(true);
    const retry = await f.attachments.beginUpload(f.actor("client-a"), "a", {uploadId: "crashed-upload-start", sizeBytes: 10});
    expect(retry.record.id).toBe(old.record.id); expect(retry.record.generation).toBe(2); expect(retry.record.originalReference).not.toBe(old.record.originalReference);
    await expect(f.storage.write(old.record.originalReference, Readable.from([Buffer.alloc(10)]), {expectedBytes: 10, maxBytes: 10, timeoutMs: 1000})).rejects.toThrow("Exclusive target exists");
  });
  it("normalizes historical text documents without rewriting them", async () => {
    const f = await setup(), actor = f.actor("client-a");
    const message = await f.service.send(actor, "a", chatSend("Historic text"));
    await ProjectChatMessageModel.collection.updateOne({_id: message.id}, {$unset: {attachments: ""}});
    expect((await f.service.messages(actor, "a", {})).items[0]!.attachments).toEqual([]);
    expect(await ProjectChatMessageModel.collection.findOne({_id: message.id})).not.toHaveProperty("attachments");
  });
});
