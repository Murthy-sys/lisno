import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { paginatedEnvelope, paginationShape } from "../middleware/pagination.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AdminProjectService } from "../services/admin-project.service.js";
import type { AuthService } from "../services/auth.service.js";

const initiationSchema = z.object({
  clientName: z.string().trim().min(1),
  clientEmail: z.string().trim().email(),
  clientMobile: z.string().trim().min(1),
  projectName: z.string().trim().min(1),
  location: z.string().trim().min(1),
  propertyType: z.string().trim().min(1),
  budgetMin: z.number().nonnegative(),
  budgetMax: z.number().nonnegative(),
  nextAction: z.string().trim().min(1),
  nextActionAt: z.string().datetime({ offset: true }),
  estimatorId: z.string().trim().min(1).optional(),
  salesManagerId: z.string().trim().min(1).optional()
}).strict().refine((value) => value.budgetMax >= value.budgetMin, {
  path: ["budgetMax"],
  message: "Maximum budget must be at least the minimum budget."
});

const listQuerySchema = z.object({
  ...paginationShape,
  status: z.enum(["planning", "active", "on_hold", "completed"]).optional(),
  search: z.string().trim().max(120).default(""),
  sort: z.enum(["newest", "name_asc", "name_desc"]).default("newest")
}).strict();
const estimatorQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

export function createAdminProjectsRouter(
  auth: AuthService,
  service: AdminProjectService
): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);

  router.get(
    "/admin/projects",
    protectedRoute,
    requireOperation("GET /admin/projects"),
    validateQuery(listQuerySchema),
    async (request, response, next) => {
      try {
        const input = response.locals.validatedQuery;
        const page = await service.list(request.authenticatedUser!, input);
        response.json({
          data: {
            ...paginatedEnvelope(page, { limit: input.limit, offset: input.offset }),
            statusCounts: page.statusCounts
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/estimators",
    protectedRoute,
    requireOperation("GET /admin/estimators"),
    validateQuery(estimatorQuerySchema),
    async (request, response, next) => {
      try {
        const { search, ...pagination } = response.locals.validatedQuery;
        response.json({
          data: paginatedEnvelope(
            await service.estimators(request.authenticatedUser!, search, pagination),
            pagination
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/sales-managers",
    protectedRoute,
    requireOperation("GET /admin/sales-managers"),
    validateQuery(estimatorQuerySchema),
    async (request, response, next) => {
      try {
        const { search, ...pagination } = response.locals.validatedQuery;
        response.json({
          data: paginatedEnvelope(
            await service.salesManagers(request.authenticatedUser!, search, pagination),
            pagination
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/projects",
    protectedRoute,
    requireOperation("POST /admin/projects"),
    validateBody(initiationSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await service.initiate(request.authenticatedUser!, request.body)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/projects/:projectId",
    protectedRoute,
    requireOperation("GET /admin/projects/:projectId"),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.get(
            request.authenticatedUser!,
            request.params.projectId as string
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
