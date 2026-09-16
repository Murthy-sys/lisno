import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { browserRecordedWebm } from "./helpers/project-chat-audio-fixtures.js";
import { createAttachmentFixture } from "./helpers/project-chat-attachments.js";
import { chatSend } from "./helpers/project-chat.js";

describe("native browser audio upload lifecycle", () => {
  it("stages all recorder chunks, retries idempotently, and delivers the unchanged audio to another project member", async () => {
    const f = createAttachmentFixture(), actor = f.actor("client-a"), peer = f.actor("electric-a");
    const cursor = (await f.service.events(peer, "a", undefined)).cursor;
    const upload = async () => {
      const reservation = await f.attachments.beginUpload(actor, "a", {uploadId: "native-chromium-voice", sizeBytes: browserRecordedWebm.length});
      return f.attachments.receiveUpload(actor, reservation, {
        filename: "Voice note.webm", mimeType: "audio/webm;codecs=opus",
        source: Readable.from([browserRecordedWebm.subarray(0, 3060), browserRecordedWebm.subarray(3060, 19498), browserRecordedWebm.subarray(19498)])
      });
    };
    const staged = await upload();
    expect(staged.attachment).toMatchObject({kind: "audio", mimeType: "audio/webm", byteSize: 21429});
    expect((await upload()).attachment.id).toBe(staged.attachment.id);
    expect((await f.service.events(peer, "a", cursor)).events).toEqual([]);
    await expect(f.attachments.download(peer, "a", staged.attachment.id, "content")).rejects.toMatchObject({status: 404});
    const input = chatSend("Audio update", {attachmentIds: [staged.attachment.id]});
    const message = await f.service.send(actor, "a", input);
    expect((await f.service.send(actor, "a", input)).id).toBe(message.id);
    expect((await f.service.events(peer, "a", cursor)).events).toHaveLength(1);
    expect((await f.service.messages(peer, "a", {})).items[0]?.attachments).toEqual([staged.attachment]);
    const content = await f.attachments.download(peer, "a", staged.attachment.id, "content");
    const chunks: Buffer[] = []; for await (const chunk of content.stream) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(browserRecordedWebm);
    await expect(f.attachments.download(f.actor("client-b"), "b", staged.attachment.id, "content")).rejects.toMatchObject({status: 404});
  });
  it("cleans truncated audio uploads and preserves upload identity when replacing the damaged file", async () => {
    const f = createAttachmentFixture(), actor = f.actor("client-a"), uploadId = "truncated-browser-audio";
    const bytes = browserRecordedWebm.subarray(0, -1);
    const reservation = await f.attachments.beginUpload(actor, "a", {uploadId, sizeBytes: bytes.length});
    await expect(f.attachments.receiveUpload(actor, reservation, {source: Readable.from([bytes]), filename: "voice.webm", mimeType: "audio/webm"})).rejects.toMatchObject({status: 400, code: "CHAT_ATTACHMENT_INVALID"});
    expect(f.files.size).toBe(0);
    expect((await f.service.messages(actor, "a", {})).items).toEqual([]);
    await expect(f.attachments.beginUpload(actor, "a", {uploadId, sizeBytes: browserRecordedWebm.length})).rejects.toMatchObject({status: 409});
    const retry = await f.attachments.beginUpload(actor, "a", {uploadId: "corrected-browser-audio", sizeBytes: browserRecordedWebm.length});
    const corrected = await f.attachments.receiveUpload(actor, retry, {source: Readable.from([browserRecordedWebm]), filename: "voice.webm", mimeType: "audio/webm"});
    expect(corrected.attachment).toMatchObject({kind: "audio", mimeType: "audio/webm"});
  });
});
