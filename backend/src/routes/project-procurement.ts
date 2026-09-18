import { Router } from "express";
import { projectProcurementItemSchema, projectProcurementItemQuerySchema, projectProcurementQuerySchema, projectProcurementUpdateSchema, procurementVendorSchema } from "../domain/project-procurement.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectProcurementService } from "../services/project-procurement.service.js";

export function createProjectProcurementRouter(auth: AuthService, service: ProjectProcurementService): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/procurement/projects/:projectId/items", protectedRoute, requireOperation("GET /procurement/projects/:projectId/items"), validateQuery(projectProcurementItemQuerySchema), async (request, response, next) => {
    try { response.json({ data: await service.list(request.authenticatedUser!, String(request.params.projectId), response.locals.validatedQuery) }); } catch (error) { next(error); }
  });
  router.get("/procurement/uoms", protectedRoute, requireOperation("GET /procurement/uoms"), async (request, response, next) => {
    try { response.json({ data: await service.listUoms(request.authenticatedUser!) }); } catch (error) { next(error); }
  });
  router.get("/procurement/projects/:projectId/items/:itemId", protectedRoute, requireOperation("GET /procurement/projects/:projectId/items/:itemId"), async (request, response, next) => {
    try { response.json({ data: await service.get(request.authenticatedUser!, String(request.params.projectId), String(request.params.itemId)) }); } catch (error) { next(error); }
  });
  router.post("/procurement/projects/:projectId/items", protectedRoute, requireOperation("POST /procurement/projects/:projectId/items"), validateBody(projectProcurementItemSchema), async (request, response, next) => {
    try { response.status(201).json({ data: await service.create(request.authenticatedUser!, String(request.params.projectId), request.body) }); } catch (error) { next(error); }
  });
  router.patch("/procurement/projects/:projectId/items/:itemId", protectedRoute, requireOperation("PATCH /procurement/projects/:projectId/items/:itemId"), validateBody(projectProcurementUpdateSchema), async (request, response, next) => {
    try { response.json({ data: await service.update(request.authenticatedUser!, String(request.params.projectId), String(request.params.itemId), request.body) }); } catch (error) { next(error); }
  });
  router.get("/procurement/vendors", protectedRoute, requireOperation("GET /procurement/vendors"), validateQuery(projectProcurementQuerySchema), async (request, response, next) => {
    try { response.json({ data: await service.listVendors(request.authenticatedUser!, response.locals.validatedQuery) }); } catch (error) { next(error); }
  });
  router.post("/procurement/vendors", protectedRoute, requireOperation("POST /procurement/vendors"), validateBody(procurementVendorSchema), async (request, response, next) => {
    try {
      const result = await service.createVendor(request.authenticatedUser!, request.body);
      response.status(result.created ? 201 : 200).json({ data: result.vendor });
    } catch (error) { next(error); }
  });
  return router;
}
