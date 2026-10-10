import { vendorOrderAccessCommandSchema } from "./procurement-vendor-access.js";
import { Router, type Request, type Response, type RequestHandler } from "express";
import { z } from "zod";
import { executionCommandSchema, executionPortfolioQuerySchema, executionQuerySchema } from "../domain/vendor-execution.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService, PublicUser } from "../services/auth.service.js";
import type { createVendorExecutionService } from "../services/vendor-execution.service.js";
import type { createVendorWorkOnboardingService } from "../services/vendor-work-onboarding.service.js";
import type { ExecutionNotificationPage, ExecutionPolicy } from "../contracts/vendor-execution.js";

export interface ExecutionDeliveryRoutes {
  readPolicy(actor: PublicUser, projectId: string): Promise<ExecutionPolicy>;
  savePolicy(actor: PublicUser, projectId: string, input: unknown): Promise<ExecutionPolicy>;
  notifications(actor: PublicUser, query: {limit?:number;offset?:number}): Promise<ExecutionNotificationPage>;
  readNotification(actor: PublicUser, id: string): Promise<{readAt:string}>;
  openStream(request: Request, response: Response): Promise<void>;
}
const retrySchema = z.object({ expectedVersion: z.number().int().positive(), idempotencyKey: z.string().trim().min(8).max(128) }).strict();

export function createVendorExecutionRouter(auth: AuthService, service: ReturnType<typeof createVendorExecutionService>, delivery: ExecutionDeliveryRoutes, onboarding: ReturnType<typeof createVendorWorkOnboardingService>, deliveryRateLimit: RequestHandler = (_req, _res, next) => next()) {
  const router = Router();
  const protect = authenticate(auth);
  const json = (response: Response, data: unknown) => response.set("Cache-Control", "private, no-store").json({ data });
  router.get("/vendor/work/execution", protect, requireOperation("GET /vendor/work/execution"), validateQuery(executionQuerySchema), async (req,res,next) => {
    try { json(res, await service.listMine(req.authenticatedUser!, res.locals.validatedQuery)); } catch(e) { next(e); }
  });
  router.get("/execution/projects", protect, requireOperation("GET /execution/projects"), validateQuery(executionPortfolioQuerySchema), async (req,res,next) => {
    try { json(res, await service.portfolio(req.authenticatedUser!, res.locals.validatedQuery)); } catch(e) { next(e); }
  });
  router.get("/projects/:projectId/execution", protect, requireOperation("GET /projects/:projectId/execution"), validateQuery(executionQuerySchema), async (req,res,next) => {
    try { json(res, await service.project(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery)); } catch(e) { next(e); }
  });
  router.get("/execution/work/:assignmentId", protect, requireOperation("GET /execution/work/:assignmentId"), async (req,res,next) => {
    try { json(res, await service.detail(req.authenticatedUser!, String(req.params.assignmentId))); } catch(e) { next(e); }
  });
  router.get("/execution/work/:assignmentId/history", protect, requireOperation("GET /execution/work/:assignmentId/history"), validateQuery(executionQuerySchema), async (req,res,next) => {
    try { json(res, await service.history(req.authenticatedUser!, String(req.params.assignmentId), res.locals.validatedQuery)); } catch(e) { next(e); }
  });
  router.post("/vendor/work/:assignmentId/execution", protect, requireOperation("POST /vendor/work/:assignmentId/execution"), validateBody(executionCommandSchema), async (req,res,next) => {
    try { json(res, await service.command(req.authenticatedUser!, String(req.params.assignmentId), req.body)); } catch(e) { next(e); }
  });
  router.post("/projects/:projectId/execution/:assignmentId", protect, requireOperation("POST /projects/:projectId/execution/:assignmentId"), validateBody(executionCommandSchema), async (req,res,next) => {
    try { json(res, await service.command(req.authenticatedUser!, String(req.params.assignmentId), req.body, String(req.params.projectId))); } catch(e) { next(e); }
  });
  router.get("/projects/:projectId/execution-policy", protect, requireOperation("GET /projects/:projectId/execution-policy"), async (req,res,next) => {
    try { json(res, await delivery.readPolicy(req.authenticatedUser!, String(req.params.projectId))); } catch(e) { next(e); }
  });
  router.put("/projects/:projectId/execution-policy", protect, requireOperation("PUT /projects/:projectId/execution-policy"), async (req,res,next) => {
    try { json(res, await delivery.savePolicy(req.authenticatedUser!, String(req.params.projectId), req.body)); } catch(e) { next(e); }
  });
  router.get("/execution/notifications", protect, requireOperation("GET /execution/notifications"), validateQuery(executionQuerySchema), async (req,res,next) => {
    try { json(res, await delivery.notifications(req.authenticatedUser!, res.locals.validatedQuery)); } catch(e) { next(e); }
  });
  router.post("/execution/notifications/:notificationId/read", protect, requireOperation("POST /execution/notifications/:notificationId/read"), async (req,res,next) => {
    try { json(res, await delivery.readNotification(req.authenticatedUser!, String(req.params.notificationId))); } catch(e) { next(e); }
  });
  router.get("/execution/events", protect, requireOperation("GET /execution/events"), async (req,res,next) => {
    try { await delivery.openStream(req,res); } catch(e) { next(e); }
  });
  router.get("/projects/:projectId/vendor-access", protect, requireOperation("GET /projects/:projectId/vendor-access"), async (req,res,next) => {
    try { json(res, await onboarding.listProject(req.authenticatedUser!, String(req.params.projectId))); } catch(e) { next(e); }
  });
  router.post("/projects/:projectId/vendor-access/:intentId/retry", protect, requireOperation("POST /projects/:projectId/vendor-access/:intentId/retry"), deliveryRateLimit, validateBody(retrySchema), async (req,res,next) => {
    try { json(res, await onboarding.retry(req.authenticatedUser!, String(req.params.projectId), String(req.params.intentId), req.body)); } catch(e) { next(e); }
  });
  router.post("/projects/:projectId/vendor-access/orders/:orderId/send", protect, requireOperation("POST /projects/:projectId/vendor-access/orders/:orderId/send"), deliveryRateLimit, validateBody(vendorOrderAccessCommandSchema), async (req,res,next) => {
    try { json(res, await onboarding.sendOrderAccess(req.authenticatedUser!, String(req.params.projectId), String(req.params.orderId), req.body)); } catch(e) { next(e); }
  });
  return router;
}
