import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { normalizeEmail } from "../domain/email.js";
import { isReservedDevelopmentDemoIdentity } from "../domain/demo-identities.js";
import type { AppRepository, ProjectRecord, UserRecord } from "../repositories/types.js";
import { RepositoryConflictError } from "../repositories/types.js";
import { createAuditService } from "../services/audit.service.js";
import { AuditEventModel } from "../models/AuditEvent.js";

const REPAIR_REASON = "Existing-client project linking repair";
export interface ClientLinkRepairTarget {
  projectId: string;
  clientId: string;
  actorId: string;
  expectedProjectUpdatedAt: string;
  expectedInvitationVersion: number;
}

function conflict(): never { throw new RepositoryConflictError("Client link repair target changed or is ineligible; no repair applied."); }

async function authorized(repository: AppRepository, actor: UserRecord, project: ProjectRecord) {
  if (!actor.active || actor.deletedAt) return false;
  if (actor.role === "super_admin") return await repository.countActiveUsersByRole("super_admin") === 1;
  if (actor.role === "estimator_sales") return project.assignedEstimatorId === actor.id;
  if (actor.role !== "admin") return false;
  const grant = await repository.findActiveProjectAccessGrant(actor.id, project.id, "projects");
  return grant?.source === "admin_initiator" || grant?.source === "access_request";
}

async function inspect(repository: AppRepository, target: ClientLinkRepairTarget) {
  if (![target.projectId, target.clientId, target.actorId].every(value => typeof value === "string" && value.length > 0) ||
      !Number.isSafeInteger(target.expectedInvitationVersion) || target.expectedInvitationVersion < 1 ||
      !Number.isFinite(Date.parse(target.expectedProjectUpdatedAt))) conflict();
  const project = await repository.findProjectById(target.projectId);
  const client = await repository.findUserById(target.clientId);
  const actor = await repository.findUserById(target.actorId);
  const invitation = await repository.findProjectClientInvitation(target.projectId);
  if (!project || !client || !actor || !invitation || !await authorized(repository, actor, project)) conflict();
  const email = normalizeEmail(project.clientEmail);
  if (![2, 3].includes(project.estimationWorkflowVersion ?? 0) || project.status === "completed" ||
      !client.active || client.deletedAt || client.role !== "client" || client.accountKind !== "standard" ||
      isReservedDevelopmentDemoIdentity(client) || !email || project.clientEmailNormalized !== email ||
      client.emailNormalized !== email || normalizeEmail(client.email) !== email || invitation.emailNormalized !== email ||
      invitation.acceptedAt !== null || invitation.acceptedUserId !== null) conflict();
  if (project.clientId === client.id && invitation.status === "revoked" && invitation.tokenHash === null &&
      invitation.revokedById === actor.id && invitation.version === target.expectedInvitationVersion + 1) {
    return { project, client, actor, invitation, alreadyLinked: true };
  }
  if (project.clientId !== null || project.updatedAt !== target.expectedProjectUpdatedAt ||
      invitation.status !== "pending" || invitation.version !== target.expectedInvitationVersion) conflict();
  return { project, client, actor, invitation, alreadyLinked: false };
}

function fingerprint(state: Awaited<ReturnType<typeof inspect>>) {
  // Hash eligibility inputs too, so a change between backup and commit fails closed.
  return createHash("sha256").update(JSON.stringify({ project: state.project,
    client: { id: state.client.id, version: state.client.version, active: state.client.active, email: state.client.emailNormalized },
    actor: { id: state.actor.id, version: state.actor.version }, invitation: state.invitation })).digest("hex");
}

export async function repairExistingClientProjectLink(repository: AppRepository, target: ClientLinkRepairTarget,
  options: { apply?: boolean; backupPath?: string; clock?: () => Date } = {}) {
  const before = await inspect(repository, target);
  if (before.alreadyLinked) return { status: "already_linked" as const, writes: 0 };
  if (!options.apply) return { status: "ready" as const, writes: 0, projectsToLink: 1, invitationsToRevoke: 1 };
  if (!options.backupPath || !isAbsolute(options.backupPath)) throw new Error("Apply requires a new absolute backup path.");
  const beforeFingerprint = fingerprint(before);
  const backup = {
    format: "lisno-client-link-repair-v1", target, fingerprint: beforeFingerprint,
    project: { id: before.project.id, clientId: before.project.clientId, updatedAt: before.project.updatedAt },
    // Deliberately omit tokenHash. A rollback must leave this invitation revoked.
    invitation: { id: before.invitation.id, version: before.invitation.version, status: before.invitation.status,
      tokenGeneration: before.invitation.tokenGeneration, deliveryStatus: before.invitation.deliveryStatus,
      deliveryFailureCode: before.invitation.deliveryFailureCode, updatedAt: before.invitation.updatedAt },
    rollback: "Maintenance window only. Recheck authorization, email coordination, project/invitation CAS and all client activity in one transaction. Unlink only this project, keep the invitation revoked/token null, append a compensating audit. Never restore this backup wholesale or delete immutable audits."
  };
  const file = await open(options.backupPath, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(backup, null, 2)); await file.sync(); }
  finally { await file.close(); }
  return repository.runInTransaction(async transaction => {
    await transaction.coordinateAuthorizationMutation();
    await transaction.coordinateClientEmail(before.client.emailNormalized);
    const current = await inspect(transaction, target);
    if (current.alreadyLinked) return { status: "already_linked" as const, writes: 0 };
    if (fingerprint(current) !== beforeFingerprint) conflict();
    const occurredAt = (options.clock?.() ?? new Date()).toISOString();
    await transaction.linkProjectClient(current.project.id, current.client.emailNormalized, current.client.id, occurredAt);
    await transaction.saveProjectClientInvitation({ ...current.invitation, status: "revoked", tokenHash: null,
      revokedById: current.actor.id, revokedAt: occurredAt, updatedAt: occurredAt,
      version: current.invitation.version + 1 }, current.invitation.version);
    const audit = createAuditService(transaction);
    await audit.append({ actorId: current.actor.id, action: "client_project_linked", entityType: "project",
      entityId: current.project.id, occurredAt, reason: REPAIR_REASON,
      oldValues: { clientId: null }, newValues: { clientId: current.client.id } });
    await audit.append({ actorId: current.actor.id, action: "project_client_invitation.revoked", entityType: "project_client_invitation",
      entityId: current.invitation.id, occurredAt, reason: REPAIR_REASON,
      oldValues: { status: "pending", version: current.invitation.version },
      newValues: { projectId: current.project.id, status: "revoked", version: current.invitation.version + 1 } });
    const linked = await transaction.findProjectById(target.projectId);
    return { status: "applied" as const, writes: 4, appliedAt: occurredAt,
      projectUpdatedAt: linked!.updatedAt, invitationVersion: current.invitation.version + 1 };
  });
}

/** Read-only prerequisite, never permission to perform a rollback outside a locked transaction.
 * Operators must stop application writers, repeat these checks in the compensating
 * transaction, clear only project.clientId with CAS, leave the invitation revoked,
 * and append a compensating audit. Any later client activity requires manual review.
 */
export async function assertClientLinkRepairRollbackSafe(repository: AppRepository, target: ClientLinkRepairTarget,
  receipt: { appliedAt: string; projectUpdatedAt: string; invitationVersion: number }) {
  const current = await inspect(repository, target);
  if (!current.alreadyLinked || current.project.updatedAt !== receipt.projectUpdatedAt ||
      current.invitation.version !== receipt.invitationVersion || current.invitation.revokedAt !== receipt.appliedAt ||
      !Number.isFinite(Date.parse(receipt.appliedAt))) conflict();
  const repairAudit = await AuditEventModel.exists({ actorId: target.actorId, entityType: "project", entityId: target.projectId,
    action: "client_project_linked", reason: REPAIR_REASON, occurredAt: new Date(receipt.appliedAt) });
  // Conservatively block on any client activity, including actions recorded against
  // estimate/review entities rather than directly against the project.
  const laterActivity = await AuditEventModel.exists({ occurredAt: { $gte: new Date(receipt.appliedAt) },
    $or: [{ actorId: target.clientId }, { entityId: target.projectId, reason: { $ne: REPAIR_REASON } }] });
  if (!repairAudit || laterActivity) conflict();
}
