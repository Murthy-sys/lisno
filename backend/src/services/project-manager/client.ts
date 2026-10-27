import { resolveProjectManagerAssignment } from "../project-manager-assignment.service.js";
import type { ClientSession } from "mongoose";
import type { ZodType } from "zod";
import type { PMAction, PMItem, PMPanel, PMPerson } from "../../contracts/project-manager.js";
import { approvedEstimateLineItemKey } from "../../domain/estimate-line-item.js";
import {
  nextEscalationStatus, nextSnagStatus, pmClientQuerySchema, pmEscalationActionSchema,
  pmEscalationCreateSchema, pmSnagActionSchema, pmSnagCreateSchema, pmSnagVisitSchema, pmSnagQuerySchema
} from "../../domain/project-manager/client.js";
import { ApiError } from "../../middleware/errors.js";
import { ProjectClientEscalationModel } from "../../models/ProjectClientEscalation.js";
import { ProjectSnagModel } from "../../models/ProjectSnag.js";
import { ProjectSnagVisitModel } from "../../models/ProjectSnagVisit.js";
import { ProjectWorkflowTaskModel } from "../../models/ProjectWorkflowTask.js";
import { ProjectPurchaseOrderModel } from "../../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../../models/ProjectPurchaseOrderRevision.js";
import { UserModel } from "../../models/User.js";
import { VendorWorkAssignmentModel } from "../../models/VendorWorkAssignment.js";
import { EstimateClientReviewRoundModel } from "../../models/EstimateClientReviewRound.js";
import { EstimateModel } from "../../models/Estimate.js";
import { AiEstimatorKnowledgeVendorModel } from "../../models/AiEstimatorKnowledgeVendor.js";
import type { PublicUser } from "../auth.service.js";
import { assertPMEvidence } from "./evidence.js";
import {
  pmConflict, pmHistory, pmMissing, pmNewId, pmPanel, pmRecord, pmReplay, pmTransaction,
  requirePMProject, type PMDependencies, type PMRow
} from "./common.js";

const READ_ROLES = ["site_manager", "client"] as const;
const iso = (value: unknown): string | null => value ? new Date(value as string).toISOString() : null;
const commands: Record<string, string> = { pending: "Mark pending", resolve: "Mark resolved", reopen: "Reopen", follow_up: "Record follow-up", escalate: "Escalate", start: "Start work", verify: "Verify repair", assign: "Assign owner" };
function validate<T>(schema: ZodType<T, any, any>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", Object.fromEntries(result.error.issues.map(issue => [issue.path.join("."), issue.message])));
  return result.data;
}
function recordId(family: string, requested: string | undefined, evidenceIds: string[]): string {
  if (evidenceIds.length && !requested) throw new ApiError(400, "PM_EVIDENCE_PARENT_REQUIRED", "Create a record ID before attaching evidence.");
  if (requested && !new RegExp(`^pm-${family}-[A-Za-z0-9-]{8,100}$`).test(requested)) throw new ApiError(400, "VALIDATION_ERROR", "The record ID is invalid.");
  return requested ?? pmNewId(family);
}
function actions(ids: string[]): PMAction[] { return ids.map(id => ({ id, label: commands[id]!, reasonRequired: true })); }
function escalationDto(row: PMRow, actor: PublicUser, ownerName?: string): PMItem {
  return { id: String(row._id), kind: "escalation", title: row.title, description: row.description,
    status: row.status, severity: row.status === "resolved" ? "success" : "warning", version: row.version,
    sourceToken: null, ownerId: actor.role === "client" ? null : row.ownerId, ownerName: ownerName ?? null,
    dueAt: iso(row.followUpAt), evidenceIds: actor.role === "client" ? [] : row.evidenceIds ?? [],
    facts: [{ label: "Follow-up", value: iso(row.followUpAt) ?? "Not scheduled" }],
    actions: actor.role === "site_manager" ? actions(row.status === "resolved" ? ["reopen"] : ["follow_up", "escalate", ...(row.status === "open" ? ["pending"] : []), "resolve"]) : [] };
}
function snagDto(row: PMRow, actor: PublicUser, ownerName?: string): PMItem {
  const available = (["start", "resolve", "verify", "reopen", "assign"] as const).filter(action => nextSnagStatus(row.status, action) !== null);
  return { id: String(row._id), kind: "snag", title: row.title, description: row.description,
    status: row.status, severity: row.status === "verified" ? "success" : row.severity, version: row.version,
    sourceToken: null, assignmentId: row.assignmentId ?? undefined, vendorId: actor.role === "client" ? undefined : row.vendorId ?? undefined,
    ownerId: actor.role === "client" ? null : row.ownerId ?? null, ownerName: actor.role === "client" ? null : ownerName ?? (row.ownerId ? "Assigned owner unavailable" : "Owner not recorded"),
    roomId: row.roomId ?? null, roomName: row.roomName ?? null, tradeId: row.sourceSectionId ?? undefined, tradeName: row.tradeName ?? undefined,
    vendorName: actor.role === "client" ? undefined : row.vendorName ?? undefined,
    dueAt: iso(row.dueAt), evidenceIds: actor.role === "client" ? [] : row.evidenceIds ?? [],
    facts: [{ label: "Stage", value: row.reopenedAfterHandoverAt ? "Recurrence after handover" : row.postHandover ? "After handover" : "Before handover" },
      { label: "Verification", value: row.verifiedAt ? iso(row.verifiedAt)! : row.status === "resolved" ? "Repair awaiting verification" : "Not verified" }],
    actions: actor.role === "site_manager" ? actions(available) : [] };
}
function visitDto(row: PMRow, actor?: PublicUser): PMItem {
  return { id: String(row._id), kind: "snag_visit", title: "Site visit", description: row.reason, status: "recorded", severity: "neutral", version: 1, sourceToken: null,
    evidenceIds: actor?.role === "client" ? [] : row.evidenceIds ?? [], facts: [{ label: "Visited", value: iso(row.visitedAt)! }, { label: "Linked snags", value: String(row.snagIds.length) },
      { label: "Stage", value: row.postHandover ? "After handover" : "Before handover" }], actions: [] };
}
async function peopleFor(project: PMRow, session?: ClientSession): Promise<PMPerson[]> {
  const tasks = await ProjectWorkflowTaskModel.find({ projectId: project._id, supersededAt: null, kind: { $in: ["site_execution", "procurement"] } }).select({ assigneeUserId: 1, assigneeRole: 1, kind: 1 }).session(session ?? null).lean();
  const roles = new Map<string, Set<string>>();
  const add = (id: string | null | undefined, role: string) => { if (id) roles.set(id, new Set([...(roles.get(id) ?? []), role])); };
  const manager = await resolveProjectManagerAssignment(String(project._id), session);
  if (manager.state === "assigned") add(manager.ownerId, "site_manager");
  add(project.clientId, "client");
  for (const id of project.assignedDesignerIds ?? []) add(id, "designer");
  for (const kind of ["procurement"]) {
    const matches = tasks.filter(task => task.kind === kind && task.assigneeRole === "procurement");
    if (matches.length === 1 && matches[0]?.assigneeUserId) add(matches[0].assigneeUserId, "procurement");
  }
  const users = await UserModel.find({ _id: { $in: [...roles.keys()] }, active: true }).select({ _id: 1, name: 1, role: 1 }).session(session ?? null).lean();
  return users.filter(user => roles.get(String(user._id))?.has(user.role))
    .map(user => ({ id: String(user._id), name: String(user.name), role: String(user.role) }));
}
async function requireOwner(project: PMRow, id: string, session: ClientSession): Promise<PMPerson> {
  const person = (await peopleFor(project, session)).find(person => person.id === id);
  if (!person) return pmConflict("Choose an active person assigned to this project.");
  return person;
}
async function currentAssignment(projectId: string, assignmentId: string, session: ClientSession): Promise<PMRow> {
  const row = await VendorWorkAssignmentModel.findOne({ _id: assignmentId, projectId, status: { $ne: "superseded" } }).session(session).lean();
  if (!row) pmMissing();
  const order = await ProjectPurchaseOrderModel.findOne({ _id: row.orderId, projectId, approvedRevision: row.orderRevision, cancelledAt: null }).session(session).lean();
  if (!order || !order.approvedRevisionId) pmConflict("The selected work no longer belongs to a current issued order.");
  const revision = await ProjectPurchaseOrderRevisionModel.findOne({ _id: order.approvedRevisionId, orderId: row.orderId, projectId, revision: row.orderRevision, vendorId: row.vendorId }).session(session).lean();
  const line = revision?.lines.find((line: PMRow) => line.id === row.lineId);
  if (!line || line.sourceLineItemKey !== row.sourceLineItemKey || line.sourceSectionId !== row.sourceSectionId) pmConflict("The selected work source no longer matches its issued order.");
  let sourceLines: PMRow[] = [];
  if (row.estimateReviewRoundId) {
    const round = await EstimateClientReviewRoundModel.findOne({ _id: row.estimateReviewRoundId, estimateId: row.estimateId,
      estimateVersion: row.estimateVersion, status: "approved", decision: "approve" }).session(session).lean();
    if (round && (!round.projectId || round.projectId === projectId)) sourceLines = round.estimateSnapshot?.lineItems ?? [];
  } else {
    const estimate = await EstimateModel.findOne({ _id: row.estimateId, projectId, version: row.estimateVersion, status: "client_approved" }).session(session).lean();
    sourceLines = estimate?.lineItems ?? [];
  }
  const source = sourceLines.find((source, index) => approvedEstimateLineItemKey({ id: source.id, index, estimateId: row.estimateId, estimateVersion: row.estimateVersion }) === row.sourceLineItemKey);
  const vendor = await AiEstimatorKnowledgeVendorModel.findById(row.vendorId).select({ name: 1 }).session(session).lean();
  return { ...row, roomId: typeof source?.roomId === "string" && source.roomId.trim() ? source.roomId : null,
    tradeName: source && source.mainBasketId === row.sourceSectionId && source.mainBasketName ? source.mainBasketName : row.sourceSectionId,
    vendorName: vendor?.name ?? null };
}
async function snagFilterOptions(projectId: string, actor: PublicUser): Promise<NonNullable<PMPanel["snagFilters"]>> {
  const facet = (idField: string, labelField: string) => [
    { $match: { [idField]: { $type: "string", $ne: "" } } },
    { $group: { _id: `$${idField}`, label: { $first: `$${labelField}` } } },
    { $sort: { label: 1 as const, _id: 1 as const } }, { $project: { _id: 0, id: "$_id", label: { $ifNull: ["$label", "$_id"] } } }
  ];
  const [result] = await ProjectSnagModel.aggregate([{ $match: { projectId } }, { $sort: { createdAt: 1, _id: 1 } }, { $facet: {
    rooms: facet("roomId", "roomName"), trades: facet("sourceSectionId", "tradeName"), vendors: facet("vendorId", "vendorName")
  } }]);
  return { rooms: result?.rooms ?? [], trades: result?.trades ?? [], vendors: actor.role === "client" ? [] : result?.vendors ?? [] };
}
async function notifyIds(project: PMRow, session: ClientSession, ownerId?: string): Promise<string[]> {
  return (await peopleFor(project, session)).filter(person => person.id === ownerId || person.role === "site_manager").map(person => person.id);
}
async function withHistory(item: PMItem, projectId: string, session: ClientSession): Promise<PMItem> {
  return { ...item, history: await pmHistory(projectId, item.id, session) };
}

export function createProjectManagerClientService(deps: PMDependencies) {
  const now = deps.now ?? (() => new Date());
  return {
    async client(actor: PublicUser, projectId: string, query: unknown = {}): Promise<PMPanel> {
      const project = await requirePMProject(actor, projectId, undefined, false, READ_ROLES);
      const { limit, offset } = validate(pmClientQuerySchema, query);
      const panel = pmPanel("client", now());
      const filter = { projectId, ...(actor.role === "client" ? { clientId: actor.id } : {}) };
      const rows = await ProjectClientEscalationModel.find(filter).sort({ updatedAt: -1, _id: 1 }).skip(offset).limit(limit).lean();
      const people = await peopleFor(project);
      panel.total = await ProjectClientEscalationModel.countDocuments(filter);
      panel.items = await Promise.all(rows.map(async row => ({ ...escalationDto(row, actor, people.find(person => person.id === row.ownerId)?.name),
        ...(actor.role !== "client" ? { history: await pmHistory(projectId, String(row._id)) } : {}) })));
      panel.availability = "available";
      panel.issues = ["Client portal activity is not recorded. Use project messages to share an update."];
      panel.people = actor.role === "site_manager" ? people : [];
      if (actor.role === "site_manager") {
        panel.actions = [{ id: "create_escalation", label: "Log escalation" }, { id: "send_update", label: "Send update" }];
        const mobile = typeof project.clientMobile === "string" ? project.clientMobile.trim() : "";
        if (/^\+[1-9]\d{7,14}$/.test(mobile)) panel.actions.push({ id: "whatsapp", label: "WhatsApp", href: `https://wa.me/${mobile.slice(1)}?text=${encodeURIComponent("Hello, I'd like to share a project update.")}` });
        else panel.issues.push("WhatsApp is unavailable until the Client has a valid international mobile number.");
      }
      return panel;
    },
    async snagging(actor: PublicUser, projectId: string, query: unknown = {}): Promise<PMPanel> {
      const project = await requirePMProject(actor, projectId, undefined, false, READ_ROLES);
      const { limit, offset, kind, roomId, tradeId, vendorId, status } = validate(pmSnagQuerySchema, query);
      const panel = pmPanel("snagging", now());
      const snagTotal = await ProjectSnagModel.countDocuments({ projectId });
      const filter = { projectId, ...(roomId ? { roomId } : {}), ...(tradeId ? { sourceSectionId: tradeId } : {}),
        ...(vendorId ? { vendorId } : {}), ...(status ? { status } : {}) };
      const people = actor.role === "client" ? [] : await peopleFor(project);
      if (kind === "visits") {
        const ids = roomId || tradeId || vendorId || status ? await ProjectSnagModel.distinct("_id", filter) : null;
        const visitFilter = { projectId, ...(ids ? { snagIds: { $in: ids } } : {}) };
        const visits = await ProjectSnagVisitModel.find(visitFilter).sort({ visitedAt: -1, _id: 1 }).skip(offset).limit(limit).lean();
        panel.items = visits.map(row => visitDto(row, actor));
        panel.total = await ProjectSnagVisitModel.countDocuments(visitFilter);
      } else {
        const rows = await ProjectSnagModel.find(filter).sort({ createdAt: -1, _id: 1 }).skip(offset).limit(limit).lean();
        panel.items = await Promise.all(rows.map(async row => ({ ...snagDto(row, actor, people.find(person => person.id === row.ownerId)?.name), ...(actor.role !== "client" ? { history: await pmHistory(projectId, String(row._id)) } : {}) })));
        panel.total = await ProjectSnagModel.countDocuments(filter);
      }
      panel.snagFilters = await snagFilterOptions(projectId, actor);
      panel.availability = panel.total ? "available" : "no_data";
      panel.issues = ["Resolve and verify every snag before handover. Site Manager verification and Client acceptance remain separate."];
      panel.actions = [{ id: kind === "visits" ? "view_snags" : "view_visits", label: kind === "visits" ? "View snags" : "Visit history" }];
      if (actor.role === "site_manager") {
        panel.actions.push({ id: "create_snag", label: "Log snag" }, ...(snagTotal ? [{ id: "log_visit", label: "Record visit" }] : []));
        // Related work uses the existing paginated execution endpoint, never a truncated source list.
        panel.people = people;
      }
      return panel;
    },
    createEscalation(actor: PublicUser, projectId: string, input: unknown): Promise<PMItem> {
      const fields = validate(pmEscalationCreateSchema, input);
      const payload = { family: "escalation", action: "create", ...fields };
      return pmTransaction(async session => {
        const project = await requirePMProject(actor, projectId, session, true);
        const prior = await pmReplay(projectId, actor, fields.idempotencyKey, payload, session);
        if (prior !== undefined) return prior as PMItem;
        const id = recordId("escalation", fields.recordId, fields.evidenceIds);
        if (await ProjectClientEscalationModel.exists({ _id: id }).session(session)) pmConflict("This escalation ID is already in use.");
        const owner = await requireOwner(project, fields.ownerId ?? actor.id, session);
        await assertPMEvidence(projectId, id, fields.evidenceIds, session);
        const at = now();
        const row = { _id: id, projectId, clientId: project.clientId ?? null, title: fields.title, description: fields.description,
          status: "open", ownerId: owner.id, followUpAt: fields.followUpAt ?? null, version: 1,
          createdById: actor.id, createdAt: at, updatedAt: at, evidenceIds: fields.evidenceIds };
        await ProjectClientEscalationModel.create([row], { session });
        const result = escalationDto(row, actor, owner.name);
        await pmRecord(deps, { projectId, entityId: id, family: "escalation", actor, key: fields.idempotencyKey, payload,
          action: "create", version: 1, reason: fields.description, result, recipientIds: await notifyIds(project, session, owner.id) }, session);
        return result;
      });
    },
    actEscalation(actor: PublicUser, projectId: string, entityId: string, input: unknown): Promise<PMItem> {
      const fields = validate(pmEscalationActionSchema, input);
      const payload = { family: "escalation", entityId, ...fields };
      return pmTransaction(async session => {
        const project = await requirePMProject(actor, projectId, session, true);
        const prior = await pmReplay(projectId, actor, fields.idempotencyKey, payload, session);
        if (prior !== undefined) return prior as PMItem;
        const row = await ProjectClientEscalationModel.findOne({ _id: entityId, projectId }).session(session).lean();
        if (!row) pmMissing();
        if (row.version !== fields.expectedVersion) pmConflict();
        const status = nextEscalationStatus(row.status, fields.action);
        if (!status) pmConflict("This action is not available for the current escalation status.");
        if (fields.action === "escalate" && (!fields.ownerId || fields.ownerId === row.ownerId)) pmConflict("Choose a different assigned owner to escalate this issue.");
        if (fields.action === "follow_up" && fields.followUpAt === undefined) throw new ApiError(400, "VALIDATION_ERROR", "Set the next follow-up date, or explicitly clear it.");
        const owner = await requireOwner(project, fields.ownerId ?? row.ownerId, session);
        await assertPMEvidence(projectId, entityId, fields.evidenceIds, session);
        const at = now();
        const update = { status, ownerId: owner.id, followUpAt: fields.followUpAt === undefined ? row.followUpAt : fields.followUpAt,
          resolvedAt: status === "resolved" ? at : null, updatedAt: at,
          evidenceIds: [...new Set<string>([...(row.evidenceIds ?? []), ...fields.evidenceIds])] };
        const changed = await ProjectClientEscalationModel.updateOne({ _id: entityId, projectId, version: fields.expectedVersion }, { $set: update, $inc: { version: 1 } }, { session });
        if (changed.matchedCount !== 1) pmConflict();
        const result = escalationDto({ ...row, ...update, version: row.version + 1 }, actor, owner.name);
        await pmRecord(deps, { projectId, entityId, family: "escalation", actor, key: fields.idempotencyKey, payload,
          action: fields.action, version: result.version, reason: fields.reason, result, recipientIds: await notifyIds(project, session, owner.id) }, session);
        return withHistory(result, projectId, session);
      });
    },
    createSnag(actor: PublicUser, projectId: string, input: unknown): Promise<PMItem> {
      const fields = validate(pmSnagCreateSchema, input);
      const payload = { family: "snag", action: "create", ...fields };
      return pmTransaction(async session => {
        const project = await requirePMProject(actor, projectId, session, true);
        const prior = await pmReplay(projectId, actor, fields.idempotencyKey, payload, session);
        if (prior !== undefined) return prior as PMItem;
        const id = recordId("snag", fields.recordId, fields.evidenceIds);
        if (await ProjectSnagModel.exists({ _id: id }).session(session)) pmConflict("This snag ID is already in use.");
        const assignment = fields.assignmentId ? await currentAssignment(projectId, fields.assignmentId, session) : null;
        const owner = await requireOwner(project, fields.ownerId ?? actor.id, session);
        await assertPMEvidence(projectId, id, fields.evidenceIds, session);
        const at = now();
        const row = { _id: id, projectId, assignmentId: assignment?._id ?? null, sourceLineItemKey: assignment?.sourceLineItemKey ?? null,
          sourceSectionId: assignment?.sourceSectionId ?? null, vendorId: assignment?.vendorId ?? null, vendorName: assignment?.vendorName ?? null,
          roomId: assignment?.roomId ?? null, roomName: assignment?.roomName ?? null, tradeName: assignment?.tradeName ?? null, ownerId: owner.id,
          title: fields.title, description: fields.description, severity: fields.severity, status: "open", dueAt: fields.dueAt ?? null,
          version: 1, postHandover: project.status === "completed", createdById: actor.id, createdAt: at, updatedAt: at, evidenceIds: fields.evidenceIds };
        await ProjectSnagModel.create([row], { session });
        const result = snagDto(row, actor, owner.name);
        await pmRecord(deps, { projectId, entityId: id, family: "snag", actor, key: fields.idempotencyKey, payload, action: "create", version: 1,
          reason: fields.description, result, recipientIds: await notifyIds(project, session, owner.id) }, session);
        return result;
      });
    },
    actSnag(actor: PublicUser, projectId: string, entityId: string, input: unknown): Promise<PMItem> {
      const fields = validate(pmSnagActionSchema, input);
      const payload = { family: "snag", entityId, ...fields };
      return pmTransaction(async session => {
        const project = await requirePMProject(actor, projectId, session, true);
        const prior = await pmReplay(projectId, actor, fields.idempotencyKey, payload, session);
        if (prior !== undefined) return prior as PMItem;
        const row = await ProjectSnagModel.findOne({ _id: entityId, projectId }).session(session).lean();
        if (!row) pmMissing();
        if (row.version !== fields.expectedVersion) pmConflict();
        const status = nextSnagStatus(row.status, fields.action);
        if (!status) pmConflict("This action is not available for the current snag status.");
        if (fields.action === "assign" && !fields.ownerId) throw new ApiError(400, "VALIDATION_ERROR", "Choose a responsible person for this snag.");
        const owner = await requireOwner(project, fields.ownerId ?? row.ownerId ?? actor.id, session);
        await assertPMEvidence(projectId, entityId, fields.evidenceIds, session);
        const at = now();
        const update = { status, ownerId: owner.id, updatedAt: at, resolvedAt: status === "resolved" ? fields.action === "assign" ? row.resolvedAt : at : status === "verified" ? row.resolvedAt : null,
          resolvedById: status === "resolved" ? fields.action === "assign" ? row.resolvedById : actor.id : status === "verified" ? row.resolvedById : null,
          verifiedAt: status === "verified" ? at : null, verifiedById: status === "verified" ? actor.id : null,
          reopenedAfterHandoverAt: fields.action === "reopen" && project.status === "completed" ? at : row.reopenedAfterHandoverAt ?? null,
          evidenceIds: [...new Set<string>([...(row.evidenceIds ?? []), ...fields.evidenceIds])] };
        const changed = await ProjectSnagModel.updateOne({ _id: entityId, projectId, version: fields.expectedVersion }, { $set: update, $inc: { version: 1 } }, { session });
        if (changed.matchedCount !== 1) pmConflict();
        const result = snagDto({ ...row, ...update, version: row.version + 1 }, actor, owner.name);
        await pmRecord(deps, { projectId, entityId, family: "snag", actor, key: fields.idempotencyKey, payload, action: fields.action,
          version: result.version, reason: fields.reason, result, recipientIds: await notifyIds(project, session, owner.id) }, session);
        return withHistory(result, projectId, session);
      });
    },
    logVisit(actor: PublicUser, projectId: string, input: unknown): Promise<PMItem> {
      const fields = validate(pmSnagVisitSchema, input);
      const payload = { family: "snag_visit", action: "record", ...fields };
      return pmTransaction(async session => {
        const project = await requirePMProject(actor, projectId, session, true);
        const prior = await pmReplay(projectId, actor, fields.idempotencyKey, payload, session);
        if (prior !== undefined) return prior as PMItem;
        const id = recordId("visit", fields.recordId, fields.evidenceIds);
        if (await ProjectSnagVisitModel.exists({ _id: id }).session(session)) pmConflict("This visit ID is already in use.");
        const at = now();
        if (new Date(fields.visitedAt) > at) throw new ApiError(400, "PM_VISIT_IN_FUTURE", "A recorded visit must have already taken place.");
        const snagIds = [...new Set(fields.snagIds)];
        const snags = await ProjectSnagModel.find({ _id: { $in: snagIds }, projectId }).session(session).lean();
        if (snags.length !== snagIds.length) pmMissing();
        await assertPMEvidence(projectId, id, fields.evidenceIds, session);
        const row = { _id: id, projectId, snagIds, visitedAt: fields.visitedAt, reason: fields.reason,
          postHandover: Boolean(project.actualEndAt && new Date(fields.visitedAt) >= new Date(project.actualEndAt)),
          actorId: actor.id, recordedAt: at, evidenceIds: fields.evidenceIds };
        await ProjectSnagVisitModel.create([row], { session });
        const result = visitDto(row);
        await pmRecord(deps, { projectId, entityId: id, family: "snag_visit", actor, key: fields.idempotencyKey, payload, action: "record", version: 1,
          reason: fields.reason, result, recipientIds: await notifyIds(project, session) }, session);
        return result;
      });
    }
  };
}
