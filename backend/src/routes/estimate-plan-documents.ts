import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import { ApiError } from "../middleware/errors.js";
import type { AuthService } from "../services/auth.service.js";
import type { EstimatePlanDocumentService } from "../services/estimate-plan-document.service.js";

const prepareSchema = z.object({ expectedManifestHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
function roundId(value: unknown, required: boolean) {
  if (value === undefined && !required) return undefined;
  const result = z.string().trim().min(1).max(200).safeParse(value);
  if (!result.success) throw new ApiError(400, "DESIGN_PLAN_ROUND_REQUIRED", "Refresh the submitted plan before opening its PDF.");
  return result.data;
}

export function createEstimatePlanDocumentRouter(auth: AuthService, documents: EstimatePlanDocumentService) {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/estimates/:estimateId/design-plan-documents", protectedRoute, requireOperation("GET /estimates/:estimateId/design-plan-documents"), async (req, res, next) => {
    try { res.json({ data: await documents.listStaff(req.authenticatedUser!, String(req.params.estimateId)) }); } catch (error) { next(error); }
  });
  router.post("/estimates/:estimateId/design-plan-documents/prepare", protectedRoute, requireOperation("POST /estimates/:estimateId/design-plan-documents/prepare"), validateBody(prepareSchema), async (req, res, next) => {
    try { res.json({ data: await documents.prepare(req.authenticatedUser!, String(req.params.estimateId), req.body.expectedManifestHash) }); } catch (error) { next(error); }
  });
  router.get("/estimates/:estimateId/design-plan-documents/:documentId/pdf", protectedRoute, requireOperation("GET /estimates/:estimateId/design-plan-documents/:documentId/pdf"), async (req, res, next) => {
    try {
      const file = await documents.readStaff(req.authenticatedUser!, String(req.params.estimateId), String(req.params.documentId));
      res.attachment(file.filename).type(file.mimeType).set("Cache-Control", "private, no-store").send(file.bytes);
    } catch (error) { next(error); }
  });
  router.get("/client/estimates/:estimateId/design-plan-documents", protectedRoute, requireOperation("GET /client/estimates/:estimateId/design-plan-documents"), async (req, res, next) => {
    try { res.json({ data: await documents.listClient(req.authenticatedUser!, String(req.params.estimateId), roundId(req.query.roundId, false)) }); } catch (error) { next(error); }
  });
  router.get("/client/estimates/:estimateId/design-plan-documents/:documentId/pdf", protectedRoute, requireOperation("GET /client/estimates/:estimateId/design-plan-documents/:documentId/pdf"), async (req, res, next) => {
    try {
      const file = await documents.readClient(req.authenticatedUser!, String(req.params.estimateId), String(req.params.documentId), roundId(req.query.roundId, true)!);
      res.attachment(file.filename).type(file.mimeType).set("Cache-Control", "private, no-store").send(file.bytes);
    } catch (error) { next(error); }
  });
  return router;
}
