import { createMongoRepository } from "../repositories/mongo.js";
import { resolveProjectManagerDefault } from "./project-initiation-default-resolution.js";
import type { AuditService } from "./audit.service.js";
import { createProjectDesignWorkflow } from "../domain/design-workflow.js";
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
    cityName?: string | null;
    cityKey?: string | null;
  };
  clientId: string | null;
  occurredAt: Date;
  session: ClientSession;
  actorId: string;
  audit: AuditService;
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
    occurredAt,
    session
  } = input;

  if (estimate.projectId === null) {
    if (lead.projectId !== null) throw projectLinkConflict();
    const transaction = createMongoRepository(session);
    await transaction.coordinateAuthorizationMutation();
    const projectManagerDefault = await resolveProjectManagerDefault(transaction);
    const plannedEndAt = new Date(occurredAt);
    plannedEndAt.setUTCDate(plannedEndAt.getUTCDate() + 90);
    const projectId = `project-${randomUUID()}`;
    await ProjectModel.create([{
      _id: projectId,
      designWorkflowStages: createProjectDesignWorkflow(projectId),
      name: lead.projectName,
      clientId,
      clientName: lead.clientName,
      clientEmail: lead.clientEmail,
      clientEmailNormalized: normalizeEmail(lead.clientEmail),
      clientMobile: lead.clientMobile,
      clientAddress: lead.location,
      initiatingDesignerId: null,
      assignedEstimatorId: estimate.ownerId,
      assignedDesignerIds: [],
      managerId: null,
      programManagerId: projectManagerDefault.projectManagerId,
      status: "planning",
      location: lead.location,
      cityName: lead.cityName ?? null,
      cityKey: lead.cityKey ?? null,
      plannedStartAt: occurredAt,
      plannedEndAt
    }], { session });
    await input.audit.appendInMongoTransaction({
      actorId: input.actorId,
      action: "project_created",
      entityType: "project",
      entityId: projectId,
      occurredAt: occurredAt.toISOString(),
      newValues: { status: "planning", assignedEstimatorId: estimate.ownerId,
        programManagerId: projectManagerDefault.projectManagerId,
        projectManagerDefaultVersion: projectManagerDefault.version }
    }, session);
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
        updatedAt: occurredAt
      }
    },
    { session }
  );
  if (result.matchedCount !== 1) throw projectLinkConflict();
  return estimate.projectId;
}
