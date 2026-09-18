import { furnitureUomCreateSchema } from "../domain/workflow-uoms.js";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { ApiError } from "../middleware/errors.js";
import { uploadWorkflowEvidence } from "../middleware/workflow-evidence-upload.js";
import type { StoredWorkflowMedia } from "../domain/design-workflow-state.js";
import { validateBody } from "../middleware/validate.js";
import { sha256Hex } from "../domain/estimate-client-review.js";
import type { AuthService } from "../services/auth.service.js";
import { WorkflowProofRetentionError, workflowActionSchema, type createDesignWorkflowStateService } from "../services/design-workflow-state.service.js";
import type { WorkflowEvidenceStorage } from "../services/workflow-evidence-storage.js";
export function createDesignWorkflowStateRouter(auth: AuthService, service: ReturnType<typeof createDesignWorkflowStateService>, storage: WorkflowEvidenceStorage, maxUploadBytes: number) {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/projects/:projectId/design-workflow/furniture-uoms", protectedRoute, requireOperation("GET /projects/:projectId/design-workflow/furniture-uoms"), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.listFurnitureUoms(request.authenticatedUser!, String(request.params.projectId)) }); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/design-workflow/furniture-uoms", protectedRoute, requireOperation("POST /projects/:projectId/design-workflow/furniture-uoms"), validateBody(furnitureUomCreateSchema), async (request, response, next) => {
    try {
      const result = await service.createFurnitureUom(request.authenticatedUser!, String(request.params.projectId), request.body);
      response.status(result.reused ? 200 : 201).set("Cache-Control", "private, no-store").json({ data: result });
    } catch (error) { next(error); }
  });
  router.get("/design-workflow/payment-confirmations", protectedRoute, requireOperation("GET /design-workflow/payment-confirmations"), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({ data: await service.queue(request.authenticatedUser!) }); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/design-workflow/actions", protectedRoute, requireOperation("POST /projects/:projectId/design-workflow/actions"), async (request, _response, next) => {
    try { await service.preflight(request.authenticatedUser!, String(request.params.projectId)); next(); } catch (error) { next(error); }
  }, uploadWorkflowEvidence(maxUploadBytes), validateBody(workflowActionSchema), async (request, response, next) => {
    let proof: Awaited<ReturnType<WorkflowEvidenceStorage["saveProof"]>> | null = null;
    const mediaFiles: StoredWorkflowMedia[] = [];
    const release = request.workflowEvidence?.hold();
    const signal = request.workflowEvidence?.signal;
    const cleanup = async () => {
      for (const reference of [...(proof ? [proof.storageReference] : []), ...mediaFiles.map((item) => item.storageReference)]) await storage.deleteQuietly(reference);
    };
    try {
      signal?.throwIfAborted();
      if (request.validatedWorkflowMedia?.length && request.body.action !== "measurement_complete") throw new ApiError(400, "INVALID_WORKFLOW_EVIDENCE", "Photos and videos are supported only for measurement completion.");
      if (request.validatedUpload) proof = await storage.saveProof(request.validatedUpload);
      for (const file of request.validatedWorkflowMedia ?? []) mediaFiles.push(await storage.saveMedia(file, signal));
      signal?.throwIfAborted();
      const result = await service.act(request.authenticatedUser!, String(request.params.projectId), request.body, proof, mediaFiles);
      if (result.replayed) await cleanup();
      proof = null;
      mediaFiles.length = 0;
      response.set("Cache-Control", "private, no-store").json({ data: { version: result.version } });
    } catch (error) {
      if (!(error instanceof WorkflowProofRetentionError)) await cleanup();
      next(error);
    } finally { release?.(); await request.workflowEvidence?.cleanup(); }
  });
  router.get("/projects/:projectId/design-workflow/history/:eventId/proof", protectedRoute, requireOperation("GET /projects/:projectId/design-workflow/history/:eventId/proof"), async (request, response, next) => {
    try {
      const proof = await service.proof(request.authenticatedUser!, String(request.params.projectId), String(request.params.eventId));
      const bytes = await storage.read(proof.storageReference);
      if (bytes.byteLength !== proof.byteSize || sha256Hex(bytes) !== proof.sha256) throw new ApiError(409, "WORKFLOW_PROOF_CHANGED", "The stored document does not match its recorded evidence.");
      response.set("Cache-Control", "private, no-store").set("X-Content-Type-Options", "nosniff").type(proof.mimeType).attachment(proof.originalFilename).send(bytes);
    } catch (error) { next(error); }
  });
  router.get("/projects/:projectId/design-workflow/history/:eventId/media/:mediaId", protectedRoute, requireOperation("GET /projects/:projectId/design-workflow/history/:eventId/media/:mediaId"), async (request, response, next) => {
    const controller = new AbortController();
    const abort = () => { if (!response.writableFinished) controller.abort(new Error("Download cancelled.")); };
    response.once("close", abort);
    try {
      const media = await service.media(request.authenticatedUser!, String(request.params.projectId), String(request.params.eventId), String(request.params.mediaId));
      const source = await storage.openVerifiedMedia(media, controller.signal);
      response.set("Cache-Control", "private, no-store").set("X-Content-Type-Options", "nosniff").set("Content-Length", String(media.byteSize)).type(media.mimeType).attachment(media.originalFilename);
      await pipeline(source, response, { signal: controller.signal });
    } catch (error) { if (!response.destroyed) next(error); }
    finally { response.removeListener("close", abort); }
  });
  return router;
}
