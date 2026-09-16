import jwt from "jsonwebtoken";
import type { Request } from "express";
import type { ChatActor } from "../contracts/project-chat.js";
import type { PublicUser } from "./auth.service.js";
import { ApiError } from "../middleware/errors.js";
/** Use only with the user returned by AuthService.authenticate for this exact token. Decoding preserves verified session/expiry claims; it never authenticates a token. */
export function chatActorFromAuthenticatedUser(user: PublicUser, token: string): ChatActor {
    const claims = jwt.decode(token);
    if (!claims || typeof claims === "string" || claims.id !== user.id || claims.role !== user.role || !Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(claims.sessionVersion ?? 1) || (claims.sessionVersion ?? 1) < 1)
        throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
    return { id: user.id, role: user.role, sessionVersion: claims.sessionVersion ?? 1, expiresAt: claims.exp! };
}
export function chatActorFromAuthenticatedRequest(request: Request): ChatActor {
    const token = /^Bearer ([^\s]+)$/.exec(request.header("Authorization") ?? "")?.[1];
    if (!request.authenticatedUser || !token)
        throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    return chatActorFromAuthenticatedUser(request.authenticatedUser, token);
}
