import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import type { Role } from "../contracts/domain.js";
import { normalizeEmail } from "../domain/email.js";
import {
  RepositoryConflictError,
  type AppRepository,
  type UserRecord
} from "../repositories/types.js";
import { createAuditService, type AuditService } from "./audit.service.js";
import { systemClock, type Clock } from "./workflow.js";

const roleSchema = z.enum(["designer", "design_manager", "design_head", "client"]);
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

export interface ClientSignupInput {
  name: string;
  email: string;
  mobile: string;
  address: string;
  password: string;
}

export interface AuthServiceDependencies {
  auditService: AuditService;
  clock?: Clock;
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
  login(email: string, password: string): Promise<AuthPayload>;
  signupClient(input: ClientSignupInput): Promise<AuthPayload>;
  authenticate(token: string): Promise<PublicUser>;
}

export function createAuthService(
  repository: AppRepository,
  config: AuthConfig,
  dependencies?: AuthServiceDependencies
): AuthService {
  const validatedConfig = authConfigSchema.parse(config);
  const clock = dependencies?.clock ?? systemClock;
  const auditService = dependencies?.auditService ?? createAuditService(repository);

  return {
    async login(email, password) {
      const user = await repository.findUserByEmail(email);
      const passwordMatches = await bcrypt.compare(
        password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH
      );

      if (!user || !user.active || !passwordMatches) {
        throw new InvalidCredentialsError();
      }

      const token = jwt.sign({ id: user.id, role: user.role }, validatedConfig.jwtSecret, {
        expiresIn: validatedConfig.jwtExpiresInSeconds
      });

      return { token, user: toPublicUser(user) };
    },

    async signupClient(input) {
      const emailNormalized = normalizeEmail(input.email);
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

    async authenticate(token) {
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

      return toPublicUser(user);
    }
  };
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
