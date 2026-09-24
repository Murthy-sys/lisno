import multer, { MulterError } from "multer";
import type { RequestHandler } from "express";

import { PROFILE_PHOTO_LIMITS } from "../domain/profile-photo-policy.js";
import { ApiError } from "./errors.js";

const invalid = () =>
  new ApiError(400, "PROFILE_PHOTO_INVALID", "Upload exactly one image in the photo field.", {
    photo: "Choose a JPEG, PNG, or WebP image."
  });
const tooLarge = () =>
  new ApiError(413, "PROFILE_PHOTO_TOO_LARGE", "Choose an image of 5 MB or less.", {
    photo: "Choose a smaller image."
  });

/**
 * Parses exactly one multipart file in the `photo` field into memory, bounded by the profile photo size limit.
 * Content validation (signature, decoding, dimensions) happens in the profile photo service.
 */
export function uploadProfilePhoto(): RequestHandler {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PROFILE_PHOTO_LIMITS.maxFileBytes, files: 1, fields: 0 }
  }).single("photo");

  return (request, response, next) => {
    parse(request, response, (error: unknown) => {
      if (error) {
        if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
          next(tooLarge());
          return;
        }
        next(invalid());
        return;
      }
      if (!request.file) {
        next(invalid());
        return;
      }
      next();
    });
  };
}
