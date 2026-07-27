import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import type { Role } from "../contracts/domain.js";
import type { AppRepository, UserRecord } from "../repositories/types.js";

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

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
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
  authenticate(token: string): Promise<PublicUser>;
}

export function createAuthService(
  repository: AppRepository,
  config: AuthConfig
): AuthService {
  const validatedConfig = authConfigSchema.parse(config);

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
