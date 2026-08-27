import { pipeline } from "node:stream/promises";

import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { annotationDocumentSchema } from "../domain/estimate-design.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
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
const updateClientRequestSchema = z.object({
  version: z.number().int().positive(),
  summary: z.string().trim().min(1).max(1_000),
  annotations: annotationDocumentSchema.refine((value) => value.elements.length > 0)
}).strict();
const targetSchema = z.object({
  version: z.number().int().positive(),
  targetDrawingIds: z.array(z.string().trim().min(1)).min(1).max(50)
}).strict();
const resolvePageSchema = z.object({
  version: z.number().int().positive(),
  note: z.string().trim().min(1).max(1_000)
}).strict();

export function createEstimatePlanReviewRouter(auth: AuthService, plans: EstimatePlanReviewService) {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/client/estimates/:estimateId/plan-review", protectedRoute, requireOperation("GET /client/estimates/:estimateId/plan-review"), async (request, response, next) => {
    try { response.json({ data: await plans.listClient(request.authenticatedUser!, request.params.estimateId as string) }); } catch (error) { next(error); }
  });
  router.get("/client/estimate-plan-pages/:pageId/thumbnail", protectedRoute, requireOperation("GET /client/estimate-plan-pages/:pageId/thumbnail"), stream((user, pageId) => plans.pageImage(user, pageId, true)));
  router.get("/client/estimate-plan-pages/:pageId/current-image", protectedRoute, requireOperation("GET /client/estimate-plan-pages/:pageId/current-image"), stream((user, pageId) => plans.pageImage(user, pageId, false)));
  router.put("/client/estimate-plan-pages/:pageId/annotation-draft", protectedRoute, requireOperation("PUT /client/estimate-plan-pages/:pageId/annotation-draft"), validateBody(draftSchema), async (request, response, next) => {
    try { response.json({ data: await plans.saveDraft(request.authenticatedUser!, request.params.pageId as string, request.body) }); } catch (error) { next(error); }
  });
  router.post("/client/estimate-plan-pages/:pageId/target-preview", protectedRoute, requireOperation("POST /client/estimate-plan-pages/:pageId/target-preview"), validateBody(previewSchema), async (request, response, next) => {
    try { response.json({ data: await plans.previewTargets(request.authenticatedUser!, request.params.pageId as string, request.body) }); } catch (error) { next(error); }
  });
  router.post("/client/estimate-plan-pages/:pageId/change-requests", protectedRoute, requireOperation("POST /client/estimate-plan-pages/:pageId/change-requests"), validateBody(requestSchema), async (request, response, next) => {
    try { response.status(201).json({ data: await plans.submitRequest(request.authenticatedUser!, request.params.pageId as string, request.body) }); } catch (error) { next(error); }
  });
  router.put("/client/estimate-plan-change-requests/:requestId", protectedRoute, requireOperation("PUT /client/estimate-plan-change-requests/:requestId"), validateBody(updateClientRequestSchema), async (request, response, next) => {
    try { response.json({ data: await plans.updateClientRequest(request.authenticatedUser!, request.params.requestId as string, request.body) }); } catch (error) { next(error); }
  });
  router.get("/estimate-plan-change-requests", protectedRoute, requireOperation("GET /estimate-plan-change-requests"), async (request, response, next) => {
    try {
      const filters: { estimateId?: string; status?: "open" | "resolved" } = {
        ...(typeof request.query.estimateId === "string" ? { estimateId: request.query.estimateId } : {}),
        ...(request.query.status === "open" || request.query.status === "resolved" ? { status: request.query.status } : {})
      };
      response.json({ data: await plans.listStaff(request.authenticatedUser!, filters) });
    } catch (error) { next(error); }
  });
  router.get("/estimate-plan-change-requests/:requestId", protectedRoute, requireOperation("GET /estimate-plan-change-requests/:requestId"), async (request, response, next) => {
    try { response.json({ data: await plans.getStaff(request.authenticatedUser!, request.params.requestId as string) }); } catch (error) { next(error); }
  });
  router.put("/estimate-plan-change-requests/:requestId/targets", protectedRoute, requireOperation("PUT /estimate-plan-change-requests/:requestId/targets"), validateBody(targetSchema), async (request, response, next) => {
    try { response.json({ data: await plans.updateTargets(request.authenticatedUser!, request.params.requestId as string, request.body) }); } catch (error) { next(error); }
  });
  router.post("/estimate-plan-change-requests/:requestId/resolve-page", protectedRoute, requireOperation("POST /estimate-plan-change-requests/:requestId/resolve-page"), validateBody(resolvePageSchema), async (request, response, next) => {
    try { response.json({ data: await plans.resolvePage(request.authenticatedUser!, request.params.requestId as string, request.body) }); } catch (error) { next(error); }
  });
  router.get("/estimate-plan-pages/:pageId/current-image", protectedRoute, requireOperation("GET /estimate-plan-pages/:pageId/current-image"), stream((user, pageId) => plans.staffPageImage(user, pageId)));
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
