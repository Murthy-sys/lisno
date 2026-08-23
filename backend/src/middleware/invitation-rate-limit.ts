import type { NextFunction, Request, RequestHandler } from "express";

import { ApiError } from "./errors.js";

const DEFAULT_WINDOW_MS = 15 * 60 * 1_000;
const DEFAULT_MAX_ATTEMPTS = 20;
const DEFAULT_MAX_ENTRIES = 10_000;

export interface InvitationRateLimitOptions {
  windowMs?: number;
  maxAttempts?: number;
  maxEntries?: number;
  clock?: () => number;
}

interface Bucket {
  startedAt: number;
  attempts: number;
}

type InvitationRateLimiter = RequestHandler & {
  activeBucketCount(): number;
};

function createLimiter(
  keyForRequest: (request: Request, next: NextFunction) => string | null,
  options: InvitationRateLimitOptions
): InvitationRateLimiter {
  return limiterFactory(keyForRequest, options);
}

function limiterFactory(
  keyForRequest: (request: Request, next: NextFunction) => string | null,
  {
    windowMs = DEFAULT_WINDOW_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    maxEntries = DEFAULT_MAX_ENTRIES,
    clock = Date.now
  }: InvitationRateLimitOptions = {}
): InvitationRateLimiter {
  for (const [name, value] of [
    ["windowMs", windowMs],
    ["maxAttempts", maxAttempts],
    ["maxEntries", maxEntries]
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Invitation rate-limit ${name} must be a positive integer.`);
    }
  }

  const buckets = new Map<string, Bucket>();
  const clearExpired = (now: number) => {
    for (const [key, bucket] of buckets) {
      if (now - bucket.startedAt >= windowMs) buckets.delete(key);
    }
  };

  const limiter: InvitationRateLimiter = (request, _response, next) => {
    const key = keyForRequest(request, next);
    if (key === null) return;
    const now = clock();
    clearExpired(now);
    const bucket = buckets.get(key);
    if (bucket) {
      if (bucket.attempts >= maxAttempts) {
        const retryAfter = Math.max(
          1,
          Math.ceil((bucket.startedAt + windowMs - now) / 1_000)
        );
        next(new ApiError(
          429,
          "TOO_MANY_ATTEMPTS",
          "Please try again later.",
          undefined,
          { "Retry-After": String(retryAfter) }
        ));
        return;
      }
      bucket.attempts += 1;
      next();
      return;
    }

    while (buckets.size >= maxEntries) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
    }
    buckets.set(key, { startedAt: now, attempts: 1 });
    next();
  };
  limiter.activeBucketCount = () => {
    clearExpired(clock());
    return buckets.size;
  };
  return limiter;
}

function socketAddress(request: Request): string {
  return request.socket.remoteAddress || "unknown";
}

export function createInvitationPublicRateLimit(
  options: InvitationRateLimitOptions = {}
): RequestHandler {
  return createLimiter((request) => socketAddress(request), options);
}

export function createInvitationDeliveryRateLimit(
  options: InvitationRateLimitOptions = {}
): RequestHandler {
  return createLimiter((request, next) => {
    if (!request.authenticatedUser) {
      next(new ApiError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication is required."
      ));
      return null;
    }
    return `${request.authenticatedUser.id}\n${socketAddress(request)}`;
  }, options);
}
