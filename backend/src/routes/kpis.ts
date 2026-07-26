import { Router } from "express";
import { z } from "zod";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import {
  paginatedEnvelope,
  paginationShape
} from "../middleware/pagination.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { KpiService } from "../services/kpi.service.js";

const querySchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    ...paginationShape
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
    validateQuery(querySchema),
    async (request, response, next) => {
      try {
        const { from, to, limit, offset } =
          response.locals.validatedQuery;
        const pagination = { limit, offset };
        const data = await kpiService.get(
          request.authenticatedUser!,
          request.params.userId as string,
          from,
          to,
          pagination
        );
        response.json({
          data: {
            ...data,
            tasks: paginatedEnvelope(
              {
                ...data.tasks,
                items: data.tasks.items.map((task) => ({
                  ...task,
                  events: {
                    ...paginatedEnvelope(task.events, {
                      limit: 20,
                      offset: 0
                    }),
                    href: `/api/v1/tasks/${encodeURIComponent(
                      task.id
                    )}/events`
                  }
                }))
              },
              pagination
            )
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
