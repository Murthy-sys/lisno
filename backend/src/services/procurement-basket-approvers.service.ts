import type { ClientSession } from "mongoose";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { UserModel } from "../models/User.js";
import { createMongoRepository } from "../repositories/mongo.js";

type Row = Record<string, any>;
export interface BasketProjectApprover { id: string; name: string }
export interface BasketApproverBlocker {
  slot: "program_manager" | "designer"; code: string; message: string;
}
export interface BasketProjectApprovers {
  assignedSiteManager: BasketProjectApprover | null;
  assignedDesigner: BasketProjectApprover | null;
  approverBlockers: BasketApproverBlocker[];
}

/** Compatibility slot program_manager represents the project's Site Manager only. */
export async function resolveBasketProjectApprovers(projectId: string, estimateId: string,
  requiredSlots: readonly string[], session: ClientSession, fence = false): Promise<BasketProjectApprovers> {
  if (fence) await createMongoRepository(session).coordinateAuthorizationMutation();
  const project = fence
    ? await ProjectModel.findOneAndUpdate({ _id: projectId, status: "active" },
      { $inc: { purchaseOrderApprovalEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean() as Row | null
    : await ProjectModel.findById(projectId).session(session).lean() as Row | null;
  if (!project) throw new ApiError(409, "PROCUREMENT_BASKET_PROJECT_INACTIVE", "This project is not active.");
  const result: BasketProjectApprovers = { assignedSiteManager: null, assignedDesigner: null, approverBlockers: [] };
  const block = (slot: BasketApproverBlocker["slot"], code: string, message: string) => {
    if (requiredSlots.includes(slot)) result.approverBlockers.push({ slot, code, message });
  };
  const siteTasks = await ProjectWorkflowTaskModel.find({ projectId, kind: "site_execution" })
    .session(session).lean() as Row[];
  const siteTask = siteTasks.length === 1 ? siteTasks[0] : null;
  if (siteTasks.length > 1 || (siteTask && siteTask.assigneeRole !== "site_manager")) {
    block("program_manager", "PROCUREMENT_BASKET_SITE_MANAGER_AMBIGUOUS", "Correct the project's conflicting Site Manager assignments before submitting this award.");
  } else if (!siteTask?.assigneeUserId) {
    block("program_manager", "PROCUREMENT_BASKET_SITE_MANAGER_REQUIRED", "Assign a Site Manager to this project's Site execution task before submitting this award.");
  } else {
    const user = await UserModel.findOne({ _id: siteTask.assigneeUserId, role: "site_manager", active: true })
      .select({ name: 1 }).session(session).lean() as Row | null;
    if (!user) block("program_manager", "PROCUREMENT_BASKET_SITE_MANAGER_INACTIVE", "Assign an active Site Manager to this project before submitting this award.");
    else {
      result.assignedSiteManager = { id: String(user._id), name: String(user.name) };
      if (fence && requiredSlots.includes("program_manager")) {
        const locked = await ProjectWorkflowTaskModel.updateOne({ _id: siteTask._id, projectId,
          kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: user._id },
        { $inc: { awardApprovalEpoch: 1 } }, { session, timestamps: false, runValidators: true });
        if (locked.modifiedCount !== 1) throw new ApiError(409, "PROCUREMENT_BASKET_PROPOSAL_STALE", "The Site Manager assignment changed. Revise and resubmit this award.");
      }
    }
  }
  const projectDesigners = [...new Set<string>((project.assignedDesignerIds ?? []).map(String))];
  const estimate = await EstimateModel.findById(estimateId).select({ projectId: 1, designPlanDesignerId: 1 })
    .session(session).lean() as Row | null;
  const designTasks = await ProjectWorkflowTaskModel.find({ projectId, estimateId, kind: "design_plan_upload" })
    .session(session).lean() as Row[];
  const sourceIds = [...new Set<string>([estimate?.designPlanDesignerId, ...designTasks.map(task => task.assigneeUserId)]
    .filter(Boolean).map(String))];
  const candidate = sourceIds.length === 1 ? sourceIds[0] : projectDesigners.length === 1 ? projectDesigners[0] : null;
  const inconsistent = sourceIds.length > 1 || designTasks.length > 1 ||
    designTasks.some(task => task.assigneeRole !== "designer" || !task.assigneeUserId) ||
    (estimate?.projectId && String(estimate.projectId) !== projectId) ||
    (candidate && !projectDesigners.includes(candidate));
  if (inconsistent || (!candidate && projectDesigners.length > 1)) {
    block("designer", "PROCUREMENT_BASKET_DESIGNER_AMBIGUOUS", "Correct the project's conflicting Designer assignments before submitting this award.");
  } else if (!candidate) {
    block("designer", "PROCUREMENT_BASKET_DESIGNER_REQUIRED", "Assign a Designer to this project before submitting this award.");
  } else {
    const user = await UserModel.findOne({ _id: candidate, role: "designer", active: true })
      .select({ name: 1 }).session(session).lean() as Row | null;
    if (!user) block("designer", "PROCUREMENT_BASKET_DESIGNER_INACTIVE", "The project's assigned Designer is inactive. Correct the project assignment before submitting this award.");
    else result.assignedDesigner = { id: String(user._id), name: String(user.name) };
  }
  return result;
}

export function requireBasketProjectApprovers(approvers: BasketProjectApprovers): void {
  const blocker = approvers.approverBlockers[0];
  if (blocker) throw new ApiError(409, blocker.code, blocker.message);
}

export function assertBasketFrozenApprovers(proposal: Row, current: BasketProjectApprovers): void {
  requireBasketProjectApprovers(current);
  if ((proposal.requiredSlots.includes("program_manager") && proposal.programManagerId !== current.assignedSiteManager?.id) ||
    (proposal.requiredSlots.includes("designer") && proposal.designerId !== current.assignedDesigner?.id))
    throw new ApiError(409, "PROCUREMENT_BASKET_PROPOSAL_STALE", "The project's assigned approver changed. Revise and resubmit this award.");
}
