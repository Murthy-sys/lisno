import { apiClient } from "../../api/client";
import type {
  EstimateClientResponseDecisionResult,
  EstimateClientResponseTaskDetail,
  EstimateClientResponseTaskListItem,
  PageData,
  PaginationInput
} from "../../api/types";

export type EstimateClientResponseStatus =
  | "pending"
  | "approved"
  | "changes_requested";

export const estimateClientResponseKeys = {
  all: ["estimate-client-responses"] as const,
  list: (
    status: EstimateClientResponseStatus | undefined,
    pagination: PaginationInput
  ) =>
    [
      "estimate-client-responses",
      "list",
      status ?? "all",
      pagination
    ] as const,
  detail: (roundId: string) =>
    ["estimate-client-responses", "detail", roundId] as const
};

export function estimateClientResponsesPath(
  status: EstimateClientResponseStatus | undefined,
  pagination: PaginationInput
): string {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  query.set("limit", String(pagination.limit));
  query.set("offset", String(pagination.offset));
  return `/admin/estimate-client-response-tasks?${query.toString()}`;
}

export const getEstimateClientResponses = (
  status: EstimateClientResponseStatus | undefined,
  pagination: PaginationInput
) =>
  apiClient.get<PageData<EstimateClientResponseTaskListItem>>(
    estimateClientResponsesPath(status, pagination)
  );

export const getEstimateClientResponse = (roundId: string) =>
  apiClient.get<EstimateClientResponseTaskDetail>(
    `/admin/estimate-client-response-tasks/${encodeURIComponent(roundId)}`
  );

export const downloadEstimateClientResponsePdf = (roundId: string) =>
  apiClient.getBlob(
    `/admin/estimate-client-response-tasks/${encodeURIComponent(roundId)}/pdf`
  );

export const downloadEstimateClientResponseProof = (roundId: string) =>
  apiClient.getBlob(
    `/admin/estimate-client-response-tasks/${encodeURIComponent(roundId)}/proof`
  );

export function decideEstimateClientResponse(
  roundId: string,
  input: {
    decision: "approve" | "request_changes";
    note: string;
    version: number;
    proof: File;
  },
  onProgress: (percent: number) => void
): Promise<EstimateClientResponseDecisionResult> {
  const body = new FormData();
  body.append("decision", input.decision);
  if (input.note.trim()) body.append("note", input.note.trim());
  body.append("version", String(input.version));
  body.append("proof", input.proof, input.proof.name);
  return apiClient.postMultipartWithProgress(
    `/admin/estimate-client-response-tasks/${encodeURIComponent(roundId)}/decision`,
    body,
    onProgress
  );
}
