import { Router } from "express";
import { z } from "zod";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import type { AuditService } from "../services/audit.service.js";
import type { AuthService } from "../services/auth.service.js";

const querySchema = z
  .object({
    actorId: z.string().min(1).optional(),
    entityType: z.string().min(1).optional(),
    entityId: z.string().min(1).optional()
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
    async (request, response, next) => {
      try {
        const parsed = querySchema.safeParse(request.query);
        if (!parsed.success) {
          const fields = Object.fromEntries(
            parsed.error.issues
              .filter((issue) => issue.path.length > 0)
              .map((issue) => [issue.path.join("."), issue.message])
          );
          throw new ApiError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed.",
            fields
          );
        }
        response.json({
          data: await auditService.list(
            request.authenticatedUser!,
            parsed.data
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
