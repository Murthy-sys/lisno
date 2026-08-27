import { Router } from "express";
import { z } from "zod";

import { roleSchema } from "../domain/roles.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { paginatedEnvelope, paginationShape } from "../middleware/pagination.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { UserAdministrationService } from "../services/user-administration.service.js";

const directoryQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    role: roleSchema.optional(),
    active: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    ...paginationShape
  })
  .strict();

const updateManagedUserSchema = z.union([
  z.object({ version: z.number().int().positive(), role: roleSchema }).strict(),
  z.object({ version: z.number().int().positive(), active: z.boolean() }).strict()
]);

export function createAdminUsersRouter(
  authService: AuthService,
  userAdministrationService: UserAdministrationService
): Router {
  const router = Router();

  router.get(
    "/admin/users",
    authenticate(authService),
    requireOperation("GET /admin/users"),
    validateQuery(directoryQuerySchema),
    async (request, response, next) => {
      try {
        const { limit, offset, ...filters } = response.locals.validatedQuery;
        const pagination = { limit, offset };
        const result = await userAdministrationService.list(
          request.authenticatedUser!,
          filters,
          pagination
        );
        response.json({
          data: {
            ...paginatedEnvelope(
              { items: result.items, total: result.total },
              pagination
            ),
            filterRoles: result.filterRoles,
            manageableRoles: result.manageableRoles
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/admin/users/:userId",
    authenticate(authService),
    requireOperation("PATCH /admin/users/:userId"),
    validateBody(updateManagedUserSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await userAdministrationService.update(
            request.authenticatedUser!,
            request.params.userId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
