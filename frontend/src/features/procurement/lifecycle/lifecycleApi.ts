import { apiClient } from "../../../api/client";
import type { LifecycleEvidence, LifecycleSummary } from "../../../../../shared/procurement/projectLifecycle";
import type { PaymentOrder, PaymentOrdersPage, PaymentHistoryPage } from "../../../../../shared/procurement/payments";
import type { ProcurementReviewPage, ProcurementReviewDetail } from "../../../../../shared/procurement/progress";
import type { ProcurementInspectionPage, ProcurementInspectionVisit } from "../../../../../shared/procurement/inspections";
import type { HandoverWorkspace, ProcurementFinding } from "../../../../../shared/procurement/handover";
import type { ProcurementReadinessWorkspace } from "../../../../../shared/procurement/readiness";
export type * from "../../../../../shared/procurement/projectLifecycle";
export type * from "../../../../../shared/procurement/payments";
export type * from "../../../../../shared/procurement/progress";
export type * from "../../../../../shared/procurement/inspections";
export type * from "../../../../../shared/procurement/handover";
export type * from "../../../../../shared/procurement/readiness";

export type LifecycleAudience = "procurement" | "finance" | "admin";
export const lifecycleKeys = {
  all: ["procurement-lifecycle"] as const,
  project: (actorId: string, projectId: string, audience: LifecycleAudience) => ["procurement-lifecycle", actorId, projectId, audience] as const,
  view: (actorId: string, projectId: string, audience: LifecycleAudience, view: string, query: unknown = {}) => ["procurement-lifecycle", actorId, projectId, audience, view, query] as const
};
const queryString = (query: Record<string, string | number | undefined> = {}) => {
  const pairs = Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]);
  return pairs.length ? `?${new URLSearchParams(pairs).toString()}` : "";
};
export function lifecycleApi(projectId: string, audience: LifecycleAudience = "procurement") {
  const id = encodeURIComponent(projectId);
  const base = audience === "procurement" ? `/procurement/projects/${id}/lifecycle` : `/${audience}/projects/${id}/procurement-lifecycle`;
  const post = <T>(path: string, value: unknown) => apiClient.post<T>(`${base}${path}`, value);
  return {
    summary: () => apiClient.get<LifecycleSummary>(base),
    setup: (input: unknown) => post<LifecycleSummary>("/setup", input),
    policy: (input: unknown) => post<LifecycleSummary>("/policy", input),
    payments: (query: Record<string, string | number | undefined> = {}) => apiClient.get<PaymentOrdersPage>(`${base}/payments${queryString(query)}`),
    paymentHistory: (query: Record<string, string | number | undefined> = {}) => apiClient.get<PaymentHistoryPage>(`${base}/payments/history${queryString(query)}`),
    paymentCommand: (input: { action: string; [key: string]: unknown }) => {
      const paths: Record<string, string> = { propose_dates: "/payment-dates", confirm_dates: "/payment-dates", authorize: "/payment-authorizations", record: "/payments", reverse: "/payment-reversals", reconcile: "/payment-reconciliation", approve_retention: "/retention", acknowledge_retention: "/retention", request_correction: "/payment-correction-requests", resolve_correction: "/payment-corrections" };
      if (!paths[input.action]) return Promise.reject(new Error("Unsupported payment action."));
      return post<PaymentOrder>(paths[input.action]!, input);
    },
    reviews: (query: Record<string, string | number | undefined> = {}) => apiClient.get<ProcurementReviewPage>(`${base}/reviews${queryString(query)}`),
    review: (roundId: string) => apiClient.get<ProcurementReviewDetail>(`${base}/reviews/${encodeURIComponent(roundId)}`),
    reviewCommand: (input: unknown) => post<ProcurementReviewDetail>("/reviews/actions", input),
    inspections: (query: Record<string, string | number | undefined> = {}) => apiClient.get<ProcurementInspectionPage>(`${base}/inspections${queryString(query)}`),
    planInspections: (input: unknown) => post<ProcurementInspectionPage>("/inspection-plan", input),
    recordInspection: (input: unknown) => post<ProcurementInspectionVisit>("/inspections", input),
    correctInspection: (id: string, input: unknown) => post<ProcurementInspectionVisit>(`/inspections/${encodeURIComponent(id)}/corrections`, input),
    handover: (query: Record<string, string | number | undefined> = {}) => apiClient.get<HandoverWorkspace>(`${base}/handover${queryString(query)}`),
    handoverCommand: (input: unknown) => post<HandoverWorkspace>("/handover/actions", input),
    finding: (input: unknown) => post<ProcurementFinding>("/findings", input),
    readiness: () => apiClient.get<ProcurementReadinessWorkspace>(`${base}/readiness`),
    readinessCommand: (input: unknown) => post<ProcurementReadinessWorkspace>(audience === "admin" ? "/correction-requests" : "/readiness/actions", input),
    upload: (entityId: string, purpose: LifecycleEvidence["purpose"], files: File[], onProgress: (percent: number) => void = () => {}) => {
      const form = new FormData(); form.append("entityId", entityId); form.append("purpose", purpose);
      for (const file of files) form.append(file.type === "application/pdf" ? "file" : "mediaFiles", file);
      return apiClient.postMultipartWithProgress<{ items: LifecycleEvidence[] }>(`${base}/evidence`, form, onProgress).then(result => result.items);
    },
    evidence: (id: string) => apiClient.getBlob(`${base}/evidence/${encodeURIComponent(id)}`)
  };
}
