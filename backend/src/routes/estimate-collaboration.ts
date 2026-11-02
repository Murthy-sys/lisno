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
  router.get("/estimates/:estimateId/collaboration-preview", authenticate(auth), requireOperation("GET /estimates/:estimateId/collaboration-preview"),
    async (req, res, next) => { try {
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ data: await service.preview(req.authenticatedUser!, String(req.params.estimateId)) });
    } catch (error) { next(error); } });
  router.post("/estimates/:estimateId/enable-collaboration", authenticate(auth), requireOperation("POST /estimates/:estimateId/enable-collaboration"),
    validateBody(z.union([z.object({ expectedVersion }).strict(), z.object({ expectedVersion, targetVersion: z.literal(3),
      reason: z.string().trim().min(1).max(1000), previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict()])), async (req, res, next) => {
      try { res.json({ data: req.body.targetVersion === 3
        ? await service.enableQuotation(req.authenticatedUser!, String(req.params.estimateId), req.body)
        : await service.enable(req.authenticatedUser!, String(req.params.estimateId), req.body.expectedVersion) }); } catch (error) { next(error); }
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
  router.post("/estimates/:estimateId/unlock", authenticate(auth), requireOperation("POST /estimates/:estimateId/unlock"),
    validateBody(z.object({ expectedVersion, reviewRoundId: z.string().trim().min(1), reason: z.string().trim().min(1).max(1000),
      idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) }).strict()), async (req, res, next) => {
      try { res.json({ data: await service.unlock(req.authenticatedUser!, String(req.params.estimateId), req.body) }); } catch (error) { next(error); }
    });
  return router;
}
