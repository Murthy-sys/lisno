import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AiEstimatorKnowledgeContextService } from "../services/ai-estimator-knowledge-context.service.js";
import type { AuthService } from "../services/auth.service.js";

const stableIdSchema = z.string().trim().min(1).max(128);
const canonicalDecimalSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u, "Expected a canonical nonnegative decimal string.");

export const aiEstimatorKnowledgeContextRequestSchema = z
  .object({
    mainBasketId: stableIdSchema,
    mainLineId: stableIdSchema,
    specificationId: stableIdSchema.optional(),
    quantity: canonicalDecimalSchema.optional(),
    uomId: stableIdSchema.optional(),
    surfaceId: stableIdSchema.optional(),
    modeId: stableIdSchema.optional()
  })
  .strict();

export function createAiEstimatorKnowledgeContextRouter(
  auth: AuthService,
  service: AiEstimatorKnowledgeContextService
): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);

  router.post(
    "/ai-estimator-knowledge/context",
    protectedRoute,
    requireOperation("POST /ai-estimator-knowledge/context"),
    validateBody(aiEstimatorKnowledgeContextRequestSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.resolve(request.authenticatedUser!, request.body)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
