import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectPurchaseOrderPreparationService } from "../services/project-purchase-order-preparation.service.js";

export function createProjectPurchaseOrderPreparationRouter(
  auth: AuthService,
  service: ProjectPurchaseOrderPreparationService
): Router {
  const router = Router();
  router.get("/procurement/projects/:projectId/purchase-order-preparation", authenticate(auth),
    requireOperation("GET /procurement/projects/:projectId/purchase-order-preparation"), async (request, response, next) => {
      try {
        response.json({ data: await service.get(request.authenticatedUser!, String(request.params.projectId)) });
      } catch (error) { next(error); }
    });
  return router;
}
