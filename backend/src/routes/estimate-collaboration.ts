import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { AuditService } from "../services/audit.service.js";
import { createEstimateCollaborationService } from "../services/estimate-collaboration.service.js";

const expectedVersion = z.number().int().positive().safe();
export function createEstimateCollaborationRouter(auth: AuthService, audit: AuditService) {
  const router = Router();
  const service = createEstimateCollaborationService(audit);
  router.post("/estimates/:estimateId/enable-collaboration", authenticate(auth), requireOperation("POST /estimates/:estimateId/enable-collaboration"),
    validateBody(z.object({ expectedVersion }).strict()), async (req, res, next) => {
      try { res.json({ data: await service.enable(req.authenticatedUser!, String(req.params.estimateId), req.body.expectedVersion) }); } catch (error) { next(error); }
    });
  router.post("/estimates/:estimateId/withdraw-review", authenticate(auth), requireOperation("POST /estimates/:estimateId/withdraw-review"),
    validateBody(z.object({ expectedVersion, reviewRoundId: z.string().trim().min(1), reviewRoundVersion: expectedVersion,
      reason: z.string().trim().min(1).max(1000) }).strict()), async (req, res, next) => {
      try { res.json({ data: await service.withdraw(req.authenticatedUser!, String(req.params.estimateId), req.body) }); } catch (error) { next(error); }
    });
  router.post("/estimates/:estimateId/preparation-snapshots", authenticate(auth), requireOperation("POST /estimates/:estimateId/preparation-snapshots"),
    validateBody(z.object({ expectedVersion }).strict()), async (req, res, next) => {
      try { res.status(201).json({ data: await service.releasePreparation(req.authenticatedUser!, String(req.params.estimateId), req.body.expectedVersion) }); } catch (error) { next(error); }
    });
  return router;
}
