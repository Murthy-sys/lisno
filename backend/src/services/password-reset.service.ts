import { randomBytes as cryptoRandomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

import {
  PASSWORD_RESET_RECIPIENT_WINDOW_MS,
  PASSWORD_RESET_TOKEN_PATTERN,
  expiresAtForPasswordReset,
  hashPasswordResetToken,
  isPasswordResetAvailable,
  isPasswordResetEligible,
  isPasswordResetRecipientSuppressed,
  passwordResetSessionVersion
} from "../domain/password-resets.js";
import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";
import {
  RepositoryConflictError,
  RepositoryNotFoundError,
  type AppRepository,
  type PasswordResetRequestRecord,
  type UserRecord
} from "../repositories/types.js";
import type { AuditService } from "./audit.service.js";
import type { PasswordResetMailer } from "./password-reset-mailer.js";
import { PasswordResetDeliveryError } from "./smtp-password-reset-mailer.js";
import type { Clock } from "./workflow.js";

const PASSWORD_HASH_COST = 12;
export const PASSWORD_RESET_SYSTEM_ACTOR_ID = "system:password-reset";

export type PasswordResetAsyncStage =
  | "issuance"
  | "password_changed_notification";

export interface PasswordResetAsyncFailure {
  stage: PasswordResetAsyncStage;
  failureCode: "ASYNC_OPERATION_FAILED" | "DISPATCH_FAILED";
}

export class PasswordResetDeliveryUnavailableError extends ApiError {
  constructor() {
    super(
      503,
      "PASSWORD_RESET_DELIVERY_UNAVAILABLE",
      "Password reset is temporarily unavailable."
    );
    this.name = "PasswordResetDeliveryUnavailableError";
  }
}

export class PasswordResetUnavailableError extends ApiError {
  constructor() {
    super(
      410,
      "PASSWORD_RESET_UNAVAILABLE",
      "This password reset link is unavailable."
    );
    this.name = "PasswordResetUnavailableError";
  }
}

export interface PasswordResetService {
  request(email: string): Promise<{ accepted: true }>;
  inspect(rawToken: string): Promise<{ available: true }>;
  complete(input: {
    rawToken: string;
    password: string;
  }): Promise<{ reset: true }>;
}

export interface PasswordResetServiceDependencies {
  repository: AppRepository;
  audit: AuditService;
  mailer: PasswordResetMailer;
  clock: Clock;
  randomBytes?: (size: number) => Buffer;
  idGenerator?: () => string;
  passwordHasher?: (password: string, cost: number) => Promise<string>;
  dispatch?: (operation: () => Promise<void>) => void;
  reportAsyncFailure?: (failure: PasswordResetAsyncFailure) => void;
}

interface IssuedReset {
  record: PasswordResetRequestRecord;
  recipient: Pick<UserRecord, "id" | "name" | "email">;
  rawToken: string;
}

interface CompletedResetRecipient
  extends Pick<UserRecord, "id" | "name" | "email"> {
  changedAt: string;
}

export function createPasswordResetService(
  dependencies: PasswordResetServiceDependencies
): PasswordResetService {
  const { repository, audit, mailer, clock } = dependencies;
  const randomBytes = dependencies.randomBytes ?? cryptoRandomBytes;
  const idGenerator = dependencies.idGenerator ?? randomUUID;
  const passwordHasher =
    dependencies.passwordHasher ??
    ((password: string, cost: number) => bcrypt.hash(password, cost));
  const dispatch =
    dependencies.dispatch ??
    ((operation: () => Promise<void>) => {
      queueMicrotask(() => {
        void operation();
      });
    });
  const reportAsyncFailure =
    dependencies.reportAsyncFailure ??
    ((failure: PasswordResetAsyncFailure) => {
      console.error(
        `[password-reset] ${failure.stage} ${failure.failureCode}`
      );
    });
  const schedule = (
    stage: PasswordResetAsyncStage,
    operation: () => Promise<void>
  ) => {
    const contained = async () => {
      try {
        await operation();
      } catch {
        safelyReportAsyncFailure(reportAsyncFailure, {
          stage,
          failureCode: "ASYNC_OPERATION_FAILED"
        });
      }
    };
    try {
      dispatch(contained);
    } catch {
      safelyReportAsyncFailure(reportAsyncFailure, {
        stage,
        failureCode: "DISPATCH_FAILED"
      });
    }
  };

  return {
    async request(email) {
      if (mailer.deliveryKind === "disabled") {
        throw new PasswordResetDeliveryUnavailableError();
      }
      const emailNormalized = normalizeEmail(email);
      schedule("issuance", async () => {
        const discovered = await repository.findUserByEmail(emailNormalized);
        if (!discovered || !isPasswordResetEligible(discovered)) return;
        const issued = await issuePasswordReset({
          repository,
          audit,
          clock,
          randomBytes,
          idGenerator,
          emailNormalized
        });
        if (!issued) return;
        await deliverResetLink(repository, audit, mailer, clock, issued);
      });
      return { accepted: true };
    },

    async inspect(rawToken) {
      if (!PASSWORD_RESET_TOKEN_PATTERN.test(rawToken)) {
        throw new PasswordResetUnavailableError();
      }
      const reset = await findAvailableReset(repository, rawToken, clock().toISOString());
      if (!reset) throw new PasswordResetUnavailableError();
      return { available: true };
    },

    async complete({ rawToken, password }) {
      if (!PASSWORD_RESET_TOKEN_PATTERN.test(rawToken)) {
        throw new PasswordResetUnavailableError();
      }
      const tokenHash = hashPasswordResetToken(rawToken);
      const discoveredReset =
        await repository.findPendingPasswordResetByTokenHash(tokenHash);
      if (!discoveredReset) throw new PasswordResetUnavailableError();
      const passwordHash = await passwordHasher(password, PASSWORD_HASH_COST);
      let completedUser: CompletedResetRecipient;
      try {
        completedUser = await repository.runInTransaction(async (transaction) => {
          await transaction.coordinateAuthorizationMutation();
          const reset = await transaction.findPendingPasswordResetByTokenHash(
            tokenHash
          );
          if (!reset || reset.id !== discoveredReset.id) {
            throw new PasswordResetUnavailableError();
          }
          const discoveredUser = await transaction.findUserById(reset.userId);
          const discoveredAt = clock().toISOString();
          if (
            !isPasswordResetAvailable({
              reset,
              user: discoveredUser,
              now: discoveredAt
            })
          ) {
            throw new PasswordResetUnavailableError();
          }
          await transaction.coordinateClientEmail(discoveredUser!.emailNormalized);
          const currentReset =
            await transaction.findPendingPasswordResetByTokenHash(tokenHash);
          const user = await transaction.findUserById(reset.userId);
          const completedAt = clock().toISOString();
          if (
            !currentReset ||
            currentReset.id !== reset.id ||
            !isPasswordResetAvailable({
              reset: currentReset,
              user,
              now: completedAt
            })
          ) {
            throw new PasswordResetUnavailableError();
          }

          await transaction.updateUserCredentials(
            user!.id,
            currentReset.userVersion,
            currentReset.sessionVersion,
            { passwordHash, updatedAt: completedAt }
          );
          const consumed = await transaction.completePasswordReset(
            currentReset.id,
            currentReset.version,
            currentReset.tokenGeneration,
            tokenHash,
            { completedAt, updatedAt: completedAt }
          );
          await audit.append(
            {
              actorId: PASSWORD_RESET_SYSTEM_ACTOR_ID,
              action: "password_reset.completed",
              entityType: "password_reset",
              entityId: consumed.id,
              occurredAt: completedAt,
              newValues: {
                resetId: consumed.id,
                userId: user!.id,
                tokenGeneration: consumed.tokenGeneration,
                terminalState: "completed",
                version: consumed.version
              }
            },
            transaction
          );
          return {
            id: user!.id,
            name: user!.name,
            email: user!.email,
            changedAt: completedAt
          };
        });
      } catch (error) {
        if (
          error instanceof PasswordResetUnavailableError ||
          error instanceof RepositoryConflictError ||
          error instanceof RepositoryNotFoundError
        ) {
          throw new PasswordResetUnavailableError();
        }
        throw error;
      }

      schedule("password_changed_notification", () =>
        sendPasswordChangedNotification(
          repository,
          audit,
          mailer,
          completedUser
        )
      );
      return { reset: true };
    }
  };
}

async function issuePasswordReset(input: {
  repository: AppRepository;
  audit: AuditService;
  clock: Clock;
  randomBytes: (size: number) => Buffer;
  idGenerator: () => string;
  emailNormalized: string;
}): Promise<IssuedReset | null> {
  const { repository, audit, clock, randomBytes, idGenerator, emailNormalized } =
    input;
  return repository.runInTransaction(async (transaction) => {
    await transaction.coordinateClientEmail(emailNormalized);
    const user = await transaction.findUserByEmail(emailNormalized);
    if (!user || !isPasswordResetEligible(user)) return null;

    const issuedAt = clock().toISOString();
    const windowStart = new Date(
      Date.parse(issuedAt) - PASSWORD_RESET_RECIPIENT_WINDOW_MS
    ).toISOString();
    const latestIssuedAt = await transaction.findLatestPasswordResetIssuedAt(
      user.id
    );
    const issuedCountInWindow = await transaction.countPasswordResetsIssuedSince(
      user.id,
      windowStart
    );
    if (
      isPasswordResetRecipientSuppressed({
        latestIssuedAt,
        issuedCountInWindow,
        now: issuedAt
      })
    ) {
      return null;
    }

    const prior = await transaction.findPendingPasswordResetByUserId(user.id);
    const resetId = `password-reset-${idGenerator()}`;
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashPasswordResetToken(rawToken);
    const expiresAt = expiresAtForPasswordReset(issuedAt);
    const generation = (prior?.tokenGeneration ?? 0) + 1;

    if (prior) {
      await transaction.supersedePasswordReset(prior.id, prior.version, {
        supersededByResetId: resetId,
        supersededAt: issuedAt,
        updatedAt: issuedAt
      });
      await audit.append(
        {
          actorId: PASSWORD_RESET_SYSTEM_ACTOR_ID,
          action: "password_reset.superseded",
          entityType: "password_reset",
          entityId: prior.id,
          occurredAt: issuedAt,
          newValues: {
            resetId: prior.id,
            userId: user.id,
            tokenGeneration: prior.tokenGeneration,
            terminalState: "superseded"
          }
        },
        transaction
      );
    }

    const record = await transaction.createPasswordReset({
      id: resetId,
      userId: user.id,
      userVersion: user.version,
      sessionVersion: passwordResetSessionVersion(user),
      tokenHash,
      tokenGeneration: generation,
      issuedAt,
      expiresAt,
      status: "pending",
      supersededByResetId: null,
      supersededAt: null,
      completedAt: null,
      deliveryStatus: "queued",
      deliveryAttemptedAt: null,
      sentAt: null,
      deliveryFailureCode: null,
      version: 1,
      createdAt: issuedAt,
      updatedAt: issuedAt
    });
    await audit.append(
      {
        actorId: PASSWORD_RESET_SYSTEM_ACTOR_ID,
        action: "password_reset.requested",
        entityType: "password_reset",
        entityId: record.id,
        occurredAt: issuedAt,
        newValues: {
          resetId: record.id,
          userId: user.id,
          tokenGeneration: record.tokenGeneration,
          expiresAt: record.expiresAt,
          deliveryState: "queued",
          version: record.version
        }
      },
      transaction
    );
    return {
      record,
      recipient: { id: user.id, name: user.name, email: user.email },
      rawToken
    };
  });
}

function safelyReportAsyncFailure(
  report: (failure: PasswordResetAsyncFailure) => void,
  failure: PasswordResetAsyncFailure
): void {
  try {
    report(failure);
  } catch {
    // Reporting must never surface background failures through the public API.
  }
}

async function findAvailableReset(
  repository: AppRepository,
  rawToken: string,
  now: string
): Promise<PasswordResetRequestRecord | null> {
  const tokenHash = hashPasswordResetToken(rawToken);
  const reset = await repository.findPendingPasswordResetByTokenHash(tokenHash);
  if (!reset) return null;
  const user = await repository.findUserById(reset.userId);
  return isPasswordResetAvailable({ reset, user, now }) ? reset : null;
}

async function deliverResetLink(
  repository: AppRepository,
  audit: AuditService,
  mailer: Exclude<PasswordResetMailer, { deliveryKind: "disabled" }>,
  clock: Clock,
  issued: IssuedReset
): Promise<void> {
  let change: Parameters<AppRepository["updatePasswordResetDelivery"]>[2];
  try {
    await mailer.sendResetLink({
      recipient: {
        name: issued.recipient.name,
        email: issued.recipient.email
      },
      rawToken: issued.rawToken,
      expiresAt: issued.record.expiresAt
    });
    const attemptedAt = clock().toISOString();
    change = {
      status: "sent",
      attemptedAt,
      sentAt: attemptedAt,
      updatedAt: attemptedAt
    };
  } catch (error) {
    const attemptedAt = clock().toISOString();
    change = {
      status: "failed",
      attemptedAt,
      failureCode:
        error instanceof PasswordResetDeliveryError
          ? error.failureCode
          : "DELIVERY_FAILED",
      updatedAt: attemptedAt
    };
  }
  await recordDeliveryOutcome(repository, audit, issued, change);
}

async function recordDeliveryOutcome(
  repository: AppRepository,
  audit: AuditService,
  issued: IssuedReset,
  change: Parameters<AppRepository["updatePasswordResetDelivery"]>[2]
): Promise<void> {
  await repository.runInTransaction(async (transaction) => {
    const updated = await transaction.updatePasswordResetDelivery(
      issued.record.id,
      issued.record.tokenGeneration,
      change
    );
    if (!updated) return;
    await audit.append(
      {
        actorId: PASSWORD_RESET_SYSTEM_ACTOR_ID,
        action:
          change.status === "sent"
            ? "password_reset.delivery_sent"
            : "password_reset.delivery_failed",
        entityType: "password_reset",
        entityId: updated.id,
        occurredAt: change.attemptedAt,
        newValues: {
          resetId: updated.id,
          userId: updated.userId,
          tokenGeneration: updated.tokenGeneration,
          deliveryState: change.status,
          ...(change.status === "failed"
            ? { deliveryFailureCode: change.failureCode }
            : {}),
          version: updated.version
        }
      },
      transaction
    );
  });
}

async function sendPasswordChangedNotification(
  repository: AppRepository,
  audit: AuditService,
  mailer: PasswordResetMailer,
  recipient: CompletedResetRecipient
): Promise<void> {
  const changedAt = recipient.changedAt;
  let action: "password_reset.notification_sent" | "password_reset.notification_failed";
  let failureCode: string | undefined;
  if (mailer.deliveryKind === "disabled") {
    action = "password_reset.notification_failed";
    failureCode = "DELIVERY_DISABLED";
  } else {
    try {
      await mailer.sendPasswordChanged({
        recipient: { name: recipient.name, email: recipient.email },
        changedAt
      });
      action = "password_reset.notification_sent";
    } catch (error) {
      action = "password_reset.notification_failed";
      failureCode =
        error instanceof PasswordResetDeliveryError
          ? error.failureCode
          : "NOTIFICATION_FAILED";
    }
  }
  await audit.append({
    actorId: PASSWORD_RESET_SYSTEM_ACTOR_ID,
    action,
    entityType: "user",
    entityId: recipient.id,
    occurredAt: changedAt,
    newValues: {
      deliveryState: action.endsWith("_sent") ? "sent" : "failed",
      ...(failureCode ? { deliveryFailureCode: failureCode } : {})
    }
  });
}
