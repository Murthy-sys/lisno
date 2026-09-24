import type { Readable } from "node:stream";
import sharp, { type Metadata } from "sharp";

import { hasPermission } from "../domain/authorization.js";
import {
  detectProfilePhotoType,
  PROFILE_PHOTO_LIMITS,
  profilePhotoDimensionsAllowed,
  profilePhotoEtag
} from "../domain/profile-photo-policy.js";
import { ApiError } from "../middleware/errors.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  type AppRepository
} from "../repositories/types.js";
import type { FileStorage } from "../storage/storage.js";
import type { AuditService } from "./audit.service.js";
import { toPublicUser, type PublicUser } from "./auth.service.js";
import type { Clock } from "./workflow.js";

export type ProfilePhotoCleanupStage = "compensation" | "previous_object";

export interface ProfilePhotoServiceDependencies {
  repository: AppRepository;
  audit: AuditService;
  storage: Pick<FileStorage, "saveGenerated" | "delete" | "open">;
  clock: Clock;
  /** Receives only the stage; storage keys are never reported. */
  reportOrphan?: (stage: ProfilePhotoCleanupStage) => void;
}

export interface ProfilePhotoDescriptor {
  version: number;
  etag: string;
}

export interface ProfilePhotoService {
  replace(actor: PublicUser, data: Buffer): Promise<PublicUser>;
  remove(actor: PublicUser): Promise<PublicUser>;
  /** Returns null for an unknown user, no photo, or a user the actor cannot see. */
  describe(actor: PublicUser, userId: string): Promise<ProfilePhotoDescriptor | null>;
  open(actor: PublicUser, userId: string): Promise<(ProfilePhotoDescriptor & { stream: Readable }) | null>;
}

const SAFE_PIXEL_LIMIT = PROFILE_PHOTO_LIMITS.maxDimension * PROFILE_PHOTO_LIMITS.maxDimension;

export const invalidProfilePhoto = (): ApiError =>
  new ApiError(400, "PROFILE_PHOTO_INVALID", "Choose a JPEG, PNG, or WebP image up to 4096 × 4096 pixels.");
export const profilePhotoTooLarge = (): ApiError =>
  new ApiError(413, "PROFILE_PHOTO_TOO_LARGE", "Choose an image of 5 MB or less.");
const profilePhotoConflict = (): ApiError =>
  new ApiError(409, "PROFILE_PHOTO_CONFLICT", "Your profile photo changed at the same time. Try again.");
const profilePhotoUserNotFound = (): ApiError =>
  new ApiError(404, "NOT_FOUND", "The requested resource was not found.");

/** Decodes a validated source image and re-encodes it without metadata; the original bytes are never stored. */
export async function processProfilePhoto(data: Buffer): Promise<Buffer> {
  if (data.length > PROFILE_PHOTO_LIMITS.maxFileBytes) throw profilePhotoTooLarge();
  const detected = detectProfilePhotoType(data);
  if (!detected) throw invalidProfilePhoto();
  const decoderOptions = { failOn: "error", limitInputPixels: SAFE_PIXEL_LIMIT, pages: 1 } as const;
  let metadata: Metadata;
  try { metadata = await sharp(data, decoderOptions).metadata(); }
  catch { throw invalidProfilePhoto(); }
  if (`image/${metadata.format}` !== detected || !profilePhotoDimensionsAllowed(metadata.width, metadata.height)) {
    throw invalidProfilePhoto();
  }
  try {
    return await sharp(data, decoderOptions)
      .rotate()
      .resize(PROFILE_PHOTO_LIMITS.outputSize, PROFILE_PHOTO_LIMITS.outputSize, { fit: "cover", position: "centre" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: PROFILE_PHOTO_LIMITS.outputQuality })
      .toBuffer();
  } catch {
    throw invalidProfilePhoto();
  }
}

export function createProfilePhotoService(dependencies: ProfilePhotoServiceDependencies): ProfilePhotoService {
  const { repository, audit, storage, clock } = dependencies;
  const reportOrphan = dependencies.reportOrphan ?? ((stage: ProfilePhotoCleanupStage) => {
    console.warn(`[profile-photo] orphan-cleanup-failed ${stage}`);
  });
  const removeObject = async (reference: string, stage: ProfilePhotoCleanupStage) => {
    try { await storage.delete(reference); }
    catch { try { reportOrphan(stage); } catch { /* reporting must not fail the request */ } }
  };
  const mapRepositoryError = (error: unknown): unknown => {
    if (error instanceof RepositoryConflictError) return profilePhotoConflict();
    if (error instanceof RepositoryNotFoundError) return profilePhotoUserNotFound();
    return error;
  };

  const visiblePhoto = async (actor: PublicUser, userId: string) => {
    const targetId = userId === "self" ? actor.id : userId;
    if (targetId !== actor.id && !hasPermission(actor.role, "identity.users.read")) return null;
    const state = await repository.findUserProfilePhotoState(targetId);
    if (!state?.photo) return null;
    return { targetId, photo: state.photo };
  };

  return {
    async replace(actor, data) {
      const processed = await processProfilePhoto(data);
      const state = await repository.findUserProfilePhotoState(actor.id);
      if (!state) throw profilePhotoUserNotFound();
      const stored = await storage.saveGenerated({ data: processed, extension: ".jpg" });
      const occurredAt = clock().toISOString();
      let updated;
      try {
        updated = await repository.runInTransaction(async (transaction) => {
          const user = await transaction.setUserProfilePhoto(actor.id, state.revision, {
            storageKey: stored.reference,
            updatedAt: occurredAt
          });
          await audit.append({
            actorId: actor.id,
            action: "identity.profile_photo.updated",
            entityType: "user",
            entityId: actor.id,
            occurredAt,
            oldValues: state.photo ? { profilePhotoVersion: state.photo.version } : {},
            newValues: { profilePhotoVersion: user.profilePhoto!.version }
          }, transaction);
          return user;
        });
      } catch (error) {
        await removeObject(stored.reference, "compensation");
        throw mapRepositoryError(error);
      }
      if (state.photo) await removeObject(state.photo.storageKey, "previous_object");
      return toPublicUser(updated);
    },

    async remove(actor) {
      const state = await repository.findUserProfilePhotoState(actor.id);
      if (!state) throw profilePhotoUserNotFound();
      if (!state.photo) {
        const current = await repository.findUserById(actor.id);
        if (!current) throw profilePhotoUserNotFound();
        return toPublicUser(current);
      }
      const previous = state.photo;
      const occurredAt = clock().toISOString();
      let updated;
      try {
        updated = await repository.runInTransaction(async (transaction) => {
          const user = await transaction.clearUserProfilePhoto(actor.id, state.revision);
          await audit.append({
            actorId: actor.id,
            action: "identity.profile_photo.removed",
            entityType: "user",
            entityId: actor.id,
            occurredAt,
            oldValues: { profilePhotoVersion: previous.version },
            newValues: {}
          }, transaction);
          return user;
        });
      } catch (error) {
        throw mapRepositoryError(error);
      }
      await removeObject(previous.storageKey, "previous_object");
      return toPublicUser(updated);
    },

    async describe(actor, userId) {
      const visible = await visiblePhoto(actor, userId);
      if (!visible) return null;
      return { version: visible.photo.version, etag: profilePhotoEtag(visible.targetId, visible.photo.version) };
    },

    async open(actor, userId) {
      const visible = await visiblePhoto(actor, userId);
      if (!visible) return null;
      let stream: Readable;
      try { stream = await storage.open(visible.photo.storageKey); }
      catch { return null; }
      return {
        version: visible.photo.version,
        etag: profilePhotoEtag(visible.targetId, visible.photo.version),
        stream
      };
    }
  };
}
