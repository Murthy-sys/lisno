import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
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
const listEventsQuerySchema = z
  .object({
    ...paginationShape,
    sort: z.enum(["asc", "desc"]).default("asc")
  })
  .strict();

export function createTasksRouter(
  authService: AuthService,
  taskService: TaskService
): Router {
  const router = Router();
  const protectedRoute = authenticate(authService);

  router.get(
    "/tasks/:taskId/events",
    protectedRoute,
    requireOperation("GET /tasks/:taskId/events"),
    validateQuery(listEventsQuerySchema),
    async (request, response, next) => {
      try {
        const { sort, limit, offset } = response.locals.validatedQuery;
        const pagination = { limit, offset };
        response.json({
          data: paginatedEnvelope(
            await taskService.listEvents(
              request.authenticatedUser!,
              request.params.taskId as string,
              pagination,
              sort
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
    requireOperation("PATCH /tasks/:taskId"),
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
    requireOperation("PATCH /tasks/:taskId/deadline"),
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
