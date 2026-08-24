import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongoose";

import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";
import { ProjectModel } from "../models/Project.js";

export interface ResolveApprovalProjectInput {
  estimate: { projectId: string | null; ownerId: string };
  lead: {
    projectId: string | null;
    ownerId: string;
    projectName: string;
    clientName: string;
    clientEmail: string;
    clientMobile: string;
    location: string;
  };
  clientId: string | null;
  assignedDesignerId: string;
  managerId: string;
  occurredAt: Date;
  session: ClientSession;
}

function projectLinkConflict(): ApiError {
  return new ApiError(
    409,
    "PROJECT_LINK_CONFLICT",
    "The linked project no longer matches this estimate."
  );
}

export async function resolveApprovalProject(
  input: ResolveApprovalProjectInput
): Promise<string> {
  const {
    estimate,
    lead,
    clientId,
    assignedDesignerId,
    managerId,
    occurredAt,
    session
  } = input;

  if (estimate.projectId === null) {
    if (lead.projectId !== null) throw projectLinkConflict();
    const plannedEndAt = new Date(occurredAt);
    plannedEndAt.setUTCDate(plannedEndAt.getUTCDate() + 90);
    const projectId = `project-${randomUUID()}`;
    await ProjectModel.create([{
      _id: projectId,
      name: lead.projectName,
      clientId,
      clientName: lead.clientName,
      clientEmail: lead.clientEmail,
      clientEmailNormalized: normalizeEmail(lead.clientEmail),
      clientMobile: lead.clientMobile,
      clientAddress: lead.location,
      initiatingDesignerId: assignedDesignerId,
      assignedEstimatorId: null,
      assignedDesignerIds: [assignedDesignerId],
      managerId,
      status: "planning",
      location: lead.location,
      plannedStartAt: occurredAt,
      plannedEndAt
    }], { session });
    return projectId;
  }

  const project = await ProjectModel.findById(estimate.projectId)
    .session(session)
    .lean();
  if (!project) throw projectLinkConflict();

  const identityMatches =
    String(project._id) === estimate.projectId &&
    lead.projectId === estimate.projectId &&
    estimate.ownerId === lead.ownerId &&
    project.assignedEstimatorId != null &&
    String(project.assignedEstimatorId) === lead.ownerId &&
    project.initiatingDesignerId == null &&
    project.managerId == null &&
    Array.isArray(project.assignedDesignerIds) &&
    project.assignedDesignerIds.length === 0 &&
    project.status === "planning" &&
    (clientId === null
      ? project.clientId == null
      : project.clientId == null || String(project.clientId) === clientId) &&
    project.name === lead.projectName &&
    project.clientName === lead.clientName &&
    project.clientEmailNormalized === normalizeEmail(lead.clientEmail) &&
    project.clientMobile === lead.clientMobile &&
    project.clientAddress === lead.location &&
    project.location === lead.location;
  if (!identityMatches) throw projectLinkConflict();

  const result = await ProjectModel.updateOne(
    {
      _id: estimate.projectId,
      assignedEstimatorId: lead.ownerId,
      initiatingDesignerId: null,
      assignedDesignerIds: { $size: 0 },
      managerId: null,
      status: "planning",
      clientId: clientId === null ? { $in: [null] } : { $in: [null, clientId] }
    },
    {
      $set: {
        clientId,
        assignedDesignerIds: [assignedDesignerId],
        managerId,
        updatedAt: occurredAt
      }
    },
    { session }
  );
  if (result.matchedCount !== 1) throw projectLinkConflict();
  return estimate.projectId;
}
