import { Router } from "express";
import { z } from "zod";

import { emailSchema } from "../domain/email.js";
import { authenticate, authorizeRoles } from "../middleware/auth.js";
import {
  paginatedEnvelope,
  paginationShape
} from "../middleware/pagination.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectService } from "../services/project.service.js";

const isoDateTime = z.string().datetime({ offset: true });
const listQuerySchema = z.object(paginationShape).strict();
const projectSchema = z
  .object({
    name: z.string().trim().min(1),
    clientName: z.string().trim().min(1),
    clientEmail: emailSchema,
    clientMobile: z.string().trim().min(1),
    clientAddress: z.string().trim().min(1),
    assignedDesignerIds: z.array(z.string().trim().min(1)).min(1),
    managerId: z.string().trim().min(1),
    location: z.string().trim().min(1),
    plannedStartAt: isoDateTime,
    plannedEndAt: isoDateTime
  })
  .strict();
const floorSchema = z
  .object({
    name: z.string().trim().min(1),
    number: z.string().trim().min(1),
    order: z.number().int().nonnegative(),
    plannedStartAt: isoDateTime,
    plannedEndAt: isoDateTime
  })
  .strict();
const stageSchema = z
  .object({
    name: z.string().trim().min(1),
    type: z.enum([
      "internal_kickoff",
      "client_kickoff",
      "key_collection",
      "site_measurement",
      "concept_mood_board",
      "floor_plan",
      "client_revisions",
      "final_approval",
      "design_handoff"
    ]),
    order: z.number().int().nonnegative(),
    dependencyStageIds: z.array(z.string().trim().min(1)).optional()
  })
  .strict();
const taskSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().optional(),
    order: z.number().int().nonnegative(),
    ownerId: z.string().trim().min(1),
    plannedStartAt: isoDateTime,
    originalDeadlineAt: isoDateTime,
    plannedEffort: z.number().positive().nullable().optional(),
    progress: z.number().min(0).max(100).optional(),
    dependencyTaskIds: z.array(z.string().trim().min(1)).optional()
  })
  .strict();

export function createProjectsRouter(
  authService: AuthService,
  projectService: ProjectService
): Router {
  const router = Router();
  const protectedRoute = authenticate(authService);

  router.get(
    "/projects",
    protectedRoute,
    validateQuery(listQuerySchema),
    async (request, response, next) => {
      try {
        const pagination = response.locals.validatedQuery;
        response.json({
          data: paginatedEnvelope(
            await projectService.list(
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
    "/client/project-summaries",
    protectedRoute,
    authorizeRoles("client"),
    validateQuery(listQuerySchema),
    async (request, response, next) => {
      try {
        const pagination = response.locals.validatedQuery;
        response.json({
          data: paginatedEnvelope(
            await projectService.clientSummaries(
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

  router.post(
    "/projects",
    protectedRoute,
    authorizeRoles("designer"),
    validateBody(projectSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await projectService.create(
            request.authenticatedUser!,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/projects/:projectId",
    protectedRoute,
    async (request, response, next) => {
      try {
        response.json({
          data: await projectService.get(
            request.authenticatedUser!,
            request.params.projectId as string
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/projects/:projectId/floors",
    protectedRoute,
    authorizeRoles("designer"),
    validateBody(floorSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await projectService.createFloor(
            request.authenticatedUser!,
            request.params.projectId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/floors/:floorId/stages",
    protectedRoute,
    authorizeRoles("designer"),
    validateBody(stageSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await projectService.createStage(
            request.authenticatedUser!,
            request.params.floorId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/stages/:stageId/tasks",
    protectedRoute,
    authorizeRoles("designer"),
    validateBody(taskSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await projectService.createTask(
            request.authenticatedUser!,
            request.params.stageId as string,
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
