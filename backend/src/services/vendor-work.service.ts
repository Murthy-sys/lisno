import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import mongoose, { type ClientSession } from "mongoose";
import type { ZodType } from "zod";
import {
  clientVendorWorkDecisionSchema, mayUpdateVendorWork, nextVendorWorkProgressStatus,
  vendorWorkAssignmentId, vendorWorkProgressSchema, vendorWorkReviewId, vendorWorkSubmitSchema,
  vendorWorkUploadSchema, vendorWorkQuerySchema, clientVendorWorkQuerySchema,
  type ClientVendorWorkDecisionInput, type ClientVendorWorkQuery, type VendorWorkProgressInput,
  type VendorWorkStatus, type VendorWorkSubmitInput, type VendorWorkUploadInput
} from "../domain/vendor-work.js";
import type { ApprovedPurchaseOrderLine } from "../domain/project-purchase-order.js";
import { projectWorkflowSectionLabel } from "../domain/project-workflow.js";
import { ApiError } from "../middleware/errors.js";
import type { ValidatedUpload } from "../middleware/upload.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { SiteCompletionReviewModel } from "../models/SiteCompletionReview.js";
import { SiteCompletionStateModel } from "../models/SiteCompletionState.js";
import { UserModel } from "../models/User.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { VendorWorkImageModel } from "../models/VendorWorkImage.js";
import { VendorWorkImageCleanupJobModel } from "../models/VendorWorkImageCleanupJob.js";
import { VendorWorkReviewModel } from "../models/VendorWorkReview.js";
import type { FileStorage } from "../storage/storage.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { vendorActivation } from "./vendor-readiness.service.js";
import { createWorkflowEvidenceStorage } from "./workflow-evidence-storage.js";
import { isSiteVerifiedAssignment } from "./site-completion-progress.js";

type Row = Record<string, any>;
type Page<T> = { items: T[]; total: number };
type VendorPage<T> = Page<T> & { limit: number; offset: number };
type ClientReviewPage<T> = VendorPage<T> & { pendingTotal: number };
const MAX_IMAGES_PER_ROUND = 20;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface VendorWorkTaskDto {
  id: string; projectId: string; vendorId: string; orderId: string; orderRevision: number;
  lineId: string; sourceSectionId: string; sectionLabel: string; sourceLineItemKey: string; roomName: string;
  itemName: string; scopeType: "supply" | "execution" | "supply_and_execution";
  description: string; targetDate: string; deliveryLocation: string;
  status: VendorWorkStatus; version: number; progress: number; displayProgress: number;
  progressSource: "vendor" | "site_manager"; currentRound: number;
  note: string; requestedChangeReason: string | null; imageCount: number;
  imageIds: string[];
  submittedAt: string | null; acceptedAt: string | null;
}

export interface ClientVendorWorkReviewDto {
  id: string; projectId: string; assignmentId: string; round: number; status: "pending" | "approved" | "changes_requested";
  version: number; roomName: string; itemName: string; scopeType: string; description: string;
  sourceSectionId: string; sectionLabel: string; note: string; progress: number; submittedAt: string;
  imageIds: string[]; decision: { decision: "approve" | "request_changes"; reason: string | null; decidedAt: string } | null;
}

export interface VendorWorkCompletionSnapshot {
  totalAssignments: number;
  approvedAssignments: number;
  pendingAssignments: number;
  openReviews: number;
  assignments: Array<{ id: string; orderId: string; orderRevision: number; lineId: string; sourceSectionId: string; sourceLineItemKey: string; status: VendorWorkStatus }>;
}

export interface VendorWorkService {
  authorizeVendor(actor: PublicUser): Promise<void>;
  listMine(actor: PublicUser, query?: { limit?: number; offset?: number }): Promise<VendorPage<VendorWorkTaskDto>>;
  getMine(actor: PublicUser, assignmentId: string): Promise<VendorWorkTaskDto>;
  progress(actor: PublicUser, assignmentId: string, input: VendorWorkProgressInput): Promise<VendorWorkTaskDto>;
  uploadImage(actor: PublicUser, assignmentId: string, input: VendorWorkUploadInput, file: ValidatedUpload): Promise<VendorWorkTaskDto>;
  submit(actor: PublicUser, assignmentId: string, input: VendorWorkSubmitInput): Promise<ClientVendorWorkReviewDto>;
  clientReviews(actor: PublicUser, projectId: string, query?: ClientVendorWorkQuery): Promise<ClientReviewPage<ClientVendorWorkReviewDto>>;
  clientDecision(actor: PublicUser, projectId: string, reviewId: string, input: ClientVendorWorkDecisionInput): Promise<ClientVendorWorkReviewDto>;
  projectProgress(actor: PublicUser, projectId: string): Promise<{ projectId: string; assignments: VendorWorkTaskDto[]; pendingOwner: "site_manager" | "vendor" | "client" | "super_admin" | "none" }>;
  image(actor: PublicUser, projectId: string, assignmentId: string, imageId: string, signal?: AbortSignal): Promise<{ mimeType: string; byteSize: number; stream: Readable }>;
  cleanupImages(): Promise<{ deleted: number; failed: number }>;
}

function conflict(message = "Vendor work changed. Reload it before continuing."): never {
  throw new ApiError(409, "VENDOR_WORK_VERSION_CONFLICT", message);
}
function missing(): never { throw new ApiError(404, "NOT_FOUND", "The requested work item was not found."); }
function forbidden(): never { throw new ApiError(403, "FORBIDDEN", "You are not authorized for this project work."); }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function validated<T>(schema: ZodType<T, any, any>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.");
  return result.data;
}
async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(work, { readConcern: { level: "snapshot" }, readPreference: "primary" });
}
async function storedActor(actor: PublicUser, session: ClientSession): Promise<Row> {
  const user = await UserModel.findById(actor.id).select({ role: 1, vendorId: 1, active: 1 }).session(session).lean() as Row | null;
  if (!user?.active || user.role !== actor.role || actor.role === "vendor" && (user.vendorId !== actor.vendorId || !user.vendorId)) forbidden();
  return user;
}
async function activeVendorActor(actor: PublicUser, session: ClientSession): Promise<string> {
  const user = await storedActor(actor, session);
  if (user.role !== "vendor" || typeof user.vendorId !== "string") forbidden();
  const vendor = await AiEstimatorKnowledgeVendorModel.findById(user.vendorId).session(session).lean() as Row | null;
  if (!vendor || (await vendorActivation(vendor, session)).effectiveStatus !== "active") throw new ApiError(403, "VENDOR_WORK_ACCESS_BLOCKED", "Vendor access is unavailable while the vendor is not active.");
  return user.vendorId;
}
async function requireVendorAssignment(actor: PublicUser, assignmentId: string, session: ClientSession): Promise<Row> {
  const vendorId = await activeVendorActor(actor, session);
  const assignment = await VendorWorkAssignmentModel.findOne({ _id: assignmentId, vendorId }).session(session).lean() as Row | null;
  if (!assignment) missing();
  const order = await ProjectPurchaseOrderModel.findOne({ _id: assignment.orderId, projectId: assignment.projectId, vendorId, approvedRevision: assignment.orderRevision, approvedRevisionId: { $ne: null }, cancelledAt: null }).select({ _id: 1 }).session(session).lean();
  if (!order || assignment.status === "superseded") missing();
  return assignment;
}
async function requireEditableVendorProject(projectId: string, session: ClientSession, submission = false): Promise<void> {
  const project = await ProjectModel.findById(projectId).select({ status: 1 }).session(session).lean() as Row | null;
  if (!project || project.status !== "active") throw new ApiError(409, "PROJECT_COMPLETED", "This project no longer accepts vendor work changes.");
  const site = await SiteCompletionStateModel.findById(projectId).select({ status: 1, currentRound: 1 }).session(session).lean() as Row | null;
  if (site && (["pending_client", "client_approved"].includes(site.status) || submission && site.currentRound > 0)) {
    throw new ApiError(409, "SITE_COMPLETION_IN_REVIEW", "The Site Manager controls the current Client completion review.");
  }
}
async function requireClientProject(actor: PublicUser, projectId: string, session: ClientSession): Promise<Row> {
  await storedActor(actor, session);
  if (actor.role !== "client") forbidden();
  const project = await ProjectModel.findOne({ _id: projectId, clientId: actor.id }).select({ _id: 1, clientId: 1 }).session(session).lean() as Row | null;
  if (!project) missing();
  return project;
}
async function requireProgressProject(actor: PublicUser, projectId: string, session: ClientSession): Promise<void> {
  await storedActor(actor, session);
  const project = await ProjectModel.findById(projectId).select({ _id: 1, clientId: 1 }).session(session).lean() as Row | null;
  if (!project) missing();
  if (actor.role === "super_admin") return;
  if (actor.role === "client" && project.clientId === actor.id) return;
  if (actor.role === "site_manager" || actor.role === "procurement") {
    const task = await ProjectWorkflowTaskModel.exists({ projectId, kind: actor.role === "site_manager" ? "site_execution" : "procurement", assigneeRole: actor.role, assigneeUserId: actor.id }).session(session);
    if (task) return;
  }
  forbidden();
}
function taskDto(assignment: Row, imageCount: number, requestedChangeReason: string | null = null): VendorWorkTaskDto {
  return {
    id: String(assignment._id), projectId: String(assignment.projectId), vendorId: String(assignment.vendorId),
    orderId: String(assignment.orderId), orderRevision: Number(assignment.orderRevision), lineId: String(assignment.lineId),
    sourceSectionId: String(assignment.sourceSectionId), sectionLabel: projectWorkflowSectionLabel(String(assignment.sourceSectionId)), sourceLineItemKey: String(assignment.sourceLineItemKey),
    roomName: String(assignment.roomName), itemName: String(assignment.itemName), scopeType: assignment.scopeType,
    description: String(assignment.description), targetDate: String(assignment.targetDate), deliveryLocation: String(assignment.deliveryLocation),
    status: assignment.status, version: Number(assignment.version),
    progress: Number(assignment.progress), displayProgress: Number(assignment.progress), progressSource: "vendor",
    currentRound: Number(assignment.currentRound), note: String(assignment.note),
    requestedChangeReason, imageCount, imageIds: [], submittedAt: assignment.submittedAt?.toISOString() ?? null,
    acceptedAt: assignment.acceptedAt?.toISOString() ?? null
  };
}
async function taskDtoInSession(assignment: Row, session: ClientSession, siteState?: Row | null): Promise<VendorWorkTaskDto> {
  const images = await VendorWorkImageModel.find({ assignmentId: assignment._id, round: assignment.currentRound })
    .select({ _id: 1 }).sort({ uploadedAt: 1, _id: 1 }).session(session).lean();
  const prior = assignment.status === "changes_requested"
    ? await VendorWorkReviewModel.findOne({ assignmentId: assignment._id, round: assignment.currentRound - 1, status: "changes_requested" }).select({ decision: 1 }).session(session).lean() as Row | null
    : null;
  const dto = taskDto(assignment, images.length, prior?.decision?.reason ?? null);
  const site = siteState === undefined
    ? await SiteCompletionStateModel.findById(assignment.projectId)
      .select({ progress: 1, updatedAt: 1, verifiedAssignmentIds: 1 }).session(session).lean() as Row | null
    : siteState;
  if (isSiteVerifiedAssignment(site, assignment)) {
    dto.displayProgress = 100;
    dto.progressSource = "site_manager";
  }
  dto.imageIds = images.map(image => String(image._id));
  if (dto.status === "awaiting_vendor_access" && await UserModel.exists({ role: "vendor", vendorId: dto.vendorId, active: true }).session(session)) dto.status = "ready";
  return dto;
}
function reviewDto(review: Row, assignment: Row): ClientVendorWorkReviewDto {
  return {
    id: String(review._id), projectId: String(review.projectId), assignmentId: String(review.assignmentId),
    round: Number(review.round), status: review.status, version: Number(review.version),
    roomName: String(assignment.roomName), itemName: String(assignment.itemName), scopeType: String(assignment.scopeType),
    description: String(assignment.description), sourceSectionId: String(assignment.sourceSectionId), sectionLabel: projectWorkflowSectionLabel(String(assignment.sourceSectionId)),
    note: String(review.note), progress: Number(review.progress), submittedAt: review.submittedAt.toISOString(),
    imageIds: [...review.imageIds],
    decision: review.decision ? { decision: review.decision.decision, reason: review.decision.reason ?? null, decidedAt: review.decision.decidedAt.toISOString() } : null
  };
}
async function appendAudit(audit: AuditService, actorId: string, action: "vendor_work_progress_updated" | "vendor_work_media_uploaded" | "vendor_work_submitted" | "client_vendor_work_decided", entityId: string, projectId: string, session: ClientSession, at: Date, fields: Record<string, unknown>, reason?: string | null): Promise<void> {
  await audit.appendInMongoTransaction({ actorId, action, entityType: "vendor_work", entityId, occurredAt: at.toISOString(), newValues: { projectId, ...fields }, reason: reason ?? null }, session);
}

/** Called from the PO approval transaction before the order header becomes approved. */
export async function onPurchaseOrderApproved(approval: { orderId: string; projectId: string; vendorId: string; revision: number; lines: readonly ApprovedPurchaseOrderLine[] }, session: ClientSession): Promise<void> {
  if (approval.lines.length === 0 || new Set(approval.lines.map(line => line.id)).size !== approval.lines.length) throw new ApiError(409, "VENDOR_WORK_SOURCE_CONFLICT", "The approved order contains inconsistent work lines.");
  const existing = await VendorWorkAssignmentModel.find({ orderId: approval.orderId, orderRevision: { $lt: approval.revision }, status: { $ne: "superseded" } }).session(session).lean() as Row[];
  if (existing.some(row => !["awaiting_vendor_access", "ready"].includes(row.status))) throw new ApiError(409, "VENDOR_WORK_AMENDMENT_RECONCILIATION_REQUIRED", "Vendor work already started. Reconcile it before approving an amended order.");
  if (existing.length) {
    const ids = existing.map(row => row._id);
    const image = await VendorWorkImageModel.exists({ assignmentId: { $in: ids } }).session(session);
    const review = await VendorWorkReviewModel.exists({ assignmentId: { $in: ids } }).session(session);
    if (image || review) throw new ApiError(409, "VENDOR_WORK_AMENDMENT_RECONCILIATION_REQUIRED", "Vendor work evidence or client review already exists. Reconcile it before approving an amended order.");
  }
  if (existing.length) await VendorWorkAssignmentModel.updateMany({ _id: { $in: existing.map(row => row._id) }, status: { $in: ["awaiting_vendor_access", "ready"] } }, { $set: { status: "superseded" }, $inc: { version: 1 } }, { session });
  const member = await UserModel.exists({ role: "vendor", vendorId: approval.vendorId, active: true }).session(session);
  const sameRevision = await VendorWorkAssignmentModel.find({ orderId: approval.orderId, orderRevision: approval.revision }).select({ _id: 1 }).session(session).lean();
  const expectedIds = new Set(approval.lines.map(line => vendorWorkAssignmentId(approval.orderId, approval.revision, line.id)));
  if (sameRevision.some(row => !expectedIds.has(String(row._id)))) throw new ApiError(409, "VENDOR_WORK_SOURCE_CONFLICT", "An existing work assignment does not match this approved order revision.");
  for (const line of approval.lines) {
    if (line.estimateId.length === 0 || line.sourceLineItemKey.length === 0 || line.sourceSectionId.length === 0) throw new ApiError(409, "VENDOR_WORK_SOURCE_CONFLICT", "An approved line is missing its estimate section lineage.");
    const id = vendorWorkAssignmentId(approval.orderId, approval.revision, line.id);
    const snapshot = { projectId: approval.projectId, vendorId: approval.vendorId, orderId: approval.orderId, orderRevision: approval.revision, lineId: line.id,
      procurementItemId: line.procurementItemId, estimateId: line.estimateId, estimateVersion: line.estimateVersion, estimateReviewRoundId: line.estimateReviewRoundId,
      sourceSectionId: line.sourceSectionId, sourceLineItemKey: line.sourceLineItemKey, roomName: line.roomName, itemName: line.itemName,
      scopeType: line.scopeType, description: line.description, targetDate: line.targetDate, deliveryLocation: line.deliveryLocation };
    await VendorWorkAssignmentModel.updateOne({ _id: id }, { $setOnInsert: { _id: id, ...snapshot, status: member ? "ready" : "awaiting_vendor_access", version: 1, progress: 0, currentRound: 1, note: "", receipts: [] } }, { upsert: true, session });
    const stored = await VendorWorkAssignmentModel.findById(id).session(session).lean() as Row | null;
    if (!stored || Object.entries(snapshot).some(([key, value]) => stored[key] !== value)) throw new ApiError(409, "VENDOR_WORK_SOURCE_CONFLICT", "An existing work assignment does not match this approved order.");
  }
}

/** Final closure reads this inside its own transaction and combines it with scope/PO checks. */
export async function readVendorWorkCompletion(projectId: string, session: ClientSession): Promise<VendorWorkCompletionSnapshot> {
  const rows = await VendorWorkAssignmentModel.find({ projectId, status: { $ne: "superseded" } }).sort({ _id: 1 }).session(session).lean() as Row[];
  let approvedAssignments = 0; let openReviews = 0;
  for (const row of rows) {
    const order = await ProjectPurchaseOrderModel.findOne({ _id: row.orderId, projectId, approvedRevision: row.orderRevision, approvedRevisionId: { $ne: null }, cancelledAt: null }).select({ _id: 1 }).session(session).lean();
    if (!order) throw new ApiError(409, "VENDOR_WORK_LINEAGE_CONFLICT", "An active vendor assignment has no current approved order.");
    const latestRound = row.status === "changes_requested" ? row.currentRound - 1 : row.currentRound;
    const review = await VendorWorkReviewModel.findOne({ assignmentId: row._id, round: latestRound }).session(session).lean() as Row | null;
    if (row.status === "client_approved") {
      if (!review || review.status !== "approved" || !review.decision || review.decision.decision !== "approve") throw new ApiError(409, "VENDOR_WORK_LINEAGE_CONFLICT", "Client acceptance is missing or inconsistent.");
      approvedAssignments++;
    } else if (row.status === "submitted_for_client") {
      if (!review || review.status !== "pending") throw new ApiError(409, "VENDOR_WORK_LINEAGE_CONFLICT", "The client review task is missing or inconsistent.");
      openReviews++;
    } else if (row.status === "changes_requested" && (!review || review.status !== "changes_requested")) throw new ApiError(409, "VENDOR_WORK_LINEAGE_CONFLICT", "The change request history is missing.");
    else if (["ready", "awaiting_vendor_access", "in_progress"].includes(row.status) && review && review.status === "pending") throw new ApiError(409, "VENDOR_WORK_LINEAGE_CONFLICT", "A pending client review exists for editable vendor work.");
  }
  return { totalAssignments: rows.length, approvedAssignments, pendingAssignments: rows.length - approvedAssignments, openReviews,
    assignments: rows.map(row => ({ id: String(row._id), orderId: String(row.orderId), orderRevision: Number(row.orderRevision), lineId: String(row.lineId), sourceSectionId: String(row.sourceSectionId), sourceLineItemKey: String(row.sourceLineItemKey), status: row.status })) };
}

export function createVendorWorkService(input: { audit: AuditService; storage: FileStorage; maxUploadBytes: number; now?: () => Date }): VendorWorkService {
  const now = input.now ?? (() => new Date());
  const evidence = createWorkflowEvidenceStorage(input.storage);
  async function deleteOrQueue(reference: string): Promise<void> {
    try {
      // A commit can succeed even if its acknowledgement is lost. Never remove
      // an object that a durable image record already publishes.
      if (await VendorWorkImageModel.exists({ storageReference: reference })) return;
      await input.storage.delete(reference);
    }
    catch {
      await VendorWorkImageCleanupJobModel.updateOne({ _id: reference }, {
        $setOnInsert: { _id: reference, status: "pending", attempts: 0, retryAt: now(), lastErrorCode: "STORAGE_DELETE_FAILED" }
      }, { upsert: true });
    }
  }
  return {
    authorizeVendor(actor) {
      return transaction(async session => { await activeVendorActor(actor, session); });
    },
    listMine(actor, query = {}) {
      return transaction(async session => {
        const vendorId = await activeVendorActor(actor, session);
        const { limit, offset } = validated(vendorWorkQuerySchema, query);
        const rows = await VendorWorkAssignmentModel.find({ vendorId, status: { $ne: "superseded" } }).sort({ targetDate: 1, _id: 1 }).skip(offset).limit(limit).session(session).lean() as Row[];
        const items: VendorWorkTaskDto[] = [];
        const siteByProject = new Map<string, Row | null>();
        for (const row of rows) {
          const projectId = String(row.projectId);
          if (!siteByProject.has(projectId)) siteByProject.set(projectId,
            await SiteCompletionStateModel.findById(projectId).select({ progress: 1, updatedAt: 1, verifiedAssignmentIds: 1 }).session(session).lean() as Row | null);
          items.push(await taskDtoInSession(row, session, siteByProject.get(projectId)));
        }
        return { items, total: await VendorWorkAssignmentModel.countDocuments({ vendorId, status: { $ne: "superseded" } }).session(session), limit, offset };
      });
    },
    getMine(actor, assignmentId) {
      return transaction(async session => taskDtoInSession(await requireVendorAssignment(actor, assignmentId, session), session));
    },
    progress(actor, assignmentId, value) {
      return transaction(async session => {
        const fields = validated(vendorWorkProgressSchema, value);
        const assignment = await requireVendorAssignment(actor, assignmentId, session);
        await requireEditableVendorProject(assignment.projectId, session);
        const requestDigest = digest(fields);
        const prior = (assignment.receipts as Row[]).find(item => item.kind === "progress" && item.idempotencyKey === fields.idempotencyKey);
        if (prior) {
          if (prior.requestDigest !== requestDigest) conflict("This request key was already used for different progress.");
          return taskDtoInSession(assignment, session);
        }
        if (assignment.version !== fields.expectedVersion || !mayUpdateVendorWork(assignment.status)) conflict();
        const at = now();
        const updated = await VendorWorkAssignmentModel.findOneAndUpdate({ _id: assignmentId, vendorId: actor.vendorId, version: fields.expectedVersion, status: assignment.status }, {
          $set: { status: nextVendorWorkProgressStatus(assignment.status), progress: fields.progress, note: fields.note, lastUpdatedById: actor.id, updatedAt: at },
          $inc: { version: 1 }, $push: { receipts: { kind: "progress", idempotencyKey: fields.idempotencyKey, requestDigest, resultId: null, recordedAt: at } }
        }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean() as Row | null;
        if (!updated) conflict();
        await appendAudit(input.audit, actor.id, "vendor_work_progress_updated", assignmentId, assignment.projectId, session, at, { progress: fields.progress, round: assignment.currentRound });
        return taskDtoInSession(updated, session);
      });
    },
    async uploadImage(actor, assignmentId, value, file) {
      const fields = validated(vendorWorkUploadSchema, value);
      if (!IMAGE_MIME_TYPES.has(file.mimeType) || file.sizeBytes <= 0 || file.sizeBytes > input.maxUploadBytes || file.data.length !== file.sizeBytes) throw new ApiError(415, "VENDOR_WORK_IMAGE_INVALID", "Choose a valid JPEG, PNG, or WebP image within the upload limit.");
      const sha256 = createHash("sha256").update(file.data).digest("hex");
      const requestDigest = digest({ fields, sha256, mimeType: file.mimeType, filename: file.originalFilename });
      const existing = await transaction(async session => {
        const assignment = await requireVendorAssignment(actor, assignmentId, session);
        await requireEditableVendorProject(assignment.projectId, session);
        const prior = await VendorWorkImageModel.findOne({ assignmentId, uploadedById: actor.id, idempotencyKey: fields.idempotencyKey }).session(session).lean() as Row | null;
        if (prior) {
          if (prior.requestDigest !== requestDigest) conflict("This request key was already used for another image.");
          return taskDtoInSession(assignment, session);
        }
        if (assignment.version !== fields.expectedVersion || !mayUpdateVendorWork(assignment.status)) conflict();
        if (await VendorWorkImageModel.countDocuments({ assignmentId, round: assignment.currentRound }).session(session) >= MAX_IMAGES_PER_ROUND) throw new ApiError(400, "VENDOR_WORK_IMAGE_LIMIT", "This section already has the maximum number of images for this round.");
        return null;
      });
      if (existing) return existing;
      const saved = await input.storage.save({ data: file.data, extension: file.extension });
      let attached = false;
      try {
        const result = await transaction(async session => {
          const assignment = await requireVendorAssignment(actor, assignmentId, session);
          await requireEditableVendorProject(assignment.projectId, session);
          const prior = await VendorWorkImageModel.findOne({ assignmentId, uploadedById: actor.id, idempotencyKey: fields.idempotencyKey }).session(session).lean() as Row | null;
          if (prior) {
            if (prior.requestDigest !== requestDigest) conflict("This request key was already used for another image.");
            return { dto: await taskDtoInSession(assignment, session), attached: false };
          }
          if (assignment.version !== fields.expectedVersion || !mayUpdateVendorWork(assignment.status)) conflict();
          if (await VendorWorkImageModel.countDocuments({ assignmentId, round: assignment.currentRound }).session(session) >= MAX_IMAGES_PER_ROUND) throw new ApiError(400, "VENDOR_WORK_IMAGE_LIMIT", "This section already has the maximum number of images for this round.");
          const at = now(); const imageId = `vendor-work-image-${randomUUID()}`;
          await VendorWorkImageModel.create([{ _id: imageId, projectId: assignment.projectId, vendorId: assignment.vendorId, assignmentId,
            round: assignment.currentRound, storageReference: saved.reference, originalFilename: file.originalFilename, mimeType: file.mimeType,
            byteSize: file.sizeBytes, sha256, uploadedAt: at, uploadedById: actor.id, idempotencyKey: fields.idempotencyKey, requestDigest }], { session });
          const changed = await VendorWorkAssignmentModel.updateOne({ _id: assignmentId, version: fields.expectedVersion, status: assignment.status }, {
            $inc: { version: 1 }, $set: { status: "in_progress", updatedAt: at, lastUpdatedById: actor.id }
          }, { session, timestamps: false });
          if (changed.matchedCount !== 1) conflict();
          await appendAudit(input.audit, actor.id, "vendor_work_media_uploaded", imageId, assignment.projectId, session, at, { assignmentId, round: assignment.currentRound, byteSize: file.sizeBytes });
          const updated = await VendorWorkAssignmentModel.findById(assignmentId).session(session).lean() as Row;
          return { dto: await taskDtoInSession(updated, session), attached: true };
        });
        attached = result.attached;
        return result.dto;
      } finally {
        if (!attached) await deleteOrQueue(saved.reference);
      }
    },
    submit(actor, assignmentId, value) {
      return transaction(async session => {
        const fields = validated(vendorWorkSubmitSchema, value);
        const assignment = await requireVendorAssignment(actor, assignmentId, session);
        await requireEditableVendorProject(assignment.projectId, session, true);
        const requestDigest = digest(fields);
        const prior = (assignment.receipts as Row[]).find(item => item.kind === "submit" && item.idempotencyKey === fields.idempotencyKey);
        if (prior) {
          if (prior.requestDigest !== requestDigest) conflict("This request key was already used for another submission.");
          const review = await VendorWorkReviewModel.findById(prior.resultId).session(session).lean() as Row | null;
          if (!review) conflict("The earlier submission could not be found.");
          return reviewDto(review, assignment);
        }
        if (assignment.version !== fields.expectedVersion) conflict();
        if (assignment.progress !== 100) throw new ApiError(409, "VENDOR_WORK_INCOMPLETE", "Set this section to 100% before submitting it to the Client.");
        if (assignment.status !== "in_progress") conflict("Update this section before submitting it to the Client.");
        const project = await ProjectModel.findById(assignment.projectId).select({ clientId: 1, status: 1 }).session(session).lean() as Row | null;
        if (!project || !project.clientId || project.status === "completed") throw new ApiError(409, "VENDOR_WORK_CLIENT_UNAVAILABLE", "This project has no active client review owner.");
        const client = await UserModel.findOne({ _id: project.clientId, role: "client", active: true }).select({ _id: 1 }).session(session).lean();
        if (!client) throw new ApiError(409, "VENDOR_WORK_CLIENT_UNAVAILABLE", "The project client must be active before work can be submitted.");
        const images = await VendorWorkImageModel.find({ assignmentId, round: assignment.currentRound }).sort({ uploadedAt: 1, _id: 1 }).select({ _id: 1 }).session(session).lean();
        const at = now(); const reviewId = vendorWorkReviewId(assignmentId, assignment.currentRound);
        await VendorWorkReviewModel.create([{ _id: reviewId, projectId: assignment.projectId, vendorId: assignment.vendorId,
          assignmentId, clientId: project.clientId, round: assignment.currentRound, assignmentVersionAtSubmit: fields.expectedVersion,
          note: fields.note, progress: assignment.progress, imageIds: images.map(image => String(image._id)), submittedById: actor.id,
          submittedAt: at, status: "pending", version: 1, decision: null }], { session });
        const changed = await VendorWorkAssignmentModel.updateOne({ _id: assignmentId, version: fields.expectedVersion, status: assignment.status }, {
          $set: { status: "submitted_for_client", note: fields.note, submittedAt: at, lastUpdatedById: actor.id, updatedAt: at }, $inc: { version: 1 },
          $push: { receipts: { kind: "submit", idempotencyKey: fields.idempotencyKey, requestDigest, resultId: reviewId, recordedAt: at } }
        }, { session, runValidators: true, timestamps: false });
        if (changed.matchedCount !== 1) conflict();
        await appendAudit(input.audit, actor.id, "vendor_work_submitted", reviewId, assignment.projectId, session, at, { assignmentId, round: assignment.currentRound, imageCount: images.length });
        const review = await VendorWorkReviewModel.findById(reviewId).session(session).lean() as Row;
        return reviewDto(review, assignment);
      });
    },
    clientReviews(actor, projectId, query = { limit: 50, offset: 0 }) {
      return transaction(async session => {
        await requireClientProject(actor, projectId, session);
        const { limit, offset } = validated(clientVendorWorkQuerySchema, query);
        const scope = { projectId, clientId: actor.id };
        const pendingTotal = await VendorWorkReviewModel.countDocuments({ ...scope, status: "pending" }).session(session);
        const total = await VendorWorkReviewModel.countDocuments(scope).session(session);
        // Pending work is a queue, oldest first. History follows newest first.
        // Both portions are paged so an older pending round cannot disappear.
        const pending: Row[] = offset < pendingTotal
          ? await VendorWorkReviewModel.find({ ...scope, status: "pending" }).sort({ submittedAt: 1, _id: 1 })
            .skip(offset).limit(limit).session(session).lean() as Row[]
          : [];
        const decidedLimit = limit - pending.length;
        const decided: Row[] = decidedLimit > 0
          ? await VendorWorkReviewModel.find({ ...scope, status: { $ne: "pending" } }).sort({ submittedAt: -1, _id: 1 })
            .skip(Math.max(0, offset - pendingTotal)).limit(decidedLimit).session(session).lean() as Row[]
          : [];
        const reviews = [...pending, ...decided];
        const items: ClientVendorWorkReviewDto[] = [];
        for (const review of reviews) {
          const assignment = await VendorWorkAssignmentModel.findOne({ _id: review.assignmentId, projectId }).session(session).lean() as Row | null;
          if (!assignment) throw new ApiError(409, "VENDOR_WORK_LINEAGE_CONFLICT", "The submitted work section could not be found.");
          items.push(reviewDto(review, assignment));
        }
        return { items, total, pendingTotal, limit, offset };
      });
    },
    clientDecision(actor, projectId, reviewId, value) {
      return transaction(async session => {
        const fields = validated(clientVendorWorkDecisionSchema, value);
        await requireClientProject(actor, projectId, session);
        const review = await VendorWorkReviewModel.findOne({ _id: reviewId, projectId, clientId: actor.id }).session(session).lean() as Row | null;
        if (!review) missing();
        const assignment = await VendorWorkAssignmentModel.findOne({ _id: review.assignmentId, projectId }).session(session).lean() as Row | null;
        if (!assignment) throw new ApiError(409, "VENDOR_WORK_LINEAGE_CONFLICT", "The submitted work section could not be found.");
        const project = await ProjectModel.findById(projectId).select({ status: 1 }).session(session).lean() as Row | null;
        if (!project || project.status !== "active") throw new ApiError(409, "PROJECT_COMPLETED", "This project no longer accepts Client work decisions.");
        if (await SiteCompletionStateModel.exists({ _id: projectId, currentRound: { $gt: 0 } }).session(session)) conflict("The Site Manager completion review now controls this project.");
        const requestDigest = digest(fields);
        if (review.decision) {
          if (review.decision.idempotencyKey !== fields.idempotencyKey || review.decision.requestDigest !== requestDigest) conflict("This section already has a client decision.");
          return reviewDto(review, assignment);
        }
        if (review.version !== fields.expectedVersion || review.status !== "pending" || assignment.status !== "submitted_for_client" || assignment.currentRound !== review.round) conflict();
        const at = now();
        const changed = await VendorWorkReviewModel.updateOne({ _id: reviewId, projectId, version: fields.expectedVersion, status: "pending", decision: null }, {
          $set: { status: fields.decision === "approve" ? "approved" : "changes_requested", decision: { decision: fields.decision, reason: fields.reason, actorId: actor.id, decidedAt: at, idempotencyKey: fields.idempotencyKey, requestDigest } }, $inc: { version: 1 }
        }, { session, runValidators: true });
        if (changed.matchedCount !== 1) conflict();
        const assignmentChanged = await VendorWorkAssignmentModel.updateOne({ _id: assignment._id, version: assignment.version, status: "submitted_for_client", currentRound: review.round }, {
          $set: { status: fields.decision === "approve" ? "client_approved" : "changes_requested", acceptedAt: fields.decision === "approve" ? at : null, updatedAt: at },
          $inc: { version: 1, ...(fields.decision === "request_changes" ? { currentRound: 1 } : {}) }
        }, { session, runValidators: true, timestamps: false });
        if (assignmentChanged.matchedCount !== 1) conflict();
        await appendAudit(input.audit, actor.id, "client_vendor_work_decided", reviewId, projectId, session, at, { assignmentId: String(assignment._id), round: review.round, decision: fields.decision }, fields.reason);
        const updated = await VendorWorkReviewModel.findById(reviewId).session(session).lean() as Row;
        return reviewDto(updated, assignment);
      });
    },
    projectProgress(actor, projectId) {
      return transaction(async session => {
        await requireProgressProject(actor, projectId, session);
        const rows = await VendorWorkAssignmentModel.find({ projectId, status: { $ne: "superseded" } }).sort({ sourceSectionId: 1, roomName: 1, _id: 1 }).session(session).lean() as Row[];
        const siteState = await SiteCompletionStateModel.findById(projectId)
          .select({ status: 1, progress: 1, updatedAt: 1, verifiedAssignmentIds: 1 }).session(session).lean() as Row | null;
        const visible = actor.role === "client" ? rows.filter(row => ["submitted_for_client", "client_approved", "changes_requested"].includes(row.status)) : rows;
        const assignments: VendorWorkTaskDto[] = [];
        for (const row of visible) {
          const task = await taskDtoInSession(row, session, siteState);
          if (actor.role !== "client") {
            const imageRound = row.status === "changes_requested" ? Number(row.currentRound) - 1 : Number(row.currentRound);
            const images = await VendorWorkImageModel.find({ assignmentId: row._id, round: imageRound }).select({ _id: 1 }).sort({ uploadedAt: 1, _id: 1 }).session(session).lean();
            task.imageIds = images.map(image => String(image._id));
          }
          assignments.push(task);
        }
        const project = await ProjectModel.findById(projectId).select({ status: 1, completionAuthority: 1 }).session(session).lean();
        const site = project?.completionAuthority === "vendor_client" ? siteState : null;
        const pendingOwner = project?.status === "completed" ? "none"
          : site?.status === "pending_client" || rows.some(row => row.status === "submitted_for_client") ? "client"
          : site?.status === "client_approved" ? "super_admin"
          : project?.completionAuthority === "vendor_client" ? "site_manager"
          : rows.some(row => row.status !== "client_approved") ? "vendor" : rows.length ? "super_admin" : "none";
        return { projectId, assignments, pendingOwner };
      });
    },
    async image(actor, projectId, assignmentId, imageId, signal) {
      const image = await transaction(async session => {
        if (actor.role === "vendor") await activeVendorActor(actor, session);
        const assignment = await VendorWorkAssignmentModel.findOne({ _id: assignmentId, projectId }).session(session).lean() as Row | null;
        if (!assignment || assignment.status === "superseded") missing();
        const stored = await VendorWorkImageModel.findOne({ _id: imageId, assignmentId, projectId }).session(session).lean() as Row | null;
        if (!stored) missing();
        if (actor.role === "vendor") {
          await requireVendorAssignment(actor, assignmentId, session);
        } else if (actor.role === "client") {
          await requireClientProject(actor, projectId, session);
          const review = await VendorWorkReviewModel.exists({ assignmentId, projectId, clientId: actor.id, imageIds: imageId }).session(session);
          const siteReview = review ? null : await SiteCompletionReviewModel.exists({ projectId, clientId: actor.id,
            sections: { $elemMatch: { assignmentId, imageIds: imageId } } }).session(session);
          if (!review && !siteReview) missing();
        } else await requireProgressProject(actor, projectId, session);
        return stored;
      });
      const stream = await evidence.openVerifiedMedia({ id: imageId, storageReference: image.storageReference, originalFilename: image.originalFilename,
        mimeType: image.mimeType, byteSize: image.byteSize, sha256: image.sha256, kind: "image" }, signal);
      return { mimeType: image.mimeType, byteSize: image.byteSize, stream };
    },
    async cleanupImages() {
      const jobs = await VendorWorkImageCleanupJobModel.find({ status: "pending", retryAt: { $lte: now() } }).sort({ retryAt: 1, _id: 1 }).limit(20).lean() as Row[];
      let deleted = 0; let failed = 0;
      for (const job of jobs) {
        if (await VendorWorkImageModel.exists({ storageReference: job._id })) continue;
        try {
          await input.storage.delete(String(job._id));
          await VendorWorkImageCleanupJobModel.updateOne({ _id: job._id, status: "pending" }, { $set: { status: "deleted", lastErrorCode: null }, $inc: { attempts: 1 } });
          deleted++;
        } catch {
          await VendorWorkImageCleanupJobModel.updateOne({ _id: job._id, status: "pending" }, {
            $set: { retryAt: new Date(now().getTime() + 60_000), lastErrorCode: "STORAGE_DELETE_FAILED" }, $inc: { attempts: 1 }
          });
          failed++;
        }
      }
      return { deleted, failed };
    }
  };
}
