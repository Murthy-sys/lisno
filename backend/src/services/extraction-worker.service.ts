import { randomUUID } from "node:crypto";

import sharp from "sharp";
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
  heartbeat(jobId: string, claimToken: string): Promise<DesignExtractionJobRecord>;
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
  maxImageBytes: number,
  confidenceFloor: number
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
        `/api/v1/internal/extraction-jobs/${encodeURIComponent(job.id)}/source`;
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

    async heartbeat(jobId, claimToken) {
      const now = clock();
      const leaseExpiresAt = new Date(
        now.getTime() + leaseSeconds * 1000
      ).toISOString();
      try {
        return await repository.renewExtractionJobLease(
          jobId,
          claimToken,
          now.toISOString(),
          leaseExpiresAt
        );
      } catch (error) {
        throw mapRepositoryError(error);
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
      const normalized = await normalizeAndValidateResult(result, maxImageBytes, confidenceFloor);
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

async function normalizeAndValidateResult(
  result: WorkerExtractionResult,
  maxImageBytes: number,
  confidenceFloor: number
) {
  const pageNumbers = new Set<number>();
  let totalBytes = 0;
  const pages = [];
  for (const page of result.pages) {
    if (pageNumbers.has(page.pageNumber)) {
      invalidResult("Page numbers must be unique.");
    }
    pageNumbers.add(page.pageNumber);
    const image = decodeBase64(page.imageBase64, maxImageBytes);
    await validatePng(image, page.width, page.height);
    totalBytes += image.length;
    const sections = [];
    for (const section of page.sections.filter((item) => item.confidence >= confidenceFloor)) {
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
      await validatePng(sectionImage, section.crop.width, section.crop.height);
      totalBytes += sectionImage.length;
      sections.push({
        ...section,
        label,
        crop: { ...section.crop },
        image: sectionImage
      });
    }
    pages.push({ ...page, image, sections });
  }
  if (totalBytes > maxImageBytes * 4) {
    invalidResult("The extraction result contains too much image data.");
  }
  return { pages };
}

async function validatePng(image: Buffer, width: number, height: number) {
  try {
    const decoded = await sharp(image, {
      failOn: "error",
      limitInputPixels: 100_000_000
    }).raw().toBuffer({ resolveWithObject: true });
    if (
      decoded.info.format !== "raw" ||
      decoded.info.width !== width ||
      decoded.info.height !== height
    ) {
      invalidResult("Worker image dimensions must match the declared dimensions.");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    invalidResult("Worker images must be complete decodable PNG files.");
  }
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
  if (
    decoded.length < 24 ||
    !decoded.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    decoded.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    invalidResult("Worker images must be valid PNG files.");
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
