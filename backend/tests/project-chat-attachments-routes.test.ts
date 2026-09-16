import express from "express";
import { request as httpRequest } from "node:http";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createAttachmentFixture } from "./helpers/project-chat-attachments.js";
import { createProjectChatAttachmentsRouter } from "../src/routes/project-chat-attachments.js";
import { createProjectChatRouter } from "../src/routes/project-chat.js";
import { createAuthService } from "../src/services/auth.service.js";
import { errorHandler } from "../src/middleware/errors.js";
const secret = "chat-attachment-route-test-secret-at-least-32-characters";
function fixture() {
  const f = createAttachmentFixture(), app = express();
  const auth = createAuthService(f.repository, {jwtSecret: secret, jwtExpiresInSeconds: 3600}, f.clock);
  app.use(express.json());
  app.use("/api/v1", createProjectChatAttachmentsRouter(auth, f.attachments));
  app.use("/api/v1", createProjectChatRouter(auth, f.service));
  app.use(errorHandler);
  const token = (id: string) => jwt.sign({id, role: f.actor(id).role, sessionVersion: 1, iat: Math.floor(f.clock().getTime() / 1000)}, secret, {expiresIn: 3600});
  const upload = (id: string, key: string, body = "File note", size = Buffer.byteLength(body), field = "file") => request(app).post(`/api/v1/projects/a/chat/attachments?uploadId=${key}&sizeBytes=${size}`).auth(token(id), {type: "bearer"}).attach(field, Buffer.from(body), {filename: "note.txt", contentType: "text/plain"});
  return {...f, app, token, upload};
}
describe("project chat attachment authenticated HTTP routes", () => {
  it("authorizes membership before file parsing or storage and returns the effective policy", async () => {
    const f = fixture(), write = vi.spyOn(f.storage, "write");
    expect((await request(f.app).post("/api/v1/projects/a/chat/attachments?uploadId=private-upload&sizeBytes=4").attach("file", Buffer.from("note"), "note.txt")).status).toBe(401);
    expect((await f.upload("client-b", "outsider-upload")).status).toBe(404);
    expect(write).not.toHaveBeenCalled();
    expect((await f.repository.pageAuditEvents({}, {limit: 100, offset: 0})).total).toBe(0);
    const policy = await request(f.app).get("/api/v1/projects/a/chat/attachment-policy").auth(f.token("client-a"), {type: "bearer"});
    expect(policy.status).toBe(200); expect(policy.body.data).toMatchObject({enabled: true, limits: {maxAttachments: 10, maxFileBytes: 50 * 1024 * 1024}});
  });
  it("streams a staged upload, gates private originals, and allows committed downloads with safe headers", async () => {
    const f = fixture(), upload = await f.upload("client-a", "http-upload-key");
    expect(upload.status).toBe(201);
    expect(Object.keys(upload.body.data).sort()).toEqual(["attachment", "clientUploadId", "expiresAt"]);
    expect(JSON.stringify(upload.body)).not.toMatch(/Reference|leaseToken|sha256|uploaderId/);
    const id = upload.body.data.attachment.id, path = `/api/v1/projects/a/chat/attachments/${id}/content`;
    expect((await request(f.app).get(path).auth(f.token("super"), {type: "bearer"})).status).toBe(404);
    const committed = await request(f.app).post("/api/v1/projects/a/chat/messages").auth(f.token("client-a"), {type: "bearer"}).send({body: "", attachmentIds: [id], clientMessageId: "http-attachment-message"});
    expect(committed.status).toBe(201); expect(committed.body.data.body).toBe("");
    const content = await request(f.app).get(path).auth(f.token("electric-a"), {type: "bearer"});
    expect(content.status).toBe(200); expect(content.text).toBe("File note");
    expect(content.headers).toMatchObject({"cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-length": "9"});
    expect(content.headers["content-disposition"]).toContain("attachment;");
    expect((await request(f.app).delete(`/api/v1/projects/a/chat/attachments/${id}`).auth(f.token("client-a"), {type: "bearer"})).status).toBe(409);
    expect((await request(f.app).get(`/api/v1/projects/b/chat/attachments/${id}/content`).auth(f.token("client-b"), {type: "bearer"})).status).toBe(404);
  });
  it("rejects malformed multipart, unexpected fields, size mismatch and changed same-key content without messages", async () => {
    const f = fixture();
    expect((await f.upload("client-a", "wrong-file-field", "Note", 4, "other")).status).toBe(400);
    const field = await request(f.app).post("/api/v1/projects/a/chat/attachments?uploadId=extra-form-field&sizeBytes=4").auth(f.token("client-a"), {type: "bearer"}).field("unexpected", "field").attach("file", Buffer.from("note"), {filename: "note.txt", contentType: "text/plain"});
    expect(field.status).toBe(400);
    expect((await f.upload("client-a", "wrong-size-file", "Too large", 3)).status).toBeGreaterThanOrEqual(400);
    expect((await f.upload("client-a", "stable-replay-file", "Original")).status).toBe(201);
    expect((await f.upload("client-a", "stable-replay-file", "Changed!")).status).toBe(409);
    expect((await f.service.messages(f.actor("client-a"), "a", {})).items).toEqual([]);
    const staged = await f.upload("client-a", "discard-http-file", "Discard");
    const discarded = await request(f.app).delete(`/api/v1/projects/a/chat/attachments/${staged.body.data.attachment.id}`).auth(f.token("client-a"), {type: "bearer"});
    expect(discarded.status).toBe(200);
    expect(discarded.body).toEqual({data: {id: staged.body.data.attachment.id, discarded: true}});
  });
  it("keeps missing previews and originals non-disclosing and revocation blocks subsequent downloads", async () => {
    const f = fixture(), upload = await f.upload("client-a", "download-revoked");
    const id = upload.body.data.attachment.id;
    await f.service.send(f.actor("client-a"), "a", {body: "", mentions: [], priority: "normal", clientMessageId: "readable-attachment", attachmentIds: [id]});
    expect((await request(f.app).get(`/api/v1/projects/a/chat/attachments/${id}/preview`).auth(f.token("client-a"), {type: "bearer"})).status).toBe(404);
    f.workflowTasks[0]!.assigneeUserId = "electric-b";
    expect((await request(f.app).get(`/api/v1/projects/a/chat/attachments/${id}/content`).auth(f.token("electric-a"), {type: "bearer"})).status).toBe(404);
    f.files.clear();
    expect((await request(f.app).get(`/api/v1/projects/a/chat/attachments/${id}/content`).auth(f.token("client-a"), {type: "bearer"})).status).toBe(503);
  });
  it("bounds actual chunked multipart bytes including data after the closing boundary", async () => {
    const f = fixture(), server = f.app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing fixture port");
    try {
      const response = await new Promise<{status: number; body: string}>((resolve, reject) => {
        const outgoing = httpRequest({host: "127.0.0.1", port: address.port, method: "POST", path: "/api/v1/projects/a/chat/attachments?uploadId=raw-chunked-overflow&sizeBytes=4", headers: {
          Authorization: `Bearer ${f.token("client-a")}`, "Content-Type": "multipart/form-data; boundary=fixture-boundary", "Transfer-Encoding": "chunked"
        }}, incoming => {
          let body = ""; incoming.setEncoding("utf8"); incoming.on("data", chunk => {body += chunk;}); incoming.on("end", () => resolve({status: incoming.statusCode!, body}));
        });
        outgoing.on("error", reject);
        outgoing.write('--fixture-boundary\r\nContent-Disposition: form-data; name="file"; filename="note.txt"\r\nContent-Type: text/plain\r\n\r\nNote\r\n--fixture-boundary--\r\n');
        outgoing.write(Buffer.alloc(64 * 1024, 32)); outgoing.end(Buffer.alloc(1024, 32));
      });
      expect(response.status).toBe(413); expect(JSON.parse(response.body)).toMatchObject({error: {code: "CHAT_ATTACHMENT_LIMIT"}});
      expect(f.files.size).toBe(0);
      expect((await f.service.messages(f.actor("client-a"), "a", {})).items).toEqual([]);
      expect((await f.repository.pageAuditEvents({}, {limit: 100, offset: 0})).items.some(event => event.action === "project_chat.attachment_ready")).toBe(false);
    } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
  });
});
