import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { listEstimatorCatalogue } from "../services/estimator-catalogue.service.js";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

export function createEstimatorCatalogueRouter(auth: AuthService): Router {
  const router = Router();
  router.get("/estimation/catalogue", authenticate(auth), requireOperation("GET /estimation/catalogue"),
    validateQuery(querySchema), async (request, response, next) => {
      try {
        const { limit, offset } = response.locals.validatedQuery as z.infer<typeof querySchema>;
        response.json({ data: await listEstimatorCatalogue(request.authenticatedUser!, { limit, offset }) });
      } catch (error) { next(error); }
    });
  return router;
}
