import { randomUUID } from "node:crypto";

import { ApiError } from "../middleware/errors.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  type AppRepository,
  type CropRect,
  type DesignExtractionJobRecord,
  type ExtractionDraftReplacement
} from "../repositories/types.js";
import type { FileStorage } from "../storage/storage.js";
import type { AuditService } from "./audit.service.js";
import type { Clock } from "./workflow.js";

export const workerFailureCodes = [
  "PDF_RENDER_FAILED",
  "OCR_FAILED",
  "INVALID_SOURCE",
  "RESULT_REJECTED"
] as const;

export type WorkerFailureCode = (typeof workerFailureCodes)[number];

export interface WorkerSectionResult {
  label: string;
  confidence: number;
  crop: CropRect;
  imageBase64: string;
}

export interface WorkerPageResult {
  pageNumber: number;
  width: number;
  height: number;
  imageBase64: string;
  sections: WorkerSectionResult[];
}

export interface WorkerExtractionResult {
  resultId: string;
  pages: WorkerPageResult[];
}

export interface ClaimedExtractionJob {
  id: string;
  designVersionId: string;
  attemptCount: number;
  claimToken: string;
  leaseExpiresAt: string;
  sourceUrl: string;
  source: {
    url: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  };
}

export interface WorkerSourceDownload {
  stream: NodeJS.ReadableStream;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ExtractionWorkerService {
  claim(): Promise<ClaimedExtractionJob | null>;
  downloadSource(
    jobId: string,
    claimToken: string
  ): Promise<WorkerSourceDownload>;
  complete(
    jobId: string,
    claimToken: string,
    result: WorkerExtractionResult
  ): Promise<DesignExtractionJobRecord>;
  fail(
    jobId: string,
    claimToken: string,
    code: WorkerFailureCode,
    message: string
  ): Promise<DesignExtractionJobRecord>;
}

export function createExtractionWorkerService(
  repository: AppRepository,
  audit: AuditService,
  storage: FileStorage,
  clock: Clock,
  leaseSeconds: number,
  maxImageBytes: number
): ExtractionWorkerService {
  return {
    async claim() {
      const now = clock();
      const leaseExpiresAt = new Date(
        now.getTime() + leaseSeconds * 1000
      ).toISOString();
      const job = await repository.claimExtractionJob(
        now.toISOString(),
        leaseExpiresAt
      );
      if (!job) return null;
      const version = await repository.findDesignVersionById(job.designVersionId);
      if (!version || !job.claimId) {
        throw new ApiError(
          500,
          "EXTRACTION_JOB_INVALID",
          "The extraction job source is unavailable."
        );
      }
      const sourceUrl =
        `/api/v1/internal/extraction-jobs/${encodeURIComponent(job.id)}/source` +
        `?claimToken=${encodeURIComponent(job.claimId)}`;
      return {
        id: job.id,
        designVersionId: job.designVersionId,
        attemptCount: job.attemptCount,
        claimToken: job.claimId,
        leaseExpiresAt,
        sourceUrl,
        source: {
          url: sourceUrl,
          filename: version.originalFilename,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes
        }
      };
    },

    async downloadSource(jobId, claimToken) {
      const now = clock().toISOString();
      const job = await requireJob(repository, jobId);
      requireCurrentClaim(job, claimToken, now);
      const version = await repository.findDesignVersionById(job.designVersionId);
      if (!version) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found."
        );
      }
      try {
        return {
          stream: await storage.open(version.storedFileReference),
          filename: version.originalFilename,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes
        };
      } catch {
        throw new ApiError(
          503,
          "FILE_STORAGE_ERROR",
          "The extraction source could not be opened."
        );
      }
    },

    async complete(jobId, claimToken, result) {
      const processedAt = clock().toISOString();
      const job = await requireJob(repository, jobId);
      requireCurrentClaim(job, claimToken, processedAt);
      const version = await repository.findDesignVersionById(job.designVersionId);
      if (!version) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found."
        );
      }
      const normalized = normalizeAndValidateResult(result, maxImageBytes);
      const storedReferences: string[] = [];
      try {
        const sourcePages: ExtractionDraftReplacement["sourcePages"] = [];
        const sections: ExtractionDraftReplacement["sections"] = [];
        for (const page of normalized.pages) {
          const pageImage = await storage.save({
            data: page.image,
            extension: ".png"
          });
          storedReferences.push(pageImage.reference);
          const pageId = randomUUID();
          sourcePages.push({
            id: pageId,
            designVersionId: version.id,
            pageNumber: page.pageNumber,
            renderedFileReference: pageImage.reference,
            width: page.width,
            height: page.height,
            createdAt: processedAt,
            updatedAt: processedAt
          });
          for (const proposal of page.sections) {
            const cropImage = await storage.save({
              data: proposal.image,
              extension: ".png"
            });
            storedReferences.push(cropImage.reference);
            const sectionId = randomUUID();
            sections.push({
              section: {
                id: sectionId,
                designVersionId: version.id,
                sourcePageId: pageId,
                label: proposal.label,
                active: true,
                source: "ocr",
                ocrConfidence: proposal.confidence,
                createdAt: processedAt,
                updatedAt: processedAt
              },
              revision: {
                id: randomUUID(),
                sectionId,
                revisionNumber: 1,
                sourcePageId: pageId,
                crop: proposal.crop,
                croppedFileReference: cropImage.reference,
                label: proposal.label,
                reviewStatus: "draft",
                submittedAt: null,
                reviewerId: null,
                reviewedAt: null,
                rejectionComment: null,
                createdAt: processedAt
              }
            });
          }
        }

        return await repository.runInTransaction(async (transaction) => {
          await transaction.replaceExtractionDraft({
            jobId,
            claimId: claimToken,
            processedAt,
            designVersionId: version.id,
            workerResultId: result.resultId,
            sourcePages,
            sections
          });
          const completed = await transaction.completeExtractionJob(
            jobId,
            claimToken,
            processedAt
          );
          await audit.append(
            {
              actorId: "system:ocr-worker",
              action: "design_extraction_completed",
              entityType: "design_extraction_job",
              entityId: jobId,
              occurredAt: processedAt,
              newValues: {
                designVersionId: version.id,
                resultId: result.resultId,
                pageCount: sourcePages.length,
                sectionCount: sections.length
              }
            },
            transaction
          );
          return completed;
        });
      } catch (error) {
        await cleanup(storage, storedReferences);
        throw mapRepositoryError(error);
      }
    },

    async fail(jobId, claimToken, code, message) {
      const failedAt = clock().toISOString();
      try {
        return await repository.runInTransaction(async (transaction) => {
          const failed = await transaction.failExtractionJob(
            jobId,
            claimToken,
            code,
            message,
            failedAt
          );
          await audit.append(
            {
              actorId: "system:ocr-worker",
              action: "design_extraction_failed",
              entityType: "design_extraction_job",
              entityId: jobId,
              occurredAt: failedAt,
              newValues: { code, message }
            },
            transaction
          );
          return failed;
        });
      } catch (error) {
        throw mapRepositoryError(error);
      }
    }
  };
}

async function requireJob(repository: AppRepository, jobId: string) {
  const job = await repository.findExtractionJobById(jobId);
  if (!job) {
    throw new ApiError(
      404,
      "NOT_FOUND",
      "The requested resource was not found."
    );
  }
  return job;
}

function requireCurrentClaim(
  job: DesignExtractionJobRecord,
  claimToken: string,
  now: string
) {
  if (
    job.status !== "processing" ||
    job.claimId !== claimToken ||
    job.leaseExpiresAt === null ||
    new Date(job.leaseExpiresAt).getTime() <= new Date(now).getTime()
  ) {
    throw new ApiError(
      409,
      "STALE_EXTRACTION_CLAIM",
      "The extraction job claim is no longer current."
    );
  }
}

function normalizeAndValidateResult(
  result: WorkerExtractionResult,
  maxImageBytes: number
) {
  const pageNumbers = new Set<number>();
  let totalBytes = 0;
  const pages = result.pages.map((page) => {
    if (pageNumbers.has(page.pageNumber)) {
      invalidResult("Page numbers must be unique.");
    }
    pageNumbers.add(page.pageNumber);
    const image = decodeBase64(page.imageBase64, maxImageBytes);
    totalBytes += image.length;
    const sections = page.sections.map((section) => {
      const label = section.label.replace(/\s+/g, " ").trim();
      if (!label || label.length > 200) {
        invalidResult("Section labels must contain 1 to 200 characters.");
      }
      if (!cropIsWithinPage(section.crop, page.width, page.height)) {
        invalidResult("Section crops must remain within their source page.");
      }
      const sectionImage = decodeBase64(
        section.imageBase64,
        maxImageBytes
      );
      totalBytes += sectionImage.length;
      return {
        ...section,
        label,
        crop: { ...section.crop },
        image: sectionImage
      };
    });
    return { ...page, image, sections };
  });
  if (totalBytes > maxImageBytes * 4) {
    invalidResult("The extraction result contains too much image data.");
  }
  return { pages };
}

function decodeBase64(value: string, maxBytes: number) {
  if (
    value.length === 0 ||
    value.length > Math.ceil(maxBytes / 3) * 4 + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value
    )
  ) {
    invalidResult("Worker images must be valid bounded base64.");
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.length === 0 ||
    decoded.length > maxBytes ||
    decoded.toString("base64") !== value
  ) {
    invalidResult("Worker images must be canonical bounded base64.");
  }
  return decoded;
}

function cropIsWithinPage(crop: CropRect, width: number, height: number) {
  return (
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= width &&
    crop.y + crop.height <= height
  );
}

function invalidResult(message: string): never {
  throw new ApiError(400, "INVALID_EXTRACTION_RESULT", message);
}

async function cleanup(storage: FileStorage, references: string[]) {
  await Promise.allSettled(
    [...references].reverse().map((reference) => storage.delete(reference))
  );
}

function mapRepositoryError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof RepositoryConflictError) {
    return new ApiError(409, "EXTRACTION_CONFLICT", error.message);
  }
  if (error instanceof RepositoryNotFoundError) {
    return new ApiError(
      404,
      "NOT_FOUND",
      "The requested resource was not found."
    );
  }
  return error;
}
