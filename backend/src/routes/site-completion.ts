import { Router } from "express";
import { siteCompletionDecisionSchema, siteCompletionProgressSchema, siteCompletionSubmitSchema } from "../domain/site-completion.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { SiteCompletionService } from "../services/site-completion.service.js";

export function createSiteCompletionRouter(auth: AuthService, service: SiteCompletionService): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/projects/:projectId/site-completion", protectedRoute, requireOperation("GET /projects/:projectId/site-completion"), async (request, response, next) => {
    try { response.json({ data: await service.read(request.authenticatedUser!, String(request.params.projectId), "site_manager") }); } catch (error) { next(error); }
  });
  router.get("/admin/projects/:projectId/site-completion", protectedRoute, requireOperation("GET /admin/projects/:projectId/site-completion"), async (request, response, next) => {
    try { response.json({ data: await service.read(request.authenticatedUser!, String(request.params.projectId), "super_admin") }); } catch (error) { next(error); }
  });
  router.patch("/projects/:projectId/site-completion/progress", protectedRoute, requireOperation("PATCH /projects/:projectId/site-completion/progress"), validateBody(siteCompletionProgressSchema), async (request, response, next) => {
    try { response.json({ data: await service.progress(request.authenticatedUser!, String(request.params.projectId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/site-completion/submit", protectedRoute, requireOperation("POST /projects/:projectId/site-completion/submit"), validateBody(siteCompletionSubmitSchema), async (request, response, next) => {
    try { response.json({ data: await service.submit(request.authenticatedUser!, String(request.params.projectId), request.body) }); } catch (error) { next(error); }
  });
  router.get("/clients/projects/:projectId/site-completion", protectedRoute, requireOperation("GET /clients/projects/:projectId/site-completion"), async (request, response, next) => {
    try { response.json({ data: await service.read(request.authenticatedUser!, String(request.params.projectId), "client") }); } catch (error) { next(error); }
  });
  router.post("/clients/projects/:projectId/site-completion/decision", protectedRoute, requireOperation("POST /clients/projects/:projectId/site-completion/decision"), validateBody(siteCompletionDecisionSchema), async (request, response, next) => {
    try { response.json({ data: await service.decide(request.authenticatedUser!, String(request.params.projectId), request.body) }); } catch (error) { next(error); }
  });
  return router;
}
