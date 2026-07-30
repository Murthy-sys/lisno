import { pipeline } from "node:stream/promises";

import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { annotationDocumentSchema } from "../domain/estimate-design.js";
import type { AuthService } from "../services/auth.service.js";
import type { EstimateDesignService } from "../services/estimate-design.service.js";

const cropSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
}).strict();

const estimateItemAssignmentSchema = z.object({
  version: z.number().int().positive(),
  roomId: z.string().trim().min(1).max(128),
  catalogueId: z.string().trim().min(1).max(64)
}).strict();
const editDrawingBase = z.object({
  version: z.number().int().positive(),
  displayTitle: z.string().trim().min(1).max(500).optional(),
  crop: cropSchema.optional(),
  verified: z.boolean().optional()
});
const editDrawingSchema = z.union([
  editDrawingBase.extend({
    roomId: z.string().trim().min(1).max(128),
    catalogueId: z.string().trim().min(1).max(64)
  }).strict(),
  editDrawingBase.extend({
    roomId: z.string().trim().min(1).max(128),
    scopeSectionId: z.string().trim().min(1).max(64)
  }).strict(),
  editDrawingBase.strict()
]).refine(
  (value) => Object.keys(value).some((key) => key !== "version"),
  { message: "Provide at least one drawing change." }
);
const annotationDraftSchema = z.object({
  version: z.number().int().nonnegative(),
  annotations: annotationDocumentSchema
}).strict();
const drawingDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    version: z.number().int().positive(),
    decision: z.literal("approve")
  }).strict(),
  z.object({
    version: z.number().int().positive(),
    decision: z.literal("request_changes"),
    summary: z.string().min(1).max(1_000).refine(
      (value) => value.trim().length > 0,
      { message: "A change summary is required." }
    ),
    annotations: annotationDocumentSchema.refine(
      (value) => value.elements.length > 0,
      { message: "Add at least one annotation or text note." }
    )
  }).strict()
]);
const replacementBodySchema = z.object({
  version: z.coerce.number().int().positive()
}).strict();
const removeDrawingSchema = z.object({ version: z.number().int().positive() }).strict();
const createManualDrawingBase = z.object({
  displayTitle: z.string().trim().min(1).max(500),
  crop: cropSchema
});
const createManualDrawingSchema = z.union([
  createManualDrawingBase.extend({
    roomId: z.string().trim().min(1).max(128),
    catalogueId: z.string().trim().min(1).max(64)
  }).strict(),
  createManualDrawingBase.extend({
    roomId: z.string().trim().min(1).max(128),
    scopeSectionId: z.string().trim().min(1).max(64)
  }).strict()
]);

export function createEstimateDesignsRouter(
  authService: AuthService,
  estimateDesigns: EstimateDesignService,
  maxUploadBytes: number
): Router {
  const router = Router();
  const protectedRoute = authenticate(authService);
  const estimatorOnly = authorizeRoles("estimator_sales");

  router.post(
    "/estimates/:estimateId/design-uploads",
    protectedRoute,
    estimatorOnly,
    uploadSingleFile(maxUploadBytes),
    async (request, response, next) => {
      try {
        response.status(201).json({ data: await estimateDesigns.upload(request.authenticatedUser!, request.params.estimateId as string, request.validatedUpload!) });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get("/estimates/:estimateId/design-uploads", protectedRoute, estimatorOnly, async (request, response, next) => {
    try {
      response.json({ data: await estimateDesigns.listEstimator(request.authenticatedUser!, request.params.estimateId as string) });
    } catch (error) {
      next(error);
    }
  });
  router.post("/estimate-design-uploads/:uploadId/retry", protectedRoute, estimatorOnly, async (request, response, next) => {
    try { response.json({ data: await estimateDesigns.retryUpload(request.authenticatedUser!, request.params.uploadId as string) }); } catch (error) { next(error); }
  });

  router.get("/estimate-design-source-pages/:pageId/image", protectedRoute, estimatorOnly, streamImage((user, id) => estimateDesigns.sourceImage(user, id)));
  router.post(
    "/estimate-design-source-pages/:pageId/drawings",
    protectedRoute,
    estimatorOnly,
    validateBody(createManualDrawingSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await estimateDesigns.createManualDrawing(
            request.authenticatedUser!,
            request.params.pageId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );
  router.get("/estimate-design-revisions/:revisionId/image", protectedRoute, streamImage((user, id) => estimateDesigns.revisionImage(user, id)));
  router.get(
    "/client/estimates/:estimateId/design-drawings",
    protectedRoute,
    authorizeRoles("client"),
    async (request, response, next) => {
      try {
        response.json({
          data: await estimateDesigns.listClient(
            request.authenticatedUser!,
            request.params.estimateId as string
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );
  router.put(
    "/client/estimate-design-revisions/:revisionId/annotation-draft",
    protectedRoute,
    authorizeRoles("client"),
    validateBody(annotationDraftSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await estimateDesigns.saveAnnotationDraft(
            request.authenticatedUser!,
            request.params.revisionId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );
  router.post(
    "/client/estimate-design-revisions/:revisionId/decision",
    protectedRoute,
    authorizeRoles("client"),
    validateBody(drawingDecisionSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await estimateDesigns.decideDrawing(
            request.authenticatedUser!,
            request.params.revisionId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );
  router.patch(
    "/estimate-design-drawings/:drawingId",
    protectedRoute,
    estimatorOnly,
    validateBody(editDrawingSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await estimateDesigns.editDrawing(
            request.authenticatedUser!,
            request.params.drawingId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );
  router.put(
    "/estimate-design-drawings/:drawingId/estimate-item",
    protectedRoute,
    estimatorOnly,
    validateBody(estimateItemAssignmentSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await estimateDesigns.assignEstimateItem(
            request.authenticatedUser!,
            request.params.drawingId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );
  router.delete(
    "/estimate-design-drawings/:drawingId",
    protectedRoute,
    estimatorOnly,
    validateBody(removeDrawingSchema),
    async (request, response, next) => {
      try { response.json({ data: await estimateDesigns.removeDrawing(request.authenticatedUser!, request.params.drawingId as string, request.body.version) }); } catch (error) { next(error); }
    }
  );
  router.post(
    "/estimate-design-drawings/:drawingId/replacement",
    protectedRoute,
    estimatorOnly,
    uploadSingleFile(maxUploadBytes, 1),
    validateBody(replacementBodySchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await estimateDesigns.replaceDrawing(
            request.authenticatedUser!,
            request.params.drawingId as string,
            { version: request.body.version, file: request.validatedUpload! }
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );
  router.post(
    "/estimates/:estimateId/design-drawings/submit",
    protectedRoute,
    estimatorOnly,
    async (request, response, next) => {
      try {
        response.json({
          data: await estimateDesigns.submitDrawings(
            request.authenticatedUser!,
            request.params.estimateId as string
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

function streamImage(load: (user: NonNullable<Request["authenticatedUser"]>, id: string) => Promise<NodeJS.ReadableStream>) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.setHeader("Content-Type", "image/png");
      response.setHeader("Cache-Control", "private, no-store");
      await pipeline(await load(request.authenticatedUser!, String(request.params.pageId ?? request.params.revisionId)), response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      next(error);
    }
  };
}
