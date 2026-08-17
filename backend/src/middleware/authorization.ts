import type { RequestHandler } from "express";

import {
  AuthorizationConfigurationError,
  hasPermission,
  type PermissionCode
} from "../domain/authorization.js";
import { runWithHumanOperation } from "../domain/operation-context.js";
import {
  HUMAN_JWT_OPERATIONS,
  markHumanOperation,
  type HumanJwtOperationKey
} from "../domain/route-operations.js";
import { ApiError } from "./errors.js";

export function requirePermission(permission: PermissionCode): RequestHandler {
  return (request, _response, next) => {
    const actor = request.authenticatedUser;
    if (!actor) {
      next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
      return;
    }
    if (!hasPermission(actor.role, permission)) {
      next(new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action."));
      return;
    }
    next();
  };
}

export function requireOperation(key: HumanJwtOperationKey): RequestHandler {
  const operation = HUMAN_JWT_OPERATIONS[key];
  if (!operation) {
    throw new AuthorizationConfigurationError(
      `Unregistered human operation: ${String(key)}`
    );
  }
  const handler: RequestHandler = (request, _response, next) => {
    const actor = request.authenticatedUser;
    if (!actor) {
      next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
      return;
    }
    if (!hasPermission(actor.role, operation.permission)) {
      next(new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action."));
      return;
    }
    if (actor.role === "super_admin" && operation.superAdminBehavior === "deny_personal") {
      next(new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action."));
      return;
    }
    runWithHumanOperation(key, next);
  };
  return markHumanOperation(handler, key);
}
