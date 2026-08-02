import { pipeline } from "node:stream/promises";

import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { annotationDocumentSchema } from "../domain/estimate-design.js";
import { authenticate, authorizeRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { createEstimatePlanReviewService } from "../services/estimate-plan-review.service.js";

type EstimatePlanReviewService = ReturnType<typeof createEstimatePlanReviewService>;

const draftSchema = z.object({
  version: z.number().int().nonnegative(),
  annotations: annotationDocumentSchema
}).strict();
const previewSchema = z.object({ annotations: annotationDocumentSchema }).strict();
const requestSchema = z.object({
  version: z.number().int().positive(),
  summary: z.string().trim().min(1).max(1_000),
  annotations: annotationDocumentSchema.refine((value) => value.elements.length > 0),
  targetDrawingIds: z.array(z.string().trim().min(1)).max(50),
  snapshotToken: z.string().length(64),
  idempotencyKey: z.string().trim().min(1).max(128)
}).strict();

export function createEstimatePlanReviewRouter(auth: AuthService, plans: EstimatePlanReviewService) {
  const router = Router();
  const clientOnly = [authenticate(auth), authorizeRoles("client")] as const;
  router.get("/client/estimates/:estimateId/plan-review", ...clientOnly, async (request, response, next) => {
    try { response.json({ data: await plans.listClient(request.authenticatedUser!, request.params.estimateId as string) }); } catch (error) { next(error); }
  });
  router.get("/client/estimate-plan-pages/:pageId/thumbnail", ...clientOnly, stream((user, pageId) => plans.pageImage(user, pageId, true)));
  router.get("/client/estimate-plan-pages/:pageId/current-image", ...clientOnly, stream((user, pageId) => plans.pageImage(user, pageId, false)));
  router.put("/client/estimate-plan-pages/:pageId/annotation-draft", ...clientOnly, validateBody(draftSchema), async (request, response, next) => {
    try { response.json({ data: await plans.saveDraft(request.authenticatedUser!, request.params.pageId as string, request.body) }); } catch (error) { next(error); }
  });
  router.post("/client/estimate-plan-pages/:pageId/target-preview", ...clientOnly, validateBody(previewSchema), async (request, response, next) => {
    try { response.json({ data: await plans.previewTargets(request.authenticatedUser!, request.params.pageId as string, request.body) }); } catch (error) { next(error); }
  });
  router.post("/client/estimate-plan-pages/:pageId/change-requests", ...clientOnly, validateBody(requestSchema), async (request, response, next) => {
    try { response.status(201).json({ data: await plans.submitRequest(request.authenticatedUser!, request.params.pageId as string, request.body) }); } catch (error) { next(error); }
  });
  return router;
}

function stream(open: (user: NonNullable<Request["authenticatedUser"]>, id: string) => Promise<NodeJS.ReadableStream>) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.type("image/png");
      response.setHeader("Cache-Control", "private, no-store");
      await pipeline(await open(request.authenticatedUser!, request.params.pageId as string), response);
    } catch (error) { next(error); }
  };
}
