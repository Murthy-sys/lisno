import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import type { AuthService, PublicUser } from "../services/auth.service.js";
import type { BasketPackageMonitorDto } from "../services/project-purchase-order-basket-monitor.service.js";

type MonitorService = {
  get(actor: PublicUser, projectId: string, basketId: string, awardId: string): Promise<BasketPackageMonitorDto>;
  pdf(actor: PublicUser, projectId: string, basketId: string, awardId: string): Promise<{ filename: string; bytes: Buffer }>;
  shareIntent(actor: PublicUser, projectId: string, basketId: string, awardId: string): Promise<{
    available: boolean; shareUrl: string | null; blocker: string | null }>;
};
const path = "/procurement/projects/:projectId/baskets/:basketId/awards/:awardId";

export function createProjectPurchaseOrderBasketMonitorRouter(auth: AuthService, service: MonitorService): Router {
  const router = Router();
  router.get(`${path}/monitor`, authenticate(auth), requireOperation(`GET ${path}/monitor`), async (request, response, next) => {
    try {
      response.set("Cache-Control", "private, no-store");
      response.json({ data: await service.get(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.awardId)) });
    } catch (error) { next(error); }
  });
  router.get(`${path}/work-order.pdf`, authenticate(auth), requireOperation(`GET ${path}/work-order.pdf`),
    async (request, response, next) => {
      try {
        const pdf = await service.pdf(request.authenticatedUser!, String(request.params.projectId),
          String(request.params.basketId), String(request.params.awardId));
        response.set("Content-Type", "application/pdf").set("Cache-Control", "private, no-store")
          .set("X-Content-Type-Options", "nosniff")
          .set("Content-Disposition", `attachment; filename="${pdf.filename}"`).send(pdf.bytes);
      } catch (error) { next(error); }
    });
  router.post(`${path}/share-intent`, authenticate(auth), requireOperation(`POST ${path}/share-intent`),
    async (request, response, next) => {
      try {
        response.set("Cache-Control", "private, no-store");
        response.json({ data: await service.shareIntent(request.authenticatedUser!, String(request.params.projectId),
          String(request.params.basketId), String(request.params.awardId)) });
      } catch (error) { next(error); }
    });
  return router;
}
