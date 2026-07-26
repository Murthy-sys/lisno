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

const querySchema = z
  .object({
    actorId: z.string().min(1).optional(),
    entityType: z.string().min(1).optional(),
    entityId: z.string().min(1).optional(),
    ...paginationShape
  })
  .strict();

export function createAuditRouter(
  authService: AuthService,
  auditService: AuditService
): Router {
  const router = Router();

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
