import type { RequestHandler } from "express";

import {
  ExpiredTokenError,
  InvalidTokenError,
  type AuthService,
  type PublicUser
} from "../services/auth.service.js";
import { ApiError } from "./errors.js";

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: PublicUser;
    }
  }
}

const authenticationHandlerMarker = Symbol("authenticationHandler");
type MarkedAuthenticationHandler = RequestHandler & {
  readonly [authenticationHandlerMarker]: true;
};

export function isAuthenticationHandler(
  handler: RequestHandler
): handler is MarkedAuthenticationHandler {
  const descriptor = Object.getOwnPropertyDescriptor(
    handler,
    authenticationHandlerMarker
  );
  return descriptor !== undefined &&
    descriptor.value === true &&
    descriptor.enumerable === false &&
    descriptor.writable === false &&
    descriptor.configurable === false;
}

export function authenticate(authService: AuthService): RequestHandler {
  const handler: RequestHandler = async (request, _response, next) => {
    const authorization = request.header("Authorization");
    if (!authorization) {
      next(
        new ApiError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Authentication is required."
        )
      );
      return;
    }

    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match) {
      next(new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid."));
      return;
    }

    try {
      request.authenticatedUser = await authService.authenticate(match[1]!);
      next();
    } catch (error) {
      if (error instanceof ExpiredTokenError) {
        next(
          new ApiError(
            401,
            "TOKEN_EXPIRED",
            "Authentication token has expired."
          )
        );
        return;
      }
      if (error instanceof InvalidTokenError) {
        next(new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid."));
        return;
      }
      next(error);
    }
  };
  Object.defineProperty(handler, authenticationHandlerMarker, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return handler;
}
