import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { listEstimatorCatalogue, listEstimatorCatalogueRecommendations } from "../services/estimator-catalogue.service.js";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  includeReadyNonActive: z.enum(["true", "false"]).default("false").transform((value) => value === "true")
}).strict();

const recommendationQuerySchema = z.object({
  mainLineIds: z.string().transform((value) => value.split(",")).pipe(z.array(
    z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u, "Use bounded stable Main Line IDs.")
  ).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "Main Line IDs must be distinct.")),
  includeReadyNonActive: z.enum(["true", "false"]).default("false").transform((value) => value === "true")
}).strict();

export function createEstimatorCatalogueRouter(auth: AuthService): Router {
  const router = Router();
  router.get("/estimation/catalogue", authenticate(auth), requireOperation("GET /estimation/catalogue"),
    validateQuery(querySchema), async (request, response, next) => {
      try {
        const { limit, offset, includeReadyNonActive } = response.locals.validatedQuery as z.infer<typeof querySchema>;
        response.json({ data: await listEstimatorCatalogue(request.authenticatedUser!, { limit, offset }, includeReadyNonActive) });
      } catch (error) { next(error); }
    });
  router.get("/estimation/catalogue/recommendations", authenticate(auth),
    requireOperation("GET /estimation/catalogue/recommendations"),
    validateQuery(recommendationQuerySchema), async (request, response, next) => {
      try {
        const { mainLineIds, includeReadyNonActive } =
          response.locals.validatedQuery as z.infer<typeof recommendationQuerySchema>;
        response.json({ data: await listEstimatorCatalogueRecommendations(
          request.authenticatedUser!, mainLineIds, includeReadyNonActive
        ) });
      } catch (error) { next(error); }
    });
  return router;
}
