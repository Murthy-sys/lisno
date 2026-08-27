import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { ApiError, errorHandler } from "../src/middleware/errors.js";

describe("HTTP error middleware", () => {
  function handle(error: unknown) {
    const headers: Record<string, string> = {};
    let status = 0;
    let body: unknown;
    const response = {
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
        return this;
      },
      status(value: number) {
        status = value;
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      }
    } as unknown as Response;
    errorHandler(
      error,
      {} as Request,
      response,
      vi.fn() as unknown as NextFunction
    );
    return { headers, status, body };
  }

  it("keeps fields fourth, applies an integer Retry-After fifth, and preserves the envelope", () => {
    const response = handle(new ApiError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Please try again later.",
      { email: "Wait before retrying." },
      { "Retry-After": "61" }
    ));
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("61");
    expect(response.body).toEqual({
      error: {
        code: "TOO_MANY_ATTEMPTS",
        message: "Please try again later.",
        fields: { email: "Wait before retrying." }
      }
    });
  });

  it("ignores a non-integer Retry-After value", () => {
    const response = handle(new ApiError(
      429,
      "TOO_MANY_ATTEMPTS",
      "Wait.",
      undefined,
      { "Retry-After": "1.5" }
    ));
    expect(response.status).toBe(429);
    expect(response.headers).not.toHaveProperty("retry-after");
    expect(response.body).toEqual({
      error: { code: "TOO_MANY_ATTEMPTS", message: "Wait." }
    });
  });

  it("maps only the Express JSON parse error without echoing parser detail", () => {
    const parserError = Object.assign(
      new SyntaxError('Unexpected token after {"password":"secret"'),
      { status: 400, type: "entity.parse.failed" }
    );
    const response = handle(parserError);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON."
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("password");
  });

  it("keeps arbitrary and lookalike errors generic", () => {
    const errors = [
      new Error("provider secret"),
      Object.assign(new SyntaxError("parser detail"), {
        status: 400,
        type: "different.parse.failure"
      })
    ];

    for (const error of errors) {
      const response = handle(error);
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred."
        }
      });
    }
  });
});
