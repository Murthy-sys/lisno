import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody } from "../middleware/validate.js";
import { FINANCE_DOCUMENT_MIME_TYPES } from "../models/FinanceEntryDocument.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProcurementService } from "../services/procurement.service.js";
import { sendDownload } from "./estimate-client-responses.js";

const optionalMultipartText = (maximum: number) => z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().trim().min(1).max(maximum).optional()
);

const procurementExpenseSchema = z.object({
  sourceLineItemKey: z.string().trim().min(1).max(500),
  amountPaise: z.coerce.number().int().positive().max(MAX_FINANCE_AMOUNT_PAISE),
  incurredAt: z.string().datetime({ offset: true }),
  description: z.string().trim().min(1).max(1_000),
  vendor: optionalMultipartText(200),
  reference: optionalMultipartText(200),
  idempotencyKey: z.string().trim().min(8).max(128)
}).strict();

const receiptUploadOptions = {
  fieldName: "receipt",
  maxFields: 7,
  allowedDetectedMimeTypes: new Set(FINANCE_DOCUMENT_MIME_TYPES),
  fieldErrorKey: "receipt",
  allowedTypeMessage: "Choose a PDF, JPEG, PNG, or WebP receipt."
} as const;

export function createProcurementRouter(
  auth: AuthService,
  service: ProcurementService,
  maxUploadBytes: number
): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);

  router.get(
    "/procurement/projects",
    protectedRoute,
    requireOperation("GET /procurement/projects"),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.listProjects(request.authenticatedUser!)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/procurement/projects/:projectId/expenses",
    protectedRoute,
    requireOperation("POST /procurement/projects/:projectId/expenses"),
    procurementProjectScope(service),
    uploadSingleFile(maxUploadBytes, receiptUploadOptions),
    validateBody(procurementExpenseSchema),
    async (request, response, next) => {
      try {
        const result = await service.postExpense(
          request.authenticatedUser!,
          String(request.params.projectId),
          request.body,
          request.validatedUpload!
        );
        response.status(result.replayed ? 200 : 201).json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/procurement/projects/:projectId/entries/:entryId/document",
    protectedRoute,
    requireOperation("GET /procurement/projects/:projectId/entries/:entryId/document"),
    async (request, response, next) => {
      try {
        response
          .set("Cache-Control", "private, no-store")
          .set("X-Content-Type-Options", "nosniff");
        sendDownload(
          response,
          await service.readEntryDocument(
            request.authenticatedUser!,
            String(request.params.projectId),
            String(request.params.entryId)
          )
        );
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

function procurementProjectScope(service: ProcurementService): RequestHandler {
  return async (request, _response, next) => {
    try {
      await service.preflightProject(
        request.authenticatedUser!,
        String(request.params.projectId)
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}
