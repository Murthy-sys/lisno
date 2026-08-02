import { apiClient } from "../../api/client";
import type {
  AnnotationDocumentV1,
  CropRect,
  EstimateDesignAnnotationDraft,
  EstimateDesignClientWorkspace,
  EstimateDesignDrawingUpdate,
  EstimateDesignReplacementResult,
  EstimateDesignRevision,
  EstimateDesignUpload,
  EstimateDesignWorkspace
  ,EstimatePlanAnnotationDraft
  ,EstimatePlanChangeRequest
  ,EstimatePlanClientWorkspace
} from "../../api/types";

export const estimateDesignKeys = {
  all: ["estimate-designs"] as const,
  workspace: (estimateId: string) => [...estimateDesignKeys.all, estimateId] as const,
  clientWorkspace: (estimateId: string) =>
    ["client", "estimate-designs", estimateId] as const
};

export const getEstimateDesignWorkspace = (estimateId: string) =>
  apiClient.get<EstimateDesignWorkspace>(
    `/estimates/${encodeURIComponent(estimateId)}/design-uploads`
  );

export function uploadEstimateDesign(
  estimateId: string,
  file: File,
  onProgress: (percent: number) => void = () => {}
): Promise<EstimateDesignUpload> {
  const body = new FormData();
  body.append("file", file);
  return apiClient.postMultipartWithProgress<EstimateDesignUpload>(
    `/estimates/${encodeURIComponent(estimateId)}/design-uploads`,
    body,
    onProgress
  );
}

export const editEstimateDrawing = (
  drawingId: string,
  input: {
    version: number;
    displayTitle?: string;
    roomId?: string;
    scopeSectionId?: string;
    crop?: CropRect;
    verified?: boolean;
  }
) => apiClient.patch<EstimateDesignDrawingUpdate>(
  `/estimate-design-drawings/${encodeURIComponent(drawingId)}`,
  input
);

export const assignEstimateDrawingItem = (
  drawingId: string,
  input: {
    version: number;
    roomId: string;
    catalogueId: string;
  }
) => apiClient.put<EstimateDesignDrawingUpdate>(
  `/estimate-design-drawings/${encodeURIComponent(drawingId)}/estimate-item`,
  input
);

export const createManualEstimateDrawing = (
  pageId: string,
  input: {
    displayTitle: string;
    roomId: string;
    catalogueId: string;
    crop: CropRect;
  }
) => apiClient.post<EstimateDesignDrawingUpdate>(
  `/estimate-design-source-pages/${encodeURIComponent(pageId)}/drawings`,
  input
);

export function replaceEstimateDrawing(drawingId: string, version: number, file: File) {
  const body = new FormData();
  body.append("version", String(version));
  body.append("file", file);
  return apiClient.postMultipart<EstimateDesignReplacementResult>(
    `/estimate-design-drawings/${encodeURIComponent(drawingId)}/replacement`,
    body
  );
}

export const retryEstimateDesignUpload = (uploadId: string) => apiClient.post<EstimateDesignUpload>(
  `/estimate-design-uploads/${encodeURIComponent(uploadId)}/retry`
);

export const removeEstimateDrawing = (drawingId: string, version: number) => apiClient.delete<{ id: string; active: false }>(
  `/estimate-design-drawings/${encodeURIComponent(drawingId)}`,
  { version }
);

export const submitEstimateDrawings = (estimateId: string) =>
  apiClient.post<{ submittedCount: number }>(
    `/estimates/${encodeURIComponent(estimateId)}/design-drawings/submit`
  );

export const getClientEstimateDrawings = (estimateId: string) =>
  apiClient.get<EstimateDesignClientWorkspace>(
    `/client/estimates/${encodeURIComponent(estimateId)}/design-drawings`
  );

export const saveClientDrawingAnnotationDraft = (
  revisionId: string,
  version: number,
  annotations: AnnotationDocumentV1
) => apiClient.put<EstimateDesignAnnotationDraft>(
  `/client/estimate-design-revisions/${encodeURIComponent(revisionId)}/annotation-draft`,
  { version, annotations }
);

export function decideClientDrawing(
  revisionId: string,
  input:
    | { version: number; decision: "approve" }
    | {
        version: number;
        decision: "request_changes";
        summary: string;
        annotations: AnnotationDocumentV1;
      }
) {
  return apiClient.post<EstimateDesignRevision>(
    `/client/estimate-design-revisions/${encodeURIComponent(revisionId)}/decision`,
    input
  );
}

export const estimateDesignSourcePageImageUrl = (pageId: string) =>
  `/estimate-design-source-pages/${encodeURIComponent(pageId)}/image`;

export const estimateDesignRevisionImageUrl = (revisionId: string) =>
  `/estimate-design-revisions/${encodeURIComponent(revisionId)}/image`;

export const getClientPlanWorkspace = (estimateId: string) =>
  apiClient.get<EstimatePlanClientWorkspace>(`/client/estimates/${encodeURIComponent(estimateId)}/plan-review`);

export const clientPlanThumbnailUrl = (pageId: string) =>
  `/client/estimate-plan-pages/${encodeURIComponent(pageId)}/thumbnail`;

export const clientPlanCurrentImageUrl = (pageId: string) =>
  `/client/estimate-plan-pages/${encodeURIComponent(pageId)}/current-image`;

export const saveClientPlanDraft = (pageId: string, version: number, annotations: AnnotationDocumentV1) =>
  apiClient.put<EstimatePlanAnnotationDraft>(`/client/estimate-plan-pages/${encodeURIComponent(pageId)}/annotation-draft`, { version, annotations });

export const previewClientPlanTargets = (pageId: string, annotations: AnnotationDocumentV1) =>
  apiClient.post<{ pageRevisionNumber: number; targets: Array<{ drawingId: string; title: string; reason: "anchor_inside" | "area_overlap" }>; snapshotToken: string }>(`/client/estimate-plan-pages/${encodeURIComponent(pageId)}/target-preview`, { annotations });

export const submitClientPlanChangeRequest = (pageId: string, input: {
  version: number; summary: string; annotations: AnnotationDocumentV1;
  targetDrawingIds: string[]; snapshotToken: string; idempotencyKey: string;
}) => apiClient.post<EstimatePlanChangeRequest>(`/client/estimate-plan-pages/${encodeURIComponent(pageId)}/change-requests`, input);
