import { Router } from "express";
import { z } from "zod";

import { normalizedEmailSchema } from "../domain/email.js";
import { validateBody } from "../middleware/validate.js";
import type { PasswordResetService } from "../services/password-reset.service.js";

const tokenSchema = z.string();

const requestSchema = z
  .object({ email: normalizedEmailSchema })
  .strict();

const inspectSchema = z
  .object({ token: tokenSchema })
  .strict();

const completeSchema = z
  .object({
    token: tokenSchema,
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

export function createPasswordResetsRouter(
  service: PasswordResetService
): Router {
  const router = Router();

  router.use("/auth/password-reset", (request, _response, next) => {
    delete request.headers.authorization;
    next();
  });

  router.post(
    "/auth/password-reset/request",
    validateBody(requestSchema),
    async (request, response, next) => {
      try {
        response.status(202).json({ data: await service.request(request.body.email) });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/auth/password-reset/inspect",
    validateBody(inspectSchema),
    async (request, response, next) => {
      try {
        response.status(200).json({ data: await service.inspect(request.body.token) });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/auth/password-reset/complete",
    validateBody(completeSchema),
    async (request, response, next) => {
      try {
        response.status(200).json({
          data: await service.complete({
            rawToken: request.body.token,
            password: request.body.password
          })
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
