import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { createAttachmentFixture } from "./helpers/project-chat-attachments.js";
import { chatSend } from "./helpers/project-chat.js";
import { createProjectChatAttachmentService } from "../src/services/project-chat-attachments.service.js";
import { createProjectChatService } from "../src/services/project-chat.service.js";
import { createProjectChatAttachmentPolicy } from "../src/domain/project-chat-attachment-policy.js";

describe("project chat attachment lifecycle", () => {
  it("stages privately without events/counts, then commits ordered immutable attachments and nonblank quote summaries", async () => {
    const f = createAttachmentFixture(), actor = f.actor("client-a");
    const before = await f.service.events(actor, "a", undefined);
    const one = await f.stage(), two = await f.stage("client-a", "Second file", {filename: "second.txt"});
    expect((await f.service.summary(actor, "a")).counts).toEqual({openCritical: 0, openImportant: 0, unread: 0, unreadMentions: 0});
    expect(await f.service.events(actor, "a", before.cursor)).toMatchObject({events: [], cursor: before.cursor});
    await expect(f.attachments.download(f.actor("designer-a"), "a", one.attachment.id, "content")).rejects.toMatchObject({status: 404});
    const input = chatSend("", {attachmentIds: [two.attachment.id, one.attachment.id], priority: "critical"});
    const message = await f.service.send(actor, "a", input);
    expect(message.body).toBe(""); expect(message.attachments.map(file => file.filename)).toEqual(["second.txt", "site-note.txt"]);
    expect((await f.service.send(actor, "a", input)).id).toBe(message.id);
    const reply = await f.service.send(f.actor("electric-a"), "a", chatSend("Understood", {replyToId: message.id}));
    expect(reply.replyTo).toMatchObject({body: "", attachmentSummary: {count: 2, kind: "document", filename: "second.txt"}});
    const download = await f.attachments.download(f.actor("designer-a"), "a", one.attachment.id, "content");
    const data: Buffer[] = []; for await (const chunk of download.stream) data.push(chunk);
    expect(Buffer.concat(data).toString()).toBe("Synthetic file");
    await expect(f.attachments.discard(actor, "a", one.attachment.id)).rejects.toMatchObject({status: 409});
    await expect(f.service.send(actor, "a", chatSend("Reused", {attachmentIds: [one.attachment.id]}))).rejects.toMatchObject({status: 409});
  });
  it("binds upload retry identity to actual content and keeps a ready original after a conflicting replay", async () => {
    const f = createAttachmentFixture();
    const first = await f.stage("client-a", "Original", {uploadId: "stable-upload"});
    expect((await f.stage("client-a", "Original", {uploadId: "stable-upload"})).attachment.id).toBe(first.attachment.id);
    await expect(f.stage("client-a", "Different", {uploadId: "stable-upload"})).rejects.toMatchObject({status: 409});
    await expect(f.stage("client-a", "Changed!", {uploadId: "stable-upload"})).rejects.toMatchObject({status: 409});
    expect((await f.chatRepository.snapshot(tx => tx.attachments("a", [first.attachment.id])))[0]).toMatchObject({status: "ready", transfer: null});
    expect((await f.stage("client-a", "Original", {uploadId: "stable-upload"})).attachment.id).toBe(first.attachment.id);
  });
  it("rejects cross-project, another sender, outsider, duplicate and expired staged IDs without partial association", async () => {
    const f = createAttachmentFixture();
    const one = await f.stage(), other = await f.stage("client-b", "Other", {projectId: "b"});
    await expect(f.attachments.beginUpload(f.actor("client-b"), "a", {uploadId: "outsider-upload", sizeBytes: 4})).rejects.toMatchObject({status: 404});
    for (const [user, ids] of [["client-a", [one.attachment.id, other.attachment.id]], ["designer-a", [one.attachment.id]], ["client-a", [one.attachment.id, one.attachment.id]]] as const) {
      await expect(f.service.send(f.actor(user), "a", chatSend("", {attachmentIds: [...ids]}))).rejects.toMatchObject({status: expect.any(Number)});
    }
    expect((await f.chatRepository.snapshot(tx => tx.attachments("a", [one.attachment.id])))[0]!.status).toBe("ready");
    f.advance(24 * 60 * 60_000 + 1);
    await expect(f.service.send(f.actor("client-a"), "a", chatSend("", {attachmentIds: [one.attachment.id]}))).rejects.toMatchObject({status: 409});
    await expect(f.attachments.download(f.actor("client-a"), "a", one.attachment.id, "content")).rejects.toMatchObject({status: 404});
  });
  it("reserves concurrent and staged byte quotas atomically and holds failed cleanup reservations", async () => {
    const f = createAttachmentFixture({maxFileBytes: 20, maxMessageBytes: 30, maxStagedBytes: 30});
    const actor = f.actor("client-a");
    const results = await Promise.allSettled([1, 2, 3].map(index => f.attachments.beginUpload(actor, "a", {uploadId: `concurrent-upload-${index}`, sizeBytes: 10})));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(2);
    expect(results.find(result => result.status === "rejected")).toMatchObject({reason: {status: 429}});
    for (const result of results) if (result.status === "fulfilled") await f.attachments.abandonUpload(result.value);
    f.faults.remove = true;
    expect(await f.attachments.cleanup()).toMatchObject({failed: 2});
    await expect(f.attachments.beginUpload(actor, "a", {uploadId: "quota-over-bytes", sizeBytes: 11})).rejects.toMatchObject({status: 429});
    f.advance(5000); f.faults.remove = false;
    expect(await f.attachments.cleanup()).toMatchObject({deleted: 2});
    await expect(f.attachments.beginUpload(actor, "a", {uploadId: "quota-after-clean", sizeBytes: 11})).resolves.toBeDefined();
  });
  it("rechecks current membership on finalize and cleans originals when a worker loses assignment", async () => {
    const f = createAttachmentFixture(), actor = f.actor("electric-a"), bytes = Buffer.from("Work note");
    const lease = await f.attachments.beginUpload(actor, "a", {uploadId: "revoked-upload", sizeBytes: bytes.length});
    f.workflowTasks[0]!.assigneeUserId = "electric-b";
    await expect(f.attachments.receiveUpload(actor, lease, {source: Readable.from([bytes]), filename: "note.txt", mimeType: "text/plain"})).rejects.toMatchObject({status: 404});
    expect(f.files.size).toBe(0); expect(f.tombstones.size).toBe(2);
    expect((await f.service.summary(f.actor("client-a"), "a")).latestMessageSequence).toBe(0);
  });
  it("rolls association and message/audit/events back together while retaining reusable ready uploads", async () => {
    const f = createAttachmentFixture(), staged = await f.stage();
    const service = createProjectChatService({...f, audit: {...f.audit, async append(input, repository) {await f.audit.append(input, repository); throw new Error("Injected audit failure");}}});
    const input = chatSend("", {attachmentIds: [staged.attachment.id]});
    await expect(service.send(f.actor("client-a"), "a", input)).rejects.toThrow("Injected audit failure");
    expect((await f.chatRepository.snapshot(tx => tx.attachments("a", [staged.attachment.id])))[0]!.status).toBe("ready");
    expect((await f.service.summary(f.actor("client-a"), "a")).latestMessageSequence).toBe(0);
    await expect(f.service.send(f.actor("client-a"), "a", input)).resolves.toMatchObject({attachments: [staged.attachment]});
  });
  it("preserves legacy text fingerprint bytes and normalizes omitted/empty attachment arrays", async () => {
    const f = createAttachmentFixture(), input = chatSend("Legacy text", {clientMessageId: "legacy-send-key"});
    const first = await f.service.send(f.actor("client-a"), "a", input);
    const legacy = {body: input.body, mentions: [], priority: "normal", clientMessageId: input.clientMessageId, replyToId: null, responsibleUserId: null};
    const operation = await f.chatRepository.snapshot(tx => tx.operation("a", "client-a", "message.send", input.clientMessageId));
    expect(operation!.fingerprint).toBe(createHash("sha256").update(JSON.stringify(legacy)).digest("hex"));
    expect(await f.service.send(f.actor("client-a"), "a", {...input, attachmentIds: []})).toMatchObject({id: first.id, attachments: []});
  });
  it("keeps storage unavailable adapters compatible with text chat and rejects expired sessions before reservation", async () => {
    const f = createAttachmentFixture();
    const unavailable = createProjectChatAttachmentService({...f, storage: undefined});
    expect(await unavailable.policy(f.actor("client-a"), "a")).toMatchObject({enabled: false, capabilities: {canUpload: false, canRecord: false}});
    await expect(unavailable.beginUpload(f.actor("client-a"), "a", {uploadId: "disabled-upload", sizeBytes: 5})).rejects.toMatchObject({status: 503});
    await expect(f.attachments.beginUpload({...f.actor("client-a"), expiresAt: 1}, "a", {uploadId: "expired-upload", sizeBytes: 5})).rejects.toMatchObject({status: 401});
    await expect(f.service.send(f.actor("client-a"), "a", chatSend("Still works"))).resolves.toMatchObject({body: "Still works"});
  });
  it("performs external storage work outside transactions and cleans malformed uploads", async () => {
    const f = createAttachmentFixture(); let active = 0;
    const repository = {...f.chatRepository, mutate: (operation: Parameters<typeof f.chatRepository.mutate>[0]) => f.chatRepository.mutate(async tx => {active++; try {return await operation(tx);} finally {active--;}})};
    const storage = {...f.storage, write: vi.fn(async (...args: Parameters<typeof f.storage.write>) => {expect(active).toBe(0); return f.storage.write(...args);}), remove: vi.fn(async reference => {expect(active).toBe(0); return f.storage.remove(reference);})};
    const service = createProjectChatAttachmentService({...f, chatRepository: repository, storage});
    const reservation = await service.beginUpload(f.actor("client-a"), "a", {uploadId: "malformed-upload", sizeBytes: 8});
    await expect(service.receiveUpload(f.actor("client-a"), reservation, {source: Readable.from([Buffer.from("<svg/>!!")]), filename: "fake.png", mimeType: "image/png"})).rejects.toMatchObject({status: 400});
    expect(storage.write).toHaveBeenCalledOnce(); expect(storage.remove).toHaveBeenCalledTimes(2);
  });
  it("enforces attachment count and aggregate bytes before any association", async () => {
    const f = createAttachmentFixture(), one = await f.stage("client-a", "12345678"), two = await f.stage("client-a", "abcdefgh");
    for (const limits of [{maxAttachments: 1}, {maxFileBytes: 10, maxMessageBytes: 10}]) {
      const service = createProjectChatService({...f, attachmentPolicy: createProjectChatAttachmentPolicy(limits)});
      await expect(service.send(f.actor("client-a"), "a", chatSend("", {attachmentIds: [one.attachment.id, two.attachment.id]}))).rejects.toMatchObject({status: 400, code: "CHAT_ATTACHMENT_LIMIT"});
      expect((await f.chatRepository.snapshot(tx => tx.attachments("a", [one.attachment.id, two.attachment.id]))).map(row => row.status)).toEqual(["ready", "ready"]);
    }
    expect((await f.service.messages(f.actor("client-a"), "a", {})).items).toEqual([]);
    const bounded = createAttachmentFixture({maxAttachments: 1, maxStagedAttachments: 1});
    await bounded.stage();
    await expect(bounded.stage()).rejects.toMatchObject({status: 429});
  });
  it("retains replayable committed identity after expiry and rejects changed message attachment order", async () => {
    const f = createAttachmentFixture(), one = await f.stage(), two = await f.stage("client-a", "Second");
    const actor = f.actor("client-a"), input = chatSend("", {attachmentIds: [one.attachment.id, two.attachment.id]});
    const original = await f.service.send(actor, "a", input);
    f.advance(25 * 60 * 60_000);
    expect(await f.service.send(f.actor("client-a"), "a", input)).toMatchObject({id: original.id});
    await expect(f.service.send(f.actor("client-a"), "a", {...input, attachmentIds: [two.attachment.id, one.attachment.id]})).rejects.toMatchObject({status: 409});
    expect(await f.attachments.cleanup()).toMatchObject({claimed: 0});
    expect(f.files.size).toBe(2);
  });
  it("cleans storage after failed ready metadata audit and does not publish a partial upload", async () => {
    const f = createAttachmentFixture();
    const service = createProjectChatAttachmentService({...f, audit: {...f.audit, async append(input, repository) {
      await f.audit.append(input, repository);
      if (input.action === "project_chat.attachment_ready") throw new Error("Ready audit failure");
    }}});
    const actor = f.actor("client-a"), reservation = await service.beginUpload(actor, "a", {uploadId: "failed-ready-audit", sizeBytes: 4});
    await expect(service.receiveUpload(actor, reservation, {source: Readable.from([Buffer.from("Note")]), filename: "note.txt", mimeType: "text/plain"})).rejects.toMatchObject({status: 400});
    expect(f.files.size).toBe(0);
    expect((await f.chatRepository.snapshot(tx => tx.attachments("a", [reservation.record.id])))[0]).toMatchObject({status: "deleted"});
    expect((await f.service.messages(actor, "a", {})).items).toEqual([]);
  });
  it("keeps cancellation charged until the original writer stops and fences late finalization", async () => {
    const f = createAttachmentFixture({maxConcurrentTransfers: 1}), actor = f.actor("client-a");
    const reservation = await f.attachments.beginUpload(actor, "a", {uploadId: "cancelled-live-writer", sizeBytes: 4});
    await f.attachments.discard(actor, "a", reservation.record.id);
    await expect(f.attachments.beginUpload(actor, "a", {uploadId: "cancelled-live-writer", sizeBytes: 4})).rejects.toMatchObject({status: 409});
    await expect(f.attachments.beginUpload(actor, "a", {uploadId: "new-while-writer-live", sizeBytes: 4})).rejects.toMatchObject({status: 429});
    await expect(f.attachments.receiveUpload(actor, reservation, {source: Readable.from([Buffer.from("Note")]), filename: "note.txt", mimeType: "text/plain"})).rejects.toMatchObject({status: 400});
    const restarted = await f.attachments.beginUpload(actor, "a", {uploadId: "cancelled-live-writer", sizeBytes: 4});
    expect(restarted.record).toMatchObject({id: reservation.record.id, generation: 2, status: "uploading"});
    expect(restarted.record.originalReference).not.toBe(reservation.record.originalReference);
    expect(f.files.size).toBe(0);
  });
});
