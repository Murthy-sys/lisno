import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcurementVendorProfile } from "../src/contracts/procurement-vendor.js";
import { ApiError } from "../src/middleware/errors.js";
import type { ValidatedUpload } from "../src/middleware/upload.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProcurementVendorCertificateCleanupModel, ProcurementVendorCertificateUploadModel } from "../src/models/ProcurementVendorCertificateUpload.js";
import { ProcurementVendorSaveCommandModel } from "../src/models/ProcurementVendorSaveCommand.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProcurementVendorCertificateService, type ProcurementVendorCertificateServiceDependencies } from "../src/services/procurement-vendor-certificate.service.js";
import { createLocalStorage } from "../src/storage/local-storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";

const actor: PublicUser = { id: "certificate-test-admin", role: "super_admin", name: "Synthetic Admin", email: "admin@example.invalid" };
const otherActor: PublicUser = { ...actor, id: "other-certificate-admin" };
const actorGuard = { requireReadActor: async (user: PublicUser) => user, requireMutationActor: async (user: PublicUser) => user };
const audit = createAuditService(createMemoryRepository());
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let root: string;
let storage: ReturnType<typeof createLocalStorage>;
let at: Date;
let certificate: ValidatedUpload;
let profile: ProcurementVendorProfile;
const reference = createAiEstimatorKnowledgeReferenceService({ actorGuard, audit, now: () => at });
const service = (overrides: Partial<ProcurementVendorCertificateServiceDependencies> = {}) => createProcurementVendorCertificateService({ actorGuard, storage, maxUploadBytes: 100_000, now: () => at, ...overrides });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function bytes(vendorId: string, revision?: string) {
  const opened = await service().open(actor, vendorId, revision);
  const chunks: Buffer[] = []; for await (const chunk of opened.stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function createCertified(name = "Synthetic certified vendor", key = "create-certificate") {
  const staged = await service().stage(actor, { idempotencyKey: `${key}-upload` }, certificate);
  const input = { name, procurementProfile: profile, msmeCertificateUploadId: staged.uploadId, idempotencyKey: `${key}-save` };
  const vendor = await reference.createMaster(actor, "vendors", input);
  return { staged, input, vendor, certificateId: String((await row(vendor.id)).msmeCertificate.id) };
}
async function row(vendorId: string) { return (await AiEstimatorKnowledgeVendorModel.findById(vendorId).lean())!; }
const events = (vendorId?: string) => AuditEventModel.countDocuments({ entityType: "ai_estimator_knowledge_vendor", ...(vendorId ? { entityId: vendorId } : {}) });

beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-vendor-certificate");
  await Promise.all([AuditEventModel, AiEstimatorKnowledgeVendorModel, AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeDisplayOrderSequenceModel, ProcurementVendorCertificateUploadModel, ProcurementVendorCertificateCleanupModel, ProcurementVendorSaveCommandModel].map(model => model.syncIndexes()));
  const document = await PDFDocument.create(); document.addPage([100, 100]);
  const data = Buffer.from(await document.save());
  certificate = { data, sizeBytes: data.length, extension: ".pdf", mimeType: "application/pdf", originalFilename: "synthetic-msme.pdf" };
}, 120_000);
beforeEach(async () => {
  await replica.clear(); at = new Date("2026-09-25T12:00:00.000Z");
  root = await mkdtemp(path.join(tmpdir(), "lisno-vendor-certificate-test-")); storage = createLocalStorage(root);
  const basket = await reference.createBasket(actor, { name: "Synthetic certificates basket" });
  const subBasket = await reference.createSubBasket(actor, basket.id, { name: "Synthetic certificates sub-basket" });
  profile = { ...vendorProfileFixture(), mainBasketId: basket.id, subBasketId: subBasket.id, msmeRegistered: true, gstRegistered: true, gstNumber: "27ABCDE1234F1Z5" };
});
afterEach(async () => { vi.restoreAllMocks(); if (root) await rm(root, { recursive: true, force: true }); });
afterAll(async () => { await replica?.stop(); });

describe("transactional private MSME certificate lifecycle", () => {
  it("reserves before writing, stages once, consumes atomically, and replays the original create result", async () => {
    const write = storage.managed.write;
    const writes = vi.spyOn(storage.managed, "write").mockImplementation(async (target, source, options) => {
      expect(await ProcurementVendorCertificateUploadModel.exists({ storageReference: target, status: "uploading" })).toBeTruthy();
      return write(target, source, options);
    });
    const { vendor, staged, input, certificateId } = await createCertified();
    expect(await service().stage(actor, { idempotencyKey: "create-certificate-upload" }, certificate)).toEqual(staged);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(await reference.createMaster(actor, "vendors", input)).toEqual(vendor);
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(1);
    expect(await events(vendor.id)).toBe(1);
    expect(await ProcurementVendorSaveCommandModel.countDocuments()).toBe(1);
    expect(await ProcurementVendorCertificateUploadModel.findOne({ uploadId: staged.uploadId }).lean()).toMatchObject({ status: "consumed", consumedByVendorId: vendor.id });
    expect(await bytes(vendor.id, certificateId)).toEqual(certificate.data);
    const detail = await reference.getVendorDetail(actor, vendor.id);
    expect(detail.msmeCertificate).toMatchObject({ id: certificateId, originalFilename: certificate.originalFilename, mimeType: "application/pdf" });
    expect(certificateId).not.toBe(staged.uploadId);
    expect(detail.procurementSummary.profileComplete).toBe(true);
    const page = await reference.listMasters(actor, "vendors", {}, { limit: 20, offset: 0 });
    const sensitive = ["storageReference", "sha256", "uploadedById", profile.gstNumber!, certificate.originalFilename, staged.uploadId];
    for (const value of sensitive) expect(JSON.stringify({ page, vendor, receipts: await ProcurementVendorSaveCommandModel.find().lean(), audit: await AuditEventModel.find().lean() })).not.toContain(value);
    expect(JSON.stringify(detail)).not.toContain("storageReference");
    expect(JSON.stringify(detail)).not.toContain("sha256");
    await expect(reference.createMaster(actor, "vendors", { ...input, name: "Changed command" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(service().stage(actor, { idempotencyKey: "create-certificate-upload" }, { ...certificate, originalFilename: "changed.pdf" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("requires certificate evidence on direct profile writes and rejects contradictory or unrelated commands", async () => {
    await expect(reference.createMaster(actor, "vendors", { name: "Missing evidence", procurementProfile: profile })).rejects.toMatchObject({ code: "VENDOR_CERTIFICATE_INVALID" });
    const staged = await service().stage(actor, { idempotencyKey: "required-certificate" }, certificate);
    await expect(reference.createMaster(actor, "vendors", { name: "Missing save identity", procurementProfile: profile, msmeCertificateUploadId: staged.uploadId })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(reference.createMaster(actor, "vendors", { name: "Contradictory evidence", procurementProfile: { ...profile, msmeRegistered: false }, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "contradictory-save" })).rejects.toMatchObject({ code: "VENDOR_CERTIFICATE_INVALID" });
    await expect(reference.createMaster(actor, "vendors", { name: "No profile", msmeCertificateUploadId: staged.uploadId, idempotencyKey: "no-profile-save" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(reference.createMaster(actor, "uoms", { code: "SYN", name: "Wrong master", decimalScale: 0, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "wrong-master-save" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(0);
    expect(await ProcurementVendorCertificateUploadModel.findOne({ uploadId: staged.uploadId }).lean()).toMatchObject({ status: "ready" });
  });

  it("rejects cross-owner, cross-vendor, consumed, wrong-operation, and stale-version upload identities", async () => {
    const { vendor, staged: consumed, certificateId } = await createCertified();
    const other = await reference.createMaster(actor, "vendors", { name: "Other target" });
    const staged = await service().stage(actor, { vendorId: vendor.id, expectedVersion: 1, idempotencyKey: "bound-update-upload" }, certificate);
    const command = { expectedVersion: 1, procurementProfile: profile, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "bound-update-save" };
    await expect(reference.updateMaster(otherActor, "vendors", vendor.id, command)).rejects.toMatchObject({ code: "VENDOR_CERTIFICATE_INVALID" });
    await expect(reference.updateMaster(actor, "vendors", other.id, command)).rejects.toMatchObject({ code: "VENDOR_CERTIFICATE_INVALID" });
    await expect(reference.createMaster(actor, "vendors", { name: "Wrong create target", procurementProfile: profile, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "wrong-create-save" })).rejects.toMatchObject({ code: "VENDOR_CERTIFICATE_INVALID" });
    await expect(reference.createMaster(actor, "vendors", { name: "Consumed identity", procurementProfile: profile, msmeCertificateUploadId: consumed.uploadId, idempotencyKey: "consumed-upload-save" })).rejects.toMatchObject({ code: "VENDOR_CERTIFICATE_INVALID" });
    await reference.updateMaster(actor, "vendors", vendor.id, { expectedVersion: 1, description: "Concurrent metadata change" });
    await expect(reference.updateMaster(actor, "vendors", vendor.id, command)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(reference.updateMaster(actor, "vendors", vendor.id, { ...command, expectedVersion: 2 })).rejects.toMatchObject({ code: "VENDOR_CERTIFICATE_INVALID" });
    await expect(service().stage(actor, { vendorId: vendor.id, expectedVersion: 1, idempotencyKey: "stale-stage-upload" }, certificate)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect((await row(vendor.id)).msmeCertificate.id).toBe(certificateId);
  });

  it("retains existing evidence, replays an update before stale checks, and detaches only on a successful No save", async () => {
    const { vendor, certificateId } = await createCertified();
    const previous = (await row(vendor.id)).msmeCertificate;
    const input = { expectedVersion: 1, procurementProfile: { ...profile, position: "Director" }, idempotencyKey: "retain-certificate-save" };
    const updated = await reference.updateMaster(actor, "vendors", vendor.id, input);
    expect(updated.version).toBe(2);
    expect(await reference.updateMaster(actor, "vendors", vendor.id, input)).toEqual(updated);
    expect(await events(vendor.id)).toBe(2);
    expect((await row(vendor.id)).msmeCertificate.id).toBe(certificateId);
    expect(await ProcurementVendorCertificateCleanupModel.countDocuments()).toBe(0);
    await reference.updateMaster(actor, "vendors", vendor.id, { expectedVersion: 2, procurementProfile: { ...profile, msmeRegistered: false }, idempotencyKey: "detach-certificate-save" });
    expect((await reference.getVendorDetail(actor, vendor.id)).msmeCertificate).toBeNull();
    await expect(service().open(actor, vendor.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await service().cleanup()).toEqual({ deleted: 1, failed: 0 });
    await expect(storage.managed.stat(previous.storageReference)).rejects.toBeTruthy();
  });

  it("keeps previous evidence while staging replacement and rejects stale download revisions after commit", async () => {
    const { vendor, certificateId: initialId } = await createCertified();
    const previous = (await row(vendor.id)).msmeCertificate;
    const staged = await service().stage(actor, { vendorId: vendor.id, expectedVersion: 1, idempotencyKey: "replacement-upload" }, certificate);
    expect((await row(vendor.id)).msmeCertificate.id).toBe(initialId);
    expect(await bytes(vendor.id, initialId)).toEqual(certificate.data);
    const command = { expectedVersion: 1, procurementProfile: profile, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "replacement-save" };
    const updated = await reference.updateMaster(actor, "vendors", vendor.id, command);
    expect(await reference.updateMaster(actor, "vendors", vendor.id, command)).toEqual(updated);
    expect(await events(vendor.id)).toBe(2);
    const replacementId = String((await row(vendor.id)).msmeCertificate.id);
    expect(replacementId).not.toBe(initialId);
    await expect(service().open(actor, vendor.id, initialId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await bytes(vendor.id, replacementId)).toEqual(certificate.data);
    expect(await service().cleanup()).toEqual({ deleted: 1, failed: 0 });
    await expect(storage.managed.stat(previous.storageReference)).rejects.toBeTruthy();
    expect(await bytes(vendor.id, replacementId)).toEqual(certificate.data);
  });

  it("rolls back replacement, receipt, retirement, and consume together when audit fails", async () => {
    const { vendor, certificateId: initialId } = await createCertified();
    const staged = await service().stage(actor, { vendorId: vendor.id, expectedVersion: 1, idempotencyKey: "rollback-upload" }, certificate);
    const command = { expectedVersion: 1, procurementProfile: profile, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "rollback-save" };
    const failingReference = createAiEstimatorKnowledgeReferenceService({ actorGuard, now: () => at, audit: { appendInMongoTransaction: async () => { throw new Error("Synthetic audit failure"); } } });
    await expect(failingReference.updateMaster(actor, "vendors", vendor.id, command)).rejects.toThrow("Synthetic audit failure");
    expect(await row(vendor.id)).toMatchObject({ version: 1, msmeCertificate: { id: initialId } });
    expect(await ProcurementVendorCertificateUploadModel.findOne({ uploadId: staged.uploadId }).lean()).toMatchObject({ status: "ready", consumedByVendorId: null });
    expect(await ProcurementVendorCertificateCleanupModel.countDocuments()).toBe(0);
    expect(await ProcurementVendorSaveCommandModel.countDocuments()).toBe(1);
    expect(await events(vendor.id)).toBe(1);
    expect(await reference.updateMaster(actor, "vendors", vendor.id, command)).toMatchObject({ version: 2 });
  });

  it("replays a committed create after its response is lost without duplicate vendor or audit", async () => {
    const staged = await service().stage(actor, { idempotencyKey: "uncertain-create-upload" }, certificate);
    const command = { name: "Uncertain create", procurementProfile: profile, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "uncertain-create-save" };
    const uncertain = createAiEstimatorKnowledgeReferenceService({ actorGuard, audit, now: () => at, startSession: async () => {
      const session = await mongoose.startSession();
      const original = session.withTransaction.bind(session);
      session.withTransaction = (async (...args: Parameters<typeof original>) => {
        await original(...args); throw new Error("Synthetic lost commit response");
      }) as typeof session.withTransaction;
      return session;
    } });
    await expect(uncertain.createMaster(actor, "vendors", command)).rejects.toThrow("Synthetic lost commit response");
    const saved = await reference.createMaster(actor, "vendors", command);
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(1);
    expect(await events()).toBe(1);
    expect(await bytes(saved.id)).toEqual(certificate.data);
    expect(await service().cleanup()).toEqual({ deleted: 0, failed: 0 });
  });

  it("converges concurrent saves on one receipt and permits only one competing version update", async () => {
    const staged = await service().stage(actor, { idempotencyKey: "concurrent-save-upload" }, certificate);
    const command = { name: "Concurrent create", procurementProfile: profile, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "concurrent-create-save" };
    const [first, second] = await Promise.all([reference.createMaster(actor, "vendors", command), reference.createMaster(actor, "vendors", command)]);
    expect(second).toEqual(first);
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(1);
    expect(await events(first.id)).toBe(1);
    const updates = await Promise.allSettled([
      reference.updateMaster(actor, "vendors", first.id, { expectedVersion: 1, procurementProfile: { ...profile, position: "Director" }, idempotencyKey: "competing-update-one" }),
      reference.updateMaster(actor, "vendors", first.id, { expectedVersion: 1, procurementProfile: { ...profile, position: "Manager" }, idempotencyKey: "competing-update-two" })
    ]);
    expect(updates.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(updates.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    expect(await events(first.id)).toBe(2);
    expect(await ProcurementVendorSaveCommandModel.countDocuments()).toBe(2);
    expect(await bytes(first.id)).toEqual(certificate.data);
  });

  it("checks current authority before returning an old receipt and scopes the receipt to its actor", async () => {
    const { vendor, input } = await createCertified();
    const revoked = createAiEstimatorKnowledgeReferenceService({ audit, now: () => at, actorGuard: { ...actorGuard, requireMutationActor: async () => { throw new ApiError(403, "FORBIDDEN", "Synthetic revoked actor."); } } });
    await expect(revoked.createMaster(actor, "vendors", input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reference.createMaster(otherActor, "vendors", { ...input, name: "Other actor retry" })).rejects.toMatchObject({ code: "VENDOR_CERTIFICATE_INVALID" });
    expect(await reference.createMaster(actor, "vendors", { ...input, procurementProfile: { ...profile, gstNumber: " 27abcde1234f1z5 " } })).toEqual(vendor);
    expect(await events(vendor.id)).toBe(1);
    expect(await ProcurementVendorSaveCommandModel.countDocuments()).toBe(1);
  });

  it("recovers an uncertain ready-upload commit without retiring its ready object", async () => {
    let transactions = 0;
    const uncertain = service({ startSession: async () => {
      const session = await mongoose.startSession(); const original = session.withTransaction.bind(session); const index = ++transactions;
      session.withTransaction = (async (...args: Parameters<typeof original>) => {
        const result = await original(...args);
        if (index === 2) throw new Error("Synthetic lost staging response");
        return result;
      }) as typeof session.withTransaction;
      return session;
    } });
    const staged = await uncertain.stage(actor, { idempotencyKey: "uncertain-ready-upload" }, certificate);
    expect(await ProcurementVendorCertificateUploadModel.findOne({ uploadId: staged.uploadId }).lean()).toMatchObject({ status: "ready" });
    expect(await ProcurementVendorCertificateCleanupModel.countDocuments()).toBe(0);
    const saved = await reference.createMaster(actor, "vendors", { name: "Uncertain ready vendor", procurementProfile: profile, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "uncertain-ready-save" });
    expect(await bytes(saved.id)).toEqual(certificate.data);
  });

  it("records failed storage cleanup and retries without deleting current evidence", async () => {
    const { vendor } = await createCertified();
    const replacement = await service().stage(actor, { vendorId: vendor.id, expectedVersion: 1, idempotencyKey: "cleanup-replacement-upload" }, certificate);
    await reference.updateMaster(actor, "vendors", vendor.id, { expectedVersion: 1, procurementProfile: profile, msmeCertificateUploadId: replacement.uploadId, idempotencyKey: "cleanup-replacement-save" });
    const remove = vi.spyOn(storage.managed, "remove").mockRejectedValue(new Error("Synthetic deletion outage"));
    expect(await service().cleanup()).toEqual({ deleted: 0, failed: 1 });
    expect(await ProcurementVendorCertificateCleanupModel.findOne().lean()).toMatchObject({ status: "pending", lastError: "STORAGE_DELETE_FAILED", attempts: 1 });
    expect(await bytes(vendor.id)).toEqual(certificate.data);
    remove.mockRestore(); at = new Date(at.getTime() + 61_000);
    expect(await service().cleanup()).toEqual({ deleted: 1, failed: 0 });
    expect(await bytes(vendor.id)).toEqual(certificate.data);
  });

  it("expires unused staging before deletion and cannot consume or reuse its retired identity", async () => {
    const staged = await service().stage(actor, { idempotencyKey: "expired-upload" }, certificate);
    const previous = (await ProcurementVendorCertificateUploadModel.findOne({ uploadId: staged.uploadId }).lean())!;
    at = new Date(staged.expiresAt);
    await expect(reference.createMaster(actor, "vendors", { name: "Expired evidence", procurementProfile: profile, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "expired-save" })).rejects.toMatchObject({ code: "VENDOR_CERTIFICATE_INVALID" });
    expect(await service().cleanup()).toEqual({ deleted: 1, failed: 0 });
    expect(await ProcurementVendorCertificateUploadModel.findOne({ uploadId: staged.uploadId }).lean()).toMatchObject({ status: "expired" });
    await expect(storage.managed.stat(previous.storageReference)).rejects.toBeTruthy();
    const retry = await service().stage(actor, { idempotencyKey: "expired-upload" }, certificate);
    expect(retry.uploadId).not.toBe(staged.uploadId);
    expect(await ProcurementVendorCertificateUploadModel.findOne({ uploadId: retry.uploadId }).lean()).toMatchObject({ generation: 2, status: "ready" });
  });

  it("compensates a failed replacement upload and preserves the previously attached certificate", async () => {
    const { vendor, certificateId: initialId } = await createCertified();
    const write = vi.spyOn(storage.managed, "write").mockRejectedValueOnce(new Error("Synthetic upload failure"));
    await expect(service().stage(actor, { vendorId: vendor.id, expectedVersion: 1, idempotencyKey: "retry-failed-upload" }, certificate)).rejects.toThrow("Synthetic upload failure");
    expect(await row(vendor.id)).toMatchObject({ version: 1, msmeCertificate: { id: initialId } });
    expect(await bytes(vendor.id)).toEqual(certificate.data);
    expect(await ProcurementVendorCertificateCleanupModel.countDocuments({ status: "deleted" })).toBe(1);
    write.mockRestore();
    const retry = await service().stage(actor, { vendorId: vendor.id, expectedVersion: 1, idempotencyKey: "retry-failed-upload" }, certificate);
    expect(await ProcurementVendorCertificateUploadModel.findOne({ uploadId: retry.uploadId }).lean()).toMatchObject({ generation: 2, status: "ready" });
  });

  it("rechecks authority and archive state before staging and after bytes are written", async () => {
    const { vendor } = await createCertified();
    let checks = 0;
    const revoked = service({ actorGuard: { ...actorGuard, requireMutationActor: async () => {
      if (++checks === 2) throw new ApiError(403, "FORBIDDEN", "Synthetic revoked actor.");
      return actor;
    } } });
    await expect(revoked.stage(actor, { vendorId: vendor.id, expectedVersion: 1, idempotencyKey: "revoked-upload" }, certificate)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await ProcurementVendorCertificateCleanupModel.countDocuments({ status: "deleted" })).toBe(1);
    const deny = service({ actorGuard: { ...actorGuard, requireReadActor: async () => { throw new ApiError(403, "FORBIDDEN", "Synthetic denied actor."); } } });
    const open = vi.spyOn(storage.managed, "open");
    await expect(deny.open(actor, vendor.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(open).not.toHaveBeenCalled();
    await reference.archiveMaster(actor, "vendors", vendor.id, { expectedVersion: 1, reason: "Synthetic archive" });
    await expect(service().stage(actor, { vendorId: vendor.id, expectedVersion: 2, idempotencyKey: "archived-upload" }, certificate)).rejects.toMatchObject({ code: "RESOURCE_ARCHIVED" });
    expect(await bytes(vendor.id)).toEqual(certificate.data);
  });

  it("returns one staged identity for simultaneous identical upload requests", async () => {
    const input = { idempotencyKey: "simultaneous-upload" };
    const outcomes = await Promise.allSettled([service().stage(actor, input, certificate), service().stage(actor, input, certificate)]);
    expect(outcomes.some(result => result.status === "fulfilled")).toBe(true);
    for (const outcome of outcomes) if (outcome.status === "rejected") expect(outcome.reason).toMatchObject({ code: "VENDOR_CERTIFICATE_IN_PROGRESS" });
    const replay = await service().stage(actor, input, certificate);
    for (const outcome of outcomes) if (outcome.status === "fulfilled") expect(outcome.value).toEqual(replay);
    expect(await ProcurementVendorCertificateUploadModel.countDocuments()).toBe(1);
  });

  it("lets a committed consume win against cleanup that already selected the ready intent", async () => {
    const staged = await service().stage(actor, { idempotencyKey: "consume-cleanup-race" }, certificate);
    const saveAt = new Date(at);
    const consumed = deferred(); const allowCommit = deferred(); const cleanupStarted = deferred();
    const saving = createAiEstimatorKnowledgeReferenceService({ actorGuard, now: () => saveAt, audit: { appendInMongoTransaction: async (...args) => {
      await audit.appendInMongoTransaction(...args); consumed.resolve(); await allowCommit.promise;
    } } });
    const savePromise = saving.createMaster(actor, "vendors", { name: "Cleanup race", procurementProfile: profile, msmeCertificateUploadId: staged.uploadId, idempotencyKey: "consume-cleanup-save" });
    await consumed.promise;
    at = new Date(staged.expiresAt);
    const cleaner = service({ startSession: async () => { const session = await mongoose.startSession(); cleanupStarted.resolve(); return session; } });
    const cleanupPromise = cleaner.cleanup();
    await cleanupStarted.promise; allowCommit.resolve();
    const [saved, cleanup] = await Promise.all([savePromise, cleanupPromise]);
    expect(cleanup).toEqual({ deleted: 0, failed: 0 });
    expect(await ProcurementVendorCertificateUploadModel.findOne({ uploadId: staged.uploadId }).lean()).toMatchObject({ status: "consumed" });
    expect(await bytes(saved.id)).toEqual(certificate.data);
    expect(await ProcurementVendorCertificateCleanupModel.countDocuments()).toBe(0);
  });

  it("tombstones an expired in-flight target so a late writer cannot publish bytes", async () => {
    const writerStarted = deferred(); const releaseWriter = deferred();
    const original = storage.managed.write;
    let target = "";
    vi.spyOn(storage.managed, "write").mockImplementation(async (reference, source, options) => {
      target = reference; writerStarted.resolve(); await releaseWriter.promise;
      return original(reference, source, options);
    });
    const outcome = service().stage(actor, { idempotencyKey: "late-writer-upload" }, certificate).then(value => ({ value }), error => ({ error }));
    await writerStarted.promise;
    at = new Date(at.getTime() + 120_001);
    expect(await service().cleanup()).toEqual({ deleted: 1, failed: 0 });
    releaseWriter.resolve();
    expect(await outcome).toHaveProperty("error");
    await expect(storage.managed.stat(target)).rejects.toBeTruthy();
    expect(await ProcurementVendorCertificateUploadModel.findOne().lean()).toMatchObject({ status: "expired" });
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(0);
  });
});
