import { Router } from "express";
import { z } from "zod";

import { ESTIMATE_CLIENT_PROOF_MIME_TYPES } from "../domain/estimate-client-review.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { ApiError } from "../middleware/errors.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import {
  deleteStoredProofQuietly,
  type EstimateClientReviewStorage
} from "../services/estimate-client-review-storage.js";
import type { ProjectWorkflowService } from "../services/project-workflow.service.js";
import { sendDownload } from "./estimate-client-responses.js";

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

const reviewDeliveryRetrySchema = z.object({
  expectedVersion: z.number().int().positive()
}).strict();

const operationalProgressSchema = z.object({
  version: z.number().int().positive(),
  progress: z.number().int().min(0).max(100)
}).strict();

const workerAssignmentOverrideSchema = z.object({
  projectId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
  expectedVersion: z.number().int().positive(),
  workerId: z.string().trim().min(1).nullable()
}).strict();

const sectionWorkerAssignmentOverrideSchema = z.object({
  projectId: z.string().trim().min(1),
  estimateId: z.string().trim().min(1),
  designPlanVersion: z.number().int().positive(),
  sourceSectionId: z.string().trim().min(1),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  workerId: z.string().trim().min(1).nullable()
}).strict();

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

  router.get(
    "/admin/design-plan-response-tasks/:roundId/attachments/:attachmentIndex",
    protectedRoute,
    requireOperation("GET /admin/design-plan-response-tasks/:roundId/attachments/:attachmentIndex"),
    async (request, response, next) => {
      try {
        const rawIndex = String(request.params.attachmentIndex);
        if (!/^(?:0|[1-9]\d*)$/u.test(rawIndex)) {
          throw new ApiError(
            400,
            "INVALID_ATTACHMENT_INDEX",
            "Choose a valid Design plan attachment."
          );
        }
        const attachmentIndex = Number(rawIndex);
        if (!Number.isSafeInteger(attachmentIndex)) {
          throw new ApiError(
            400,
            "INVALID_ATTACHMENT_INDEX",
            "Choose a valid Design plan attachment."
          );
        }
        response
          .set("Cache-Control", "private, no-store")
          .set("X-Content-Type-Options", "nosniff");
        sendDownload(
          response,
          await service.readDesignReviewAttachment(
            request.authenticatedUser!,
            String(request.params.roundId),
            attachmentIndex
          )
        );
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/design-plan-response-tasks/:roundId/email/retry",
    protectedRoute,
    requireOperation("POST /admin/design-plan-response-tasks/:roundId/email/retry"),
    validateBody(reviewDeliveryRetrySchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.retryDesignReviewDelivery(
            request.authenticatedUser!,
            String(request.params.roundId),
            request.body.expectedVersion
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
    "/admin/workers",
    protectedRoute,
    requireOperation("GET /admin/workers"),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.listAssignableWorkers(request.authenticatedUser!)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/projects/:projectId/workflow-tasks",
    protectedRoute,
    requireOperation("GET /admin/projects/:projectId/workflow-tasks"),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.listProjectWorkflowTasks(
            request.authenticatedUser!,
            String(request.params.projectId)
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/projects/:projectId/section-assignments",
    protectedRoute,
    requireOperation("GET /admin/projects/:projectId/section-assignments"),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.listProjectWorkflowSectionAssignments(
            request.authenticatedUser!,
            String(request.params.projectId)
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/execution/worker-assignments/override",
    protectedRoute,
    requireOperation("POST /execution/worker-assignments/override"),
    validateBody(workerAssignmentOverrideSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.overrideWorkerAssignment({
            actor: request.authenticatedUser!,
            projectId: request.body.projectId,
            taskId: request.body.taskId,
            expectedVersion: request.body.expectedVersion,
            workerId: request.body.workerId
          })
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/execution/section-worker-assignments/override",
    protectedRoute,
    requireOperation("POST /execution/section-worker-assignments/override"),
    validateBody(sectionWorkerAssignmentOverrideSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.overrideSectionWorkerAssignment({
            actor: request.authenticatedUser!,
            projectId: request.body.projectId,
            estimateId: request.body.estimateId,
            designPlanVersion: request.body.designPlanVersion,
            sourceSectionId: request.body.sourceSectionId,
            expectedRevision: request.body.expectedRevision,
            workerId: request.body.workerId
          })
        });
      } catch (error) {
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

  router.patch(
    "/workflow-tasks/:taskId",
    protectedRoute,
    requireOperation("PATCH /workflow-tasks/:taskId"),
    validateBody(operationalProgressSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.updateOperationalTask(
            request.authenticatedUser!,
            String(request.params.taskId),
            request.body.version,
            request.body.progress
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
