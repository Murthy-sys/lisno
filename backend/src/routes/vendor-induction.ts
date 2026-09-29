import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { VendorInductionService } from "../services/vendor-induction.service.js";

const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);
const version = z.number().int().positive();
const nullableVersion = version.nullable();
const option = z.object({ id: z.string().min(1).max(128), label: z.string().min(1).max(120) }).strict();
const condition = z.object({ questionId: z.string().min(1).max(128), optionIds: z.array(z.string().min(1).max(128)).min(1).max(12) }).strict();
const question = z.object({
  id: z.string().min(1).max(128), key: z.string().min(1).max(64), section: z.string().min(1).max(120),
  prompt: z.string().min(1).max(500), helpText: z.string().max(1000).nullable(),
  type: z.enum(["short_text", "paragraph", "number", "yes_no", "single_choice", "multi_choice"]),
  required: z.boolean(), enabled: z.boolean(), options: z.array(option).max(12),
  unit: z.string().max(40).nullable(), min: z.number().finite().nonnegative().nullable(), max: z.number().finite().nonnegative().nullable(),
  showIf: condition.nullable()
}).strict();
const draft = z.object({ expectedVersion: nullableVersion, idempotencyKey,
  vendorType: z.enum(["execution", "supplier"]), questions: z.array(question).max(100) }).strict();
const publish = z.object({ expectedDraftVersion: version, idempotencyKey }).strict();
const requestInput = z.object({ expectedRequestVersion: nullableVersion, idempotencyKey }).strict();
const review = z.object({ submissionId: z.string().min(1).max(160), decision: z.enum(["approved", "changes_requested"]),
  reason: z.string().trim().max(2000).nullable(), expectedReviewVersion: nullableVersion, idempotencyKey }).strict();
const reopen = z.object({ reason: z.string().trim().min(1).max(2000), expectedReviewVersion: version, idempotencyKey }).strict();
const inspect = z.object({ token: z.string() }).strict();
const answer = z.object({ questionId: z.string().min(1).max(128), value: z.union([
  z.string().max(4000), z.number().finite().nonnegative(), z.boolean(), z.array(z.string().min(1).max(128)).max(12)
]) }).strict();
const submit = z.object({ token: z.string(), idempotencyKey, answers: z.array(answer).max(100) }).strict();
const publicPolicy: RequestHandler = (request, response, next) => {
  delete request.headers.authorization;
  delete request.headers.cookie;
  response.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer").set("X-Robots-Tag", "noindex");
  next();
};

export function createVendorInductionRouter(auth: AuthService, service: VendorInductionService, publicLimit: RequestHandler, deliveryLimit: RequestHandler): Router {
  const router = Router();
  const privateResponse = (response: Parameters<RequestHandler>[1]) => response.set("Cache-Control", "private, no-store");
  router.get("/procurement/vendor-inductions/:vendorId", authenticate(auth), requireOperation("GET /procurement/vendor-inductions/:vendorId"), async (request, response, next) => {
    try { privateResponse(response).json({ data: await service.read(request.authenticatedUser!, String(request.params.vendorId)) }); } catch (error) { next(error); }
  });
  router.put("/procurement/vendor-inductions/:vendorId/draft", authenticate(auth), requireOperation("PUT /procurement/vendor-inductions/:vendorId/draft"), validateBody(draft), async (request, response, next) => {
    try { privateResponse(response).json({ data: await service.saveDraft(request.authenticatedUser!, String(request.params.vendorId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/procurement/vendor-inductions/:vendorId/publish", authenticate(auth), requireOperation("POST /procurement/vendor-inductions/:vendorId/publish"), validateBody(publish), async (request, response, next) => {
    try { privateResponse(response).json({ data: await service.publish(request.authenticatedUser!, String(request.params.vendorId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/procurement/vendor-inductions/:vendorId/requests", authenticate(auth), requireOperation("POST /procurement/vendor-inductions/:vendorId/requests"), deliveryLimit, validateBody(requestInput), async (request, response, next) => {
    try { privateResponse(response).json({ data: await service.request(request.authenticatedUser!, String(request.params.vendorId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/procurement/vendor-inductions/:vendorId/reviews", authenticate(auth), requireOperation("POST /procurement/vendor-inductions/:vendorId/reviews"), validateBody(review), async (request, response, next) => {
    try { privateResponse(response).json({ data: await service.review(request.authenticatedUser!, String(request.params.vendorId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/procurement/vendor-inductions/:vendorId/reopen", authenticate(auth), requireOperation("POST /procurement/vendor-inductions/:vendorId/reopen"), validateBody(reopen), async (request, response, next) => {
    try { privateResponse(response).json({ data: await service.reopen(request.authenticatedUser!, String(request.params.vendorId), request.body) }); } catch (error) { next(error); }
  });
  router.post("/vendor-induction/inspect", publicPolicy, publicLimit, validateBody(inspect), async (request, response, next) => {
    try { response.json({ data: await service.inspect(request.body.token) }); } catch (error) { next(error); }
  });
  router.post("/vendor-induction/submit", publicPolicy, publicLimit, validateBody(submit), async (request, response, next) => {
    try { response.json({ data: await service.submit(request.body) }); } catch (error) { next(error); }
  });
  return router;
}
