import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { DesignerAssignmentService } from "../services/designer-assignment.service.js";

const paginationSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().nonnegative().default(0) }).strict();
const idempotencyKey = z.string().trim().min(1).max(200);
const expectedVersion = z.number().int().positive();

export function createDesignerAssignmentRouter(auth: AuthService, service: DesignerAssignmentService): Router {
  const router = Router();
  const authenticated = authenticate(auth);

  router.get("/admin/projects/:projectId/designer-suggestions", authenticated,
    requireOperation("GET /admin/projects/:projectId/designer-suggestions"),
    validateQuery(paginationSchema.extend({ search: z.string().trim().max(200).optional() })),
    async (request, response, next) => {
      try { response.json({ data: await service.suggestions(request.authenticatedUser!, String(request.params.projectId), response.locals.validatedQuery) }); }
      catch (error) { next(error); }
    });
  router.get("/admin/projects/:projectId/designer-assignment-requests", authenticated,
    requireOperation("GET /admin/projects/:projectId/designer-assignment-requests"), validateQuery(paginationSchema),
    async (request, response, next) => {
      try { response.json({ data: await service.listProjectRequests(request.authenticatedUser!, String(request.params.projectId), response.locals.validatedQuery) }); }
      catch (error) { next(error); }
    });
  router.post("/admin/projects/:projectId/designer-assignment-requests", authenticated,
    requireOperation("POST /admin/projects/:projectId/designer-assignment-requests"),
    validateBody(z.object({ designerId: z.string().trim().min(1), expectedSourceRevision: z.string().regex(/^[a-f0-9]{64}$/u), idempotencyKey }).strict()),
    async (request, response, next) => {
      try { response.json({ data: await service.createRequest(request.authenticatedUser!, String(request.params.projectId), request.body) }); }
      catch (error) { next(error); }
    });
  router.post("/admin/projects/:projectId/designer-assignment-requests/:requestId/cancel", authenticated,
    requireOperation("POST /admin/projects/:projectId/designer-assignment-requests/:requestId/cancel"),
    validateBody(z.object({ expectedVersion, idempotencyKey }).strict()),
    async (request, response, next) => {
      try { response.json({ data: await service.cancelRequest(request.authenticatedUser!, String(request.params.projectId), String(request.params.requestId), request.body) }); }
      catch (error) { next(error); }
    });
  router.get("/designer/assignment-requests", authenticated,
    requireOperation("GET /designer/assignment-requests"),
    validateQuery(paginationSchema.extend({ status: z.enum(["pending", "accepted", "declined", "cancelled"]).optional() })),
    async (request, response, next) => {
      try { response.json({ data: await service.listInbox(request.authenticatedUser!, response.locals.validatedQuery) }); }
      catch (error) { next(error); }
    });
  router.post("/designer/assignment-requests/:requestId/decision", authenticated,
    requireOperation("POST /designer/assignment-requests/:requestId/decision"),
    validateBody(z.object({ expectedVersion, decision: z.enum(["accept", "decline"]), idempotencyKey, note: z.string().trim().max(1000).optional() }).strict()
      .refine(value => value.decision === "decline" || !value.note, { path: ["note"], message: "Notes are only supported when declining an assignment." })),
    async (request, response, next) => {
      try { response.json({ data: await service.decideRequest(request.authenticatedUser!, String(request.params.requestId), request.body) }); }
      catch (error) { next(error); }
    });
  return router;
}
