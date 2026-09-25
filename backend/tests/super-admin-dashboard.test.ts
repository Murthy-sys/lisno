import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp as createApplication } from "../src/app.js";
import { ROLE_CODES } from "../src/domain/roles.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { developmentDemoAuthentication } from "./helpers/development-demo-authentication.js";

const JWT_SECRET = "dashboard-route-test-secret-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };
const clock = () => new Date("2026-08-30T12:34:56.000Z");
const createApp = (repository = createMemoryRepository()) => createApplication({
  repository,
  auth,
  clock,
  developmentDemoAuthorization: developmentDemoAuthentication()
});

function bearer(id: string, role: string): string {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

describe("Super Admin dashboard routes", () => {
  it("protects all reads and denies every non-Super-Admin before repository aggregation", async () => {
    const repository = createMemoryRepository();
    const aggregate = vi.spyOn(repository, "readSuperAdminDashboardOverview");
    const app = createApp(repository);

    await request(app).get("/api/v1/admin/dashboard/overview").expect(401);
    expect(aggregate).not.toHaveBeenCalled();

    for (const role of ROLE_CODES.filter((candidate) => candidate !== "super_admin")) {
      const actor = demoSeedData.users.find((user) => user.role === role);
      expect(actor, `fixture for ${role}`).toBeDefined();
      await request(app)
        .get("/api/v1/admin/dashboard/overview")
        .set("Authorization", bearer(actor!.id, role))
        .expect(403);
    }
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("returns an organization overview with one timestamp, nullable capacity, and no private fields", async () => {
    const response = await request(createApp())
      .get("/api/v1/admin/dashboard/overview?periodDays=30")
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.data).toMatchObject({
      observedAt: "2026-08-30T12:34:56.000Z",
      period: {
        days: 30,
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-08-30T12:34:56.000Z"
      },
      comparison: {
        window: {
          timezone: "UTC",
          current: {
            days: 30,
            startAt: "2026-08-01T00:00:00.000Z",
            endAt: "2026-08-30T12:34:56.000Z"
          },
          previous: {
            days: 30,
            startAt: "2026-07-02T00:00:00.000Z",
            endAt: "2026-07-31T12:34:56.000Z"
          },
          partialFinalDay: true
        }
      },
      workforce: {
        overCapacityWorkers: null,
        capacityAvailable: false
      },
      dataQuality: {
        status: "partial",
        unavailableMetricKeys: expect.arrayContaining(["workforce.capacity"])
      }
    });
    expect(response.body.data.projects.total).toBe(demoSeedData.projects.length);
    expect(response.body.data.clients.registeredAccounts).toBe(
      demoSeedData.users.filter((user) => user.role === "client").length
    );
    expect(response.body.data.comparison.currentBuckets).toHaveLength(30);
    expect(response.body.data.comparison.previousBuckets).toHaveLength(30);
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|tokenHash|storageReference|clientEmail|clientMobile|privateUrl/i
    );
  });

  it("returns bounded pages and rejects unknown or unsafe query values", async () => {
    const app = createApp();
    const authorization = bearer("user-super-admin", "super_admin");
    const projects = await request(app)
      .get("/api/v1/admin/dashboard/projects?limit=1&offset=0&sort=name_asc&periodDays=7")
      .set("Authorization", authorization)
      .expect(200);
    expect(projects.body.data.items).toHaveLength(1);
    expect(projects.body.data.pagination).toMatchObject({ limit: 1, offset: 0 });
    expect(projects.body.data.pagination.total).toBe(demoSeedData.projects.length);

    const workforce = await request(app)
      .get("/api/v1/admin/dashboard/workforce?limit=50&periodDays=90")
      .set("Authorization", authorization)
      .expect(200);
    expect(workforce.body.data.dataQuality.unavailableMetricKeys).toEqual([
      "workforce.activeTaskCount",
      "workforce.assignmentState",
      "workforce.capacity",
      "workforce.completedInPeriod",
      "workforce.kpi",
      "workforce.workload"
    ]);
    expect(workforce.body.data.items.every((item: Record<string, unknown>) =>
      item.capacityAvailable === false && item.capacityEffort === null
    )).toBe(true);

    for (const query of [
      "periodDays=31",
      "limit=51",
      "offset=-1",
      "search=" + "x".repeat(101),
      "moduleStatus=made_up",
      "unknown=value"
    ]) {
      await request(app)
        .get(`/api/v1/admin/dashboard/projects?${query}`)
        .set("Authorization", authorization)
        .expect(400);
    }
  });

  it("accepts the one-year period on overview and projects without changing 7, 30, or 90", async () => {
    const app = createApp();
    const authorization = bearer("user-super-admin", "super_admin");

    const overview = await request(app)
      .get("/api/v1/admin/dashboard/overview?periodDays=365")
      .set("Authorization", authorization)
      .expect(200);
    expect(overview.body.data.period).toEqual({
      days: 365,
      startAt: "2025-08-31T00:00:00.000Z",
      endAt: "2026-08-30T12:34:56.000Z"
    });
    expect(overview.body.data.comparison.window).toMatchObject({
      timezone: "UTC",
      current: { days: 365, startAt: "2025-08-31T00:00:00.000Z", endAt: "2026-08-30T12:34:56.000Z" },
      previous: { days: 365, startAt: "2024-08-31T00:00:00.000Z", endAt: "2025-08-30T12:34:56.000Z" },
      partialFinalDay: true
    });
    expect(overview.body.data.comparison.currentBuckets).toHaveLength(365);
    expect(overview.body.data.comparison.previousBuckets).toHaveLength(365);
    expect(overview.body.data.comparison.currentBuckets.at(-1).date).toBe("2026-08-30");
    expect(overview.body.data.comparison.previousBuckets[0].date).toBe("2024-08-31");

    const projects = await request(app)
      .get("/api/v1/admin/dashboard/projects?periodDays=365&limit=1")
      .set("Authorization", authorization)
      .expect(200);
    expect(projects.body.data.period).toEqual({
      days: 365,
      startAt: "2025-08-31T00:00:00.000Z",
      endAt: "2026-08-30T12:34:56.000Z"
    });

    const expectedStarts: Record<number, string> = {
      7: "2026-08-24T00:00:00.000Z",
      30: "2026-08-01T00:00:00.000Z",
      90: "2026-06-02T00:00:00.000Z"
    };
    for (const days of [7, 30, 90]) {
      for (const endpoint of ["overview", "projects"]) {
        const response = await request(app)
          .get(`/api/v1/admin/dashboard/${endpoint}?periodDays=${days}`)
          .set("Authorization", authorization)
          .expect(200);
        expect(response.body.data.period).toEqual({
          days,
          startAt: expectedStarts[days],
          endAt: "2026-08-30T12:34:56.000Z"
        });
      }
    }

    const defaulted = await request(app)
      .get("/api/v1/admin/dashboard/overview")
      .set("Authorization", authorization)
      .expect(200);
    expect(defaulted.body.data.period.days).toBe(30);
  });

  it("rejects unsupported periods with the existing validation error shape", async () => {
    const app = createApp();
    const authorization = bearer("user-super-admin", "super_admin");
    const baseline = await request(app)
      .get("/api/v1/admin/dashboard/overview?periodDays=31")
      .set("Authorization", authorization)
      .expect(400);
    for (const endpoint of ["overview", "projects", "workforce"]) {
      for (const value of ["60", "400", "0", "abc", "365.5"]) {
        const response = await request(app)
          .get(`/api/v1/admin/dashboard/${endpoint}?periodDays=${value}`)
          .set("Authorization", authorization)
          .expect(400);
        expect(response.body.error.code).toBe(baseline.body.error.code);
        expect(Object.keys(response.body.error).sort()).toEqual(Object.keys(baseline.body.error).sort());
      }
    }
  });

  it("rechecks the sole-active invariant before aggregation", async () => {
    const repository = createMemoryRepository();
    vi.spyOn(repository, "countActiveUsersByRole").mockResolvedValue(2);
    const aggregate = vi.spyOn(repository, "readSuperAdminDashboardOverview");
    const response = await request(createApp(repository))
      .get("/api/v1/admin/dashboard/overview")
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .expect(401);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
    expect(aggregate).not.toHaveBeenCalled();
  });
});
