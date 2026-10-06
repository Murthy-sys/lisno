import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { createVendorBasketRequestService } from "../services/vendor-basket-request.service.js";

const boundedName = z.string().transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " ")).pipe(z.string().min(1).max(240));
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);
const createSchema = z.object({
  vendorId: z.string().trim().min(1).max(128).nullable().optional(),
  vendorName: boundedName,
  proposedName: boundedName,
  idempotencyKey
}).strict();
const decisionSchema = z.object({
  decision: z.enum(["fulfill", "reject"]),
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().min(1).max(1000).nullable().optional(),
  idempotencyKey
}).strict();
const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
};
const mineQuery = z.object(pagination).strict();
const adminQuery = z.object({ ...pagination, status: z.enum(["pending", "fulfilled", "rejected"]).optional() }).strict();

export function createVendorBasketRequestRouter(auth: AuthService,
  service: ReturnType<typeof createVendorBasketRequestService>): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  const requestPath = "/procurement/vendor-basket-requests";
  const minePath = `${requestPath}/mine`;
  const adminPath = "/admin/ai-estimator-knowledge/basket-requests";
  const decisionPath = `${adminPath}/:requestId/decision`;

  router.post(requestPath, protectedRoute, requireOperation(`POST ${requestPath}`), validateBody(createSchema),
    async (request, response, next) => {
      try { response.set("Cache-Control", "private, no-store").status(201).json({ data: await service.create(request.authenticatedUser!, request.body) }); }
      catch (error) { next(error); }
    });
  router.get(minePath, protectedRoute, requireOperation(`GET ${minePath}`), validateQuery(mineQuery),
    async (request, response, next) => {
      try {
        response.set("Cache-Control", "private, no-store").json({ data: await service.listMine(request.authenticatedUser!, response.locals.validatedQuery) });
      } catch (error) { next(error); }
    });
  router.get(adminPath, protectedRoute, requireOperation(`GET ${adminPath}`), validateQuery(adminQuery),
    async (request, response, next) => {
      try {
        const { status, limit, offset } = response.locals.validatedQuery;
        response.set("Cache-Control", "private, no-store").json({ data: await service.listForAdmin(request.authenticatedUser!, status, { limit, offset }) });
      } catch (error) { next(error); }
    });
  router.post(decisionPath, protectedRoute, requireOperation(`POST ${decisionPath}`), validateBody(decisionSchema),
    async (request, response, next) => {
      try { response.set("Cache-Control", "private, no-store").json({ data: await service.decide(request.authenticatedUser!, String(request.params.requestId), request.body) }); }
      catch (error) { next(error); }
    });
  return router;
}
