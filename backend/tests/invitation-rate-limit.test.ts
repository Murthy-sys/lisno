import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  createInvitationDeliveryRateLimit,
  createInvitationPublicRateLimit
} from "../src/middleware/invitation-rate-limit.js";
import { ApiError } from "../src/middleware/errors.js";

function requestFor(address: string, actorId?: string): Request {
  return {
    socket: { remoteAddress: address },
    ...(actorId
      ? { authenticatedUser: { id: actorId, name: actorId, email: `${actorId}@example.com`, role: "super_admin" } }
      : {})
  } as unknown as Request;
}

function invoke(
  limiter: ReturnType<typeof createInvitationPublicRateLimit>,
  request: Request
): ApiError | undefined {
  let error: ApiError | undefined;
  limiter(request, {} as Response, ((value?: unknown) => {
    error = value as ApiError | undefined;
  }) as NextFunction);
  return error;
}

describe("invitation rate limits", () => {
  it("allows exactly 20 public attempts per direct socket IP in 15 minutes", () => {
    let now = 0;
    const limiter = createInvitationPublicRateLimit({ clock: () => now });
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      expect(invoke(limiter, requestFor("203.0.113.10")), `attempt ${attempt}`).toBeUndefined();
    }
    const limited = invoke(limiter, requestFor("203.0.113.10"));
    expect(limited).toMatchObject({
      status: 429,
      code: "TOO_MANY_ATTEMPTS",
      headers: { "Retry-After": "900" }
    });
    expect(invoke(limiter, requestFor("203.0.113.11"))).toBeUndefined();

    now = 900_000;
    expect(invoke(limiter, requestFor("203.0.113.10"))).toBeUndefined();
  });

  it("keys delivery attempts by actor and direct socket without sharing login state", () => {
    const limiter = createInvitationDeliveryRateLimit({ clock: () => 0 });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(invoke(limiter, requestFor("203.0.113.20", "actor-a"))).toBeUndefined();
    }
    expect(invoke(limiter, requestFor("203.0.113.20", "actor-a"))).toBeInstanceOf(ApiError);
    expect(invoke(limiter, requestFor("203.0.113.20", "actor-b"))).toBeUndefined();
    expect(invoke(limiter, requestFor("203.0.113.21", "actor-a"))).toBeUndefined();

    const unauthenticated = invoke(limiter, requestFor("203.0.113.20"));
    expect(unauthenticated).toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
  });

  it("ceilings remaining seconds for Retry-After", () => {
    let now = 0;
    const limiter = createInvitationPublicRateLimit({
      windowMs: 60_000,
      maxAttempts: 1,
      clock: () => now
    });
    expect(invoke(limiter, requestFor("203.0.113.30"))).toBeUndefined();
    now = 1;
    expect(invoke(limiter, requestFor("203.0.113.30"))?.headers).toEqual({
      "Retry-After": "60"
    });
    now = 59_001;
    expect(invoke(limiter, requestFor("203.0.113.30"))?.headers).toEqual({
      "Retry-After": "1"
    });
  });

  it("evicts the oldest bucket at the 10,000-entry bound", () => {
    const limiter = createInvitationPublicRateLimit({
      maxAttempts: 1,
      clock: () => 0
    }) as ReturnType<typeof createInvitationPublicRateLimit> & {
      activeBucketCount(): number;
    };
    for (let index = 0; index < 10_001; index += 1) {
      expect(invoke(limiter, requestFor(`198.51.${Math.floor(index / 256)}.${index % 256}`))).toBeUndefined();
    }
    expect(limiter.activeBucketCount()).toBe(10_000);
    expect(invoke(limiter, requestFor("198.51.0.0"))).toBeUndefined();
  });

  it("validates limiter options", () => {
    for (const options of [
      { windowMs: 0 },
      { maxAttempts: 0 },
      { maxEntries: 0 },
      { windowMs: 1.5 },
      { maxAttempts: 1.5 },
      { maxEntries: 1.5 }
    ]) {
      expect(() => createInvitationPublicRateLimit({ ...options, clock: vi.fn(() => 0) }))
        .toThrow();
    }
  });
});
