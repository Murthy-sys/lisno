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

export const createManualEstimateDrawing = (
  pageId: string,
  input: {
    displayTitle: string;
    roomId: string;
    scopeSectionId: string;
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
