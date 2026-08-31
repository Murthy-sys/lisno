import { Router } from "express";
import { z } from "zod";

import {
  DASHBOARD_KPI_AVAILABILITY,
  DASHBOARD_PROJECT_MODULES,
  DASHBOARD_PROJECT_MODULE_STATUSES,
  DASHBOARD_PROJECT_SORTS,
  DASHBOARD_RISK_FACTORS,
  DASHBOARD_RISK_LEVELS,
  DASHBOARD_WORKFORCE_ASSIGNMENT_STATES,
  DASHBOARD_WORKFORCE_CAPACITY_STATES,
  DASHBOARD_WORKFORCE_SORTS,
  SUPER_ADMIN_DASHBOARD_PERIOD_DAYS
} from "../contracts/super-admin-dashboard.js";
import { WORKER_ROLES } from "../domain/roles.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { SuperAdminDashboardService } from "../services/super-admin-dashboard.service.js";

const periodDays = z.coerce.number().pipe(z.union([
  z.literal(SUPER_ADMIN_DASHBOARD_PERIOD_DAYS[0]),
  z.literal(SUPER_ADMIN_DASHBOARD_PERIOD_DAYS[1]),
  z.literal(SUPER_ADMIN_DASHBOARD_PERIOD_DAYS[2])
])).default(30);
const pagination = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0)
};
const overviewQuerySchema = z.object({ periodDays }).strict();
const projectsQuerySchema = z.object({
  periodDays,
  module: z.enum(DASHBOARD_PROJECT_MODULES).optional(),
  projectStatus: z.enum(["planning", "active", "on_hold", "completed"]).optional(),
  moduleStatus: z.enum(DASHBOARD_PROJECT_MODULE_STATUSES).optional(),
  riskLevel: z.enum(DASHBOARD_RISK_LEVELS).optional(),
  riskFactor: z.enum(DASHBOARD_RISK_FACTORS).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(DASHBOARD_PROJECT_SORTS).default("risk_desc"),
  ...pagination
}).strict();
const workforceQuerySchema = z.object({
  periodDays,
  role: z.enum(WORKER_ROLES).optional(),
  assignmentState: z.enum(DASHBOARD_WORKFORCE_ASSIGNMENT_STATES).optional(),
  capacityState: z.enum(DASHBOARD_WORKFORCE_CAPACITY_STATES).optional(),
  kpiAvailability: z.enum(DASHBOARD_KPI_AVAILABILITY).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(DASHBOARD_WORKFORCE_SORTS).default("workload_desc"),
  ...pagination
}).strict();

export function createSuperAdminDashboardRouter(
  auth: AuthService,
  service: SuperAdminDashboardService
): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);

  router.get(
    "/admin/dashboard/overview",
    protectedRoute,
    requireOperation("GET /admin/dashboard/overview"),
    validateQuery(overviewQuerySchema),
    async (request, response, next) => {
      try {
        const { periodDays: days } = response.locals.validatedQuery;
        response.setHeader("Cache-Control", "private, no-store");
        response.json({
          data: await service.overview(request.authenticatedUser!, days)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/dashboard/projects",
    protectedRoute,
    requireOperation("GET /admin/dashboard/projects"),
    validateQuery(projectsQuerySchema),
    async (request, response, next) => {
      try {
        const { periodDays: days, ...filters } = response.locals.validatedQuery;
        response.setHeader("Cache-Control", "private, no-store");
        response.json({
          data: await service.projects(request.authenticatedUser!, days, filters)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/dashboard/workforce",
    protectedRoute,
    requireOperation("GET /admin/dashboard/workforce"),
    validateQuery(workforceQuerySchema),
    async (request, response, next) => {
      try {
        const { periodDays: days, ...filters } = response.locals.validatedQuery;
        response.setHeader("Cache-Control", "private, no-store");
        response.json({
          data: await service.workforce(request.authenticatedUser!, days, filters)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
