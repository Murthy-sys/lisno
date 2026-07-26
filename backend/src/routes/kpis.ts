import { Router } from "express";
import { z } from "zod";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import type { AuthService } from "../services/auth.service.js";
import type { KpiService } from "../services/kpi.service.js";

const querySchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true })
  })
  .strict();

export function createKpisRouter(
  authService: AuthService,
  kpiService: KpiService
): Router {
  const router = Router();

  router.get(
    "/kpis/users/:userId",
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
          data: await kpiService.get(
            request.authenticatedUser!,
            request.params.userId as string,
            parsed.data.from,
            parsed.data.to
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
