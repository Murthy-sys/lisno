import { Router } from "express";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import type { AuthService } from "../services/auth.service.js";
import type { HierarchyService } from "../services/hierarchy.service.js";

export function createOrganizationRouter(
  authService: AuthService,
  hierarchyService: HierarchyService
): Router {
  const router = Router();
  const protectedRoute = authenticate(authService);

  router.get(
    "/organization/tree",
    protectedRoute,
    authorizeRoles("design_head"),
    async (request, response, next) => {
      try {
        response.json({
          data: await hierarchyService.tree(request.authenticatedUser!)
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
