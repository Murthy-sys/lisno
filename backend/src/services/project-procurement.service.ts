import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession, type Model } from "mongoose";
import type { ZodType } from "zod";
import type { VendorActivation } from "../contracts/vendor-induction.js";
import { normalizeKnowledgeIdentity } from "../domain/ai-estimator-knowledge.js";
import { approvedEstimateAmountPaiseIsActionable } from "../domain/workflow-estimate-items.js";
import {
  procurementItemIdentity, projectProcurementItemSchema, projectProcurementItemQuerySchema, procurementVendorQuerySchema, storedProcurementSource,
  projectProcurementUpdateSchema, projectProcurementRemovalSchema, procurementVendorSchema, plannedOrderQuantityMatchesUom,
  type ProjectProcurementItemDto, type ProjectProcurementItemInput,
  type ProjectProcurementPage, type ProcurementVendorQuery, type ProjectProcurementItemQuery, type ProcurementEstimateSource,
  type ProjectProcurementUomOption, type ProjectProcurementUpdateInput, type ProjectProcurementRemovalInput, type ProjectProcurementRemovalResult,
  type ProcurementReferenceStatus, type ProcurementVendorInput,
  type ProcurementVendorOption, type ProcurementVendorPage
} from "../domain/project-procurement.js";
import { calculatePurchaseOrderLine } from "../domain/project-purchase-order.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { ProjectPurchaseOrderRequestModel } from "../models/ProjectPurchaseOrderRequest.js";
import { ProjectPurchaseOrderRequestRevisionModel } from "../models/ProjectPurchaseOrderRequestRevision.js";
import { allocateAiEstimatorKnowledgeDisplayOrder, createAiEstimatorKnowledgeMasterDisplayOrderScope } from "./ai-estimator-knowledge-display-order.service.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { assertProcurementProjectAccess, requireProcurementActor, procurementItemSourceSnapshot } from "./procurement.service.js";
import { requireProcurementVendorReader } from "./project-vendor-suggestions.service.js";
import { prepareProcurementAllocation } from "./procurement-vendor-allocation.service.js";
import { vendorActivation, vendorActivations } from "./vendor-readiness.service.js";

type Row = Record<string, any>;
type Statuses = Map<string, ProcurementReferenceStatus>;
type ReferenceStatuses = { uoms: Statuses; uomScales: Map<string, number>; vendors: Statuses };
async function assertActiveProject(projectId: string, session: ClientSession): Promise<void> {
  const project = await ProjectModel.findById(projectId).select({ status: 1 }).session(session).lean();
  if (!project || project.status !== "active") throw new ApiError(409, "PROCUREMENT_PROJECT_NOT_ACTIVE", "Completed or paused projects cannot change procurement items.");
}
export interface ProjectProcurementService {
  list(actor: PublicUser, projectId: string, query: ProjectProcurementItemQuery): Promise<ProjectProcurementPage>;
  get(actor: PublicUser, projectId: string, itemId: string): Promise<ProjectProcurementItemDto>;
  listUoms(actor: PublicUser): Promise<ProjectProcurementUomOption[]>;
  create(actor: PublicUser, projectId: string, input: ProjectProcurementItemInput): Promise<ProjectProcurementItemDto>;
  update(actor: PublicUser, projectId: string, itemId: string, input: ProjectProcurementUpdateInput): Promise<ProjectProcurementItemDto>;
  remove(actor: PublicUser, projectId: string, itemId: string, input: ProjectProcurementRemovalInput): Promise<ProjectProcurementRemovalResult>;
  listVendors(actor: PublicUser, query: ProcurementVendorQuery): Promise<ProcurementVendorPage>;
  createVendor(actor: PublicUser, input: ProcurementVendorInput): Promise<{ vendor: ProcurementVendorOption; created: boolean }>;
}

export function createProjectProcurementService(input: { audit: AuditService; now?: () => Date }): ProjectProcurementService {
  const now = input.now ?? (() => new Date());

  async function transaction<T>(actor: PublicUser, operation: (session: ClientSession) => Promise<T>, projectId?: string, directoryRead = false): Promise<T> {
    return mongoose.connection.transaction(async (session) => {
      if (directoryRead) await requireProcurementVendorReader(actor, session);
      else if (projectId === undefined) await requireProcurementActor(actor, session);
      else await assertProcurementProjectAccess(actor, projectId, session);
      return operation(session);
    }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
  }

  async function itemTransaction<T>(actor: PublicUser, projectId: string, operation: (session: ClientSession) => Promise<T>): Promise<T> {
    try {
      return await transaction(actor, operation, projectId);
    } catch (error) {
      if (isDuplicate(error)) throw new ApiError(409, "PROCUREMENT_ITEM_DUPLICATE", "An item with this name, brand, UOM and vendor already exists under this estimate item.");
      throw error;
    }
  }

  return {
    async list(actor, projectId, query) {
      return itemTransaction(actor, projectId, async (session) => {
        const parsed = validate(projectProcurementItemQuerySchema, query);
        const { q, limit, offset } = parsed;
        let sourceFilter: Row = {};
        if (parsed.estimateId !== undefined || parsed.unassigned) {
          const snapshot = await procurementItemSourceSnapshot(projectId, session);
          if (parsed.unassigned) {
            const actionableLines = snapshot.lineItems.filter((line) => approvedEstimateAmountPaiseIsActionable(line.amountPaise));
            sourceFilter = { $nor: [{ estimateId: snapshot.estimateId, estimateVersion: snapshot.estimateVersion,
              estimateReviewRoundId: snapshot.estimateReviewRoundId,
              $or: actionableLines.map((line) => ({ sourceLineItemKey: line.key, sourceSectionId: line.sectionId }))
            }] };
            if (actionableLines.length === 0) sourceFilter = {};
          } else sourceFilter = sourceForInput(snapshot, parsed as SourceInput);
        }
        const filter = { $and: [{ projectId, removedAt: null }, sourceFilter, searchFilter(q, ["itemNameNormalized", "brandNormalized", "uomSearch", "vendorSearch"])] };
        const total = await ProjectProcurementItemModel.countDocuments(filter).session(session);
        const rows = await ProjectProcurementItemModel.find(filter)
          .sort({ itemNameNormalized: 1, brandNormalized: 1, _id: 1 }).skip(offset).limit(limit).session(session).lean();
        const statuses = await referenceStatuses(rows, session);
        return { items: rows.map((row) => dto(row, statuses)), total, limit, offset };
      });
    },
    async get(actor, projectId, itemId) {
      return itemTransaction(actor, projectId, async (session) => {
        const row = await requireItem(projectId, itemId, session);
        return dto(row, await referenceStatuses([row], session));
      });
    },
    async listUoms(actor) {
      return transaction(actor, async (session) => {
        const rows = await AiEstimatorKnowledgeUomModel.find({ status: "active" }).select({ _id: 1, code: 1, name: 1, decimalScale: 1 })
          .sort({ displayOrder: 1, _id: 1 }).session(session).lean();
        return rows.map((row) => ({ ...option(row), decimalScale: Number(row.decimalScale) }));
      });
    },
    async create(actor, projectId, value) {
      return itemTransaction(actor, projectId, async (session) => {
        await assertActiveProject(projectId, session);
        const fields = validate(projectProcurementItemSchema, value);
        const source = sourceForInput(await procurementItemSourceSnapshot(projectId, session, true), fields, true);
        const uom = await activeReference(AiEstimatorKnowledgeUomModel, fields.uomId, "uomId", session);
        validatePlannedQuantity(fields.plannedOrderQuantityMilliUnits, uom.decimalScale, fields.pricePaise);
        const allocation = await prepareProcurementAllocation(fields, session);
        const vendor = allocation.vendor;
        const timestamp = now();
        const [document] = await ProjectProcurementItemModel.create([{
          _id: `procurement-item-${randomUUID()}`, projectId, ...storedFields(fields), ...source,
          ...referenceSnapshot("uom", uom), uomDecimalScale: Number(uom.decimalScale), ...referenceSnapshot("vendor", vendor),
          allocatedWorkPaise: allocation.allocatedWorkPaise, allocationTrackingVersion: allocation.allocationTrackingVersion,
          version: 1, createdById: actor.id, updatedById: actor.id,
          createdAt: timestamp, updatedAt: timestamp
        }], { session });
        if (!document) throw new Error("Project procurement item creation failed.");
        const result = dto(document.toObject(), {
          uoms: new Map([[fields.uomId, "active"]]),
          uomScales: new Map([[fields.uomId, Number(uom.decimalScale)]]),
          vendors: new Map(fields.vendorId ? [[fields.vendorId, "active"]] : [])
        });
        await input.audit.appendInMongoTransaction({
          actorId: actor.id, action: "project_procurement_item_created", entityType: "project_procurement_item",
          entityId: result.id, occurredAt: timestamp.toISOString(), newValues: { ...result }
        }, session);
        return result;
      });
    },
    async update(actor, projectId, itemId, value) {
      return itemTransaction(actor, projectId, async (session) => {
        await assertActiveProject(projectId, session);
        const fields = validate(projectProcurementUpdateSchema, value);
        const current = await requireItem(projectId, itemId, session);
        if (current.version !== fields.expectedVersion) conflict();
        await assertNoPendingProjectRequestReference(projectId, itemId, session);
        const existingSource = itemSource(current);
        let source = existingSource;
        if (existingSource || fields.estimateId !== undefined) {
          const requestedSource = fields.estimateId === undefined ? existingSource! : fields as SourceInput;
          const snapshot = await procurementItemSourceSnapshot(projectId, session, true);
          if (existingSource && (requestedSource.estimateId !== existingSource.estimateId || requestedSource.estimateVersion !== existingSource.estimateVersion)) sourceConflict();
          const reassigning = Boolean(existingSource && requestedSource.sourceLineItemKey !== existingSource.sourceLineItemKey);
          if (reassigning) {
            const previousLine = snapshot.lineItems.find((line) => line.key === existingSource!.sourceLineItemKey);
            if (existingSource!.estimateReviewRoundId !== snapshot.estimateReviewRoundId ||
              !previousLine || previousLine.sectionId !== existingSource!.sourceSectionId ||
              approvedEstimateAmountPaiseIsActionable(previousLine.amountPaise)) sourceConflict();
          }
          source = sourceForInput(snapshot, requestedSource, !existingSource || reassigning);
          if (existingSource && !reassigning && (source.estimateReviewRoundId !== existingSource.estimateReviewRoundId || source.sourceSectionId !== existingSource.sourceSectionId)) sourceConflict();
          if (reassigning) await assertNoReassignmentReference(projectId, itemId, session);
        }
        const uom = fields.uomId === current.uomId ? null : await activeReference(AiEstimatorKnowledgeUomModel, fields.uomId, "uomId", session);
        const selectedUom = uom ?? await AiEstimatorKnowledgeUomModel.findById(fields.uomId).select({ decimalScale: 1 }).session(session).lean();
        const decimalScale = uom ? Number(uom.decimalScale) : current.uomDecimalScale ?? selectedUom?.decimalScale ?? null;
        const plannedQuantity = fields.plannedOrderQuantityMilliUnits ?? current.plannedOrderQuantityMilliUnits ?? null;
        if (plannedQuantity !== null) validatePlannedQuantity(plannedQuantity, decimalScale, fields.pricePaise);
        const vendorChanged = fields.vendorId !== current.vendorId;
        const allocation = await prepareProcurementAllocation({ current, ...fields }, session);
        const vendor = allocation.vendor;
        const allocationReduced = current.allocatedWorkPaise != null &&
          (allocation.allocatedWorkPaise == null || allocation.allocatedWorkPaise < current.allocatedWorkPaise);
        if ((vendorChanged || allocationReduced) && await approvedOrderReferencesItem(projectId, itemId, session)) {
          throw new ApiError(409, "PROCUREMENT_ITEM_APPROVED_ALLOCATION_LOCKED",
            "An approved purchase order uses this item's vendor allocation. Keep that vendor and amount, or reconcile the approved order first.");
        }
        const timestamp = now();
        const updated = await ProjectProcurementItemModel.findOneAndUpdate({ _id: itemId, projectId, removedAt: null, version: fields.expectedVersion }, {
          $set: {
            ...storedFields(fields), plannedOrderQuantityMilliUnits: plannedQuantity,
            ...(source ?? {}), ...(uom ? { ...referenceSnapshot("uom", uom), uomDecimalScale: Number(uom.decimalScale) } : {}),
            ...(vendorChanged ? referenceSnapshot("vendor", vendor) : {}),
            allocatedWorkPaise: allocation.allocatedWorkPaise, allocationTrackingVersion: allocation.allocationTrackingVersion,
            updatedById: actor.id, updatedAt: timestamp
          },
          $inc: { version: 1 }
        }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
        if (!updated) conflict();
        const statuses = await referenceStatuses([current, updated], session);
        const result = dto(updated, statuses);
        await input.audit.appendInMongoTransaction({
          actorId: actor.id, action: "project_procurement_item_updated", entityType: "project_procurement_item",
          entityId: itemId, occurredAt: timestamp.toISOString(), oldValues: { ...dto(current, statuses) }, newValues: { ...result }
        }, session);
        return result;
      });
    },
    async remove(actor, projectId, itemId, value) {
      return itemTransaction(actor, projectId, async (session) => {
        await assertActiveProject(projectId, session);
        const fields = validate(projectProcurementRemovalSchema, value);
        const current = await requireItem(projectId, itemId, session);
        if (current.version !== fields.expectedVersion) conflict();
        await assertNoPendingProjectRequestReference(projectId, itemId, session);
        // The pending or approved revision is immutable, and even a mutable draft
        // must explicitly detach the child before it can be removed.
        if (await ProjectPurchaseOrderRevisionModel.exists({ projectId, "lines.procurementItemId": itemId }).session(session)) {
          throw new ApiError(409, "PROCUREMENT_ITEM_ORDER_REFERENCED", "This item is part of a submitted purchase order and cannot be removed.");
        }
        if (await ProjectPurchaseOrderModel.exists({ projectId, status: { $ne: "cancelled" }, "draftLines.procurementItemId": itemId }).session(session)) {
          throw new ApiError(409, "PROCUREMENT_ITEM_ORDER_DRAFT_REFERENCED", "Remove this item from its draft purchase order before removing the procurement item.");
        }
        const timestamp = now();
        const updated = await ProjectProcurementItemModel.findOneAndUpdate({ _id: itemId, projectId, removedAt: null, version: fields.expectedVersion }, {
          $set: { removedAt: timestamp, removedById: actor.id, removalReason: fields.reason, updatedById: actor.id, updatedAt: timestamp },
          $inc: { version: 1 }
        }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
        if (!updated) conflict();
        const result = { id: itemId, projectId, version: updated.version, removedAt: timestamp.toISOString() };
        const referenceStatus = await referenceStatuses([current], session);
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "project_procurement_item_removed",
          entityType: "project_procurement_item", entityId: itemId, occurredAt: result.removedAt, reason: fields.reason,
          oldValues: { ...dto(current, referenceStatus) }, newValues: { ...result, removedById: actor.id } }, session);
        return result;
      });
    },
    async listVendors(actor, query) {
      return transaction(actor, async (session) => {
        const { q, limit, offset, effectiveStatus } = validate(procurementVendorQuerySchema, query);
        const filter = { status: { $in: ["active", "inactive"] }, ...searchFilter(q, ["codeNormalized", "nameNormalized"]) };
        if (!effectiveStatus) {
          const total = await AiEstimatorKnowledgeVendorModel.countDocuments(filter).session(session);
          const rows = await AiEstimatorKnowledgeVendorModel.find(filter)
            .sort({ displayOrder: 1, _id: 1 }).skip(offset).limit(limit).session(session).lean();
          const activations = await vendorActivations(rows, session);
          return { items: rows.map(row => vendorOption(row, activations.get(String(row._id))!)), total, limit, offset };
        }
        // KPI state is stored outside the vendor master. Evaluate it before paging,
        // so total and offsets describe active vendors rather than lifecycle rows.
        const candidates = await AiEstimatorKnowledgeVendorModel.find({ ...filter, status: "active" })
          .sort({ displayOrder: 1, _id: 1 }).session(session).lean();
        const activations = await vendorActivations(candidates, session);
        const active = candidates.filter(row => activations.get(String(row._id))?.effectiveStatus === "active");
        return { items: active.slice(offset, offset + limit).map(row => vendorOption(row, activations.get(String(row._id))!)),
          total: active.length, limit, offset };
      }, undefined, true);
    },
    async createVendor(actor, value) {
      // A competing admin create may surface E11000 instead of a transient write
      // conflict. Re-enter with a fresh snapshot to reuse the winning identity.
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await transaction(actor, async (session) => {
            const { name } = validate(procurementVendorSchema, value);
            const nameNormalized = normalizeKnowledgeIdentity(name);
            const existing = await AiEstimatorKnowledgeVendorModel.findOne({ nameNormalized, status: { $in: ["active", "inactive"] } }).session(session).lean();
            if (existing?.status === "inactive") throw new ApiError(409, "PROCUREMENT_VENDOR_INACTIVE", "A vendor with this name is inactive. Ask Configuration to reactivate it or use a different name.");
            if (existing) return { vendor: vendorOption(existing, await vendorActivation(existing, session)), created: false };
            const displayOrder = await allocateAiEstimatorKnowledgeDisplayOrder({
              scope: createAiEstimatorKnowledgeMasterDisplayOrderScope("vendors"),
              resourceModel: AiEstimatorKnowledgeVendorModel, resourceFilter: {}, session
            });
            const identity = randomUUID();
            const timestamp = now();
            const [created] = await AiEstimatorKnowledgeVendorModel.create([{
              _id: `knowledge-vendor-${identity}`, code: `PV-${identity.toUpperCase()}`, name,
              nameNormalized, displayOrder, status: "active", version: 1,
              createdById: actor.id, updatedById: actor.id, archivedAt: null, archivedById: null,
              createdAt: timestamp, updatedAt: timestamp
            }], { session });
            if (!created) throw new Error("Procurement vendor creation failed.");
            await input.audit.appendInMongoTransaction({
              actorId: actor.id, action: "ai_estimator_knowledge_master_created", entityType: "ai_estimator_knowledge_vendor",
              entityId: String(created._id), occurredAt: timestamp.toISOString(),
              newValues: { masterType: "vendors", status: "active", version: 1, displayOrder, source: "procurement" }
            }, session);
            return { vendor: vendorOption(created.toObject(), await vendorActivation(created.toObject(), session)), created: true };
          });
        } catch (error) {
          if (!isDuplicate(error) || attempt >= 2) throw error;
        }
      }
    }
  };
}

function validate<T>(schema: ZodType<T, any, any>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
  return parsed.data;
}
function searchFilter(query: string, fields: string[]): Record<string, unknown> {
  const literal = procurementItemIdentity(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return literal ? { $or: fields.map((key) => ({ [key]: { $regex: literal } })) } : {};
}
function storedFields(fields: Pick<ProjectProcurementItemInput, "itemName" | "brand" | "uomId" | "vendorId" | "pricePaise"> & { plannedOrderQuantityMilliUnits?: number }) {
  return {
    itemName: fields.itemName, brand: fields.brand, uomId: fields.uomId, vendorId: fields.vendorId, pricePaise: fields.pricePaise,
    ...(fields.plannedOrderQuantityMilliUnits === undefined ? {} : { plannedOrderQuantityMilliUnits: fields.plannedOrderQuantityMilliUnits }),
    itemNameNormalized: procurementItemIdentity(fields.itemName), brandNormalized: procurementItemIdentity(fields.brand)
  };
}
function referenceSnapshot(prefix: "uom" | "vendor", reference: Row | null) {
  return {
    [`${prefix}Code`]: reference?.code ?? null,
    [`${prefix}Name`]: reference?.name ?? null,
    [`${prefix}Search`]: reference ? procurementItemIdentity(`${reference.code} ${reference.name}`) : null
  };
}
async function activeReference(model: Model<any>, id: string, field: "uomId" | "vendorId", session: ClientSession): Promise<Row> {
  // Serialize with Configuration lifecycle writes; snapshots allow later archival.
  const reference = await model.findOneAndUpdate({ _id: id, status: "active" },
    { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
  if (!reference) throw new ApiError(400, "VALIDATION_ERROR", "Choose an active reference.", { [field]: `This ${field === "uomId" ? "UOM" : "vendor"} is no longer available. Choose an active option.` });
  return reference;
}
async function requireItem(projectId: string, id: string, session: ClientSession): Promise<Row> {
  const row = await ProjectProcurementItemModel.findOne({ _id: id, projectId, removedAt: null }).session(session).lean();
  if (!row) throw new ApiError(404, "PROCUREMENT_ITEM_NOT_FOUND", "Procurement item not found.");
  return row;
}
async function assertNoPendingProjectRequestReference(projectId: string, itemId: string, session: ClientSession): Promise<void> {
  const request = await ProjectPurchaseOrderRequestModel.findOne({ projectId, status: "pending_approval" })
    .select({ _id: 1, submittedRevisionId: 1 }).session(session).lean();
  if (!request) return;
  if (await ProjectPurchaseOrderRequestRevisionModel.exists({ _id: request.submittedRevisionId,
    requestId: request._id, projectId, "lines.procurementItemId": itemId }).session(session)) {
    throw new ApiError(409, "PROCUREMENT_ITEM_REQUEST_PENDING", "This item is in a purchase order request awaiting Super Admin review. Request changes before editing it.");
  }
}
async function assertNoReassignmentReference(projectId: string, itemId: string, session: ClientSession): Promise<void> {
  // A submitted request or order captures this item's original estimate source.
  // Even a returned revision must keep that immutable lineage intact.
  if (await ProjectPurchaseOrderRequestRevisionModel.exists({ projectId, "lines.procurementItemId": itemId }).session(session) ||
    await ProjectPurchaseOrderRevisionModel.exists({ projectId, "lines.procurementItemId": itemId }).session(session) ||
    await ProjectPurchaseOrderModel.exists({ projectId, status: { $ne: "cancelled" }, "draftLines.procurementItemId": itemId }).session(session)) {
    throw new ApiError(409, "PROCUREMENT_ITEM_ORDER_REFERENCED", "This item's original estimate assignment is recorded in a purchase order or approval request. Keep its source for purchasing history and create a corrected item under a paid estimate line.");
  }
}
async function approvedOrderReferencesItem(projectId: string, itemId: string, session: ClientSession): Promise<boolean> {
  const orders = await ProjectPurchaseOrderModel.find({ projectId, approvedRevisionId: { $ne: null }, cancelledAt: null })
    .select({ approvedRevisionId: 1 }).session(session).lean();
  if (!orders.length) return false;
  return Boolean(await ProjectPurchaseOrderRevisionModel.exists({ projectId,
    _id: { $in: orders.map(order => order.approvedRevisionId) }, "lines.procurementItemId": itemId }).session(session));
}
async function referenceStatuses(rows: Row[], session: ClientSession) {
  // Mongoose transactions must not run parallel queries on one session.
  const uomRows = await AiEstimatorKnowledgeUomModel.find({ _id: { $in: [...new Set(rows.map(row => row.uomId))] } })
    .select({ _id: 1, status: 1, decimalScale: 1 }).session(session).lean();
  const uoms = new Map<string, ProcurementReferenceStatus>(uomRows.map(row => [String(row._id), row.status]));
  const uomScales = new Map<string, number>(uomRows.map(row => [String(row._id), Number(row.decimalScale)]));
  for (const row of rows) if (!uomScales.has(String(row.uomId)) && Number.isSafeInteger(row.uomDecimalScale))
    uomScales.set(String(row.uomId), Number(row.uomDecimalScale));
  const vendorRows = await AiEstimatorKnowledgeVendorModel.find({ _id: { $in: [...new Set(rows.flatMap(row => row.vendorId ? [row.vendorId] : []))] } })
    .select({ _id: 1, status: 1, procurementProfile: 1, msmeCertificate: 1, kpiRubricGeneration: 1 }).session(session).lean();
  const activations = await vendorActivations(vendorRows, session);
  const vendors = new Map<string, ProcurementReferenceStatus>(vendorRows.map(row => [String(row._id), activations.get(String(row._id))!.effectiveStatus]));
  return { uoms, uomScales, vendors };
}
function option(row: Row): Pick<ProjectProcurementUomOption, "id" | "code" | "name"> {
  return { id: String(row._id), code: String(row.code), name: String(row.name) };
}
function vendorOption(row: Row, activation: VendorActivation): ProcurementVendorOption {
  if (activation.effectiveStatus === "archived") throw new Error("Archived vendors cannot be offered for procurement.");
  return { ...option(row), status: activation.effectiveStatus, assignable: activation.effectiveStatus === "active", readiness: activation.gates };
}
function dto(row: Row, referenceStatus: ReferenceStatuses): ProjectProcurementItemDto {
  const quantity = row.plannedOrderQuantityMilliUnits ?? null;
  const decimalScale = row.uomDecimalScale ?? referenceStatus.uomScales.get(row.uomId) ?? null;
  let plannedLineNetPaise: number | null = null;
  if (quantity !== null && decimalScale !== null && plannedOrderQuantityMatchesUom(quantity, decimalScale)) {
    try { plannedLineNetPaise = calculatePurchaseOrderLine({ quantityMilliUnits: quantity, unitPricePaise: row.pricePaise, gstBasisPoints: 0 }).netPaise; }
    catch { /* A historical malformed amount remains visible as incomplete. */ }
  }
  return {
    id: String(row._id), projectId: row.projectId, estimateSource: itemSource(row), itemName: row.itemName, brand: row.brand,
    uom: { id: row.uomId, code: row.uomCode, name: row.uomName, decimalScale, status: referenceStatus.uoms.get(row.uomId) ?? "unavailable" },
    vendor: row.vendorId ? { id: row.vendorId, code: row.vendorCode, name: row.vendorName, status: referenceStatus.vendors.get(row.vendorId) ?? "unavailable" } : null,
    pricePaise: row.pricePaise, plannedOrderQuantityMilliUnits: quantity, plannedLineNetPaise,
    allocatedWorkPaise: row.allocatedWorkPaise ?? null, version: row.version,
    createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString()
  };
}
function validatePlannedQuantity(quantityMilliUnits: number, decimalScale: number | null, pricePaise: number): void {
  if (decimalScale === null) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.",
    { uomId: "This item's UOM precision is unavailable. Choose an active UOM before changing its quantity or unit price." });
  if (!plannedOrderQuantityMatchesUom(quantityMilliUnits, decimalScale)) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.",
    { plannedOrderQuantityMilliUnits: `Enter a positive quantity with at most ${decimalScale} decimal place${decimalScale === 1 ? "" : "s"} for this UOM.` });
  try { calculatePurchaseOrderLine({ quantityMilliUnits, unitPricePaise: pricePaise, gstBasisPoints: 0 }); }
  catch { throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", { plannedOrderQuantityMilliUnits: "This quantity and unit price exceed the supported purchase order amount." }); }
}
type SourceInput = Pick<ProcurementEstimateSource, "estimateId" | "estimateVersion" | "sourceLineItemKey">;
function sourceForInput(snapshot: Awaited<ReturnType<typeof procurementItemSourceSnapshot>>, input: SourceInput, requireActionable = false): ProcurementEstimateSource {
  const line = snapshot.lineItems.find((item) => item.key === input.sourceLineItemKey);
  if (input.estimateId !== snapshot.estimateId || input.estimateVersion !== snapshot.estimateVersion || !line) sourceConflict();
  if (requireActionable && !approvedEstimateAmountPaiseIsActionable(line.amountPaise)) {
    throw new ApiError(409, "PROCUREMENT_ITEM_ZERO_ESTIMATE_VALUE", "This approved estimate item has ₹0.00 value. Choose an item with a positive approved value.");
  }
  return { estimateId: snapshot.estimateId, estimateVersion: snapshot.estimateVersion, estimateReviewRoundId: snapshot.estimateReviewRoundId, sourceSectionId: line.sectionId, sourceLineItemKey: line.key };
}
function itemSource(row: Row): ProcurementEstimateSource | null {
  try { return storedProcurementSource(row); } catch { sourceConflict(); }
}
function sourceConflict(): never {
  throw new ApiError(409, "PROCUREMENT_ITEM_SOURCE_CONFLICT", "This item does not match the current approved estimate. Refresh and review its estimate item before saving.");
}
function conflict(): never {
  throw new ApiError(409, "PROCUREMENT_ITEM_VERSION_CONFLICT", "This item has changed. Reload the latest item before saving again.");
}
function isDuplicate(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}
