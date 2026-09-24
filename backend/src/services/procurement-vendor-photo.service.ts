import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import mongoose, { type ClientSession } from "mongoose";
import sharp from "sharp";
import type { ProcurementVendorPhotoDescriptor, ProcurementVendorPhotoMutationResult } from "../contracts/procurement-vendor.js";
import { ApiError } from "../middleware/errors.js";
import { validateUploadedFile, type ValidatedUpload } from "../middleware/upload.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProcurementVendorPhotoCleanupModel, ProcurementVendorPhotoIntentModel } from "../models/ProcurementVendorPhotoIntent.js";
import { hasManagedStorage, type ManagedFileStorage } from "../storage/managed-storage.js";
import type { FileStorage } from "../storage/storage.js";
import { aiEstimatorKnowledgeActorGuard, type AiEstimatorKnowledgeActorGuard } from "./ai-estimator-knowledge-actor.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { procurementVendorPhotoDescriptor } from "./procurement-vendor-profile.js";
import { systemClock, type Clock } from "./workflow.js";

type Row = Record<string, any>;
export const PROCUREMENT_VENDOR_PHOTO_MIME_TYPES = new Set<ValidatedUpload["mimeType"]>(["image/jpeg", "image/png", "image/webp"]);
export interface ProcurementVendorPhotoService {
  authorize(actor: PublicUser): Promise<void>;
  replace(actor: PublicUser, vendorId: string, input: { expectedVersion: number; idempotencyKey: string }, file: ValidatedUpload): Promise<ProcurementVendorPhotoMutationResult>;
  remove(actor: PublicUser, vendorId: string, input: { expectedVersion: number }): Promise<ProcurementVendorPhotoMutationResult>;
  open(actor: PublicUser, vendorId: string): Promise<{ descriptor: ProcurementVendorPhotoDescriptor; stream: Readable }>;
  cleanup(): Promise<{ deleted: number; failed: number }>;
}
export interface ProcurementVendorPhotoServiceDependencies {
  audit: Pick<AuditService, "appendInMongoTransaction">;
  storage: FileStorage;
  maxUploadBytes: number;
  actorGuard?: AiEstimatorKnowledgeActorGuard;
  now?: Clock;
  startSession?: () => Promise<ClientSession>;
}
const uploadLifetimeMs = 120_000;
function notFound(): never { throw new ApiError(404, "NOT_FOUND", "The requested vendor photo was not found."); };
function conflict(): never { throw new ApiError(409, "VERSION_CONFLICT", "The vendor changed elsewhere. Reload and try again."); };
function invalid(): never { throw new ApiError(400, "VENDOR_PHOTO_INVALID", "Choose a valid JPEG, PNG, or WebP image.", { photo: "Choose a valid JPEG, PNG, or WebP image." }); };

/** Decode the entire image for validation; persist the unmodified original, including EXIF/GPS. */
export async function validateProcurementVendorPhoto(file: ValidatedUpload, maxBytes: number): Promise<ValidatedUpload> {
  if (file.data.length > maxBytes) throw new ApiError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the configured size limit.", { photo: "Choose a smaller image." });
  const validated = await validateUploadedFile({ buffer: file.data, originalname: file.originalFilename, mimetype: file.mimeType, size: file.data.length }, { allowedDetectedMimeTypes: PROCUREMENT_VENDOR_PHOTO_MIME_TYPES, fieldErrorKey: "photo" });
  try {
    const image = sharp(validated.data, { failOn: "error", limitInputPixels: 40_000_000, pages: 1 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 16_384 || metadata.height > 16_384 || (metadata.pages ?? 1) > 1) invalid();
    await image.stats();
  } catch { invalid(); }
  return validated;
}

export function createProcurementVendorPhotoService(dependencies: ProcurementVendorPhotoServiceDependencies): ProcurementVendorPhotoService {
  const actorGuard = dependencies.actorGuard ?? aiEstimatorKnowledgeActorGuard;
  const now = dependencies.now ?? systemClock;
  const startSession = dependencies.startSession ?? (() => mongoose.startSession());
  const storage = (): ManagedFileStorage => {
    if (!hasManagedStorage(dependencies.storage)) throw new ApiError(503, "VENDOR_PHOTO_UNAVAILABLE", "Vendor photo storage is temporarily unavailable.");
    return dependencies.storage.managed;
  };
  async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await startSession();
    try { return (await session.withTransaction(() => work(session)))!; }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new ApiError(409, "VENDOR_PHOTO_IN_PROGRESS", "This photo request is being processed. Retry the same request shortly.");
      throw error;
    }
    finally { await session.endSession(); }
  }
  async function scheduleCleanup(reference: string, vendorId: string, session: ClientSession) {
    await ProcurementVendorPhotoCleanupModel.updateOne({ _id: reference }, { $setOnInsert: { vendorId, status: "pending", attempts: 0, retryAt: now(), lastError: null } }, { upsert: true, session }).exec();
  }
  const commandResult = (intent: Row): ProcurementVendorPhotoMutationResult => ({ vendorId: String(intent.vendorId), version: Number(intent.resultVersion), geoTaggedPicture: procurementVendorPhotoDescriptor(String(intent.vendorId), { id: intent.photoId, mimeType: intent.mimeType, byteSize: intent.byteSize, uploadedAt: intent.uploadedAt }) });
  async function settleFailed(commandId: string, generation: number) {
    return transaction(async session => {
      const intent = await ProcurementVendorPhotoIntentModel.findById(commandId).session(session).lean().exec() as Row | null;
      if (intent?.status === "committed") return commandResult(intent);
      if (intent && intent.generation === generation && intent.status === "uploading") {
        await ProcurementVendorPhotoIntentModel.updateOne({ _id: commandId, generation, status: "uploading" }, { $set: { status: "failed" } }, { session }).exec();
        await scheduleCleanup(String(intent.storageReference), String(intent.vendorId), session);
      }
      return null;
    });
  }
  async function cleanup(): Promise<{ deleted: number; failed: number }> {
    if (!hasManagedStorage(dependencies.storage)) return { deleted: 0, failed: 0 };
    const expired = await ProcurementVendorPhotoIntentModel.find({ status: "uploading", expiresAt: { $lte: now() } }).limit(20).lean().exec() as Row[];
    for (const intent of expired) await settleFailed(String(intent._id), Number(intent.generation));
    const rows = await ProcurementVendorPhotoCleanupModel.find({ status: "pending", retryAt: { $lte: now() } }).sort({ retryAt: 1 }).limit(20).lean().exec() as Row[];
    let deleted = 0, failed = 0;
    for (const row of rows) {
      // A target is never reused. Failed intents cannot publish it, and retired targets cannot be reattached.
      const attached = await AiEstimatorKnowledgeVendorModel.exists({ "geoTaggedPicture.storageReference": row._id });
      if (attached) continue;
      try {
        await storage().remove(String(row._id));
        await ProcurementVendorPhotoCleanupModel.updateOne({ _id: row._id, status: "pending" }, { $set: { status: "deleted", lastError: null }, $inc: { attempts: 1 } }).exec();
        deleted++;
      } catch {
        await ProcurementVendorPhotoCleanupModel.updateOne({ _id: row._id, status: "pending" }, { $set: { lastError: "STORAGE_DELETE_FAILED", retryAt: new Date(now().getTime() + 60_000) }, $inc: { attempts: 1 } }).exec();
        failed++;
      }
    }
    return { deleted, failed };
  }
  return {
    async authorize(actor) { await actorGuard.requireReadActor(actor); },
    async replace(actor, vendorId, input, file) {
      await actorGuard.requireReadActor(actor);
      validateVersion(input.expectedVersion);
      if (!/^[A-Za-z0-9_-]{8,200}$/u.test(input.idempotencyKey)) throw new ApiError(400, "VALIDATION_ERROR", "Use a stable photo request identity.", { idempotencyKey: "Use 8 to 200 letters, digits, underscores, or hyphens." });
      const managed = storage();
      const validated = await validateProcurementVendorPhoto(file, dependencies.maxUploadBytes);
      const hash = createHash("sha256").update(validated.data).digest("hex");
      const fingerprint = createHash("sha256").update(JSON.stringify([input.expectedVersion, hash, validated.mimeType, validated.sizeBytes, validated.originalFilename])).digest("hex");
      const commandId = createHash("sha256").update(JSON.stringify([vendorId, actor.id, input.idempotencyKey])).digest("hex");
      const reserved = await transaction(async session => {
        await actorGuard.requireMutationActor(actor, session);
        const existing = await ProcurementVendorPhotoIntentModel.findById(commandId).session(session).lean().exec() as Row | null;
        if (existing && existing.fingerprint !== fingerprint) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This photo request identity was used with different input.");
        if (existing?.status === "committed") return { result: commandResult(existing) };
        if (existing?.status === "uploading" && new Date(existing.expiresAt).getTime() > now().getTime()) throw new ApiError(409, "VENDOR_PHOTO_IN_PROGRESS", "This photo upload is still in progress. Retry the same request shortly.");
        const vendor = await AiEstimatorKnowledgeVendorModel.findById(vendorId).session(session).lean().exec() as Row | null;
        if (!vendor) notFound();
        if (vendor.status === "archived") throw new ApiError(409, "RESOURCE_ARCHIVED", "Archived vendors are immutable.");
        if (vendor.version !== input.expectedVersion) conflict();
        if (existing) await scheduleCleanup(String(existing.storageReference), vendorId, session);
        const intent = { vendorId, actorId: actor.id, fingerprint, status: "uploading", generation: Number(existing?.generation ?? 0) + 1, storageReference: managed.allocateTarget(), expiresAt: new Date(now().getTime() + uploadLifetimeMs), resultVersion: null, photoId: randomUUID(), mimeType: validated.mimeType, byteSize: validated.sizeBytes, uploadedAt: null };
        await ProcurementVendorPhotoIntentModel.updateOne({ _id: commandId }, { $set: intent }, { session, upsert: true, runValidators: true }).exec();
        return { intent };
      });
      if (reserved.result) return reserved.result;
      const intent = reserved.intent!;
      try {
        const stored = await managed.write(intent.storageReference, Readable.from(validated.data), { expectedBytes: validated.sizeBytes, maxBytes: dependencies.maxUploadBytes, timeoutMs: uploadLifetimeMs });
        if (stored.sha256 !== hash || stored.sizeBytes !== validated.sizeBytes) throw new Error("Vendor photo storage integrity check failed.");
        const result = await transaction(async session => {
          const authorized = await actorGuard.requireMutationActor(actor, session);
          const currentIntent = await ProcurementVendorPhotoIntentModel.findById(commandId).session(session).lean().exec() as Row | null;
          if (!currentIntent || currentIntent.status !== "uploading" || currentIntent.generation !== intent.generation || new Date(currentIntent.expiresAt).getTime() <= now().getTime()) throw new ApiError(409, "VENDOR_PHOTO_EXPIRED", "The photo upload expired. Retry the same photo request.");
          const timestamp = now().toISOString();
          const previous = await AiEstimatorKnowledgeVendorModel.findById(vendorId).session(session).lean().exec() as Row | null;
          if (!previous) notFound();
          const photo = { id: intent.photoId, storageReference: intent.storageReference, originalFilename: validated.originalFilename, mimeType: validated.mimeType, byteSize: validated.sizeBytes, sha256: hash, uploadedAt: timestamp, uploadedById: authorized.id };
          const updated = await AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: vendorId, version: input.expectedVersion, status: { $ne: "archived" } }, { $set: { geoTaggedPicture: photo, updatedById: authorized.id }, $inc: { version: 1, dependencyEpoch: 1 } }, { session, returnDocument: "after", runValidators: true }).lean().exec() as Row | null;
          if (!updated) conflict();
          if (previous.geoTaggedPicture?.storageReference) await scheduleCleanup(String(previous.geoTaggedPicture.storageReference), vendorId, session);
          await ProcurementVendorPhotoIntentModel.updateOne({ _id: commandId, generation: intent.generation, status: "uploading" }, { $set: { status: "committed", resultVersion: updated.version, uploadedAt: timestamp } }, { session }).exec();
          await dependencies.audit.appendInMongoTransaction({ actorId: authorized.id, action: "procurement_vendor_photo_updated", entityType: "ai_estimator_knowledge_vendor", entityId: vendorId, occurredAt: timestamp, oldValues: { photoId: previous.geoTaggedPicture?.id ?? null, version: previous.version }, newValues: { photoId: photo.id, version: updated.version } }, session);
          return { vendorId, version: Number(updated.version), geoTaggedPicture: procurementVendorPhotoDescriptor(vendorId, photo) };
        });
        await cleanup().catch(() => {}); // Durable pending records remain available to maintenance.
        return result;
      } catch (error) {
        // Resolve uncertain transaction outcomes before considering any object for deletion.
        const committed = await settleFailed(commandId, intent.generation);
        if (committed) return committed;
        await cleanup().catch(() => {});
        throw error;
      }
    },
    async remove(actor, vendorId, input) {
      validateVersion(input.expectedVersion);
      const result = await transaction(async session => {
        const authorized = await actorGuard.requireMutationActor(actor, session);
        const vendor = await AiEstimatorKnowledgeVendorModel.findById(vendorId).session(session).lean().exec() as Row | null;
        if (!vendor) notFound();
        if (vendor.version !== input.expectedVersion) conflict();
        if (vendor.status === "archived") throw new ApiError(409, "RESOURCE_ARCHIVED", "Archived vendors are immutable.");
        if (!vendor.geoTaggedPicture) return { vendorId, version: Number(vendor.version), geoTaggedPicture: null };
        const updated = await AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: vendorId, version: input.expectedVersion }, { $set: { geoTaggedPicture: null, updatedById: authorized.id }, $inc: { version: 1, dependencyEpoch: 1 } }, { session, returnDocument: "after" }).lean().exec() as Row | null;
        if (!updated) conflict();
        await scheduleCleanup(String(vendor.geoTaggedPicture.storageReference), vendorId, session);
        await dependencies.audit.appendInMongoTransaction({ actorId: authorized.id, action: "procurement_vendor_photo_removed", entityType: "ai_estimator_knowledge_vendor", entityId: vendorId, occurredAt: now().toISOString(), oldValues: { photoId: vendor.geoTaggedPicture.id, version: vendor.version }, newValues: { photoId: null, version: updated.version } }, session);
        return { vendorId, version: Number(updated.version), geoTaggedPicture: null };
      });
      await cleanup().catch(() => {});
      return result;
    },
    async open(actor, vendorId) {
      await actorGuard.requireReadActor(actor);
      const vendor = await AiEstimatorKnowledgeVendorModel.findById(vendorId).select({ geoTaggedPicture: 1 }).lean().exec() as Row | null;
      if (!vendor?.geoTaggedPicture) notFound();
      const descriptor = procurementVendorPhotoDescriptor(vendorId, vendor.geoTaggedPicture)!;
      const stream = await storage().open(String(vendor.geoTaggedPicture.storageReference)).catch(() => notFound());
      return { descriptor, stream };
    },
    cleanup
  };
}

function validateVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new ApiError(400, "VALIDATION_ERROR", "Use the current vendor version.", { expectedVersion: "Use a positive safe integer." });
}
