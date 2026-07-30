import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";

const app = createApp({
  repository: createMemoryRepository(structuredClone(demoSeedData)),
  auth: { jwtSecret: "cors-test-secret-with-at-least-32-characters", jwtExpiresInSeconds: 900 },
  corsOrigins: ["http://localhost:5173", "https://lisno.example"]
});

describe("CORS", () => {
  it("allows configured origins to preflight estimate-saving PUT requests", async () => {
    const response = await request(app)
      .options("/api/v1/leads/lead-1/estimate")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "PUT");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-methods"]).toContain("PUT");
    expect(response.headers.vary).toContain("Origin");
  });

  it("allows configured origins to preflight estimate drawing DELETE requests", async () => {
    const response = await request(app)
      .options("/api/v1/estimate-design-drawings/drawing-1")
      .set("Origin", "https://lisno.example")
      .set("Access-Control-Request-Method", "DELETE");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://lisno.example");
    expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
  });

  it("does not grant CORS access to an origin outside the parsed allow-list", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://untrusted.example");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
