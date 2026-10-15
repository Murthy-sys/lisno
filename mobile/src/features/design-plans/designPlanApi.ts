import { z } from "zod";
import { ApiProtocolError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import type { RequestScope } from "../../contracts/http";
import type { MobileRuntime } from "../../runtime/createRuntime";
import type { SelectedAsset } from "../../platform/files";
import { documentsSchema, drawingUpdateSchema, parseDesignWorkspace, parseUpload, replacementSchema, requestDetailSchema, requestQueueSchema, taskSchema, type DesignCrop } from "./designPlanModel";

export type DesignScope = Pick<RequestScope, "environmentId" | "userId">;
export const designPlanKeys = {
  all: (scope: DesignScope) => privateQueryKey(scope, "design"),
  tasks: (scope: DesignScope) => privateQueryKey(scope, "design", "plan-tasks"),
  workspace: (scope: DesignScope, estimateId: string) => privateQueryKey(scope, "design", "estimate", estimateId, "drawings"),
  documents: (scope: DesignScope, estimateId: string) => privateQueryKey(scope, "design", "estimate", estimateId, "documents"),
  requests: (scope: DesignScope, estimateId: string) => privateQueryKey(scope, "design", "estimate", estimateId, "requests"),
  request: (scope: DesignScope, estimateId: string, id: string) => privateQueryKey(scope, "design", "estimate", estimateId, "request", id)
};
export const designFilePolicy = { acceptedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/tiff", "image/heic", "image/heif"], maxBytes: 25 * 1024 * 1024 };
export const estimateDesignPath = (id: string) => `/estimates/${encodeURIComponent(id)}`;
export const drawingPath = (id: string) => `/estimate-design-drawings/${encodeURIComponent(id)}`;
export const pageImagePath = (id: string) => `/estimate-design-source-pages/${encodeURIComponent(id)}/image`;
export const revisionImagePath = (id: string) => `/estimate-design-revisions/${encodeURIComponent(id)}/image`;
export const planRequestPath = (id: string) => `/estimate-plan-change-requests/${encodeURIComponent(id)}`;
function parsed<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) throw new ApiProtocolError(); return result.data; }
export async function getDesignPlanTasks(runtime: MobileRuntime, signal?: AbortSignal) { const rows = parsed(z.array(taskSchema), await runtime.api.authenticated.get("/designer/design-plan-tasks", { signal })); if (new Set(rows.map(row => row.id)).size !== rows.length) throw new ApiProtocolError(); return rows; }
export async function getDesignWorkspace(runtime: MobileRuntime, id: string, signal?: AbortSignal) { return parseDesignWorkspace(await runtime.api.authenticated.get(`${estimateDesignPath(id)}/design-uploads`, { signal }), id); }
export async function getDesignDocuments(runtime: MobileRuntime, id: string, signal?: AbortSignal) { return parsed(documentsSchema, await runtime.api.authenticated.get(`${estimateDesignPath(id)}/design-plan-documents`, { signal })); }
export async function prepareDesignDocuments(runtime: MobileRuntime, id: string, expectedManifestHash: string) {
  const result = parsed(documentsSchema, await runtime.api.authenticated.post(`${estimateDesignPath(id)}/design-plan-documents/prepare`, { expectedManifestHash }));
  if (result.manifestHash !== expectedManifestHash || result.reviewRoundId !== null) throw new ApiProtocolError(); return result;
}
export async function editDesignDrawing(runtime: MobileRuntime, estimateId: string, drawingId: string, input: { version: number; displayTitle?: string; roomId?: string; scopeSectionId?: string; crop?: DesignCrop; verified?: boolean }) {
  const result = parsed(drawingUpdateSchema, await runtime.api.authenticated.patch(drawingPath(drawingId), input));
  if (result.id !== drawingId || result.estimateId !== estimateId || result.revision.drawingId !== drawingId || result.revision.revisionNumber < input.version) throw new ApiProtocolError(); return result;
}
export async function assignDesignItem(runtime: MobileRuntime, estimateId: string, drawingId: string, input: { version: number; roomId: string; catalogueId: string }) {
  const result = parsed(drawingUpdateSchema, await runtime.api.authenticated.put(`${drawingPath(drawingId)}/estimate-item`, input));
  if (result.id !== drawingId || result.estimateId !== estimateId || result.roomId !== input.roomId || result.catalogueId !== input.catalogueId || result.revision.drawingId !== drawingId || result.revision.revisionNumber < input.version) throw new ApiProtocolError(); return result;
}
export async function createDesignDrawing(runtime: MobileRuntime, estimateId: string, pageId: string, input: { displayTitle: string; roomId: string; catalogueId: string; crop: DesignCrop }) {
  const result = parsed(drawingUpdateSchema, await runtime.api.authenticated.post(`/estimate-design-source-pages/${encodeURIComponent(pageId)}/drawings`, input));
  if (result.estimateId !== estimateId || result.sourcePageId !== pageId || result.roomId !== input.roomId || result.catalogueId !== input.catalogueId || result.revision.drawingId !== result.id) throw new ApiProtocolError(); return result;
}
export async function removeDesignDrawing(runtime: MobileRuntime, drawingId: string, version: number) { const result = parsed(z.object({ id: z.literal(drawingId), active: z.literal(false) }), await runtime.api.authenticated.delete(drawingPath(drawingId), { version })); return result; }
export async function removeDesignUpload(runtime: MobileRuntime, uploadId: string) { return parsed(z.object({ id: z.literal(uploadId), deleted: z.literal(true) }), await runtime.api.authenticated.delete(`/estimate-design-uploads/${encodeURIComponent(uploadId)}`)); }
export async function retryDesignUpload(runtime: MobileRuntime, estimateId: string, uploadId: string) { const result = parseUpload(await runtime.api.authenticated.post(`/estimate-design-uploads/${encodeURIComponent(uploadId)}/retry`), estimateId); if (result.id !== uploadId) throw new ApiProtocolError(); return result; }
export const submissionSchema = z.object({ submittedCount: z.number().int().nonnegative(), reviewRoundId: z.string().min(1).nullable().optional(), designPlanVersion: z.number().int().nonnegative().nullable().optional(), deliveryStatus: z.enum(["queued", "sending", "sent", "failed", "disabled"]).optional() });
export async function submitDesignDrawings(runtime: MobileRuntime, estimateId: string) { return parsed(submissionSchema, await runtime.api.authenticated.post(`${estimateDesignPath(estimateId)}/design-drawings/submit`)); }
export function designUploadRequest(path: string, asset: SelectedAsset, parameters?: Readonly<Record<string, string>>, onProgress?: (fraction: number | null) => void) { return { path, fileUri: asset.uri, fileName: asset.name, mimeType: asset.mimeType, maxBytes: designFilePolicy.maxBytes, parameters, onProgress: (event: { fraction: number | null }) => onProgress?.(event.fraction) }; }
export async function uploadDesign(runtime: MobileRuntime, estimateId: string, asset: SelectedAsset, onProgress?: (fraction: number | null) => void, signal?: AbortSignal) { return parseUpload(await runtime.transfers.upload<unknown>({ ...designUploadRequest(`${estimateDesignPath(estimateId)}/design-uploads`, asset, undefined, onProgress), signal }).result, estimateId); }
export async function replaceDesignDrawing(runtime: MobileRuntime, estimateId: string, drawingId: string, version: number, asset: SelectedAsset, onProgress?: (fraction: number | null) => void, signal?: AbortSignal) {
  const result = parsed(replacementSchema, await runtime.transfers.upload<unknown>({ ...designUploadRequest(`${drawingPath(drawingId)}/replacement`, asset, { version: String(version) }, onProgress), signal }).result);
  if ("queued" in result ? result.upload.estimateId !== estimateId : result.estimateId !== estimateId || result.id !== drawingId || result.revision.drawingId !== drawingId || result.revision.revisionNumber <= version) throw new ApiProtocolError(); return result;
}
export async function getPlanRequests(runtime: MobileRuntime, estimateId: string, signal?: AbortSignal) { const result = parsed(z.array(requestQueueSchema), await runtime.api.authenticated.get(`/estimate-plan-change-requests?estimateId=${encodeURIComponent(estimateId)}&status=open`, { signal })); if (result.some(row => row.estimateId !== estimateId) || new Set(result.map(row => row.id)).size !== result.length) throw new ApiProtocolError(); return result; }
export async function getPlanRequest(runtime: MobileRuntime, requestId: string, sourcePageId: string, signal?: AbortSignal) { const result = parsed(requestDetailSchema, await runtime.api.authenticated.get(planRequestPath(requestId), { signal })); if (result.id !== requestId || result.sourcePageId !== sourcePageId) throw new ApiProtocolError(); return result; }
export async function changePlanRequest(runtime: MobileRuntime, requestId: string, sourcePageId: string, input: { version: number; targetDrawingIds: string[] } | { version: number; note: string }) {
  const result = parsed(requestDetailSchema, "targetDrawingIds" in input ? await runtime.api.authenticated.put(`${planRequestPath(requestId)}/targets`, input) : await runtime.api.authenticated.post(`${planRequestPath(requestId)}/resolve-page`, input));
  if (result.id !== requestId || result.sourcePageId !== sourcePageId || result.version <= input.version) throw new ApiProtocolError(); return result;
}
export async function replacePlanRequest(runtime: MobileRuntime, estimateId: string, requestId: string, version: number, idempotencyKey: string, asset: SelectedAsset, onProgress?: (fraction: number | null) => void, signal?: AbortSignal) {
  const result = parseUpload(await runtime.transfers.upload<unknown>({ ...designUploadRequest(`${planRequestPath(requestId)}/replacement-upload`, asset, { version: String(version), idempotencyKey }, onProgress), signal }).result, estimateId);
  if (result.requestReplacement?.requestId !== requestId || result.requestReplacement.requestVersion !== version) throw new ApiProtocolError(); return result;
}
export async function reconcilePlanScope(runtime: MobileRuntime, projectId: string, input: { expectedDesignPlanVersion: number; expectedScopeRevision: number }) { const result = parsed(z.object({ designPlanVersion: z.number().int().nonnegative(), designScopeRevision: z.number().int().positive() }), await runtime.api.authenticated.post(`/projects/${encodeURIComponent(projectId)}/design-plan/reconcile-scope`, input)); if (result.designScopeRevision !== input.expectedScopeRevision || result.designPlanVersion < input.expectedDesignPlanVersion) throw new ApiProtocolError(); return result; }
export const designerOptionSchema = z.object({ id: z.string().min(1), name: z.string(), email: z.string() });
export async function getPlanDesigners(runtime: MobileRuntime, signal?: AbortSignal) { return parsed(z.array(designerOptionSchema), await runtime.api.authenticated.get("/admin/designers", { signal })); }
export async function assignPlanDesigner(runtime: MobileRuntime, projectId: string, designerId: string) { const result = parsed(taskSchema, await runtime.api.authenticated.post(`/admin/projects/${encodeURIComponent(projectId)}/design-assignment`, { designerId })); if (result.projectId !== projectId) throw new ApiProtocolError(); return result; }
