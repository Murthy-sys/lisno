import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession, type Model } from "mongoose";
import type { ZodType } from "zod";
import { normalizeKnowledgeIdentity } from "../domain/ai-estimator-knowledge.js";
import {
  procurementItemIdentity, projectProcurementItemSchema, projectProcurementItemQuerySchema, projectProcurementQuerySchema, storedProcurementSource,
  projectProcurementUpdateSchema, procurementVendorSchema,
  type ProjectProcurementItemDto, type ProjectProcurementItemInput,
  type ProjectProcurementPage, type ProjectProcurementQuery, type ProjectProcurementItemQuery, type ProcurementEstimateSource,
  type ProjectProcurementUomOption, type ProjectProcurementUpdateInput,
  type ProcurementReferenceStatus, type ProcurementVendorInput,
  type ProcurementVendorOption, type ProcurementVendorPage
} from "../domain/project-procurement.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { allocateAiEstimatorKnowledgeDisplayOrder, createAiEstimatorKnowledgeMasterDisplayOrderScope } from "./ai-estimator-knowledge-display-order.service.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { assertProcurementProjectAccess, requireProcurementActor, procurementItemSourceSnapshot } from "./procurement.service.js";
import { requireProcurementVendorReader } from "./project-vendor-suggestions.service.js";

type Row = Record<string, any>;
type Statuses = Map<string, ProcurementReferenceStatus>;
export interface ProjectProcurementService {
  list(actor: PublicUser, projectId: string, query: ProjectProcurementItemQuery): Promise<ProjectProcurementPage>;
  get(actor: PublicUser, projectId: string, itemId: string): Promise<ProjectProcurementItemDto>;
  listUoms(actor: PublicUser): Promise<ProjectProcurementUomOption[]>;
  create(actor: PublicUser, projectId: string, input: ProjectProcurementItemInput): Promise<ProjectProcurementItemDto>;
  update(actor: PublicUser, projectId: string, itemId: string, input: ProjectProcurementUpdateInput): Promise<ProjectProcurementItemDto>;
  listVendors(actor: PublicUser, query: ProjectProcurementQuery): Promise<ProcurementVendorPage>;
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
            sourceFilter = { $nor: [{ estimateId: snapshot.estimateId, estimateVersion: snapshot.estimateVersion,
              estimateReviewRoundId: snapshot.estimateReviewRoundId,
              $or: snapshot.lineItems.map((line) => ({ sourceLineItemKey: line.key, sourceSectionId: line.sectionId }))
            }] };
            if (snapshot.lineItems.length === 0) sourceFilter = {};
          } else sourceFilter = sourceForInput(snapshot, parsed as SourceInput);
        }
        const filter = { $and: [{ projectId }, sourceFilter, searchFilter(q, ["itemNameNormalized", "brandNormalized", "uomSearch", "vendorSearch"])] };
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
        const rows = await AiEstimatorKnowledgeUomModel.find({ status: "active" }).select({ _id: 1, code: 1, name: 1 })
          .sort({ displayOrder: 1, _id: 1 }).session(session).lean();
        return rows.map(option);
      });
    },
    async create(actor, projectId, value) {
      return itemTransaction(actor, projectId, async (session) => {
        const fields = validate(projectProcurementItemSchema, value);
        const source = sourceForInput(await procurementItemSourceSnapshot(projectId, session, true), fields);
        const uom = await activeReference(AiEstimatorKnowledgeUomModel, fields.uomId, "uomId", session);
        const vendor = fields.vendorId ? await activeReference(AiEstimatorKnowledgeVendorModel, fields.vendorId, "vendorId", session) : null;
        const timestamp = now();
        const [document] = await ProjectProcurementItemModel.create([{
          _id: `procurement-item-${randomUUID()}`, projectId, ...storedFields(fields), ...source,
          ...referenceSnapshot("uom", uom), ...referenceSnapshot("vendor", vendor),
          version: 1, createdById: actor.id, updatedById: actor.id,
          createdAt: timestamp, updatedAt: timestamp
        }], { session });
        if (!document) throw new Error("Project procurement item creation failed.");
        const result = dto(document.toObject(), {
          uoms: new Map([[fields.uomId, "active"]]),
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
        const fields = validate(projectProcurementUpdateSchema, value);
        const current = await requireItem(projectId, itemId, session);
        if (current.version !== fields.expectedVersion) conflict();
        const existingSource = itemSource(current);
        let source = existingSource;
        if (existingSource || fields.estimateId !== undefined) {
          const requestedSource = fields.estimateId === undefined ? existingSource! : fields as SourceInput;
          if (existingSource && (requestedSource.estimateId !== existingSource.estimateId || requestedSource.estimateVersion !== existingSource.estimateVersion || requestedSource.sourceLineItemKey !== existingSource.sourceLineItemKey)) sourceConflict();
          source = sourceForInput(await procurementItemSourceSnapshot(projectId, session, true), requestedSource);
          if (existingSource && (source.estimateReviewRoundId !== existingSource.estimateReviewRoundId || source.sourceSectionId !== existingSource.sourceSectionId)) sourceConflict();
        }
        const uom = fields.uomId === current.uomId ? null : await activeReference(AiEstimatorKnowledgeUomModel, fields.uomId, "uomId", session);
        const vendorChanged = fields.vendorId !== current.vendorId;
        const vendor = vendorChanged && fields.vendorId ? await activeReference(AiEstimatorKnowledgeVendorModel, fields.vendorId, "vendorId", session) : null;
        const timestamp = now();
        const updated = await ProjectProcurementItemModel.findOneAndUpdate({ _id: itemId, projectId, version: fields.expectedVersion }, {
          $set: {
            ...storedFields(fields), ...(source ?? {}), ...(uom ? referenceSnapshot("uom", uom) : {}),
            ...(vendorChanged ? referenceSnapshot("vendor", vendor) : {}),
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
    async listVendors(actor, query) {
      return transaction(actor, async (session) => {
        const { q, limit, offset } = validate(projectProcurementQuerySchema, query);
        const filter = { status: "active", ...searchFilter(q, ["codeNormalized", "nameNormalized"]) };
        const total = await AiEstimatorKnowledgeVendorModel.countDocuments(filter).session(session);
        const rows = await AiEstimatorKnowledgeVendorModel.find(filter).select({ _id: 1, code: 1, name: 1 })
          .sort({ displayOrder: 1, _id: 1 }).skip(offset).limit(limit).session(session).lean();
        return { items: rows.map(vendorOption), total, limit, offset };
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
            if (existing) return { vendor: vendorOption(existing), created: false };
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
            return { vendor: vendorOption(created.toObject()), created: true };
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
function storedFields(fields: Pick<ProjectProcurementItemInput, "itemName" | "brand" | "uomId" | "vendorId" | "pricePaise">) {
  return {
    itemName: fields.itemName, brand: fields.brand, uomId: fields.uomId, vendorId: fields.vendorId, pricePaise: fields.pricePaise,
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
  const row = await ProjectProcurementItemModel.findOne({ _id: id, projectId }).session(session).lean();
  if (!row) throw new ApiError(404, "PROCUREMENT_ITEM_NOT_FOUND", "Procurement item not found.");
  return row;
}
async function statuses(model: Model<any>, ids: string[], session: ClientSession): Promise<Statuses> {
  const rows = await model.find({ _id: { $in: [...new Set(ids)] } }).select({ _id: 1, status: 1 }).session(session).lean();
  return new Map(rows.map((row) => [String(row._id), row.status]));
}
async function referenceStatuses(rows: Row[], session: ClientSession) {
  // Mongoose transactions must not run parallel queries on one session.
  const uoms = await statuses(AiEstimatorKnowledgeUomModel, rows.map((row) => row.uomId), session);
  const vendors = await statuses(AiEstimatorKnowledgeVendorModel, rows.flatMap((row) => row.vendorId ? [row.vendorId] : []), session);
  return { uoms, vendors };
}
function option(row: Row): ProjectProcurementUomOption {
  return { id: String(row._id), code: String(row.code), name: String(row.name) };
}
function vendorOption(row: Row): ProcurementVendorOption { return { ...option(row), status: "active" }; }
function dto(row: Row, referenceStatus: { uoms: Statuses; vendors: Statuses }): ProjectProcurementItemDto {
  return {
    id: String(row._id), projectId: row.projectId, estimateSource: itemSource(row), itemName: row.itemName, brand: row.brand,
    uom: { id: row.uomId, code: row.uomCode, name: row.uomName, status: referenceStatus.uoms.get(row.uomId) ?? "unavailable" },
    vendor: row.vendorId ? { id: row.vendorId, code: row.vendorCode, name: row.vendorName, status: referenceStatus.vendors.get(row.vendorId) ?? "unavailable" } : null,
    pricePaise: row.pricePaise, version: row.version,
    createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString()
  };
}
type SourceInput = Pick<ProcurementEstimateSource, "estimateId" | "estimateVersion" | "sourceLineItemKey">;
function sourceForInput(snapshot: Awaited<ReturnType<typeof procurementItemSourceSnapshot>>, input: SourceInput): ProcurementEstimateSource {
  const line = snapshot.lineItems.find((item) => item.key === input.sourceLineItemKey);
  if (input.estimateId !== snapshot.estimateId || input.estimateVersion !== snapshot.estimateVersion || !line) sourceConflict();
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
