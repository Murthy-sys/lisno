import { Router } from "express";
import { procurementVendorBaselineQuerySchema, procurementVendorBaselineSchema } from "../domain/procurement-vendor-allocation.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProcurementVendorBaselineService } from "../services/procurement-vendor-baseline.service.js";

export function createProcurementVendorBaselineRouter(auth: AuthService, service: ProcurementVendorBaselineService): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  const path = "/admin/ai-estimator-knowledge/vendors/:id/allocation-baseline";
  router.get(path, protectedRoute, requireOperation("GET /admin/ai-estimator-knowledge/vendors/:id/allocation-baseline"), validateQuery(procurementVendorBaselineQuerySchema), async (request, response, next) => {
    try { response.json({ data: await service.list(request.authenticatedUser!, String(request.params.id), response.locals.validatedQuery) }); } catch (error) { next(error); }
  });
  router.post(`${path}/:itemId`, protectedRoute, requireOperation("POST /admin/ai-estimator-knowledge/vendors/:id/allocation-baseline/:itemId"), validateBody(procurementVendorBaselineSchema), async (request, response, next) => {
    try { response.json({ data: await service.complete(request.authenticatedUser!, String(request.params.id), String(request.params.itemId), request.body) }); } catch (error) { next(error); }
  });
  return router;
}
