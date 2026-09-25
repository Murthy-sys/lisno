import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import mongoose, { type ClientSession } from "mongoose";
import type { ProcurementVendorCertificateDescriptor, ProcurementVendorCertificateUploadPolicy, ProcurementVendorCertificateUploadResult } from "../contracts/procurement-vendor.js";
import { ApiError } from "../middleware/errors.js";
import { validateUploadedFile, type ValidatedUpload } from "../middleware/upload.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProcurementVendorCertificateCleanupModel, ProcurementVendorCertificateUploadModel } from "../models/ProcurementVendorCertificateUpload.js";
import { hasManagedStorage, type ManagedFileStorage } from "../storage/managed-storage.js";
import type { FileStorage } from "../storage/storage.js";
import { aiEstimatorKnowledgeActorGuard, type AiEstimatorKnowledgeActorGuard } from "./ai-estimator-knowledge-actor.js";
import type { PublicUser } from "./auth.service.js";
import { validateProcurementVendorPhoto } from "./procurement-vendor-photo.service.js";
import { systemClock, type Clock } from "./workflow.js";

type Row = Record<string, any>;
export const PROCUREMENT_VENDOR_CERTIFICATE_MIME_TYPES = new Set<ValidatedUpload["mimeType"]>(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const uploadLeaseMs = 120_000;
const readyLifetimeMs = 3_600_000;
export interface ProcurementVendorCertificateStageInput { vendorId?: string; expectedVersion?: number; idempotencyKey: string }
export interface ProcurementVendorCertificateService {
  authorize(actor: PublicUser): Promise<void>;
  policy(actor: PublicUser): Promise<ProcurementVendorCertificateUploadPolicy>;
  stage(actor: PublicUser, input: ProcurementVendorCertificateStageInput, file: ValidatedUpload): Promise<ProcurementVendorCertificateUploadResult>;
  open(actor: PublicUser, vendorId: string, revision?: string): Promise<{ descriptor: ProcurementVendorCertificateDescriptor; stream: Readable }>;
  cleanup(): Promise<{ deleted: number; failed: number }>;
}
export interface ProcurementVendorCertificateServiceDependencies {
  storage: FileStorage; maxUploadBytes: number; actorGuard?: AiEstimatorKnowledgeActorGuard;
  now?: Clock; startSession?: () => Promise<ClientSession>;
}
function invalidUpload(): never { throw new ApiError(400, "VENDOR_CERTIFICATE_INVALID", "Upload a valid MSME certificate before saving.", { msmeCertificate: "Upload a valid MSME certificate before saving." }); }
function notFound(): never { throw new ApiError(404, "NOT_FOUND", "The requested MSME certificate was not found."); }
function conflict(): never { throw new ApiError(409, "VERSION_CONFLICT", "The vendor changed elsewhere. Reload and try again."); }

export function procurementVendorCertificateDescriptor(vendorId: string, value: unknown): ProcurementVendorCertificateDescriptor | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Row;
  return { id: String(row.id), originalFilename: String(row.originalFilename), mimeType: row.mimeType,
    byteSize: Number(row.byteSize), uploadedAt: String(row.uploadedAt),
    url: `/api/v1/admin/ai-estimator-knowledge/vendors/${encodeURIComponent(vendorId)}/msme-certificate?v=${encodeURIComponent(String(row.id))}` };
}
async function scheduleCleanup(reference: string, vendorId: string | null, timestamp: Date, session: ClientSession) {
  await ProcurementVendorCertificateCleanupModel.updateOne({ _id: reference }, { $setOnInsert: { vendorId, status: "pending", attempts: 0, retryAt: timestamp, lastError: null } }, { upsert: true, session }).exec();
}

/** DB-only: the caller commits profile, certificate, audit, and save receipt in this same session. */
export async function consumeProcurementVendorCertificate(input: {
  actorId: string; vendorId: string; creating: boolean; expectedVersion?: number; registered: boolean;
  uploadId?: string; previous: unknown; now: Date; session: ClientSession;
}): Promise<Row | null> {
  const previous = input.previous && typeof input.previous === "object" ? input.previous as Row : null;
  if (!input.registered) {
    if (input.uploadId !== undefined) invalidUpload();
    if (previous?.storageReference) await scheduleCleanup(String(previous.storageReference), input.vendorId, input.now, input.session);
    return null;
  }
  if (!input.uploadId) {
    if (!previous?.id || !previous.storageReference) invalidUpload();
    return previous;
  }
  const upload = await ProcurementVendorCertificateUploadModel.findOneAndUpdate({
    uploadId: input.uploadId, actorId: input.actorId, vendorId: input.creating ? null : input.vendorId,
    expectedVersion: input.creating ? null : input.expectedVersion, status: "ready", expiresAt: { $gt: input.now }
  }, { $set: { status: "consumed", consumedByVendorId: input.vendorId } }, { session: input.session, returnDocument: "after" }).lean().exec() as Row | null;
  if (!upload) invalidUpload();
  if (previous?.storageReference) await scheduleCleanup(String(previous.storageReference), input.vendorId, input.now, input.session);
  return { id: upload.certificateId, storageReference: upload.storageReference, originalFilename: upload.originalFilename,
    mimeType: upload.mimeType, byteSize: upload.byteSize, sha256: upload.sha256,
    uploadedAt: upload.uploadedAt, uploadedById: upload.actorId };
}

export async function validateProcurementVendorCertificate(file: ValidatedUpload, maxBytes: number): Promise<ValidatedUpload> {
  if (file.data.length > maxBytes) throw new ApiError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the configured size limit.", { msmeCertificate: "Choose a smaller certificate." });
  const validated = await validateUploadedFile({ buffer: file.data, originalname: file.originalFilename, mimetype: file.mimeType, size: file.data.length }, { allowedDetectedMimeTypes: PROCUREMENT_VENDOR_CERTIFICATE_MIME_TYPES, fieldErrorKey: "msmeCertificate" });
  if (validated.mimeType !== "application/pdf") {
    try { return await validateProcurementVendorPhoto(validated, maxBytes); }
    catch { throw new ApiError(415, "VENDOR_CERTIFICATE_INVALID", "Choose a valid PDF, JPEG, PNG, or WebP certificate.", { msmeCertificate: "Choose a valid certificate." }); }
  }
  return validated;
}

export function createProcurementVendorCertificateService(dependencies: ProcurementVendorCertificateServiceDependencies): ProcurementVendorCertificateService {
  const actorGuard = dependencies.actorGuard ?? aiEstimatorKnowledgeActorGuard;
  const now = dependencies.now ?? systemClock;
  const startSession = dependencies.startSession ?? (() => mongoose.startSession());
  const storage = (): ManagedFileStorage => {
    if (!hasManagedStorage(dependencies.storage)) throw new ApiError(503, "VENDOR_CERTIFICATE_UNAVAILABLE", "MSME certificate storage is temporarily unavailable.");
    return dependencies.storage.managed;
  };
  async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await startSession();
    try { return (await session.withTransaction(() => work(session)))!; }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new ApiError(409, "VENDOR_CERTIFICATE_IN_PROGRESS", "This certificate upload is in progress. Retry the same request shortly.");
      throw error;
    } finally { await session.endSession(); }
  }
  const result = (row: Row): ProcurementVendorCertificateUploadResult => ({ uploadId: String(row.uploadId), originalFilename: String(row.originalFilename), mimeType: row.mimeType, byteSize: Number(row.byteSize), expiresAt: new Date(row.expiresAt).toISOString() });
  async function checkTarget(input: ProcurementVendorCertificateStageInput, session: ClientSession) {
    if (!input.vendorId) return;
    const vendor = await AiEstimatorKnowledgeVendorModel.findById(input.vendorId).session(session).lean().exec() as Row | null;
    if (!vendor) notFound();
    if (vendor.status === "archived") throw new ApiError(409, "RESOURCE_ARCHIVED", "Archived vendors are immutable.");
    if (vendor.version !== input.expectedVersion) conflict();
  }
  async function failIntent(commandId: string, generation: number) {
    return transaction(async session => {
      const row = await ProcurementVendorCertificateUploadModel.findById(commandId).session(session).lean().exec() as Row | null;
      if (row?.generation !== generation) return null;
      // An uncertain ready commit may already have been consumed. Neither state is orphaned.
      if (row.status === "ready" || row.status === "consumed") return result(row);
      if (row.status === "uploading") {
        await ProcurementVendorCertificateUploadModel.updateOne({ _id: commandId, generation, status: "uploading" }, { $set: { status: "failed" } }, { session }).exec();
        await scheduleCleanup(String(row.storageReference), row.vendorId, now(), session);
      }
      return null;
    });
  }
  async function cleanup(): Promise<{ deleted: number; failed: number }> {
    if (!hasManagedStorage(dependencies.storage)) return { deleted: 0, failed: 0 };
    const expired = await ProcurementVendorCertificateUploadModel.find({ status: { $in: ["uploading", "ready"] }, expiresAt: { $lte: now() } }).limit(20).lean().exec() as Row[];
    for (const row of expired) await transaction(async session => {
      // This write races atomically with consumption. Whichever commits first owns the target.
      const retired = await ProcurementVendorCertificateUploadModel.findOneAndUpdate({ _id: row._id, generation: row.generation, status: { $in: ["uploading", "ready"] }, expiresAt: { $lte: now() } }, { $set: { status: "expired" } }, { session, returnDocument: "after" }).lean().exec() as Row | null;
      if (retired) await scheduleCleanup(String(retired.storageReference), retired.vendorId, now(), session);
    });
    const rows = await ProcurementVendorCertificateCleanupModel.find({ status: "pending", retryAt: { $lte: now() } }).sort({ retryAt: 1 }).limit(20).lean().exec() as Row[];
    let deleted = 0, failed = 0;
    for (const row of rows) {
      if (await AiEstimatorKnowledgeVendorModel.exists({ "msmeCertificate.storageReference": row._id })) continue;
      try {
        await storage().remove(String(row._id));
        await ProcurementVendorCertificateCleanupModel.updateOne({ _id: row._id, status: "pending" }, { $set: { status: "deleted", lastError: null }, $inc: { attempts: 1 } }).exec();
        deleted++;
      } catch {
        await ProcurementVendorCertificateCleanupModel.updateOne({ _id: row._id, status: "pending" }, { $set: { lastError: "STORAGE_DELETE_FAILED", retryAt: new Date(now().getTime() + 60_000) }, $inc: { attempts: 1 } }).exec();
        failed++;
      }
    }
    return { deleted, failed };
  }
  return {
    async authorize(actor) { await actorGuard.requireReadActor(actor); },
    async policy(actor) { await actorGuard.requireReadActor(actor); return { maxUploadBytes: dependencies.maxUploadBytes, allowedMimeTypes: [...PROCUREMENT_VENDOR_CERTIFICATE_MIME_TYPES] as ProcurementVendorCertificateUploadPolicy["allowedMimeTypes"], uploadLifetimeSeconds: readyLifetimeMs / 1000 }; },
    async stage(actor, input, file) {
      await actorGuard.requireReadActor(actor);
      if (!/^[A-Za-z0-9_-]{8,200}$/u.test(input.idempotencyKey)) throw new ApiError(400, "VALIDATION_ERROR", "Use a stable certificate request identity.", { idempotencyKey: "Use 8 to 200 letters, digits, underscores, or hyphens." });
      if (input.vendorId ? !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion! < 1 : input.expectedVersion !== undefined) throw new ApiError(400, "VALIDATION_ERROR", "Use the current vendor version.", { expectedVersion: "Use the current vendor version." });
      const managed = storage();
      const validated = await validateProcurementVendorCertificate(file, dependencies.maxUploadBytes);
      const hash = createHash("sha256").update(validated.data).digest("hex");
      const fingerprint = createHash("sha256").update(JSON.stringify([input.expectedVersion ?? null, hash, validated.mimeType, validated.originalFilename])).digest("hex");
      const commandId = createHash("sha256").update(JSON.stringify([actor.id, input.vendorId ?? null, input.idempotencyKey])).digest("hex");
      const reserved = await transaction(async session => {
        await actorGuard.requireMutationActor(actor, session);
        const existing = await ProcurementVendorCertificateUploadModel.findById(commandId).session(session).lean().exec() as Row | null;
        if (existing && existing.fingerprint !== fingerprint) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This certificate request identity was used with different input.");
        if (existing?.status === "consumed") return { result: result(existing) };
        await checkTarget(input, session);
        if (existing?.status === "ready" && new Date(existing.expiresAt).getTime() > now().getTime()) return { result: result(existing) };
        if (existing?.status === "uploading" && new Date(existing.expiresAt).getTime() > now().getTime()) throw new ApiError(409, "VENDOR_CERTIFICATE_IN_PROGRESS", "This certificate upload is in progress. Retry the same request shortly.");
        if (existing) await scheduleCleanup(String(existing.storageReference), existing.vendorId, now(), session);
        const intent = { uploadId: randomUUID(), certificateId: randomUUID(), actorId: actor.id, vendorId: input.vendorId ?? null, expectedVersion: input.expectedVersion ?? null, fingerprint,
          status: "uploading", generation: Number(existing?.generation ?? 0) + 1, storageReference: managed.allocateTarget(), expiresAt: new Date(now().getTime() + uploadLeaseMs),
          originalFilename: validated.originalFilename, mimeType: validated.mimeType, byteSize: validated.sizeBytes, sha256: hash, uploadedAt: null, consumedByVendorId: null };
        await ProcurementVendorCertificateUploadModel.updateOne({ _id: commandId }, { $set: intent }, { session, upsert: true, runValidators: true }).exec();
        return { intent };
      });
      if (reserved.result) return reserved.result;
      const intent = reserved.intent!;
      try {
        const stored = await managed.write(intent.storageReference, Readable.from(validated.data), { expectedBytes: validated.sizeBytes, maxBytes: dependencies.maxUploadBytes, timeoutMs: uploadLeaseMs });
        if (stored.sha256 !== hash || stored.sizeBytes !== validated.sizeBytes) throw new Error("Certificate storage integrity check failed.");
        return await transaction(async session => {
          await actorGuard.requireMutationActor(actor, session);
          await checkTarget(input, session);
          const ready = await ProcurementVendorCertificateUploadModel.findOneAndUpdate({ _id: commandId, generation: intent.generation, status: "uploading", expiresAt: { $gt: now() } }, { $set: { status: "ready", uploadedAt: now().toISOString(), expiresAt: new Date(now().getTime() + readyLifetimeMs) } }, { session, returnDocument: "after" }).lean().exec() as Row | null;
          if (!ready) throw new ApiError(409, "VENDOR_CERTIFICATE_EXPIRED", "The certificate upload expired. Retry the same request.");
          return result(ready);
        });
      } catch (error) {
        const ready = await failIntent(commandId, intent.generation);
        if (ready) return ready;
        await cleanup().catch(() => {});
        throw error;
      }
    },
    async open(actor, vendorId, revision) {
      await actorGuard.requireReadActor(actor);
      const vendor = await AiEstimatorKnowledgeVendorModel.findById(vendorId).select({ msmeCertificate: 1 }).lean().exec() as Row | null;
      if (!vendor?.msmeCertificate || revision !== undefined && revision !== vendor.msmeCertificate.id) notFound();
      const descriptor = procurementVendorCertificateDescriptor(vendorId, vendor.msmeCertificate)!;
      const stream = await storage().open(String(vendor.msmeCertificate.storageReference)).catch(() => notFound());
      return { descriptor, stream };
    },
    cleanup
  };
}
