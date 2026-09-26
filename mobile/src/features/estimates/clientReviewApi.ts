import { z } from "zod";

import type { RequestScope } from "../../contracts/http";
import { ApiProtocolError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import type { AnnotationDocumentV1 } from "../../platform/annotations/document";
import type { MobileRuntime } from "../../runtime/createRuntime";
import {
  parseClientDrawingWorkspace,
  parseClientEstimates,
  parseClientPlanWorkspace,
  parseClientSectionReview,
  type ClientDrawingWorkspace,
  type ClientEstimate,
  type ClientPlanWorkspace,
  type ClientSectionReview
} from "./clientReviewModel";

type Scope = Pick<RequestScope, "environmentId" | "userId">;
const encoded = (value: string) => encodeURIComponent(value);

export const clientEstimateListKey = (scope: Scope) => privateQueryKey(scope, "estimates", "estimates", "/client/estimates");
export const clientPlanWorkspaceKey = (scope: Scope, estimateId: string) => privateQueryKey(scope, "plan-review", "client-plan", estimateId);
export const clientDrawingWorkspaceKey = (scope: Scope, estimateId: string) => privateQueryKey(scope, "plan-review", "client-drawings", estimateId);
export const clientSectionReviewKey = (scope: Scope, projectId: string) => privateQueryKey(scope, "design", "client-sections", projectId);

export async function getClientEstimates(runtime: MobileRuntime, signal?: AbortSignal): Promise<readonly ClientEstimate[]> {
  return parseClientEstimates(await runtime.api.authenticated.get<unknown>("/client/estimates", { signal }));
}

export async function getClientPlanWorkspace(runtime: MobileRuntime, estimateId: string, signal?: AbortSignal): Promise<ClientPlanWorkspace> {
  return parseClientPlanWorkspace(await runtime.api.authenticated.get<unknown>(`/client/estimates/${encoded(estimateId)}/plan-review`, { signal }));
}

export async function getClientDrawingWorkspace(runtime: MobileRuntime, estimateId: string, signal?: AbortSignal): Promise<ClientDrawingWorkspace> {
  return parseClientDrawingWorkspace(await runtime.api.authenticated.get<unknown>(`/client/estimates/${encoded(estimateId)}/design-drawings`, { signal }));
}

export async function getClientSectionReview(runtime: MobileRuntime, projectId: string, signal?: AbortSignal): Promise<ClientSectionReview> {
  return parseClientSectionReview(await runtime.api.authenticated.get<unknown>(`/client/projects/${encoded(projectId)}/design-sections`, { signal }), projectId);
}

const decisionResultSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["sent_to_client", "client_changes_requested", "client_approved"]),
  projectId: z.string().nullish().transform((value) => value ?? null)
}).passthrough();

export type ClientEstimateDecisionResult = z.infer<typeof decisionResultSchema>;

export async function decideClientEstimate(runtime: MobileRuntime, estimateId: string, decision: "approve" | "request_changes", note: string): Promise<ClientEstimateDecisionResult> {
  const value = await runtime.api.authenticated.post<unknown>(`/client/estimates/${encoded(estimateId)}/decision`, { decision, note: note.trim() });
  const result = decisionResultSchema.safeParse(value);
  if (!result.success || result.data.id !== estimateId) throw new ApiProtocolError();
  return result.data;
}

export interface ClientPlanTargetPreview {
  readonly pageRevisionNumber: number;
  readonly snapshotToken: string;
  readonly targets: readonly { readonly drawingId: string; readonly title: string; readonly reason: "anchor_inside" | "area_overlap" }[];
}

const targetPreviewSchema = z.object({
  pageRevisionNumber: z.number().int().positive(),
  snapshotToken: z.string().min(1),
  targets: z.array(z.object({ drawingId: z.string().min(1), title: z.string(), reason: z.enum(["anchor_inside", "area_overlap"]) }).passthrough())
}).passthrough();

export const clientPlanPageImagePath = (pageId: string, thumbnail = false) =>
  `/client/estimate-plan-pages/${encoded(pageId)}/${thumbnail ? "thumbnail" : "current-image"}`;
export const clientDrawingRevisionImagePath = (revisionId: string) => `/estimate-design-revisions/${encoded(revisionId)}/image`;
export const clientSectionRevisionImagePath = (revisionId: string) => `/design-section-revisions/${encoded(revisionId)}/image`;
export const clientDesignVersionDownloadPath = (versionId: string) => `/design-versions/${encoded(versionId)}/download`;

export function saveClientPlanDraft(runtime: MobileRuntime, pageId: string, version: number, annotations: AnnotationDocumentV1): Promise<unknown> {
  return runtime.api.authenticated.put(`/client/estimate-plan-pages/${encoded(pageId)}/annotation-draft`, { version, annotations });
}

export async function previewClientPlanTargets(runtime: MobileRuntime, pageId: string, annotations: AnnotationDocumentV1): Promise<ClientPlanTargetPreview> {
  const value = await runtime.api.authenticated.post<unknown>(`/client/estimate-plan-pages/${encoded(pageId)}/target-preview`, { annotations });
  const result = targetPreviewSchema.safeParse(value);
  if (!result.success) throw new ApiProtocolError();
  return result.data;
}

export interface SubmitClientPlanRequest {
  readonly version: number;
  readonly summary: string;
  readonly annotations: AnnotationDocumentV1;
  readonly targetDrawingIds: readonly string[];
  readonly snapshotToken: string;
  readonly idempotencyKey: string;
}

export function submitClientPlanRequest(runtime: MobileRuntime, pageId: string, input: SubmitClientPlanRequest): Promise<unknown> {
  return runtime.api.authenticated.post(`/client/estimate-plan-pages/${encoded(pageId)}/change-requests`, input);
}

export function updateClientPlanRequest(runtime: MobileRuntime, requestId: string, version: number, summary: string, annotations: AnnotationDocumentV1): Promise<unknown> {
  return runtime.api.authenticated.put(`/client/estimate-plan-change-requests/${encoded(requestId)}`, { version, summary, annotations });
}

export function saveClientDrawingDraft(runtime: MobileRuntime, revisionId: string, version: number, annotations: AnnotationDocumentV1): Promise<unknown> {
  return runtime.api.authenticated.put(`/client/estimate-design-revisions/${encoded(revisionId)}/annotation-draft`, { version, annotations });
}

export type ClientDrawingDecision =
  | { readonly version: number; readonly decision: "approve" }
  | { readonly version: number; readonly decision: "request_changes"; readonly summary: string; readonly annotations: AnnotationDocumentV1 };

export function decideClientDrawing(runtime: MobileRuntime, revisionId: string, input: ClientDrawingDecision): Promise<unknown> {
  return runtime.api.authenticated.post(`/client/estimate-design-revisions/${encoded(revisionId)}/decision`, input);
}

export function decideClientSection(runtime: MobileRuntime, revisionId: string, version: number, decision: "approved" | "rejected", comment?: string): Promise<unknown> {
  return runtime.api.authenticated.post(`/design-section-revisions/${encoded(revisionId)}/decision`, {
    version, decision, ...(comment === undefined ? {} : { comment: comment.trim() })
  });
}
