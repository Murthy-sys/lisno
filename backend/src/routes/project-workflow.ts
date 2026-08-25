import { Router } from "express";
import { z } from "zod";

import { ESTIMATE_CLIENT_PROOF_MIME_TYPES } from "../domain/estimate-client-review.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import {
  deleteStoredProofQuietly,
  type EstimateClientReviewStorage
} from "../services/estimate-client-review-storage.js";
import type { ProjectWorkflowService } from "../services/project-workflow.service.js";

const assignmentSchema = z.object({
  designerId: z.string().trim().min(1)
}).strict();

const reviewListSchema = z.object({
  status: z.enum(["pending", "approved", "changes_requested"]).optional()
}).strict();

const reviewDecisionSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  decision: z.enum(["approve", "request_changes"]),
  note: z.string().trim().max(1_000).default("")
}).strict().superRefine((value, context) => {
  if (value.decision === "request_changes" && value.note.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["note"],
      message: "Explain the Client's requested changes."
    });
  }
});

const proofUploadOptions = {
  fieldName: "proof",
  maxFields: 3,
  allowedDetectedMimeTypes: new Set(ESTIMATE_CLIENT_PROOF_MIME_TYPES),
  fieldErrorKey: "proof",
  allowedTypeMessage: "Choose a PDF, JPEG, PNG, or WebP proof file."
} as const;

export function createProjectWorkflowRouter(
  auth: AuthService,
  service: ProjectWorkflowService,
  proofStorage: EstimateClientReviewStorage,
  maxUploadBytes: number
): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);

  router.get(
    "/admin/designers",
    protectedRoute,
    requireOperation("GET /admin/designers"),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.listAssignableDesigners(request.authenticatedUser!)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/projects/:projectId/design-assignment",
    protectedRoute,
    requireOperation("POST /admin/projects/:projectId/design-assignment"),
    validateBody(assignmentSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.assignDesigner(
            request.authenticatedUser!,
            String(request.params.projectId),
            request.body.designerId
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/designer/design-plan-tasks",
    protectedRoute,
    requireOperation("GET /designer/design-plan-tasks"),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.listDesignerTasks(request.authenticatedUser!)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/design-plan-response-tasks",
    protectedRoute,
    requireOperation("GET /admin/design-plan-response-tasks"),
    validateQuery(reviewListSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.listDesignReviewTasks(
            request.authenticatedUser!,
            response.locals.validatedQuery.status
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/design-plan-response-tasks/:roundId/decision",
    protectedRoute,
    requireOperation("POST /admin/design-plan-response-tasks/:roundId/decision"),
    uploadSingleFile(maxUploadBytes, proofUploadOptions),
    validateBody(reviewDecisionSchema),
    async (request, response, next) => {
      let storedProof: Awaited<
        ReturnType<EstimateClientReviewStorage["saveProof"]>
      > | null = null;
      try {
        storedProof = await proofStorage.saveProof(request.validatedUpload!);
        const result = await service.decideDesignReviewAsAdmin({
          actor: request.authenticatedUser!,
          roundId: String(request.params.roundId),
          expectedVersion: request.body.expectedVersion,
          decision: request.body.decision,
          note: request.body.note,
          proof: storedProof
        });
        storedProof = null;
        response.json({ data: result });
      } catch (error) {
        if (storedProof) {
          await deleteStoredProofQuietly(proofStorage, storedProof);
        }
        next(error);
      }
    }
  );

  router.get(
    "/workflow-tasks",
    protectedRoute,
    requireOperation("GET /workflow-tasks"),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.listOperationalTasks(request.authenticatedUser!)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
