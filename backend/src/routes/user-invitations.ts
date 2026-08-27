import { Router, type RequestHandler } from "express";
import { z } from "zod";

import {
  INVITABLE_ROLE_CODES,
  invitationEmailSchema,
  invitationMobileSchema,
  invitationNameSchema,
  type InvitableRole
} from "../domain/user-invitations.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { paginatedEnvelope, paginationShape } from "../middleware/pagination.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { UserInvitationService } from "../services/user-invitation.service.js";

const invitableRoleSchema = z.custom<InvitableRole>(
  (value) =>
    typeof value === "string" &&
    (INVITABLE_ROLE_CODES as readonly string[]).includes(value),
  "Select an invitable role."
);

const invitationQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    role: invitableRoleSchema.optional(),
    status: z
      .enum([
        "pending",
        "delivery_failed",
        "expired",
        "revoked",
        "superseded",
        "accepted"
      ])
      .optional(),
    deliveryStatus: z.enum(["queued", "sent", "failed"]).optional(),
    ...paginationShape
  })
  .strict();

const createInvitationSchema = z
  .object({
    name: invitationNameSchema,
    email: invitationEmailSchema,
    role: invitableRoleSchema,
    mobile: invitationMobileSchema
  })
  .strict();

const versionSchema = z
  .object({ version: z.number().int().positive() })
  .strict();

const inspectSchema = z.object({ token: z.string() }).strict();

const acceptSchema = z
  .object({
    token: z.string(),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters.")
      .max(128, "Password must be at most 128 characters."),
    passwordConfirmation: z.string()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.password !== value.passwordConfirmation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passwordConfirmation"],
        message: "Passwords do not match."
      });
    }
  });

export function createUserInvitationsRouter(
  auth: AuthService,
  invitations: UserInvitationService,
  deliveryRateLimit: RequestHandler
): Router {
  const router = Router();

  router.get(
    "/admin/user-invitations",
    authenticate(auth),
    requireOperation("GET /admin/user-invitations"),
    validateQuery(invitationQuerySchema),
    async (request, response, next) => {
      try {
        const { limit, offset, ...filters } = response.locals.validatedQuery;
        const pagination = { limit, offset };
        const result = await invitations.list(
          request.authenticatedUser!,
          filters,
          pagination
        );
        response.status(200).json({
          data: {
            ...paginatedEnvelope(
              { items: result.items, total: result.total },
              pagination
            ),
            invitableRoles: result.invitableRoles
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/user-invitations",
    authenticate(auth),
    requireOperation("POST /admin/user-invitations"),
    deliveryRateLimit,
    validateBody(createInvitationSchema),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await invitations.create(
            request.authenticatedUser!,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/user-invitations/:invitationId/resend",
    authenticate(auth),
    requireOperation("POST /admin/user-invitations/:invitationId/resend"),
    deliveryRateLimit,
    validateBody(versionSchema),
    async (request, response, next) => {
      try {
        response.status(200).json({
          data: await invitations.resend(
            request.authenticatedUser!,
            request.params.invitationId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/admin/user-invitations/:invitationId/revoke",
    authenticate(auth),
    requireOperation("POST /admin/user-invitations/:invitationId/revoke"),
    validateBody(versionSchema),
    async (request, response, next) => {
      try {
        response.status(200).json({
          data: await invitations.revoke(
            request.authenticatedUser!,
            request.params.invitationId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/auth/user-invitations/inspect",
    validateBody(inspectSchema),
    async (request, response, next) => {
      try {
        response.status(200).json({
          data: await invitations.inspect(request.body.token)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/auth/user-invitations/accept",
    validateBody(acceptSchema),
    async (request, response, next) => {
      try {
        const {
          token,
          password,
          passwordConfirmation: _passwordConfirmation
        } = request.body;
        response.status(201).json({
          data: await invitations.accept({ rawToken: token, password })
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
