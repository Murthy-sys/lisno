import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalStorage } from "../src/storage/local-storage.js";
import { writePrivateStream } from "../src/storage/stream-file.js";
import type { FileStorage } from "../src/storage/storage.js";
import express from "express";
import request from "supertest";
import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";
import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { emptyDesignWorkflowState } from "../src/domain/design-workflow-state.js";
import { errorHandler } from "../src/middleware/errors.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createDesignWorkflowStateRouter } from "../src/routes/design-workflow-state.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import { createDesignWorkflowStateService, projectOperationalStage } from "../src/services/design-workflow-state.service.js";
import { createWorkflowEvidenceStorage } from "../src/services/workflow-evidence-storage.js";
import { silentWebm, tinyMp4, tinyWebm } from "./helpers/project-chat-media-fixtures.js";

const NOW = "2026-09-17T10:00:00.000Z";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==", "base64");
const photo = { data: png, filename: "site.png", contentType: "image/png" };
const video = { data: tinyMp4, filename: "site.mp4", contentType: "video/mp4" };
const unknown = Object.assign(new Error("Unknown commit"), { errorLabels: ["UnknownTransactionCommitResult"] });
async function fixture(maxUploadBytes = 1024 * 1024, customStorage?: FileStorage) {
  const seed = structuredClone(demoSeedData); seed.auditEvents = [];
  const project = seed.projects.find(item => item.id === "project-aurora-villa")!;
  const users = Object.fromEntries(["designer", "client", "estimator_sales", "finance_head", "super_admin"].map(role => {
    const user = seed.users.find(item => item.role === role)!;
    return [role, { id: user.id, name: user.name, email: user.email, role: user.role } satisfies PublicUser];
  }));
  const outsider = { ...seed.users.find(item => item.role === "client")!, id: "foreign-client", email: "foreign@example.test", emailNormalized: "foreign@example.test" };
  seed.users.push(outsider); users.outsider = outsider;
  project.assignedDesignerIds = [users.designer!.id]; project.initiatingDesignerId = users.designer!.id;
  project.clientId = users.client!.id; project.assignedEstimatorId = users.estimator_sales!.id;
  project.designWorkflowStages = createProjectDesignWorkflow(project.id);
  const repository = createMemoryRepository(seed);
  const ready = emptyDesignWorkflowState(project.id); ready.initialPaymentAt = NOW;
  ready.stages = { internal_kickoff: { completedAt: NOW }, client_kickoff: { completedAt: NOW }, key_collection: { completedAt: NOW, handedOverAt: NOW, receivedAt: NOW }, site_measurement: { assignedDesignerId: users.designer!.id } };
  await repository.saveDesignWorkflowState(project.id, 0, ready);
  const service = createDesignWorkflowStateService(repository, createAuditService(repository), () => new Date(NOW));
  const files = new Map<string, Buffer>(); let sequence = 0;
  const save = vi.fn(async ({ data }: { data: Buffer }) => { const reference = `opaque-${++sequence}`; files.set(reference, data); return { reference }; });
  const importStream = vi.fn(async ({ source, signal }: { source: Readable; signal?: AbortSignal }) => {
    const chunks: Buffer[] = [];
    for await (const chunk of source) { signal?.throwIfAborted(); chunks.push(chunk); }
    return save({ data: Buffer.concat(chunks) });
  });
  const storage = createWorkflowEvidenceStorage(customStorage ?? { save, importStream, saveGenerated: save, read: async reference => files.get(reference)!, delete: async reference => { files.delete(reference); }, open: async reference => Readable.from([files.get(reference)!]) });
  const app = express(); app.use(express.json());
  app.use(createDesignWorkflowStateRouter({ authenticate: async token => Object.values(users).find(user => user.id === token)! } as AuthService, service, storage, maxUploadBytes)); app.use(errorHandler);
  const stage = project.designWorkflowStages.find(item => item.type === "site_measurement")!;
  const path = `/projects/${project.id}/design-workflow/actions`;
  const send = (attachments: Array<{ data: Buffer | string; filename: string; contentType: string }> = [photo], options: { sketch?: boolean; role?: string; data?: Record<string, unknown>; version?: number; action?: string; field?: string } = {}) => {
    let call = request(app).post(path).set("Authorization", `Bearer ${users[options.role ?? "designer"]!.id}`)
      .field("action", options.action ?? "measurement_complete").field("expectedVersion", String(options.version ?? 1)).field("stageId", stage.id)
      .field("idempotencyKey", "measurement-one").field("note", "Site measured").field("data", JSON.stringify(options.data ?? {}));
    for (const attachment of attachments) call = call.attach(options.field ?? "mediaFiles", attachment.data, { filename: attachment.filename, contentType: attachment.contentType });
    if (options.sketch) call = call.attach("file", png, { filename: "sketch.png", contentType: "image/png" });
    return call;
  };
  const state = async () => (await repository.findDesignWorkflowState(project.id))!;
  return { app, project, users, repository, service, files, save, storage, stage, path, send, state };
}

describe("measurement photos and videos", () => {
  it.each([false, true])("stores mixed evidence with optional sketch %s and exposes authenticated individual downloads", async sketch => {
    const f = await fixture(); await f.send([photo, video], { sketch }).expect(200);
    const state = await f.state(), event = state.history[0]!;
    expect(state.stages.site_measurement).toMatchObject({ completedAt: NOW, timingBasis: "sequential" });
    expect(event.mediaFiles).toHaveLength(2); expect(Boolean(event.proof)).toBe(sketch); expect(f.files.size).toBe(sketch ? 3 : 2);
    expect(new Set(event.mediaFiles!.map(media => media.id)).size).toBe(2);
    const dto = projectOperationalStage(f.stage, state, { designer: false, client: true, sales: false, finance: false, representative: false, manager: false }, new Date(NOW), f.users.client!.id);
    expect(dto.history[0]!.mediaFiles).toEqual(event.mediaFiles!.map(({ id, originalFilename, mimeType, byteSize, kind }) => ({ id, filename: originalFilename, mimeType, byteSize, kind })));
    expect(JSON.stringify(dto)).not.toContain("storageReference"); expect(JSON.stringify(dto)).not.toContain("sha256");
    for (const media of event.mediaFiles!) {
      const path = `/projects/${f.project.id}/design-workflow/history/${event.id}/media/${media.id}`;
      const downloaded = await request(f.app).get(path).set("Authorization", `Bearer ${f.users.client!.id}`).expect(200);
      expect(downloaded.headers).toMatchObject({ "content-type": media.mimeType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
      expect(Number(downloaded.headers["content-length"])).toBe(media.byteSize); expect(downloaded.headers["content-disposition"]).toContain(media.originalFilename);
      await request(f.app).get(path).expect(401);
      for (const role of ["outsider", "finance_head"]) await request(f.app).get(path).set("Authorization", `Bearer ${f.users[role]!.id}`).expect(role === "finance_head" ? 403 : 404);
      for (const [old, foreign] of [[f.project.id, "foreign-project"], [event.id, "foreign-event"], [media.id, "foreign-media"]]) await request(f.app).get(path.replace(old!, foreign!)).set("Authorization", `Bearer ${f.users.client!.id}`).expect(404);
      f.files.set(media.storageReference, Buffer.alloc(media.byteSize)); await request(f.app).get(path).set("Authorization", `Bearer ${f.users.client!.id}`).expect(409);
      f.files.set(media.storageReference, Buffer.alloc(1)); await request(f.app).get(path).set("Authorization", `Bearer ${f.users.client!.id}`).expect(409);
    }
  });
  it("streams a single media file and a batch above 25 MiB through real storage and downloads without buffered reads", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "workflow-large-test-"));
    try {
      const disk = createLocalStorage(path.join(directory, "permanent")); const bufferedRead = vi.spyOn(disk, "read"); const bufferedSave = vi.spyOn(disk, "save");
      const inputPath = path.join(directory, "large.mp4"); const block = Buffer.alloc(64 * 1024);
      const free = Buffer.alloc(8); free.writeUInt32BE(28 * 1024 * 1024 + 8); free.write("free", 4);
      const metadata = await writePrivateStream(inputPath, Readable.from((function* () { yield tinyMp4; yield free; for (let count = 0; count < 448; count++) yield block; })()));
      const f = await fixture(25 * 1024 * 1024, disk);
      await f.send([{ data: inputPath, filename: "large.mp4", contentType: "video/mp4" }, ...Array.from({ length: 12 }, () => photo)]).expect(200);
      const event = (await f.state()).history[0]!; expect(event.mediaFiles).toHaveLength(13);
      expect(event.mediaFiles![0]).toMatchObject({ byteSize: metadata.sizeBytes, sha256: metadata.sha256 });
      const media = event.mediaFiles![0]!;
      const digest = await request(f.app).get(`/projects/${f.project.id}/design-workflow/history/${event.id}/media/${media.id}`).set("Authorization", `Bearer ${f.users.client!.id}`).buffer(true).parse((response, callback) => {
        const hash = createHash("sha256"); let size = 0; let largest = 0;
        response.on("data", chunk => { size += chunk.length; largest = Math.max(largest, chunk.length); hash.update(chunk); });
        response.on("end", () => callback(null, { size, largest, sha256: hash.digest("hex") })); response.on("error", callback);
      }).expect(200);
      expect(digest.body).toMatchObject({ size: metadata.sizeBytes, sha256: metadata.sha256 }); expect(digest.body.largest).toBeLessThanOrEqual(64 * 1024);
      expect(bufferedRead).not.toHaveBeenCalled(); expect(bufferedSave).not.toHaveBeenCalled(); expect((await readdir(path.join(directory, "permanent"))).length).toBe(13);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("fails clearly when an adapter cannot import streams instead of buffering media", async () => {
    const save = vi.fn(); const f = await fixture(1024, { save, saveGenerated: save, read: vi.fn(), open: vi.fn(), delete: vi.fn() });
    const result = await f.send().expect(503); expect(result.body.error.code).toBe("WORKFLOW_STREAMING_STORAGE_UNAVAILABLE"); expect(save).not.toHaveBeenCalled();
  });
  it("accepts WebM video and advertises optional sketch while keeping legacy folder facts readable", async () => {
    const f = await fixture(); const state = await f.state(); const capabilities = { designer: true, client: false, sales: false, finance: false, representative: false, manager: false };
    expect(projectOperationalStage(f.stage, state, capabilities, new Date(NOW), f.users.designer!.id).availableActions).toContainEqual({ id: "measurement_complete", label: "Complete measurement", actor: "designer", requiresProof: false });
    state.stages.site_measurement = { completedAt: NOW, mediaFolderUrl: "https://legacy.example.test/folder" };
    expect(projectOperationalStage(f.stage, state, capabilities, new Date(NOW), f.users.designer!.id).facts).toContainEqual({ label: "Photos and videos folder", value: "https://legacy.example.test/folder" });
    await f.send([{ data: tinyWebm, filename: "site.webm", contentType: "video/webm" }]).expect(200);
    expect((await f.state()).history[0]!.mediaFiles![0]).toMatchObject({ kind: "video", mimeType: "video/webm" });
  });
  it.each([{}, { mediaFolderUrl: "https://legacy.example.test/new-folder" }])("requires media and rejects new folder data %j", async data => {
    const f = await fixture(); const before = await f.state(); await f.send([], { sketch: true, data }).expect(400);
    expect(f.files.size).toBe(0); expect(await f.state()).toEqual(before);
  });
  it.each([
    { data: Buffer.alloc(0), filename: "empty.png", contentType: "image/png", status: 400 },
    { data: png.subarray(0, 30), filename: "truncated.png", contentType: "image/png", status: 415 },
    { data: tinyMp4.subarray(0, 70), filename: "truncated.mp4", contentType: "video/mp4", status: 415 },
    { data: png, filename: "wrong.mp4", contentType: "image/png", status: 415 },
    { data: tinyMp4, filename: "wrong.mp4", contentType: "image/png", status: 415 },
    { data: silentWebm, filename: "audio.webm", contentType: "video/webm", status: 415 },
    { data: Buffer.from("arbitrary bytes"), filename: "image.png", contentType: "image/png", status: 415 },
    { data: Buffer.from("text content"), filename: "notes.txt", contentType: "text/plain", status: 415 }
  ])("rejects invalid $filename evidence before any writes", async attachment => {
    const f = await fixture(); const before = await f.state(); await f.send([photo, attachment], { sketch: true }).expect(attachment.status);
    expect(f.save).not.toHaveBeenCalled(); expect(await f.state()).toEqual(before);
  });
  it("allows media above the former aggregate limit while preserving the sketch limit", async () => {
    const f = await fixture(png.length - 1); await f.send([photo, photo], { sketch: true }).expect(413);
    expect(f.save).not.toHaveBeenCalled(); await f.send([photo, photo]).expect(200);
  });
  it("accepts more than ten files and rejects unknown parts and duplicate sketch/fields before writes", async () => {
    const f = await fixture();
    await f.send([photo], { field: "images" }).expect(400); await f.send([photo], { field: "file", sketch: true }).expect(400);
    await f.send().field("unexpected", "value").expect(400); await f.send().field("action", "measurement_complete").expect(400);
    expect(f.save).not.toHaveBeenCalled(); await f.send(Array.from({ length: 32 }, () => photo)).expect(200);
    expect((await f.state()).history[0]!.mediaFiles).toHaveLength(32);
  });
  it("rejects media on unrelated actions and video in the narrow proof field", async () => {
    const f = await fixture(); await f.send([photo], { action: "keys_received" }).expect(400); await f.send([video], { field: "file" }).expect(415); expect(f.save).not.toHaveBeenCalled();
  });
  it("rejects foreign uploads before storage and cleans all evidence on stale/denied actions", async () => {
    const f = await fixture(); const before = await f.state(); await f.send([photo, video], { role: "outsider" }).expect(404); expect(f.save).not.toHaveBeenCalled();
    await f.send([photo, video], { version: 0, sketch: true }).expect(409); await f.send([photo, video], { role: "client", sketch: true }).expect(403);
    expect(f.files.size).toBe(0); expect(await f.state()).toEqual(before);
  });
  it("rechecks active identity after upload and cleans the full set on authorization loss", async () => {
    const f = await fixture(); const before = await f.state(); const saveMedia = f.storage.saveMedia.bind(f.storage);
    vi.spyOn(f.storage, "saveMedia").mockImplementationOnce(async upload => {
      const media = await saveMedia(upload); const user = (await f.repository.findUserById(f.users.designer!.id))!;
      await f.repository.updateUser(user.id, user.version, { active: false, updatedAt: NOW });
      return media;
    });
    await f.send([photo, video], { sketch: true }).expect(401);
    expect(f.files.size).toBe(0); expect(await f.state()).toEqual(before);
  });
  it("preserves Unicode filename labels, rejects URL data with media and blocks forged JSON file metadata", async () => {
    const f = await fixture();
    await f.send([photo], { data: { mediaFolderUrl: "https://external.example.test/folder" } }).expect(400);
    expect(f.files.size).toBe(0);
    await request(f.app).post(f.path).set("Authorization", `Bearer ${f.users.designer!.id}`).send({ action: "measurement_complete", stageId: f.stage.id, expectedVersion: 1, idempotencyKey: "json-forged-media", data: {}, mediaFiles: [{ storageReference: "other-project" }] }).expect(400);
    await f.send([{ ...photo, filename: "site-café.png" }]).expect(200);
    expect((await f.state()).history[0]!.mediaFiles![0]!.originalFilename).toBe("site-café.png");
  });
  it("cleans earlier media and sketch when a later storage write fails", async () => {
    const f = await fixture(); const before = await f.state(); const saveMedia = f.storage.saveMedia.bind(f.storage);
    vi.spyOn(f.storage, "saveMedia").mockImplementationOnce(saveMedia).mockRejectedValueOnce(new Error("Storage unavailable"));
    await f.send([photo, video], { sketch: true }).expect(500); expect(f.files.size).toBe(0); expect(await f.state()).toEqual(before);
  });
  it("keeps stable IDs on exact replay, deletes new files and rejects changed order/metadata", async () => {
    const f = await fixture(); await f.send([photo, video], { sketch: true }).expect(200); const before = await f.state();
    await f.send([photo, video], { sketch: true }).expect(200); expect(await f.state()).toEqual(before); expect(f.files.size).toBe(3);
    await f.send([video, photo], { sketch: true }).expect(409); await f.send([{ ...photo, filename: "renamed.png" }, video], { sketch: true }).expect(409);
    expect(await f.state()).toEqual(before); expect(f.files.size).toBe(3);
  });
  it("rolls back state/audit and removes the complete set on definite audit failure", async () => {
    const f = await fixture(); const before = await f.state(); const run = f.repository.runInTransaction;
    vi.spyOn(f.repository, "runInTransaction").mockImplementation(operation => run(tx => operation({ ...tx, appendAuditEvent: async () => { throw new Error("Audit unavailable"); } })));
    await f.send([photo, video], { sketch: true }).expect(500); expect(await f.state()).toEqual(before); expect(f.files.size).toBe(0); expect(await f.repository.listAuditEvents({})).toEqual([]);
  });
  it.each([false, true])("retains the complete committed set after response error, sketch %s", async sketch => {
    const f = await fixture(); const run = f.repository.runInTransaction;
    vi.spyOn(f.repository, "runInTransaction").mockImplementation(async operation => { await run(operation); throw unknown; });
    await f.send([photo, video], { sketch }).expect(200); expect(f.files.size).toBe(sketch ? 3 : 2); expect((await f.state()).history).toHaveLength(1);
  });
  it.each(["unknown", "reconciliation unavailable"])("retains media-only files when outcome is %s", async mode => {
    const f = await fixture(); const before = await f.state(); const run = f.repository.runInTransaction;
    vi.spyOn(f.repository, "runInTransaction").mockImplementation(operation => run(tx => operation({ ...tx, saveDesignWorkflowState: async () => {
      if (mode === "reconciliation unavailable") vi.spyOn(f.repository, "findDesignWorkflowState").mockRejectedValueOnce(new Error("Read unavailable"));
      throw mode === "unknown" ? unknown : new Error("Write outcome unknown");
    } })));
    const response = await f.send([photo, video]).expect(503); expect(response.body.error.code).toBe("WORKFLOW_OUTCOME_UNCERTAIN"); expect(f.files.size).toBe(2); expect(await f.state()).toEqual(before);
  });
  it.each([false, true])("reconciles %s partial reference matches without deleting committed files", async partial => {
    const f = await fixture(); const run = f.repository.runInTransaction;
    vi.spyOn(f.repository, "runInTransaction").mockImplementation(async operation => {
      await run(tx => operation({ ...tx, saveDesignWorkflowState: async (projectId, version, state) => {
        const copy = structuredClone(state);
        copy.history.at(-1)!.mediaFiles!.forEach((item, index) => { if (partial && index === 0) return; item.storageReference = `winner-${item.id}`; f.files.set(item.storageReference, png); });
        return tx.saveDesignWorkflowState(projectId, version, copy);
      } })); throw unknown;
    });
    await f.send([photo, photo]).expect(partial ? 503 : 200);
    expect(f.files.size).toBe(partial ? 3 : 2); if (!partial) expect([...f.files.keys()].every(key => key.startsWith("winner-"))).toBe(true);
  });
  it("stops aborted multipart requests without saving evidence", async () => {
    const f = await fixture(); const server = f.app.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const address = server.address() as { port: number };
      const req = httpRequest({ hostname: "127.0.0.1", port: address.port, path: f.path, method: "POST", headers: { Authorization: `Bearer ${f.users.designer!.id}`, "Content-Type": "multipart/form-data; boundary=test" } }); req.on("error", () => {});
      req.write('--test\r\nContent-Disposition: form-data; name="mediaFiles"; filename="site.png"\r\nContent-Type: image/png\r\n\r\n');
      await new Promise(resolve => setTimeout(resolve, 20)); req.destroy(); await new Promise(resolve => setTimeout(resolve, 20));
      expect(f.save).not.toHaveBeenCalled(); expect((await f.state()).history).toEqual([]);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("bounds text fields but permits arbitrary chunked epilogues without a binary body ceiling", async () => {
    const f = await fixture(1024); await f.send().field("note", "x".repeat(16 * 1024 + 1)).expect(400);
    const server = f.app.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const address = server.address() as { port: number };
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const req = httpRequest({ hostname: "127.0.0.1", port: address.port, path: f.path, method: "POST", headers: { Authorization: `Bearer ${f.users.designer!.id}`, "Content-Type": "multipart/form-data; boundary=test", "Transfer-Encoding": "chunked" } }, response => { response.resume(); response.once("end", () => resolve(response.statusCode)); });
        req.on("error", reject); req.end('--test--\r\n' + "x".repeat(270 * 1024));
      }); expect(status).toBe(400); expect(f.save).not.toHaveBeenCalled();
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
