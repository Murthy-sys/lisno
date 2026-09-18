export const MEASUREMENT_MEDIA_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.tif,.tiff,.mp4,.mov,.webm";

export function measurementMediaKind(filename: string): "Photo" | "Video" {
  return /\.(mp4|mov|webm)$/iu.test(filename) ? "Video" : "Photo";
}

export function formatEvidenceSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const measurementFileKey = (file: File) => JSON.stringify([file.name, file.size, file.type, file.lastModified]);

export function validateMeasurementMedia(files: File[], sketch: File | null): string | null {
  if (files.length === 0) return "Choose at least one site photo or video.";
  const unsupported = files.find((file) => !/\.(jpe?g|png|webp|gif|heic|heif|tiff?|mp4|mov|webm)$/iu.test(file.name));
  if (unsupported) return `${unsupported.name} is not a supported photo or video. Choose JPG, PNG, WebP, GIF, HEIC, HEIF, TIFF, MP4, MOV or WebM.`;
  const empty = files.find((file) => file.size === 0) ?? (sketch?.size === 0 ? sketch : undefined);
  if (empty) return `${empty.name} is empty. Choose a file with content.`;
  return null;
}
