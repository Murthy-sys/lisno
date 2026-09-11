import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { ApiError } from "../middleware/errors.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { sha256Hex, ESTIMATE_CLIENT_PROOF_MIME_TYPES } from "../domain/estimate-client-review.js";
import type { AuthService } from "../services/auth.service.js";
import { WorkflowProofRetentionError, workflowActionSchema, type createDesignWorkflowStateService } from "../services/design-workflow-state.service.js";
import type { EstimateClientReviewStorage } from "../services/estimate-client-review-storage.js";
export function createDesignWorkflowStateRouter(auth: AuthService, service: ReturnType<typeof createDesignWorkflowStateService>, storage: EstimateClientReviewStorage, maxUploadBytes: number) {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/design-workflow/payment-confirmations", protectedRoute, requireOperation("GET /design-workflow/payment-confirmations"), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.queue(request.authenticatedUser!) }); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/design-workflow/actions", protectedRoute, requireOperation("POST /projects/:projectId/design-workflow/actions"), async (request, _response, next) => {
    try { await service.preflight(request.authenticatedUser!, String(request.params.projectId)); next(); } catch (error) { next(error); }
  }, (request, response, next) => {
    if (!request.is("multipart/form-data")) { next(); return; }
    uploadSingleFile(maxUploadBytes, { maxFields: 6, allowedDetectedMimeTypes: new Set(ESTIMATE_CLIENT_PROOF_MIME_TYPES) })(request, response, next);
  }, validateBody(workflowActionSchema), async (request, response, next) => {
    let proof: Awaited<ReturnType<EstimateClientReviewStorage["saveProof"]>> | null = null;
    try {
      if (request.validatedUpload) proof = await storage.saveProof(request.validatedUpload);
      const result = await service.act(request.authenticatedUser!, String(request.params.projectId), request.body, proof);
      if (result.replayed && proof) await storage.deleteQuietly(proof.storageReference);
      proof = null;
      response.set("Cache-Control", "private, no-store").json({ data: { version: result.version } });
    } catch (error) {
      if (proof && !(error instanceof WorkflowProofRetentionError)) await storage.deleteQuietly(proof.storageReference);
      next(error);
    }
  });
  router.get("/projects/:projectId/design-workflow/history/:eventId/proof", protectedRoute, requireOperation("GET /projects/:projectId/design-workflow/history/:eventId/proof"), async (request, response, next) => {
    try {
      const proof = await service.proof(request.authenticatedUser!, String(request.params.projectId), String(request.params.eventId));
      const bytes = await storage.read(proof.storageReference);
      if (bytes.byteLength !== proof.byteSize || sha256Hex(bytes) !== proof.sha256) throw new ApiError(409, "WORKFLOW_PROOF_CHANGED", "The stored document does not match its recorded evidence.");
      response.set("Cache-Control", "private, no-store").set("X-Content-Type-Options", "nosniff").type(proof.mimeType).attachment(proof.originalFilename).send(bytes);
    } catch (error) { next(error); }
  });
  return router;
}
