import { z } from "zod";

import { ApiProtocolError } from "../../core/http/apiClient";
import { annotationDocumentSchema } from "../../platform/annotations/document";

const id = z.string().trim().min(1);
const optionalText = z.string().nullish().transform((value) => value ?? null);
const finiteMoney = z.number().finite().nonnegative();

const lineItemSchema = z.object({
  id: id.optional(),
  catalogueId: z.string().optional(),
  roomName: z.string().optional(),
  specification: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.number().finite().nonnegative(),
  rate: finiteMoney,
  amount: finiteMoney.optional(),
  included: z.boolean()
}).passthrough();

const estimateSchema = z.object({
  id,
  projectId: optionalText,
  status: z.enum(["sent_to_client", "client_changes_requested", "client_approved"]),
  designPlanStatus: optionalText,
  total: finiteMoney,
  subtotal: finiteMoney.optional(),
  gst: finiteMoney.optional(),
  lineItems: z.array(lineItemSchema),
  lead: z.object({
    projectName: z.string().optional(),
    location: z.string().optional(),
    clientName: z.string().optional()
  }).passthrough().nullable()
}).passthrough();

export type ClientEstimate = z.infer<typeof estimateSchema>;

const planPageSchema = z.object({
  id,
  uploadId: id,
  pageNumber: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  currentRevisionId: id,
  status: z.enum(["awaiting_review", "changes_requested", "revised", "approved"]),
  annotationDraft: z.object({ id, sourcePageId: id, version: z.number().int().nonnegative(), annotations: annotationDocumentSchema }).passthrough().nullable()
}).passthrough();

const planRequestSchema = z.object({
  id,
  sourcePageId: id,
  version: z.number().int().positive(),
  summary: z.string(),
  annotations: annotationDocumentSchema,
  status: z.enum(["open", "resolved", "withdrawn"]),
  targets: z.array(z.object({
    drawingId: id,
    requestedRevisionId: id,
    status: z.enum(["open", "replacement_submitted", "approved", "resolved", "withdrawn"]),
    resolvedByRevisionId: optionalText
  }).passthrough()),
  unassigned: z.boolean()
}).passthrough();

const planUploadSchema = z.object({
  id,
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  pageCount: z.number().int().nonnegative(),
  pages: z.array(planPageSchema)
}).passthrough();

const planWorkspaceSchema = z.object({
  uploads: z.array(planUploadSchema),
  pages: z.array(planPageSchema),
  openRequests: z.array(planRequestSchema)
}).passthrough();

export type ClientPlanPage = z.infer<typeof planPageSchema>;
export type ClientPlanRequest = z.infer<typeof planRequestSchema>;
export type ClientPlanWorkspace = z.infer<typeof planWorkspaceSchema>;

const cropSchema = z.object({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(), width: z.number().finite().positive(), height: z.number().finite().positive() }).passthrough();
const sourcePageSchema = z.object({
  id,
  uploadId: id,
  pageNumber: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
}).passthrough();
const drawingSchema = z.object({
  id,
  sourcePageId: id,
  displayTitle: z.string(),
  active: z.boolean()
}).passthrough();
const drawingRevisionSchema = z.object({
  id,
  drawingId: id,
  revisionNumber: z.number().int().positive(),
  sourcePageId: id,
  crop: cropSchema,
  reviewStatus: z.enum(["draft", "submitted", "approved", "changes_requested"]),
  changeSummary: optionalText,
  annotations: annotationDocumentSchema.nullish().transform((value) => value ?? null),
  annotationDraft: z.object({ id, revisionId: id, version: z.number().int().nonnegative(), annotations: annotationDocumentSchema }).passthrough().nullable()
}).passthrough();
const drawingWorkspaceSchema = z.object({
  uploads: z.array(z.object({ id, originalFilename: z.string(), mimeType: z.string() }).passthrough()),
  pages: z.array(sourcePageSchema),
  drawings: z.array(drawingSchema),
  revisions: z.array(drawingRevisionSchema),
  readiness: z.object({
    ready: z.boolean(),
    total: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    awaitingReview: z.number().int().nonnegative(),
    changesRequested: z.number().int().nonnegative()
  }).passthrough()
}).passthrough();

export type ClientDrawingWorkspace = z.infer<typeof drawingWorkspaceSchema>;
export type ClientDrawing = z.infer<typeof drawingSchema>;
export type ClientDrawingRevision = z.infer<typeof drawingRevisionSchema>;
export type ClientDrawingSourcePage = z.infer<typeof sourcePageSchema>;

const sectionRevisionSchema = z.object({
  id,
  sectionId: id,
  revisionNumber: z.number().int().positive(),
  reviewStatus: z.enum(["draft", "submitted", "approved", "rejected"]),
  rejectionComment: optionalText
}).passthrough();
const sectionSchema = z.object({
  id,
  label: z.string(),
  versionNumber: z.number().int().positive(),
  revision: sectionRevisionSchema,
  history: z.array(sectionRevisionSchema)
}).passthrough();
const sectionReviewSchema = z.object({
  projectId: id,
  progress: z.object({ approved: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(), awaitingReview: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).passthrough(),
  sections: z.array(sectionSchema)
}).passthrough();

export type ClientSectionReview = z.infer<typeof sectionReviewSchema>;
export type ClientSection = z.infer<typeof sectionSchema>;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiProtocolError();
  return result.data;
}

export function parseClientEstimates(value: unknown): readonly ClientEstimate[] {
  return parse(z.array(estimateSchema), value);
}

export function parseClientPlanWorkspace(value: unknown): ClientPlanWorkspace {
  const workspace = parse(planWorkspaceSchema, value);
  const pageIds = new Set(workspace.pages.map((page) => page.id));
  if (pageIds.size !== workspace.pages.length ||
    workspace.pages.some((page) => page.annotationDraft !== null && page.annotationDraft.sourcePageId !== page.id) ||
    workspace.uploads.some((upload) => upload.pageCount !== upload.pages.length || upload.pages.some((page) => page.uploadId !== upload.id || !pageIds.has(page.id)))) throw new ApiProtocolError();
  return workspace;
}

export function parseClientDrawingWorkspace(value: unknown): ClientDrawingWorkspace {
  const workspace = parse(drawingWorkspaceSchema, value);
  const pageIds = new Set(workspace.pages.map((page) => page.id));
  const drawingIds = new Set(workspace.drawings.map((drawing) => drawing.id));
  const revisionIds = new Set(workspace.revisions.map((revision) => revision.id));
  const latestByDrawing = new Map<string, ClientDrawingRevision>();
  for (const revision of workspace.revisions) {
    if (revision.reviewStatus === "draft") continue;
    const previous = latestByDrawing.get(revision.drawingId);
    if (!previous || revision.revisionNumber > previous.revisionNumber) latestByDrawing.set(revision.drawingId, revision);
  }
  if (pageIds.size !== workspace.pages.length || drawingIds.size !== workspace.drawings.length ||
    revisionIds.size !== workspace.revisions.length ||
    workspace.drawings.some((drawing) => !pageIds.has(drawing.sourcePageId) || latestByDrawing.get(drawing.id)?.sourcePageId !== drawing.sourcePageId) ||
    workspace.revisions.some((revision) => !drawingIds.has(revision.drawingId) ||
      (revision.annotationDraft !== null && revision.annotationDraft.revisionId !== revision.id))) throw new ApiProtocolError();
  return workspace;
}

export function parseClientSectionReview(value: unknown, projectId: string): ClientSectionReview {
  const review = parse(sectionReviewSchema, value);
  if (review.projectId !== projectId) throw new ApiProtocolError();
  return review;
}

export function estimatesForProject(estimates: readonly ClientEstimate[], projectId: string): readonly ClientEstimate[] {
  return estimates.filter((estimate) => estimate.projectId === projectId);
}

export function canDecideClientEstimate(estimate: ClientEstimate): boolean {
  return estimate.status === "sent_to_client";
}

export function canEditClientPlan(estimate: ClientEstimate): boolean {
  return estimate.status === "sent_to_client" || estimate.status === "client_changes_requested" ||
    (estimate.status === "client_approved" && estimate.designPlanStatus === "ready_for_client");
}

export function canViewClientPlan(estimate: ClientEstimate): boolean {
  return canEditClientPlan(estimate) ||
    (estimate.status === "client_approved" && estimate.designPlanStatus === "approved");
}
