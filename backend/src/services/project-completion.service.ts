import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type { ZodType } from "zod";
import {
  projectCompletionQueueQuerySchema, projectCompletionSchema, projectScopeExceptionSchema,
  type ProjectCompletionBlocker, type ProjectCompletionInput, type ProjectCompletionSummary,
  type ProjectScopeCoverage, type ProjectScopeExceptionInput
} from "../domain/project-completion.js";
import { configuredEstimateParentIsValid } from "../domain/estimate-client-review.js";
import { ApiError } from "../middleware/errors.js";
import { ProjectModel } from "../models/Project.js";
import { EstimateModel } from "../models/Estimate.js";
import { ProjectCompletionDecisionModel } from "../models/ProjectCompletionDecision.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { ProjectPurchaseOrderRequestModel } from "../models/ProjectPurchaseOrderRequest.js";
import { ProjectPurchaseOrderRequestRevisionModel } from "../models/ProjectPurchaseOrderRequestRevision.js";
import { ProjectScopeExceptionModel } from "../models/ProjectScopeException.js";
import { SiteCompletionReviewModel } from "../models/SiteCompletionReview.js";
import { SiteCompletionStateModel } from "../models/SiteCompletionState.js";
import { UserModel } from "../models/User.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { VendorWorkReviewModel } from "../models/VendorWorkReview.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { procurementItemSourceSnapshot } from "./procurement.service.js";
import { readVendorWorkCompletion, type VendorWorkCompletionSnapshot } from "./vendor-work.service.js";

type Row = Record<string, any>;
type Source = Awaited<ReturnType<typeof procurementItemSourceSnapshot>>;

export function projectCompletionScopeLabel(line: {
  source?: "legacy" | "configuration";
  itemType?: "main_line" | "temporary";
  catalogueId: string;
  sectionId: string;
  mainBasketId?: string;
  mainBasketName?: string;
  subBasketId?: string | null;
  subBasketName?: string | null;
  mainLineId?: string;
  mainLineName?: string;
  specification: string;
}): string {
  if (line.source !== "configuration") return line.specification;
  if (line.mainBasketId !== line.sectionId || line.mainLineId !== line.catalogueId ||
    !line.mainBasketName?.trim() || !configuredEstimateParentIsValid(line) || !line.mainLineName?.trim()) {
    lineageConflict("Configured project scope is missing its approved basket or line snapshot.");
  }
  return [line.mainBasketName, line.subBasketName, line.itemType === "temporary" ? "Temporary item" : null, line.mainLineName]
    .filter(Boolean).join(" · ");
}
interface CompletionLineage {
  summary: ProjectCompletionSummary;
  revisionIds: string[];
  assignmentIds: string[];
  exceptionIds: string[];
  siteReviewId: string | null;
}
export interface ProjectScopeExceptionDto {
  id: string; projectId: string; sourceLineItemKey: string; kind: "not_applicable" | "externally_fulfilled";
  reason: string; resultingAuthorityVersion: number; recordedAt: string;
}
export interface ProjectCompletionDecisionDto {
  id: string; projectId: string; completedAt: string; resultingAuthorityVersion: number;
}
export interface ProjectCompletionService {
  summary(actor: PublicUser, projectId: string): Promise<ProjectCompletionSummary>;
  queue(actor: PublicUser, query: { limit?: number; offset?: number }): Promise<{ items: ProjectCompletionSummary[]; total: number; limit: number; offset: number }>;
  except(actor: PublicUser, projectId: string, input: ProjectScopeExceptionInput): Promise<ProjectScopeExceptionDto>;
  complete(actor: PublicUser, projectId: string, input: ProjectCompletionInput): Promise<ProjectCompletionDecisionDto>;
}

export function createProjectCompletionService(input: { audit: AuditService; now?: () => Date }): ProjectCompletionService {
  const now = input.now ?? (() => new Date());
  async function tx<T>(actor: PublicUser, work: (session: ClientSession) => Promise<T>): Promise<T> {
    return mongoose.connection.transaction(async session => { await requireSuperAdmin(actor, session); return work(session); },
      { readConcern: { level: "snapshot" }, readPreference: "primary" });
  }
  async function summaryInSession(projectId: string, session: ClientSession, source?: Source): Promise<CompletionLineage> {
    const project = await requireVendorManagedProject(projectId, session);
    const approvedSource = source ?? await procurementItemSourceSnapshot(projectId, session);
    return buildLineage(project, approvedSource, session);
  }
  return {
    summary(actor, projectId) { return tx(actor, async session => (await summaryInSession(projectId, session)).summary); },
    queue(actor, query) {
      return tx(actor, async session => {
      const { limit, offset } = validate(projectCompletionQueueQuerySchema, query);
        const approvedProjectIds = await EstimateModel.distinct("projectId", { projectId: { $ne: null },
          status: "client_approved", designPlanStatus: "approved" }).session(session);
        const filter = { _id: { $in: approvedProjectIds }, status: "active", completionAuthority: "vendor_client" };
        const total = await ProjectModel.countDocuments(filter).session(session);
        const projects = await ProjectModel.find(filter).select({ _id: 1 }).sort({ updatedAt: -1, _id: 1 }).skip(offset).limit(limit).session(session).lean();
        const items: ProjectCompletionSummary[] = [];
        for (const project of projects) items.push((await summaryInSession(String(project._id), session)).summary);
        return { items, total, limit, offset };
      });
    },
    async except(actor, projectId, value) {
      const fields = validate(projectScopeExceptionSchema, value);
      const requestDigest = digest({ projectId, ...fields });
      try {
        return await tx(actor, async session => {
          const existing = await ProjectScopeExceptionModel.findOne({ projectId, idempotencyKey: fields.idempotencyKey }).session(session).lean() as Row | null;
          if (existing) return identicalException(existing, requestDigest);
          const project = await requireVendorManagedProject(projectId, session);
          if (project.status !== "active" || project.completionAuthorityVersion !== fields.expectedAuthorityVersion) versionConflict();
          const source = await procurementItemSourceSnapshot(projectId, session, true);
          const line = source.lineItems.find(row => row.key === fields.sourceLineItemKey);
          if (!line) throw new ApiError(409, "PROJECT_SCOPE_SOURCE_CONFLICT", "This line is not in the current approved estimate.");
          const lineage = await buildLineage(project, source, session);
          if (lineage.summary.scope.find(row => row.sourceLineItemKey === fields.sourceLineItemKey)?.approvedOrderLineCount) throw new ApiError(409, "PROJECT_SCOPE_ALREADY_ORDERED", "This scope line is already covered by an approved purchase order.");
          if (lineage.summary.scope.find(row => row.sourceLineItemKey === fields.sourceLineItemKey)?.exception) throw new ApiError(409, "PROJECT_SCOPE_EXCEPTION_EXISTS", "This scope line already has a recorded exception.");
          const at = now();
          const id = `project-scope-exception-${randomUUID()}`;
          const resultingAuthorityVersion = fields.expectedAuthorityVersion + 1;
          await ProjectScopeExceptionModel.create([{ _id: id, projectId, estimateId: source.estimateId,
            estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId,
            sourceSectionId: line.sectionId, sourceLineItemKey: line.key, kind: fields.kind, reason: fields.reason,
            expectedAuthorityVersion: fields.expectedAuthorityVersion, resultingAuthorityVersion,
            actorId: actor.id, recordedAt: at, idempotencyKey: fields.idempotencyKey, requestDigest }], { session });
          const changed = await ProjectModel.updateOne({ _id: projectId, status: "active", completionAuthority: "vendor_client",
            completionAuthorityVersion: fields.expectedAuthorityVersion, completionDecisionId: null },
          { $inc: { completionAuthorityVersion: 1 } }, { session });
          if (changed.matchedCount !== 1) versionConflict();
          await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "project_scope_exception_recorded",
            entityType: "project_scope_exception", entityId: id, occurredAt: at.toISOString(),
            newValues: { projectId, estimateId: source.estimateId, estimateVersion: source.estimateVersion,
              sourceLineItemKey: line.key, sourceSectionId: line.sectionId, kind: fields.kind,
              resultingAuthorityVersion }, reason: fields.reason }, session);
          return { id, projectId, sourceLineItemKey: line.key, kind: fields.kind, reason: fields.reason,
            resultingAuthorityVersion, recordedAt: at.toISOString() };
        });
      } catch (error) {
        if (!isDuplicate(error)) throw error;
        return tx(actor, async session => {
          const existing = await ProjectScopeExceptionModel.findOne({ projectId, idempotencyKey: fields.idempotencyKey }).session(session).lean() as Row | null;
          if (existing) return identicalException(existing, requestDigest);
          throw new ApiError(409, "PROJECT_SCOPE_EXCEPTION_EXISTS", "This scope line already has a recorded exception.");
        });
      }
    },
    async complete(actor, projectId, value) {
      const fields = validate(projectCompletionSchema, value);
      const requestDigest = digest({ projectId, ...fields });
      try {
        return await tx(actor, async session => {
          const existing = await ProjectCompletionDecisionModel.findOne({ projectId }).session(session).lean() as Row | null;
          if (existing) return identicalCompletion(existing, fields.idempotencyKey, requestDigest);
          const project = await requireVendorManagedProject(projectId, session);
          if (project.status !== "active" || project.completionAuthorityVersion !== fields.expectedAuthorityVersion || project.completionDecisionId) versionConflict();
          const source = await procurementItemSourceSnapshot(projectId, session, true);
          const lineage = await buildLineage(project, source, session);
          if (!lineage.summary.readyForCompletion) throw new ApiError(409, "PROJECT_COMPLETION_BLOCKED", "Resolve all purchase orders, vendor work, client reviews, and estimate scope before completing this project.");
          const at = now();
          const id = `project-completion-${randomUUID()}`;
          const resultingAuthorityVersion = fields.expectedAuthorityVersion + 1;
          await ProjectCompletionDecisionModel.create([{ _id: id, projectId, estimateId: source.estimateId,
            estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId,
            expectedAuthorityVersion: fields.expectedAuthorityVersion, resultingAuthorityVersion,
            approvedRevisionIds: lineage.revisionIds, acceptedAssignmentIds: lineage.assignmentIds,
            siteCompletionReviewId: lineage.siteReviewId,
            exceptionIds: lineage.exceptionIds, sourceLineItemKeys: source.lineItems.map(line => line.key),
            actorId: actor.id, decidedAt: at, idempotencyKey: fields.idempotencyKey, requestDigest }], { session });
          const changed = await ProjectModel.updateOne({ _id: projectId, status: "active", completionAuthority: "vendor_client",
            completionAuthorityVersion: fields.expectedAuthorityVersion, completionDecisionId: null },
          { $set: { status: "completed", actualEndAt: at, completionDecisionId: id }, $inc: { completionAuthorityVersion: 1 } }, { session });
          if (changed.matchedCount !== 1) versionConflict();
          await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "project_completion_recorded",
            entityType: "project", entityId: projectId, occurredAt: at.toISOString(),
            newValues: { projectId, completionDecisionId: id, resultingAuthorityVersion,
              approvedRevisionIds: lineage.revisionIds, acceptedAssignmentIds: lineage.assignmentIds,
              exceptionIds: lineage.exceptionIds } }, session);
          return { id, projectId, completedAt: at.toISOString(), resultingAuthorityVersion };
        });
      } catch (error) {
        if (!isDuplicate(error)) throw error;
        return tx(actor, async session => {
          const existing = await ProjectCompletionDecisionModel.findOne({ projectId }).session(session).lean() as Row | null;
          if (existing) return identicalCompletion(existing, fields.idempotencyKey, requestDigest);
          throw error;
        });
      }
    }
  };
}

async function buildLineage(project: Row, source: Source, session: ClientSession): Promise<CompletionLineage> {
  const projectId = String(project._id);
  const sourceByKey = new Map(source.lineItems.map(line => [line.key, line]));
  if (sourceByKey.size !== source.lineItems.length) lineageConflict("Approved estimate has duplicate source keys.");
  const orders = await ProjectPurchaseOrderModel.find({ projectId }).sort({ _id: 1 }).session(session).lean() as Row[];
  const blockers: ProjectCompletionBlocker[] = [];
  const activeRequests = await ProjectPurchaseOrderRequestModel.find({ projectId, status: { $in: ["pending_approval", "changes_requested"] } })
    .session(session).lean() as Row[];
  if (activeRequests.length > 1) lineageConflict("Several project purchase order requests are simultaneously active.");
  const activeRequest = activeRequests[0];
  if (activeRequest) {
    const revision = await ProjectPurchaseOrderRequestRevisionModel.findOne({ _id: activeRequest.submittedRevisionId,
      requestId: activeRequest._id, projectId, revision: activeRequest.revision }).session(session).lean() as Row | null;
    if (!revision || activeRequest.estimateId !== source.estimateId || activeRequest.estimateVersion !== source.estimateVersion ||
        activeRequest.estimateReviewRoundId !== source.estimateReviewRoundId ||
        revision.estimateId !== source.estimateId || revision.estimateVersion !== source.estimateVersion ||
        revision.estimateReviewRoundId !== source.estimateReviewRoundId ||
        revision.preparationDigest !== activeRequest.preparationDigest) lineageConflict("The current project purchase order request no longer matches the approved estimate.");
    blockers.push({ code: "ORDER_PENDING", message: activeRequest.status === "pending_approval"
      ? "The project purchase order request awaits Super Admin approval."
      : "Procurement must revise and resubmit the project purchase order request." });
  }
  const approvedOrders: ProjectCompletionSummary["approvedOrders"] = [];
  const expectedAssignments = new Map<string, { orderId: string; revision: number; lineId: string; sourceLineItemKey: string; sourceSectionId: string }>();
  const coverageCounts = new Map<string, number>();
  const revisionIds: string[] = [];
  for (const order of orders) {
    if (["draft", "pending_approval", "changes_requested"].includes(String(order.status))) blockers.push({ code: "ORDER_PENDING", message: `Purchase order ${String(order.orderNumber)} still needs a decision or revision.` });
    if (order.approvedRevisionId == null || order.cancelledAt) continue;
    const revision = await ProjectPurchaseOrderRevisionModel.findOne({ _id: order.approvedRevisionId, orderId: order._id,
      projectId, vendorId: order.vendorId, revision: order.approvedRevision }).session(session).lean() as Row | null;
    if (!revision || revision.estimateId !== source.estimateId || revision.estimateVersion !== source.estimateVersion || revision.estimateReviewRoundId !== source.estimateReviewRoundId || revision.totalPaise !== order.approvedTotalPaise || revision.netPaise !== order.approvedNetPaise || revision.gstPaise !== order.approvedGstPaise || revision.netPaise + revision.gstPaise !== revision.totalPaise) lineageConflict("An approved order revision conflicts with the approved estimate or order totals.");
    approvedOrders.push({ orderId: String(order._id), revisionId: String(revision._id), revision: Number(revision.revision),
      lineCount: revision.lines.length, netPaise: Number(revision.netPaise), gstPaise: Number(revision.gstPaise), totalPaise: Number(revision.totalPaise) });
    revisionIds.push(String(revision._id));
    for (const line of revision.lines) {
      const sourceLine = sourceByKey.get(String(line.sourceLineItemKey));
      if (!sourceLine || sourceLine.sectionId !== line.sourceSectionId || line.estimateId !== source.estimateId || line.estimateVersion !== source.estimateVersion || line.estimateReviewRoundId !== source.estimateReviewRoundId) lineageConflict("An approved order line has invalid estimate scope lineage.");
      const assignmentKey = `${String(order._id)}:${String(revision.revision)}:${String(line.id)}`;
      if (expectedAssignments.has(assignmentKey)) lineageConflict("An approved order has duplicate work line IDs.");
      expectedAssignments.set(assignmentKey, { orderId: String(order._id), revision: Number(revision.revision), lineId: String(line.id),
        sourceLineItemKey: String(line.sourceLineItemKey), sourceSectionId: String(line.sourceSectionId) });
      coverageCounts.set(String(line.sourceLineItemKey), (coverageCounts.get(String(line.sourceLineItemKey)) ?? 0) + 1);
    }
  }
  if (source.lineItems.length === 0) blockers.push({ code: "NO_APPROVED_ORDER", message: "The approved estimate has no scope lines to reconcile for final completion." });
  const exceptions = await ProjectScopeExceptionModel.find({ projectId, estimateId: source.estimateId,
    estimateVersion: source.estimateVersion }).sort({ sourceLineItemKey: 1 }).session(session).lean() as Row[];
  const exceptionByKey = new Map<string, Row>();
  for (const exception of exceptions) {
    const line = sourceByKey.get(String(exception.sourceLineItemKey));
    if (!line || line.sectionId !== exception.sourceSectionId || exception.estimateReviewRoundId !== source.estimateReviewRoundId || exceptionByKey.has(String(exception.sourceLineItemKey))) lineageConflict("A recorded scope exception has invalid approved-estimate lineage.");
    exceptionByKey.set(String(exception.sourceLineItemKey), exception);
  }
  const scope: ProjectScopeCoverage[] = source.lineItems.map(line => {
    const count = coverageCounts.get(line.key) ?? 0;
    const exception = exceptionByKey.get(line.key);
    const scopeLabel = projectCompletionScopeLabel(line);
    if (!count && !exception && line.amountPaise > 0) blockers.push({ code: "SCOPE_UNCOVERED",
      message: `${line.roomName} · ${scopeLabel} has no approved purchase order work or scope decision. Ask Procurement to order it, or Super Admin to record a scope decision.`,
      sourceLineItemKey: line.key });
    return { sourceLineItemKey: line.key, sourceSectionId: line.sectionId, roomName: line.roomName,
      specification: scopeLabel, amountPaise: line.amountPaise,
      approvedOrderLineCount: count, exception: exception ? { id: String(exception._id), kind: exception.kind, reason: exception.reason } : null,
      status: count ? "approved_order" : exception ? "exception" : line.amountPaise === 0 ? "not_required" : "uncovered" };
  });
  const work: VendorWorkCompletionSnapshot = await readVendorWorkCompletion(projectId, session);
  const actual = new Map<string, number>();
  const assignmentIds: string[] = [];
  for (const assignment of work.assignments) {
    const key = `${assignment.orderId}:${assignment.orderRevision}:${assignment.lineId}`;
    const expected = expectedAssignments.get(key);
    if (!expected || expected.sourceLineItemKey !== assignment.sourceLineItemKey || expected.sourceSectionId !== assignment.sourceSectionId) lineageConflict("An active vendor task does not match a current approved order line.");
    actual.set(key, (actual.get(key) ?? 0) + 1);
    if (assignment.status === "client_approved") {
      const stored = await VendorWorkAssignmentModel.findOne({ _id: assignment.id, projectId, status: "client_approved" })
        .select({ currentRound: 1, acceptedAt: 1 }).session(session).lean() as Row | null;
      if (!stored?.acceptedAt || !Number.isSafeInteger(stored.currentRound) || !project.clientId) lineageConflict("Client acceptance has no valid linked project Client or accepted work round.");
      const review = await VendorWorkReviewModel.findOne({ assignmentId: assignment.id, projectId,
        round: stored.currentRound, status: "approved" }).session(session).lean() as Row | null;
      if (!review || review.clientId !== project.clientId || review.decision?.actorId !== project.clientId || review.decision?.decision !== "approve") lineageConflict("A vendor work acceptance was not recorded by this project's Client.");
      assignmentIds.push(assignment.id);
    }
  }
  for (const [key] of expectedAssignments) if (actual.get(key) !== 1) lineageConflict("Every approved order line must have exactly one current vendor task.");
  if (work.totalAssignments !== expectedAssignments.size || work.approvedAssignments + work.pendingAssignments !== work.totalAssignments) lineageConflict("Vendor completion counts conflict with approved order lines.");
  if (work.openReviews > 0) blockers.push({ code: "CLIENT_REVIEW_PENDING", message: `${work.openReviews} vendor work submission(s) await Client review.` });
  const siteState = await SiteCompletionStateModel.findById(projectId).session(session).lean() as Row | null;
  const siteTasks = await ProjectWorkflowTaskModel.find({ projectId, kind: "site_execution", assigneeRole: "site_manager" })
    .select({ assigneeUserId: 1 }).session(session).lean() as Row[];
  if (siteTasks.length > 1) lineageConflict("The Site Manager assignment is inconsistent.");
  const siteManagerId = siteTasks[0]?.assigneeUserId ?? null;
  const siteReview = siteState?.currentRound ? await SiteCompletionReviewModel.findOne({ projectId, round: siteState.currentRound })
    .session(session).lean() as Row | null : null;
  if (siteState && (!siteReview && siteState.currentRound > 0 || siteReview && (
    siteReview.clientId !== project.clientId || siteReview.managerId !== siteManagerId ||
    siteReview.round !== siteState.currentRound ||
    siteState.status === "pending_client" && siteReview.status !== "pending" ||
    siteState.status === "changes_requested" && siteReview.status !== "changes_requested" ||
    siteState.status === "client_approved" && (siteReview.status !== "approved" ||
      siteReview.decision?.actorId !== project.clientId || siteReview.decision?.decision !== "approve")
  ))) lineageConflict("Site completion review history is inconsistent.");
  if (siteState?.status === "client_approved" && siteReview) {
    if (siteReview.estimateId !== source.estimateId || siteReview.estimateVersion !== source.estimateVersion ||
      siteReview.estimateReviewRoundId !== source.estimateReviewRoundId ||
      JSON.stringify(siteReview.approvedRevisionIds) !== JSON.stringify(revisionIds) ||
      JSON.stringify(siteReview.sourceLineItemKeys) !== JSON.stringify(source.lineItems.map(line => line.key)) ||
      JSON.stringify(siteReview.sections.map((section: Row) => String(section.assignmentId)).sort()) !==
        JSON.stringify(work.assignments.map(assignment => assignment.id).sort())) {
      lineageConflict("The accepted Site Manager completion no longer matches current approved work.");
    }
  }
  if (project.status === "active" && siteState?.status !== "client_approved") blockers.push({
    code: "SITE_COMPLETION_PENDING", message: siteState?.status === "pending_client"
      ? "Client acceptance of Site Manager completion is pending."
      : "Site Manager must submit 100% project completion for Client acceptance."
  });
  if (project.status !== "active" && project.status !== "completed") blockers.push({ code: "PROJECT_NOT_ACTIVE", message: "The project must be active before final completion." });
  const readyForCompletion = project.status === "active" && blockers.length === 0;
  const pendingOwner = project.status === "completed" ? "none" : blockers.some(item => item.code === "ORDER_PENDING")
    ? activeRequest?.status === "pending_approval" || orders.some(order => order.status === "pending_approval") ? "super_admin" : "procurement"
    : blockers.some(item => item.code === "SCOPE_UNCOVERED" || item.code === "NO_APPROVED_ORDER") ? "procurement"
    : blockers.some(item => item.code === "CLIENT_REVIEW_PENDING") || siteState?.status === "pending_client" ? "client"
    : siteState?.status === "client_approved" ? "super_admin" : "site_manager";
  return { summary: { projectId, projectName: String(project.name), projectStatus: String(project.status), completionAuthority: "vendor_client",
    completionAuthorityVersion: Number(project.completionAuthorityVersion),
    estimateSource: { estimateId: source.estimateId, estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId },
    scope, approvedOrders, vendorWork: { totalAssignments: work.totalAssignments, approvedAssignments: work.approvedAssignments,
      pendingAssignments: work.pendingAssignments, openReviews: work.openReviews },
    siteCompletion: siteState ? { status: siteState.status, progress: Number(siteState.progress),
      round: Number(siteState.currentRound), reviewId: siteReview ? String(siteReview._id) : null } : null,
    blockers, pendingOwner,
    readyForCompletion, completedAt: project.actualEndAt ? new Date(project.actualEndAt).toISOString() : null,
    completionDecisionId: project.completionDecisionId ?? null }, revisionIds, assignmentIds,
    siteReviewId: siteReview?.status === "approved" ? String(siteReview._id) : null,
    exceptionIds: exceptions.filter(row => !coverageCounts.has(String(row.sourceLineItemKey))).map(row => String(row._id)) };
}

function validate<T>(schema: ZodType<T, any, any>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join("."), issue.message])));
  return parsed.data;
}
/** Shared read projection for project-status consumers; authorization remains with each caller. */
export async function readProjectCompletionSummary(projectId: string, session: ClientSession): Promise<ProjectCompletionSummary> {
  if (!session.inTransaction()) throw new Error("Project completion reads require an active transaction.");
  const project = await requireVendorManagedProject(projectId, session);
  const source = await procurementItemSourceSnapshot(projectId, session);
  return (await buildLineage(project, source, session)).summary;
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function isDuplicate(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000); }
function versionConflict(): never { throw new ApiError(409, "PROJECT_COMPLETION_VERSION_CONFLICT", "Project completion state changed. Reload before continuing."); }
function lineageConflict(message: string): never { throw new ApiError(409, "PROJECT_COMPLETION_LINEAGE_CONFLICT", message); }
async function requireSuperAdmin(actor: PublicUser, session: ClientSession): Promise<void> {
  const user = await UserModel.findOne({ _id: actor.id, role: actor.role, active: true }).select({ role: 1 }).session(session).lean();
  if (!user) throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  if (user.role !== "super_admin") throw new ApiError(403, "FORBIDDEN", "Only the Super Admin can close a project.");
}
async function requireVendorManagedProject(projectId: string, session: ClientSession): Promise<Row> {
  const project = await ProjectModel.findById(projectId).session(session).lean() as Row | null;
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (project.completionAuthority !== "vendor_client" || !Number.isSafeInteger(project.completionAuthorityVersion) || project.completionAuthorityVersion < 1) lineageConflict("This project has no valid vendor-client completion authority.");
  if ((project.status === "completed") !== Boolean(project.completionDecisionId)) lineageConflict("Project completion history is inconsistent.");
  return project;
}
function identicalException(existing: Row, requestDigest: string): ProjectScopeExceptionDto {
  if (existing.requestDigest !== requestDigest) throw new ApiError(409, "PROJECT_SCOPE_IDEMPOTENCY_CONFLICT", "This request key was already used for another scope decision.");
  return { id: String(existing._id), projectId: String(existing.projectId), sourceLineItemKey: String(existing.sourceLineItemKey),
    kind: existing.kind, reason: String(existing.reason), resultingAuthorityVersion: Number(existing.resultingAuthorityVersion),
    recordedAt: new Date(existing.recordedAt).toISOString() };
}
function identicalCompletion(existing: Row, idempotencyKey: string, requestDigest: string): ProjectCompletionDecisionDto {
  if (existing.idempotencyKey !== idempotencyKey || existing.requestDigest !== requestDigest) throw new ApiError(409, "PROJECT_ALREADY_COMPLETED", "This project already has a final completion decision.");
  return { id: String(existing._id), projectId: String(existing.projectId), completedAt: new Date(existing.decidedAt).toISOString(),
    resultingAuthorityVersion: Number(existing.resultingAuthorityVersion) };
}
