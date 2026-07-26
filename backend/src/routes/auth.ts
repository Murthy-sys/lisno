import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validateBody } from "../middleware/validate.js";
import {
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

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  router.post(
    "/auth/login",
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

  router.get("/auth/me", authenticate(authService), (request, response) => {
    response.status(200).json({ data: request.authenticatedUser });
  });

  return router;
}
