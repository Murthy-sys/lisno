import { randomBytes as cryptoRandomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

import { isReservedDemoEmail, isReservedDevelopmentDemoIdentity } from "../domain/demo-identities.js";
import {
  INVITABLE_ROLE_CODES,
  USER_INVITATION_RECIPIENT_COOLDOWN_MS,
  USER_INVITATION_TOKEN_PATTERN,
  expiresAtForInvitation,
  hashUserInvitationToken,
  invitationEmailSchema,
  invitationNameSchema,
  invitationMobileSchema,
  normalizeInvitationEmail,
  normalizeInvitationMobile,
  presentationStatusForInvitation,
  tokenValidityForInvitation,
  type InvitableRole,
  type UserInvitationAction,
  type UserInvitationDeliveryStatus,
  type UserInvitationPresentationStatus
} from "../domain/user-invitations.js";
import { ROLE_LABELS } from "../domain/roles.js";
import { ApiError } from "../middleware/errors.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  type AppRepository,
  type PaginationInput,
  type UserInvitationAdminRecord,
  type UserInvitationFilters,
  type UserInvitationRecord,
  type UserRecord
} from "../repositories/types.js";
import type { AuditService, AuditWrite } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { InvitationMailer } from "./invitation-mailer.js";
import { InvitationDeliveryError } from "./smtp-invitation-mailer.js";
import { requireActor, type Clock } from "./workflow.js";

export interface UserInvitationDto {
  id: string;
  name: string;
  email: string;
  role: InvitableRole;
  mobile: string;
  status: UserInvitationPresentationStatus;
  currentLinkAvailable: boolean;
  availableActions: readonly UserInvitationAction[];
  invitedBy: Pick<PublicUser, "id" | "name" | "email" | "role">;
  issuedAt: string;
  expiresAt: string;
  deliveryStatus: UserInvitationDeliveryStatus;
  deliveryAttemptedAt: string | null;
  sentAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserInvitationPage {
  items: UserInvitationDto[];
  total: number;
  invitableRoles: readonly InvitableRole[];
}

export interface CreateUserInvitationInput {
  name: string;
  email: string;
  role: InvitableRole;
  mobile: string;
}

export interface UserInvitationInspection {
  name: string;
  email: string;
  role: InvitableRole;
  expiresAt: string;
}

export class InvitationUnavailableError extends ApiError {
  constructor() {
    super(410, "INVITATION_UNAVAILABLE", "This invitation is unavailable.");
    this.name = "InvitationUnavailableError";
  }
}

export interface UserInvitationService {
  list(
    actor: PublicUser,
    filters: UserInvitationFilters,
    pagination: PaginationInput
  ): Promise<UserInvitationPage>;
  create(
    actor: PublicUser,
    input: CreateUserInvitationInput
  ): Promise<UserInvitationDto>;
  resend(
    actor: PublicUser,
    invitationId: string,
    input: { version: number }
  ): Promise<UserInvitationDto>;
  revoke(
    actor: PublicUser,
    invitationId: string,
    input: { version: number }
  ): Promise<UserInvitationDto>;
  inspect(rawToken: string): Promise<UserInvitationInspection>;
  accept(input: {
    rawToken: string;
    password: string;
  }): Promise<{ accepted: true }>;
}

export interface CreateUserInvitationServiceInput {
  repository: AppRepository;
  audit: AuditService;
  mailer: InvitationMailer;
  clock: Clock;
  randomBytes?: (size: number) => Buffer;
  passwordHasher?: (password: string, cost: number) => Promise<string>;
}

interface NormalizedCreateInput {
  name: string;
  email: string;
  emailNormalized: string;
  role: InvitableRole;
  mobile: string;
}

interface DeliveryAttempt {
  record: UserInvitationRecord;
  rawToken: string;
  actorId: string;
}

const CREATE_KEYS = ["name", "email", "role", "mobile"] as const;
const INVITATION_NOT_ACTIONABLE_MESSAGE = "The invitation is not actionable.";
const INVITATION_PASSWORD_HASH_COST = 12;

export function createUserInvitationService(
  input: CreateUserInvitationServiceInput
): UserInvitationService {
  const { repository, audit, mailer, clock } = input;
  const randomBytes = input.randomBytes ?? cryptoRandomBytes;
  const passwordHasher =
    input.passwordHasher ??
    ((password: string, cost: number) => bcrypt.hash(password, cost));

  return {
    async list(actor, filters, pagination) {
      await requireSoleSuperAdmin(repository, actor);
      const page = await repository.pageUserInvitations(
        filters,
        pagination,
        clock().toISOString()
      );
      return {
        items: page.items.map(toDto),
        total: page.total,
        invitableRoles: INVITABLE_ROLE_CODES
      };
    },

    async create(actor, rawInput) {
      const enabledMailer = requireEnabledMailer(mailer);
      const createInput = parseCreateInput(rawInput);
      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = hashUserInvitationToken(rawToken);
      const invitationId = `user-invitation-${randomUUID()}`;

      const created = await repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        const storedActor = await requireSoleSuperAdmin(transaction, actor);
        if (isReservedDemoEmail(createInput.emailNormalized)) emailNotAllowed();

        await transaction.coordinateClientEmail(createInput.emailNormalized);
        const issuedAt = clock().toISOString();
        const expiresAt = expiresAtForInvitation(issuedAt);
        await enforceRecipientCooldown(
          transaction,
          createInput.emailNormalized,
          issuedAt
        );
        await assertCreateEmailAvailable(transaction, createInput.emailNormalized);

        const prior = await transaction.findPendingUserInvitationByEmail(
          createInput.emailNormalized
        );
        if (prior) {
          try {
            await transaction.supersedeUserInvitation(prior.id, prior.version, {
              supersededByInvitationId: invitationId,
              supersededAt: issuedAt,
              updatedAt: issuedAt
            });
          } catch (error) {
            mapRepositoryMutationError(error);
          }
          await appendAdministrativeAudit(
            audit,
            transaction,
            storedActor.id,
            "user_invitation.superseded",
            prior,
            issuedAt
          );
        }

        let invitationRecord: UserInvitationRecord;
        try {
          invitationRecord = await transaction.createUserInvitation({
            id: invitationId,
            name: createInput.name,
            email: createInput.email,
            emailNormalized: createInput.emailNormalized,
            role: createInput.role,
            mobile: createInput.mobile,
            tokenHash,
            tokenGeneration: 1,
            issuedAt,
            expiresAt,
            status: "pending",
            invitedById: storedActor.id,
            tokenIssuedById: storedActor.id,
            tokenIssuerVersion: storedActor.version,
            acceptedUserId: null,
            acceptedAt: null,
            revokedById: null,
            revokedAt: null,
            supersededByInvitationId: null,
            supersededAt: null,
            deliveryStatus: "queued",
            deliveryAttemptedAt: null,
            sentAt: null,
            deliveryFailureCode: null,
            version: 1,
            createdAt: issuedAt,
            updatedAt: issuedAt
          });
        } catch (error) {
          mapRepositoryMutationError(error);
        }
        await appendAdministrativeAudit(
          audit,
          transaction,
          storedActor.id,
          "user_invitation.created",
          invitationRecord!,
          issuedAt,
          { deliveryState: "queued" }
        );
        return invitationRecord!;
      });

      return deliverGeneration(
        repository,
        audit,
        enabledMailer,
        clock,
        { record: created, rawToken, actorId: created.tokenIssuedById }
      );
    },

    async resend(actor, invitationId, versionInput) {
      const enabledMailer = requireEnabledMailer(mailer);
      assertVersion(versionInput.version);
      const discovered = await repository.findUserInvitationById(invitationId);
      if (!discovered) notFound();

      const rawToken = randomBytes(32).toString("base64url");
      const tokenHash = hashUserInvitationToken(rawToken);

      const resent = await repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        const storedActor = await requireSoleSuperAdmin(transaction, actor);
        await transaction.coordinateClientEmail(discovered!.emailNormalized);
        const current = await transaction.findUserInvitationById(invitationId);
        if (!current) notFound();
        if (current.emailNormalized !== discovered!.emailNormalized) versionConflict();
        requirePendingVersion(current, versionInput.version);
        const issuedAt = clock().toISOString();
        const expiresAt = expiresAtForInvitation(issuedAt);
        await enforceRecipientCooldown(
          transaction,
          current.emailNormalized,
          issuedAt
        );
        await assertResendEmailActionable(transaction, current.emailNormalized);

        let updated: UserInvitationRecord;
        try {
          updated = await transaction.resendUserInvitation(
            current.id,
            versionInput.version,
            {
              tokenHash,
              tokenGeneration: current.tokenGeneration + 1,
              issuedAt,
              expiresAt,
              tokenIssuedById: storedActor.id,
              tokenIssuerVersion: storedActor.version,
              updatedAt: issuedAt
            }
          );
        } catch (error) {
          mapRepositoryMutationError(error);
        }
        await appendAdministrativeAudit(
          audit,
          transaction,
          storedActor.id,
          "user_invitation.resent",
          updated!,
          issuedAt,
          { deliveryState: "queued" }
        );
        return updated!;
      });

      return deliverGeneration(
        repository,
        audit,
        enabledMailer,
        clock,
        { record: resent, rawToken, actorId: resent.tokenIssuedById }
      );
    },

    async revoke(actor, invitationId, versionInput) {
      assertVersion(versionInput.version);
      const discovered = await repository.findUserInvitationById(invitationId);
      if (!discovered) notFound();

      const revoked = await repository.runInTransaction(async (transaction) => {
        await transaction.coordinateAuthorizationMutation();
        const storedActor = await requireSoleSuperAdmin(transaction, actor);
        await transaction.coordinateClientEmail(discovered!.emailNormalized);
        const current = await transaction.findUserInvitationById(invitationId);
        if (!current) notFound();
        if (current.emailNormalized !== discovered!.emailNormalized) versionConflict();
        requirePendingVersion(current, versionInput.version);
        const revokedAt = clock().toISOString();

        let updated: UserInvitationRecord;
        try {
          updated = await transaction.revokeUserInvitation(
            current.id,
            versionInput.version,
            {
              revokedById: storedActor.id,
              revokedAt,
              updatedAt: revokedAt
            }
          );
        } catch (error) {
          mapRepositoryMutationError(error);
        }
        await appendAdministrativeAudit(
          audit,
          transaction,
          storedActor.id,
          "user_invitation.revoked",
          updated!,
          revokedAt
        );
        return updated!;
      });

      return presentRecord(repository, revoked, clock().toISOString());
    },

    async inspect(rawToken) {
      try {
        const { invitation } = await findAvailablePublicInvitation(
          repository,
          rawToken,
          clock().toISOString()
        );
        return {
          name: invitation.name,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt
        };
      } catch (error) {
        mapPublicInvitationError(error);
      }
    },

    async accept(acceptInput) {
      let discovered: PublicInvitationMatch;
      try {
        discovered = await findAvailablePublicInvitation(
          repository,
          acceptInput.rawToken,
          clock().toISOString()
        );
      } catch (error) {
        mapPublicInvitationError(error);
      }

      const passwordHash = await passwordHasher(
        acceptInput.password,
        INVITATION_PASSWORD_HASH_COST
      );

      try {
        await repository.runInTransaction(async (transaction) => {
          await transaction.coordinateAuthorizationMutation();
          await transaction.coordinateClientEmail(
            discovered.invitation.emailNormalized
          );
          const current = await transaction.findUserInvitationById(
            discovered.invitation.id
          );
          assertSamePublicInvitation(current, discovered);
          const acceptedAt = clock().toISOString();
          await assertPublicInvitationAvailable(
            transaction,
            current!,
            discovered.tokenHash,
            acceptedAt
          );

          const createdUser = await transaction.createUser({
            name: current!.name,
            email: current!.email,
            mobile: current!.mobile,
            passwordHash,
            role: current!.role,
            active: true,
            accountKind: "standard",
            address: null,
            managerId: null,
            authorizedClientIds: [],
            createdAt: acceptedAt,
            updatedAt: acceptedAt
          });
          if (createdUser.emailNormalized !== current!.emailNormalized) {
            invitationUnavailable();
          }

          await transaction.acceptUserInvitation(
            current!.id,
            current!.version,
            current!.tokenGeneration,
            discovered.tokenHash,
            {
              acceptedUserId: createdUser.id,
              acceptedAt,
              updatedAt: acceptedAt
            }
          );
          await audit.append(
            {
              actorId: createdUser.id,
              action: "user.invited_created",
              entityType: "user",
              entityId: createdUser.id,
              occurredAt: acceptedAt,
              newValues: {
                invitationId: current!.id,
                userId: createdUser.id,
                emailNormalized: current!.emailNormalized,
                role: current!.role
              }
            },
            transaction
          );
          await audit.append(
            {
              actorId: createdUser.id,
              action: "user_invitation.accepted",
              entityType: "user_invitation",
              entityId: current!.id,
              occurredAt: acceptedAt,
              newValues: {
                invitationId: current!.id,
                acceptedUserId: createdUser.id,
                emailNormalized: current!.emailNormalized,
                role: current!.role
              }
            },
            transaction
          );
        });
      } catch (error) {
        mapPublicInvitationError(error);
      }

      return { accepted: true };
    }
  };
}

interface PublicInvitationMatch {
  invitation: UserInvitationRecord;
  tokenHash: string;
}

async function findAvailablePublicInvitation(
  repository: AppRepository,
  rawToken: string,
  now: string
): Promise<PublicInvitationMatch> {
  if (
    typeof rawToken !== "string" ||
    !USER_INVITATION_TOKEN_PATTERN.test(rawToken)
  ) {
    invitationUnavailable();
  }
  const tokenHash = hashUserInvitationToken(rawToken);
  const invitation = await repository.findPendingUserInvitationByTokenHash(tokenHash);
  if (!invitation) invitationUnavailable();
  await assertPublicInvitationAvailable(repository, invitation, tokenHash, now);
  return { invitation, tokenHash };
}

async function assertPublicInvitationAvailable(
  repository: AppRepository,
  invitation: UserInvitationRecord,
  tokenHash: string,
  now: string
): Promise<void> {
  if (
    invitation.status !== "pending" ||
    invitation.tokenHash !== tokenHash ||
    Date.parse(invitation.expiresAt) <= Date.parse(now)
  ) {
    invitationUnavailable();
  }
  const issuer = await repository.findUserById(invitation.tokenIssuedById);
  if (
    !issuer ||
    !issuer.active ||
    issuer.role !== "super_admin" ||
    issuer.version !== invitation.tokenIssuerVersion ||
    (await repository.countActiveUsersByRole("super_admin")) !== 1
  ) {
    invitationUnavailable();
  }
  if (
    (await repository.findUserByEmail(invitation.emailNormalized)) ||
    (await repository.hasUnclaimedClientProjectByEmail(
      invitation.emailNormalized
    ))
  ) {
    invitationUnavailable();
  }
}

function assertSamePublicInvitation(
  current: UserInvitationRecord | null,
  discovered: PublicInvitationMatch
): asserts current is UserInvitationRecord {
  if (
    !current ||
    current.id !== discovered.invitation.id ||
    current.status !== "pending" ||
    current.tokenHash !== discovered.tokenHash ||
    current.tokenGeneration !== discovered.invitation.tokenGeneration ||
    current.version !== discovered.invitation.version ||
    current.emailNormalized !== discovered.invitation.emailNormalized ||
    current.tokenIssuedById !== discovered.invitation.tokenIssuedById ||
    current.tokenIssuerVersion !== discovered.invitation.tokenIssuerVersion
  ) {
    invitationUnavailable();
  }
}

function mapPublicInvitationError(error: unknown): never {
  if (error instanceof InvitationUnavailableError) throw error;
  if (
    error instanceof RepositoryConflictError ||
    error instanceof RepositoryNotFoundError
  ) {
    invitationUnavailable();
  }
  throw error;
}

function parseCreateInput(input: CreateUserInvitationInput): NormalizedCreateInput {
  try {
    const keys = Object.keys(input).sort();
    if (
      keys.length !== CREATE_KEYS.length ||
      !CREATE_KEYS.every((key) => keys.includes(key))
    ) {
      invalidInvitationInput();
    }
    if (!INVITABLE_ROLE_CODES.includes(input.role)) invalidInvitationInput();
    const name = invitationNameSchema.parse(input.name);
    const email = invitationEmailSchema.parse(input.email);
    return {
      name,
      email,
      emailNormalized: normalizeInvitationEmail(email),
      role: input.role,
      mobile: normalizeInvitationMobile(invitationMobileSchema.parse(input.mobile))
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    invalidInvitationInput();
  }
}

async function requireSoleSuperAdmin(
  repository: AppRepository,
  actor: PublicUser
): Promise<UserRecord> {
  const storedActor = await requireActor(repository, actor);
  if (storedActor.role !== "super_admin") forbidden();
  const activeSuperAdmins = (await repository.listUsers()).filter(
    (user) => user.active && user.role === "super_admin"
  );
  if (activeSuperAdmins.length !== 1 || activeSuperAdmins[0]?.id !== storedActor.id) {
    invalidToken();
  }
  return storedActor;
}

async function assertCreateEmailAvailable(
  repository: AppRepository,
  emailNormalized: string
): Promise<void> {
  if (await repository.findUserByEmail(emailNormalized)) accountExists();
  if (await repository.hasUnclaimedClientProjectByEmail(emailNormalized)) {
    emailNotAllowed();
  }
}

async function assertResendEmailActionable(
  repository: AppRepository,
  emailNormalized: string
): Promise<void> {
  if (
    (await repository.findUserByEmail(emailNormalized)) ||
    (await repository.hasUnclaimedClientProjectByEmail(emailNormalized))
  ) {
    notActionable();
  }
}

async function enforceRecipientCooldown(
  repository: AppRepository,
  emailNormalized: string,
  now: string
): Promise<void> {
  const latest = await repository.findLatestUserInvitationIssuedAtByEmail(
    emailNormalized
  );
  if (!latest) return;
  const elapsed = Date.parse(now) - Date.parse(latest);
  if (elapsed >= USER_INVITATION_RECIPIENT_COOLDOWN_MS) return;
  const retryAfter = Math.max(
    1,
    Math.ceil(
      (USER_INVITATION_RECIPIENT_COOLDOWN_MS - elapsed) / 1_000
    )
  );
  throw new ApiError(
    429,
    "TOO_MANY_ATTEMPTS",
    "Please try again later.",
    undefined,
    { "Retry-After": String(retryAfter) }
  );
}

async function appendAdministrativeAudit(
  audit: AuditService,
  repository: AppRepository,
  actorId: string,
  action: Extract<
    AuditWrite["action"],
    | "user_invitation.created"
    | "user_invitation.superseded"
    | "user_invitation.resent"
    | "user_invitation.revoked"
  >,
  invitation: UserInvitationRecord,
  occurredAt: string,
  additional?: { deliveryState: UserInvitationDeliveryStatus }
): Promise<void> {
  await audit.append(
    {
      actorId,
      action,
      entityType: "user_invitation",
      entityId: invitation.id,
      occurredAt,
      newValues: {
        invitationId: invitation.id,
        emailNormalized: invitation.emailNormalized,
        role: invitation.role,
        tokenGeneration: invitation.tokenGeneration,
        expiresAt: invitation.expiresAt,
        ...(additional ? { deliveryState: additional.deliveryState } : {})
      }
    },
    repository
  );
}

async function deliverGeneration(
  repository: AppRepository,
  audit: AuditService,
  mailer: Exclude<InvitationMailer, { deliveryKind: "disabled" }>,
  clock: Clock,
  attempt: DeliveryAttempt
): Promise<UserInvitationDto> {
  const issuingActor = await repository.findUserById(attempt.actorId);
  let delivery:
    | { status: "sent" }
    | { status: "failed"; failureCode: string };

  if (!issuingActor || !issuingActor.active || issuingActor.role !== "super_admin") {
    delivery = {
      status: "failed",
      failureCode: "INVITATION_ISSUER_UNAVAILABLE"
    };
  } else if (
    mailer.deliveryKind === "external" &&
    isReservedDevelopmentDemoIdentity(issuingActor)
  ) {
    delivery = {
      status: "failed",
      failureCode: "DEMO_EXTERNAL_DELIVERY_BLOCKED"
    };
  } else {
    try {
      await mailer.sendInvitation({
        recipient: {
          name: attempt.record.name,
          email: attempt.record.email
        },
        roleLabel: ROLE_LABELS[attempt.record.role],
        rawToken: attempt.rawToken,
        expiresAt: attempt.record.expiresAt
      });
      delivery = { status: "sent" };
    } catch (error) {
      delivery = {
        status: "failed",
        failureCode:
          error instanceof InvitationDeliveryError
            ? error.failureCode
            : "INVITATION_DELIVERY_FAILED"
      };
    }
  }

  const attemptedAt = clock().toISOString();
  let deliveredRecord: UserInvitationRecord | null = null;
  try {
    deliveredRecord = await repository.runInTransaction(async (transaction) => {
      const updated = await transaction.updateUserInvitationDelivery(
        attempt.record.id,
        attempt.record.tokenGeneration,
        delivery.status === "sent"
          ? {
              status: "sent",
              attemptedAt,
              sentAt: attemptedAt,
              updatedAt: attemptedAt
            }
          : {
              status: "failed",
              attemptedAt,
              failureCode: delivery.failureCode,
              updatedAt: attemptedAt
            }
      );
      if (!updated) return null;
      await audit.append(
        {
          actorId: attempt.actorId,
          action:
            delivery.status === "sent"
              ? "user_invitation.delivery_sent"
              : "user_invitation.delivery_failed",
          entityType: "user_invitation",
          entityId: attempt.record.id,
          occurredAt: attemptedAt,
          newValues: {
            invitationId: attempt.record.id,
            emailNormalized: attempt.record.emailNormalized,
            role: attempt.record.role,
            tokenGeneration: attempt.record.tokenGeneration,
            expiresAt: attempt.record.expiresAt,
            deliveryState: delivery.status
          }
        },
        transaction
      );
      return updated;
    });
  } catch {
    deliveredRecord = null;
  }

  const current =
    deliveredRecord ??
    (await repository.findUserInvitationById(attempt.record.id)) ??
    attempt.record;
  return presentRecord(repository, current, clock().toISOString());
}

async function presentRecord(
  repository: AppRepository,
  invitation: UserInvitationRecord,
  now: string
): Promise<UserInvitationDto> {
  const users = await repository.listUsers();
  const inviter = users.find((user) => user.id === invitation.invitedById);
  if (!inviter) {
    throw new RepositoryConflictError(
      `User invitation ${invitation.id} has no inviter.`
    );
  }
  const issuer = users.find((user) => user.id === invitation.tokenIssuedById);
  const activeSuperAdmins = users.filter(
    (user) => user.active && user.role === "super_admin"
  );
  const issuerMatches =
    issuer !== undefined &&
    activeSuperAdmins.length === 1 &&
    activeSuperAdmins[0]?.id === issuer.id &&
    issuer.version === invitation.tokenIssuerVersion;
  const claimed = users.some(
    (user) => user.emailNormalized === invitation.emailNormalized
  );
  const reserved = await repository.hasUnclaimedClientProjectByEmail(
    invitation.emailNormalized
  );
  const tokenValidity = tokenValidityForInvitation({
    storedStatus: invitation.status,
    expiresAt: invitation.expiresAt,
    issuerMatches,
    now
  });
  const status = presentationStatusForInvitation({
    storedStatus: invitation.status,
    expiresAt: invitation.expiresAt,
    deliveryStatus: invitation.deliveryStatus,
    now
  });
  const availableActions =
    invitation.status !== "pending"
      ? ([] as const)
      : claimed || reserved
        ? (["revoke"] as const)
        : (["resend", "revoke"] as const);

  return {
    id: invitation.id,
    name: invitation.name,
    email: invitation.email,
    role: invitation.role,
    mobile: invitation.mobile,
    status,
    currentLinkAvailable:
      tokenValidity === "current" && !claimed && !reserved,
    availableActions,
    invitedBy: {
      id: inviter.id,
      name: inviter.name,
      email: inviter.email,
      role: inviter.role
    },
    issuedAt: invitation.issuedAt,
    expiresAt: invitation.expiresAt,
    deliveryStatus: invitation.deliveryStatus,
    deliveryAttemptedAt: invitation.deliveryAttemptedAt,
    sentAt: invitation.sentAt,
    version: invitation.version,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt
  };
}

function toDto(invitation: UserInvitationAdminRecord): UserInvitationDto {
  return {
    id: invitation.id,
    name: invitation.name,
    email: invitation.email,
    role: invitation.role,
    mobile: invitation.mobile,
    status: invitation.presentationStatus,
    currentLinkAvailable: invitation.currentLinkAvailable,
    availableActions: invitation.availableActions,
    invitedBy: {
      id: invitation.invitedBy.id,
      name: invitation.invitedBy.name,
      email: invitation.invitedBy.email,
      role: invitation.invitedBy.role
    },
    issuedAt: invitation.issuedAt,
    expiresAt: invitation.expiresAt,
    deliveryStatus: invitation.deliveryStatus,
    deliveryAttemptedAt: invitation.deliveryAttemptedAt,
    sentAt: invitation.sentAt,
    version: invitation.version,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt
  };
}

function requireEnabledMailer(
  mailer: InvitationMailer
): Exclude<InvitationMailer, { deliveryKind: "disabled" }> {
  if (mailer.deliveryKind === "disabled") {
    throw new ApiError(
      503,
      "INVITATION_DELIVERY_UNAVAILABLE",
      "Invitation delivery is unavailable."
    );
  }
  return mailer;
}

function requirePendingVersion(
  invitation: UserInvitationRecord,
  expectedVersion: number
): void {
  if (invitation.status !== "pending") notActionable();
  if (invitation.version !== expectedVersion) versionConflict();
}

function assertVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1) invalidInvitationInput();
}

function mapRepositoryMutationError(error: unknown): never {
  if (error instanceof RepositoryNotFoundError) notFound();
  if (error instanceof RepositoryConflictError) versionConflict();
  throw error;
}

function invalidInvitationInput(): never {
  throw new ApiError(
    400,
    "VALIDATION_ERROR",
    "Invitation details are invalid."
  );
}

function forbidden(): never {
  throw new ApiError(
    403,
    "FORBIDDEN",
    "You are not authorized to perform this action."
  );
}

function invalidToken(): never {
  throw new ApiError(
    401,
    "INVALID_TOKEN",
    "Authentication token is invalid."
  );
}

function accountExists(): never {
  throw new ApiError(
    409,
    "ACCOUNT_EXISTS",
    "An account already exists for this email."
  );
}

function emailNotAllowed(): never {
  throw new ApiError(
    400,
    "INVITATION_EMAIL_NOT_ALLOWED",
    "This email cannot be invited."
  );
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

function versionConflict(): never {
  throw new ApiError(
    409,
    "VERSION_CONFLICT",
    "The invitation changed elsewhere."
  );
}

function notActionable(): never {
  throw new ApiError(
    409,
    "INVITATION_NOT_ACTIONABLE",
    INVITATION_NOT_ACTIONABLE_MESSAGE
  );
}

function invitationUnavailable(): never {
  throw new InvitationUnavailableError();
}
