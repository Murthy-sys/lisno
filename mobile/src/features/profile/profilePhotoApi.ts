import type { PublicUser } from "../../contracts/session";
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
  type JsonApiClient
} from "../../core/http/apiClient";
import { parsePublicUser } from "../../core/session/authorization";
import {
  AssetPolicyError,
  OversizedAssetPolicyError,
  TransferHttpError,
  TransferSizeError,
  type AssetPolicy,
  type CancellableTransfer,
  type NativeTransferManager,
  type SelectedAsset,
  type TransferProgress
} from "../../platform/files";

export const PROFILE_PHOTO_PATH = "/auth/me/profile-photo";
export const PROFILE_PHOTO_FIELD = "photo";
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Mirrors the backend allowlist (JPEG, PNG, WebP up to 5 MB); the server re-checks signatures. */
export const PROFILE_PHOTO_POLICY: AssetPolicy = Object.freeze({
  acceptedMimeTypes: Object.freeze(["image/jpeg", "image/png", "image/webp"]),
  maxBytes: PROFILE_PHOTO_MAX_BYTES
});

export class InvalidProfilePhotoResponseError extends Error {
  readonly code = "INVALID_PROFILE_PHOTO_RESPONSE";

  constructor() {
    super("The service returned an invalid profile response.");
    this.name = "InvalidProfilePhotoResponseError";
  }
}

/** Accepts only `{ user: PublicUser }` with a strictly valid user. */
export function parseProfilePhotoResponse(input: unknown): PublicUser {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvalidProfilePhotoResponseError();
  }
  const user = parsePublicUser((input as { user?: unknown }).user);
  if (!user) throw new InvalidProfilePhotoResponseError();
  return user;
}

export function uploadProfilePhoto(
  transfers: Pick<NativeTransferManager, "upload">,
  asset: SelectedAsset,
  options: {
    readonly onProgress?: ((progress: TransferProgress) => void) | undefined;
    readonly signal?: AbortSignal | undefined;
  } = {}
): CancellableTransfer<PublicUser> {
  const transfer = transfers.upload<unknown>({
    path: PROFILE_PHOTO_PATH,
    method: "PUT",
    fieldName: PROFILE_PHOTO_FIELD,
    fileUri: asset.uri,
    fileName: asset.name,
    mimeType: asset.mimeType,
    maxBytes: PROFILE_PHOTO_MAX_BYTES,
    onProgress: options.onProgress,
    signal: options.signal
  });
  return {
    result: transfer.result.then(parseProfilePhotoResponse),
    cancel: () => transfer.cancel()
  };
}

export async function removeProfilePhoto(
  api: Pick<JsonApiClient, "authenticated">,
  signal?: AbortSignal
): Promise<PublicUser> {
  const response = await api.authenticated.delete<unknown>(
    PROFILE_PHOTO_PATH,
    undefined,
    { signal }
  );
  return parseProfilePhotoResponse(response);
}

const TOO_LARGE_MESSAGE = "That photo is larger than 5 MB. Choose a smaller photo.";
const INVALID_MESSAGE = "That image can't be used. Choose a JPEG, PNG, or WebP photo.";

/** Maps failures to safe, user-facing copy; never includes URLs, tokens, or raw server text. */
export function profilePhotoErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TransferSizeError || error instanceof OversizedAssetPolicyError) {
    return TOO_LARGE_MESSAGE;
  }
  if (error instanceof AssetPolicyError) return INVALID_MESSAGE;
  if (error instanceof ApiNetworkError || error instanceof ApiTimeoutError) {
    return "Check your connection and try again.";
  }
  if (error instanceof InvalidProfilePhotoResponseError) {
    return "The service returned an unexpected response. Try again.";
  }
  if (error instanceof ApiError || error instanceof TransferHttpError) {
    switch (error.code) {
      case "PROFILE_PHOTO_INVALID":
        return INVALID_MESSAGE;
      case "PROFILE_PHOTO_TOO_LARGE":
        return TOO_LARGE_MESSAGE;
      case "PROFILE_PHOTO_CONFLICT":
        return "Your photo was changed at the same time. Try again.";
      default:
        break;
    }
    if (error.status === 413) return TOO_LARGE_MESSAGE;
    if (error.status === 401) return "Your session has ended. Sign in again.";
    if (error.status === 403) return "You don't have permission to change your profile photo.";
  }
  return fallback;
}
