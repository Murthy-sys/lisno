import { Router } from "express";
import { projectCompletionQueueQuerySchema, projectCompletionSchema, projectScopeExceptionSchema } from "../domain/project-completion.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectCompletionService } from "../services/project-completion.service.js";

export function createProjectCompletionRouter(auth: AuthService, service: ProjectCompletionService): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/admin/project-completion-tasks", protectedRoute, requireOperation("GET /admin/project-completion-tasks"), validateQuery(projectCompletionQueueQuerySchema), async (request, response, next) => {
    try { response.json({ data: await service.queue(request.authenticatedUser!, response.locals.validatedQuery) }); } catch (error) { next(error); }
  });
  router.get("/admin/projects/:projectId/completion", protectedRoute, requireOperation("GET /admin/projects/:projectId/completion"), async (request, response, next) => {
    try { response.json({ data: await service.summary(request.authenticatedUser!, String(request.params.projectId)) }); } catch (error) { next(error); }
  });
  router.post("/admin/projects/:projectId/scope-exceptions", protectedRoute, requireOperation("POST /admin/projects/:projectId/scope-exceptions"), validateBody(projectScopeExceptionSchema), async (request, response, next) => {
    try { response.status(201).json({ data: await service.except(request.authenticatedUser!, String(request.params.projectId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/admin/projects/:projectId/complete", protectedRoute, requireOperation("POST /admin/projects/:projectId/complete"), validateBody(projectCompletionSchema), async (request, response, next) => {
    try { response.json({ data: await service.complete(request.authenticatedUser!, String(request.params.projectId), request.body) }); } catch (error) { next(error); }
  });
  return router;
}
