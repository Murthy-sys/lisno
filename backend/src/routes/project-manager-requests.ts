import { Router, type Response } from "express";
import { authenticate } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { pmRequestCreateSchema, pmRequestActionSchema, pmSupplyActionSchema, pmRequestListSchema } from "../domain/project-manager/requests.js";
import { requireOperation } from "../middleware/authorization.js";
import type { AuthService } from "../services/auth.service.js";
import type { createProjectManagerRequestsSupplyService } from "../services/project-manager/requests.js";

export function createProjectManagerRequestsRouter(auth: AuthService, service: ReturnType<typeof createProjectManagerRequestsSupplyService>) {
  const router = Router(); const protect = authenticate(auth);
  const json = (res: Response, data: unknown) => res.set("Cache-Control", "private, no-store").json({ data });
  router.get("/projects/:projectId/pm/procurement", protect, requireOperation("GET /projects/:projectId/pm/procurement"), validateQuery(pmRequestListSchema), async (req, res, next) => { try { json(res, await service.procurement(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery)); } catch (error) { next(error); } });
  router.get("/projects/:projectId/pm/selections", protect, requireOperation("GET /projects/:projectId/pm/selections"), validateQuery(pmRequestListSchema), async (req, res, next) => { try { json(res, await service.selections(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery)); } catch (error) { next(error) ; } });
  router.get("/projects/:projectId/pm/supply", protect, requireOperation("GET /projects/:projectId/pm/supply"), validateQuery(pmRequestListSchema), async (req, res, next) => { try { json(res, await service.supply(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery)); } catch (error) { next(error); } });
  router.post("/projects/:projectId/pm/procurement-requests", protect, requireOperation("POST /projects/:projectId/pm/procurement-requests"), validateBody(pmRequestCreateSchema), async (req, res, next) => { try { json(res, await service.createRequest(req.authenticatedUser!, String(req.params.projectId), "procurement", req.body)); } catch (error) { next(error); } });
  router.post("/projects/:projectId/pm/procurement-requests/:requestId/actions", protect, requireOperation("POST /projects/:projectId/pm/procurement-requests/:requestId/actions"), validateBody(pmRequestActionSchema), async (req, res, next) => { try { json(res, await service.actRequest(req.authenticatedUser!, String(req.params.projectId), "procurement", String(req.params.requestId), req.body)); } catch (error) { next(error); } });
  router.post("/projects/:projectId/pm/selection-requests", protect, requireOperation("POST /projects/:projectId/pm/selection-requests"), validateBody(pmRequestCreateSchema), async (req, res, next) => { try { json(res, await service.createRequest(req.authenticatedUser!, String(req.params.projectId), "selection", req.body)); } catch (error) { next(error); } });
  router.post("/projects/:projectId/pm/selection-requests/:requestId/actions", protect, requireOperation("POST /projects/:projectId/pm/selection-requests/:requestId/actions"), validateBody(pmRequestActionSchema), async (req, res, next) => { try { json(res, await service.actRequest(req.authenticatedUser!, String(req.params.projectId), "selection", String(req.params.requestId), req.body)); } catch (error) { next(error); } });
  router.post("/projects/:projectId/pm/supply-milestones/:milestoneId/actions", protect, requireOperation("POST /projects/:projectId/pm/supply-milestones/:milestoneId/actions"), validateBody(pmSupplyActionSchema), async (req, res, next) => { try { json(res, await service.actSupply(req.authenticatedUser!, String(req.params.projectId), String(req.params.milestoneId), req.body)); } catch (error) { next(error); } });
  return router;
}
