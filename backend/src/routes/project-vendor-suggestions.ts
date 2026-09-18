import { Router } from "express";
import { vendorSuggestionCreateSchema, vendorSuggestionQuerySchema, vendorSuggestionUpdateSchema } from "../domain/project-vendor-suggestions.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectVendorSuggestionService } from "../services/project-vendor-suggestions.service.js";

export function createProjectVendorSuggestionRouter(auth: AuthService, service: ProjectVendorSuggestionService): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/procurement/suggestion-projects", protectedRoute, requireOperation("GET /procurement/suggestion-projects"), validateQuery(vendorSuggestionQuerySchema), async (req, res, next) => {
    try { res.json({ data: await service.projects(req.authenticatedUser!, res.locals.validatedQuery) }); } catch (error) { next(error); }
  });
  router.get("/procurement/projects/:projectId/vendor-suggestions", protectedRoute, requireOperation("GET /procurement/projects/:projectId/vendor-suggestions"), validateQuery(vendorSuggestionQuerySchema), async (req, res, next) => {
    try { res.json({ data: await service.list(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery) }); } catch (error) { next(error); }
  });
  router.post("/procurement/projects/:projectId/vendor-suggestions", protectedRoute, requireOperation("POST /procurement/projects/:projectId/vendor-suggestions"), validateBody(vendorSuggestionCreateSchema), async (req, res, next) => {
    try { const result = await service.create(req.authenticatedUser!, String(req.params.projectId), req.body); res.status(result.created ? 201 : 200).json({ data: result.suggestion }); } catch (error) { next(error); }
  });
  router.patch("/procurement/projects/:projectId/vendor-suggestions/:suggestionId", protectedRoute, requireOperation("PATCH /procurement/projects/:projectId/vendor-suggestions/:suggestionId"), validateBody(vendorSuggestionUpdateSchema), async (req, res, next) => {
    try { res.json({ data: await service.update(req.authenticatedUser!, String(req.params.projectId), String(req.params.suggestionId), req.body) }); } catch (error) { next(error); }
  });
  return router;
}
