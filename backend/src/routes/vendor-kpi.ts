import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { VendorKpiService } from "../services/vendor-kpi.service.js";

const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);
const score = z.object({ key: z.string().min(1).max(64), score: z.number().int().min(0).max(100) }).strict();
const scores = z.array(score).min(4).max(5);
const comment = z.string().trim().max(2_000).nullable().optional();
const save = z.object({ rubricVersion: z.number().int().positive(), expectedRevision: z.number().int().positive().nullable(), idempotencyKey, scores, comment }).strict();
const requestInput = z.object({ idempotencyKey, expectedRequestVersion: z.number().int().positive().nullable() }).strict();
const inspect = z.object({ token: z.string() }).strict();
const submit = z.object({ token: z.string(), rubricVersion: z.number().int().positive(), idempotencyKey, scores, comment }).strict();
const publicPolicy: RequestHandler = (request, response, next) => {
  // The emailed token is the only credential for these endpoints.
  delete request.headers.authorization;
  delete request.headers.cookie;
  response.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer").set("X-Robots-Tag", "noindex");
  next();
};

export function createVendorKpiRouter(auth: AuthService, service: VendorKpiService, publicLimit: RequestHandler, deliveryLimit: RequestHandler): Router {
  const router = Router();
  router.get("/procurement/vendor-kpis/:vendorId", authenticate(auth), requireOperation("GET /procurement/vendor-kpis/:vendorId"), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.read(request.authenticatedUser!, String(request.params.vendorId)) }); }
    catch (error) { next(error); }
  });
  router.put("/procurement/vendor-kpis/:vendorId/procurement", authenticate(auth), requireOperation("PUT /procurement/vendor-kpis/:vendorId/procurement"), validateBody(save), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.save(request.authenticatedUser!, String(request.params.vendorId), request.body) }); }
    catch (error) { next(error); }
  });
  router.post("/procurement/vendor-kpis/:vendorId/requests", authenticate(auth), requireOperation("POST /procurement/vendor-kpis/:vendorId/requests"), deliveryLimit, validateBody(requestInput), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.request(request.authenticatedUser!, String(request.params.vendorId), request.body) }); }
    catch (error) { next(error); }
  });
  router.post("/vendor-kpi/inspect", publicPolicy, publicLimit, validateBody(inspect), async (request, response, next) => {
    try { response.json({ data: await service.inspect(request.body.token) }); } catch (error) { next(error); }
  });
  router.post("/vendor-kpi/submit", publicPolicy, publicLimit, validateBody(submit), async (request, response, next) => {
    try { response.json({ data: await service.submit(request.body) }); } catch (error) { next(error); }
  });
  return router;
}
