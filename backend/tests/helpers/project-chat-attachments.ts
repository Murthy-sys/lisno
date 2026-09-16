import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { ManagedFileStorage } from "../../src/storage/managed-storage.js";
import { createProjectChatAttachmentService } from "../../src/services/project-chat-attachments.service.js";
import { createProjectChatAttachmentPolicy } from "../../src/domain/project-chat-attachment-policy.js";
import type { ChatAttachmentPolicy } from "../../src/contracts/project-chat.js";
import { createChatFixture } from "./project-chat.js";

export function createAttachmentFixture(limits: Partial<ChatAttachmentPolicy["limits"]> = {}) {
  const fixture = createChatFixture();
  const files = new Map<string, Buffer>();
  const tombstones = new Set<string>();
  const faults = {remove: false};
  const storage: ManagedFileStorage = {
    allocateTarget: () => `artifact-${randomUUID()}`,
    async write(reference, source, options) {
      if (files.has(reference) || tombstones.has(reference)) throw new Error("Exclusive target exists");
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of source) {options.signal?.throwIfAborted(); length += chunk.length; if (length > options.maxBytes || length > options.expectedBytes) throw new Error("Size exceeded"); chunks.push(chunk);}
      if (length !== options.expectedBytes || tombstones.has(reference)) throw new Error("Incomplete or cancelled");
      const data = Buffer.concat(chunks); files.set(reference, data);
      return {sizeBytes: data.length, sha256: createHash("sha256").update(data).digest("hex")};
    },
    async stat(reference) {const data = files.get(reference); if (!data) throw new Error("Missing"); return {sizeBytes: data.length};},
    async open(reference, options) {const data = files.get(reference); if (!data) throw new Error("Missing"); options?.signal?.throwIfAborted(); return Readable.from([data.subarray(options?.start ?? 0, options?.endExclusive ?? data.length)]);},
    async readRange(reference, options) {options.signal?.throwIfAborted(); if (options.length > 1024 * 1024) throw new Error("Unbounded read"); const data = files.get(reference); if (!data) throw new Error("Missing"); return data.subarray(options.offset, options.offset + options.length);},
    async createImagePreview() {return null;},
    async remove(reference) {if (faults.remove) throw new Error("Delete failed"); files.delete(reference); tombstones.add(reference);}
  };
  const policy = createProjectChatAttachmentPolicy(limits);
  const attachments = createProjectChatAttachmentService({...fixture, storage, policy});
  async function stage(userId = "client-a", content = "Synthetic file", input: {projectId?: string; uploadId?: string; filename?: string; mimeType?: string} = {}) {
    const actor = fixture.actor(userId), data = Buffer.from(content);
    const reservation = await attachments.beginUpload(actor, input.projectId ?? "a", {uploadId: input.uploadId ?? `upload-${randomUUID()}`, sizeBytes: data.length});
    return attachments.receiveUpload(actor, reservation, {source: Readable.from([data]), filename: input.filename ?? "site-note.txt", mimeType: input.mimeType ?? "text/plain"});
  }
  return {...fixture, files, tombstones, faults, storage, policy, attachments, stage};
}
