import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectInitiationDefaultsService } from "../services/project-initiation-defaults.service.js";

const updateSchema = z.object({
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  projectManagerId: z.string().trim().min(1).max(160)
}).strict();

export function createProjectInitiationDefaultsRouter(
  auth: AuthService,
  service: ProjectInitiationDefaultsService
): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);

  router.get("/admin/project-initiation-defaults", protectedRoute,
    requireOperation("GET /admin/project-initiation-defaults"), validateQuery(z.object({}).strict()),
    async (request, response, next) => {
      try {
        response.setHeader("Cache-Control", "no-store");
        response.json({ data: await service.read(request.authenticatedUser!) });
      } catch (error) { next(error); }
    });

  router.put("/admin/project-initiation-defaults", protectedRoute,
    requireOperation("PUT /admin/project-initiation-defaults"), validateBody(updateSchema),
    async (request, response, next) => {
      try {
        response.setHeader("Cache-Control", "no-store");
        response.json({ data: await service.update(request.authenticatedUser!, request.body) });
      } catch (error) { next(error); }
    });

  return router;
}
