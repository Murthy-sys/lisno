import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type {
  AssignmentPagination, CancelDesignerAssignmentRequestInput, CreateDesignerAssignmentRequestInput,
  DecideDesignerAssignmentRequestInput, DesignerAssignmentEvidence, DesignerAssignmentInboxItem,
  DesignerAssignmentInboxPage, DesignerAssignmentRequestPage, DesignerAssignmentRequestStatus,
  DesignerAssignmentRequestSummary, DesignerSuggestion, DesignerSuggestionsPage
} from "../contracts/designer-assignment.js";
import { compareDesignerSuggestions, designerAssignmentRevision, designerLanguage, designerLanguageMatch,
  designerLocationMatch, normalizeDesignerMatchText } from "../domain/designer-assignment.js";
import { confirmedCity } from "../domain/procurement-city.js";
import { ApiError } from "../middleware/errors.js";
import { DesignerAssignmentRequestModel } from "../models/DesignerAssignmentRequest.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { EstimateModel } from "../models/Estimate.js";
import { ProjectModel } from "../models/Project.js";
import { UserModel } from "../models/User.js";
import { createMongoRepository } from "../repositories/mongo.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { applyAcceptedDesignerAssignment, readDesignerAssignmentSource, type DesignerAssignmentSource } from "./project-workflow.service.js";

type Row = Record<string, any>;
export interface AssignmentPageQuery { limit?: number; offset?: number }
export interface DesignerAssignmentService {
  suggestions(actor: PublicUser, projectId: string, query?: AssignmentPageQuery & { search?: string }): Promise<DesignerSuggestionsPage>;
  listProjectRequests(actor: PublicUser, projectId: string, query?: AssignmentPageQuery): Promise<DesignerAssignmentRequestPage>;
  createRequest(actor: PublicUser, projectId: string, input: CreateDesignerAssignmentRequestInput): Promise<DesignerAssignmentRequestSummary>;
  cancelRequest(actor: PublicUser, projectId: string, requestId: string, input: CancelDesignerAssignmentRequestInput): Promise<DesignerAssignmentRequestSummary>;
  listInbox(actor: PublicUser, query?: AssignmentPageQuery & { status?: DesignerAssignmentRequestStatus }): Promise<DesignerAssignmentInboxPage>;
  decideRequest(actor: PublicUser, requestId: string, input: DecideDesignerAssignmentRequestInput): Promise<DesignerAssignmentInboxItem>;
}

const conflict = (message = "The assignment changed. Refresh before trying again.") => new ApiError(409, "DESIGN_ASSIGNMENT_CONFLICT", message);
const notFound = () => new ApiError(404, "DESIGN_ASSIGNMENT_REQUEST_NOT_FOUND", "Assignment request not found.");
function page(query: AssignmentPageQuery = {}) { return { limit: Math.max(1, Math.min(100, query.limit ?? 20)), offset: Math.max(0, query.offset ?? 0) }; }
function pagination(query: AssignmentPageQuery, total: number): AssignmentPagination { const range = page(query); return { ...range, total, hasMore: range.offset + range.limit < total }; }
function iso(value: unknown): string { return new Date(value as string | Date).toISOString(); }
function textOrNull(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

async function requireRole(actor: PublicUser, role: "super_admin" | "designer", session?: mongoose.ClientSession) {
  if (actor.role !== role || !await UserModel.exists({ _id: actor.id, role, active: true, deletedAt: null }).session(session ?? null))
    throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
}

async function requireProject(projectId: string, session?: mongoose.ClientSession) {
  if (!await ProjectModel.exists({ _id: projectId }).session(session ?? null)) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
}

async function transaction<T>(operation: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      await createMongoRepository(session).coordinateAuthorizationMutation();
      result = await operation(session);
    });
    return result;
  } catch (error) {
    if ((error as { code?: unknown }).code === 11000) throw conflict("An assignment request already exists for this Designer or retry key. Refresh the project.");
    throw error;
  } finally { await session.endSession(); }
}

function summary(request: Row): DesignerAssignmentRequestSummary {
  return { id: String(request._id), projectId: String(request.projectId), projectName: request.safePreview.projectName,
    designer: { id: request.designerId, name: request.designerName }, status: request.status,
    version: request.version, createdAt: iso(request.createdAt), decidedAt: request.decidedAt ? iso(request.decidedAt) : null,
    note: request.decisionNote ?? null, closureReason: request.closureReason ?? null };
}

function inboxItem(request: Row): DesignerAssignmentInboxItem {
  return { id: String(request._id), projectId: String(request.projectId), projectName: request.safePreview.projectName,
    projectLocation: request.safePreview.projectLocation ?? null, preferredLanguage: designerLanguage(request.safePreview.preferredLanguage),
    scopeSummary: { itemCount: request.safePreview.scopeSummary.itemCount, sectionCount: request.safePreview.scopeSummary.sectionCount,
      roomCount: request.safePreview.scopeSummary.roomCount }, status: request.status, version: request.version,
    createdAt: iso(request.createdAt), decidedAt: request.decidedAt ? iso(request.decidedAt) : null,
    canDecide: request.status === "pending", closureReason: request.closureReason ?? null,
    blockedReason: request.status === "pending" ? null : request.closureReason === "assigned_elsewhere"
      ? "This request is no longer available because the project has been assigned." : "This request has already been decided." };
}

function assertSource(source: DesignerAssignmentSource, expected: string) {
  if (!source.canRequest || !source.sourceRevision || source.sourceRevision !== expected)
    throw new ApiError(409, "DESIGN_ASSIGNMENT_SOURCE_CHANGED", source.blockedReason ?? "The project or quotation changed. Refresh the suggestions before sending or accepting a request.");
}

async function safePreview(source: DesignerAssignmentSource, session: mongoose.ClientSession) {
  const reference = source.quotationApproval?.currentQuotationApproval?.reviewRoundId ?? source.estimate?.estimation?.preApproval?.reviewRoundId;
  const approved = reference ? await EstimateClientReviewRoundModel.findById(reference).session(session).lean() : null;
  if (reference && (!approved || !approved.estimateSnapshot || approved.status !== "approved" ||
      String(approved.estimateId) !== String(source.estimate?._id) || String(approved.projectId) !== String(source.project._id)))
    throw new ApiError(409, "DESIGN_ASSIGNMENT_SOURCE_CHANGED", "The approved quotation snapshot is unavailable. Resolve the source before sending a request.");
  const scope = approved?.estimateSnapshot ?? source.estimate;
  const lines: Row[] = (scope?.lineItems ?? []).filter((line: Row) => line.included !== false && line.clientVisible !== false);
  return { projectName: String(source.project.name), projectLocation: textOrNull(source.project.location),
    preferredLanguage: designerLanguage(source.lead?.preferredLanguage), scopeSummary: {
      itemCount: lines.length,
      sectionCount: new Set(lines.map(line => line.mainBasketId ?? line.category).filter(Boolean)).size,
      roomCount: new Set(lines.map(line => line.roomId ?? line.roomName).filter(Boolean)).size
    } };
}

export function createDesignerAssignmentService(input: { audit: AuditService; now?: () => Date }): DesignerAssignmentService {
  const now = input.now ?? (() => new Date());
  return {
    async suggestions(actor, projectId, query = {}) {
      await requireRole(actor, "super_admin");
      const source = await readDesignerAssignmentSource(projectId);
      const [designers, counts, pending] = await Promise.all([
        UserModel.find({ role: "designer", active: true, deletedAt: null }).select({ _id: 1, name: 1, location: 1, languagesKnown: 1, preferredLanguage: 1 }).lean(),
        ProjectModel.aggregate<{ _id: string; count: number }>([
          { $match: { status: { $ne: "completed" } } },
          { $project: { designerIds: { $setUnion: [{ $ifNull: ["$assignedDesignerIds", []] }, { $ifNull: ["$secondaryDesignerIds", []] },
            { $cond: [{ $ne: [{ $ifNull: ["$primaryDesignerId", null] }, null] }, ["$primaryDesignerId"], []] }] } } },
          { $unwind: "$designerIds" }, { $match: { designerIds: { $ne: "" } } }, { $group: { _id: "$designerIds", count: { $sum: 1 } } }
        ]),
        DesignerAssignmentRequestModel.find({ projectId, status: "pending" }).sort({ createdAt: 1, _id: 1 }).lean()
      ]);
      const workload = new Map(counts.map(count => [count._id, count.count]));
      const currentId = textOrNull(source.estimate?.designPlanDesignerId);
      const current = currentId ? await UserModel.findById(currentId).select({ _id: 1, name: 1 }).lean() : null;
      const language = designerLanguage(source.lead?.preferredLanguage);
      let city: string | null = null;
      try { const confirmed = confirmedCity(source.project.cityName); if (confirmed && confirmed.key === source.project.cityKey) city = confirmed.name; } catch { /* An unconfirmed city is not a matching authority. */ }
      const blockedReason = source.blockedReason;
      const pendingDesignerIds = new Set(pending.map(request => String(request.designerId)));
      const items: DesignerSuggestion[] = designers.map(designer => {
        const id = String(designer._id);
        const reason = blockedReason ?? (id === currentId ? "This Designer is already assigned."
          : pendingDesignerIds.has(id) ? "An assignment request is awaiting this Designer's response." : null);
        const known = (designer.languagesKnown as unknown[] ?? []).map(designerLanguage).filter((value): value is NonNullable<typeof value> => value !== null);
        return { id, name: String(designer.name), activeProjectCount: workload.get(id) ?? 0,
          languagesKnown: known, preferredLanguage: designerLanguage(designer.preferredLanguage), location: textOrNull(designer.location),
          languageMatch: designerLanguageMatch(language, designer.preferredLanguage, known),
          locationMatch: designerLocationMatch(designer.location, source.project.location, city), eligible: reason === null, blockedReason: reason };
      }).filter(designer => !query.search || normalizeDesignerMatchText(designer.name).includes(normalizeDesignerMatchText(query.search)))
        .sort(compareDesignerSuggestions);
      const range = page(query);
      return { projectId, serverNow: now().toISOString(), sourceRevision: source.sourceRevision,
        projectPreferredLanguage: language, projectLocation: textOrNull(source.project.location), projectCity: city,
        currentDesigner: current ? { id: String(current._id), name: String(current.name) } : null,
        pendingRequests: pending.map(summary), pendingRequest: pending.length === 1 ? summary(pending[0]!) : null,
        canRequest: source.canRequest, blockedReason,
        items: items.slice(range.offset, range.offset + range.limit), pagination: pagination(query, items.length) };
    },

    async listProjectRequests(actor, projectId, query = {}) {
      await requireRole(actor, "super_admin");
      await requireProject(projectId);
      const range = page(query);
      const [requests, total] = await Promise.all([
        DesignerAssignmentRequestModel.find({ projectId }).sort({ createdAt: -1, _id: 1 }).skip(range.offset).limit(range.limit).lean(),
        DesignerAssignmentRequestModel.countDocuments({ projectId })
      ]);
      return { items: requests.map(summary), pagination: pagination(query, total) };
    },

    async createRequest(actor, projectId, command) {
      return transaction(async session => {
        await requireRole(actor, "super_admin", session);
        await requireProject(projectId, session);
        const replay = await DesignerAssignmentRequestModel.findOne({ projectId, proposedById: actor.id, createIdempotencyKey: command.idempotencyKey }).session(session).lean();
        if (replay) {
          if (replay.designerId !== command.designerId || replay.sourceRevision !== command.expectedSourceRevision) throw conflict("This idempotency key was already used for a different assignment request.");
          return summary(replay);
        }
        // Shared with acceptance so an old-source create cannot survive the winning assignment.
        await ProjectModel.updateOne({ _id: projectId }, { $inc: { estimationFenceEpoch: 1 } }, { session, timestamps: false });
        const source = await readDesignerAssignmentSource(projectId, session);
        assertSource(source, command.expectedSourceRevision);
        if (source.estimate?.designPlanDesignerId === command.designerId) throw conflict("This Designer is already assigned.");
        const designer = await UserModel.findOne({ _id: command.designerId, role: "designer", active: true, deletedAt: null }).session(session).lean();
        if (!designer) throw new ApiError(409, "DESIGNER_NOT_ASSIGNABLE", "Choose an active Designer.");
        if (await DesignerAssignmentRequestModel.exists({ projectId, designerId: command.designerId, status: "pending" }).session(session))
          throw conflict("A request is already awaiting this Designer's response.");
        const at = now();
        const request = { _id: `designer-assignment-${randomUUID()}`, projectId, estimateId: String(source.estimate!._id),
          sourceRevision: source.sourceRevision!, sourceSnapshot: source.sourceSnapshot!, designerId: command.designerId,
          designerName: String(designer.name), proposedById: actor.id, previousDesignerId: source.estimate?.designPlanDesignerId || null,
          safePreview: await safePreview(source, session), status: "pending", version: 1, createIdempotencyKey: command.idempotencyKey,
          decisionIdempotencyKey: null, decisionPayloadDigest: null, decidedById: null, decisionNote: null,
          closureReason: null, createdAt: at, decidedAt: null };
        await DesignerAssignmentRequestModel.create([request], { session });
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "designer_assignment_requested", entityType: "project", entityId: projectId,
          occurredAt: at.toISOString(), newValues: { requestId: request._id, designerId: command.designerId, estimateId: request.estimateId, sourceRevision: request.sourceRevision } }, session);
        return summary(request);
      });
    },

    async cancelRequest(actor, projectId, requestId, command) {
      return transaction(async session => {
        await requireRole(actor, "super_admin", session);
        await requireProject(projectId, session);
        const request = await DesignerAssignmentRequestModel.findOne({ _id: requestId, projectId }).session(session).lean();
        if (!request) throw notFound();
        const digest = designerAssignmentRevision({ action: "cancel", expectedVersion: command.expectedVersion });
        if (request.status === "cancelled" && request.decidedById === actor.id && request.decisionIdempotencyKey === command.idempotencyKey && request.decisionPayloadDigest === digest) return summary(request);
        if (request.status !== "pending" || request.version !== command.expectedVersion) throw conflict();
        const at = now();
        const next = await DesignerAssignmentRequestModel.findOneAndUpdate({ _id: requestId, projectId, status: "pending", version: command.expectedVersion },
          { $set: { status: "cancelled", closureReason: "cancelled_by_admin", decidedAt: at, decidedById: actor.id,
            decisionIdempotencyKey: command.idempotencyKey, decisionPayloadDigest: digest }, $inc: { version: 1 } },
          { returnDocument: "after", session, runValidators: true }).lean();
        if (!next) throw conflict();
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "designer_assignment_cancelled", entityType: "project", entityId: projectId,
          occurredAt: at.toISOString(), oldValues: { requestId, status: "pending" },
          newValues: { requestId, status: "cancelled", closureReason: "cancelled_by_admin" } }, session);
        return summary(next);
      });
    },

    async listInbox(actor, query = {}) {
      await requireRole(actor, "designer");
      const filter = { designerId: actor.id, status: query.status ?? "pending" };
      const range = page(query);
      const [requests, total] = await Promise.all([
        DesignerAssignmentRequestModel.find(filter).sort({ createdAt: -1, _id: 1 }).skip(range.offset).limit(range.limit).lean(),
        DesignerAssignmentRequestModel.countDocuments(filter)
      ]);
      const items = await Promise.all(requests.map(async request => {
        const item = inboxItem(request);
        if (request.status !== "pending") return item;
        try {
          const source = await readDesignerAssignmentSource(String(request.projectId));
          assertSource(source, String(request.sourceRevision));
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          item.canDecide = false;
          item.blockedReason = "The project or quotation changed. Ask your team to cancel this request and send a new one.";
        }
        return item;
      }));
      return { items, pagination: pagination(query, total) };
    },

    async decideRequest(actor, requestId, command) {
      return transaction(async session => {
        await requireRole(actor, "designer", session);
        const request = await DesignerAssignmentRequestModel.findOne({ _id: requestId, designerId: actor.id }).session(session).lean();
        if (!request) throw notFound();
        const note = command.decision === "decline" ? command.note?.trim() || null : null;
        const digest = designerAssignmentRevision({ decision: command.decision, expectedVersion: command.expectedVersion, note });
        const status = command.decision === "accept" ? "accepted" : "declined";
        if (request.status === status && request.decidedById === actor.id && request.decisionIdempotencyKey === command.idempotencyKey && request.decisionPayloadDigest === digest) return inboxItem(request);
        if (request.status === "cancelled" && request.closureReason === "assigned_elsewhere")
          throw conflict("This request is no longer available because the project has been assigned. Refresh your requests.");
        if (request.status !== "pending" || request.version !== command.expectedVersion) throw conflict();
        const at = now();
        if (command.decision === "accept") {
          await ProjectModel.updateOne({ _id: request.projectId }, { $inc: { estimationFenceEpoch: 1 } }, { session, timestamps: false });
          if (!await UserModel.exists({ _id: request.proposedById, role: "super_admin", active: true, deletedAt: null }).session(session))
            throw conflict("The proposing Super Admin is no longer active. Ask for a new request.");
          const source = await readDesignerAssignmentSource(String(request.projectId), session);
          assertSource(source, String(request.sourceRevision));
          if (String(source.estimate?._id) !== request.estimateId) throw conflict();
          await applyAcceptedDesignerAssignment({ actor, proposerId: String(request.proposedById), designerId: actor.id,
            source, assignedAt: at, audit: input.audit }, session);
        }
        const next = await DesignerAssignmentRequestModel.findOneAndUpdate({ _id: requestId, designerId: actor.id, status: "pending", version: command.expectedVersion },
          { $set: { status, decidedAt: at, decidedById: actor.id, decisionIdempotencyKey: command.idempotencyKey, decisionPayloadDigest: digest, decisionNote: note }, $inc: { version: 1 } },
          { returnDocument: "after", session, runValidators: true }).lean();
        if (!next) throw conflict();
        if (command.decision === "accept") {
          const competing = await DesignerAssignmentRequestModel.find({ projectId: request.projectId, status: "pending" })
            .select({ _id: 1, version: 1 }).sort({ _id: 1 }).session(session).lean();
          if (competing.length) {
            const closed = await DesignerAssignmentRequestModel.updateMany({ projectId: request.projectId, status: "pending", _id: { $in: competing.map(row => row._id) } },
              { $set: { status: "cancelled", closureReason: "assigned_elsewhere", decidedAt: at, decidedById: actor.id,
                decisionIdempotencyKey: null, decisionPayloadDigest: null, decisionNote: null }, $inc: { version: 1 } },
              { session, runValidators: true });
            if (closed.modifiedCount !== competing.length) throw conflict();
            for (const sibling of competing) {
              await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "designer_assignment_cancelled", entityType: "project",
                entityId: String(request.projectId), occurredAt: at.toISOString(), oldValues: { requestId: String(sibling._id), status: "pending", version: sibling.version },
                newValues: { requestId: String(sibling._id), status: "cancelled", version: sibling.version + 1,
                  closureReason: "assigned_elsewhere", acceptedRequestId: requestId, automatic: true } }, session);
            }
          }
        }
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: command.decision === "accept" ? "designer_assignment_accepted" : "designer_assignment_declined",
          entityType: "project", entityId: String(request.projectId), occurredAt: at.toISOString(), oldValues: { requestId, status: "pending" },
          newValues: { requestId, status, designerId: actor.id, proposedById: request.proposedById } }, session);
        return inboxItem(next);
      });
    }
  };
}

/** Internal evidence for safe workflow projections. Pending requests grant no project membership. */
export async function readDesignerAssignmentEvidence(projectId: string, session?: mongoose.ClientSession): Promise<DesignerAssignmentEvidence> {
  const project = await ProjectModel.findById(projectId).select({ primaryDesignerId: 1, assignedDesignerIds: 1 }).session(session ?? null).lean();
  const pending = await DesignerAssignmentRequestModel.find({ projectId, status: "pending" }).sort({ createdAt: 1, _id: 1 }).session(session ?? null).lean();
  const designerId = project?.primaryDesignerId ?? (project?.assignedDesignerIds?.length === 1 ? project.assignedDesignerIds[0] : null);
  const accepted = designerId ? await DesignerAssignmentRequestModel.findOne({ projectId, designerId, status: "accepted" }).sort({ decidedAt: -1, _id: 1 }).session(session ?? null).lean() : null;
  const assignment = accepted ? await EstimateModel.exists({ _id: accepted.estimateId, projectId, designPlanDesignerId: designerId,
    designPlanAssignedAt: accepted.decidedAt }).session(session ?? null) : null;
  return { pendingRequests: pending.map(request => ({ id: String(request._id), designerId: String(request.designerId), version: request.version, createdAt: iso(request.createdAt) })),
    acceptedRequest: accepted && assignment ? { id: String(accepted._id), designerId: String(accepted.designerId), acceptedAt: iso(accepted.decidedAt) } : null };
}
