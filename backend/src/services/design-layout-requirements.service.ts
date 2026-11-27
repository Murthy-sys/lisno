import { createHash } from "node:crypto";
import type { ClientSession } from "mongoose";
import { z } from "zod";
import { DESIGN_LAYOUT_LABELS, DESIGN_LAYOUT_TYPES, isDesignLayoutType, requiredDesignLayoutTypes, type ClassifyDesignLayoutCommand, type DesignLayoutClassification, type DesignLayoutRequirements, type DesignLayoutReviewSnapshot, type DesignLayoutType } from "../contracts/design-layout-requirements.js";
import type { ExecutionChoiceRecord, ExecutionChoiceSelection } from "../contracts/project-execution-choice.js";
import type { PreparedPlanDocuments } from "../contracts/estimate-plan-document.js";
import { deriveEstimateDesignUploadPurpose } from "../domain/estimate-design.js";
import { resolveDrawingPlacement, type PlanDocumentLineage } from "../domain/estimate-plan-document.js";
import { projectExecutionChoice } from "../domain/project-execution-choice.js";
import type { DesignWorkflowState } from "../domain/design-workflow-state.js";
import { ApiError } from "../middleware/errors.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { EstimateDesignUploadModel } from "../models/EstimateDesignUpload.js";
import { EstimateModel } from "../models/Estimate.js";
import { UserModel } from "../models/User.js";
import { ProjectModel } from "../models/Project.js";
import { DesignWorkflowStateModel } from "../models/DesignWorkflowState.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { loadEstimatePlanDocumentLineage } from "./estimate-plan-document-manifest.js";

type Row = Record<string, any>;
export const classifyDesignLayoutSchema = z.object({
  layoutType: z.enum(DESIGN_LAYOUT_TYPES),
  expectedDesignPlanVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(8).max(128)
}).strict();
export const designLayoutUploadSchema = z.object({ layoutType: z.enum(DESIGN_LAYOUT_TYPES).optional() }).strict();

export interface DesignLayoutChoiceContext {
  status: DesignLayoutRequirements["status"];
  choice: ExecutionChoiceSelection | null;
  record: ExecutionChoiceRecord | null;
  reason: string | null;
}

export async function loadDesignLayoutChoice(estimate: Row, session?: ClientSession): Promise<DesignLayoutChoiceContext> {
  const unavailable = (reason: string): DesignLayoutChoiceContext => ({ status: "unavailable", choice: null, record: null, reason });
  if (estimate.status !== "client_approved") return { status: "not_applicable", choice: null, record: null, reason: null };
  if (typeof estimate.projectId !== "string" || !estimate.projectId) return unavailable("The project's execution choice is unavailable. Refresh the project.");
  const project = await ProjectModel.findById(estimate.projectId).session(session ?? null).lean();
  if (!project) return unavailable("The project's execution choice is unavailable. Refresh the project.");
  const state = await DesignWorkflowStateModel.findById(estimate.projectId).select("+history").session(session ?? null).lean() as DesignWorkflowState | null;
  const view = projectExecutionChoice({ id: String(project._id), clientId: project.clientId ?? null, designWorkflowStages: project.designWorkflowStages }, state, { id: "", role: "designer" }, new Date());
  if (view.status === "unavailable") return unavailable(view.blockingReason ?? "The saved execution choice is unavailable. Refresh the project.");
  if (view.status !== "locked" || !state?.executionChoice || !view.selection) return { status: "waiting_for_choice", choice: null, record: null, reason: "Waiting for the Client to choose an execution path" };
  return { status: "selected", choice: view.selection, record: state.executionChoice, reason: null };
}

function conflict(message: string, code = "DESIGN_LAYOUT_CONFLICT"): never { throw new ApiError(409, code, message); }
function requireChoice(context: DesignLayoutChoiceContext) {
  if (context.status !== "selected" || !context.record) conflict(context.reason ?? "Waiting for the Client to choose an execution path", "DESIGN_LAYOUT_CHOICE_REQUIRED");
  return context.record;
}

export async function validateDesignLayoutUpload(estimate: Row, user: PublicUser, layoutType: unknown, occurredAt: Date, session?: ClientSession) {
  if (layoutType !== undefined && !isDesignLayoutType(layoutType)) throw new ApiError(400, "INVALID_LAYOUT_TYPE", "Choose a valid layout type.");
  if (estimate.status !== "client_approved") return {};
  if (user.role !== "designer" || String(estimate.designPlanDesignerId) !== user.id) throw new ApiError(403, "FORBIDDEN", "Only the assigned Designer can upload layouts.");
  const context = await loadDesignLayoutChoice(estimate, session);
  const choice = requireChoice(context);
  if (!isDesignLayoutType(layoutType)) throw new ApiError(400, "DESIGN_LAYOUT_TYPE_REQUIRED", "Choose the layout type for this upload.");
  if (!requiredDesignLayoutTypes(choice.optionId).includes(layoutType)) throw new ApiError(400, "DESIGN_LAYOUT_TYPE_NOT_ALLOWED", "This execution choice accepts only 3D layouts.");
  return { layoutType, layoutClassification: {
    classifiedAt: occurredAt.toISOString(), classifiedById: user.id,
    choiceHistoryEventId: choice.historyEventId, choiceDefinitionVersion: choice.definitionVersion
  } satisfies DesignLayoutClassification };
}

function rootRevisions(uploadId: string, lineage: PlanDocumentLineage) {
  const drawingIds = new Set(lineage.drawings.filter(row => String(row.uploadId) === uploadId).map(row => String(row._id)));
  const pageIds = new Set(lineage.pages.filter(row => String(row.uploadId) === uploadId).map(row => String(row._id)));
  return lineage.revisions.filter(row => drawingIds.has(String(row.drawingId)) || pageIds.has(String(row.sourcePageId)));
}

function roundContainsRoot(round: Row, uploadId: string, revisions: readonly Row[]) {
  return (
    (round.attachments ?? []).some((item: Row) => String(item.uploadId) === uploadId) ||
    revisions.some(revision => (round.submittedRevisionIds ?? []).includes(String(revision._id)))
  );
}

function protectedRoot(uploadId: string, lineage: PlanDocumentLineage, rounds: readonly Row[] = []) {
  const revisions = rootRevisions(uploadId, lineage);
  return revisions.some(row => row.reviewStatus === "approved") || rounds.some(round => round.status === "approved" && roundContainsRoot(round, uploadId, revisions));
}

export function layoutClassificationAvailability(user: PublicUser, estimate: Row, upload: Row, lineage: PlanDocumentLineage, context: DesignLayoutChoiceContext, rounds: readonly Row[] = []) {
  let reason: string | null = null;
  if (isDesignLayoutType(upload.layoutType)) reason = "The saved layout type cannot be changed.";
  else if (upload.layoutType != null || upload.layoutClassification != null) reason = "The saved layout classification is inconsistent. Refresh the project.";
  else if (user.role !== "designer" || String(estimate.designPlanDesignerId) !== user.id || estimate.status !== "client_approved") reason = "Only the assigned Designer can label draft layouts.";
  else if (upload.deletedAt || String(upload.estimateId) !== String(estimate._id) || deriveEstimateDesignUploadPurpose(upload) !== "ordinary") reason = "Only an existing original draft can be labeled.";
  else if (estimate.designFrozenAt || !["assigned", "in_progress", "changes_requested"].includes(String(estimate.designPlanStatus))) reason = "This design is read-only.";
  else if (protectedRoot(String(upload._id), lineage, rounds)) reason = "Approved designs cannot be labeled.";
  else if (rounds.some(round => round.status === "pending" && roundContainsRoot(round, String(upload._id), rootRevisions(String(upload._id), lineage)))) reason = "This file is locked in a submitted review.";
  else if (context.status !== "selected") reason = context.reason ?? "The execution choice is unavailable.";
  return { canClassifyLayoutType: reason === null, classificationBlockedReason: reason };
}

function latestRevision(lineage: PlanDocumentLineage, drawingId: string) {
  return lineage.revisions.filter(row => String(row.drawingId) === drawingId).sort((a, b) => Number(b.revisionNumber) - Number(a.revisionNumber))[0];
}

/** Replacement uploads inherit the original root, including older replacement records. */
export function uploadLayoutType(upload: Row, lineage?: PlanDocumentLineage): DesignLayoutType | null {
  if (deriveEstimateDesignUploadPurpose(upload) === "ordinary") return isDesignLayoutType(upload.layoutType) ? upload.layoutType : null;
  if (!lineage) return isDesignLayoutType(upload.layoutType) ? upload.layoutType : null;
  const targetIds: string[] = upload.replacementDrawingId ? [String(upload.replacementDrawingId)] :
    (upload.planRequestReplacement?.targets ?? []).map((target: Row) => String(target.drawingId));
  const types = new Set<DesignLayoutType | null>();
  for (const id of targetIds) {
    const drawing = lineage.drawings.find(row => String(row._id) === id);
    const revision = latestRevision(lineage, id);
    if (!drawing || !revision) conflict("The original layout lineage is missing. Refresh the project.");
    const root = resolveDrawingPlacement(lineage, drawing, String(revision._id)).originUpload;
    types.add(isDesignLayoutType(root.layoutType) ? root.layoutType : null);
  }
  if (types.size !== 1) conflict("The replacement layout lineage is inconsistent. Refresh the project.");
  const type = [...types][0]!;
  if (upload.layoutType != null && upload.layoutType !== type) conflict("The replacement layout type does not match its original upload.");
  return type;
}

export function projectDesignLayoutRequirements(estimate: Row, lineage: PlanDocumentLineage, context: DesignLayoutChoiceContext, rounds: readonly Row[] = []): DesignLayoutRequirements {
  const base: DesignLayoutRequirements = { status: context.status, choice: context.choice, designPlanVersion: Number(estimate.designPlanVersion ?? 0),
    allowedTypes: [], requiredTypes: [], coverage: [], unclassifiedUploadIds: [], missingTypes: [], coverageComplete: context.status === "not_applicable",
    blockingReasons: context.reason ? [context.reason] : [], revisionKey: "" };
  const identity = () => createHash("sha256").update(JSON.stringify({ context, version: base.designPlanVersion,
    uploads: lineage.uploads.map(row => [row._id, row.deletedAt, row.layoutType, row.layoutClassification, row.extractionStatus]),
    drawings: lineage.drawings.map(row => [row._id, row.uploadId, row.active, row.deletedAt, row.verified]),
    revisions: lineage.revisions.map(row => [row._id, row.drawingId, row.revisionNumber, row.sourcePageId, row.reviewStatus, row.replacesRevisionId]),
    rounds: rounds.map(row => [row._id, row.status]) })).digest("hex");
  if (context.status !== "selected" || !context.record) return { ...base, revisionKey: identity() };
  const required = requiredDesignLayoutTypes(context.record.optionId);
  base.allowedTypes = required; base.requiredTypes = required;
  const originals = lineage.uploads.filter(row => !row.deletedAt && deriveEstimateDesignUploadPurpose(row) === "ordinary" && String(row.estimateId) === lineage.estimateId);
  const qualifying = new Map<DesignLayoutType, Set<string>>(required.map(type => [type, new Set()]));
  const blockers = new Set<string>();
  const unclassified = new Set<string>();
  for (const upload of originals) {
    if (!isDesignLayoutType(upload.layoutType)) {
      if (!protectedRoot(String(upload._id), lineage, rounds)) unclassified.add(String(upload._id));
    } else if (!required.includes(upload.layoutType)) blockers.add("Remove unapproved layouts that are not allowed by the Client's execution choice.");
    else if (!upload.layoutClassification || upload.layoutClassification.choiceHistoryEventId !== context.record.historyEventId || upload.layoutClassification.choiceDefinitionVersion !== context.record.definitionVersion) blockers.add("A saved layout classification does not match the Client's execution choice. Refresh the project.");
  }
  try {
    for (const drawing of lineage.drawings.filter(row => row.active && !row.deletedAt)) {
      const revision = latestRevision(lineage, String(drawing._id));
      if (!revision) conflict("An active drawing has no current revision.");
      const placement = resolveDrawingPlacement(lineage, drawing, String(revision._id));
      const root = placement.originUpload;
      if (root.deletedAt || placement.sourceUpload.deletedAt) conflict("A drawing references a deleted layout.");
      if (!isDesignLayoutType(root.layoutType)) continue;
      if (!required.includes(root.layoutType)) continue;
      if (placement.sourceUpload.layoutType != null && placement.sourceUpload.layoutType !== root.layoutType) conflict("A replacement layout has a different type from its original.");
      if (Number(root.sizeBytes) <= 0 || [root, placement.sourceUpload].some(row => !["estimator_review", "submitted", "changes_requested", "approved"].includes(String(row.extractionStatus)))) continue;
      if (root.layoutClassification?.choiceHistoryEventId !== context.record.historyEventId || root.layoutClassification?.choiceDefinitionVersion !== context.record.definitionVersion) continue;
      qualifying.get(root.layoutType)!.add(String(root._id));
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    blockers.add("The current layout lineage is unavailable. Refresh the project before submitting.");
  }
  base.unclassifiedUploadIds = [...unclassified].sort();
  if (unclassified.size) blockers.add("Label existing draft files before submitting for Client review.");
  base.coverage = required.map(layoutType => {
    const uploads = originals.filter(row => row.layoutType === layoutType);
    const ids = [...qualifying.get(layoutType)!].sort();
    return { layoutType, uploadIds: uploads.map(row => String(row._id)).sort(), qualifyingUploadIds: ids,
      state: uploads.some(row => ["queued", "processing"].includes(String(row.extractionStatus))) ? "processing" :
        ids.length ? "ready" : uploads.length ? "review_pending" : "missing" };
  });
  base.missingTypes = required.filter(type => !qualifying.get(type)!.size);
  for (const type of base.missingTypes) blockers.add(`${DESIGN_LAYOUT_LABELS[type]} is required before Client review.`);
  base.blockingReasons = [...blockers];
  base.coverageComplete = !base.missingTypes.length && !blockers.size;
  return { ...base, revisionKey: identity() };
}

export async function loadDesignLayoutState(estimate: Row, session?: ClientSession, givenLineage?: PlanDocumentLineage) {
  const context = await loadDesignLayoutChoice(estimate, session);
  const lineage = givenLineage ?? await loadEstimatePlanDocumentLineage(String(estimate._id), session);
  const rounds = estimate.status === "client_approved" ? await DesignPlanReviewRoundModel.find({ estimateId: estimate._id, status: { $in: ["pending", "approved"] } }).session(session ?? null).lean() : [];
  return { context, lineage, rounds, requirements: projectDesignLayoutRequirements(estimate, lineage, context, rounds) };
}

export async function assertDesignLayoutSubmission(estimate: Row, session: ClientSession, documents?: PreparedPlanDocuments): Promise<DesignLayoutReviewSnapshot | null> {
  if (estimate.status !== "client_approved") return null;
  const { context, lineage, requirements } = await loadDesignLayoutState(estimate, session);
  const choice = requireChoice(context);
  if (!requirements.coverageComplete) conflict(requirements.blockingReasons[0] ?? "Upload all required layouts before Client review.", "DESIGN_LAYOUTS_INCOMPLETE");
  const snapshot: DesignLayoutReviewSnapshot = { version: 1, choice: structuredClone(choice), requiredTypes: requirements.requiredTypes, layouts: [] };
  for (const coverage of requirements.coverage) for (const sourceUploadId of coverage.qualifyingUploadIds) {
    const document = documents?.documents.find(item => item.sourceUploadId === sourceUploadId);
    if (documents && (!document || document.manifest.layoutType !== coverage.layoutType || document.manifest.layoutClassification?.choiceHistoryEventId !== choice.historyEventId)) conflict("The prepared layout documents changed. Prepare the updated PDFs again.", "DESIGN_PLAN_DOCUMENT_STALE");
    const drawings = lineage.drawings.filter(row => row.active && !row.deletedAt && String(row.uploadId) === sourceUploadId);
    snapshot.layouts.push({ layoutType: coverage.layoutType, sourceUploadId, drawingIds: drawings.map(row => String(row._id)).sort(),
      revisionIds: drawings.map(row => String(latestRevision(lineage, String(row._id))!._id)).sort(),
      documentId: document?.documentId ?? "", manifestHash: document?.manifestHash ?? "" });
  }
  return snapshot;
}

export async function requireReplacementLayout(estimate: Row, drawingIds: string[], session?: ClientSession) {
  if (estimate.status !== "client_approved") return {};
  const { context, lineage, rounds } = await loadDesignLayoutState(estimate, session);
  const choice = requireChoice(context);
  const roots = drawingIds.map(id => {
    const drawing = lineage.drawings.find(row => String(row._id) === id);
    const revision = latestRevision(lineage, id);
    if (!drawing || !revision) conflict("The original layout lineage is missing.");
    return resolveDrawingPlacement(lineage, drawing, String(revision._id)).originUpload;
  });
  if (!roots.length || new Set(roots.map(row => String(row._id))).size !== 1) conflict("The replacement must refer to one original layout.");
  const root = roots[0]!;
  if (!isDesignLayoutType(root.layoutType)) {
    if (root.layoutType != null || !protectedRoot(String(root._id), lineage, rounds)) conflict("Label the original draft layout before uploading its replacement.", "DESIGN_LAYOUT_CLASSIFICATION_REQUIRED");
    return {};
  }
  if (!requiredDesignLayoutTypes(choice.optionId).includes(root.layoutType) || root.layoutClassification?.choiceHistoryEventId !== choice.historyEventId) conflict("The original layout type does not match the Client's execution choice.");
  return { layoutType: root.layoutType, layoutClassification: root.layoutClassification };
}

export async function classifyExistingDesignLayout(input: { user: PublicUser; uploadId: string; command: ClassifyDesignLayoutCommand; audit: AuditService; occurredAt: Date;
  transaction: (work: (session: ClientSession) => Promise<void>) => Promise<void>; guardLifecycle: (estimate: Row, session: ClientSession) => Promise<void> }) {
  const command = classifyDesignLayoutSchema.parse(input.command);
  let saved: Row | null = null;
  await input.transaction(async session => {
    saved = null;
    if (input.user.role !== "designer" || !await UserModel.findOne({ _id: input.user.id, role: "designer", active: true, deletedAt: null }).session(session).lean()) throw new ApiError(403, "FORBIDDEN", "An active Designer is required.");
    const upload = await EstimateDesignUploadModel.findById(input.uploadId).session(session).lean();
    const estimate = upload ? await EstimateModel.findOne({ _id: upload.estimateId, status: "client_approved", designPlanDesignerId: input.user.id }).session(session).lean() : null;
    if (!upload || !estimate || upload.deletedAt) throw new ApiError(404, "ESTIMATE_DESIGN_UPLOAD_NOT_FOUND", "Uploaded design not found.");
    if (upload.layoutClassificationCommand) {
      const previous = upload.layoutClassificationCommand;
      if (previous.idempotencyKey === command.idempotencyKey && previous.expectedDesignPlanVersion === command.expectedDesignPlanVersion &&
        upload.layoutType === command.layoutType && upload.layoutClassification?.classifiedById === input.user.id) { saved = upload; return; }
      conflict("The layout type has already been saved and cannot be changed.");
    }
    if (Number(estimate.designPlanVersion ?? 0) !== command.expectedDesignPlanVersion) conflict("The design plan changed. Refresh before labeling this file.", "DESIGN_PLAN_VERSION_CONFLICT");
    const state = await loadDesignLayoutState(estimate, session);
    const availability = layoutClassificationAvailability(input.user, estimate, upload, state.lineage, state.context, state.rounds);
    if (!availability.canClassifyLayoutType) conflict(availability.classificationBlockedReason!);
    const metadata = await validateDesignLayoutUpload(estimate, input.user, command.layoutType, input.occurredAt, session);
    await input.guardLifecycle(estimate, session);
    const result = await EstimateDesignUploadModel.findOneAndUpdate({ _id: upload._id, estimateId: estimate._id, deletedAt: null,
      layoutType: null, layoutClassification: null, layoutClassificationCommand: null }, { $set: { ...metadata,
      layoutClassificationCommand: { idempotencyKey: command.idempotencyKey, expectedDesignPlanVersion: command.expectedDesignPlanVersion } } }, { session, returnDocument: "after", runValidators: true }).lean();
    if (!result) conflict("The layout type was saved by another request. Refresh the project.");
    await input.audit.appendInMongoTransaction({ actorId: input.user.id, action: "estimate_design_layout_classified", entityType: "estimate", entityId: String(estimate._id), occurredAt: input.occurredAt.toISOString(),
      newValues: { uploadId: input.uploadId, layoutType: command.layoutType, choiceHistoryEventId: metadata.layoutClassification!.choiceHistoryEventId, designPlanVersion: command.expectedDesignPlanVersion } }, session);
    saved = result;
  });
  return saved! as Row;
}
