import path from "node:path";
import multer, { MulterError } from "multer";
import type { RequestHandler } from "express";

import { ApiError } from "./errors.js";
import { isValidPdfDocument } from "../services/pdf-validation.js";
export { isValidPdfDocument } from "../services/pdf-validation.js";
import type { SaveFileInput } from "../storage/storage.js";

export interface ValidatedUpload extends SaveFileInput {
  originalFilename: string;
  mimeType:
    | "application/pdf"
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/tiff"
    | "image/heic";
  sizeBytes: number;
}

export interface UploadSingleFileOptions {
  fieldName?: string;
  maxFields?: number;
  allowedDetectedMimeTypes?: ReadonlySet<ValidatedUpload["mimeType"]>;
  fieldErrorKey?: string;
  allowedTypeMessage?: string;
}

declare global {
  namespace Express {
    interface Request {
      validatedUpload?: ValidatedUpload;
    }
  }
}

const allowedClaimedMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "application/octet-stream",
  // Busboy uses text/plain when a multipart file part omits Content-Type.
  "text/plain"
]);
const allowedDetectedMimeTypes = new Set<ValidatedUpload["mimeType"]>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/heic"
]);
export function uploadSingleFile(
  maxUploadBytes: number,
  options: number | UploadSingleFileOptions = {}
): RequestHandler {
  const normalized = typeof options === "number" ? { maxFields: options } : options;
  const fieldName = normalized.fieldName ?? "file";
  const maxFields = normalized.maxFields ?? 0;
  const fieldErrorKey = normalized.fieldErrorKey ?? fieldName;
  const claimedTypeMessage =
    normalized.allowedTypeMessage ??
    "Choose a PDF, PNG, JPEG, WebP, TIFF, or HEIC file.";
  const malformedRequestMessage =
    normalized.allowedTypeMessage ?? `Provide one file in the ${fieldName} field.`;
  const missingFileMessage =
    normalized.allowedTypeMessage ?? "A file is required.";
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes,
      files: 1,
      fields: maxFields
    },
    fileFilter: (_request, file, callback) => {
      if (!allowedClaimedMimeTypes.has(file.mimetype.toLowerCase())) {
        callback(
          new ApiError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "Only PDF, PNG, JPEG, WebP, TIFF, and HEIC files are supported.",
            { [fieldErrorKey]: claimedTypeMessage }
          )
        );
        return;
      }
      callback(null, true);
    }
  }).single(fieldName);

  return (request, _response, next) => {
    parse(request, _response, async (error) => {
      if (error) {
        if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
          next(
            new ApiError(
              413,
              "FILE_TOO_LARGE",
              "The uploaded file exceeds the configured size limit.",
              { [fieldErrorKey]: "Choose a smaller file." }
            )
          );
          return;
        }
        if (error instanceof ApiError) {
          next(error);
          return;
        }
        if (error instanceof MulterError) {
          next(
            new ApiError(
              400,
              "VALIDATION_ERROR",
              "Request validation failed.",
              { [fieldErrorKey]: malformedRequestMessage }
            )
          );
          return;
        }
        next(error);
        return;
      }

      if (!request.file) {
        next(
          new ApiError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed.",
            { [fieldErrorKey]: missingFileMessage }
          )
        );
        return;
      }

      try { request.validatedUpload = await validateUploadedFile(request.file, normalized); }
      catch (validationError) { next(validationError); return; }
      next();
    });
  };
}

export async function validateUploadedFile(
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  options: UploadSingleFileOptions = {}
): Promise<ValidatedUpload> {
  const fieldErrorKey = options.fieldErrorKey ?? options.fieldName ?? "file";
  const detectedTypeMessage = options.allowedTypeMessage ?? "Choose a valid PDF, PNG, JPEG, WebP, TIFF, or HEIC file.";
  const permittedDetectedMimeTypes = options.allowedDetectedMimeTypes ?? allowedDetectedMimeTypes;
  const detected = detectFileType(file.buffer);
  const claimed = file.mimetype.toLowerCase();
  // This is advisory only: all generic claims must still match magic bytes.
  const claimIsGeneric =
    claimed === "application/octet-stream" ||
    claimed === "text/plain" ||
    claimed === "";
  const contentIsValid =
    detected?.mimeType !== "application/pdf" ||
    (await isValidPdfDocument(file.buffer));
  const detectedMimeTypeIsAllowed =
    detected !== null && permittedDetectedMimeTypes.has(detected.mimeType);
  const safeFilename = detected
    ? safeOriginalFilename(file.originalname, detected.extension)
    : null;
  const filenameMatchesType =
    !options.allowedDetectedMimeTypes ||
    (detected !== null &&
      safeFilename !== null &&
      filenameExtensionMatchesDetected(safeFilename, detected.extension));
  if (
    !detected ||
    !contentIsValid ||
    !detectedMimeTypeIsAllowed ||
    !filenameMatchesType ||
    (!claimIsGeneric && !claimMatchesDetected(claimed, detected.mimeType))
  ) {
    throw new ApiError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "The file contents do not match an allowed file type.",
      { [fieldErrorKey]: detectedTypeMessage }
    );
  }

  return {
    data: file.buffer,
    extension: detected.extension,
    originalFilename: safeFilename!,
    mimeType: detected.mimeType,
    sizeBytes: file.size
  };
}

function detectFileType(data: Buffer): Pick<
  ValidatedUpload,
  "extension" | "mimeType"
> | null {
  if (data.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    return { extension: ".pdf", mimeType: "application/pdf" };
  }
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return { extension: ".png", mimeType: "image/png" };
  }
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP" &&
    data.readUInt32LE(4) === data.length - 8
  ) {
    return { extension: ".webp", mimeType: "image/webp" };
  }
  if (
    data.length >= 4 &&
    ((data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2a && data[3] === 0x00) ||
      (data[0] === 0x4d && data[1] === 0x4d && data[2] === 0x00 && data[3] === 0x2a) ||
      (data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2b && data[3] === 0x00) ||
      (data[0] === 0x4d && data[1] === 0x4d && data[2] === 0x00 && data[3] === 0x2b))
  ) {
    return { extension: ".tif", mimeType: "image/tiff" };
  }
  if (isHeifFile(data)) {
    return { extension: ".heic", mimeType: "image/heic" };
  }
  return null;
}

function claimMatchesDetected(claimed: string, detected: ValidatedUpload["mimeType"]) {
  return detected === claimed || (detected === "image/heic" && claimed === "image/heif");
}

function isHeifFile(data: Buffer) {
  if (data.length < 16 || data.subarray(4, 8).toString("ascii") !== "ftyp") {
    return false;
  }
  const boxSize = data.readUInt32BE(0);
  if (boxSize !== 0 && (boxSize < 16 || boxSize > data.length)) return false;
  const brandEnd = boxSize === 0 ? data.length : boxSize;
  const heifBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
  if (heifBrands.has(data.subarray(8, 12).toString("ascii"))) return true;
  for (let offset = 16; offset + 4 <= brandEnd; offset += 4) {
    if (heifBrands.has(data.subarray(offset, offset + 4).toString("ascii"))) {
      return true;
    }
  }
  return false;
}

function safeOriginalFilename(
  originalFilename: string,
  extension: ValidatedUpload["extension"]
) {
  const decodedFilename = Buffer.from(originalFilename, "latin1").toString("utf8");
  const filename = path
    .basename((decodedFilename.includes("\uFFFD") ? originalFilename : decodedFilename).replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f\u007f\u061c\u200e-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim()
    .slice(0, 255);
  return filename || `upload${extension}`;
}

function filenameExtensionMatchesDetected(
  filename: string,
  extension: ValidatedUpload["extension"]
) {
  const providedExtension = path.extname(filename).toLowerCase();
  if (!providedExtension) return true;
  if (extension === ".jpg") {
    return providedExtension === ".jpg" || providedExtension === ".jpeg";
  }
  return providedExtension === extension;
}
