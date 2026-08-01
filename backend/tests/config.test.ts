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

  it("loads the bounded extraction retry policy defaults", () => {
    const env = loadEnvironment({
      JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN: "config-worker-token-with-at-least-32-characters"
    });
    expect(env.OCR_MAX_ATTEMPTS).toBe(5);
    expect(env.OCR_RETRY_INITIAL_SECONDS).toBe(30);
    expect(env.OCR_RETRY_MAX_SECONDS).toBe(900);
  });

  it("rejects an extraction retry cap below its initial delay", () => {
    expect(() => loadEnvironment({
      JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN: "config-worker-token-with-at-least-32-characters",
      OCR_RETRY_INITIAL_SECONDS: "60",
      OCR_RETRY_MAX_SECONDS: "30"
    })).toThrow("OCR_RETRY_MAX_SECONDS");
  });

  it("loads a bounded OCR confidence floor and defaults it to 0.2", () => {
    expect(loadEnvironment({
      JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN
    }).OCR_CONFIDENCE_FLOOR).toBe(0.2);
    expect(loadEnvironment({
      JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN,
      OCR_CONFIDENCE_FLOOR: "0.35"
    }).OCR_CONFIDENCE_FLOOR).toBe(0.35);
    expect(() => loadEnvironment({
      JWT_SECRET: "config-jwt-secret-with-at-least-32-characters",
      OCR_WORKER_TOKEN,
      OCR_CONFIDENCE_FLOOR: "1.1"
    })).toThrow();
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
