import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

export interface SelectedAsset {
  readonly uri: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly width?: number;
  readonly height?: number;
}

export interface AssetPolicy {
  readonly acceptedMimeTypes: readonly string[];
  readonly maxBytes: number;
}

export type SelectionResult =
  | { readonly status: "selected"; readonly asset: SelectedAsset }
  | { readonly status: "cancelled" };

export type CameraSelectionResult =
  | SelectionResult
  | { readonly status: "permission-denied-temporary" }
  | { readonly status: "permission-denied-permanent" }
  | { readonly status: "unavailable" };

export type ImageSelectionSource = "photo" | "camera";

export interface ImageSelectionScope {
  readonly environmentId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly sessionGeneration: number;
}

export type PendingImageSelectionResult =
  | {
      readonly status: "selected";
      readonly source: ImageSelectionSource;
      readonly asset: SelectedAsset;
    }
  | { readonly status: "none" };

export class AssetPolicyError extends Error {
  readonly code = "ASSET_POLICY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "AssetPolicyError";
  }
}

export class OversizedAssetPolicyError extends AssetPolicyError {
  constructor(
    readonly fileName: string,
    readonly maxBytes: number
  ) {
    super("The selected file is larger than allowed.");
    if (!isSafeSelectedFileName(fileName) || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new Error("Oversized asset metadata is invalid.");
    }
    this.name = "OversizedAssetPolicyError";
  }
}

export class AssetSizeResolutionError extends Error {
  readonly code = "ASSET_SIZE_UNAVAILABLE";

  constructor() {
    super("The selected file size could not be determined.");
    this.name = "AssetSizeResolutionError";
  }
}

export class PendingImageSelectionError extends Error {
  readonly code = "PENDING_IMAGE_SELECTION_UNAVAILABLE";

  constructor() {
    super("The image picker could not be opened safely.");
    this.name = "PendingImageSelectionError";
  }
}

export interface SelectionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface AssetMetadataReader {
  getSize(uri: string): Promise<number | null>;
}

export interface DocumentPickerPort {
  getDocumentAsync(
    options?: DocumentPicker.DocumentPickerOptions
  ): Promise<DocumentPicker.DocumentPickerResult>;
}

export interface ImagePickerPort {
  requestCameraPermissionsAsync(): Promise<ImagePicker.CameraPermissionResponse>;
  launchImageLibraryAsync(
    options?: ImagePicker.ImagePickerOptions
  ): Promise<ImagePicker.ImagePickerResult>;
  launchCameraAsync(
    options?: ImagePicker.ImagePickerOptions
  ): Promise<ImagePicker.ImagePickerResult>;
  getPendingResultAsync(): Promise<
    ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null
  >;
}

export interface AssetSelectionService {
  pickDocument(policy: AssetPolicy): Promise<SelectionResult>;
  pickImage(
    policy: AssetPolicy,
    scope: ImageSelectionScope
  ): Promise<SelectionResult>;
  capturePhoto(
    policy: AssetPolicy,
    scope: ImageSelectionScope
  ): Promise<CameraSelectionResult>;
  recoverPendingImageSelection(
    policy: AssetPolicy,
    scope: ImageSelectionScope
  ): Promise<PendingImageSelectionResult>;
  clearPendingImageSelection(scope?: ImageSelectionScope): Promise<void>;
  purgeExpiredPendingImageSelection(): Promise<void>;
  releaseSelectedAsset(asset: SelectedAsset): Promise<void>;
}

export interface SelectedAssetReleaser {
  release(uri: string): Promise<void>;
}

export interface AssetSelectionDependencies {
  readonly documentPicker?: DocumentPickerPort;
  readonly imagePicker?: ImagePickerPort;
  readonly storage?: SelectionStorage;
  readonly metadataReader?: AssetMetadataReader;
  readonly assetReleaser?: SelectedAssetReleaser;
  readonly now?: () => number;
  readonly pendingSelectionTtlMs?: number;
}

interface PendingImageSelectionMarker {
  readonly environmentId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly source: ImageSelectionSource;
  readonly expiresAt: number;
}

interface NormalizableAsset {
  readonly uri: string;
  readonly name?: string | null | undefined;
  readonly mimeType?: string | null | undefined;
  readonly size?: number | null | undefined;
  readonly width?: number | null | undefined;
  readonly height?: number | null | undefined;
}

export const PENDING_IMAGE_SELECTION_KEY = "lisno.image-selection.pending.v1";
export const PENDING_IMAGE_SELECTION_TTL_MS = 5 * 60 * 1000;

const MIME_BY_EXTENSION: Readonly<Record<string, readonly string[]>> = Object.freeze({
  bmp: ["image/bmp"],
  csv: ["text/csv"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  gif: ["image/gif"],
  heic: ["image/heic"],
  heif: ["image/heif"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  m4a: ["audio/mp4"],
  mov: ["video/quicktime"],
  mp3: ["audio/mpeg"],
  mp4: ["video/mp4", "audio/mp4"],
  ogg: ["audio/ogg"],
  opus: ["audio/ogg"],
  pdf: ["application/pdf"],
  png: ["image/png"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  tif: ["image/tiff"],
  tiff: ["image/tiff"],
  txt: ["text/plain"],
  wav: ["audio/wav"],
  webm: ["video/webm", "audio/webm"],
  webp: ["image/webp"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  zip: ["application/zip"]
});

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = Object.freeze({
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/zip": "zip",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tif",
  "image/webp": "webp",
  "text/csv": "csv",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
});

const defaultMetadataReader: AssetMetadataReader = {
  async getSize(uri) {
    try {
      const info = new File(uri).info();
      return info.exists && typeof info.size === "number" ? info.size : null;
    } catch {
      return null;
    }
  }
};

const defaultAssetReleaser: SelectedAssetReleaser = {
  async release(uri) {
    if (!uri.startsWith("file://")) return;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Cleanup is best effort; callers still clear ownership of the asset.
    }
  }
};

function normalizeMimeType(value: string | null | undefined): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() || "application/octet-stream";
}

function mimeMatches(actual: string, accepted: string): boolean {
  const normalized = accepted.trim().toLowerCase();
  if (normalized === "*/*") return true;
  if (normalized.endsWith("/*")) {
    return actual.startsWith(normalized.slice(0, -1));
  }
  return actual === normalized;
}

function extensionFrom(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutQuery = value.split(/[?#]/u, 1)[0] ?? "";
  const match = /\.([a-z0-9]{1,10})$/iu.exec(withoutQuery);
  return match?.[1]?.toLowerCase() ?? null;
}

function resolveMimeType(
  asset: NormalizableAsset,
  acceptedMimeTypes: readonly string[]
): string {
  const reported = normalizeMimeType(asset.mimeType);
  if (reported !== "application/octet-stream") return reported;
  const extension = extensionFrom(asset.name) ?? extensionFrom(asset.uri);
  if (!extension) return reported;
  const candidates = MIME_BY_EXTENSION[extension] ?? [];
  return (
    candidates.find((candidate) =>
      acceptedMimeTypes.some((accepted) => mimeMatches(candidate, accepted))
    ) ?? reported
  );
}

function safeFileName(
  value: string | null | undefined,
  fallbackPrefix: string,
  mimeType: string,
  now: number
): string {
  const source = value?.split(/[\\/]/u).pop()?.trim() ?? "";
  const sanitized = source
    .replace(/[\u0000-\u001f\u007f<>:"|?*\u202a-\u202e\u2066-\u2069]/gu, "_")
    .replace(/^\.+/u, "")
    .replace(/[.\s]+$/u, "")
    .trim()
    .slice(0, 180);
  if (sanitized) return sanitized;
  const extension = EXTENSION_BY_MIME[mimeType] ?? "bin";
  return `${fallbackPrefix}-${Math.trunc(now)}.${extension}`;
}

function isSafeSelectedFileName(value: string): boolean {
  return Boolean(
    value.trim() &&
    value === value.trim() &&
    value.length <= 180 &&
    !value.startsWith(".") &&
    !/[.\s]$/u.test(value) &&
    !/[\\/\u0000-\u001f\u007f<>:"|?*\u202a-\u202e\u2066-\u2069]/u.test(value)
  );
}

function validateDimension(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value > 0);
}

export function validateSelectedAsset(
  asset: SelectedAsset,
  policy: AssetPolicy
): SelectedAsset {
  if (!/^(?:file|content):\/\/[^\u0000-\u001f\u007f\s]+$/u.test(asset.uri)) {
    throw new AssetPolicyError("The selected file location is not supported.");
  }
  if (!isSafeSelectedFileName(asset.name)) {
    throw new AssetPolicyError("The selected file name is invalid.");
  }
  if (!Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 1) {
    throw new Error("The asset size policy must be a positive integer.");
  }
  if (!Number.isSafeInteger(asset.size) || asset.size < 1) {
    throw new AssetPolicyError("The selected file is empty or unreadable.");
  }
  if (asset.size > policy.maxBytes) {
    throw new OversizedAssetPolicyError(asset.name, policy.maxBytes);
  }
  const mimeType = normalizeMimeType(asset.mimeType);
  if (!policy.acceptedMimeTypes.some((accepted) => mimeMatches(mimeType, accepted))) {
    throw new AssetPolicyError("The selected file type is not supported.");
  }
  if (!validateDimension(asset.width) || !validateDimension(asset.height)) {
    throw new AssetPolicyError("The selected image dimensions are invalid.");
  }
  return asset;
}

async function normalizeAsset(
  input: NormalizableAsset,
  policy: AssetPolicy,
  dependencies: {
    readonly metadataReader: AssetMetadataReader;
    readonly now: () => number;
    readonly fallbackPrefix: string;
    readonly requireImage: boolean;
  }
): Promise<SelectedAsset> {
  const mimeType = resolveMimeType(input, policy.acceptedMimeTypes);
  if (dependencies.requireImage && !mimeType.startsWith("image/")) {
    throw new AssetPolicyError("The selected file type is not supported.");
  }

  let size = input.size ?? null;
  if (size === null) {
    size = await dependencies.metadataReader.getSize(input.uri);
    if (!Number.isSafeInteger(size) || (size ?? 0) < 1) {
      throw new AssetSizeResolutionError();
    }
  }
  if (size === null) throw new AssetSizeResolutionError();

  const asset: SelectedAsset = {
    uri: input.uri.trim(),
    name: safeFileName(
      input.name,
      dependencies.fallbackPrefix,
      mimeType,
      dependencies.now()
    ),
    mimeType,
    size,
    ...(input.width === undefined || input.width === null
      ? {}
      : { width: input.width }),
    ...(input.height === undefined || input.height === null
      ? {}
      : { height: input.height })
  };
  if (
    dependencies.requireImage &&
    (asset.width === undefined || asset.height === undefined)
  ) {
    throw new AssetPolicyError("The selected image dimensions are invalid.");
  }
  return validateSelectedAsset(asset, policy);
}

function normalizeScope(scope: ImageSelectionScope): ImageSelectionScope {
  const normalized = {
    environmentId: scope.environmentId.trim(),
    userId: scope.userId.trim(),
    projectId: scope.projectId.trim(),
    sessionGeneration: scope.sessionGeneration
  };
  if (
    [normalized.environmentId, normalized.userId, normalized.projectId].some(
      (value) => !value || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)
    ) ||
    !Number.isSafeInteger(normalized.sessionGeneration) ||
    normalized.sessionGeneration < 0
  ) {
    throw new PendingImageSelectionError();
  }
  return normalized;
}

function markerIdentity(
  scope: Pick<ImageSelectionScope, "environmentId" | "userId" | "projectId">
): Pick<PendingImageSelectionMarker, "environmentId" | "userId" | "projectId"> {
  const identity = {
    environmentId: scope.environmentId.trim(),
    userId: scope.userId.trim(),
    projectId: scope.projectId.trim()
  };
  if (
    [identity.environmentId, identity.userId, identity.projectId].some(
      (value) => !value || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)
    )
  ) {
    throw new PendingImageSelectionError();
  }
  return identity;
}

function scopesMatch(
  left: Pick<PendingImageSelectionMarker, "environmentId" | "userId" | "projectId">,
  right: Pick<ImageSelectionScope, "environmentId" | "userId" | "projectId">
): boolean {
  return (
    left.environmentId === right.environmentId &&
    left.userId === right.userId &&
    left.projectId === right.projectId
  );
}

function parseMarker(value: string | null): PendingImageSelectionMarker | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const expectedKeys = [
      "environmentId",
      "expiresAt",
      "projectId",
      "source",
      "userId"
    ];
    const keys = Object.keys(record);
    if (
      keys.length !== expectedKeys.length ||
      !expectedKeys.every((key) => keys.includes(key)) ||
      (record.source !== "photo" && record.source !== "camera") ||
      typeof record.environmentId !== "string" ||
      typeof record.userId !== "string" ||
      typeof record.projectId !== "string" ||
      typeof record.expiresAt !== "number" ||
      !Number.isSafeInteger(record.expiresAt)
    ) {
      return null;
    }
    const scope = markerIdentity({
      environmentId: record.environmentId,
      userId: record.userId,
      projectId: record.projectId
    });
    if (
      scope.environmentId !== record.environmentId ||
      scope.userId !== record.userId ||
      scope.projectId !== record.projectId
    ) {
      return null;
    }
    return {
      ...scope,
      source: record.source,
      expiresAt: record.expiresAt
    };
  } catch {
    return null;
  }
}

function isImagePickerError(
  result: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult
): result is ImagePicker.ImagePickerErrorResult {
  return "code" in result;
}

export function createAssetSelectionService(
  dependencies: AssetSelectionDependencies = {}
): AssetSelectionService {
  const documentPicker = dependencies.documentPicker ?? DocumentPicker;
  const imagePicker = dependencies.imagePicker ?? ImagePicker;
  const storage = dependencies.storage ?? AsyncStorage;
  const metadataReader = dependencies.metadataReader ?? defaultMetadataReader;
  const assetReleaser = dependencies.assetReleaser ?? defaultAssetReleaser;
  const now = dependencies.now ?? Date.now;
  const ttl = dependencies.pendingSelectionTtlMs ?? PENDING_IMAGE_SELECTION_TTL_MS;
  if (!Number.isSafeInteger(ttl) || ttl < 1) {
    throw new Error("The pending image selection lifetime must be a positive integer.");
  }

  let recoveryQueue: Promise<void> = Promise.resolve();

  const releaseOwnedUri = async (uri: string): Promise<void> => {
    if (!uri.startsWith("file://")) return;
    await assetReleaser.release(uri);
  };

  const removeMarker = async (): Promise<void> => {
    try {
      await storage.removeItem(PENDING_IMAGE_SELECTION_KEY);
    } catch {
      throw new PendingImageSelectionError();
    }
  };

  const readMarker = async (): Promise<{
    readonly raw: string | null;
    readonly marker: PendingImageSelectionMarker | null;
  }> => {
    try {
      const raw = await storage.getItem(PENDING_IMAGE_SELECTION_KEY);
      return { raw, marker: parseMarker(raw) };
    } catch {
      throw new PendingImageSelectionError();
    }
  };

  const storeMarker = async (
    source: ImageSelectionSource,
    scope: ImageSelectionScope
  ): Promise<PendingImageSelectionMarker> => {
    const expiresAt = now() + ttl;
    if (!Number.isSafeInteger(expiresAt)) throw new PendingImageSelectionError();
    const activeScope = normalizeScope(scope);
    const marker = {
      ...markerIdentity(activeScope),
      source,
      expiresAt
    } satisfies PendingImageSelectionMarker;
    try {
      await storage.setItem(PENDING_IMAGE_SELECTION_KEY, JSON.stringify(marker));
      return marker;
    } catch {
      throw new PendingImageSelectionError();
    }
  };

  const clearMatchingMarker = async (
    expected: PendingImageSelectionMarker
  ): Promise<void> => {
    const current = await readMarker();
    if (
      current.marker &&
      scopesMatch(current.marker, expected) &&
      current.marker.source === expected.source &&
      current.marker.expiresAt === expected.expiresAt
    ) {
      await removeMarker();
    }
  };

  const normalizeImageResult = async (
    result: ImagePicker.ImagePickerResult,
    policy: AssetPolicy,
    prefix: "image" | "photo"
  ): Promise<SelectionResult> => {
    if (result.canceled) return { status: "cancelled" };
    const selected = result.assets[0];
    if (!selected) {
      throw new AssetPolicyError("No image was returned by the picker.");
    }
    try {
      if (selected.type && selected.type !== "image") {
        throw new AssetPolicyError("The selected file type is not supported.");
      }
      const asset = await normalizeAsset(
        {
          uri: selected.uri,
          name: selected.fileName,
          mimeType: selected.mimeType,
          size: selected.fileSize,
          width: selected.width,
          height: selected.height
        },
        policy,
        { metadataReader, now, fallbackPrefix: prefix, requireImage: true }
      );
      return { status: "selected", asset };
    } catch (error) {
      await releaseOwnedUri(selected.uri).catch(() => undefined);
      throw error;
    }
  };

  const releaseReturnedImage = async (
    result: ImagePicker.ImagePickerResult
  ): Promise<void> => {
    if (result.canceled) return;
    const uri = result.assets[0]?.uri;
    if (uri) await releaseOwnedUri(uri).catch(() => undefined);
  };

  const service: AssetSelectionService = {
    async pickDocument(policy) {
      const result = await documentPicker.getDocumentAsync({
        type: [...policy.acceptedMimeTypes],
        copyToCacheDirectory: true,
        multiple: false,
        base64: false
      });
      if (result.canceled) return { status: "cancelled" };

      const selected = result.assets[0];
      if (!selected) {
        throw new AssetPolicyError("No file was returned by the picker.");
      }
      try {
        const asset = await normalizeAsset(
          {
            uri: selected.uri,
            name: selected.name,
            mimeType: selected.mimeType,
            size: selected.size
          },
          policy,
          { metadataReader, now, fallbackPrefix: "file", requireImage: false }
        );
        return { status: "selected", asset };
      } catch (error) {
        await releaseOwnedUri(selected.uri).catch(() => undefined);
        throw error;
      }
    },

    async pickImage(policy, scope) {
      const marker = await storeMarker("photo", scope);
      let result: ImagePicker.ImagePickerResult;
      try {
        result = await imagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          allowsMultipleSelection: false,
          selectionLimit: 1,
          quality: 1,
          exif: false,
          base64: false
        });
      } catch (error) {
        await clearMatchingMarker(marker);
        throw error;
      }
      try {
        await clearMatchingMarker(marker);
      } catch (error) {
        await releaseReturnedImage(result);
        throw error;
      }
      return normalizeImageResult(result, policy, "image");
    },

    async capturePhoto(policy, scope) {
      await removeMarker();
      let permission: ImagePicker.CameraPermissionResponse;
      try {
        permission = await imagePicker.requestCameraPermissionsAsync();
      } catch {
        return { status: "unavailable" };
      }
      if (!permission.granted) {
        return permission.canAskAgain
          ? { status: "permission-denied-temporary" }
          : { status: "permission-denied-permanent" };
      }

      const marker = await storeMarker("camera", scope);
      let result: ImagePicker.ImagePickerResult;
      try {
        result = await imagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          allowsMultipleSelection: false,
          selectionLimit: 1,
          cameraType: ImagePicker.CameraType.back,
          quality: 1,
          exif: false,
          base64: false
        });
      } catch {
        await clearMatchingMarker(marker);
        return { status: "unavailable" };
      }
      try {
        await clearMatchingMarker(marker);
      } catch (error) {
        await releaseReturnedImage(result);
        throw error;
      }

      if (!result.canceled && !result.assets[0]) {
        return { status: "unavailable" };
      }
      return normalizeImageResult(result, policy, "photo");
    },

    async recoverPendingImageSelection(policy, scope) {
      const run = async (): Promise<PendingImageSelectionResult> => {
        const activeScope = normalizeScope(scope);
        const stored = await readMarker();
        if (!stored.raw) return { status: "none" };
        if (
          !stored.marker ||
          stored.marker.expiresAt <= now() ||
          !scopesMatch(stored.marker, activeScope)
        ) {
          await removeMarker();
          return { status: "none" };
        }

        const marker = stored.marker;
        await removeMarker();
        let pending: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null;
        try {
          pending = await imagePicker.getPendingResultAsync();
        } catch {
          return { status: "none" };
        }
        if (!pending || isImagePickerError(pending) || pending.canceled) {
          return { status: "none" };
        }
        const result = await normalizeImageResult(
          pending,
          policy,
          marker.source === "camera" ? "photo" : "image"
        );
        return result.status === "selected"
          ? { ...result, source: marker.source }
          : { status: "none" };
      };

      const previous = recoveryQueue;
      let release!: () => void;
      recoveryQueue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await run();
      } finally {
        release();
      }
    },

    async clearPendingImageSelection(scope) {
      if (!scope) {
        await removeMarker();
        return;
      }
      const activeScope = normalizeScope(scope);
      const stored = await readMarker();
      if (!stored.raw || !stored.marker || scopesMatch(stored.marker, activeScope)) {
        if (stored.raw) await removeMarker();
      }
    },

    async purgeExpiredPendingImageSelection() {
      const stored = await readMarker();
      if (
        stored.raw &&
        (!stored.marker || stored.marker.expiresAt <= now())
      ) {
        await removeMarker();
      }
    },

    async releaseSelectedAsset(asset) {
      await releaseOwnedUri(asset.uri);
    }
  };

  return Object.freeze(service);
}

const assetSelection = createAssetSelectionService();

export function pickDocument(policy: AssetPolicy): Promise<SelectionResult> {
  return assetSelection.pickDocument(policy);
}

export function pickImage(
  policy: AssetPolicy,
  scope: ImageSelectionScope
): Promise<SelectionResult> {
  return assetSelection.pickImage(policy, scope);
}

export function capturePhoto(
  policy: AssetPolicy,
  scope: ImageSelectionScope
): Promise<CameraSelectionResult> {
  return assetSelection.capturePhoto(policy, scope);
}

export function recoverPendingImageSelection(
  policy: AssetPolicy,
  scope: ImageSelectionScope
): Promise<PendingImageSelectionResult> {
  return assetSelection.recoverPendingImageSelection(policy, scope);
}

export function clearPendingImageSelection(
  scope?: ImageSelectionScope
): Promise<void> {
  return assetSelection.clearPendingImageSelection(scope);
}

export function purgeExpiredPendingImageSelection(): Promise<void> {
  return assetSelection.purgeExpiredPendingImageSelection();
}

export function releaseSelectedAsset(asset: SelectedAsset): Promise<void> {
  return assetSelection.releaseSelectedAsset(asset);
}
