import { Router, type Response } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { pmClientQuerySchema, pmEscalationActionSchema, pmEscalationCreateSchema, pmSnagActionSchema, pmSnagCreateSchema, pmSnagVisitSchema, pmSnagQuerySchema } from "../domain/project-manager/client.js";
import type { AuthService } from "../services/auth.service.js";
import type { createProjectManagerClientService } from "../services/project-manager/client.js";

export function createProjectManagerClientRouter(auth: AuthService, service: ReturnType<typeof createProjectManagerClientService>) {
  const router = Router();
  const protect = authenticate(auth);
  const json = (response: Response, data: unknown) => response.set("Cache-Control", "private, no-store").json({ data });
  router.get("/projects/:projectId/pm/client", protect, requireOperation("GET /projects/:projectId/pm/client"), validateQuery(pmClientQuerySchema), async (req, res, next) => {
    try { json(res, await service.client(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery)); } catch (error) { next(error); }
  });
  router.get("/projects/:projectId/pm/snagging", protect, requireOperation("GET /projects/:projectId/pm/snagging"), validateQuery(pmSnagQuerySchema), async (req, res, next) => {
    try { json(res, await service.snagging(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery)); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/pm/escalations", protect, requireOperation("POST /projects/:projectId/pm/escalations"), validateBody(pmEscalationCreateSchema), async (req, res, next) => {
    try { json(res, await service.createEscalation(req.authenticatedUser!, String(req.params.projectId), req.body)); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/pm/escalations/:escalationId/actions", protect, requireOperation("POST /projects/:projectId/pm/escalations/:escalationId/actions"), validateBody(pmEscalationActionSchema), async (req, res, next) => {
    try { json(res, await service.actEscalation(req.authenticatedUser!, String(req.params.projectId), String(req.params.escalationId), req.body)); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/pm/snags", protect, requireOperation("POST /projects/:projectId/pm/snags"), validateBody(pmSnagCreateSchema), async (req, res, next) => {
    try { json(res, await service.createSnag(req.authenticatedUser!, String(req.params.projectId), req.body)); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/pm/snags/:snagId/actions", protect, requireOperation("POST /projects/:projectId/pm/snags/:snagId/actions"), validateBody(pmSnagActionSchema), async (req, res, next) => {
    try { json(res, await service.actSnag(req.authenticatedUser!, String(req.params.projectId), String(req.params.snagId), req.body)); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/pm/snag-visits", protect, requireOperation("POST /projects/:projectId/pm/snag-visits"), validateBody(pmSnagVisitSchema), async (req, res, next) => {
    try { json(res, await service.logVisit(req.authenticatedUser!, String(req.params.projectId), req.body)); } catch (error) { next(error); }
  });
  return router;
}
