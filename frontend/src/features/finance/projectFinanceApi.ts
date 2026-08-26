import { apiClient } from "../../api/client";
import type {
  FinanceLedgerEntry,
  PageData,
  PostFinanceEntryResult,
  ProjectFinanceBucket,
  ProjectFinancePortfolioSummary
} from "../../api/types";

export interface ProjectFinanceBucketPage extends PageData<ProjectFinanceBucket> {
  summary: ProjectFinancePortfolioSummary;
}

export const projectFinanceKeys = {
  all: ["project-finance"] as const,
  projects: ["project-finance", "projects"] as const,
  bucket: (projectId: string) => ["project-finance", "bucket", projectId] as const,
  entries: (projectId: string) => ["project-finance", "entries", projectId] as const
};

export const getProjectFinanceBuckets = (offset = 0) =>
  apiClient.get<ProjectFinanceBucketPage>(
    `/finance/projects?limit=100&offset=${offset}`
  );

export const getProjectFinanceBucket = (projectId: string) =>
  apiClient.get<ProjectFinanceBucket>(
    `/finance/projects/${encodeURIComponent(projectId)}`
  );

export const getProjectFinanceEntries = (projectId: string) =>
  apiClient.get<PageData<FinanceLedgerEntry>>(
    `/finance/projects/${encodeURIComponent(projectId)}/entries?limit=100&offset=0`
  );

type FinanceEntryBase = {
  category: string;
  amountPaise: number;
  incurredAt: string;
  description: string;
  vendor?: string;
  reference?: string;
  idempotencyKey: string;
};

export type PostProjectFinanceEntryInput = FinanceEntryBase & (
  | { type: "direct_spend"; expenseClass: "procurement" | "employee_payment" | "other" }
  | { type: "overhead"; expenseClass?: never }
);

export const postProjectFinanceEntry = (
  projectId: string,
  input: PostProjectFinanceEntryInput
) => apiClient.post<PostFinanceEntryResult>(
  `/finance/projects/${encodeURIComponent(projectId)}/entries`,
  input
);
