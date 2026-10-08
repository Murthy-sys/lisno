import { Router } from "express";
import { purchaseOrderModeDecisionSaveSchema, purchaseOrderModePreviewSchema } from "../domain/project-purchase-order-mode.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectPurchaseOrderModeDecisionService } from "../services/project-purchase-order-mode.service.js";

export function createProjectPurchaseOrderModeDecisionRouter(auth: AuthService, service: ProjectPurchaseOrderModeDecisionService): Router {
  const router = Router();
  router.post("/procurement/projects/:projectId/purchase-order-mode-previews", authenticate(auth),
    requireOperation("POST /procurement/projects/:projectId/purchase-order-mode-previews"),
    validateBody(purchaseOrderModePreviewSchema), async (request, response, next) => {
      try {
        response.status(200).json({ data: await service.preview(request.authenticatedUser!, String(request.params.projectId), request.body) });
      } catch (error) { next(error); }
    });
  router.post("/procurement/projects/:projectId/purchase-order-mode-decisions", authenticate(auth),
    requireOperation("POST /procurement/projects/:projectId/purchase-order-mode-decisions"),
    validateBody(purchaseOrderModeDecisionSaveSchema), async (request, response, next) => {
      try {
        response.status(201).json({ data: await service.save(request.authenticatedUser!, String(request.params.projectId), request.body) });
      } catch (error) { next(error); }
    });
  return router;
}
