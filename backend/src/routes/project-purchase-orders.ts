import { Router } from "express";
import {
  purchaseOrderAmendSchema, purchaseOrderCancelSchema, purchaseOrderDecisionSchema,
  purchaseOrderDraftSchema, purchaseOrderQuerySchema, purchaseOrderSubmitSchema, purchaseOrderUpdateSchema
} from "../domain/project-purchase-order.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectPurchaseOrderService } from "../services/project-purchase-order.service.js";

export function createProjectPurchaseOrderRouter(auth: AuthService, service: ProjectPurchaseOrderService): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/vendor/purchase-orders/:orderId", protectedRoute, requireOperation("GET /vendor/purchase-orders/:orderId"), async (request, response, next) => {
    try { response.json({ data: await service.vendorRead(request.authenticatedUser!, String(request.params.orderId)) }); } catch (error) { next(error); }
  });
  router.get("/admin/purchase-orders/pending", protectedRoute, requireOperation("GET /admin/purchase-orders/pending"), validateQuery(purchaseOrderQuerySchema), async (request, response, next) => {
    try { response.json({ data: await service.pending(request.authenticatedUser!, response.locals.validatedQuery) }); } catch (error) { next(error); }
  });
  router.get("/procurement/projects/:projectId/purchase-order-commitments", protectedRoute, requireOperation("GET /procurement/projects/:projectId/purchase-order-commitments"), async (request, response, next) => {
    try { response.json({ data: await service.commitments(request.authenticatedUser!, String(request.params.projectId)) }); } catch (error) { next(error); }
  });
  router.get("/procurement/projects/:projectId/purchase-orders", protectedRoute, requireOperation("GET /procurement/projects/:projectId/purchase-orders"), validateQuery(purchaseOrderQuerySchema), async (request, response, next) => {
    try { response.json({ data: await service.list(request.authenticatedUser!, String(request.params.projectId), response.locals.validatedQuery) }); } catch (error) { next(error); }
  });
  router.get("/procurement/projects/:projectId/purchase-orders/:orderId", protectedRoute, requireOperation("GET /procurement/projects/:projectId/purchase-orders/:orderId"), async (request, response, next) => {
    try { response.json({ data: await service.get(request.authenticatedUser!, String(request.params.projectId), String(request.params.orderId)) }); } catch (error) { next(error); }
  });
  router.post("/procurement/projects/:projectId/purchase-orders", protectedRoute, requireOperation("POST /procurement/projects/:projectId/purchase-orders"), validateBody(purchaseOrderDraftSchema), async (request, response, next) => {
    try { response.status(201).json({ data: await service.create(request.authenticatedUser!, String(request.params.projectId), request.body) }); } catch (error) { next(error); }
  });
  router.patch("/procurement/projects/:projectId/purchase-orders/:orderId", protectedRoute, requireOperation("PATCH /procurement/projects/:projectId/purchase-orders/:orderId"), validateBody(purchaseOrderUpdateSchema), async (request, response, next) => {
    try { response.json({ data: await service.update(request.authenticatedUser!, String(request.params.projectId), String(request.params.orderId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/procurement/projects/:projectId/purchase-orders/:orderId/submit", protectedRoute, requireOperation("POST /procurement/projects/:projectId/purchase-orders/:orderId/submit"), validateBody(purchaseOrderSubmitSchema), async (request, response, next) => {
    try { response.json({ data: await service.submit(request.authenticatedUser!, String(request.params.projectId), String(request.params.orderId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/procurement/projects/:projectId/purchase-orders/:orderId/decision", protectedRoute, requireOperation("POST /procurement/projects/:projectId/purchase-orders/:orderId/decision"), validateBody(purchaseOrderDecisionSchema), async (request, response, next) => {
    try { response.json({ data: await service.decide(request.authenticatedUser!, String(request.params.projectId), String(request.params.orderId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/procurement/projects/:projectId/purchase-orders/:orderId/amend", protectedRoute, requireOperation("POST /procurement/projects/:projectId/purchase-orders/:orderId/amend"), validateBody(purchaseOrderAmendSchema), async (request, response, next) => {
    try { response.json({ data: await service.amend(request.authenticatedUser!, String(request.params.projectId), String(request.params.orderId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/procurement/projects/:projectId/purchase-orders/:orderId/cancel", protectedRoute, requireOperation("POST /procurement/projects/:projectId/purchase-orders/:orderId/cancel"), validateBody(purchaseOrderCancelSchema), async (request, response, next) => {
    try { response.json({ data: await service.cancel(request.authenticatedUser!, String(request.params.projectId), String(request.params.orderId), request.body) }); } catch (error) { next(error); }
  });
  return router;
}
