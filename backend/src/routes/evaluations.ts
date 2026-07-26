import { Router } from "express";
import { z } from "zod";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { EvaluationService } from "../services/evaluation.service.js";

const evaluationSchema = z
  .object({
    subjectUserId: z.string().trim().min(1),
    periodStartAt: z.string().datetime({ offset: true }),
    periodEndAt: z.string().datetime({ offset: true }),
    score: z.number().min(0).max(100),
    comments: z.string().trim().min(1),
    revisionOf: z.string().trim().min(1).optional()
  })
  .strict();

export function createEvaluationsRouter(
  authService: AuthService,
  evaluationService: EvaluationService
): Router {
  const router = Router();
  const protectedRoute = authenticate(authService);

  router.post(
    "/evaluations",
    protectedRoute,
    authorizeRoles("design_manager", "design_head"),
    validateBody(evaluationSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await evaluationService.create(
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
    "/evaluations/:subjectId",
    protectedRoute,
    authorizeRoles("designer", "design_manager", "design_head"),
    async (request, response, next) => {
      try {
        response.json({
          data: await evaluationService.list(
            request.authenticatedUser!,
            request.params.subjectId as string
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
