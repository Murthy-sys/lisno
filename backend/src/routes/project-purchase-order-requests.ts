import { Router } from "express";
import { purchaseOrderRequestDecisionSchema, purchaseOrderRequestQuerySchema, purchaseOrderRequestQuoteSchema, purchaseOrderRequestSubmitSchema } from "../domain/project-purchase-order-request.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectPurchaseOrderRequestService } from "../services/project-purchase-order-request.service.js";

export function createProjectPurchaseOrderRequestRouter(auth: AuthService, service: ProjectPurchaseOrderRequestService): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/procurement/projects/:projectId/purchase-order-requests", protectedRoute,
    requireOperation("GET /procurement/projects/:projectId/purchase-order-requests"), validateQuery(purchaseOrderRequestQuerySchema), async (request, response, next) => {
      try { response.json({ data: await service.list(request.authenticatedUser!, String(request.params.projectId), response.locals.validatedQuery) }); } catch (error) { next(error); }
    });
  router.get("/procurement/projects/:projectId/purchase-order-requests/:requestId", protectedRoute,
    requireOperation("GET /procurement/projects/:projectId/purchase-order-requests/:requestId"), async (request, response, next) => {
      try { response.json({ data: await service.get(request.authenticatedUser!, String(request.params.projectId), String(request.params.requestId)) }); } catch (error) { next(error); }
    });
  router.post("/procurement/projects/:projectId/purchase-order-requests/quote", protectedRoute,
    requireOperation("POST /procurement/projects/:projectId/purchase-order-requests/quote"), validateBody(purchaseOrderRequestQuoteSchema), async (request, response, next) => {
      try { response.json({ data: await service.quote(request.authenticatedUser!, String(request.params.projectId), request.body) }); } catch (error) { next(error); }
    });
  router.post("/procurement/projects/:projectId/purchase-order-requests", protectedRoute,
    requireOperation("POST /procurement/projects/:projectId/purchase-order-requests"), validateBody(purchaseOrderRequestSubmitSchema), async (request, response, next) => {
      try { response.status(201).json({ data: await service.submit(request.authenticatedUser!, String(request.params.projectId), request.body) }); } catch (error) { next(error); }
    });
  router.get("/admin/purchase-order-requests/pending", protectedRoute,
    requireOperation("GET /admin/purchase-order-requests/pending"), validateQuery(purchaseOrderRequestQuerySchema), async (request, response, next) => {
      try { response.json({ data: await service.pending(request.authenticatedUser!, response.locals.validatedQuery) }); } catch (error) { next(error); }
    });
  router.post("/admin/purchase-order-requests/:requestId/decision", protectedRoute,
    requireOperation("POST /admin/purchase-order-requests/:requestId/decision"), validateBody(purchaseOrderRequestDecisionSchema), async (request, response, next) => {
      try { response.json({ data: await service.decide(request.authenticatedUser!, String(request.params.requestId), request.body) }); } catch (error) { next(error); }
    });
  return router;
}
