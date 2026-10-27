import type { ClientSession } from "mongoose";
import { ApiError } from "../../middleware/errors.js";
import type { PMAction, PMItem, PMPanel, PMPerson, PMSource } from "../../contracts/project-manager.js";
import { pmRequestActionSchema, pmRequestCreateSchema, pmSupplyActionSchema, pmRequestListSchema, requestTransition, supplyComplete, supplyRequiredReviewers,
  type PMRequestKind, type PMRequestAction, type PMRequestList } from "../../domain/project-manager/requests.js";
import { projectDesignRequirements, type DesignRequirementEntry, type DesignRequirementsSource } from "../../domain/design-requirements.js";
import { mongoDesignRequirementsSource, mongoDesignRequirementsState } from "../../repositories/design-requirements-mongo.js";
import { ProjectManagerRequestModel } from "../../models/ProjectManagerRequest.js";
import { ProjectSupplyMilestoneModel } from "../../models/ProjectSupplyMilestone.js";
import { ProjectProcurementItemModel } from "../../models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../../models/ProjectPurchaseOrderRevision.js";
import { ProjectPurchaseOrderRequestModel } from "../../models/ProjectPurchaseOrderRequest.js";
import { ProjectPurchaseOrderRequestRevisionModel } from "../../models/ProjectPurchaseOrderRequestRevision.js";
import { ProjectWorkflowTaskModel } from "../../models/ProjectWorkflowTask.js";
import { UserModel } from "../../models/User.js";
import { procurementItemSourceSnapshot, type ApprovedProcurementSnapshot } from "../procurement.service.js";
import type { PublicUser } from "../auth.service.js";
import { assertPMEvidence } from "./evidence.js";
import { pmConflict, pmDigest, pmHistory, pmMissing, pmNewId, pmPanel, pmRecord, pmReplay, pmTransaction, requirePMProject,
  type PMDependencies, type PMRow } from "./common.js";

const roles = ["site_manager", "procurement", "designer"] as const;
const isDone = (entry: DesignRequirementEntry) => ["completed", "approved"].includes(entry.status);
const supplyEntry = (entry: DesignRequirementEntry) => entry.category === "critical" || ["physicalSampleApproval", "shopDrawingApproval"].includes(entry.ruleKey);
const selectionToken = (entry: DesignRequirementEntry, pmId: string | null) => pmDigest([entry.sourceDigest, pmId]);
const supplyToken = (entry: DesignRequirementEntry, required: string[]) => pmDigest([entry.sourceDigest, required]);
const selectionRecordId = (projectId: string, sourceId: string, sourceToken: string) => `pm-selection-${pmDigest([projectId, sourceId, sourceToken]).slice(0, 40)}`;
const milestoneRecordId = (projectId: string, sourceId: string, sourceToken: string) => `pm-supply-${pmDigest([projectId, sourceId, sourceToken]).slice(0, 40)}`;
function sourceChanged(): never { return pmConflict("The source or responsible owner changed. Refresh this project before continuing."); }
const editableProject = (project: PMRow) => { if (project.status === "completed") pmConflict("Completed projects cannot receive new operational decisions."); };
const action = (id: string, label: string): PMAction => ({ id, label, reasonRequired: true });

async function people(ids: string[], session: ClientSession): Promise<PMPerson[]> {
  const rows = await UserModel.find({ _id: { $in: [...new Set(ids)] }, active: true }).select({ _id: 1, name: 1, role: 1 }).session(session).lean();
  return rows.map(row => ({ id: String(row._id), name: row.name, role: row.role }));
}
async function procurementOwner(projectId: string, session: ClientSession, lock: boolean): Promise<string | null> {
  const tasks = await ProjectWorkflowTaskModel.find({ projectId, kind: "procurement", assigneeRole: "procurement", supersededAt: null }).session(session).lean();
  if (tasks.length !== 1 || !tasks[0]?.assigneeUserId) return null;
  const user = await UserModel.exists({ _id: tasks[0].assigneeUserId, role: "procurement", active: true }).session(session);
  if (!user) return null;
  if (lock) await ProjectWorkflowTaskModel.updateOne({ _id: tasks[0]._id, assigneeUserId: tasks[0].assigneeUserId }, { $inc: { awardApprovalEpoch: 1 } }, { session, timestamps: false });
  return String(tasks[0].assigneeUserId);
}
async function designSource(projectId: string, session: ClientSession, lock: boolean) {
  const source = await mongoDesignRequirementsSource(projectId, session, lock);
  if (!source) pmMissing();
  const state = await mongoDesignRequirementsState(projectId, session, lock) ?? { projectId, version: 0, history: [] };
  return { source, entries: projectDesignRequirements(source, state) };
}
async function designRead(projectId: string, session: ClientSession) {
  try { return await designSource(projectId, session, false); }
  catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const source: DesignRequirementsSource = { projectId, estimateId: null, estimateVersion: null, clientId: null, designerIds: [], procurementIds: [], initialPaymentAt: null, lines: [],
      issues: ["Current Main Line requirements are unavailable. Reconcile Configuration before continuing."] };
    return { source, entries: [] as DesignRequirementEntry[] };
  }
}
const owners = (entry: DesignRequirementEntry, source: DesignRequirementsSource) => entry.ruleKey === "clientFinishApproval" ? source.clientId ? [source.clientId] : [] : source.designerIds;
function procurementSources(snapshot: ApprovedProcurementSnapshot, owner: string | null): PMSource[] {
  return snapshot.allLineItems.filter(line => line.included).map(line => ({ id: line.key, label: `${line.mainLineName || line.specification || line.sectionLabel}${line.roomName ? ` · ${line.roomName}` : ""}`,
    sourceToken: pmDigest([snapshot.estimateId, snapshot.estimateVersion, snapshot.estimateReviewRoundId, snapshot.preparationSource ?? null, line, owner]),
    lineItemKey: line.key, sectionId: line.sectionId, roomId: line.roomId ?? null, quantity: line.quantity, unit: line.unit }));
}
function requestActions(row: PMRow, actor: PublicUser, current: boolean): PMAction[] {
  if (!current || !["open", "acknowledged"].includes(row.status)) return [];
  if (row.kind === "procurement" && actor.role === "procurement") return [...(row.status === "open" ? [action("acknowledge", "Acknowledge")] : []), action("fulfill", "Link fulfillment"), action("reject", "Reject")];
  if (actor.role !== "site_manager") return [];
  return [...(row.kind === "selection" && row.status === "open" ? [action("acknowledge", "Acknowledge")] : []), action("remind", "Remind owner"), action("escalate", "Escalate")];
}
function requestDto(row: PMRow, actor: PublicUser, current: boolean, now: Date, names: PMPerson[]): PMItem {
  const overdue = row.dueAt && new Date(row.dueAt) < now && ["open", "acknowledged"].includes(row.status);
  return { id: row.kind === "selection" ? row.sourceId : String(row._id), kind: `${row.kind}_request`, title: row.title,
    status: current ? row.status : "source_changed", severity: !current || overdue ? "warning" : ["fulfilled", "acknowledged"].includes(row.status) ? "success" : "neutral",
    version: row.version, sourceId: row.sourceId, sourceToken: row.sourceToken, ownerId: row.ownerId,
    ownerName: names.find(person => person.id === row.ownerId)?.name ?? "Owner unavailable", description: row.reason,
    dueAt: row.dueAt ? new Date(row.dueAt).toISOString() : null, sourceAvailable: current,
    facts: [...(row.quantityMilliUnits != null && row.unit ? [{ label: "Requested quantity", value: `${row.quantityMilliUnits / 1000} ${row.unit}` }] : []), ...(row.artifact ? [{ label: "Fulfillment reference", value: `${row.artifact.kind.replaceAll("_", " ")} · ${row.artifact.id}` }] : [])],
    actions: requestActions(row, actor, current) };
}
async function escalationRecipients(project: PMRow, session: ClientSession): Promise<string[]> {
  const rows = await UserModel.find({ _id: { $in: [project.managerId].filter(Boolean) }, active: true, role: { $in: ["design_manager", "design_head"] } }).select({ _id: 1 }).session(session).lean();
  if (!rows.length) pmConflict("Assign an active project manager or design head escalation owner before escalating.");
  return rows.map(row => String(row._id));
}
async function validateArtifact(projectId: string, row: PMRow, artifact: NonNullable<PMRequestAction["artifact"]>, session: ClientSession): Promise<void> {
  const matches = (line: PMRow) => line.sourceLineItemKey === row.sourceLineItemKey && line.sourceSectionId === row.sourceSectionId && line.estimateId === row.estimateId && line.estimateVersion === row.estimateVersion;
  if (artifact.kind === "procurement_item") {
    const item = await ProjectProcurementItemModel.findOneAndUpdate({ _id: artifact.id, projectId, removedAt: null }, { $inc: { commitmentEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean();
    if (!item || !matches(item)) sourceChanged();
    return;
  }
  if (artifact.kind === "purchase_order") {
    const order = await ProjectPurchaseOrderModel.findOneAndUpdate({ _id: artifact.id, projectId, status: "approved", cancelledAt: null }, { $inc: { accessAuthorityEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean();
    if (!order?.approvedRevisionId) sourceChanged();
    const revision = await ProjectPurchaseOrderRevisionModel.findOne({ _id: order.approvedRevisionId, orderId: artifact.id, projectId }).session(session).lean();
    if (!revision || !(revision.lines as PMRow[]).some(line => matches(line) && (!artifact.lineId || line.id === artifact.lineId))) sourceChanged();
    return;
  }
  const request = await ProjectPurchaseOrderRequestModel.findOne({ _id: artifact.id, projectId, status: { $in: ["pending_approval", "ready_to_issue", "approved"] } }).session(session).lean();
  if (!request) sourceChanged();
  // Writing the request prevents a concurrent rejection from validating a stale fulfillment link.
  await ProjectPurchaseOrderRequestModel.updateOne({ _id: artifact.id, version: request.version }, { $set: { updatedById: request.updatedById } }, { session, timestamps: false });
  const revision = await ProjectPurchaseOrderRequestRevisionModel.findOne({ _id: request.submittedRevisionId, requestId: artifact.id, projectId }).session(session).lean();
  if (!revision || !(revision.lines as PMRow[]).some(line => matches(line) && (!artifact.lineId || line.id === artifact.lineId))) sourceChanged();
}

export function createProjectManagerRequestsSupplyService(deps: PMDependencies) {
  const now = deps.now ?? (() => new Date());
  async function procurement(actor: PublicUser, projectId: string, query: PMRequestList = {}): Promise<PMPanel> {
    const page = pmRequestListSchema.parse(query);
    return pmTransaction(async session => {
      await requirePMProject(actor, projectId, session, false, ["site_manager", "procurement"]);
      const result = pmPanel("procurement", now());
      const owner = await procurementOwner(projectId, session, false);
      if (!owner) result.issues.push("Assign exactly one active Procurement owner to receive material and work requests.");
      try { result.sources = procurementSources(await procurementItemSourceSnapshot(projectId, session), owner); }
      catch (error) { if (!(error instanceof ApiError)) throw error; result.issues.push("The approved or released Procurement source is unavailable. Complete Procurement preparation before raising a request."); }
      result.people = await people(owner ? [owner] : [], session);
      const requestTotal = await ProjectManagerRequestModel.countDocuments({ projectId, kind: "procurement" }).session(session);
      const rows = await ProjectManagerRequestModel.find({ projectId, kind: "procurement" }).sort({ createdAt: -1, _id: 1 }).skip(page.offset).limit(page.limit).session(session).lean();
      const orderFilter = { projectId, status: { $nin: ["cancelled", "rejected"] } };
      result.total = requestTotal + await ProjectPurchaseOrderModel.countDocuments(orderFilter).session(session);
      result.items = rows.map(row => requestDto(row, actor, !!owner && row.ownerId === owner && result.sources.some(source => source.id === row.sourceId && source.sourceToken === row.sourceToken), now(), result.people));
      for (let index = 0; index < rows.length; index++) result.items[index]!.history = await pmHistory(projectId, String(rows[index]!._id), session);
      const orderRows = rows.length < page.limit ? await ProjectPurchaseOrderModel.find(orderFilter).sort({ createdAt: -1, _id: 1 }).skip(Math.max(0, page.offset - requestTotal)).limit(page.limit - rows.length).session(session).lean() : [];
      result.items.push(...orderRows.map((order): PMItem => ({ id: String(order._id), kind: "purchase_order", title: order.orderNumber,
        status: order.status === "approved" ? "ordered" : order.status, severity: "neutral", version: order.version, sourceToken: null,
        description: order.vendorName, amountPaise: order.approvedNetPaise ?? null, facts: [{ label: "Delivery", value: "Receipt confirmation unavailable" }], actions: [] })));
      result.actions = actor.role === "site_manager" && owner && result.sources.length ? [action("create_request", "Raise request")] : [];
      result.availability = result.sources.length ? "available" : "source_unavailable";
      return result;
    });
  }
  async function selections(actor: PublicUser, projectId: string, query: PMRequestList = {}): Promise<PMPanel> {
    const page = pmRequestListSchema.parse(query);
    return pmTransaction(async session => {
      const project = await requirePMProject(actor, projectId, session, false, roles);
      const { source, entries } = await designRead(projectId, session);
      const result = pmPanel("selections", now()); result.issues = [...source.issues];
      result.people = await people([...(source.clientId ? [source.clientId] : []), ...source.designerIds], session);
      const selectedEntries = entries.filter(item => item.category === "selection");
      const currentPairs = selectedEntries.map(entry => ({ sourceId: entry.id, sourceToken: selectionToken(entry, project.currentProjectManagerId) }));
      const rows = currentPairs.length ? await ProjectManagerRequestModel.find({ projectId, kind: "selection", $or: currentPairs }).session(session).lean() : [];
      for (const entry of selectedEntries) {
        const token = selectionToken(entry, project.currentProjectManagerId);
        const ownerIds = owners(entry, source);
        const row = rows.find(item => item.sourceId === entry.id && item.sourceToken === token);
        const item: PMItem = row ? requestDto(row, actor, true, now(), result.people) : { id: entry.id, kind: "selection_request", title: `${entry.lineName} · ${entry.label}`,
          status: isDone(entry) ? entry.status : "acknowledgement_required", severity: isDone(entry) ? "success" : "neutral", version: 0, sourceId: entry.id, sourceToken: token,
          description: entry.details, dueAt: entry.dueAt, ownerId: ownerIds.length === 1 ? ownerIds[0] : null,
          ownerName: result.people.filter(person => ownerIds.includes(person.id)).map(person => person.name).join(", ") || "Owner unavailable", facts: [],
          actions: actor.role === "site_manager" && ownerIds.length && !source.issues.length && !isDone(entry) ? [action("acknowledge", "Acknowledge"), action("remind", "Remind owner"), action("escalate", "Escalate")] : [] };
        item.facts.push({ label: "Design decision", value: entry.status }, { label: "PM acknowledgement", value: row?.status === "acknowledged" ? "Acknowledged" : "Required" });
        if (isDone(entry)) { item.status = entry.status; item.actions = []; }
        if (source.issues.length) { item.sourceAvailable = false; item.actions = []; }
        result.items.push(item);
        result.sources.push({ id: entry.id, label: item.title, sourceToken: token, lineItemKey: entry.lineItemId, ownerIds });
      }
      result.items = result.items.slice(page.offset, page.offset + page.limit);
      for (const item of result.items) {
        const row = rows.find(row => row.sourceId === item.id); if (row) item.history = await pmHistory(projectId, String(row._id), session);
      }
      const obsoleteFilter = { projectId, kind: "selection", ...(currentPairs.length ? { $nor: currentPairs } : {}) };
      const obsoleteTotal = await ProjectManagerRequestModel.countDocuments(obsoleteFilter).session(session);
      const obsolete = result.items.length < page.limit ? await ProjectManagerRequestModel.find(obsoleteFilter).sort({ createdAt: -1, _id: 1 }).skip(Math.max(0, page.offset - selectedEntries.length)).limit(page.limit - result.items.length).session(session).lean() : [];
      result.items.push(...obsolete.map(row => ({ ...requestDto(row, actor, false, now(), result.people), id: String(row._id) })));
      result.total = selectedEntries.length + obsoleteTotal;
      result.actions = actor.role === "site_manager" && !source.issues.length && result.sources.length ? [action("create_request", "Raise request")] : [];
      result.availability = source.issues.length ? "source_unavailable" : result.total ? "available" : "not_configured";
      if (!result.total) result.issues.push("No selection requirements are configured for the current estimate lines.");
      return result;
    });
  }
  async function createRequest(actor: PublicUser, projectId: string, kind: PMRequestKind, value: unknown): Promise<PMItem> {
    const input = pmRequestCreateSchema.parse(value);
    return pmTransaction(async session => {
      const project = await requirePMProject(actor, projectId, session, true); editableProject(project);
      const payload = { family: `${kind}_request`, projectId, ...input };
      const replay = await pmReplay(projectId, actor, input.idempotencyKey, payload, session); if (replay) return replay as PMItem;
      if (input.expectedVersion !== 0) pmConflict();
      let sourceId = input.sourceId; let sourceLineItemKey: string; let sourceSectionId: string | null = null;
      let estimateId: string | null; let estimateVersion: number | null; let title: string; let ownerId: string;
      let quantityMilliUnits: number | null = null; let unit: string | null = null;
      if (kind === "procurement") {
        const owner = await procurementOwner(projectId, session, true); if (!owner) pmConflict("Assign exactly one active Procurement owner before raising a request.");
        if (input.ownerId && input.ownerId !== owner) sourceChanged();
        const snapshot = await procurementItemSourceSnapshot(projectId, session, true);
        const selected = procurementSources(snapshot, owner).find(item => item.id === sourceId && item.sourceToken === input.sourceToken);
        if (!selected) sourceChanged();
        sourceLineItemKey = selected.lineItemKey!; sourceSectionId = selected.sectionId!; estimateId = snapshot.estimateId; estimateVersion = snapshot.estimateVersion;
        title = input.title ?? selected.label; ownerId = owner;
        const quantity = input.quantity ?? selected.quantity;
        if (!quantity || !selected.quantity || !selected.unit || quantity > selected.quantity || input.unit && input.unit !== selected.unit || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001) pmConflict("Enter a positive quantity within the current source scope, using its unit and at most three decimal places.");
        quantityMilliUnits = Math.round(quantity * 1000); unit = selected.unit;
      } else {
        const { source, entries } = await designSource(projectId, session, true);
        if (source.issues.length) sourceChanged();
        const selected = entries.find(entry => entry.id === sourceId && entry.category === "selection" && selectionToken(entry, project.currentProjectManagerId) === input.sourceToken);
        if (!selected || isDone(selected)) sourceChanged();
        const allowedOwners = owners(selected, source);
        ownerId = input.ownerId ?? (allowedOwners.length === 1 ? allowedOwners[0]! : "");
        if (!allowedOwners.includes(ownerId)) pmConflict("Choose a current responsible Designer or Client for this selection.");
        sourceLineItemKey = selected.lineItemId; estimateId = source.estimateId; estimateVersion = source.estimateVersion; title = input.title ?? `${selected.lineName} · ${selected.label}`;
      }
      if (await ProjectManagerRequestModel.exists({ projectId, kind, sourceId, sourceToken: input.sourceToken, status: { $in: ["open", "acknowledged"] } }).session(session)) pmConflict("An active request already exists for this source.");
      const id = kind === "selection" ? selectionRecordId(projectId, sourceId, input.sourceToken) : pmNewId("request");
      const [created] = await ProjectManagerRequestModel.create([{ _id: id, projectId, kind, sourceId, sourceToken: input.sourceToken, sourceLineItemKey, sourceSectionId, estimateId, estimateVersion,
        title, reason: input.reason, ownerId, quantityMilliUnits, unit, status: "open", version: 1, dueAt: input.dueAt ?? null, createdById: actor.id, updatedById: actor.id }], { session });
      const result = requestDto(created!.toObject(), actor, true, now(), await people([ownerId], session));
      await pmRecord(deps, { projectId, entityId: id, family: `${kind}_request`, actor, key: input.idempotencyKey, payload, action: "create", version: 1, reason: input.reason, result, recipientIds: [ownerId] }, session);
      return result;
    });
  }
  async function actRequest(actor: PublicUser, projectId: string, kind: PMRequestKind, requestId: string, value: unknown): Promise<PMItem> {
    const input = pmRequestActionSchema.parse(value);
    return pmTransaction(async session => {
      const project = await requirePMProject(actor, projectId, session, true, kind === "procurement" ? ["site_manager", "procurement"] : ["site_manager"]); editableProject(project);
      const payload = { family: `${kind}_request`, projectId, requestId, ...input };
      const replay = await pmReplay(projectId, actor, input.idempotencyKey, payload, session); if (replay) return replay as PMItem;
      const id = kind === "selection" ? selectionRecordId(projectId, requestId, input.sourceToken) : requestId;
      let row = await ProjectManagerRequestModel.findOne({ _id: id, projectId, kind }).session(session).lean();
      let recipientIds: string[];
      if (kind === "selection") {
        const { source, entries } = await designSource(projectId, session, true);
        const entry = entries.find(item => item.id === requestId && item.category === "selection");
        if (source.issues.length || !entry || selectionToken(entry, project.currentProjectManagerId) !== input.sourceToken || isDone(entry)) sourceChanged();
        recipientIds = owners(entry, source); if (!recipientIds.length) pmConflict("The current selection has no active responsible owner.");
        if (!row) {
          if (input.expectedVersion !== 0) pmConflict();
          row = { _id: id, projectId, kind, sourceId: entry.id, sourceToken: input.sourceToken, sourceLineItemKey: entry.lineItemId,
            estimateId: source.estimateId, estimateVersion: source.estimateVersion, title: `${entry.lineName} · ${entry.label}`, reason: input.reason,
            ownerId: recipientIds[0]!, status: "open", version: 0, dueAt: entry.dueAt, createdById: actor.id, updatedById: actor.id };
        }
      } else {
        if (!row) pmMissing();
        const owner = await procurementOwner(projectId, session, true);
        const snapshot = await procurementItemSourceSnapshot(projectId, session, true);
        if (!owner || row.ownerId !== owner || !procurementSources(snapshot, owner).some(source => source.id === row!.sourceId && source.sourceToken === input.sourceToken)) sourceChanged();
        recipientIds = actor.role === "procurement" ? [project.currentProjectManagerId].filter(Boolean) : [owner];
      }
      if (!row || row.version !== input.expectedVersion || row.sourceToken !== input.sourceToken) pmConflict();
      let status: string;
      try { status = requestTransition(kind, row.status, input.action, actor.role); } catch (error) { throw new ApiError(409, "PM_TRANSITION_INVALID", (error as Error).message); }
      if (input.action === "fulfill") await validateArtifact(projectId, row, input.artifact!, session);
      if (input.action === "escalate") recipientIds = await escalationRecipients(project, session);
      const update = { status, version: row.version + 1, updatedById: actor.id, ...(input.artifact ? { artifact: input.artifact } : {}) };
      if (row.version === 0) await ProjectManagerRequestModel.create([{ ...row, ...update }], { session });
      else {
        const changed = await ProjectManagerRequestModel.updateOne({ _id: id, projectId, version: input.expectedVersion }, { $set: update }, { session });
        if (changed.matchedCount !== 1) pmConflict();
      }
      const result = requestDto({ ...row, ...update }, actor, true, now(), await people([row.ownerId], session));
      await pmRecord(deps, { projectId, entityId: id, family: `${kind}_request`, actor, key: input.idempotencyKey, payload, action: input.action, version: update.version, reason: input.reason, result, recipientIds }, session);
      return result;
    });
  }
  async function supply(actor: PublicUser, projectId: string, query: PMRequestList = {}): Promise<PMPanel> {
    const page = pmRequestListSchema.parse(query);
    return pmTransaction(async session => {
      const project = await requirePMProject(actor, projectId, session, false, ["site_manager", "designer"]);
      const { source, entries } = await designRead(projectId, session);
      const result = pmPanel("supply", now()); result.issues = [...source.issues];
      const required = supplyRequiredReviewers(project.currentProjectManagerId, source.designerIds);
      result.people = await people(required, session);
      if (required.length < 2 || result.people.length !== required.length) result.issues.push("Assign an active Project Manager and Designer before recording supply sign-offs.");
      const selectedEntries = entries.filter(supplyEntry);
      const currentPairs = selectedEntries.map(entry => ({ sourceId: entry.id, sourceToken: supplyToken(entry, required) }));
      const rows = currentPairs.length ? await ProjectSupplyMilestoneModel.find({ projectId, $or: currentPairs }).session(session).lean() : [];
      for (const entry of selectedEntries) {
        const token = supplyToken(entry, required);
        const row = rows.find(item => item.sourceId === entry.id && item.sourceToken === token);
        const signed = (row?.signatures ?? []) as PMRow[];
        const complete = supplyComplete(required, signed.map(item => item.actorId));
        const permitted = !result.issues.length && required.includes(actor.id) && project.status !== "completed";
        const overdue = !!entry.dueAt && Date.parse(entry.dueAt) < now().getTime() && !complete;
        const item: PMItem = { id: entry.id, kind: "supply_milestone", title: `${entry.lineName} · ${entry.label}`, sourceId: entry.id, sourceToken: token,
          status: complete ? "signed_off" : overdue ? "missed" : signed.length ? "awaiting_cosign" : "awaiting_signoff", severity: complete ? "success" : overdue ? "critical" : "neutral",
          version: row?.version ?? 0, dueAt: entry.dueAt, description: entry.details, sourceAvailable: !result.issues.length,
          facts: [{ label: "Design requirement", value: entry.status }, { label: "Round", value: String(row?.round ?? 1) }, ...result.people.map(person => ({ label: `${person.name} · ${person.role === "site_manager" ? "Project Manager" : "Designer"}`, value: signed.some(item => item.actorId === person.id) ? "Signed" : "Pending" }))],
          actions: permitted ? [...(!signed.some(item => item.actorId === actor.id) ? [action("sign_off", actor.role === "site_manager" ? "PM sign-off" : "Designer sign-off")] : []), ...(!complete ? [action("remind", "Remind reviewer")] : []), ...(signed.length && actor.role === "site_manager" ? [action("reopen", "Reopen round")] : [])] : [],
          evidenceIds: signed.flatMap(item => item.evidenceIds ?? []) };
        result.items.push(item); result.sources.push({ id: entry.id, label: item.title, sourceToken: token, lineItemKey: entry.lineItemId });
      }
      result.items = result.items.slice(page.offset, page.offset + page.limit);
      for (const item of result.items) {
        const row = rows.find(row => row.sourceId === item.id); if (row) item.history = await pmHistory(projectId, String(row._id), session);
      }
      const obsoleteFilter = { projectId, ...(currentPairs.length ? { $nor: currentPairs } : {}) };
      const obsoleteTotal = await ProjectSupplyMilestoneModel.countDocuments(obsoleteFilter).session(session);
      const obsoleteRows = result.items.length < page.limit ? await ProjectSupplyMilestoneModel.find(obsoleteFilter).sort({ createdAt: -1, _id: 1 }).skip(Math.max(0, page.offset - selectedEntries.length)).limit(page.limit - result.items.length).session(session).lean() : [];
      for (const row of obsoleteRows) {
        result.items.push({ id: String(row._id), kind: "supply_history", title: row.title, status: "source_changed", severity: "neutral", version: row.version, sourceToken: row.sourceToken,
          sourceAvailable: false, facts: [{ label: "History", value: "Previous source signatures retained" }], actions: [], history: await pmHistory(projectId, String(row._id), session) });
      }
      result.total = selectedEntries.length + obsoleteTotal; result.availability = result.issues.length ? "source_unavailable" : result.total ? "available" : "not_configured";
      if (!result.total) result.issues.push("No critical supply requirements are configured. Milestones appear from saved Main Line requirements.");
      return result;
    });
  }
  async function actSupply(actor: PublicUser, projectId: string, milestoneId: string, value: unknown): Promise<PMItem> {
    const input = pmSupplyActionSchema.parse(value);
    return pmTransaction(async session => {
      const project = await requirePMProject(actor, projectId, session, true, ["site_manager", "designer"]); editableProject(project);
      const payload = { family: "supply", projectId, milestoneId, ...input };
      const replay = await pmReplay(projectId, actor, input.idempotencyKey, payload, session); if (replay) return replay as PMItem;
      const { source, entries } = await designSource(projectId, session, true);
      const entry = entries.find(item => item.id === milestoneId && supplyEntry(item));
      const required = supplyRequiredReviewers(project.currentProjectManagerId, source.designerIds);
      if (!entry || source.issues.length || required.length < 2 || !required.includes(actor.id) || supplyToken(entry, required) !== input.sourceToken) sourceChanged();
      const reviewers = await people(required, session); if (reviewers.length !== required.length) sourceChanged();
      const id = milestoneRecordId(projectId, milestoneId, input.sourceToken);
      const row = await ProjectSupplyMilestoneModel.findOne({ _id: id, projectId }).session(session).lean();
      if ((row?.version ?? 0) !== input.expectedVersion) pmConflict();
      const signatures: PMRow[] = [...(row?.signatures ?? [])]; let round = row?.round ?? 1;
      if (input.action === "sign_off") {
        if (signatures.some(item => item.actorId === actor.id)) pmConflict("Your sign-off is already recorded for this round.");
        await assertPMEvidence(projectId, milestoneId, input.evidenceIds, session);
        signatures.push({ actorId: actor.id, role: actor.role, at: now(), reason: input.reason, evidenceIds: input.evidenceIds });
      } else if (input.action === "reopen") {
        if (actor.role !== "site_manager" || !signatures.length) pmConflict("Only the Project Manager can reopen a signed supply round.");
        signatures.length = 0; round += 1;
      } else if (supplyComplete(required, signatures.map(item => item.actorId))) pmConflict("Every required reviewer has already signed this round.");
      const version = (row?.version ?? 0) + 1;
      if (row) {
        const updated = await ProjectSupplyMilestoneModel.updateOne({ _id: id, version: input.expectedVersion }, { $set: { signatures, round, version } }, { session }); if (updated.matchedCount !== 1) pmConflict();
      } else await ProjectSupplyMilestoneModel.create([{ _id: id, projectId, sourceId: milestoneId, sourceToken: input.sourceToken, sourceLineItemKey: entry.lineItemId,
        title: `${entry.lineName} · ${entry.label}`, requiredReviewerIds: required, signatures, round, version, createdById: actor.id }], { session });
      const result: PMItem & { signatures: PMRow[]; round: number } = { id: milestoneId, kind: "supply_milestone", title: `${entry.lineName} · ${entry.label}`, sourceToken: input.sourceToken, version,
        status: supplyComplete(required, signatures.map(item => item.actorId)) ? "signed_off" : signatures.length ? "awaiting_cosign" : "awaiting_signoff", severity: "neutral", facts: [], actions: [], signatures, round,
        evidenceIds: signatures.flatMap(item => item.evidenceIds ?? []) };
      await pmRecord(deps, { projectId, entityId: id, family: "supply", actor, key: input.idempotencyKey, payload, action: input.action, version, reason: input.reason, result,
        recipientIds: input.action === "remind" ? required.filter(reviewer => !signatures.some(item => item.actorId === reviewer)) : required }, session);
      return result;
    });
  }
  return { procurement, selections, supply, createRequest, actRequest, actSupply };
}
