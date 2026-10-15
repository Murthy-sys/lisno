import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { createEstimateRequirementSchema, updateEstimateRequirementSchema, resolveEstimateRequirementSchema } from "../domain/estimate-requirements.js";
import { effectiveCommercialStatus, isCollaborativeEstimate } from "../domain/estimation-lifecycle.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { resolveEstimatorCatalogueLines } from "./estimator-catalogue.service.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateRequirementModel } from "../models/EstimateRequirement.js";
import { ProjectModel } from "../models/Project.js";
import { UserModel } from "../models/User.js";
import { createMongoRepository } from "../repositories/mongo.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";

type Row = Record<string, any>;
const missing = (): never => { throw new ApiError(404, "ESTIMATE_REQUIREMENTS_NOT_FOUND", "Estimate requirements are unavailable."); };
const conflict = (): never => { throw new ApiError(409, "ESTIMATE_REQUIREMENTS_CHANGED", "The estimate or its requests changed. Refresh before continuing."); };

/** Publication must also fence the project in its transaction before calling this. */
export async function assertEstimateRequirementsResolved(projectId: string, expectedRequirementsVersion: number, session: ClientSession): Promise<void> {
  const project = await ProjectModel.findById(projectId).select({ estimateRequirementsVersion: 1 }).session(session).lean();
  if (!project || Number(project.estimateRequirementsVersion ?? 0) !== expectedRequirementsVersion) conflict();
  if (await EstimateRequirementModel.exists({ projectId, status: "open" }).session(session))
    throw new ApiError(409, "ESTIMATE_REQUIREMENTS_UNRESOLVED", "Resolve all client requests before submitting the estimate.");
  const included = await EstimateRequirementModel.find({ projectId, status: "included" }).session(session).lean();
  if (included.length) {
    const estimate = await EstimateModel.findOne({ projectId }).select({ lineItems: 1 }).session(session).lean();
    if (included.some(request => !request.lineItemIds.length || request.lineItemIds.some((id: string) =>
      !(estimate?.lineItems ?? []).some((line: Row) => line.id === id && line.included &&
        matchesRequirementLine(line, request)))))
      throw new ApiError(409, "ESTIMATE_REQUIREMENT_SCOPE_CHANGED", "An included client request no longer matches the estimate. Reconcile the request before submitting.");
  }
}

async function scope(actor: PublicUser, projectId: string, session?: ClientSession) {
  const userQuery = UserModel.findOne({ _id: actor.id, active: true, role: actor.role });
  const projectQuery = ProjectModel.findById(projectId);
  const estimateQuery = EstimateModel.findOne({ projectId });
  if (session) { userQuery.session(session); projectQuery.session(session); estimateQuery.session(session); }
  const user = await userQuery.lean() as Row | null;
  const project = await projectQuery.lean() as Row | null;
  const estimate = await estimateQuery.lean() as Row | null;
  if (!user || !project || project.estimationWorkflowVersion !== 2) return missing();
  const client = actor.role === "client" && project.clientId === actor.id;
  const sales = actor.role === "estimator_sales" && project.assignedEstimatorId === actor.id;
  const designer = actor.role === "designer" && estimate?.estimation?.phase === "post" &&
    (estimate.designPlanDesignerId === actor.id || project.assignedDesignerIds?.includes(actor.id));
  const supervisor = actor.role === "super_admin";
  if (!(client || sales || designer || supervisor)) missing();
  return { project: project!, estimate, client, staff: sales || designer || supervisor };
}

function assertEditable(estimate: Row | null) {
  if (!estimate) return;
  if (!isCollaborativeEstimate(estimate) || estimate.estimation.editClosedAt || estimate.estimation.finalApproval)
    throw new ApiError(409, "ESTIMATE_EDITING_CLOSED", "This estimate is closed for changes.");
  if (!["draft", "designer_changes_requested", "client_changes_requested"].includes(effectiveCommercialStatus(estimate)))
    throw new ApiError(409, "ESTIMATE_REVIEW_IN_PROGRESS", "Request changes or withdraw the submitted review before changing requirements.");
}

async function fence(projectId: string, expectedVersion: number, session: ClientSession) {
  const result = await ProjectModel.updateOne({ _id: projectId, estimationWorkflowVersion: 2,
    estimateRequirementsVersion: expectedVersion }, { $inc: { estimateRequirementsVersion: 1, estimationFenceEpoch: 1 } }, { session });
  if (result.matchedCount !== 1) conflict();
  await EstimateModel.updateOne({ projectId, "estimation.workflowVersion": 2, "estimation.editClosedAt": null },
    { $set: { "estimation.requirementsVersion": expectedVersion + 1 }, $inc: { version: 1 } }, { session });
}

function matchesRequirementLine(line: Row, request: Row): boolean {
  return line.mainBasketId === request.mainBasketId && (!request.roomId || line.roomId === request.roomId) &&
    (!request.mainLineId || (line.mainLineId === request.mainLineId && line.catalogueId === request.mainLineId));
}

const invalidMainLine = (): never => {
  throw new ApiError(400, "ESTIMATE_REQUIREMENT_MAIN_LINE_INVALID", "Select an available Main Line from this Main Basket.");
};

/** Only this name-only allowlist crosses the client boundary; catalogue financial data stays server-side. */
async function listRequirementMainLines(client: boolean) {
  const candidates = await AiEstimatorKnowledgeMainLineModel.find({
    status: { $in: ["active", "draft", "inactive"] }, itemType: { $ne: "temporary" },
    ...(client ? { estimationVisibility: "external" } : {})
  }).select({ _id: 1, name: 1, basketId: 1, subBasketId: 1 }).sort({ displayOrder: 1, _id: 1 }).lean();
  const resolved = await resolveEstimatorCatalogueLines(candidates.map(row => String(row._id)));
  return candidates.flatMap(row => {
    const current = resolved.get(String(row._id));
    if (!current || current.line.itemType === "temporary" || !current.line.subBasketId || !current.subBasketName ||
      current.line.basketId !== String(row.basketId) || current.line.subBasketId !== String(row.subBasketId)) return [];
    return [{ id: current.line.id, mainBasketId: current.line.basketId, subBasketId: current.line.subBasketId,
      subBasketName: current.subBasketName, name: String(row.name) }];
  });
}

async function validateTarget(mainBasketId: string, mainLineId: string | null, roomId: string | null, estimate: Row | null, session: ClientSession) {
  const basket = await AiEstimatorKnowledgeBasketModel.findOneAndUpdate({ _id: mainBasketId, status: "active" },
    { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).select({ _id: 1 }).lean();
  if (!basket) throw new ApiError(400, "ESTIMATE_REQUIREMENT_BASKET_INVALID", "Select an available Main Basket.");
  if (mainLineId) {
    // Writes to these dependency documents serialize against visibility changes, section saves and parent deletion.
    const line = await AiEstimatorKnowledgeMainLineModel.findOneAndUpdate({
      _id: mainLineId, basketId: mainBasketId, itemType: { $ne: "temporary" }, estimationVisibility: "external",
      status: { $in: ["active", "draft", "inactive"] }
    }, { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", timestamps: false })
      .select({ _id: 1, subBasketId: 1 }).lean();
    if (!line || !line.subBasketId) invalidMainLine();
    const child = await AiEstimatorKnowledgeSubBasketModel.findOneAndUpdate({ _id: line.subBasketId, basketId: mainBasketId },
      { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).select({ _id: 1 }).lean();
    if (!child) invalidMainLine();
    const current = (await resolveEstimatorCatalogueLines([mainLineId], session)).get(mainLineId);
    if (!current) return invalidMainLine();
    if (current.line.itemType === "temporary" || current.line.basketId !== mainBasketId ||
      current.line.subBasketId !== String(child._id)) invalidMainLine();
    const uom = await AiEstimatorKnowledgeUomModel.updateOne({ _id: current.line.uom.id, status: { $in: ["active", "inactive"] } },
      { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false });
    if (uom.matchedCount !== 1) invalidMainLine();
  }
  if (roomId && !(estimate?.rooms ?? []).some((room: Row) => room.id === roomId))
    throw new ApiError(400, "ESTIMATE_REQUIREMENT_ROOM_INVALID", "Select a room belonging to this project.");
}

function present(row: Row, actorId: string, editable: boolean) {
  return { id: String(row._id), projectId: String(row.projectId), phase: row.phase,
    mainBasketId: row.mainBasketId, mainLineId: row.mainLineId ?? null, roomId: row.roomId ?? null, text: row.text,
    authorId: row.authorId, version: row.version, status: row.status, lineItemIds: row.lineItemIds ?? [],
    reason: row.reason ?? "", supersededById: row.supersededById ?? null,
    createdAt: row.createdAt, updatedAt: row.updatedAt, resolvedAt: row.resolvedAt ?? null,
    canEdit: editable && row.status === "open" && row.authorId === actorId };
}

export function createEstimateRequirementsService(input: { audit: AuditService; now?: () => Date }) {
  const now = input.now ?? (() => new Date());
  async function detail(actor: PublicUser, projectId: string) {
    const context = await scope(actor, projectId);
    const rows = await EstimateRequirementModel.find({ projectId }).sort({ createdAt: 1, _id: 1 }).lean();
    const baskets = await AiEstimatorKnowledgeBasketModel.find({ status: "active" }).sort({ displayOrder: 1, _id: 1 }).select({ _id: 1, name: 1 }).lean();
    let editingAllowed = true;
    let editingBlockReason: "review_pending" | "closed" | null = null;
    try { assertEditable(context.estimate); } catch (error) {
      editingAllowed = false;
      editingBlockReason = error instanceof ApiError && error.code === "ESTIMATE_REVIEW_IN_PROGRESS" ? "review_pending" : "closed";
    }
    const estimate = context.estimate;
    const totalPaise = estimate?.totalPaise ?? (estimate?.total == null ? null : Math.round(Number(estimate.total) * 100));
    const indicativeTotalPaise = Number.isSafeInteger(totalPaise) && totalPaise >= 0 ? totalPaise : null;
    return { projectId, requirementsVersion: Number(context.project.estimateRequirementsVersion ?? 0),
      estimateVersion: estimate?.version ?? null, phase: estimate?.estimation?.phase ?? "pre", editingAllowed, editingBlockReason,
      canResolve: context.staff && editingAllowed,
      requirements: rows.map(row => present(row, actor.id, editingAllowed)),
      mainBaskets: baskets.map(row => ({ id: String(row._id), name: String(row.name) })),
      mainLines: await listRequirementMainLines(context.client),
      rooms: (estimate?.rooms ?? []).map((room: Row) => ({ id: String(room.id), label: String(room.label) })),
      indicativeTotalPaise,
      pricingComplete: Boolean(estimate && !estimate.isIncomplete && !rows.some(row => row.status === "open")) };
  }
  async function audit(actor: PublicUser, projectId: string, requirementId: string, action: Parameters<AuditService["append"]>[0]["action"], version: number, session: ClientSession) {
    await input.audit.appendInMongoTransaction({ actorId: actor.id, action,
      entityType: "estimate_requirement", entityId: requirementId, occurredAt: now().toISOString(),
      newValues: { projectId, version } }, session);
  }
  async function transaction(operation: (session: ClientSession) => Promise<void>) {
    try { await mongoose.connection.transaction(async session => {
      await createMongoRepository(session).coordinateAuthorizationMutation();
      await operation(session);
    }); }
    catch (error) { if ((error as { code?: number }).code === 11000) conflict(); throw error; }
  }
  return {
    detail,
    async create(actor: PublicUser, projectId: string, raw: unknown) {
      const fields = createEstimateRequirementSchema.parse(raw);
      const digest = createHash("sha256").update(JSON.stringify({ mainBasketId: fields.mainBasketId, roomId: fields.roomId ?? null, text: fields.text,
        ...(fields.mainLineId ? { mainLineId: fields.mainLineId } : {}) })).digest("hex");
      await transaction(async session => {
        const context = await scope(actor, projectId, session);
        if (!context.client) throw new ApiError(403, "ESTIMATE_REQUIREMENT_CLIENT_ONLY", "Only the project client can create a requirement.");
        const previous = await EstimateRequirementModel.findOne({ projectId, authorId: actor.id, idempotencyKey: fields.idempotencyKey }).select("+requestDigest").session(session).lean();
        if (previous) { if (previous.requestDigest !== digest) conflict(); return; }
        assertEditable(context.estimate);
        await validateTarget(fields.mainBasketId, fields.mainLineId ?? null, fields.roomId ?? null, context.estimate, session);
        await fence(projectId, fields.expectedRequirementsVersion, session);
        const id = `estimate-requirement-${randomUUID()}`, at = now().toISOString();
        const row = { _id: id, projectId, estimateId: context.estimate?._id ?? null, phase: context.estimate?.estimation?.phase ?? "pre",
          mainBasketId: fields.mainBasketId, mainLineId: fields.mainLineId ?? null, roomId: fields.roomId ?? null, text: fields.text, authorId: actor.id,
          version: 1, status: "open", idempotencyKey: fields.idempotencyKey, requestDigest: digest, createdAt: at, updatedAt: at };
        await EstimateRequirementModel.create([{ ...row, history: [{ version: 1, actorId: actor.id, at, action: "created", mainBasketId: row.mainBasketId, mainLineId: row.mainLineId ?? null, roomId: row.roomId, text: row.text, status: row.status }] }], { session });
        await audit(actor, projectId, id, "estimate_requirement.created", 1, session);
      });
      return detail(actor, projectId);
    },
    async update(actor: PublicUser, projectId: string, requirementId: string, raw: unknown) {
      const fields = updateEstimateRequirementSchema.parse(raw);
      await transaction(async session => {
        const context = await scope(actor, projectId, session);
        const row = await EstimateRequirementModel.findOne({ _id: requirementId, projectId, authorId: actor.id }).session(session).lean();
        if (!context.client || !row) missing();
        assertEditable(context.estimate);
        if (row.status !== "open" || row.version !== fields.expectedVersion) conflict();
        // Withdrawal preserves the recorded request even if its catalogue target is no longer available.
        const content = fields.withdraw
          ? { mainBasketId: row.mainBasketId, mainLineId: row.mainLineId ?? null, roomId: row.roomId ?? null, text: row.text }
          : { mainBasketId: fields.mainBasketId ?? row.mainBasketId,
              // Older clients cannot clear a field they do not know; changing the basket clears their retained line.
              mainLineId: fields.mainLineId !== undefined ? fields.mainLineId
                : fields.mainBasketId !== undefined && fields.mainBasketId !== row.mainBasketId ? null : row.mainLineId ?? null,
              roomId: fields.roomId === undefined ? row.roomId : fields.roomId,
              text: fields.text ?? row.text };
        const next = { ...content, status: fields.withdraw ? "withdrawn" : "open", updatedAt: now().toISOString() };
        if (!fields.withdraw) await validateTarget(next.mainBasketId, next.mainLineId, next.roomId ?? null, context.estimate, session);
        await fence(projectId, fields.expectedRequirementsVersion, session);
        const result = await EstimateRequirementModel.updateOne({ _id: requirementId, projectId, authorId: actor.id, status: "open", version: fields.expectedVersion },
          { $set: next, $inc: { version: 1 }, $push: { history: { mainBasketId: next.mainBasketId, mainLineId: next.mainLineId, roomId: next.roomId, text: next.text, status: next.status, version: fields.expectedVersion + 1, actorId: actor.id, at: next.updatedAt, action: fields.withdraw ? "withdrawn" : "updated" } } }, { session, runValidators: true });
        if (result.matchedCount !== 1) conflict();
        await audit(actor, projectId, requirementId, fields.withdraw ? "estimate_requirement.withdrawn" : "estimate_requirement.updated", fields.expectedVersion + 1, session);
      });
      return detail(actor, projectId);
    },
    async resolve(actor: PublicUser, projectId: string, requirementId: string, raw: unknown) {
      const fields = resolveEstimateRequirementSchema.parse(raw);
      await transaction(async session => {
        const context = await scope(actor, projectId, session);
        if (!context.staff) throw new ApiError(403, "ESTIMATE_REQUIREMENT_RESOLVE_FORBIDDEN", "Only assigned staff can resolve a requirement.");
        assertEditable(context.estimate);
        const row = await EstimateRequirementModel.findOne({ _id: requirementId, projectId, status: { $in: ["open", "included"] }, version: fields.expectedVersion }).session(session).lean();
        if (!row) conflict();
        if (fields.status === "included" && fields.lineItemIds.some(id => !(context.estimate?.lineItems ?? []).some((line: Row) => line.id === id && line.included && matchesRequirementLine(line, row))))
          throw new ApiError(400, "ESTIMATE_REQUIREMENT_LINE_INVALID", "Link included items matching this request's Main Basket, room and selected Main Line.");
        if (fields.status === "superseded" && (fields.supersededById === requirementId || !(await EstimateRequirementModel.exists({ _id: fields.supersededById, projectId }).session(session))))
          throw new ApiError(400, "ESTIMATE_REQUIREMENT_REPLACEMENT_INVALID", "Select another request in this project.");
        await fence(projectId, fields.expectedRequirementsVersion, session);
        const at = now().toISOString();
        const changes = { status: fields.status, lineItemIds: [...new Set(fields.lineItemIds)], reason: fields.reason,
          supersededById: fields.supersededById ?? null, resolvedById: actor.id, resolvedAt: at, updatedAt: at };
        const result = await EstimateRequirementModel.updateOne({ _id: requirementId, projectId, version: fields.expectedVersion, status: { $in: ["open", "included"] } },
          { $set: changes, $inc: { version: 1 }, $push: { history: { version: fields.expectedVersion + 1, actorId: actor.id, at, action: "resolved", mainBasketId: row.mainBasketId, mainLineId: row.mainLineId ?? null, roomId: row.roomId, text: row.text, status: fields.status, reason: fields.reason, lineItemIds: changes.lineItemIds } } }, { session, runValidators: true });
        if (result.matchedCount !== 1) conflict();
        await audit(actor, projectId, requirementId, "estimate_requirement.resolved", fields.expectedVersion + 1, session);
      });
      return detail(actor, projectId);
    }
  };
}
