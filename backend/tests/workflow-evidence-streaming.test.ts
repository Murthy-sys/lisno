import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTemporaryUploadStorage } from "../src/storage/temporary-upload-storage.js";
import { uploadWorkflowEvidence } from "../src/middleware/workflow-evidence-upload.js";
import { validateBody } from "../src/middleware/validate.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createWorkflowEvidenceStorage } from "../src/services/workflow-evidence-storage.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==", "base64");
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { resolve, promise }; }
async function parserFixture(inactivityMs = 120_000) {
  const temporary = await createTemporaryUploadStorage();
  const references: string[] = [];
  const cleaned = deferred<void>(); const startedWrite = deferred<void>();
  const originalWrite = temporary.write; const write = vi.spyOn(temporary, "write");
  write.mockImplementation(async (source, options) => { startedWrite.resolve(); const saved = await originalWrite(source, options); references.push(saved.reference); return saved; });
  const originalCleanup = temporary.cleanup;
  const cleanup = vi.spyOn(temporary, "cleanup").mockImplementation(async () => { await originalCleanup(); cleaned.resolve(); });
  const app = express();
  app.use(uploadWorkflowEvidence(1024, { createStorage: async () => temporary, inactivityMs }));
  app.post("/", validateBody(z.object({ action: z.literal("measurement_complete") })), (_request, response) => response.json({ ok: true }));
  app.use(errorHandler);
  return { app, temporary, references, cleanup, cleaned, startedWrite };
}

describe("streamed evidence lifecycle", () => {
  it.each(["success", "schema", "invalid media", "unknown field", "malformed"])("cleans private staging after %s before/without action handler cleanup", async mode => {
    const f = await parserFixture();
    if (mode === "malformed") {
      await request(f.app).post("/").set("Content-Type", "multipart/form-data; boundary=broken")
        .send('--broken\r\nContent-Disposition: form-data; name="mediaFiles"; filename="site.png"\r\nContent-Type: image/png\r\n\r\nbytes-with-no-ending-boundary').expect(400);
    } else {
      const send = request(f.app).post("/").field("action", mode === "schema" ? "not-an-action" : "measurement_complete")
        .attach("mediaFiles", mode === "invalid media" ? Buffer.from("not a photo") : png, { filename: "site.png", contentType: "image/png" });
      if (mode === "unknown field") send.field("foreign", "value");
      await send.expect(mode === "success" ? 200 : mode === "invalid media" ? 415 : 400);
    }
    await f.cleaned.promise; expect(f.cleanup).toHaveBeenCalled();
    for (const reference of f.references) await expect(f.temporary.open(reference)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("cleans temp files only after a response-close action hold releases", async () => {
    const f = await parserFixture();
    const app = express(); const entered = deferred<void>(); const allowFinish = deferred<void>();
    app.use(uploadWorkflowEvidence(1024, { createStorage: async () => f.temporary }));
    app.post("/", async (req, _res) => {
      const release = req.workflowEvidence!.hold(); entered.resolve();
      await allowFinish.promise;
      expect(req.workflowEvidence!.signal.aborted).toBe(true);
      release(); await req.workflowEvidence!.cleanup();
    });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const body = Buffer.concat([Buffer.from('--file\r\nContent-Disposition: form-data; name="mediaFiles"; filename="site.png"\r\nContent-Type: image/png\r\n\r\n'), png, Buffer.from('\r\n--file--\r\n')]);
      const client = httpRequest({ hostname: "127.0.0.1", port: (server.address() as { port: number }).port, path: "/", method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=file" } }); client.on("error", () => {}); client.end(body);
      await entered.promise; client.destroy();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(f.cleanup).not.toHaveBeenCalled(); allowFinish.resolve(); await f.cleaned.promise;
      expect(f.cleanup).toHaveBeenCalled();
    } finally { allowFinish.resolve(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("cleans aborted active staging writes before returning from cleanup", async () => {
    const f = await parserFixture(); const server = f.app.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const client = httpRequest({ hostname: "127.0.0.1", port: (server.address() as { port: number }).port, path: "/", method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=file" } }); client.on("error", () => {});
      client.write('--file\r\nContent-Disposition: form-data; name="mediaFiles"; filename="site.png"\r\nContent-Type: image/png\r\n\r\n'); client.write(png);
      await f.startedWrite.promise; client.destroy(); await f.cleaned.promise;
      expect(f.cleanup).toHaveBeenCalled();
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it.each([false, true])("uses inactivity instead of an absolute batch timeout; inactive=%s", async inactive => {
    const f = await parserFixture(100); const server = f.app.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const result = new Promise<number | undefined>((resolve, reject) => {
        const client = httpRequest({ hostname: "127.0.0.1", port: (server.address() as { port: number }).port, path: "/", method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=file" } }, response => { response.resume(); response.once("end", () => resolve(response.statusCode)); }); client.on("error", reject);
        client.write('--file\r\nContent-Disposition: form-data; name="action"\r\n\r\nmeasurement_complete\r\n--file\r\nContent-Disposition: form-data; name="mediaFiles"; filename="site.png"\r\nContent-Type: image/png\r\n\r\n');
        if (!inactive) void (async () => {
          for (let offset = 0; offset < png.length; offset += 4) { await new Promise(yes => setTimeout(yes, 20)); client.write(png.subarray(offset, offset + 4)); }
          client.end('\r\n--file--\r\n');
        })();
      });
      expect(await result).toBe(inactive ? 408 : 200); await f.cleaned.promise;
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("never buffers a photo/video for import or integrity checking and cancels hash reads", async () => {
    const block = Buffer.alloc(64 * 1024, 1); const sha256 = createHash("sha256").update(block).digest("hex");
    const sources: Readable[] = [];
    const raw = { save: vi.fn(), saveGenerated: vi.fn(), read: vi.fn(), delete: vi.fn(), importStream: vi.fn(), open: vi.fn(async () => { const stream = Readable.from([block]); sources.push(stream); return stream; }) };
    const storage = createWorkflowEvidenceStorage(raw);
    const media = { id: "one", storageReference: "private", originalFilename: "site.mp4", mimeType: "video/mp4", byteSize: block.length, sha256, kind: "video" as const };
    const stream = await storage.openVerifiedMedia(media); let bytes = 0; for await (const chunk of stream) bytes += chunk.length;
    expect(bytes).toBe(block.length); expect(raw.open).toHaveBeenCalledTimes(2); expect(raw.read).not.toHaveBeenCalled();
    const controller = new AbortController(); const waiting = new Readable({ read() {} }); raw.open.mockResolvedValueOnce(waiting);
    const result = storage.openVerifiedMedia(media, controller.signal);
    await new Promise(resolve => setTimeout(resolve, 10)); controller.abort(new Error("cancelled"));
    await expect(result).rejects.toThrow("cancelled"); expect(waiting.destroyed).toBe(true); expect(raw.read).not.toHaveBeenCalled();
  });
});
