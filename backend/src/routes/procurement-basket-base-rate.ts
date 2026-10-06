import { Router } from "express";
import { procurementBasketBaseRateSaveSchema } from "../domain/procurement-basket-base-rate.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { createProcurementBasketBaseRateService } from "../services/procurement-basket-base-rate.service.js";

export function createProcurementBasketBaseRateRouter(auth: AuthService,
  service: ReturnType<typeof createProcurementBasketBaseRateService>): Router {
  const router = Router();
  const path = "/procurement/projects/:projectId/baskets/:basketId/base-rate";
  router.put(path, authenticate(auth), requireOperation(`PUT ${path}`),
    validateBody(procurementBasketBaseRateSaveSchema), async (request, response, next) => {
      try {
        response.set("Cache-Control", "private, no-store").json({ data: await service.save(
          request.authenticatedUser!, String(request.params.projectId), String(request.params.basketId), request.body) });
      } catch (error) { next(error); }
    });
  return router;
}
