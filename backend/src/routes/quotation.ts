import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import { ApiError } from "../middleware/errors.js";
import { createQuotationService, quotationPatchSchema } from "../services/quotation.service.js";
import type { AuthService } from "../services/auth.service.js";
import type { AuditService } from "../services/audit.service.js";

const candidatesQuery = z.object({ search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).max(100_000).default(0) }).strict();

export function createQuotationRouter(auth: AuthService, audit: AuditService) {
  const router = Router();
  const service = createQuotationService({ audit });
  const privateResponse = (_req: unknown, res: { setHeader(name: string, value: string): unknown }, next: () => void) => {
    res.setHeader("Cache-Control", "private, no-store"); next();
  };
  router.get("/projects/:projectId/quotation", authenticate(auth), requireOperation("GET /projects/:projectId/quotation"), privateResponse,
    async (req, res, next) => { try { res.json({ data: await service.detail(req.authenticatedUser!, String(req.params.projectId)) }); } catch (error) { next(error); } });
  router.get("/projects/:projectId/quotation/revision", authenticate(auth), requireOperation("GET /projects/:projectId/quotation/revision"), privateResponse,
    async (req, res, next) => { try { res.json({ data: await service.revision(req.authenticatedUser!, String(req.params.projectId)) }); } catch (error) { next(error); } });
  router.get("/projects/:projectId/quotation/setup", authenticate(auth), requireOperation("GET /projects/:projectId/quotation/setup"), privateResponse,
    async (req, res, next) => { try { res.json({ data: await service.setup(req.authenticatedUser!, String(req.params.projectId)) }); } catch (error) { next(error); } });
  router.get("/projects/:projectId/quotation/items", authenticate(auth), requireOperation("GET /projects/:projectId/quotation/items"), privateResponse,
    async (req, res, next) => { try {
      const query = candidatesQuery.safeParse(req.query);
      if (!query.success) throw new ApiError(400, "VALIDATION_ERROR", "Enter a valid item search and page.");
      res.json({ data: await service.items(req.authenticatedUser!, String(req.params.projectId), query.data) });
    } catch (error) { next(error); } });
  router.patch("/projects/:projectId/quotation", authenticate(auth), requireOperation("PATCH /projects/:projectId/quotation"), privateResponse,
    validateBody(quotationPatchSchema), async (req, res, next) => {
      try { res.json({ data: await service.save(req.authenticatedUser!, String(req.params.projectId), req.body) }); } catch (error) { next(error); }
    });
  return router;
}
