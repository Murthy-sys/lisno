import mongoose, { type ClientSession } from "mongoose";

import { confirmedCity } from "../domain/procurement-city.js";
import { ApiError } from "../middleware/errors.js";
import { AuthorizationCoordinationModel } from "../models/AuthorizationCoordination.js";
import { ProcurementVendorCityModel } from "../models/ProcurementVendorCity.js";
import { ProjectAccessGrantModel } from "../models/ProjectAccessGrant.js";
import { ProjectModel } from "../models/Project.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { UserModel } from "../models/User.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { aiEstimatorKnowledgeActorGuard } from "./ai-estimator-knowledge-actor.js";

type Row = Record<string, any>;
export interface ProcurementProjectIdentity {
  projectId: string;
  city: { name: string; key: string } | null;
  programManagerId: string | null;
  version: number;
}
export interface ProcurementVendorCity {
  vendorId: string;
  city: { name: string; key: string } | null;
  version: number;
}
export interface ProcurementProjectIdentityService {
  programManagers(actor: PublicUser, query: { q: string; limit: number; offset: number }): Promise<{ items: Array<{ id: string; name: string; email: string }>; total: number; limit: number; offset: number }>;
  readProject(actor: PublicUser, projectId: string): Promise<ProcurementProjectIdentity>;
  updateProject(actor: PublicUser, projectId: string, input: { expectedVersion: number; cityName?: string | null; programManagerId?: string | null }): Promise<ProcurementProjectIdentity>;
  updateVendorCity(actor: PublicUser, vendorId: string, input: { expectedVersion: number; cityName: string | null }): Promise<ProcurementVendorCity>;
}

const transaction = <T>(operation: (session: ClientSession) => Promise<T>): Promise<T> =>
  mongoose.connection.transaction(operation, { readConcern: { level: "snapshot" }, readPreference: "primary" });

function forbidden(): never {
  throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

async function activeActor(actor: PublicUser, session?: ClientSession): Promise<Row> {
  const query = UserModel.findOne({ _id: actor.id, role: actor.role, active: true }).select({ _id: 1, role: 1 });
  if (session) query.session(session);
  const current = await query.lean().exec() as Row | null;
  if (!current) throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  return current;
}

async function coordinate(session: ClientSession): Promise<void> {
  await AuthorizationCoordinationModel.updateOne({ _id: "authorization" },
    { $inc: { revision: 1 }, $set: { updatedAt: new Date() } }, { upsert: true, session }).exec();
}

function projectIdentity(row: Row): ProcurementProjectIdentity {
  return {
    projectId: String(row._id),
    city: typeof row.cityName === "string" && typeof row.cityKey === "string" ? { name: row.cityName, key: row.cityKey } : null,
    programManagerId: row.programManagerId == null ? null : String(row.programManagerId),
    version: Number(row.procurementIdentityVersion ?? 1)
  };
}

function vendorCity(row: Row | null, vendorId: string): ProcurementVendorCity {
  return { vendorId,
    city: row && typeof row.cityName === "string" && typeof row.cityKey === "string" ? { name: row.cityName, key: row.cityKey } : null,
    version: Number(row?.version ?? 0) };
}

async function scopedProject(actor: PublicUser, projectId: string, session: ClientSession): Promise<Row> {
  const current = await activeActor(actor, session);
  if (current.role !== "admin" && current.role !== "super_admin") forbidden();
  if (current.role === "super_admin") await aiEstimatorKnowledgeActorGuard.requireReadActor(actor, session);
  if (current.role === "admin") {
    const grant = await ProjectAccessGrantModel.exists({ projectId, userId: actor.id, module: "projects",
      source: "admin_initiator", active: true }).session(session);
    if (!grant) notFound();
  }
  const project = await ProjectModel.findById(projectId).session(session).lean().exec() as Row | null;
  if (!project) notFound();
  return project;
}

export function createProcurementProjectIdentityService({ audit, now = () => new Date() }: { audit: AuditService; now?: () => Date }): ProcurementProjectIdentityService {
  return {
    async programManagers(actor, query) {
      const current = await activeActor(actor);
      if (current.role !== "admin" && current.role !== "super_admin") forbidden();
      if (current.role === "super_admin") await aiEstimatorKnowledgeActorGuard.requireReadActor(actor);
      const literal = query.q.trim().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const filter = { role: "program_manager", active: true,
        ...(literal ? { $or: [{ name: { $regex: literal, $options: "i" } }, { emailNormalized: { $regex: literal, $options: "i" } }] } : {}) };
      const total = await UserModel.countDocuments(filter);
      const rows = await UserModel.find(filter).sort({ name: 1, _id: 1 }).skip(query.offset).limit(query.limit)
        .select({ _id: 1, name: 1, email: 1 }).lean().exec() as Row[];
      return { items: rows.map((row) => ({ id: String(row._id), name: String(row.name), email: String(row.email) })),
        total, limit: query.limit, offset: query.offset };
    },

    async readProject(actor, projectId) {
      return transaction(async (session) => projectIdentity(await scopedProject(actor, projectId, session)));
    },

    async updateProject(actor, projectId, input) {
      return transaction(async (session) => {
        await coordinate(session);
        const project = await scopedProject(actor, projectId, session);
        const previous = projectIdentity(project);
        if (previous.version !== input.expectedVersion) throw new ApiError(409, "PROCUREMENT_IDENTITY_VERSION_CONFLICT", "Project assignment or city changed. Refresh and try again.");
        const city = input.cityName === undefined ? previous.city : confirmedCity(input.cityName);
        const programManagerId = input.programManagerId === undefined ? previous.programManagerId : input.programManagerId;
        if (programManagerId !== null && input.programManagerId !== undefined && programManagerId !== previous.programManagerId) {
          const manager = await UserModel.findOne({ _id: programManagerId, role: "program_manager", active: true }).select({ _id: 1 }).session(session).lean().exec();
          if (!manager) throw new ApiError(400, "INVALID_PROGRAM_MANAGER", "Select an active Program Manager.");
        }
        if (city?.key === previous.city?.key && city?.name === previous.city?.name && programManagerId === previous.programManagerId) return previous;
        const versionPredicate = project.procurementIdentityVersion == null
          ? { procurementIdentityVersion: { $exists: false } } : { procurementIdentityVersion: input.expectedVersion };
        const updated = await ProjectModel.findOneAndUpdate({ _id: projectId, ...versionPredicate },
          { $set: { cityName: city?.name ?? null, cityKey: city?.key ?? null, programManagerId,
            procurementIdentityVersion: previous.version + 1, updatedAt: now() } },
          { session, returnDocument: "after", runValidators: true }).lean().exec() as Row | null;
        if (!updated) throw new ApiError(409, "PROCUREMENT_IDENTITY_VERSION_CONFLICT", "Project assignment or city changed. Refresh and try again.");
        const timestamp = now().toISOString();
        if (previous.programManagerId !== programManagerId) {
          await audit.appendInMongoTransaction({ actorId: actor.id, action: "project_program_manager_assigned", entityType: "project", entityId: projectId,
            occurredAt: timestamp, oldValues: { programManagerId: previous.programManagerId, version: previous.version },
            newValues: { programManagerId, version: previous.version + 1 } }, session);
        }
        if (previous.city?.key !== city?.key || previous.city?.name !== city?.name) {
          await audit.appendInMongoTransaction({ actorId: actor.id, action: "project_city_confirmed", entityType: "project", entityId: projectId,
            occurredAt: timestamp, oldValues: { city: previous.city, version: previous.version },
            newValues: { city, version: previous.version + 1 } }, session);
        }
        return projectIdentity(updated);
      });
    },

    async updateVendorCity(actor, vendorId, input) {
      return transaction(async (session) => {
        await coordinate(session);
        const current = await activeActor(actor, session);
        if (current.role !== "procurement") forbidden();
        const vendor = await AiEstimatorKnowledgeVendorModel.findOne({ _id: vendorId, status: { $ne: "archived" } }).select({ _id: 1 }).session(session).lean().exec();
        if (!vendor) notFound();
        const previousRow = await ProcurementVendorCityModel.findById(vendorId).session(session).lean().exec() as Row | null;
        const previous = vendorCity(previousRow, vendorId);
        if (previous.version !== input.expectedVersion) throw new ApiError(409, "PROCUREMENT_VENDOR_CITY_VERSION_CONFLICT", "Vendor city changed. Refresh and try again.");
        const city = confirmedCity(input.cityName);
        if (previous.city?.name === city?.name && previous.city?.key === city?.key) return previous;
        const timestamp = now();
        let saved: Row | null;
        if (previousRow) {
          saved = await ProcurementVendorCityModel.findOneAndUpdate({ _id: vendorId, version: input.expectedVersion },
            { $set: { cityName: city?.name ?? null, cityKey: city?.key ?? null, confirmedById: actor.id, confirmedAt: timestamp }, $inc: { version: 1 } },
            { session, returnDocument: "after", runValidators: true }).lean().exec() as Row | null;
        } else {
          const [created] = await ProcurementVendorCityModel.create([{ _id: vendorId, cityName: city?.name ?? null, cityKey: city?.key ?? null,
            version: 1, confirmedById: actor.id, confirmedAt: timestamp }], { session });
          saved = created?.toObject() as Row | null;
        }
        if (!saved) throw new ApiError(409, "PROCUREMENT_VENDOR_CITY_VERSION_CONFLICT", "Vendor city changed. Refresh and try again.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_vendor_city_confirmed", entityType: "vendor", entityId: vendorId,
          occurredAt: timestamp.toISOString(), oldValues: { city: previous.city, version: previous.version },
          newValues: { city, version: previous.version + 1 } }, session);
        return vendorCity(saved, vendorId);
      });
    }
  };
}
