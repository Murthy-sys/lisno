import { pipeline } from "node:stream/promises";

import { Router, type NextFunction, type Request, type Response } from "express";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import { uploadSingleFile } from "../middleware/upload.js";
import type { AuthService } from "../services/auth.service.js";
import type { EstimateDesignService } from "../services/estimate-design.service.js";

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
