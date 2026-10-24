import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { requireValidNewPassword } from "./password-policy.js";
import { isReservedDemoEmail, isReservedDevelopmentDemoIdentity } from "../domain/demo-identities.js";
import { normalizeEmail } from "../domain/email.js";
import type { ProjectClientInvitationRecord, ProjectClientInvitationSummary } from "../domain/project-client-invitations.js";
import { generateUserInvitationToken, hashUserInvitationToken, USER_INVITATION_TOKEN_PATTERN, USER_INVITATION_TTL_MS, USER_INVITATION_RECIPIENT_COOLDOWN_MS } from "../domain/user-invitations.js";
import { ApiError } from "../middleware/errors.js";
import { RepositoryConflictError, type AppRepository, type ProjectRecord, type UserRecord } from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import type { AuthService, AuthenticationRequestContext, PublicUser } from "./auth.service.js";
import type { InvitationMailer } from "./invitation-mailer.js";
import { requireActor, type Clock } from "./workflow.js";

export interface ProjectClientInvitationDependencies {
  repository: AppRepository;
  audit: AuditService;
  mailer: InvitationMailer;
  clock: Clock;
  auth: AuthService;
  allowDemoAccountExternalEmail?: boolean;
}
export type ProjectClientInvitationService = ReturnType<typeof createProjectClientInvitationService>;

export function createProjectClientInvitationService(deps: ProjectClientInvitationDependencies) {
  const { repository, audit, mailer, clock, auth } = deps;
  function summary(projectId: string, record: ProjectClientInvitationRecord | null): ProjectClientInvitationSummary {
    const status = !record ? "not_issued" : record.status !== "pending" ? record.status : Date.parse(record.expiresAt) <= clock().getTime() ? "expired" : record.deliveryStatus === "failed" ? "delivery_failed" : "pending";
    const deliveryAvailable = mailer.deliveryKind !== "disabled";
    return { projectId, status, deliveryAvailable, expectedVersion: record?.version ?? 0, expiresAt: record?.expiresAt ?? null, sentAt: record?.sentAt ?? null, acceptedAt: record?.acceptedAt ?? null,
      availableActions: status === "accepted" ? [] : !record ? deliveryAvailable ? ["send"] : [] : [...(deliveryAvailable ? ["resend" as const] : []), ...(record.status === "pending" ? ["revoke" as const] : [])] };
  }
  async function manage(repo: AppRepository, actor: PublicUser, projectId: string) {
    const stored = await requireActor(repo, actor);
    const project = await repo.findProjectById(projectId);
    if (!project || !await canManage(repo, stored, project)) unavailable(404);
    return { project: project!, actor: stored };
  }
  async function authority(repo: AppRepository, record: ProjectClientInvitationRecord) {
    const project = await repo.findProjectById(record.projectId);
    const issuer = await repo.findUserById(record.tokenIssuedById);
    if (!project || !issuer || !issuer.active || issuer.version !== record.tokenIssuerVersion || !await canManage(repo, issuer, project) || !eligible(project, record.emailNormalized)) unavailable();
    const existing = await repo.findUserByEmail(record.emailNormalized);
    if (existing && (!existing.active || existing.role !== "client" || isReservedDevelopmentDemoIdentity(existing))) unavailable();
    return { project: project!, existing };
  }
  async function publicRecord(repo: AppRepository, token: string) {
    if (!USER_INVITATION_TOKEN_PATTERN.test(token)) unavailable();
    const record = await repo.findProjectClientInvitationByTokenHash(hashUserInvitationToken(token));
    if (!record || record.status !== "pending" || Date.parse(record.expiresAt) <= clock().getTime()) unavailable();
    const resolved = await authority(repo, record!);
    return { record: record!, ...resolved };
  }
  async function deliver(record: ProjectClientInvitationRecord, rawToken: string) {
    if (mailer.deliveryKind === "disabled") return summary(record.projectId, record);
    let failed = false;
    const attemptedAt = clock().toISOString();
    try {
      const current = await repository.findProjectClientInvitation(record.projectId);
      if (!current || current.status !== "pending" || current.tokenGeneration !== record.tokenGeneration || current.tokenHash !== record.tokenHash) return summary(record.projectId, current);
      const { project } = await authority(repository, current);
      await mailer.sendInvitation({ recipient: { name: project.clientName, email: record.emailNormalized }, roleLabel: "Client", rawToken, expiresAt: record.expiresAt, purpose: "project_client" });
    } catch { failed = true; }
    return repository.runInTransaction(async transaction => {
      const current = await transaction.findProjectClientInvitation(record.projectId);
      if (!current || current.status !== "pending" || current.tokenGeneration !== record.tokenGeneration || current.tokenHash !== record.tokenHash) return summary(record.projectId, current);
      const next = await transaction.saveProjectClientInvitation({ ...current, deliveryStatus: failed ? "failed" : "sent", deliveryFailureCode: failed ? "DELIVERY_FAILED" : null, deliveryAttemptedAt: attemptedAt, sentAt: failed ? null : clock().toISOString(), updatedAt: clock().toISOString(), version: current.version + 1 }, current.version);
      await audit.append({ actorId: record.tokenIssuedById, action: failed ? "project_client_invitation.delivery_failed" : "project_client_invitation.sent", entityType: "project_client_invitation", entityId: record.id, occurredAt: attemptedAt, newValues: { projectId: record.projectId, generation: record.tokenGeneration } }, transaction);
      return summary(record.projectId, next);
    });
  }
  async function issue(actor: PublicUser, projectId: string, expectedVersion?: number) {
    // Preflight occurs before credential generation or invitation/audit writes.
    await manage(repository, actor, projectId);
    if (mailer.deliveryKind === "disabled") throw new ApiError(503, "INVITATION_UNAVAILABLE", "Invitation delivery is unavailable. The project is saved; retry when delivery is available.");
    const prepared = await repository.runInTransaction(async transaction => {
      await transaction.coordinateAuthorizationMutation();
      const { project, actor: stored } = await manage(transaction, actor, projectId);
      const emailNormalized = normalizeEmail(project.clientEmail);
      await transaction.coordinateClientEmail(emailNormalized);
      if (!eligible(project, emailNormalized) || isReservedDemoEmail(emailNormalized)) unavailable();
      const existing = await transaction.findUserByEmail(emailNormalized);
      if (existing && (!existing.active || existing.role !== "client" || isReservedDevelopmentDemoIdentity(existing))) unavailable();
      if (mailer.deliveryKind === "external" && isReservedDevelopmentDemoIdentity(stored) && !deps.allowDemoAccountExternalEmail) throw new ApiError(409, "DEMO_EXTERNAL_DELIVERY_BLOCKED", "External delivery is unavailable for this issuing identity.");
      const current = await transaction.findProjectClientInvitation(projectId);
      if (current && current.emailNormalized !== emailNormalized) unavailable();
      if (expectedVersion === undefined && current) return { record: current, rawToken: null };
      if (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || current?.version !== expectedVersion)) conflict();
      if (current?.status === "accepted") unavailable();
      const issuedAt = clock().toISOString();
      const latest = await transaction.findLatestProjectClientInvitationIssuedAt(emailNormalized);
      if (latest && clock().getTime() - Date.parse(latest) < USER_INVITATION_RECIPIENT_COOLDOWN_MS) throw new ApiError(429, "INVITATION_COOLDOWN", "Please wait before sending another invitation to this recipient.");
      const rawToken = generateUserInvitationToken();
      const next: ProjectClientInvitationRecord = {
        id: current?.id ?? `project-client-invitation-${randomUUID()}`, projectId, emailNormalized, invitedById: current?.invitedById ?? stored.id,
        tokenIssuedById: stored.id, tokenIssuerVersion: stored.version, tokenHash: hashUserInvitationToken(rawToken), tokenGeneration: (current?.tokenGeneration ?? 0) + 1,
        issuedAt, expiresAt: new Date(Date.parse(issuedAt) + USER_INVITATION_TTL_MS).toISOString(), status: "pending", acceptedUserId: null, acceptedAt: null, revokedById: null, revokedAt: null,
        deliveryStatus: "queued", deliveryFailureCode: null, deliveryAttemptedAt: null, sentAt: null, version: (current?.version ?? 0) + 1, createdAt: current?.createdAt ?? issuedAt, updatedAt: issuedAt
      };
      await transaction.saveProjectClientInvitation(next, current?.version ?? 0);
      await audit.append({ actorId: stored.id, action: current ? "project_client_invitation.resent" : "project_client_invitation.created", entityType: "project_client_invitation", entityId: next.id, occurredAt: issuedAt, newValues: { projectId, generation: next.tokenGeneration } }, transaction);
      return { record: next, rawToken };
    });
    return prepared.rawToken ? deliver(prepared.record, prepared.rawToken) : summary(projectId, prepared.record);
  }
  async function accept(token: string, existingActor?: PublicUser, password?: string) {
    const discovered = await publicRecord(repository, token);
    if (!existingActor && discovered.existing) throw new ApiError(409, "CLIENT_SIGN_IN_REQUIRED", "Sign in to your existing client account to accept this invitation.");
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    try {
      return await repository.runInTransaction(async transaction => {
        await transaction.coordinateAuthorizationMutation();
        await transaction.coordinateClientEmail(discovered.record.emailNormalized);
        const current = await publicRecord(transaction, token);
        if (current.record.version !== discovered.record.version || current.record.tokenGeneration !== discovered.record.tokenGeneration) unavailable();
        let user: UserRecord;
        const occurredAt = clock().toISOString();
        if (existingActor) {
          user = await requireActor(transaction, existingActor);
          if (user.role !== "client" || user.emailNormalized !== current.record.emailNormalized || user.id !== current.existing?.id || isReservedDevelopmentDemoIdentity(user)) unavailable();
        } else {
          if (current.existing) throw new ApiError(409, "CLIENT_SIGN_IN_REQUIRED", "Sign in to your existing client account to accept this invitation.");
          if (!passwordHash) unavailable();
          user = await transaction.createUser({ name: current.project.clientName, email: current.record.emailNormalized, mobile: current.project.clientMobile, address: null, passwordHash: passwordHash!, role: "client", active: true, createdAt: occurredAt, updatedAt: occurredAt });
        }
        await transaction.linkProjectClient(current.project.id, current.record.emailNormalized, user.id, occurredAt);
        await transaction.saveProjectClientInvitation({ ...current.record, status: "accepted", tokenHash: null, acceptedUserId: user.id, acceptedAt: occurredAt, updatedAt: occurredAt, version: current.record.version + 1 }, current.record.version);
        await audit.append({ actorId: user.id, action: "project_client_invitation.accepted", entityType: "project_client_invitation", entityId: current.record.id, occurredAt, newValues: { projectId: current.project.id, clientId: user.id, generation: current.record.tokenGeneration } }, transaction);
        await audit.append({ actorId: user.id, action: "client_project_linked", entityType: "project", entityId: current.project.id, occurredAt, oldValues: { clientId: null }, newValues: { clientId: user.id } }, transaction);
        return { projectId: current.project.id, email: user.email };
      });
    } catch (error) { if (error instanceof RepositoryConflictError) unavailable(); throw error; }
  }
  return {
    async get(actor: PublicUser, projectId: string) {
      await manage(repository, actor, projectId);
      return summary(projectId, await repository.findProjectClientInvitation(projectId));
    },
    send: (actor: PublicUser, projectId: string) => issue(actor, projectId),
    resend: (actor: PublicUser, projectId: string, expectedVersion: number) => issue(actor, projectId, expectedVersion),
    async revoke(actor: PublicUser, projectId: string, expectedVersion: number) {
      return repository.runInTransaction(async transaction => {
        await transaction.coordinateAuthorizationMutation();
        const { actor: stored, project } = await manage(transaction, actor, projectId);
        await transaction.coordinateClientEmail(normalizeEmail(project.clientEmail));
        const current = await transaction.findProjectClientInvitation(projectId);
        if (!current || current.version !== expectedVersion || current.status !== "pending") conflict();
        const at = clock().toISOString();
        const next = await transaction.saveProjectClientInvitation({ ...current!, tokenHash: null, status: "revoked", revokedById: stored.id, revokedAt: at, updatedAt: at, version: expectedVersion + 1 }, expectedVersion);
        await audit.append({ actorId: stored.id, action: "project_client_invitation.revoked", entityType: "project_client_invitation", entityId: next.id, occurredAt: at, newValues: { projectId } }, transaction);
        return summary(projectId, next);
      });
    },
    async inspect(token: string) {
      const { record, project, existing } = await publicRecord(repository, token);
      return { projectId: project.id, projectName: project.name, clientName: project.clientName, email: record.emailNormalized, expiresAt: record.expiresAt, requiresSignIn: existing !== null };
    },
    async acceptNew(input: { token: string; password: string; passwordConfirmation: string }, context: AuthenticationRequestContext) {
      requireValidNewPassword(input.password);
      if (input.password !== input.passwordConfirmation) throw new ApiError(400, "VALIDATION_ERROR", "Passwords do not match.", { passwordConfirmation: "Passwords do not match." });
      try { auth.assertClientInvitationRequestContext?.(context); }
      catch { throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password."); }
      const result = await accept(input.token, undefined, input.password);
      try { return { ...await auth.login(result.email, input.password, context), projectId: result.projectId }; }
      catch { throw new ApiError(409, "PROJECT_INVITATION_ACCEPTED_SIGN_IN_REQUIRED", "Your project invitation was accepted. Sign in to continue."); }
    },
    async acceptExisting(actor: PublicUser, token: string) {
      return { projectId: (await accept(token, actor)).projectId };
    }
  };
}
async function canManage(repository: AppRepository, actor: UserRecord, project: ProjectRecord) {
  if (!actor.active) return false;
  if (actor.role === "super_admin") return (await repository.countActiveUsersByRole("super_admin")) === 1;
  if (actor.role === "estimator_sales") return project.assignedEstimatorId === actor.id;
  if (actor.role !== "admin") return false;
  const grant = await repository.findActiveProjectAccessGrant(actor.id, project.id, "projects");
  return grant?.source === "admin_initiator" || grant?.source === "access_request";
}
function eligible(project: ProjectRecord, emailNormalized: string) {
  return project.estimationWorkflowVersion === 2 && project.clientId === null && project.status !== "completed" && normalizeEmail(project.clientEmail) === emailNormalized;
}
function unavailable(status = 400): never { throw new ApiError(status, "PROJECT_INVITATION_UNAVAILABLE", "This project invitation is unavailable. Ask your project team for a new invitation."); }
function conflict(): never { throw new ApiError(409, "VERSION_CONFLICT", "The invitation changed. Refresh and try again."); }
