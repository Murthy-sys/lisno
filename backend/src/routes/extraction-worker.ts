import { createHash, timingSafeEqual } from "node:crypto";
import { pipeline } from "node:stream/promises";

import { json, Router, type RequestHandler } from "express";
import { z } from "zod";

import { ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import {
  workerFailureCodes,
  type ExtractionWorkerService
} from "../services/extraction-worker.service.js";

const cropSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive()
  })
  .strict();

const sectionSchema = z
  .object({
    label: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1),
    crop: cropSchema,
    imageBase64: z.string().min(1)
  })
  .strict();

const pageSchema = z
  .object({
    pageNumber: z.number().int().positive(),
    width: z.number().int().positive().max(100_000),
    height: z.number().int().positive().max(100_000),
    imageBase64: z.string().min(1),
    sections: z.array(sectionSchema).max(500)
  })
  .strict();

const completionSchema = z
  .object({
    resultId: z.string().trim().min(1).max(200),
    pages: z.array(pageSchema).min(1).max(100)
  })
  .strict();

const failureSchema = z
  .object({
    code: z.enum(workerFailureCodes),
    message: z.string().trim().min(1).max(500)
  })
  .strict();

export function createExtractionWorkerRouter(
  workerToken: string,
  service: ExtractionWorkerService
): Router {
  const router = Router();
  const workerOnly = authenticateWorker(workerToken);
  router.use(
    "/internal/extraction-jobs",
    workerOnly,
    json({ limit: "64mb" })
  );

  router.post(
    "/internal/extraction-jobs/claim",
    async (_request, response, next) => {
      try {
        const job = await service.claim();
        if (!job) {
          response.status(204).end();
          return;
        }
        response.json({ data: job });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/internal/extraction-jobs/:jobId/source",
    async (request, response, next) => {
      try {
        const claimToken = request.header("X-Extraction-Claim-Token")?.trim();
        if (!claimToken) throw new ApiError(400, "VALIDATION_ERROR", "A claim token is required.");
        const download = await service.downloadSource(
          request.params.jobId as string,
          claimToken
        );
        response.setHeader("Content-Type", download.mimeType);
        response.setHeader("Content-Length", download.sizeBytes);
        response.setHeader(
          "Content-Disposition",
          contentDisposition(download.filename)
        );
        await pipeline(download.stream, response);
      } catch (error) {
        if (response.headersSent) {
          response.destroy(error instanceof Error ? error : undefined);
          return;
        }
        next(error);
      }
    }
  );

  router.post(
    "/internal/extraction-jobs/:jobId/heartbeat",
    requireClaimToken,
    async (request, response, next) => {
      try {
        const job = await service.heartbeat(
          request.params.jobId as string,
          request.extractionClaimToken!
        );
        response.json({ data: { id: job.id, leaseExpiresAt: job.leaseExpiresAt } });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/internal/extraction-jobs/:jobId/complete",
    requireClaimToken,
    validateBody(completionSchema),
    async (request, response, next) => {
      try {
        const job = await service.complete(
          request.params.jobId as string,
          request.extractionClaimToken!,
          request.body
        );
        response.json({ data: { id: job.id, status: job.status } });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/internal/extraction-jobs/:jobId/fail",
    requireClaimToken,
    validateBody(failureSchema),
    async (request, response, next) => {
      try {
        const job = await service.fail(
          request.params.jobId as string,
          request.extractionClaimToken!,
          request.body.code,
          request.body.message
        );
        response.json({ data: { id: job.id, status: job.status } });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

function authenticateWorker(expectedToken: string): RequestHandler {
  const expectedDigest = digest(expectedToken);
  return (request, _response, next) => {
    const authorization = request.header("Authorization");
    const supplied =
      authorization?.startsWith("Bearer ") === true
        ? authorization.slice("Bearer ".length)
        : "";
    if (!supplied || !timingSafeEqual(digest(supplied), expectedDigest)) {
      next(
        new ApiError(
          401,
          "INVALID_WORKER_TOKEN",
          "Worker authentication is required."
        )
      );
      return;
    }
    next();
  };
}

const requireClaimToken: RequestHandler = (request, _response, next) => {
  const claimToken = request.header("X-Extraction-Claim-Token")?.trim();
  if (!claimToken) {
    next(
      new ApiError(
        400,
        "VALIDATION_ERROR",
        "An extraction claim token is required."
      )
    );
    return;
  }
  request.extractionClaimToken = claimToken;
  next();
};

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function contentDisposition(filename: string) {
  const safe =
    filename
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\/\r\n]/g, "_")
      .trim() || "source";
  return `attachment; filename="${safe}"`;
}

declare global {
  namespace Express {
    interface Request {
      extractionClaimToken?: string;
    }
  }
}
