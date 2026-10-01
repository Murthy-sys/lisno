import { pipeline } from "node:stream/promises";
import { Router } from "express";
import {
  clientVendorWorkDecisionSchema, clientVendorWorkQuerySchema, vendorWorkProgressSchema, vendorWorkQuerySchema, vendorWorkSubmitSchema, vendorWorkUploadSchema
} from "../domain/vendor-work.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { VendorWorkService } from "../services/vendor-work.service.js";

export function createVendorWorkRouter(auth: AuthService, service: VendorWorkService, maxUploadBytes: number): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/vendor/work", protectedRoute, requireOperation("GET /vendor/work"), validateQuery(vendorWorkQuerySchema), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.listMine(request.authenticatedUser!, response.locals.validatedQuery) }); } catch (error) { next(error); }
  });
  router.get("/vendor/work/:assignmentId", protectedRoute, requireOperation("GET /vendor/work/:assignmentId"), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.getMine(request.authenticatedUser!, String(request.params.assignmentId)) }); } catch (error) { next(error); }
  });
  router.patch("/vendor/work/:assignmentId/progress", protectedRoute, requireOperation("PATCH /vendor/work/:assignmentId/progress"), validateBody(vendorWorkProgressSchema), async (request, response, next) => {
    try { response.json({ data: await service.progress(request.authenticatedUser!, String(request.params.assignmentId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/vendor/work/:assignmentId/images", protectedRoute, requireOperation("POST /vendor/work/:assignmentId/images"),
    async (request, _response, next) => { try { await service.authorizeVendor(request.authenticatedUser!); next(); } catch (error) { next(error); } },
    uploadSingleFile(maxUploadBytes, { fieldName: "image", maxFields: 2, allowedDetectedMimeTypes: new Set(["image/jpeg", "image/png", "image/webp"]), allowedTypeMessage: "Choose a JPEG, PNG, or WebP image." }),
    validateBody(vendorWorkUploadSchema), async (request, response, next) => {
      try { response.status(201).json({ data: await service.uploadImage(request.authenticatedUser!, String(request.params.assignmentId), request.body, request.validatedUpload!) }); } catch (error) { next(error); }
    });
  router.post("/vendor/work/:assignmentId/submit", protectedRoute, requireOperation("POST /vendor/work/:assignmentId/submit"), validateBody(vendorWorkSubmitSchema), async (request, response, next) => {
    try { response.json({ data: await service.submit(request.authenticatedUser!, String(request.params.assignmentId), request.body) }); } catch (error) { next(error); }
  });
  router.get("/clients/projects/:projectId/vendor-work-reviews", protectedRoute, requireOperation("GET /clients/projects/:projectId/vendor-work-reviews"), validateQuery(clientVendorWorkQuerySchema), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.clientReviews(request.authenticatedUser!, String(request.params.projectId), response.locals.validatedQuery) }); } catch (error) { next(error); }
  });
  router.post("/clients/projects/:projectId/vendor-work-reviews/:reviewId/decision", protectedRoute, requireOperation("POST /clients/projects/:projectId/vendor-work-reviews/:reviewId/decision"), validateBody(clientVendorWorkDecisionSchema), async (request, response, next) => {
    try { response.json({ data: await service.clientDecision(request.authenticatedUser!, String(request.params.projectId), String(request.params.reviewId), request.body) }); } catch (error) { next(error); }
  });
  router.get("/projects/:projectId/vendor-work-progress", protectedRoute, requireOperation("GET /projects/:projectId/vendor-work-progress"), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.projectProgress(request.authenticatedUser!, String(request.params.projectId)) }); } catch (error) { next(error); }
  });
  router.get("/projects/:projectId/vendor-work/:assignmentId/images/:imageId", protectedRoute, requireOperation("GET /projects/:projectId/vendor-work/:assignmentId/images/:imageId"), async (request, response, next) => {
    const controller = new AbortController();
    const closed = () => { if (!response.writableEnded) controller.abort(); };
    response.once("close", closed);
    try {
      const file = await service.image(request.authenticatedUser!, String(request.params.projectId), String(request.params.assignmentId), String(request.params.imageId), controller.signal);
      response.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Length": String(file.byteSize), "Content-Disposition": "inline" });
      response.type(file.mimeType);
      await pipeline(file.stream, response);
    } catch (error) { if (response.headersSent) response.destroy(); else next(error); }
    finally { response.removeListener("close", closed); }
  });
  return router;
}
