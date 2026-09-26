import { z } from "zod";

import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import {
  emptyAnnotationDocument,
  validateAnnotationDocument,
  type AnnotationDocumentV1,
  type AnnotationElementV1
} from "../../platform/annotations/document";
import type { ClientPlanPage, ClientPlanRequest, ClientPlanWorkspace } from "./clientReviewModel";

export interface PlanUploadGroup {
  readonly id: string;
  readonly originalFilename: string;
  readonly pages: readonly ClientPlanPage[];
}

export function orderedPlanUploads(workspace: ClientPlanWorkspace): readonly PlanUploadGroup[] {
  const pages = new Map(workspace.pages.map((page) => [page.id, page]));
  return workspace.uploads.map((upload) => ({
    id: upload.id,
    originalFilename: upload.originalFilename,
    pages: upload.pages
      .map((page) => {
        const canonical = pages.get(page.id);
        if (!canonical) throw new Error("The plan page list is inconsistent.");
        return canonical;
      })
      .slice()
      .sort((left, right) => left.pageNumber - right.pageNumber || left.id.localeCompare(right.id))
  }));
}

/** An open request is unique for a Client and page. Treat unexpected duplicates as a conflict. */
export function planRequestForPage(workspace: ClientPlanWorkspace, pageId: string): ClientPlanRequest | null | "ambiguous" {
  const requests = workspace.openRequests.filter((request) => request.sourcePageId === pageId && request.status === "open");
  if (requests.length > 1) return "ambiguous";
  return requests[0] ?? null;
}

export function initialPlanDocument(page: ClientPlanPage, request: ClientPlanRequest | null): AnnotationDocumentV1 {
  return request?.annotations ?? page.annotationDraft?.annotations ?? emptyAnnotationDocument(page.width, page.height);
}

export function sharedPlanRequestMarks(workspace: ClientPlanWorkspace, pageId: string, excludedRequestId?: string): readonly AnnotationElementV1[] {
  return workspace.openRequests
    .filter((request) => request.sourcePageId === pageId && request.id !== excludedRequestId)
    .flatMap((request) => request.annotations.elements.map((element) => ({ ...element, id: `request:${request.id}:${element.id}` })));
}

export function validatePlanDocument(document: AnnotationDocumentV1, page: ClientPlanPage): string | null {
  const result = validateAnnotationDocument(document, page.width, page.height);
  return result.valid ? null : result.message;
}

export function validatePlanFeedback(document: AnnotationDocumentV1, summary: string, page: ClientPlanPage): string | null {
  const documentError = validatePlanDocument(document, page);
  if (documentError) return documentError;
  if (document.elements.length === 0) return "Add at least one mark to this page before requesting changes.";
  if (!summary.trim()) return "Describe the changes you need before submitting.";
  if (summary.trim().length > 1_000) return "Keep the change summary within 1,000 characters.";
  return null;
}

export function planMutationError(cause: unknown): { readonly conflict: boolean; readonly message: string } {
  if (cause instanceof ApiError && cause.status === 409) {
    return { conflict: true, message: "This plan changed. Refresh it, review the latest version, then choose how to continue. Your marks remain here." };
  }
  if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
    return { conflict: false, message: "This plan is no longer available to your account. Refresh to check access." };
  }
  return { conflict: false, message: "The plan action could not be completed. Check your connection and try again." };
}

export function planReviewIsAwaiting(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 409 && cause.code === "DESIGN_PLAN_NOT_REVIEWABLE";
}

export function submissionFingerprint(document: AnnotationDocumentV1, summary: string): string {
  return JSON.stringify([document, summary.trim()]);
}

const mutationResultSchema = z.object({
  id: z.string().min(1),
  sourcePageId: z.string().min(1),
  version: z.number().int().positive()
}).passthrough();

export function planMutationVersion(value: unknown, pageId: string): number {
  const result = mutationResultSchema.safeParse(value);
  if (!result.success || result.data.sourcePageId !== pageId) throw new ApiProtocolError();
  return result.data.version;
}
