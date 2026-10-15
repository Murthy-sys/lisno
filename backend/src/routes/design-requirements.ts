import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import { designRequirementActionSchema } from "../domain/design-requirements.js";
import type { AuthService } from "../services/auth.service.js";
import type { createDesignRequirementsService } from "../services/design-requirements.service.js";

export function createDesignRequirementsRouter(auth: AuthService, service: ReturnType<typeof createDesignRequirementsService>) {
  const router = Router();
  const protect = authenticate(auth);
  router.get("/projects/:projectId/design-requirements", protect, requireOperation("GET /projects/:projectId/design-requirements"), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.get(request.authenticatedUser!, String(request.params.projectId)) }); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/design-requirements/actions", protect, requireOperation("POST /projects/:projectId/design-requirements/actions"), validateBody(designRequirementActionSchema), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.act(request.authenticatedUser!, String(request.params.projectId), request.body) }); } catch (error) { next(error); }
  });
  return router;
}
