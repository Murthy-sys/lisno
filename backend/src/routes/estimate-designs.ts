import { pipeline } from "node:stream/promises";

import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { EstimateDesignService } from "../services/estimate-design.service.js";

const cropSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
}).strict();

const editDrawingSchema = z.object({
  version: z.number().int().positive(),
  displayTitle: z.string().trim().min(1).max(500).optional(),
  roomId: z.string().trim().min(1).max(128).optional(),
  scopeSectionId: z.string().trim().min(1).max(64).optional(),
  crop: cropSchema.optional(),
  verified: z.boolean().optional()
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== "version"),
  { message: "Provide at least one drawing change." }
);

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

  router.get("/estimate-design-source-pages/:pageId/image", protectedRoute, estimatorOnly, streamImage((user, id) => estimateDesigns.sourceImage(user, id)));
  router.get("/estimate-design-revisions/:revisionId/image", protectedRoute, estimatorOnly, streamImage((user, id) => estimateDesigns.revisionImage(user, id)));
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
