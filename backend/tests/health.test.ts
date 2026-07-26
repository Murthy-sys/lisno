import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("GET /api/v1/health", () => {
  it("returns API health", async () => {
    const response = await request(
      createApp({
        auth: {
          jwtSecret: "health-test-secret-with-enough-entropy",
          jwtExpiresInSeconds: 900
        }
      })
    ).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ok" } });
  });
});
