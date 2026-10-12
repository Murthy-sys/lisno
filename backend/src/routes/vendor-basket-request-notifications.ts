import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { ApiError } from "../middleware/errors.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { basketNotificationIdSchema, basketNotificationPageSchema, type createVendorBasketRequestNotificationService } from "../services/vendor-basket-request-notifications.service.js";

export function createVendorBasketRequestNotificationsRouter(auth: AuthService,
  service: ReturnType<typeof createVendorBasketRequestNotificationService>): Router {
  const router = Router();
  const base = "/admin/ai-estimator-knowledge/basket-request-notifications";
  const protectedRoute = authenticate(auth);
  router.use(base, (_request, response, next) => { response.set("Cache-Control", "private, no-store"); next(); });
  router.get(base, protectedRoute, requireOperation(`GET ${base}`), validateQuery(basketNotificationPageSchema),
    async (request, response, next) => {
      try { response.json({ data: await service.list(request.authenticatedUser!, response.locals.validatedQuery) }); }
      catch (error) { next(error); }
    });
  router.put(`${base}/:notificationId/read`, protectedRoute,
    requireOperation(`PUT ${base}/:notificationId/read`), validateBody(z.object({}).strict().optional()),
    async (request, response, next) => {
      try {
        const parsed = basketNotificationIdSchema.safeParse(request.params.notificationId);
        if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid notification identifier.");
        response.json({ data: await service.read(request.authenticatedUser!, parsed.data) });
      } catch (error) { next(error); }
    });
  return router;
}
