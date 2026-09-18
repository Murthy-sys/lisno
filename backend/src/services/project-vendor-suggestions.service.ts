import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type { ZodType } from "zod";
import { vendorSuggestionCreateSchema, vendorSuggestionQuerySchema, vendorSuggestionUpdateSchema,
  type ProjectVendorSuggestion, type VendorSuggestionCreate, type VendorSuggestionPage,
  type VendorSuggestionProject, type VendorSuggestionProjectPage, type VendorSuggestionQuery, type VendorSuggestionUpdate
} from "../domain/project-vendor-suggestions.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { AuthorizationCoordinationModel } from "../models/AuthorizationCoordination.js";
import { EstimateModel } from "../models/Estimate.js";
import { ProjectAccessGrantModel } from "../models/ProjectAccessGrant.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectVendorSuggestionModel } from "../models/ProjectVendorSuggestion.js";
import { UserModel } from "../models/User.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { procurementItemSourceSnapshot } from "./procurement.service.js";
import { aiEstimatorKnowledgeActorGuard } from "./ai-estimator-knowledge-actor.js";

type Row = Record<string, any>;
type Source = Awaited<ReturnType<typeof procurementItemSourceSnapshot>>;
export interface ProjectVendorSuggestionService {
  projects(actor: PublicUser, query: VendorSuggestionQuery): Promise<VendorSuggestionProjectPage>;
  list(actor: PublicUser, projectId: string, query: VendorSuggestionQuery): Promise<VendorSuggestionPage>;
  create(actor: PublicUser, projectId: string, input: VendorSuggestionCreate): Promise<{ suggestion: ProjectVendorSuggestion; created: boolean }>;
  update(actor: PublicUser, projectId: string, id: string, input: VendorSuggestionUpdate): Promise<ProjectVendorSuggestion>;
}

/** Directory-only guard; never grants item, expense, or vendor-master write access. */
export async function requireProcurementVendorReader(actor: PublicUser, session: ClientSession): Promise<Row> {
  const current = await UserModel.findOne({ _id: actor.id, active: true, role: actor.role }).select({ _id: 1, name: 1, role: 1 }).session(session).lean();
  if (!current) throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  if (!["admin", "super_admin", "procurement"].includes(current.role)) forbidden();
  if (current.role === "super_admin") await aiEstimatorKnowledgeActorGuard.requireReadActor(actor, session);
  return current;
}
const grantFilter = (actor: PublicUser, projectId?: string) => ({ userId: actor.id, ...(projectId ? { projectId } : {}), module: "projects", source: "admin_initiator", active: true });
async function authorize(actor: PublicUser, session: ClientSession, projectId?: string, mutation = false) {
  if (mutation) await AuthorizationCoordinationModel.updateOne({ _id: "authorization" }, { $inc: { revision: 1 }, $set: { updatedAt: new Date() } }, { upsert: true, session });
  const current = await requireProcurementVendorReader(actor, session);
  if (mutation && current.role !== "admin") forbidden();
  if (projectId && current.role === "admin" && !await ProjectAccessGrantModel.exists(grantFilter(actor, projectId)).session(session)) notFound();
  return current;
}

export function createProjectVendorSuggestionService(input: { audit: AuditService; now?: () => Date }): ProjectVendorSuggestionService {
  const now = input.now ?? (() => new Date());
  const transaction = <T>(operation: (session: ClientSession) => Promise<T>) => mongoose.connection.transaction(operation, { readConcern: { level: "snapshot" }, readPreference: "primary" });
  return {
    async projects(actor, query) {
      const { q, limit, offset } = validate(vendorSuggestionQuerySchema, query);
      return transaction(async (session) => {
        await authorize(actor, session);
        const grants = actor.role === "admin" ? await ProjectAccessGrantModel.find(grantFilter(actor)).select({ projectId: 1 }).session(session).lean() : null;
        const estimates = await EstimateModel.find({ status: "client_approved", designPlanStatus: "approved", projectId: grants ? { $in: grants.map((grant) => grant.projectId) } : { $type: "string", $ne: "" } }).select({ projectId: 1 }).session(session).lean();
        const candidates = await ProjectModel.find({ _id: { $in: [...new Set(estimates.map((row) => row.projectId))] }, ...(q ? { name: { $regex: literal(q), $options: "i" } } : {}) }).select({ name: 1 }).sort({ name: 1, _id: 1 }).session(session).lean();
        const items: VendorSuggestionProject[] = [];
        for (const project of candidates) {
          try { items.push(summary(String(project._id), String(project.name), await procurementItemSourceSnapshot(String(project._id), session))); }
          catch (error) { if (!(error instanceof ApiError) || !["NOT_FOUND", "PROCUREMENT_APPROVAL_SOURCE_CONFLICT"].includes(error.code)) throw error; }
        }
        return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
      });
    },
    async list(actor, projectId, query) {
      const { q, limit, offset } = validate(vendorSuggestionQuerySchema, query);
      return transaction(async (session) => {
        await authorize(actor, session, projectId);
        const source = await procurementItemSourceSnapshot(projectId, session);
        const project = await ProjectModel.findById(projectId).select({ name: 1 }).session(session).lean();
        if (!project) notFound();
        const matchingVendors = q ? await AiEstimatorKnowledgeVendorModel.find({ $or: [{ name: { $regex: literal(q), $options: "i" } }, { code: { $regex: literal(q), $options: "i" } }] }).select({ _id: 1 }).session(session).lean() : [];
        const filter = { ...sourceFilter(projectId, source), ...(q ? { $or: [{ vendorId: { $in: matchingVendors.map((row) => row._id) } }, { vendorNameSnapshot: { $regex: literal(q), $options: "i" } }, { note: { $regex: literal(q), $options: "i" } }] } : {}) };
        const total = await ProjectVendorSuggestionModel.countDocuments(filter).session(session);
        const rows = await ProjectVendorSuggestionModel.find(filter).sort({ createdAt: -1, _id: 1 }).skip(offset).limit(limit).session(session).lean();
        return { project: summary(projectId, String(project.name), source), items: await dtos(rows, session), total, limit, offset, performance: { status: "not_available", recommendations: [] } };
      });
    },
    async create(actor, projectId, value) {
      const fields = validate(vendorSuggestionCreateSchema, value);
      const hash = createHash("sha256").update(JSON.stringify({ projectId, ...fields })).digest("hex");
      // A unique-index race may not carry Mongo's transaction retry label.
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await transaction(async (session) => {
            const currentActor = await authorize(actor, session, projectId, true);
            const source = await procurementItemSourceSnapshot(projectId, session, true);
            requireSource(source, fields);
            const prior = await ProjectVendorSuggestionModel.findOne({ createdById: actor.id, idempotencyKey: fields.idempotencyKey }).session(session).lean();
            if (prior) {
              if (prior.requestHash !== hash || prior.projectId !== projectId) throw new ApiError(409, "VENDOR_SUGGESTION_IDEMPOTENCY_CONFLICT", "This request key was already used for a different suggestion.");
              requireStoredSource(source, prior);
              return { suggestion: (await dtos([prior], session))[0]!, created: false };
            }
            if (await ProjectVendorSuggestionModel.exists({ ...sourceFilter(projectId, source), vendorId: fields.vendorId }).session(session)) duplicate();
            const vendor = await activeVendor(fields.vendorId, session);
            const timestamp = now();
            const [record] = await ProjectVendorSuggestionModel.create([{
              _id: `vendor-suggestion-${randomUUID()}`, ...sourceFilter(projectId, source), vendorId: fields.vendorId,
              vendorCodeSnapshot: vendor.code, vendorNameSnapshot: vendor.name, note: fields.note, status: "suggested", version: 1,
              idempotencyKey: fields.idempotencyKey, requestHash: hash, createdById: actor.id, createdByName: currentActor.name,
              updatedById: actor.id, updatedByName: currentActor.name, createdAt: timestamp, updatedAt: timestamp
            }], { session });
            if (!record) throw new Error("Vendor suggestion creation failed.");
            const suggestion = (await dtos([record.toObject()], session))[0]!;
            await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "project_vendor_suggestion_created", entityType: "project_vendor_suggestion", entityId: suggestion.id, occurredAt: timestamp.toISOString(), newValues: { ...suggestion } }, session);
            return { suggestion, created: true };
          });
        } catch (error) { if (!isDuplicate(error) || attempt >= 2) { if (isDuplicate(error)) duplicate(); throw error; } }
      }
    },
    async update(actor, projectId, id, value) {
      const fields = validate(vendorSuggestionUpdateSchema, value);
      return transaction(async (session) => {
        const currentActor = await authorize(actor, session, projectId, true);
        const source = await procurementItemSourceSnapshot(projectId, session, true);
        const current = await ProjectVendorSuggestionModel.findOne({ _id: id, projectId }).session(session).lean();
        if (!current) notFound();
        requireStoredSource(source, current);
        if (current.version !== fields.expectedVersion) versionConflict();
        if (fields.status === "suggested") await activeVendor(String(current.vendorId), session);
        const timestamp = now();
        const updated = await ProjectVendorSuggestionModel.findOneAndUpdate({ _id: id, projectId, version: fields.expectedVersion }, {
          $set: { note: fields.note, status: fields.status, updatedById: actor.id, updatedByName: currentActor.name, updatedAt: timestamp }, $inc: { version: 1 }
        }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
        if (!updated) versionConflict();
        const [oldValue, suggestion] = await dtos([current, updated], session);
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "project_vendor_suggestion_updated", entityType: "project_vendor_suggestion", entityId: id, occurredAt: timestamp.toISOString(), oldValues: { ...oldValue }, newValues: { ...suggestion } }, session);
        return suggestion!;
      });
    }
  };
}
function sourceFilter(projectId: string, source: Source) {
  return { projectId, estimateId: source.estimateId, estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId, designPlanVersion: source.designPlanVersion };
}
function summary(projectId: string, projectName: string, source: Source): VendorSuggestionProject {
  return { projectId, projectName, estimateId: source.estimateId, estimateVersion: source.estimateVersion, designPlanVersion: source.designPlanVersion };
}
function requireSource(source: Source, input: { estimateId: string; estimateVersion: number; designPlanVersion: number }) {
  if (source.estimateId !== input.estimateId || source.estimateVersion !== input.estimateVersion || source.designPlanVersion !== input.designPlanVersion) sourceConflict();
}
function requireStoredSource(source: Source, row: Row) {
  requireSource(source, row as VendorSuggestionCreate);
  if (source.estimateReviewRoundId !== row.estimateReviewRoundId) sourceConflict();
}
async function activeVendor(id: string, session: ClientSession): Promise<Row> {
  const row = await AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: id, status: "active" }, { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", timestamps: false, runValidators: true }).lean();
  if (!row) throw new ApiError(409, "VENDOR_SUGGESTION_VENDOR_UNAVAILABLE", "This vendor is no longer available. Choose an active vendor.");
  return row;
}
async function dtos(rows: Row[], session: ClientSession): Promise<ProjectVendorSuggestion[]> {
  const vendors = await AiEstimatorKnowledgeVendorModel.find({ _id: { $in: rows.map((row) => row.vendorId) } }).select({ code: 1, name: 1, status: 1 }).session(session).lean();
  const people = await UserModel.find({ _id: { $in: rows.flatMap((row) => [row.createdById, row.updatedById]) } }).select({ name: 1 }).session(session).lean();
  const byVendor = new Map(vendors.map((row) => [String(row._id), row]));
  const byPerson = new Map(people.map((row) => [String(row._id), row]));
  return rows.map((row) => {
    const vendor = byVendor.get(String(row.vendorId));
    return { id: String(row._id), projectId: row.projectId, estimateId: row.estimateId, estimateVersion: row.estimateVersion, estimateReviewRoundId: row.estimateReviewRoundId ?? null, designPlanVersion: row.designPlanVersion,
      vendor: { id: row.vendorId, code: vendor?.code ?? row.vendorCodeSnapshot, name: vendor?.name ?? row.vendorNameSnapshot, status: vendor?.status ?? "unavailable" },
      note: row.note, status: row.status, version: row.version,
      suggestedBy: { id: row.createdById, name: byPerson.get(String(row.createdById))?.name ?? row.createdByName },
      updatedBy: { id: row.updatedById, name: byPerson.get(String(row.updatedById))?.name ?? row.updatedByName },
      createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(), kpi: { status: "not_rated", score: null }
    };
  });
}
function validate<T>(schema: ZodType<T, any, any>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
  return parsed.data;
}
function literal(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function forbidden(): never { throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action."); }
function notFound(): never { throw new ApiError(404, "NOT_FOUND", "Resource not found."); }
function sourceConflict(): never { throw new ApiError(409, "VENDOR_SUGGESTION_SOURCE_CONFLICT", "The approved Design source changed. Refresh and review the current project before saving."); }
function versionConflict(): never { throw new ApiError(409, "VENDOR_SUGGESTION_VERSION_CONFLICT", "This suggestion changed. Reload it before saving again."); }
function duplicate(): never { throw new ApiError(409, "VENDOR_SUGGESTION_DUPLICATE", "This vendor has already been suggested for this approved Design. Edit or reinstate the existing suggestion."); }
function isDuplicate(error: unknown) { return !!error && typeof error === "object" && "code" in error && error.code === 11000; }
