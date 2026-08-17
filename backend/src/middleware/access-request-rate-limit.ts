import type { RequestHandler } from "express";

import { ApiError } from "./errors.js";

export interface AccessRequestRateLimitOptions {
  windowMs: number;
  maxAttempts: number;
  clock: () => number;
  maxEntries?: number;
}

interface Bucket {
  startedAt: number;
  attempts: number;
}

export type AccessRequestRateLimiter = RequestHandler & {
  activeBucketCount(): number;
};

export function createAccessRequestRateLimit({
  windowMs,
  maxAttempts,
  clock,
  maxEntries = 10_000
}: AccessRequestRateLimitOptions): AccessRequestRateLimiter {
  if (!Number.isInteger(windowMs) || windowMs < 1) {
    throw new Error("Access-request rate-limit windowMs must be a positive integer.");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("Access-request rate-limit maxAttempts must be a positive integer.");
  }
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("Access-request rate-limit maxEntries must be a positive integer.");
  }

  const buckets = new Map<string, Bucket>();

  const clearExpired = (now: number) => {
    for (const [key, bucket] of buckets) {
      if (now - bucket.startedAt >= windowMs) buckets.delete(key);
    }
  };

  const limiter: AccessRequestRateLimiter = (request, _response, next) => {
    const actor = request.authenticatedUser;
    if (!actor) {
      next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
      return;
    }

    const now = clock();
    clearExpired(now);
    const address = request.ip || request.socket.remoteAddress || "unknown";
    const key = `${actor.id}\n${address}`;
    const bucket = buckets.get(key);
    if (bucket) {
      if (bucket.attempts >= maxAttempts) {
        next(new ApiError(429, "TOO_MANY_ATTEMPTS", "Please try again later."));
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
