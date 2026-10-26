import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import { createEstimateTiersService, estimateTierSelectionSchema, estimateDimensionsUpdateSchema } from "../services/estimate-tiers.service.js";
import type { AuditService } from "../services/audit.service.js";
import type { AuthService } from "../services/auth.service.js";

export function createEstimateTiersRouter(auth: AuthService, audit: AuditService) {
  const router = Router();
  const service = createEstimateTiersService({ audit });
  const privateResponse = (_req: unknown, res: { setHeader: (name: string, value: string) => unknown }, next: () => void) => {
    res.setHeader("Cache-Control", "private, no-store"); next();
  };
  router.get("/projects/:projectId/estimate-tiers", authenticate(auth), requireOperation("GET /projects/:projectId/estimate-tiers"), privateResponse,
    async (req, res, next) => { try { res.json({ data: await service.detail(req.authenticatedUser!, req.params.projectId as string) }); } catch (error) { next(error); } });
  router.patch("/projects/:projectId/estimate-tiers/:lineItemId", authenticate(auth), requireOperation("PATCH /projects/:projectId/estimate-tiers/:lineItemId"), privateResponse,
    validateBody(estimateTierSelectionSchema), async (req, res, next) => {
      try { res.json({ data: await service.select(req.authenticatedUser!, req.params.projectId as string, req.params.lineItemId as string, req.body) }); }
      catch (error) { next(error); }
    });
  router.patch("/projects/:projectId/estimate-dimensions/:lineItemId", authenticate(auth), requireOperation("PATCH /projects/:projectId/estimate-dimensions/:lineItemId"), privateResponse,
    validateBody(estimateDimensionsUpdateSchema), async (req, res, next) => {
      try { res.json({ data: await service.updateDimensions(req.authenticatedUser!, req.params.projectId as string, req.params.lineItemId as string, req.body) }); }
      catch (error) { next(error); }
    });
  return router;
}
