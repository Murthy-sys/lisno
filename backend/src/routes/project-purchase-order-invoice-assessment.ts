import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { PublicUser } from "../services/auth.service.js";
import type { InvoiceAssessmentInput } from "../services/project-purchase-order-invoice-assessment.service.js";

export function createProjectPurchaseOrderInvoiceAssessmentRouter(auth: AuthService,
  service: { get: (actor: PublicUser, orderId: string) => Promise<unknown>;
    list: (actor: PublicUser, projectId: string, page: { limit: number; offset: number }) => Promise<unknown>;
    save: (actor: PublicUser, orderId: string, value: InvoiceAssessmentInput) => Promise<unknown> }): Router {
  const router = Router();
  router.get("/finance/projects/:projectId/work-orders", authenticate(auth),
    requireOperation("GET /finance/projects/:projectId/work-orders"),
    validateQuery(z.object({ limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0) }).strict()), async (request, response, next) => {
      try { response.json({ data: await service.list(request.authenticatedUser!, request.params.projectId as string,
        response.locals.validatedQuery) }); }
      catch (error) { next(error); }
    });
  router.get("/finance/work-orders/:orderId/invoice-assessment", authenticate(auth),
    requireOperation("GET /finance/work-orders/:orderId/invoice-assessment"), async (request, response, next) => {
      try { response.json({ data: await service.get(request.authenticatedUser!, request.params.orderId as string) }); }
      catch (error) { next(error); }
    });
  router.post("/finance/work-orders/:orderId/invoice-assessment", authenticate(auth),
    requireOperation("POST /finance/work-orders/:orderId/invoice-assessment"), async (request, response, next) => {
      try { response.json({ data: await service.save(request.authenticatedUser!, request.params.orderId as string,
        request.body as InvoiceAssessmentInput) }); }
      catch (error) { next(error); }
    });
  return router;
}
