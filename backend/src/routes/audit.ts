import { Router } from "express";
import { z } from "zod";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import {
  paginatedEnvelope,
  paginationShape
} from "../middleware/pagination.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuditService } from "../services/audit.service.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectActivityService } from "../services/project-activity.service.js";

const querySchema = z
  .object({
    actorId: z.string().min(1).optional(),
    entityType: z.string().min(1).optional(),
    entityId: z.string().min(1).optional(),
    sort: z.enum(["asc", "desc"]).optional(),
    ...paginationShape
  })
  .strict();

export function createAuditRouter(
  authService: AuthService,
  auditService: AuditService,
  projectActivityService: ProjectActivityService
): Router {
  const router = Router();

  router.get(
    "/projects/:projectId/activity",
    authenticate(authService),
    authorizeRoles("design_manager", "design_head"),
    validateQuery(z.object(paginationShape).strict()),
    async (request, response, next) => {
      try {
        const pagination = response.locals.validatedQuery;
        response.json({
          data: paginatedEnvelope(
            await projectActivityService.list(
              request.authenticatedUser!,
              request.params.projectId as string,
              pagination
            ),
            pagination
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/designers/:designerId/audit",
    authenticate(authService),
    authorizeRoles("designer", "design_manager", "design_head"),
    validateQuery(z.object({ ...paginationShape, sort: z.enum(["asc", "desc"]).optional() }).strict()),
    async (request, response, next) => {
      try {
        const { sort, ...pagination } = response.locals.validatedQuery;
        response.json({ data: paginatedEnvelope(await auditService.listForDesigner(request.authenticatedUser!, request.params.designerId as string, pagination, sort), pagination) });
      } catch (error) { next(error); }
    }
  );

  router.get(
    "/audit",
    authenticate(authService),
    authorizeRoles("designer", "design_manager", "design_head"),
    validateQuery(querySchema),
    async (request, response, next) => {
      try {
        const { limit, offset, ...filters } =
          response.locals.validatedQuery;
        const pagination = { limit, offset };
        response.json({
          data: paginatedEnvelope(
            await auditService.list(
              request.authenticatedUser!,
              filters,
              pagination
            ),
            pagination
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
