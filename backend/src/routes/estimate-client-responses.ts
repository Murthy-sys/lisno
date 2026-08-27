import { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";

import { ESTIMATE_CLIENT_PROOF_MIME_TYPES } from "../domain/estimate-client-review.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { paginatedEnvelope } from "../middleware/pagination.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import {
  deleteStoredProofQuietly,
  type EstimateClientReviewStorage
} from "../services/estimate-client-review-storage.js";
import type { EstimateClientReviewService } from "../services/estimate-client-review.service.js";
import {
  isEstimateDecisionProofRetentionError,
  type EstimateDecisionService
} from "../services/estimate-decision.service.js";
import type { EstimateDeliveryService } from "../services/estimate-delivery.service.js";

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "changes_requested"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

const adminDecisionSchema = z.object({
  decision: z.enum(["approve", "request_changes"]),
  note: z.string().trim().max(1_000).default(""),
  version: z.coerce.number().int().positive()
}).strict().superRefine((value, context) => {
  if (value.decision === "request_changes" && value.note.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["note"],
      message: "Explain the Client's requested changes."
    });
  }
});

const retrySchema = z.object({
  roundId: z.string().trim().min(1),
  version: z.number().int().positive()
}).strict();

const proofUploadOptions = {
  fieldName: "proof",
  maxFields: 3,
  allowedDetectedMimeTypes: new Set(ESTIMATE_CLIENT_PROOF_MIME_TYPES),
  fieldErrorKey: "proof",
  allowedTypeMessage: "Choose a PDF, JPEG, PNG, or WebP proof file."
} as const;

export function createEstimateClientResponsesRouter(
  auth: AuthService,
  reviews: EstimateClientReviewService,
  storage: EstimateClientReviewStorage,
  decisions: EstimateDecisionService,
  delivery: EstimateDeliveryService,
  maxUploadBytes: number
): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);

  router.get(
    "/admin/estimate-client-response-tasks",
    protectedRoute,
    requireOperation("GET /admin/estimate-client-response-tasks"),
    validateQuery(listQuerySchema),
    async (request, response, next) => {
      try {
        const { status, limit, offset } = response.locals.validatedQuery;
        const pagination = { limit, offset };
        const page = await reviews.list(
          request.authenticatedUser!,
          status ? { status } : {},
          pagination
        );
        response.json({ data: paginatedEnvelope(page, pagination) });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/estimate-client-response-tasks/:roundId",
    protectedRoute,
    requireOperation("GET /admin/estimate-client-response-tasks/:roundId"),
    async (request, response, next) => {
      try {
        response.json({
          data: await reviews.detail(
            request.authenticatedUser!,
            String(request.params.roundId)
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/admin/estimate-client-response-tasks/:roundId/pdf",
    protectedRoute,
    requireOperation("GET /admin/estimate-client-response-tasks/:roundId/pdf"),
    download((actor, roundId) => reviews.readPdf(actor, roundId))
  );

  router.get(
    "/admin/estimate-client-response-tasks/:roundId/proof",
    protectedRoute,
    requireOperation("GET /admin/estimate-client-response-tasks/:roundId/proof"),
    download((actor, roundId) => reviews.readProof(actor, roundId))
  );

  router.post(
    "/admin/estimate-client-response-tasks/:roundId/decision",
    protectedRoute,
    requireOperation("POST /admin/estimate-client-response-tasks/:roundId/decision"),
    decisionScope(reviews),
    uploadSingleFile(maxUploadBytes, proofUploadOptions),
    validateBody(adminDecisionSchema),
    async (request, response, next) => {
      let storedProof: Awaited<ReturnType<EstimateClientReviewStorage["saveProof"]>> | null = null;
      try {
        const actor = request.authenticatedUser!;
        const roundId = String(request.params.roundId);
        const task = await reviews.detail(actor, roundId);
        storedProof = await storage.saveProof(request.validatedUpload!);
        const result = await decisions.decide({
          estimateId: task.estimate.id,
          round: { id: roundId, expectedVersion: request.body.version },
          decision: request.body.decision,
          note: request.body.note,
          context: { source: "admin_proof", actor, proof: storedProof }
        });
        storedProof = null;
        response.json({ data: mapAdminDecisionResult(result) });
      } catch (error) {
        if (storedProof && !isEstimateDecisionProofRetentionError(error)) {
          await deleteStoredProofQuietly(storage, storedProof);
        }
        next(error);
      }
    }
  );

  router.post(
    "/estimates/:estimateId/client-email/retry",
    protectedRoute,
    requireOperation("POST /estimates/:estimateId/client-email/retry"),
    validateBody(retrySchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await delivery.retry(request.authenticatedUser!, {
            estimateId: String(request.params.estimateId),
            roundId: request.body.roundId,
            version: request.body.version
          })
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

function mapAdminDecisionResult(
  result: Awaited<ReturnType<EstimateDecisionService["decide"]>>
) {
  return {
    estimate: {
      id: String(result.estimate.id),
      status: String(result.estimate.status),
      version: Number(result.estimate.version),
      projectId: result.estimate.projectId == null
        ? null
        : String(result.estimate.projectId)
    },
    clientReview: result.clientReview
  };
}

function decisionScope(reviews: EstimateClientReviewService): RequestHandler {
  return async (request, _response, next) => {
    try {
      await reviews.requireDecisionScope(
        request.authenticatedUser!,
        String(request.params.roundId)
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}

function download(
  read: (
    actor: NonNullable<Express.Request["authenticatedUser"]>,
    roundId: string
  ) => Promise<{ filename: string; mimeType: string; bytes: Buffer }>
): RequestHandler {
  return async (request, response, next) => {
    try {
      sendDownload(
        response,
        await read(request.authenticatedUser!, String(request.params.roundId))
      );
    } catch (error) {
      next(error);
    }
  };
}

export function sendDownload(
  response: Response,
  downloadValue: { filename: string; mimeType: string; bytes: Buffer }
): void {
  response
    .set("Content-Type", downloadValue.mimeType)
    .set("Content-Disposition", safeContentDisposition(downloadValue.filename))
    .send(downloadValue.bytes);
}

function safeContentDisposition(filename: string): string {
  const safeAscii = filename.length > 0 &&
    /^[\x20-\x7e]+$/u.test(filename) &&
    !/["\\/]/u.test(filename);
  if (safeAscii) return `attachment; filename="${filename}"`;

  const fallback =
    filename
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\/]/g, "_")
      .replace(/[\r\n]/g, "")
      .trim() || "download";
  const encoded = encodeURIComponent(filename.replace(/[\r\n]/g, "")).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
