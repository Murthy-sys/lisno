import { apiClient } from "../../api/client";
import type {
  PostFinanceEntryResult,
  ProcurementProject
} from "../../api/types";

export const procurementKeys = {
  all: ["procurement"] as const,
  projects: ["procurement", "projects"] as const
};

export const getProcurementProjects = () =>
  apiClient.get<ProcurementProject[]>("/procurement/projects");

export interface PostProcurementExpenseInput {
  sourceLineItemKey: string;
  amountPaise: number;
  incurredAt: string;
  description: string;
  vendor?: string;
  reference?: string;
  idempotencyKey: string;
  receipt: File;
}

export function postProcurementExpense(
  projectId: string,
  input: PostProcurementExpenseInput,
  onProgress: (percent: number) => void
) {
  const body = new FormData();
  body.append("receipt", input.receipt);
  body.append("sourceLineItemKey", input.sourceLineItemKey);
  body.append("amountPaise", String(input.amountPaise));
  body.append("incurredAt", input.incurredAt);
  body.append("description", input.description);
  if (input.vendor) body.append("vendor", input.vendor);
  if (input.reference) body.append("reference", input.reference);
  body.append("idempotencyKey", input.idempotencyKey);

  return apiClient.postMultipartWithProgress<PostFinanceEntryResult>(
    `/procurement/projects/${encodeURIComponent(projectId)}/expenses`,
    body,
    onProgress
  );
}

export const getProcurementSupportingDocument = (
  projectId: string,
  entryId: string
) => apiClient.getBlob(
  `/procurement/projects/${encodeURIComponent(projectId)}/entries/${encodeURIComponent(entryId)}/document`
);
