import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import { createEstimateRequirementSchema, updateEstimateRequirementSchema, resolveEstimateRequirementSchema } from "../domain/estimate-requirements.js";
import { createEstimateRequirementsService } from "../services/estimate-requirements.service.js";
import type { AuditService } from "../services/audit.service.js";
import type { AuthService } from "../services/auth.service.js";

export function createEstimateRequirementsRouter(auth: AuthService, audit: AuditService) {
  const router = Router();
  const service = createEstimateRequirementsService({ audit });
  router.get("/projects/:projectId/estimate-requirements", authenticate(auth), requireOperation("GET /projects/:projectId/estimate-requirements"), async (req, res, next) => {
    try { res.json({ data: await service.detail(req.authenticatedUser!, req.params.projectId as string) }); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/estimate-requirements", authenticate(auth), requireOperation("POST /projects/:projectId/estimate-requirements"), validateBody(createEstimateRequirementSchema), async (req, res, next) => {
    try { res.status(201).json({ data: await service.create(req.authenticatedUser!, req.params.projectId as string, req.body) }); } catch (error) { next(error); }
  });
  router.patch("/projects/:projectId/estimate-requirements/:requirementId", authenticate(auth), requireOperation("PATCH /projects/:projectId/estimate-requirements/:requirementId"), validateBody(updateEstimateRequirementSchema), async (req, res, next) => {
    try { res.json({ data: await service.update(req.authenticatedUser!, req.params.projectId as string, req.params.requirementId as string, req.body) }); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/estimate-requirements/:requirementId/resolve", authenticate(auth), requireOperation("POST /projects/:projectId/estimate-requirements/:requirementId/resolve"), validateBody(resolveEstimateRequirementSchema), async (req, res, next) => {
    try { res.json({ data: await service.resolve(req.authenticatedUser!, req.params.projectId as string, req.params.requirementId as string, req.body) }); } catch (error) { next(error); }
  });
  return router;
}
