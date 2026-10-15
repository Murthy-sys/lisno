import type { JsonApiClient } from "../../core/http/apiClient";
import type { ReviewDecision } from "../vendor-work/vendorWorkApi";
import type { SiteCompletion } from "./siteCompletionTypes";
import type { ProjectCompletionSummary, ProjectScopeExceptionKind } from "./projectCompletionTypes";
export interface CompletionPage { items: ProjectCompletionSummary[]; total: number; limit: number; offset: number }
export interface ScopeExceptionReceipt { id: string; projectId: string; sourceLineItemKey: string; kind: ProjectScopeExceptionKind; reason: string; resultingAuthorityVersion: number; recordedAt: string }
export interface CompletionReceipt { id: string; projectId: string; completedAt: string; resultingAuthorityVersion: number }
export function createCompletionApi(http: JsonApiClient["authenticated"]) {
  const path = (id: string) => `/projects/${encodeURIComponent(id)}/site-completion`;
  const admin = (id: string) => `/admin/projects/${encodeURIComponent(id)}`;
  return {
    site: (id: string, audience: "staff" | "client" | "admin", signal?: AbortSignal) => http.get<SiteCompletion>(audience === "client" ? `/clients${path(id)}` : audience === "admin" ? `/admin${path(id)}` : path(id), { signal }),
    progress: (id: string, body: { expectedVersion: number; idempotencyKey: string; progress: number; note: string }) => http.patch<SiteCompletion>(`${path(id)}/progress`, body),
    submit: (id: string, body: { expectedVersion: number; idempotencyKey: string; note: string }) => http.post<SiteCompletion>(`${path(id)}/submit`, body),
    decide: (id: string, body: ReviewDecision) => http.post<SiteCompletion>(`/clients${path(id)}/decision`, body),
    queue: (offset: number, signal?: AbortSignal) => http.get<CompletionPage>(`/admin/project-completion-tasks?limit=25&offset=${offset}`, { signal }),
    summary: (id: string, signal?: AbortSignal) => http.get<ProjectCompletionSummary>(`${admin(id)}/completion`, { signal }),
    except: (id: string, body: { sourceLineItemKey: string; kind: ProjectScopeExceptionKind; reason: string; expectedAuthorityVersion: number; idempotencyKey: string }) => http.post<ScopeExceptionReceipt>(`${admin(id)}/scope-exceptions`, body),
    complete: (id: string, body: { expectedAuthorityVersion: number; idempotencyKey: string }) => http.post<CompletionReceipt>(`${admin(id)}/complete`, body)
  };
}
