import type { RequestHandler } from "express";

import { ApiError } from "./errors.js";

export interface AuthRateLimitOptions {
  windowMs: number;
  maxAttempts: number;
  clock: () => number;
}

interface Bucket {
  startedAt: number;
  attempts: number;
}

export function createAuthRateLimit({
  windowMs,
  maxAttempts,
  clock
}: AuthRateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (request, _response, next) => {
    const now = clock();
    for (const [key, bucket] of buckets) {
      if (now - bucket.startedAt >= windowMs) buckets.delete(key);
    }

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

    buckets.set(key, { startedAt: now, attempts: 1 });
    next();
  };
}
