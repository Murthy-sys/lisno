import { apiClient } from "../../api/client";
import type {
  CropRect,
  EstimateDesignDrawingUpdate,
  EstimateDesignUpload,
  EstimateDesignWorkspace
} from "../../api/types";

export const estimateDesignKeys = {
  all: ["estimate-designs"] as const,
  workspace: (estimateId: string) => [...estimateDesignKeys.all, estimateId] as const
};

export const getEstimateDesignWorkspace = (estimateId: string) =>
  apiClient.get<EstimateDesignWorkspace>(
    `/estimates/${encodeURIComponent(estimateId)}/design-uploads`
  );

export function uploadEstimateDesign(estimateId: string, file: File): Promise<EstimateDesignUpload> {
  const body = new FormData();
  body.append("file", file);
  return apiClient.postMultipart<EstimateDesignUpload>(
    `/estimates/${encodeURIComponent(estimateId)}/design-uploads`,
    body
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

export function replaceEstimateDrawing(drawingId: string, version: number, file: File) {
  const body = new FormData();
  body.append("version", String(version));
  body.append("file", file);
  return apiClient.postMultipart<EstimateDesignDrawingUpdate>(
    `/estimate-design-drawings/${encodeURIComponent(drawingId)}/replacement`,
    body
  );
}

export const submitEstimateDrawings = (estimateId: string) =>
  apiClient.post<{ submittedCount: number }>(
    `/estimates/${encodeURIComponent(estimateId)}/design-drawings/submit`
  );

export const estimateDesignSourcePageImageUrl = (pageId: string) =>
  `/estimate-design-source-pages/${encodeURIComponent(pageId)}/image`;

export const estimateDesignRevisionImageUrl = (revisionId: string) =>
  `/estimate-design-revisions/${encodeURIComponent(revisionId)}/image`;
