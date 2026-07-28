import type { RequestHandler } from "express";

import { ApiError } from "./errors.js";

export interface AuthRateLimitOptions {
  windowMs: number;
  maxAttempts: number;
  clock: () => number;
  maxEntries?: number;
}

interface Bucket {
  startedAt: number;
  attempts: number;
}

export type AuthRateLimiter = RequestHandler & {
  activeBucketCount(): number;
};

export function createAuthRateLimit({
  windowMs,
  maxAttempts,
  clock,
  maxEntries = 10_000
}: AuthRateLimitOptions): AuthRateLimiter {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("Auth rate-limit maxEntries must be a positive integer.");
  }
  const buckets = new Map<string, Bucket>();

  const clearExpired = (now: number) => {
    while (true) {
      const oldest = buckets.entries().next();
      if (oldest.done || now - oldest.value[1].startedAt < windowMs) return;
      buckets.delete(oldest.value[0]);
    }
  };

  const limiter: AuthRateLimiter = (request, _response, next) => {
    const now = clock();
    clearExpired(now);

    const key = request.ip || request.socket.remoteAddress || "unknown";
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
