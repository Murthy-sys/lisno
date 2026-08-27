import { Router, type RequestHandler } from "express";
import { z } from "zod";

import {
  REQUESTABLE_PROJECT_MODULES,
  roleMayRequestModule
} from "../domain/authorization.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { ApiError } from "../middleware/errors.js";
import {
  paginatedEnvelope,
  paginationShape
} from "../middleware/pagination.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AccessRequestRateLimiter } from "../middleware/access-request-rate-limit.js";
import type { AccessRequestService } from "../services/access-request.service.js";
import type { AuthService } from "../services/auth.service.js";

const submitSchema = z
  .object({
    projectId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
    module: z.enum(REQUESTABLE_PROJECT_MODULES),
    reason: z.string().trim().min(1).max(1000)
  })
  .strict();
const filtersWithPaginationSchema = z
  .object({
    status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
    module: z.enum(REQUESTABLE_PROJECT_MODULES).optional(),
    ...paginationShape
  })
  .strict();
const versionSchema = z.object({ version: z.number().int().positive() }).strict();
const decisionSchema = z.discriminatedUnion("decision", [
  z.object({
    version: z.number().int().positive(),
    decision: z.literal("approved")
  }).strict(),
  z.object({
    version: z.number().int().positive(),
    decision: z.literal("rejected"),
    reason: z.string().trim().min(1).max(1000)
  }).strict()
]);
const revocationSchema = z
  .object({
    version: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000)
  })
  .strict();

const requireEligibleModuleFromBody = (): RequestHandler =>
  (request, _response, next) => {
    const actor = request.authenticatedUser;
    if (!actor || !roleMayRequestModule(actor.role, request.body?.module)) {
      next(
        new ApiError(
          403,
          "FORBIDDEN",
          "You are not authorized to perform this action."
        )
      );
      return;
    }
    next();
  };

export function createAccessRequestsRouter(
  authService: AuthService,
  accessRequestService: AccessRequestService,
  accessRequestRateLimit: AccessRequestRateLimiter
): Router {
  const router = Router();

  router.post(
    "/access-requests",
    authenticate(authService),
    requireOperation("POST /access-requests"),
    requireEligibleModuleFromBody(),
    accessRequestRateLimit,
    validateBody(submitSchema),
    async (request, response, next) => {
      try {
        response.status(202).json({
          data: await accessRequestService.submit(
            request.authenticatedUser!,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/access-requests/mine",
    authenticate(authService),
    requireOperation("GET /access-requests/mine"),
    validateQuery(filtersWithPaginationSchema),
    async (request, response, next) => {
      try {
        const { limit, offset, ...filters } = response.locals.validatedQuery;
        const pagination = { limit, offset };
        response.json({
          data: paginatedEnvelope(
            await accessRequestService.listOwn(
              request.authenticatedUser!,
              filters,
              pagination
            ),
            pagination
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/access-requests/:requestId/cancel",
    authenticate(authService),
    requireOperation("POST /access-requests/:requestId/cancel"),
    validateBody(versionSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await accessRequestService.cancel(
            request.authenticatedUser!,
            request.params.requestId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/access-requests/review",
    authenticate(authService),
    requireOperation("GET /access-requests/review"),
    validateQuery(filtersWithPaginationSchema),
    async (request, response, next) => {
      try {
        const { limit, offset, ...filters } = response.locals.validatedQuery;
        const pagination = { limit, offset };
        response.json({
          data: paginatedEnvelope(
            await accessRequestService.listForReview(
              request.authenticatedUser!,
              filters,
              pagination
            ),
            pagination
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/access-requests/:requestId/decision",
    authenticate(authService),
    requireOperation("POST /access-requests/:requestId/decision"),
    validateBody(decisionSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await accessRequestService.decide(
            request.authenticatedUser!,
            request.params.requestId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/project-access-grants/:grantId/revoke",
    authenticate(authService),
    requireOperation("POST /project-access-grants/:grantId/revoke"),
    validateBody(revocationSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await accessRequestService.revoke(
            request.authenticatedUser!,
            request.params.grantId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
