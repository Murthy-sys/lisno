import path from "node:path";

import multer, { MulterError } from "multer";
import type { RequestHandler } from "express";

import { ApiError } from "./errors.js";
import type { SaveFileInput } from "../storage/storage.js";

export interface ValidatedUpload extends SaveFileInput {
  originalFilename: string;
  mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
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
  "application/octet-stream",
  // Busboy uses text/plain when a multipart file part omits Content-Type.
  "text/plain"
]);

export function uploadSingleFile(maxUploadBytes: number): RequestHandler {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes,
      files: 1,
      fields: 0
    },
    fileFilter: (_request, file, callback) => {
      if (!allowedClaimedMimeTypes.has(file.mimetype.toLowerCase())) {
        callback(
          new ApiError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "Only PDF, PNG, JPEG, and WebP files are supported.",
            { file: "Choose a PDF, PNG, JPEG, or WebP file." }
          )
        );
        return;
      }
      callback(null, true);
    }
  }).single("file");

  return (request, _response, next) => {
    parse(request, _response, (error) => {
      if (error) {
        if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
          next(
            new ApiError(
              413,
              "FILE_TOO_LARGE",
              "The uploaded file exceeds the configured size limit.",
              { file: "Choose a smaller file." }
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
              { file: "Provide one file in the file field." }
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
            { file: "A file is required." }
          )
        );
        return;
      }

      const detected = detectFileType(request.file.buffer);
      const claimed = request.file.mimetype.toLowerCase();
      // This is advisory only: all generic claims must still match magic bytes.
      const claimIsGeneric =
        claimed === "application/octet-stream" ||
        claimed === "text/plain" ||
        claimed === "";
      if (!detected || (!claimIsGeneric && detected.mimeType !== claimed)) {
        next(
          new ApiError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "The file contents do not match an allowed file type.",
            { file: "Choose a valid PDF, PNG, JPEG, or WebP file." }
          )
        );
        return;
      }

      request.validatedUpload = {
        data: request.file.buffer,
        extension: detected.extension,
        originalFilename: safeOriginalFilename(
          request.file.originalname,
          detected.extension
        ),
        mimeType: detected.mimeType,
        sizeBytes: request.file.size
      };
      next();
    });
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
  return null;
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
