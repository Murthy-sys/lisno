import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValidatedUpload } from "../src/middleware/upload.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProcurementVendorPhotoIntentModel, ProcurementVendorPhotoCleanupModel } from "../src/models/ProcurementVendorPhotoIntent.js";
import { createProcurementVendorPhotoService, type ProcurementVendorPhotoServiceDependencies } from "../src/services/procurement-vendor-photo.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createLocalStorage } from "../src/storage/local-storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const actor = { id: "photo-test-admin", role: "super_admin" as const, name: "Synthetic Admin", email: "admin@example.invalid" };
const actorGuard = { requireReadActor: async () => actor, requireMutationActor: async () => actor };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let root: string;
let storage: ReturnType<typeof createLocalStorage>;
let at: Date;
let image: ValidatedUpload;
let vendorId: string;
const audit = createAuditService(createMemoryRepository());
const reference = createAiEstimatorKnowledgeReferenceService({ actorGuard, audit });
const service = (overrides: Partial<ProcurementVendorPhotoServiceDependencies> = {}) => createProcurementVendorPhotoService({ actorGuard, audit, storage, maxUploadBytes: 1024 * 1024, now: () => at, ...overrides });
beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-vendor-photo");
  await Promise.all([AuditEventModel, AiEstimatorKnowledgeVendorModel, ProcurementVendorPhotoIntentModel, ProcurementVendorPhotoCleanupModel].map(model => model.syncIndexes()));
  const data = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#aabbcc" } }).withExif({ IFD0: { Copyright: "Synthetic retained original" } }).jpeg().toBuffer();
  image = { data, sizeBytes: data.length, extension: ".jpg", mimeType: "image/jpeg", originalFilename: "synthetic.jpg" };
}, 120_000);
beforeEach(async () => {
  await replica.clear(); at = new Date("2026-09-24T12:00:00.000Z");
  root = await mkdtemp(path.join(tmpdir(), "lisno-vendor-photo-test-")); storage = createLocalStorage(root);
  vendorId = (await reference.createMaster(actor, "vendors", { name: "Synthetic photo vendor" })).id;
});
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
afterAll(async () => { await replica.stop(); });
async function bytes() { const opened = await service().open(actor, vendorId); const chunks = []; for await (const chunk of opened.stream) chunks.push(chunk); return Buffer.concat(chunks); }
const input = (version = 1, key = "synthetic-request-1") => ({ expectedVersion: version, idempotencyKey: key });

describe("durable private vendor photo lifecycle", () => {
  it("persists intent before original bytes and replays one upload without duplicate audit", async () => {
    const write = storage.managed.write;
    const writeSpy = vi.spyOn(storage.managed, "write").mockImplementation(async (target, source, options) => {
      expect(await ProcurementVendorPhotoIntentModel.exists({ storageReference: target, status: "uploading" })).toBeTruthy();
      return write(target, source, options);
    });
    const first = await service().replace(actor, vendorId, input(), image);
    expect(first).toMatchObject({ vendorId, version: 2, geoTaggedPicture: { mimeType: "image/jpeg", byteSize: image.sizeBytes } });
    expect(await bytes()).toEqual(image.data);
    expect((await reference.getVendorDetail(actor, vendorId)).procurementProfile).toBeNull();
    expect(JSON.stringify(first)).not.toContain("storageReference");
    expect(JSON.stringify(await reference.getVendorDetail(actor, vendorId))).not.toContain("sha256");
    const replay = await service().replace(actor, vendorId, input(), image);
    expect(replay).toEqual(first);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(await AuditEventModel.countDocuments({ action: "procurement_vendor_photo_updated" })).toBe(1);
    await expect(service().replace(actor, vendorId, input(2), image)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("keeps previous photo until successful commit, replaces then removes it", async () => {
    await service().replace(actor, vendorId, input(), image);
    const previous = (await AiEstimatorKnowledgeVendorModel.findById(vendorId).lean())!.geoTaggedPicture;
    const write = storage.managed.write;
    vi.spyOn(storage.managed, "write").mockImplementation(async (target, source, options) => {
      expect((await AiEstimatorKnowledgeVendorModel.findById(vendorId).lean())!.geoTaggedPicture.id).toBe(previous.id);
      expect(await bytes()).toEqual(image.data);
      return write(target, source, options);
    });
    const second = await service().replace(actor, vendorId, input(2, "replacement-request"), image);
    expect(second.version).toBe(3); expect(second.geoTaggedPicture?.id).not.toBe(previous.id);
    await expect(storage.managed.stat(previous.storageReference)).rejects.toBeTruthy();
    expect(await service().remove(actor, vendorId, { expectedVersion: 3 })).toEqual({ vendorId, version: 4, geoTaggedPicture: null });
    await expect(service().open(actor, vendorId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service().remove(actor, vendorId, { expectedVersion: 3 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it("rolls back photo/audit on persistence failure and retries the same identity", async () => {
    const failingAudit = { appendInMongoTransaction: vi.fn(async () => { throw new Error("Synthetic audit failure"); }) };
    await expect(service({ audit: failingAudit }).replace(actor, vendorId, input(), image)).rejects.toThrow("Synthetic audit failure");
    expect((await AiEstimatorKnowledgeVendorModel.findById(vendorId).lean())?.version).toBe(1);
    expect((await AiEstimatorKnowledgeVendorModel.findById(vendorId).lean())?.geoTaggedPicture).toBeNull();
    expect(await ProcurementVendorPhotoCleanupModel.countDocuments({ status: "deleted" })).toBe(1);
    expect(await service().replace(actor, vendorId, input(), image)).toMatchObject({ version: 2 });
  });
  it("records failed storage cleanup and maintenance retries without deleting current photo", async () => {
    await service().replace(actor, vendorId, input(), image);
    const remove = vi.spyOn(storage.managed, "remove").mockRejectedValue(new Error("Synthetic storage outage"));
    const second = await service().replace(actor, vendorId, input(2, "replacement-request"), image);
    expect(second.version).toBe(3);
    expect(await ProcurementVendorPhotoCleanupModel.countDocuments({ status: "pending", lastError: "STORAGE_DELETE_FAILED" })).toBe(1);
    expect(await bytes()).toEqual(image.data);
    remove.mockRestore(); at = new Date(at.getTime() + 61_000);
    expect(await service().cleanup()).toEqual({ deleted: 1, failed: 0 });
    expect(await bytes()).toEqual(image.data);
  });
  it("recovers a crashed upload through persisted expiry and retains its retry identity", async () => {
    const write = vi.spyOn(storage.managed, "write").mockRejectedValue(new Error("Synthetic upload failure"));
    await expect(service().replace(actor, vendorId, input(), image)).rejects.toThrow("Synthetic upload failure");
    const intent = await ProcurementVendorPhotoIntentModel.findOne().lean();
    // Recreate the persisted state left by a process that stopped before compensation.
    await ProcurementVendorPhotoIntentModel.updateOne({ _id: intent!._id }, { status: "uploading", expiresAt: new Date(at.getTime() - 1) });
    await ProcurementVendorPhotoCleanupModel.deleteMany({});
    expect(await service().cleanup()).toEqual({ deleted: 1, failed: 0 });
    expect((await ProcurementVendorPhotoIntentModel.findById(intent!._id).lean())?.status).toBe("failed");
    write.mockRestore();
    expect(await service().replace(actor, vendorId, input(), image)).toMatchObject({ version: 2 });
  });
  it("allows exactly one concurrent CAS winner and compensates the other target", async () => {
    const results = await Promise.allSettled([service().replace(actor, vendorId, input(1, "request-one"), image), service().replace(actor, vendorId, input(1, "request-two"), image)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    expect(await AuditEventModel.countDocuments({ action: "procurement_vendor_photo_updated" })).toBe(1);
    expect(await bytes()).toEqual(image.data);
    expect(await ProcurementVendorPhotoCleanupModel.countDocuments({ status: "deleted" })).toBe(1);
  });
  it("rejects a revoked write actor after upload and leaves the previous photo intact", async () => {
    await service().replace(actor, vendorId, input(), image);
    let checks = 0;
    const revoked = service({ actorGuard: { ...actorGuard, requireMutationActor: async () => {
      if (++checks === 2) throw new Error("Synthetic actor revoked");
      return actor;
    } } });
    await expect(revoked.replace(actor, vendorId, input(2, "revoked-upload"), image)).rejects.toThrow("Synthetic actor revoked");
    expect((await AiEstimatorKnowledgeVendorModel.findById(vendorId).lean())?.version).toBe(2);
    expect(await bytes()).toEqual(image.data);
    expect(await ProcurementVendorPhotoCleanupModel.countDocuments({ status: "deleted" })).toBe(1);
  });
  it("returns a safe retry conflict for simultaneous requests with the same identity", async () => {
    const results = await Promise.allSettled([service().replace(actor, vendorId, input(), image), service().replace(actor, vendorId, input(), image)]);
    expect(results.some(result => result.status === "fulfilled")).toBe(true);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "VENDOR_PHOTO_IN_PROGRESS" });
    expect(await service().replace(actor, vendorId, input(), image)).toMatchObject({ version: 2 });
    expect(await AuditEventModel.countDocuments({ action: "procurement_vendor_photo_updated" })).toBe(1);
  });
  it("resolves an uncertain attachment commit without deleting the winning object", async () => {
    let calls = 0;
    const uncertain = service({ startSession: async () => {
      const session = await mongoose.startSession();
      const original = session.withTransaction.bind(session);
      const index = ++calls;
      session.withTransaction = (async (...args: Parameters<typeof original>) => {
        const result = await original(...args);
        if (index === 2) throw new Error("Synthetic lost commit response");
        return result;
      }) as typeof session.withTransaction;
      return session;
    } });
    expect(await uncertain.replace(actor, vendorId, input(), image)).toMatchObject({ version: 2 });
    expect(await bytes()).toEqual(image.data);
    expect(await ProcurementVendorPhotoCleanupModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "procurement_vendor_photo_updated" })).toBe(1);
  });
});
