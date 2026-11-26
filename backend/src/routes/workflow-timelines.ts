import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { updateWorkflowTimelinesSchema, type WorkflowTimelinesService } from "../services/workflow-timelines.service.js";

export function createWorkflowTimelinesRouter(auth: AuthService, service: WorkflowTimelinesService): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/admin/workflow-timelines", protectedRoute,
    requireOperation("GET /admin/workflow-timelines"), validateQuery(z.object({}).strict()),
    async (request, response, next) => {
      try {
        response.setHeader("Cache-Control", "no-store");
        response.json({ data: await service.read(request.authenticatedUser!) });
      } catch (error) { next(error); }
    });
  router.put("/admin/workflow-timelines", protectedRoute,
    requireOperation("PUT /admin/workflow-timelines"), validateQuery(z.object({}).strict()), validateBody(updateWorkflowTimelinesSchema),
    async (request, response, next) => {
      try {
        response.setHeader("Cache-Control", "no-store");
        response.json({ data: await service.update(request.authenticatedUser!, request.body) });
      } catch (error) { next(error); }
    });
  return router;
}
