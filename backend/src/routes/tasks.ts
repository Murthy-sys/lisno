import { Router } from "express";
import { z } from "zod";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import {
  paginatedEnvelope,
  paginationShape
} from "../middleware/pagination.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { TaskService } from "../services/task.service.js";

const updateTaskSchema = z
  .object({
    version: z.number().int().positive(),
    status: z
      .enum(["not_started", "in_progress", "in_review", "blocked", "completed"])
      .optional(),
    progress: z.number().min(0).max(100).optional(),
    description: z.string().optional(),
    note: z.string().trim().min(1).optional()
  })
  .strict()
  .refine(
    (input) =>
      input.status !== undefined ||
      input.progress !== undefined ||
      input.description !== undefined ||
      input.note !== undefined,
    { message: "Provide at least one task change.", path: ["version"] }
  );
const deadlineSchema = z
  .object({
    version: z.number().int().positive(),
    currentDeadlineAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(1, "A deadline revision reason is required.")
  })
  .strict();
const listEventsQuerySchema = z.object(paginationShape).strict();

export function createTasksRouter(
  authService: AuthService,
  taskService: TaskService
): Router {
  const router = Router();
  const protectedRoute = authenticate(authService);

  router.get(
    "/tasks/:taskId/events",
    protectedRoute,
    authorizeRoles("designer", "design_manager", "design_head"),
    validateQuery(listEventsQuerySchema),
    async (request, response, next) => {
      try {
        const pagination = response.locals.validatedQuery;
        response.json({
          data: paginatedEnvelope(
            await taskService.listEvents(
              request.authenticatedUser!,
              request.params.taskId as string,
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

  router.patch(
    "/tasks/:taskId",
    protectedRoute,
    authorizeRoles("designer"),
    validateBody(updateTaskSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await taskService.update(
            request.authenticatedUser!,
            request.params.taskId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/tasks/:taskId/deadline",
    protectedRoute,
    authorizeRoles("design_manager", "design_head"),
    validateBody(deadlineSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await taskService.reviseDeadline(
            request.authenticatedUser!,
            request.params.taskId as string,
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
