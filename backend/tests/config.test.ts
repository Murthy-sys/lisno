import { describe, expect, it } from "vitest";

import { loadEnvironment } from "../src/config/env.js";

const OCR_WORKER_TOKEN = "config-worker-token-with-at-least-32-characters";

describe("environment authentication configuration", () => {
  it("fails closed when JWT_SECRET is missing", () => {
    expect(() => loadEnvironment({})).toThrow();
  });

  it("rejects a weak JWT_SECRET", () => {
    expect(() =>
      loadEnvironment({
        JWT_SECRET: "development-only-secret",
        OCR_WORKER_TOKEN
      })
    ).toThrow();
  });

  it("accepts an explicitly supplied strong JWT_SECRET", () => {
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN
      }).JWT_SECRET
    ).toBe("runtime-secret-with-at-least-32-characters");
  });

  it("parses local MongoDB origins into a CORS allow-list", () => {
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        CORS_ORIGIN: "http://localhost:5173, https://lisno.example"
      }).CORS_ORIGIN
    ).toEqual(["http://localhost:5173", "https://lisno.example"]);
  });

  it("loads a positive configurable upload size in megabytes", () => {
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        MAX_UPLOAD_MB: "12.5"
      }).MAX_UPLOAD_MB
    ).toBe(12.5);

    expect(() =>
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        MAX_UPLOAD_MB: "0"
      })
    ).toThrow();
  });

  it("loads a positive OCR lease duration and defaults it to five minutes", () => {
    const env = loadEnvironment({
      JWT_SECRET: "runtime-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN
    });
    expect(env.OCR_LEASE_SECONDS).toBe(300);

    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        OCR_LEASE_SECONDS: "30"
      }).OCR_LEASE_SECONDS
    ).toBe(30);

    expect(() =>
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN,
        OCR_LEASE_SECONDS: "0"
      })
    ).toThrow();
  });

  it("requires a separate strong OCR worker token", () => {
    expect(() =>
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters"
      })
    ).toThrow();
    expect(() =>
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN: "weak-worker-token"
      })
    ).toThrow();
    expect(
      loadEnvironment({
        JWT_SECRET: "runtime-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN
      }).OCR_WORKER_TOKEN
    ).toBe(OCR_WORKER_TOKEN);
  });
});
