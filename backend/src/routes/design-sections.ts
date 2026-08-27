import { pipeline } from "node:stream/promises";

import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { DesignSectionService } from "../services/design-section.service.js";

const cropSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
}).strict();
const addSchema = z.object({
  sourcePageId: z.string().min(1),
  label: z.string().min(1).max(200),
  crop: cropSchema
}).strict();
const editSchema = z.object({
  version: z.number().int().positive(),
  label: z.string().min(1).max(200).optional(),
  crop: cropSchema.optional()
}).strict().refine((input) => input.label !== undefined || input.crop !== undefined);
const removeSchema = z.object({ version: z.number().int().positive() }).strict();
const decisionSchema = z.object({
  version: z.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().trim().max(1000).optional()
}).strict();

export function createDesignSectionsRouter(
  authService: AuthService,
  sections: DesignSectionService
): Router {
  const router = Router();
  const protectedRoute = authenticate(authService);

  router.get("/design-versions/:versionId/sections", protectedRoute, requireOperation("GET /design-versions/:versionId/sections"), handler(async (request) =>
    sections.listDrafts(request.authenticatedUser!, request.params.versionId as string)
  ));
  router.post("/design-versions/:versionId/sections", protectedRoute, requireOperation("POST /design-versions/:versionId/sections"), validateBody(addSchema), handler(async (request) =>
    sections.add(request.authenticatedUser!, request.params.versionId as string, request.body), 201
  ));
  router.patch("/design-sections/:sectionId", protectedRoute, requireOperation("PATCH /design-sections/:sectionId"), validateBody(editSchema), handler(async (request) =>
    sections.edit(request.authenticatedUser!, request.params.sectionId as string, request.body)
  ));
  router.delete("/design-sections/:sectionId", protectedRoute, requireOperation("DELETE /design-sections/:sectionId"), validateBody(removeSchema), handler(async (request) =>
    sections.remove(request.authenticatedUser!, request.params.sectionId as string, request.body.version)
  ));
  router.post("/design-versions/:versionId/retry-extraction", protectedRoute, requireOperation("POST /design-versions/:versionId/retry-extraction"), handler(async (request) =>
    sections.retry(request.authenticatedUser!, request.params.versionId as string)
  ));
  router.post("/design-versions/:versionId/submit-sections", protectedRoute, requireOperation("POST /design-versions/:versionId/submit-sections"), handler(async (request) =>
    sections.submit(request.authenticatedUser!, request.params.versionId as string)
  ));
  router.get("/client/projects/:projectId/design-sections", protectedRoute, requireOperation("GET /client/projects/:projectId/design-sections"), handler(async (request) =>
    sections.listReview(request.authenticatedUser!, request.params.projectId as string)
  ));
  router.post(
    "/design-section-revisions/:revisionId/decision",
    protectedRoute,
    requireOperation("POST /design-section-revisions/:revisionId/decision"),
    validateBody(decisionSchema),
    handler(async (request) =>
      sections.decide(
        request.authenticatedUser!,
        request.params.revisionId as string,
        request.body
      )
    )
  );

  router.get("/design-source-pages/:pageId/image", protectedRoute, requireOperation("GET /design-source-pages/:pageId/image"), async (request, response, next) => {
    try {
      response.type("png");
      await pipeline(
        await sections.pageImage(request.authenticatedUser!, request.params.pageId as string),
        response
      );
    } catch (error) {
      if (response.headersSent) response.destroy(error instanceof Error ? error : undefined);
      else next(error);
    }
  });
  router.get("/design-section-revisions/:revisionId/image", protectedRoute, requireOperation("GET /design-section-revisions/:revisionId/image"), async (request, response, next) => {
    try {
      response.type("png");
      await pipeline(
        await sections.revisionImage(request.authenticatedUser!, request.params.revisionId as string),
        response
      );
    } catch (error) {
      if (response.headersSent) response.destroy(error instanceof Error ? error : undefined);
      else next(error);
    }
  });
  return router;
}

function handler(
  operation: (request: import("express").Request) => Promise<unknown>,
  status = 200
) {
  return async (
    request: import("express").Request,
    response: import("express").Response,
    next: import("express").NextFunction
  ) => {
    try {
      response.status(status).json({ data: await operation(request) });
    } catch (error) {
      next(error);
    }
  };
}
