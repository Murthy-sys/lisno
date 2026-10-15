import { z } from "zod";
import { ApiProtocolError } from "../../core/http/apiClient";
import { legacyDesignCatalogue } from "./legacyDesignCatalogue";
import { annotationDocumentSchema } from "../../platform/annotations/document";

const id = z.string().min(1);
const natural = z.number().int().safe().nonnegative();
const positive = z.number().int().safe().positive();
const annotations = z.unknown().transform((value, context) => {
  try { return annotationDocumentSchema.parse(value); }
  catch { context.addIssue({ code: "custom", message: "Invalid saved annotations" }); return z.NEVER; }
});
export const cropSchema = z.object({ x: natural, y: natural, width: positive, height: positive });
export type DesignCrop = z.infer<typeof cropSchema>;
export const planStatusSchema = z.enum(["pending_assignment", "assigned", "in_progress", "ready_for_client", "changes_requested", "approved"]);
const extractionSchema = z.enum(["queued", "processing", "estimator_review", "processing_failed", "submitted", "changes_requested", "approved"]);
const mapping = { roomId: id.nullable(), scopeSectionId: id.nullable(), catalogueId: id.nullable(), mappingStatus: z.enum(["auto_mapped", "estimator_assigned", "misc"]) };
export const uploadSchema = z.object({
  id, estimateId: id, leadId: id, originalFilename: z.string(), mimeType: z.string(), sizeBytes: natural,
  uploaderId: id, uploadedAt: z.string(), extractionStatus: extractionSchema, failureCode: z.string().nullable(), failureMessage: z.string().nullable(),
  canRetry: z.boolean(), canDelete: z.boolean(), deleteBlockedReason: z.string().optional(),
  purpose: z.enum(["ordinary", "drawing_replacement", "plan_request_replacement"]),
  requestReplacement: z.object({ requestId: id, requestVersion: positive, sourcePageId: id, targetCount: natural,
    matches: z.array(z.object({ drawingId: id, requestedRevisionId: id, detectedTitle: z.string(), resultRevisionId: id.nullable(), matchReason: z.enum(["normalized_title", "mapping_tuple"]).nullable(), pageNumber: positive.nullable() })),
    ignoredPageNumbers: z.array(positive), ignoredPageCount: natural }).nullable()
});
export const pageSchema = z.object({ id, uploadId: id, pageNumber: positive, width: positive, height: positive });
export const drawingSchema = z.object({ id, uploadId: id, sourcePageId: id, estimateId: id, active: z.boolean(), verified: z.boolean(), detectedTitle: z.string(), displayTitle: z.string(), source: z.enum(["ocr", "manual"]), roomConfidence: z.number().nullable(), scopeConfidence: z.number().nullable(), ocrConfidence: z.number().nullable(), roomEvidence: z.array(z.object({ value: z.string() })), scopeEvidence: z.array(z.object({ value: z.string() })), ...mapping });
export const revisionSchema = z.object({ id, drawingId: id, revisionNumber: positive, sourcePageId: id, crop: cropSchema, label: z.string(), reviewStatus: z.enum(["draft", "submitted", "approved", "changes_requested"]), submittedAt: z.string().nullable(), reviewerId: id.nullable(), reviewedAt: z.string().nullable(), changeSummary: z.string().nullable(), annotationLayerId: id.nullable(), annotations: annotations.nullable(), replacementUploadId: id.nullable(), replacesRevisionId: id.nullable(), ...mapping });
const workspaceSchema = z.object({ uploads: z.array(uploadSchema), pages: z.array(pageSchema), drawings: z.array(drawingSchema), revisions: z.array(revisionSchema) });
export type DesignUpload = z.infer<typeof uploadSchema>;
export type DesignPage = z.infer<typeof pageSchema>;
export type DesignDrawing = z.infer<typeof drawingSchema>;
export type DesignRevision = z.infer<typeof revisionSchema>;
export type DesignWorkspace = z.infer<typeof workspaceSchema>;
export const drawingUpdateSchema = drawingSchema.extend({ revision: revisionSchema });
export const replacementSchema = z.union([drawingUpdateSchema, z.object({ queued: z.literal(true), upload: uploadSchema })]);
export function parseDesignWorkspace(value: unknown, estimateId: string): DesignWorkspace {
  const parsed = workspaceSchema.safeParse(value); if (!parsed.success) throw new ApiProtocolError(); const data = parsed.data;
  if ([data.uploads, data.pages, data.drawings, data.revisions].some(rows => new Set(rows.map(row => row.id)).size !== rows.length) || data.uploads.some(upload => upload.estimateId !== estimateId) || data.drawings.some(drawing => drawing.estimateId !== estimateId) || data.pages.some(page => !data.uploads.some(upload => upload.id === page.uploadId)) || data.revisions.some(revision => !data.drawings.some(drawing => drawing.id === revision.drawingId))) throw new ApiProtocolError();
  return data;
}
export function parseUpload(value: unknown, estimateId: string) { const parsed = uploadSchema.safeParse(value); if (!parsed.success || parsed.data.estimateId !== estimateId) throw new ApiProtocolError(); return parsed.data; }
export function latestDesignRevisions(workspace: Pick<DesignWorkspace, "revisions">) {
  const result = new Map<string, DesignRevision>();
  for (const revision of workspace.revisions) if (!result.has(revision.drawingId) || result.get(revision.drawingId)!.revisionNumber < revision.revisionNumber) result.set(revision.drawingId, revision);
  return result;
}
export function cropWithinPage(crop: DesignCrop, page: Pick<DesignPage, "width" | "height">) {
  return cropSchema.safeParse(crop).success && crop.x + crop.width <= page.width && crop.y + crop.height <= page.height;
}
export const taskSchema = z.object({ id, estimateId: id, projectId: id, projectName: z.string(), clientName: z.string(), leadId: id.optional(), estimationWorkflowVersion: z.literal(2).optional(), status: planStatusSchema, designPlanVersion: natural,
  scopeReconciliation: z.object({ required: z.boolean(), designScopeRevision: positive, approvedDesignScopeRevision: natural.nullable() }).optional(),
  rooms: z.array(z.object({ id, label: z.string(), aliases: z.array(z.string()).optional() }).passthrough()), scopes: z.array(id), selectedMainBasketIds: z.array(id).optional(),
  lineItems: z.array(z.object({ source: z.enum(["legacy", "configuration"]).optional(), catalogueId: id, roomId: id.optional(), roomName: z.string(), specification: z.string().nullable(), included: z.boolean(), mainBasketId: id.optional(), mainBasketName: z.string().optional(), mainLineId: id.optional(), mainLineName: z.string().optional(), itemType: z.enum(["main_line", "temporary"]).optional() }))
});
export type DesignPlanTask = z.infer<typeof taskSchema>;
export interface DesignPlacement { readonly id: string; readonly label: string }
export interface DesignItem { readonly roomId: string; readonly roomLabel?: string; readonly catalogueId: string; readonly label: string; readonly scopeLabel: string; readonly scopeId?: string }
export function designEstimateOptions(task: { readonly rooms: readonly unknown[]; readonly scopes: readonly string[]; readonly lineItems: readonly DesignPlanTask["lineItems"][number][] }) {
  const sourceRooms = task.rooms.flatMap(value => { const parsed = z.object({ id: z.string().min(1), label: z.string().min(1), aliases: z.array(z.string()).optional() }).safeParse(value); return parsed.success ? [parsed.data] : []; });
  const rooms = [...new Map(sourceRooms.map(room => [room.id, { id: room.id, label: room.label }])).values()];
  const scopes: DesignPlacement[] = task.scopes.map(id => ({ id, label: legacyDesignCatalogue.find(scope => scope.id === id)?.label ?? id.replaceAll("_", " ") }));
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
  const items: DesignItem[] = [];
  for (const line of task.lineItems.filter(line => line.included)) {
    const room = line.source === "configuration" ? rooms.find(room => room.id === line.roomId) : sourceRooms.find(room => [room.id, room.label, ...(room.aliases ?? [])].map(normalize).includes(normalize(line.roomName)));
    if (!room) continue;
    if (line.source === "configuration") {
      if (!line.mainBasketId || !line.mainLineId) continue;
      if (!scopes.some(scope => scope.id === line.mainBasketId)) scopes.push({ id: line.mainBasketId, label: line.mainBasketName ?? "Main Basket" });
      items.push({ roomId: room.id, roomLabel: room.label, catalogueId: line.mainLineId, label: line.mainLineName ?? "Configured item", scopeLabel: line.mainBasketName ?? "Main Basket", scopeId: line.mainBasketId });
    } else {
      const scope = legacyDesignCatalogue.find(scope => scope.rows.some(row => row.id === line.catalogueId));
      const row = scope?.rows.find(row => row.id === line.catalogueId);
      if (scope) items.push({ roomId: room.id, roomLabel: room.label, catalogueId: line.catalogueId, label: `${line.catalogueId} · ${row?.description ?? line.specification ?? "Item"}`, scopeLabel: scope.label, scopeId: scope.id });
    }
  }
  return { rooms, scopes, items: [...new Map(items.map(item => [`${item.roomId}\u0000${item.catalogueId}`, item])).values()] };
}
export const designTaskOptions = designEstimateOptions;
export const documentSchema = z.object({ sourceUploadId: id, originalFilename: z.string(), documentId: id.nullable(), manifestHash: id, status: z.enum(["not_prepared", "preparing", "ready", "failed", "blocked"]), pageCount: natural, pdfUrl: z.string().nullable(), failureCode: z.string().nullable(), failureMessage: z.string().nullable() });
export const documentsSchema = z.object({ manifestHash: id, readyForSubmission: z.boolean(), documents: z.array(documentSchema), reviewRoundId: id.nullable() });
export type PlanDocuments = z.infer<typeof documentsSchema>;
const targetStatus = z.enum(["open", "replacement_submitted", "approved", "resolved", "withdrawn"]);
export const requestQueueSchema = z.object({ id, estimateId: id, uploadId: id, sourcePageId: id, clientId: id, version: positive, summary: z.string(), status: z.enum(["open", "resolved", "withdrawn"]), unassigned: z.boolean(), targetCount: natural, targets: z.array(z.object({ drawingId: id, status: targetStatus })), createdAt: z.string() });
const requestTarget = z.object({ drawingId: id, title: z.string(), latestRevisionId: id, latestRevisionNumber: positive, status: targetStatus });
export const requestDetailSchema = z.object({ id, sourcePageId: id, version: positive, summary: z.string(), annotations, targets: z.array(z.object({ drawingId: id, requestedRevisionId: id, status: targetStatus, resolvedByRevisionId: id.nullable() })), unassigned: z.boolean(), status: z.enum(["open", "resolved", "withdrawn"]), currentImageUrl: z.string(), resolutionNote: z.string().nullable(), drawingTargets: z.array(requestTarget), drawingCandidates: z.array(requestTarget.extend({ status: targetStatus.nullable() })) });
export type PlanRequest = z.infer<typeof requestDetailSchema>;
export type PlanRequestQueue = z.infer<typeof requestQueueSchema>;
export function drawingSubmissionIssues(workspace: DesignWorkspace) {
  const active = workspace.drawings.filter(drawing => drawing.active); const latest = latestDesignRevisions(workspace); const issues: string[] = [];
  if (!active.length) issues.push("Add at least one drawing.");
  if (workspace.uploads.some(upload => ["queued", "processing"].includes(upload.extractionStatus))) issues.push("Wait for drawing extraction to finish.");
  for (const drawing of active) {
    const revision = latest.get(drawing.id);
    if (!revision) { issues.push(`${drawing.displayTitle}: the current revision is unavailable.`); continue; }
    if (revision.reviewStatus === "changes_requested") issues.push(`${drawing.displayTitle}: upload a replacement for the returned revision.`);
    const page = workspace.pages.find(page => page.id === revision.sourcePageId);
    if (!page || !cropWithinPage(revision.crop, page)) issues.push(`${drawing.displayTitle}: check its source page and crop.`);
  }
  return issues;
}
