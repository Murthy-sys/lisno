import { Router } from "express";
import { z } from "zod";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import {
  paginatedEnvelope,
  paginationShape
} from "../middleware/pagination.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { HierarchyService } from "../services/hierarchy.service.js";

export function createOrganizationRouter(
  authService: AuthService,
  hierarchyService: HierarchyService
): Router {
  const router = Router();
  const protectedRoute = authenticate(authService);
  const pageQuery = z.object(paginationShape).strict();

  router.get(
    "/organization/team",
    protectedRoute,
    authorizeRoles("design_manager"),
    validateQuery(pageQuery),
    async (request, response, next) => {
      try {
        const pagination = response.locals.validatedQuery;
        response.json({
          data: paginatedEnvelope(
            await hierarchyService.team(
              request.authenticatedUser!,
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
    "/organization/tree",
    protectedRoute,
    authorizeRoles("design_head"),
    validateQuery(pageQuery),
    async (request, response, next) => {
      try {
        const pagination = response.locals.validatedQuery;
        response.json({
          data: paginatedEnvelope(
            await hierarchyService.tree(
              request.authenticatedUser!,
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
    "/designers/:designerId/summary",
    protectedRoute,
    authorizeRoles("designer", "design_manager", "design_head"),
    async (request, response, next) => {
      try {
        response.json({
          data: await hierarchyService.designerSummary(
            request.authenticatedUser!,
            request.params.designerId as string
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
