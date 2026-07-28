import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import {
  AccountExistsError,
  InvalidCredentialsError,
  type AuthService
} from "../services/auth.service.js";

const loginCredentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .transform((email) => email.toLowerCase()),
  password: z.string().min(1, "Password is required.")
});

const clientSignupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address.")
      .transform((email) => email.toLowerCase()),
    mobile: z.string().trim().min(1, "Mobile is required."),
    address: z.string().trim().min(1, "Address is required."),
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

export function createAuthRouter(
  authService: AuthService,
  authRateLimit: RequestHandler
): Router {
  const router = Router();

  router.post(
    "/auth/login",
    authRateLimit,
    validateBody(loginCredentialsSchema),
    async (request, response, next) => {
      try {
        response.status(200).json({ data: await authService.login(
          request.body.email,
          request.body.password
        ) });
      } catch (error) {
        if (error instanceof InvalidCredentialsError) {
          next(
            new ApiError(
              401,
              "INVALID_CREDENTIALS",
              "Invalid email or password."
            )
          );
          return;
        }
        next(error);
      }
    }
  );

  router.post(
    "/auth/client-signup",
    authRateLimit,
    validateBody(clientSignupSchema),
    async (request, response, next) => {
      try {
        const { passwordConfirmation: _passwordConfirmation, ...input } = request.body;
        response.status(201).json({ data: await authService.signupClient(input) });
      } catch (error) {
        if (error instanceof AccountExistsError) {
          next(new ApiError(409, "ACCOUNT_EXISTS", "An account already exists for this email."));
          return;
        }
        next(error);
      }
    }
  );

  router.get("/auth/me", authenticate(authService), (request, response) => {
    response.status(200).json({ data: request.authenticatedUser });
  });

  return router;
}
