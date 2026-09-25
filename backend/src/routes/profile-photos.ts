import { Router } from "express";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { ApiError } from "../middleware/errors.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProfilePhotoService } from "../services/profile-photo.service.js";

const profilePhotoQuerySchema = z
  .object({ v: z.string().regex(/^[1-9]\d{0,15}$/u).optional() })
  .strict();

const notFound = () =>
  new ApiError(404, "NOT_FOUND", "The requested resource was not found.");

export function createProfilePhotosRouter(
  authService: AuthService,
  profilePhotos: ProfilePhotoService
): Router {
  const router = Router();

  router.get(
    "/users/:userId/profile-photo",
    authenticate(authService),
    requireOperation("GET /users/:userId/profile-photo"),
    async (request, response, next) => {
      const controller = new AbortController();
      const abort = () => {
        if (!response.writableFinished) controller.abort(new Error("Download cancelled."));
      };
      response.once("close", abort);
      try {
        if (!profilePhotoQuerySchema.safeParse(request.query).success) {
          throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {
            v: "Use a positive photo version."
          });
        }
        const actor = request.authenticatedUser!;
        const userId = String(request.params.userId);
        const descriptor = await profilePhotos.describe(actor, userId);
        if (!descriptor) throw notFound();
        response
          .set("Cache-Control", "private, max-age=86400")
          .set("ETag", descriptor.etag)
          .set("X-Content-Type-Options", "nosniff");
        if (ifNoneMatchIncludes(request.headers["if-none-match"], descriptor.etag)) {
          response.status(304).end();
          return;
        }
        const photo = await profilePhotos.open(actor, userId);
        if (!photo) throw notFound();
        response.set("ETag", photo.etag).type("image/jpeg");
        await pipeline(photo.stream, response, { signal: controller.signal });
      } catch (error) {
        if (response.headersSent) {
          response.destroy(error instanceof Error ? error : undefined);
          return;
        }
        response.removeHeader("ETag");
        response.removeHeader("Cache-Control");
        next(error);
      } finally {
        response.removeListener("close", abort);
      }
    }
  );

  return router;
}

function ifNoneMatchIncludes(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((value) => value.trim().replace(/^W\//u, ""))
    .some((value) => value === "*" || value === etag);
}
