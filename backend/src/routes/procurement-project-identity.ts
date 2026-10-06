import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { cityNameSchema } from "../domain/procurement-city.js";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { ApiError } from "../middleware/errors.js";
import { readBasketVendorCandidates } from "../services/procurement-basket-vendor-eligibility.service.js";
import { assertProcurementProjectAccess, procurementItemSourceSnapshot } from "../services/procurement.service.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProcurementProjectIdentityService } from "../services/procurement-project-identity.service.js";

const cityName = cityNameSchema.nullable();
const adminListQuery = z.object({ q: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20), offset: z.coerce.number().int().min(0).default(0) }).strict();
const identitySchema = z.object({ expectedVersion: z.number().int().min(1),
  cityName: cityName.optional(), programManagerId: z.string().trim().min(1).nullable().optional() }).strict()
  .refine((value) => value.cityName !== undefined || value.programManagerId !== undefined,
    "Select a city or Program Manager to update.");
const vendorCitySchema = z.object({ expectedVersion: z.number().int().min(0), cityName }).strict();
const candidateQuery = z.object({ q: z.string().trim().max(120).default(""),
  city: z.enum(["all", "same_city", "outside_city", "unknown"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }).strict();

export function createProcurementProjectIdentityRouter(auth: AuthService, service: ProcurementProjectIdentityService): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);

  router.get("/admin/program-managers", protectedRoute, requireOperation("GET /admin/program-managers"), validateQuery(adminListQuery), async (request, response, next) => {
    try { response.json({ data: await service.programManagers(request.authenticatedUser!, response.locals.validatedQuery) }); }
    catch (error) { next(error); }
  });

  router.get("/admin/projects/:projectId/procurement-identity", protectedRoute,
    requireOperation("GET /admin/projects/:projectId/procurement-identity"), async (request, response, next) => {
      try { response.json({ data: await service.readProject(request.authenticatedUser!, request.params.projectId as string) }); }
      catch (error) { next(error); }
    });

  router.patch("/admin/projects/:projectId/procurement-identity", protectedRoute,
    requireOperation("PATCH /admin/projects/:projectId/procurement-identity"), validateBody(identitySchema), async (request, response, next) => {
      try { response.json({ data: await service.updateProject(request.authenticatedUser!, request.params.projectId as string, request.body) }); }
      catch (error) { next(error); }
    });

  router.put("/procurement/vendors/:vendorId/service-city", protectedRoute,
    requireOperation("PUT /procurement/vendors/:vendorId/service-city"), validateBody(vendorCitySchema), async (request, response, next) => {
      try { response.json({ data: await service.updateVendorCity(request.authenticatedUser!, request.params.vendorId as string, request.body) }); }
      catch (error) { next(error); }
    });

  router.get("/procurement/projects/:projectId/baskets/:basketId/vendor-candidates", protectedRoute,
    requireOperation("GET /procurement/projects/:projectId/baskets/:basketId/vendor-candidates"), validateQuery(candidateQuery), async (request, response, next) => {
      try {
        const projectId = request.params.projectId as string;
        const basketId = request.params.basketId as string;
        const data = await mongoose.connection.transaction(async (session) => {
          await assertProcurementProjectAccess(request.authenticatedUser!, projectId, session);
          const source = await procurementItemSourceSnapshot(projectId, session);
          if (!source.allLineItems.some((line) => line.included && line.mainBasketId === basketId)) {
            throw new ApiError(404, "PROCUREMENT_BASKET_NOT_FOUND", "This main basket is not in the approved estimate.");
          }
          return readBasketVendorCandidates(projectId, basketId, session, response.locals.validatedQuery);
        }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
        response.json({ data });
      } catch (error) { next(error); }
    });

  return router;
}
