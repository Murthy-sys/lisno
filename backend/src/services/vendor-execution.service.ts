import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type { ExecutionCommand, ExecutionPage, ExecutionPolicy, ExecutionQuery, ExecutionHistoryPage, ExecutionPortfolio, ExecutionPortfolioQuery, ExecutionWork } from "../contracts/vendor-execution.js";
import type { ApprovedPurchaseOrderLine } from "../domain/project-purchase-order.js";
import { defaultExecutionPolicy, executionCommandSchema, executionDigest, executionLocalDate, executionPortfolioQuerySchema, executionQuerySchema, nextExecutionDate } from "../domain/vendor-execution.js";
import { vendorWorkAssignmentId } from "../domain/vendor-work.js";
import { ApiError } from "../middleware/errors.js";
import { VendorExecutionStateModel } from "../models/VendorExecutionState.js";
import { VendorExecutionEventModel } from "../models/VendorExecutionEvent.js";
import { VendorExecutionReviewModel } from "../models/VendorExecutionReview.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectModel } from "../models/Project.js";
import { UserModel } from "../models/User.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { appendExecutionChange } from "./execution-change-events.js";
import { assertCompletionReviewAllowsOrderChanges } from "./site-completion-fence.js";
import { executionNotFound, executionProjectIds, requireExecutionActor, requireExecutionProject } from "./vendor-execution-access.js";
import { cacheLatestVendorReports, currentExecutionImages, defaultExecutionDaily, editableExecutionStates, executionCached, executionCounts, executionWorkDto, iso, type DailyReader, type ExecutionProjectionCache, type ExecutionRow as Row } from "./vendor-execution-projection.js";
import { vendorActivation } from "./vendor-readiness.service.js";

function conflict(message = "This work has changed. Refresh it before trying again."): never { throw new ApiError(409, "EXECUTION_VERSION_CONFLICT", message); }
function invalid(message: string): never { throw new ApiError(400, "VALIDATION_ERROR", message); }
const transaction = <T>(run: (session: ClientSession) => Promise<T>): Promise<T> => mongoose.connection.transaction(run, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
function newState(assignment: Row, at: Date, accessAvailableAt: Date | null): Row { return { _id: String(assignment._id), assignmentId: String(assignment._id), projectId: assignment.projectId, vendorId: assignment.vendorId, workflowVersion: 1, version: 1, executionRound: 1,
  status: "assigned", progress: assignment.progress ?? 0, latestNote: assignment.note ?? "", latestReportAt: null, acknowledgedAt: null, accessAvailableAt, proposedSchedule: null, schedule: null, reportingStartsOn: null,
  hold: null, evidenceExemption: null, submissionId: null, verificationId: null, roundStartedAt: at, createdAt: at, updatedAt: at }; }

export interface ExecutionVerificationSnapshot { assignmentId: string; verificationId: string; executionRound: number; submissionVersion: number; imageIds: string[] }
export async function currentExecutionVerification(assignment: Row, session: ClientSession): Promise<ExecutionVerificationSnapshot | null> {
  const state = await VendorExecutionStateModel.findById(assignment._id).session(session).lean() as Row | null;
  if (!state || state.status !== "site_verified" || !state.verificationId || !state.submissionId) return null;
  const review = await VendorExecutionReviewModel.findOne({ _id: state.submissionId, assignmentId: assignment._id, executionRound: state.executionRound, "decision.outcome": "verified" }).session(session).lean() as Row | null;
  if (!review || state.verificationId !== review._id) return null;
  const images = await currentExecutionImages(assignment, state, session);
  if (review.imageIds.some((id: string) => !images.includes(id))) return null;
  return { assignmentId: String(assignment._id), verificationId: state.verificationId, executionRound: state.executionRound, submissionVersion: review.submissionVersion, imageIds: [...review.imageIds] };
}
export async function assertExecutionEditable(assignment: Row, session: ClientSession): Promise<void> {
  const state = await VendorExecutionStateModel.findById(assignment._id).session(session).lean() as Row | null;
  if (state && (!editableExecutionStates.includes(state.status) || state.hold)) throw new ApiError(409, "EXECUTION_LOCKED", "This execution round is on hold or already submitted for review.");
}
export async function assertExecutionVerified(assignment: Row, session: ClientSession): Promise<void> {
  const state = await VendorExecutionStateModel.exists({ _id: assignment._id }).session(session);
  if (!state) {
    if (["submitted_for_client", "client_approved"].includes(assignment.status)) return;
    throw new ApiError(409, "EXECUTION_SETUP_REQUIRED", "Set up execution tracking and complete Site Manager verification first.");
  }
  if (!(await currentExecutionVerification(assignment, session))) throw new ApiError(409, "EXECUTION_VERIFICATION_REQUIRED", "The assigned Site Manager must verify the current completion submission first.");
}
export async function assertNoExecutionActivityForAmendment(assignmentIds: string[], session: ClientSession): Promise<void> {
  if (!assignmentIds.length) return;
  const activity = await VendorExecutionEventModel.exists({ assignmentId: { $in: assignmentIds }, action: { $nin: ["issued", "setup"] } }).session(session);
  const state = await VendorExecutionStateModel.exists({ _id: { $in: assignmentIds }, $or: [{ acknowledgedAt: { $ne: null } }, { latestReportAt: { $ne: null } }, { submissionId: { $ne: null } }, { schedule: { $ne: null } }] }).session(session);
  if (activity || state) throw new ApiError(409, "VENDOR_WORK_AMENDMENT_RECONCILIATION_REQUIRED", "The vendor has acknowledged or updated this work. Reconcile execution before amending the order.");
}
export async function invalidateExecutionVerificationForClientChanges(assignmentId: string, actorId: string, reason: string, session: ClientSession, at: Date, policy = defaultExecutionPolicy("", at)): Promise<void> {
  let state = await VendorExecutionStateModel.findById(assignmentId).session(session).lean() as Row | null;
  if (!state) {
    const assignment = await VendorWorkAssignmentModel.findById(assignmentId).session(session).lean() as Row | null;
    if (!assignment) throw new ApiError(409, "EXECUTION_SOURCE_CONFLICT", "The Client decision has no corresponding vendor assignment.");
    state = newState(assignment, at, null);
    // Explicit Client rework enables tracking prospectively; the old approval round stays untouched.
    state.version = 0; state.executionRound = 0;
    await VendorExecutionStateModel.create([{ ...state, version: 1, executionRound: 1 }], { session });
    state.version = 1; state.executionRound = 0;
  }
  const version = state.version + 1; const executionRound = state.executionRound + 1;
  await VendorExecutionStateModel.updateOne({ _id: assignmentId, version: state.version }, { $set: { status: "changes_requested", version, executionRound, submissionId: null, verificationId: null, evidenceExemption: null, latestReportAt: null, roundStartedAt: at, latestNote: reason, updatedAt: at,
    reportingStartsOn: state.schedule ? [state.schedule.startDate, nextExecutionDate(executionLocalDate(at, policy.timezone))].sort().at(-1) : null } }, { session });
  await VendorExecutionEventModel.create([{ _id: `execution-event-${randomUUID()}`, assignmentId, projectId: state.projectId, vendorId: state.vendorId, actorId, action: "client_changes_requested", occurredAt: at,
    localDate: executionLocalDate(at, policy.timezone), timezone: policy.timezone, executionRound, version, idempotencyKey: `client-rework:${version}`, requestDigest: executionDigest({ reason, version }), reason, note: reason, progress: state.progress, status: "changes_requested" }], { session });
  await appendExecutionChange({ assignmentId, projectId: state.projectId, vendorId: state.vendorId, version, kind: "client_changes_requested", occurredAt: at }, session);
}

/** Trusted approval hook, called after assignment insertion but potentially before the order header changes. */
export async function initializeIssuedExecution(approval: { orderId: string; projectId: string; vendorId: string; revision: number; lines: readonly ApprovedPurchaseOrderLine[]; actorId?: string; occurredAt?: Date; approvedRevisionId?: string }, session: ClientSession): Promise<void> {
  const at = approval.occurredAt ?? new Date();
  const member = await UserModel.exists({ role: "vendor", vendorId: approval.vendorId, active: true }).session(session);
  const vendor = member ? await AiEstimatorKnowledgeVendorModel.findById(approval.vendorId).session(session).lean() : null;
  const accessAvailableAt = vendor && (await vendorActivation(vendor, session)).effectiveStatus === "active" ? at : null;
  for (const line of approval.lines) {
    const id = vendorWorkAssignmentId(approval.orderId, approval.revision, line.id);
    const assignment = await VendorWorkAssignmentModel.findOne({ _id: id, projectId: approval.projectId, vendorId: approval.vendorId, orderId: approval.orderId, orderRevision: approval.revision }).session(session).lean() as Row | null;
    if (!assignment) throw new ApiError(409, "EXECUTION_SOURCE_CONFLICT", "Issued work is missing its stable vendor assignment.");
    const state = await VendorExecutionStateModel.findById(id).session(session).lean();
    if (state) continue;
    await VendorExecutionStateModel.create([newState(assignment, at, accessAvailableAt)], { session });
    await VendorExecutionEventModel.create([{ _id: `execution-issued:${id}`, assignmentId: id, projectId: approval.projectId, vendorId: approval.vendorId, actorId: approval.actorId ?? "system:work-order", action: "issued", occurredAt: at,
      localDate: executionLocalDate(at), timezone: "Asia/Kolkata", executionRound: 1, version: 1, idempotencyKey: "issued-order", requestDigest: executionDigest({ orderId: approval.orderId, revision: approval.revision, lineId: line.id }), status: "assigned", progress: assignment.progress ?? 0 }], { session });
    await appendExecutionChange({ projectId: approval.projectId, vendorId: approval.vendorId, assignmentId: id, version: 1, kind: "issued", occurredAt: at }, session);
  }
}

export interface VendorExecutionService {
  listMine(actor: PublicUser, query?: ExecutionQuery): Promise<ExecutionPage>;
  project(actor: PublicUser, projectId: string, query?: ExecutionQuery): Promise<ExecutionPage>;
  portfolio(actor: PublicUser, query?: ExecutionPortfolioQuery): Promise<ExecutionPortfolio>;
  detail(actor: PublicUser, assignmentId: string): Promise<ExecutionWork>;
  history(actor: PublicUser, assignmentId: string, query?: ExecutionQuery): Promise<ExecutionHistoryPage>;
  command(actor: PublicUser, assignmentId: string, command: ExecutionCommand, projectId?: string): Promise<ExecutionWork>;
}
export function createVendorExecutionService(input: { audit: AuditService; now?: () => Date;
  readPolicy?: (projectId: string, session: ClientSession) => Promise<ExecutionPolicy>;
  readDaily?: DailyReader;
  readDeliveryHealth?: () => Promise<import("../contracts/vendor-execution.js").ExecutionDeliveryHealth>;
  onChangeInTransaction?: (event: { projectId: string; assignmentId: string; vendorId: string; version: number; kind: string; occurredAt: Date }, session: ClientSession) => Promise<void>
}): VendorExecutionService {
  const now = input.now ?? (() => new Date());
  const readPolicy = input.readPolicy ?? (async projectId => defaultExecutionPolicy(projectId, now()));
  const readDaily = input.readDaily ?? defaultExecutionDaily;
  const change = input.onChangeInTransaction ?? appendExecutionChange;
  async function assignmentFor(actor: PublicUser, assignmentId: string, session: ClientSession, mutation = false): Promise<Row> {
    await requireExecutionActor(actor, session, mutation);
    const row = await VendorWorkAssignmentModel.findById(assignmentId).session(session).lean() as Row | null;
    if (!row) executionNotFound();
    if (actor.role === "vendor") { if (row.vendorId !== actor.vendorId) executionNotFound(); }
    else await requireExecutionProject(actor, row.projectId, session);
    const order = await ProjectPurchaseOrderModel.exists({ _id: row.orderId, projectId: row.projectId, vendorId: row.vendorId, approvedRevision: row.orderRevision, approvedRevisionId: { $ne: null }, cancelledAt: null }).session(session);
    if ((mutation || actor.role === "vendor") && (!order || row.status === "superseded")) executionNotFound();
    return row;
  }
  const dto = async (actor: PublicUser, row: Row, session: ClientSession, cache: ExecutionProjectionCache = new Map()): Promise<ExecutionWork> => executionWorkDto(row,
    await executionCached(cache, `state:${row._id}`, async () => VendorExecutionStateModel.findById(row._id).session(session).lean()) as Row | null,
    actor, await executionCached(cache, `policy:${row.projectId}`, () => readPolicy(row.projectId, session)), now(), session, readDaily, cache);
  async function page(actor: PublicUser, filter: Row, query: ExecutionQuery, session: ClientSession, project?: Row): Promise<ExecutionPage> {
    const parsed = executionQuerySchema.safeParse(query); if (!parsed.success) invalid("Execution filters are invalid.");
    const { limit, offset, q, vendorId, status, flag } = parsed.data;
    const rows = await VendorWorkAssignmentModel.find({ ...filter, status: { $ne: "superseded" } }).sort({ targetDate: 1, _id: 1 }).session(session).lean() as Row[];
    const cache: ExecutionProjectionCache = new Map();
    if (project) cache.set(`project:${project._id}`, Promise.resolve(project));
    const states = await VendorExecutionStateModel.find({ _id: { $in: rows.map(row => row._id) } }).session(session).lean() as Row[];
    const stateById = new Map(states.map(state => [String(state._id), state]));
    for (const row of rows) cache.set(`state:${row._id}`, Promise.resolve(stateById.get(String(row._id)) ?? null));
    await cacheLatestVendorReports(rows, stateById, session, cache);
    const items: ExecutionWork[] = [];
    const projectItems: ExecutionWork[] = [];
    for (const row of rows) {
      const item = await dto(actor, row, session, cache); if (item.status === "superseded") continue;
      projectItems.push(item);
      if (vendorId && item.vendorId !== vendorId) continue;
      if (status && item.status !== status || flag && !item.flags.includes(flag)) continue;
      if (q && ![item.itemName, item.roomName, item.vendorName, item.orderNumber, item.mainBasketName ?? "", item.subBasketName ?? ""].join(" ").toLocaleLowerCase().includes(q.toLocaleLowerCase())) continue;
      items.push(item);
    }
    return { project: project ? { id: String(project._id), name: project.name, status: project.status, completionAuthority: project.completionAuthority ?? "legacy_staff" } : null,
      projectCounts: project ? executionCounts(projectItems) : null, items: items.slice(offset, offset + limit), total: items.length, limit, offset, counts: executionCounts(items), policy: project ? await readPolicy(String(project._id), session) : null,
      canManagePolicy: Boolean(project && ["site_manager", "program_manager", "super_admin"].includes(actor.role)) };
  }
  return {
    listMine(actor, query = {}) { return transaction(async session => { await requireExecutionActor(actor, session); if (actor.role !== "vendor") executionNotFound(); return page(actor, { vendorId: actor.vendorId }, query, session); }); },
    project(actor, projectId, query = {}) { return transaction(async session => { const project = await requireExecutionProject(actor, projectId, session); return page(actor, { projectId }, query, session, project); }); },
    portfolio(actor, query = {}) { return transaction(async session => {
      if (actor.role === "vendor") executionNotFound(); const ids = await executionProjectIds(actor, session);
      const parsed = executionPortfolioQuerySchema.safeParse(query); if (!parsed.success) invalid("Execution filters are invalid.");
      const { limit, offset, q, projectScope, ...workFilters } = parsed.data;
      const projects = await ProjectModel.find({ ...(ids === null ? {} : { _id: { $in: ids } }), ...(projectScope === "current" ? { status: { $in: ["planning", "active", "on_hold"] } } : {}) }).sort({ name: 1, _id: 1 }).session(session).lean() as Row[];
      const matching = projects.filter(project => !q || String(project.name).toLowerCase().includes(q.toLowerCase()));
      const items = [];
      for (const project of matching.slice(offset, offset + limit)) { const work = await page(actor, { projectId: project._id }, { ...workFilters, offset: 0, limit: 1 }, session, project); items.push({ id: String(project._id), name: project.name, status: project.status, counts: work.counts }); }
      return { items, total: matching.length, limit, offset, deliveryHealth: actor.role === "super_admin" ? await input.readDeliveryHealth?.() ?? null : null };
    }); },
    detail(actor, assignmentId) { return transaction(async session => dto(actor, await assignmentFor(actor, assignmentId, session), session)); },
    history(actor, assignmentId, query = {}) { return transaction(async session => {
      await assignmentFor(actor, assignmentId, session); const parsed = executionQuerySchema.safeParse(query); if (!parsed.success) invalid("History pagination is invalid.");
      const { limit, offset } = parsed.data;
      const rows = await VendorExecutionEventModel.find({ assignmentId }).sort({ occurredAt: -1, version: -1, _id: -1 }).skip(offset).limit(limit).session(session).lean() as Row[];
      return { items: rows.map(row => ({ id: String(row._id), assignmentId, action: row.action, actorId: row.actorId, occurredAt: iso(row.occurredAt)!, executionRound: row.executionRound, localDate: row.localDate,
        note: row.note, reason: row.reason ?? null, nextAction: row.nextAction ?? null, startDate: row.startDate ?? null, finishDate: row.finishDate ?? null, reviewDate: row.reviewDate ?? null, progress: row.progress ?? null, status: row.status ?? null })), total: await VendorExecutionEventModel.countDocuments({ assignmentId }).session(session), limit, offset };
    }); },
    command(actor, assignmentId, value, projectId) { return transaction(async session => {
      const parsed = executionCommandSchema.safeParse(value); if (!parsed.success) invalid(parsed.error.issues.map(issue => issue.message).join(" "));
      const fields = parsed.data; const assignment = await assignmentFor(actor, assignmentId, session, true);
      if (projectId && assignment.projectId !== projectId) executionNotFound();
      const requestDigest = executionDigest(fields);
      const receipt = await VendorExecutionEventModel.findOne({ assignmentId, actorId: actor.id, idempotencyKey: fields.idempotencyKey }).session(session).lean();
      if (receipt) { if (receipt.requestDigest !== requestDigest) conflict("This request key was already used for a different execution update."); return dto(actor, assignment, session); }
      await assertCompletionReviewAllowsOrderChanges(assignment.projectId, session);
      let state = await VendorExecutionStateModel.findById(assignmentId).session(session).lean() as Row | null;
      const current = await executionWorkDto(assignment, state, actor, await readPolicy(assignment.projectId, session), now(), session, readDaily);
      if (!current.allowedActions.includes(fields.action)) throw new ApiError(403, "EXECUTION_ACTION_NOT_ALLOWED", "This execution action is not available to your role in the current work state.");
      if ((state?.version ?? 0) !== fields.expectedVersion) conflict();
      const at = now(); const policy = await readPolicy(assignment.projectId, session); const localDate = executionLocalDate(at, policy.timezone);
      if (!state) state = newState(assignment, at, null);
      const next: Row = { ...state, updatedAt: at, version: fields.action === "setup" ? 1 : state.version + 1 };
      const imageIds = fields.imageIds ?? [];
      if (imageIds.length) { const available = await currentExecutionImages(assignment, state, session); if (imageIds.some(id => !available.includes(id))) throw new ApiError(409, "EXECUTION_EVIDENCE_INVALID", "Completion evidence must belong to this assignment and current execution round."); }
      switch (fields.action) {
        case "setup": break;
        case "acknowledge": next.acknowledgedAt = at; next.accessAvailableAt = state.accessAvailableAt ?? at; next.status = "awaiting_schedule"; break;
        case "propose_schedule":
          if (state.schedule && !fields.reason) invalid("A schedule change needs a reason.");
          next.proposedSchedule = { startDate: fields.startDate, finishDate: fields.finishDate, reason: fields.reason ?? null }; break;
        case "confirm_schedule":
          if (state.schedule && !fields.reason) invalid("A schedule change needs a reason.");
          if (!state.proposedSchedule || fields.startDate !== state.proposedSchedule.startDate || fields.finishDate !== state.proposedSchedule.finishDate) invalid("Confirm the vendor's current proposed start and finish dates.");
          next.schedule = { startDate: fields.startDate, finishDate: fields.finishDate, revision: (state.schedule?.revision ?? 0) + 1, confirmedAt: at, confirmedById: actor.id };
          next.proposedSchedule = null;
          // A revised schedule does not erase obligations already established by the original commitment.
          next.reportingStartsOn = state.reportingStartsOn ?? [fields.startDate!, nextExecutionDate(localDate)].sort().at(-1);
          if (["assigned", "awaiting_schedule"].includes(state.status)) next.status = "not_started";
          break;
        case "report":
          if (fields.progress! <= state.progress && !fields.reason) invalid("No progress or a downward correction needs a reason.");
          if (fields.status === "not_started" && fields.progress !== 0) invalid("Not started work must have zero percent progress.");
          next.progress = fields.progress; next.latestNote = fields.note; next.latestReportAt = at; next.status = fields.status;
          await VendorWorkAssignmentModel.updateOne({ _id: assignmentId, version: assignment.version }, { $inc: { version: 1 }, $set: { progress: fields.progress, note: fields.note, lastUpdatedById: actor.id, updatedAt: at,
            ...(["awaiting_vendor_access", "ready", "in_progress", "changes_requested"].includes(assignment.status) ? { status: "in_progress" } : {}) } }, { session, timestamps: false });
          break;
        case "submit": {
          const images = fields.imageIds ?? await currentExecutionImages(assignment, state, session);
          if (!images.length && state.evidenceExemption?.executionRound !== state.executionRound) throw new ApiError(409, "EXECUTION_EVIDENCE_REQUIRED", "Add a current-round photo or request a Site Manager evidence exemption.");
          const id = `execution-review:${assignmentId}:${state.executionRound}`;
          await VendorExecutionReviewModel.create([{ _id: id, assignmentId, projectId: assignment.projectId, vendorId: assignment.vendorId, executionRound: state.executionRound, submissionVersion: next.version, submittedById: actor.id,
            submittedAt: at, note: fields.note, imageIds: images, evidenceExemptionReason: state.evidenceExemption?.reason ?? null, evidenceExemptionGrantedById: state.evidenceExemption?.grantedById ?? null }], { session });
          next.submissionId = id; next.status = "awaiting_verification"; next.latestNote = fields.note; break;
        }
        case "verify": case "request_changes": {
          if (fields.submissionId !== state.submissionId) conflict("Review the current completion submission before deciding.");
          if (fields.action === "verify") {
            const submitted = await VendorExecutionReviewModel.findById(fields.submissionId).session(session).lean() as Row | null;
            const available = await currentExecutionImages(assignment, state, session);
            if (!submitted || submitted.imageIds.some((id: string) => !available.includes(id)) || !submitted.imageIds.length && !submitted.evidenceExemptionReason) throw new ApiError(409, "EXECUTION_EVIDENCE_INVALID", "The submitted completion evidence is no longer valid.");
          }
          const review = await VendorExecutionReviewModel.findOneAndUpdate({ _id: fields.submissionId, assignmentId, executionRound: state.executionRound, decision: null }, { $set: { decision: { outcome: fields.action === "verify" ? "verified" : "changes_requested", actorId: actor.id, decidedAt: at, reason: fields.reason ?? null, idempotencyKey: fields.idempotencyKey } } }, { session, returnDocument: "after", runValidators: true }).lean();
          if (!review) conflict();
          if (fields.action === "verify") { next.status = "site_verified"; next.verificationId = fields.submissionId; }
          else { next.status = "changes_requested"; next.executionRound = state.executionRound + 1; next.roundStartedAt = at; next.submissionId = null; next.verificationId = null; next.evidenceExemption = null; next.latestReportAt = null; next.latestNote = fields.reason; next.reportingStartsOn = [state.schedule.startDate, nextExecutionDate(localDate)].sort().at(-1); }
          break;
        }
        case "hold":
          if (fields.reviewDate! <= localDate) invalid("A hold needs a future review date.");
          next.hold = { reason: fields.reason, startedAt: at, reviewDate: fields.reviewDate, grantedById: actor.id }; break;
        case "resume": next.hold = null; next.reportingStartsOn = state.schedule ? [state.schedule.startDate, nextExecutionDate(localDate)].sort().at(-1) : null; break;
        case "exempt_evidence": next.evidenceExemption = { reason: fields.reason, grantedById: actor.id, executionRound: state.executionRound }; break;
      }
      if (fields.action === "setup") await VendorExecutionStateModel.create([next], { session });
      else {
        const { _id, assignmentId: ignoredAssignment, projectId: ignoredProject, vendorId: ignoredVendor, workflowVersion: ignoredWorkflow, createdAt: ignoredCreated, ...updates } = next;
        const updated = await VendorExecutionStateModel.updateOne({ _id: assignmentId, version: fields.expectedVersion }, { $set: updates }, { session, runValidators: true }); if (updated.matchedCount !== 1) conflict();
      }
      await VendorExecutionEventModel.create([{ _id: `execution-event-${randomUUID()}`, assignmentId, projectId: assignment.projectId, vendorId: assignment.vendorId, actorId: actor.id, action: fields.action, occurredAt: at,
        localDate, timezone: policy.timezone, executionRound: next.executionRound, version: next.version, idempotencyKey: fields.idempotencyKey, requestDigest, note: fields.note ?? "", reason: fields.reason ?? null,
        nextAction: fields.nextAction ?? null, progress: next.progress, status: next.status, imageIds, startDate: fields.startDate ?? null, finishDate: fields.finishDate ?? null, reviewDate: fields.reviewDate ?? null, submissionId: fields.submissionId ?? next.submissionId }], { session });
      await input.audit.appendInMongoTransaction({ actorId: actor.id, action: ["verify", "request_changes"].includes(fields.action) ? "vendor_execution_decided" : "vendor_execution_updated", entityType: "vendor_work", entityId: assignmentId,
        occurredAt: at.toISOString(), newValues: { projectId: assignment.projectId, action: fields.action, executionRound: next.executionRound, version: next.version, status: next.status }, reason: fields.reason ?? null }, session);
      await change({ projectId: assignment.projectId, vendorId: assignment.vendorId, assignmentId, version: next.version, kind: fields.action, occurredAt: at }, session);
      return dto(actor, await VendorWorkAssignmentModel.findById(assignmentId).session(session).lean() as Row, session);
    }); }
  };
}
