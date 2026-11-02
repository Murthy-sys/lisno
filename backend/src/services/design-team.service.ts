import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";
import { ApiError } from "../middleware/errors.js";
import { ProjectModel } from "../models/Project.js";
import { EstimateModel } from "../models/Estimate.js";
import { UserModel } from "../models/User.js";
import { createMongoRepository } from "../repositories/mongo.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";

type Row = Record<string, any>;
const id = z.string().trim().min(1).max(160);
export const secondaryDesignersSchema = z.object({
  expectedVersion: z.number().int().nonnegative().safe(),
  designerIds: z.array(id).max(3).refine(ids => new Set(ids).size === ids.length, "Choose distinct Designers."),
  reason: z.string().trim().min(1).max(1000).optional()
}).strict();
const missing = (): never => { throw new ApiError(404, "DESIGN_TEAM_NOT_FOUND", "Design team is unavailable."); };

async function scope(actor: PublicUser, projectId: string, session?: ClientSession) {
  const user = await UserModel.findOne({ _id: actor.id, role: actor.role, active: true, deletedAt: null }).session(session ?? null).lean();
  const project = await ProjectModel.findById(projectId).session(session ?? null).lean() as Row | null;
  if (!user || !project || project.estimationWorkflowVersion !== 3) return missing();
  const member = actor.role === "designer" && (project.primaryDesignerId === actor.id || project.secondaryDesignerIds?.includes(actor.id));
  if (actor.role !== "super_admin" && !member) return missing();
  return { project, canManage: !!project.primaryDesignerId && (actor.role === "super_admin" || project.primaryDesignerId === actor.id) };
}

async function present(actor: PublicUser, projectId: string, search = "", session?: ClientSession) {
  const { project, canManage } = await scope(actor, projectId, session);
  const ids = [project.primaryDesignerId, ...(project.secondaryDesignerIds ?? [])].filter(Boolean);
  const current = await UserModel.find({ _id: { $in: ids } }).select({ _id: 1, name: 1 }).session(session ?? null).lean();
  const person = (id: string) => { const user = current.find(value => String(value._id) === id); return user ? { id, name: String(user.name) } : { id, name: "Unavailable Designer" }; };
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const candidates = canManage ? await UserModel.find({ role: "designer", active: true, deletedAt: null,
    _id: { $ne: project.primaryDesignerId }, ...(escaped ? { name: { $regex: escaped, $options: "i" } } : {}) })
    .select({ _id: 1, name: 1 }).sort({ name: 1, _id: 1 }).limit(100).session(session ?? null).lean() : [];
  return { projectId, version: Number(project.designTeamVersion ?? 0), primary: project.primaryDesignerId ? person(project.primaryDesignerId) : null,
    secondaries: (project.secondaryDesignerIds ?? []).map(person), canManage, requiresReason: canManage && actor.role === "super_admin",
    candidates: candidates.map(user => ({ id: String(user._id), name: String(user.name) })) };
}

export function createDesignTeamService(audit: AuditService) {
  return {
    detail: (actor: PublicUser, projectId: string, search = "") => present(actor, projectId, search),
    async update(actor: PublicUser, projectId: string, input: z.infer<typeof secondaryDesignersSchema>) {
      const parsed = secondaryDesignersSchema.parse(input);
      const session = await mongoose.startSession();
      try {
        let result!: Awaited<ReturnType<typeof present>>;
        await session.withTransaction(async () => {
          await createMongoRepository(session).coordinateAuthorizationMutation();
          const { project, canManage } = await scope(actor, projectId, session);
          if (!canManage) return missing();
          if (actor.role === "super_admin" && !parsed.reason) throw new ApiError(400, "DESIGN_TEAM_REASON_REQUIRED", "Enter a reason for this team override.");
          if (Number(project.designTeamVersion ?? 0) !== parsed.expectedVersion) throw new ApiError(409, "DESIGN_TEAM_CHANGED", "The team changed. Refresh before saving.");
          const primary = await UserModel.exists({ _id: project.primaryDesignerId, role: "designer", active: true, deletedAt: null }).session(session);
          const estimate = await EstimateModel.exists({ projectId, "estimation.workflowVersion": 3,
            "estimation.preApproval.reviewRoundId": { $type: "string" }, designPlanDesignerId: project.primaryDesignerId }).session(session);
          if (!primary || !estimate || parsed.designerIds.includes(project.primaryDesignerId))
            throw new ApiError(409, "DESIGN_TEAM_SOURCE_CHANGED", "Review the primary Designer assignment before selecting assistants.");
          const eligible = await UserModel.countDocuments({ _id: { $in: parsed.designerIds }, role: "designer", active: true, deletedAt: null }).session(session);
          if (eligible !== parsed.designerIds.length) throw new ApiError(409, "DESIGNER_NOT_ASSIGNABLE", "Choose active Designers from the current list.");
          const ids = [...parsed.designerIds].sort();
          const updated = await ProjectModel.updateOne({ _id: projectId, primaryDesignerId: project.primaryDesignerId,
            designTeamVersion: parsed.expectedVersion, estimationWorkflowVersion: 3 },
          { $set: { secondaryDesignerIds: ids, assignedDesignerIds: [project.primaryDesignerId, ...ids] },
            $inc: { designTeamVersion: 1, estimationFenceEpoch: 1 } }, { session, runValidators: true });
          if (updated.matchedCount !== 1) throw new ApiError(409, "DESIGN_TEAM_CHANGED", "The team changed. Refresh before saving.");
          await audit.appendInMongoTransaction({ actorId: actor.id, action: "design_team_updated", entityType: "project", entityId: projectId,
            occurredAt: new Date().toISOString(), oldValues: { primaryDesignerId: project.primaryDesignerId, secondaryDesignerIds: project.secondaryDesignerIds ?? [], version: parsed.expectedVersion },
            newValues: { primaryDesignerId: project.primaryDesignerId, secondaryDesignerIds: ids, version: parsed.expectedVersion + 1, reason: parsed.reason ?? null } }, session);
          result = await present(actor, projectId, "", session);
        });
        return result;
      } finally { await session.endSession(); }
    }
  };
}
