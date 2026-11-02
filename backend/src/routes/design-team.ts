import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { createDesignTeamService, secondaryDesignersSchema } from "../services/design-team.service.js";
import type { AuditService } from "../services/audit.service.js";
import type { AuthService } from "../services/auth.service.js";

export function createDesignTeamRouter(auth: AuthService, audit: AuditService) {
  const router = Router();
  const service = createDesignTeamService(audit);
  router.get("/projects/:projectId/design-team", authenticate(auth), requireOperation("GET /projects/:projectId/design-team"),
    validateQuery(z.object({ search: z.string().trim().max(100).default("") }).strict()), async (req, res, next) => {
      try { res.setHeader("Cache-Control", "private, no-store"); res.json({ data: await service.detail(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery.search) }); }
      catch (error) { next(error); }
    });
  router.put("/projects/:projectId/secondary-designers", authenticate(auth), requireOperation("PUT /projects/:projectId/secondary-designers"),
    validateBody(secondaryDesignersSchema), async (req, res, next) => {
      try { res.setHeader("Cache-Control", "private, no-store"); res.json({ data: await service.update(req.authenticatedUser!, String(req.params.projectId), req.body) }); }
      catch (error) { next(error); }
    });
  return router;
}
