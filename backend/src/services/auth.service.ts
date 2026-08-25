import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import type { Role } from "../contracts/domain.js";
import { isBuiltInDevelopmentJwtSecret } from "../config/development-env.js";
import {
  assertDevelopmentDemoConnection,
  isLoopbackRemoteAddress,
  type DevelopmentDemoAuthorization
} from "../development/demo-account-authorization.js";
import {
  ROLE_PERMISSIONS,
  type PermissionCode
} from "../domain/authorization.js";
import {
  isReservedDemoEmail,
  isReservedDevelopmentDemoIdentity
} from "../domain/demo-identities.js";
import { normalizeEmail } from "../domain/email.js";
import { roleSchema } from "../domain/roles.js";
import {
  RepositoryConflictError,
  type AppRepository,
  type UserRecord
} from "../repositories/types.js";
import { createAuditService, type AuditService } from "./audit.service.js";
import { systemClock, type Clock } from "./workflow.js";

const tokenPayloadSchema = z
  .object({
    id: z.string().min(1),
    role: roleSchema,
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive()
  })
  .strict()
  .refine((payload) => payload.exp > payload.iat);
const authConfigSchema = z
  .object({
    jwtSecret: z.string().min(32),
    jwtExpiresInSeconds: z.number().int().positive()
  })
  .strict();

const DUMMY_PASSWORD_HASH =
  "$2b$10$7EqJtq98hPqEX7fNZaFWoOhqP8D5iEyOH6v9mJEkjEBlrptHw28.O";

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresInSeconds: number;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
}

export interface AuthPayload {
  token: string;
  user: PublicUser;
}

export const AUTHORIZATION_POLICY_VERSION =
  "2026-08-25.project-workflow.v2" as const;

export interface AuthorizationSnapshot {
  readonly role: Role;
  readonly policyVersion: typeof AUTHORIZATION_POLICY_VERSION;
  readonly permissions: readonly PermissionCode[];
}

export function authorizationSnapshotFor(role: Role): AuthorizationSnapshot {
  return Object.freeze({
    role,
    policyVersion: AUTHORIZATION_POLICY_VERSION,
    permissions: Object.freeze([...ROLE_PERMISSIONS[role]])
  });
}

export interface ClientSignupInput {
  name: string;
  email: string;
  mobile: string;
  address: string;
  password: string;
}

export interface AuthenticationRequestContext {
  readonly remoteAddress: string | undefined;
}

export interface AuthServiceDependencies {
  auditService: AuditService;
  clock?: Clock;
  developmentDemoAuthorization?: DevelopmentDemoAuthorization;
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}

export class AccountExistsError extends Error {
  constructor() {
    super("An account already exists for this email.");
    this.name = "AccountExistsError";
  }
}

export class InvalidTokenError extends Error {
  constructor() {
    super("Authentication token is invalid.");
    this.name = "InvalidTokenError";
  }
}

export class ExpiredTokenError extends Error {
  constructor() {
    super("Authentication token has expired.");
    this.name = "ExpiredTokenError";
  }
}

export interface AuthService {
  login(
    email: string,
    password: string,
    context: AuthenticationRequestContext
  ): Promise<AuthPayload>;
  signupClient(
    input: ClientSignupInput,
    context: AuthenticationRequestContext
  ): Promise<AuthPayload>;
  authenticate(
    token: string,
    context: AuthenticationRequestContext
  ): Promise<PublicUser>;
  authorization(actor: PublicUser): AuthorizationSnapshot;
}

export function createAuthService(
  repository: AppRepository,
  config: AuthConfig,
  dependencies?: AuthServiceDependencies
): AuthService {
  const validatedConfig = authConfigSchema.parse(config);
  const clock = dependencies?.clock ?? systemClock;
  const auditService = dependencies?.auditService ?? createAuditService(repository);
  const hasIssuedDevelopmentDemoAuthorization = isIssuedDevelopmentDemoAuthorization(
    dependencies?.developmentDemoAuthorization
  );
  const usesBuiltInDevelopmentSecret = isBuiltInDevelopmentJwtSecret(
    validatedConfig.jwtSecret
  );

  return {
    async login(email, password, context) {
      const user = await repository.findUserByEmail(email);
      const passwordMatches = await bcrypt.compare(
        password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH
      );

      if (!user || !user.active || !passwordMatches) {
        throw new InvalidCredentialsError();
      }
      if (
        deniesHumanAuthentication(
          user,
          context,
          usesBuiltInDevelopmentSecret,
          hasIssuedDevelopmentDemoAuthorization
        )
      ) {
        throw new InvalidCredentialsError();
      }

      const token = jwt.sign({ id: user.id, role: user.role }, validatedConfig.jwtSecret, {
        expiresIn: validatedConfig.jwtExpiresInSeconds
      });

      return { token, user: toPublicUser(user) };
    },

    async signupClient(input, context) {
      const emailNormalized = normalizeEmail(input.email);
      if (isReservedDemoEmail(emailNormalized)) {
        throw new AccountExistsError();
      }
      if (
        usesBuiltInDevelopmentSecret &&
        !isLoopbackRemoteAddress(context.remoteAddress)
      ) {
        throw new InvalidCredentialsError();
      }
      let user: UserRecord;
      try {
        user = await repository.runInTransaction(async (transaction) => {
          await transaction.coordinateClientEmail(emailNormalized);
          if (await transaction.findUserByEmail(emailNormalized)) {
            throw new AccountExistsError();
          }

          const occurredAt = clock().toISOString();
          let created: UserRecord;
          try {
            created = await transaction.createUser({
              name: input.name.trim(),
              email: input.email.trim(),
              mobile: input.mobile.trim(),
              address: input.address.trim(),
              passwordHash: await bcrypt.hash(input.password, 12),
              role: "client",
              active: true,
              createdAt: occurredAt,
              updatedAt: occurredAt
            });
          } catch (error) {
            if (error instanceof RepositoryConflictError) throw new AccountExistsError();
            throw error;
          }

          const linkedProjects = await transaction.linkUnclaimedProjectsToClient(
            emailNormalized,
            created.id,
            occurredAt
          );
          await auditService.append(
            {
              actorId: created.id,
              action: "client_signed_up",
              entityType: "user",
              entityId: created.id,
              occurredAt,
              newValues: { role: "client", email: created.emailNormalized }
            },
            transaction
          );
          for (const project of linkedProjects) {
            await auditService.append(
              {
                actorId: created.id,
                action: "client_project_linked",
                entityType: "project",
                entityId: project.id,
                occurredAt,
                oldValues: { clientId: null },
                newValues: { clientId: created.id }
              },
              transaction
            );
          }
          return created;
        });
      } catch (error) {
        if (error instanceof AccountExistsError || error instanceof RepositoryConflictError) {
          throw new AccountExistsError();
        }
        throw error;
      }

      const token = jwt.sign({ id: user.id, role: user.role }, validatedConfig.jwtSecret, {
        expiresIn: validatedConfig.jwtExpiresInSeconds
      });
      return { token, user: toPublicUser(user) };
    },

    async authenticate(token, context) {
      let decoded: unknown;
      try {
        decoded = jwt.verify(token, validatedConfig.jwtSecret, {
          algorithms: ["HS256"]
        });
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          throw new ExpiredTokenError();
        }
        throw new InvalidTokenError();
      }

      const parsed = tokenPayloadSchema.safeParse(decoded);
      if (!parsed.success) {
        throw new InvalidTokenError();
      }

      const user = await repository.findUserById(parsed.data.id);
      if (!user || !user.active || user.role !== parsed.data.role) {
        throw new InvalidTokenError();
      }
      if (
        deniesHumanAuthentication(
          user,
          context,
          usesBuiltInDevelopmentSecret,
          hasIssuedDevelopmentDemoAuthorization
        )
      ) {
        throw new InvalidTokenError();
      }

      return toPublicUser(user);
    },

    authorization(actor) {
      return authorizationSnapshotFor(actor.role);
    }
  };
}

function deniesHumanAuthentication(
  user: UserRecord,
  context: AuthenticationRequestContext,
  usesBuiltInDevelopmentSecret: boolean,
  hasIssuedDevelopmentDemoAuthorization: boolean
): boolean {
  const isLoopbackPeer = isLoopbackRemoteAddress(context.remoteAddress);
  if (usesBuiltInDevelopmentSecret && !isLoopbackPeer) return true;
  return (
    isReservedDevelopmentDemoIdentity(user) &&
    !(hasIssuedDevelopmentDemoAuthorization && isLoopbackPeer)
  );
}

function isIssuedDevelopmentDemoAuthorization(
  authorization: DevelopmentDemoAuthorization | undefined
): boolean {
  if (!authorization) return false;
  const connectionIdentity = {};
  try {
    assertDevelopmentDemoConnection(authorization, {
      connectedDatabaseName: "lisno_demo",
      defaultConnection: connectionIdentity,
      userModelConnection: connectionIdentity
    });
    return true;
  } catch {
    return false;
  }
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.avatar ? { avatar: user.avatar } : {})
  };
}
