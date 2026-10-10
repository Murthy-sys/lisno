import type { ExecutionPolicy } from "../contracts/vendor-execution.js";
import { VendorExecutionStateModel } from "../models/VendorExecutionState.js";
import { assertExecutionVerified, currentExecutionVerification, invalidateExecutionVerificationForClientChanges } from "./vendor-execution.service.js";
import { appendExecutionChange } from "./execution-change-events.js";
import { createHash } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type { ZodType } from "zod";
import {
  siteCompletionDecisionSchema, siteCompletionProgressSchema, siteCompletionSubmitSchema,
  type SiteCompletionDecisionInput, type SiteCompletionDto, type SiteCompletionProgressInput,
  type SiteCompletionReviewDto, type SiteCompletionSection, type SiteCompletionSubmitInput
} from "../domain/site-completion.js";
import { projectWorkflowSectionLabel } from "../domain/project-workflow.js";
import { ApiError } from "../middleware/errors.js";
import { ProjectModel } from "../models/Project.js";
import { SiteCompletionReviewModel } from "../models/SiteCompletionReview.js";
import { SiteCompletionStateModel } from "../models/SiteCompletionState.js";
import { UserModel } from "../models/User.js";
import { VendorWorkAssignmentModel } from "../models/VendorWorkAssignment.js";
import { VendorWorkImageModel } from "../models/VendorWorkImage.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { readProjectCompletionSummary } from "./project-completion.service.js";
import { needsSiteReverification } from "./site-completion-progress.js";

type Row = Record<string, any>;
const transaction = <T>(work: (session: ClientSession) => Promise<T>) => mongoose.connection.transaction(work,
  { readConcern: { level: "snapshot" }, readPreference: "primary" });
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const duplicateKey = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
const conflict = (message = "Project completion changed. Refresh before continuing."): never => {
  throw new ApiError(409, "SITE_COMPLETION_CONFLICT", message);
};
const forbidden = (): never => { throw new ApiError(403, "FORBIDDEN", "You cannot act on this project completion."); };
const missing = (): never => { throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found."); };
function validate<T>(schema: ZodType<T, any, any>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.",
    Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join("."), issue.message])));
  return parsed.data;
}

function reviewDto(row: Row): SiteCompletionReviewDto {
  return { id: String(row._id), projectId: String(row.projectId), round: Number(row.round), version: Number(row.version),
    status: row.status, progress: Number(row.progress), note: String(row.note), submittedAt: new Date(row.submittedAt).toISOString(),
    sections: row.sections.map((section: Row) => ({ assignmentId: String(section.assignmentId),
      sourceSectionId: String(section.sourceSectionId), sectionLabel: String(section.sectionLabel),
      roomName: String(section.roomName), itemName: String(section.itemName),
      scopeType: section.scopeType == null ? "Not specified" : String(section.scopeType),
      imageIds: section.imageIds.map(String) })),
    decision: row.decision ? { decision: row.decision.decision, reason: row.decision.reason ?? null,
      decidedAt: new Date(row.decision.decidedAt).toISOString() } : null };
}

async function projectFor(actor: PublicUser, projectId: string, role: "site_manager" | "client" | "super_admin", session: ClientSession): Promise<Row> {
  const user = await UserModel.findOne({ _id: actor.id, role: actor.role, active: true }).select({ _id: 1 }).session(session).lean();
  if (!user) throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  if (actor.role !== role) forbidden();
  const project = await ProjectModel.findById(projectId).session(session).lean() as Row | null;
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (role === "site_manager") {
    const task = await assignedSiteTask(projectId, session);
    if (task?.assigneeUserId !== actor.id) missing();
  }
  if (role === "client" && project.clientId !== actor.id) missing();
  if (project.completionAuthority !== "vendor_client" && role !== "client") conflict("This project does not use the current completion workflow.");
  return project;
}

async function assignedSiteTask(projectId: string, session: ClientSession): Promise<Row | null> {
  const tasks = await ProjectWorkflowTaskModel.find({ projectId, kind: "site_execution", assigneeRole: "site_manager" })
    .select({ assigneeUserId: 1 }).session(session).lean() as Row[];
  if (tasks.length > 1) conflict("The Site Manager assignment is inconsistent.");
  return tasks[0] ?? null;
}

function eligibility(summary: Awaited<ReturnType<typeof readProjectCompletionSummary>>): string[] {
  return summary.blockers.filter(item => item.code !== "VENDOR_WORK_PENDING" && item.code !== "SITE_COMPLETION_PENDING").map(item => item.message);
}

async function latestReview(projectId: string, round: number, session: ClientSession): Promise<Row | null> {
  if (!round) return null;
  return SiteCompletionReviewModel.findOne({ projectId, round }).session(session).lean() as Promise<Row | null>;
}

async function snapshot(projectId: string, session: ClientSession): Promise<SiteCompletionSection[]> {
  const assignments = await VendorWorkAssignmentModel.find({ projectId, status: { $ne: "superseded" } })
    .sort({ sourceSectionId: 1, roomName: 1, _id: 1 }).session(session).lean() as Row[];
  const sections: SiteCompletionSection[] = [];
  for (const assignment of assignments) {
    await assertExecutionVerified(assignment, session);
    const verification = await currentExecutionVerification(assignment, session);
    const images = await VendorWorkImageModel.find({ projectId, assignmentId: assignment._id, ...(verification ? { _id: { $in: verification.imageIds } } : {}) })
      .select({ _id: 1 }).sort({ uploadedAt: 1, _id: 1 }).session(session).lean();
    sections.push({ assignmentId: String(assignment._id), sourceSectionId: String(assignment.sourceSectionId),
      sectionLabel: projectWorkflowSectionLabel(String(assignment.sourceSectionId)), roomName: String(assignment.roomName),
      itemName: String(assignment.itemName),
      scopeType: assignment.scopeType == null ? "Not specified" : String(assignment.scopeType),
      imageIds: images.map(image => String(image._id)),
      ...(verification ? { executionVerificationId: verification.verificationId, executionRound: verification.executionRound, executionSubmissionVersion: verification.submissionVersion } : {}) });
  }
  return sections;
}

async function currentAssignments(projectId: string, session: ClientSession): Promise<Row[]> {
  const rows = await VendorWorkAssignmentModel.find({ projectId, status: { $ne: "superseded" } })
    .select({ _id: 1, createdAt: 1, status: 1, projectId: 1, vendorId: 1 }).sort({ _id: 1 }).session(session).lean() as Row[];
  const tracked = await VendorExecutionStateModel.find({ projectId }).select({ _id: 1 }).session(session).lean();
  const ids = new Set(tracked.map(row => String(row._id)));
  return rows.map(row => ({ ...row, executionTracked: ids.has(String(row._id)) }));
}

async function response(project: Row, session: ClientSession): Promise<SiteCompletionDto> {
  const projectId = String(project._id);
  const state = await SiteCompletionStateModel.findById(projectId).session(session).lean() as Row | null;
  if (project.completionAuthority !== "vendor_client") {
    if (state) conflict("The project completion authority conflicts with its saved review.");
    return { projectId, projectStatus: String(project.status), version: 0, progress: 0,
      note: "", status: "draft", currentRound: 0, canSubmit: false, needsReverification: false, blockers: [], review: null };
  }
  const review = state ? await latestReview(projectId, Number(state.currentRound), session) : null;
  let summary: Awaited<ReturnType<typeof readProjectCompletionSummary>> | null = null;
  try { summary = await readProjectCompletionSummary(projectId, session); }
  catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
  const blockers = summary ? eligibility(summary) : ["Wait for the approved estimate and Design plan before completing site work."];
  if (!(await assignedSiteTask(projectId, session))?.assigneeUserId) blockers.push("Assign a Site Manager before completing site work.");
  if (!project.clientId) blockers.push("Link the Client before sending completion for review.");
  if (project.status === "active" && state?.status === "pending_client") blockers.push("Completion is awaiting Client review.");
  if (project.status === "active" && state?.status === "client_approved") blockers.push("The Client accepted completion. Super Admin must close the project.");
  const needsReverification = needsSiteReverification(state, state?.progress === 100 ? await currentAssignments(projectId, session) : []);
  if (needsReverification) blockers.push("Approved work sections changed after the Site Manager marked 100%. Save 100% again to verify the current sections.");
  if (project.status === "active" && (!state || ["draft", "changes_requested"].includes(state.status))) {
    for (const assignment of await currentAssignments(projectId, session)) {
      if (assignment.executionTracked ? !(await currentExecutionVerification(assignment, session)) : !["client_approved", "submitted_for_client"].includes(assignment.status)) {
        blockers.push("Every current Main Line needs individual Site Manager verification in the Execution tracker."); break;
      }
    }
  }
  return { projectId, projectStatus: String(project.status), version: state ? Number(state.version) : 0,
    progress: state ? Number(state.progress) : 0, note: state ? String(state.note) : "",
    status: state?.status ?? "draft", currentRound: state ? Number(state.currentRound) : 0,
    canSubmit: project.status === "active" && Boolean(state && state.progress === 100 && ["draft", "changes_requested"].includes(state.status)) && blockers.length === 0,
    needsReverification, blockers, review: review ? reviewDto(review) : null };
}

async function incrementAuthority(project: Row, session: ClientSession): Promise<void> {
  const changed = await ProjectModel.updateOne({ _id: project._id, status: "active", managerId: project.managerId,
    clientId: project.clientId, completionAuthority: "vendor_client", completionAuthorityVersion: project.completionAuthorityVersion,
    completionDecisionId: null }, { $inc: { completionAuthorityVersion: 1 } }, { session });
  if (changed.matchedCount !== 1) conflict();
}

export interface SiteCompletionService {
  read(actor: PublicUser, projectId: string, role: "site_manager" | "client" | "super_admin"): Promise<SiteCompletionDto>;
  progress(actor: PublicUser, projectId: string, input: SiteCompletionProgressInput): Promise<SiteCompletionDto>;
  submit(actor: PublicUser, projectId: string, input: SiteCompletionSubmitInput): Promise<SiteCompletionDto>;
  decide(actor: PublicUser, projectId: string, input: SiteCompletionDecisionInput): Promise<SiteCompletionDto>;
}

export function createSiteCompletionService(input: { audit: AuditService; now?: () => Date; readExecutionPolicy?: (projectId: string, session: ClientSession) => Promise<ExecutionPolicy> }): SiteCompletionService {
  const now = input.now ?? (() => new Date());
  return {
    read(actor, projectId, role) { return transaction(async session => response(await projectFor(actor, projectId, role, session), session)); },
    async progress(actor, projectId, value) {
      const fields = validate(siteCompletionProgressSchema, value);
      const requestDigest = digest({ projectId, ...fields });
      try { return await transaction(async session => {
        const project = await projectFor(actor, projectId, "site_manager", session);
        if (project.status !== "active") conflict("A completed or paused project cannot receive progress updates.");
        await readProjectCompletionSummary(projectId, session);
        const state = await SiteCompletionStateModel.findById(projectId).session(session).lean() as Row | null;
        if (state?.lastProgressKey === fields.idempotencyKey) {
          if (state.lastProgressDigest !== requestDigest) conflict("This request key was used for another progress update.");
          return response(project, session);
        }
        if ((state?.version ?? 0) !== fields.expectedVersion || state && !["draft", "changes_requested"].includes(state.status)) conflict();
        const at = now();
        const verifiedAssignmentIds = fields.progress === 100
          ? (await currentAssignments(projectId, session)).map(row => String(row._id)) : null;
        if (state) {
          const changed = await SiteCompletionStateModel.updateOne({ _id: projectId, version: fields.expectedVersion,
            status: { $in: ["draft", "changes_requested"] } }, { $set: { progress: fields.progress, note: fields.note,
              updatedById: actor.id, updatedAt: at, verifiedAssignmentIds,
              lastProgressKey: fields.idempotencyKey, lastProgressDigest: requestDigest },
            $inc: { version: 1 } }, { session });
          if (changed.matchedCount !== 1) conflict();
        } else {
          if (fields.expectedVersion !== 0) conflict();
          await SiteCompletionStateModel.create([{ _id: projectId, projectId, version: 1, progress: fields.progress,
            note: fields.note, status: "draft", currentRound: 0, updatedById: actor.id, updatedAt: at,
            verifiedAssignmentIds,
            lastProgressKey: fields.idempotencyKey, lastProgressDigest: requestDigest }], { session });
        }
        await incrementAuthority(project, session);
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "site_completion_progress_updated",
          entityType: "site_completion", entityId: projectId, occurredAt: at.toISOString(),
          newValues: { projectId, progress: fields.progress, version: fields.expectedVersion + 1,
            verifiedAssignmentIds } }, session);
        return response({ ...project, completionAuthorityVersion: Number(project.completionAuthorityVersion) + 1 }, session);
      }); } catch (error) {
        if (!duplicateKey(error)) throw error;
        return transaction(async session => {
          const project = await projectFor(actor, projectId, "site_manager", session);
          const state = await SiteCompletionStateModel.findById(projectId).session(session).lean() as Row | null;
          if (state?.lastProgressKey === fields.idempotencyKey && state.lastProgressDigest === requestDigest)
            return response(project, session);
          throw new ApiError(409, "SITE_COMPLETION_CONFLICT", "Project completion changed. Refresh before continuing.");
        });
      }
    },
    async submit(actor, projectId, value) {
      const fields = validate(siteCompletionSubmitSchema, value);
      const requestDigest = digest({ projectId, ...fields });
      try { return await transaction(async session => {
        const project = await projectFor(actor, projectId, "site_manager", session);
        if (project.status !== "active" || !project.clientId) conflict("An active project with a linked Client is required.");
        const state = await SiteCompletionStateModel.findById(projectId).session(session).lean() as Row | null;
        const prior = await SiteCompletionReviewModel.findOne({ projectId, submitKey: fields.idempotencyKey })
          .session(session).lean() as Row | null;
        if (prior?.submitKey === fields.idempotencyKey) {
          if (prior.submitDigest !== requestDigest) conflict("This request key was used for another completion submission.");
          return response(project, session);
        }
        if (!state) throw new ApiError(409, "SITE_COMPLETION_CONFLICT", "Save 100% progress before submitting completion.");
        if (state.version !== fields.expectedVersion || state.progress !== 100 || !["draft", "changes_requested"].includes(state.status)) conflict("Save 100% progress, then refresh before submitting completion.");
        if (needsSiteReverification(state, await currentAssignments(projectId, session)))
          conflict("Approved work sections changed. Save 100% again before submitting completion.");
        const summary = await readProjectCompletionSummary(projectId, session);
        const blockers = eligibility(summary);
        if (blockers.length) throw new ApiError(409, "SITE_COMPLETION_BLOCKED", blockers.join(" "));
        const sections = await snapshot(projectId, session);
        if (summary.vendorWork.totalAssignments !== sections.length) conflict("The approved work sections changed. Refresh before submitting.");
        const round = Number(state.currentRound) + 1;
        const at = now();
        await SiteCompletionReviewModel.create([{ _id: `site-completion-review:${projectId}:${round}`, projectId,
          clientId: project.clientId, managerId: actor.id, round, estimateId: summary.estimateSource.estimateId,
          estimateVersion: summary.estimateSource.estimateVersion, estimateReviewRoundId: summary.estimateSource.estimateReviewRoundId,
          approvedRevisionIds: summary.approvedOrders.map(order => order.revisionId),
          sourceLineItemKeys: summary.scope.map(line => line.sourceLineItemKey), sections,
          progress: 100, note: fields.note, submittedById: actor.id, submittedAt: at,
          submitKey: fields.idempotencyKey, submitDigest: requestDigest,
          status: "pending", version: 1, decision: null }], { session });
        const changed = await SiteCompletionStateModel.updateOne({ _id: projectId, version: fields.expectedVersion,
          status: { $in: ["draft", "changes_requested"] }, progress: 100 },
        { $set: { status: "pending_client", currentRound: round, note: fields.note, updatedById: actor.id, updatedAt: at },
          $inc: { version: 1 } }, { session });
        if (changed.matchedCount !== 1) conflict();
        await incrementAuthority(project, session);
        await appendExecutionChange({ projectId, version: state.version + 1, kind: "site_completion_submitted", occurredAt: at }, session);
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "site_completion_submitted",
          entityType: "site_completion", entityId: `site-completion-review:${projectId}:${round}`,
          occurredAt: at.toISOString(), newValues: { projectId, round, estimateId: summary.estimateSource.estimateId,
            estimateVersion: summary.estimateSource.estimateVersion, sectionCount: sections.length } }, session);
        return response({ ...project, completionAuthorityVersion: Number(project.completionAuthorityVersion) + 1 }, session);
      }); } catch (error) {
        if (!duplicateKey(error)) throw error;
        return transaction(async session => {
          const project = await projectFor(actor, projectId, "site_manager", session);
          const prior = await SiteCompletionReviewModel.findOne({ projectId, submitKey: fields.idempotencyKey })
            .session(session).lean() as Row | null;
          if (prior?.submitDigest === requestDigest) return response(project, session);
          throw new ApiError(409, "SITE_COMPLETION_CONFLICT", "Project completion changed. Refresh before continuing.");
        });
      }
    },
    decide(actor, projectId, value) {
      const fields = validate(siteCompletionDecisionSchema, value);
      const requestDigest = digest({ projectId, ...fields });
      return transaction(async session => {
        const project = await projectFor(actor, projectId, "client", session);
        if (project.status !== "active") conflict("This project is already completed or paused.");
        const state = await SiteCompletionStateModel.findById(projectId).session(session).lean() as Row | null;
        const review = state ? await latestReview(projectId, Number(state.currentRound), session) : null;
        if (review?.decision?.idempotencyKey === fields.idempotencyKey) {
          if (review.decision.requestDigest !== requestDigest) conflict("This request key was used for another decision.");
          return response(project, session);
        }
        if (!state || !review) throw new ApiError(409, "SITE_COMPLETION_CONFLICT", "Project completion changed. Refresh before continuing.");
        if (state.status !== "pending_client" || review.status !== "pending" ||
            review.version !== fields.expectedVersion || review.clientId !== actor.id) conflict();
        const summary = await readProjectCompletionSummary(projectId, session);
        if ((await assignedSiteTask(projectId, session))?.assigneeUserId !== review.managerId) conflict("The assigned Site Manager changed during Client review.");
        if (eligibility(summary).length || summary.estimateSource.estimateId !== review.estimateId ||
            summary.estimateSource.estimateVersion !== review.estimateVersion ||
            summary.estimateSource.estimateReviewRoundId !== review.estimateReviewRoundId ||
            JSON.stringify(summary.approvedOrders.map(order => order.revisionId)) !== JSON.stringify(review.approvedRevisionIds) ||
            JSON.stringify(summary.scope.map(line => line.sourceLineItemKey)) !== JSON.stringify(review.sourceLineItemKeys)) {
          conflict("Approved scope or purchase orders changed during Client review.");
        }
        const at = now();
        const changedReview = await SiteCompletionReviewModel.updateOne({ _id: review._id, version: fields.expectedVersion,
          status: "pending", decision: null }, { $set: { status: fields.decision === "approve" ? "approved" : "changes_requested",
            decision: { decision: fields.decision, reason: fields.reason, actorId: actor.id, decidedAt: at,
              idempotencyKey: fields.idempotencyKey, requestDigest } }, $inc: { version: 1 } }, { session });
        if (changedReview.matchedCount !== 1) conflict();
        const changedState = await SiteCompletionStateModel.updateOne({ _id: projectId, version: state.version,
          currentRound: review.round, status: "pending_client" },
        { $set: { status: fields.decision === "approve" ? "client_approved" : "changes_requested",
          progress: fields.decision === "approve" ? 100 : 0,
          verifiedAssignmentIds: fields.decision === "approve" ? state.verifiedAssignmentIds ?? null : null,
          updatedById: actor.id, updatedAt: at },
          $inc: { version: 1 } }, { session });
        if (changedState.matchedCount !== 1) conflict();
        if (fields.decision === "request_changes") {
          for (const section of review.sections) await invalidateExecutionVerificationForClientChanges(String(section.assignmentId), actor.id, fields.reason ?? "Client requested changes", session, at, await input.readExecutionPolicy?.(projectId, session));
        }
        await appendExecutionChange({ projectId, version: state.version + 1, kind: "site_client_decision", occurredAt: at }, session);
        await incrementAuthority(project, session);
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "client_site_completion_decided",
          entityType: "site_completion", entityId: String(review._id), occurredAt: at.toISOString(),
          newValues: { projectId, round: review.round, decision: fields.decision }, reason: fields.reason }, session);
        return response({ ...project, completionAuthorityVersion: Number(project.completionAuthorityVersion) + 1 }, session);
      });
    }
  };
}
