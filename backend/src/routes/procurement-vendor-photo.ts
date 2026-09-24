import { pipeline } from "node:stream/promises";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { PROCUREMENT_VENDOR_PHOTO_MIME_TYPES, type ProcurementVendorPhotoService } from "../services/procurement-vendor-photo.service.js";

export function createProcurementVendorPhotoRouter(input: { authService: AuthService; photoService: ProcurementVendorPhotoService; maxUploadBytes: number }): Router {
  const router = Router();
  const base = "/admin/ai-estimator-knowledge/vendors/:id/photo";
  const authenticated = authenticate(input.authService);
  const authorized: RequestHandler = async (request, _response, next) => {
    try { await input.photoService.authorize(request.authenticatedUser!); next(); }
    catch (error) { next(error); }
  };
  router.get(base, authenticated, requireOperation("GET /admin/ai-estimator-knowledge/vendors/:id/photo"), authorized,
    validateQuery(z.object({ v: z.string().min(1).max(128).optional() }).strict()),
    async (request, response, next) => {
      try {
        const photo = await input.photoService.open(request.authenticatedUser!, String(request.params.id));
        response.set("Cache-Control", "private, no-store").set("X-Content-Type-Options", "nosniff")
          .set("Content-Security-Policy", "default-src 'none'; sandbox").type(photo.descriptor.mimeType)
          .set("Content-Length", String(photo.descriptor.byteSize));
        await pipeline(photo.stream, response);
      } catch (error) {
        if (response.headersSent) response.destroy(error instanceof Error ? error : undefined);
        else next(error);
      }
    });
  router.put(base, authenticated, requireOperation("PUT /admin/ai-estimator-knowledge/vendors/:id/photo"), authorized,
    uploadSingleFile(input.maxUploadBytes, { fieldName: "photo", maxFields: 2, allowedDetectedMimeTypes: PROCUREMENT_VENDOR_PHOTO_MIME_TYPES, allowedTypeMessage: "Choose a JPEG, PNG, or WebP image." }),
    validateBody(z.object({ expectedVersion: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER), idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,200}$/u) }).strict()),
    async (request, response, next) => {
      try { response.json({ data: await input.photoService.replace(request.authenticatedUser!, String(request.params.id), request.body, request.validatedUpload!) }); }
      catch (error) { next(error); }
    });
  router.delete(base, authenticated, requireOperation("DELETE /admin/ai-estimator-knowledge/vendors/:id/photo"), authorized,
    validateBody(z.object({ expectedVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }).strict()),
    async (request, response, next) => {
      try { response.json({ data: await input.photoService.remove(request.authenticatedUser!, String(request.params.id), request.body) }); }
      catch (error) { next(error); }
    });
  return router;
}
