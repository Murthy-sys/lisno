export type ProfilePhotoSourceType = "image/jpeg" | "image/png" | "image/webp";

export const PROFILE_PHOTO_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxDimension: 4096,
  outputSize: 512,
  outputQuality: 82
} as const;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Detects the accepted source formats from magic bytes only; names and claimed MIME types are ignored. */
export function detectProfilePhotoType(data: Buffer): ProfilePhotoSourceType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function profilePhotoDimensionsAllowed(width: unknown, height: unknown): boolean {
  return typeof width === "number" && typeof height === "number" &&
    Number.isSafeInteger(width) && Number.isSafeInteger(height) &&
    width > 0 && height > 0 &&
    width <= PROFILE_PHOTO_LIMITS.maxDimension && height <= PROFILE_PHOTO_LIMITS.maxDimension;
}

/** The ETag is derived from the stable user identity and photo version, never from the storage key. */
export function profilePhotoEtag(userId: string, version: number): string {
  return `"pp-${Buffer.from(userId, "utf8").toString("base64url")}-${version}"`;
}
