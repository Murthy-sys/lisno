import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp as createApplication } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository, ProjectStatus, UserRecord } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAdminProjectService } from "../src/services/admin-project.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { developmentDemoAuthentication } from "./helpers/development-demo-authentication.js";

const createApp = (dependencies: Parameters<typeof createApplication>[0]) =>
  createApplication({
    ...dependencies,
    developmentDemoAuthorization: developmentDemoAuthentication()
  });

const JWT_SECRET = "admin-project-test-secret-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };
const clock = () => new Date("2026-08-23T10:00:00.000Z");

function bearer(id: string, role: string): string {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

function projectListSeed() {
  const seed = structuredClone(demoSeedData);
  const admin = seed.users.find(({ id }) => id === "user-admin")!;
  seed.users.push(...["other", "empty"].map((suffix) => ({
    ...admin, id: `user-admin-${suffix}`, email: `${suffix}@projects.test`, emailNormalized: `${suffix}@projects.test`
  })));
  const template = seed.projects[0]!;
  const statuses: ProjectStatus[] = ["planning", "active", "on_hold", "completed"];
  seed.projects = Array.from({ length: 28 }, (_, index) => ({
    ...template,
    id: `project-list-${String(index).padStart(2, "0")}`,
    name: index === 0 ? "alpha" : index === 1 ? "Alpha" : index === 2 ? "beta" :
      index === 23 ? "Willow [A+B]" : index === 24 ? "Hidden [A+B]" : `Project ${index}`,
    clientName: index === 22 ? "Client [A+B]" : `Client ${index}`,
    location: index === 21 ? "[A+B] City" : "Pune",
    status: statuses[index % statuses.length]!,
    createdAt: "2026-09-01T10:00:00.000Z"
  }));
  seed.projectAccessGrants = seed.projects.map((project, index) => ({
    id: `grant-list-${index}`, projectId: project.id,
    userId: index < 24 ? "user-admin" : "user-admin-other",
    module: "projects", source: "admin_initiator", accessRequestId: null,
    grantedById: "user-admin", active: true, grantedAt: template.createdAt,
    revokedAt: null, revokedById: null, revocationReason: null, version: 1,
    createdAt: template.createdAt, updatedAt: template.createdAt
  }));
  seed.projectAccessGrants.push(
    { ...seed.projectAccessGrants[24]!, id: "wrong-module", userId: "user-admin", module: "design" },
    { ...seed.projectAccessGrants[25]!, id: "revoked-grant", userId: "user-admin", active: false, revokedAt: template.createdAt, revokedById: "user-admin", revocationReason: "Scope fixture" },
    { ...seed.projectAccessGrants[26]!, id: "wrong-source", userId: "user-admin", source: "access_request", accessRequestId: "access-list-fixture" }
  );
  seed.leads = [];
  seed.estimateSummaries = [];
  return seed;
}

describe("Admin project collection selection", () => {
  it("paginates over all scoped projects and counts statuses before selection", async () => {
    const app = createApp({ repository: createMemoryRepository(projectListSeed()), auth, clock });
    const list = (query = {}, userId = "user-admin", role = "admin") => request(app)
      .get("/api/v1/admin/projects").query(query).set("Authorization", bearer(userId, role)).expect(200);
    const first = (await list()).body.data;
    expect(first.items).toHaveLength(20);
    expect(first.items[0].id).toBe("project-list-23");
    expect(first.pagination).toEqual({ limit: 20, offset: 0, total: 24, hasMore: true });
    expect(first.statusCounts).toEqual({ all: 24, planning: 6, active: 6, on_hold: 6, completed: 6 });
    const next = (await list({ offset: 20 })).body.data;
    expect(next.items.map(({ id }: { id: string }) => id)).toEqual(["project-list-03", "project-list-02", "project-list-01", "project-list-00"]);
    expect(next.pagination).toEqual({ limit: 20, offset: 20, total: 24, hasMore: false });
    expect(next.statusCounts).toEqual(first.statusCounts);
    const active = (await list({ status: "active", limit: 2, offset: 4 })).body.data;
    expect(active.items.map(({ id }: { id: string }) => id)).toEqual(["project-list-05", "project-list-01"]);
    expect(active.pagination).toEqual({ limit: 2, offset: 4, total: 6, hasMore: false });
    expect(active.statusCounts).toEqual(first.statusCounts);
    const other = (await list({}, "user-admin-other")).body.data;
    expect(other.statusCounts).toEqual({ all: 4, planning: 1, active: 1, on_hold: 1, completed: 1 });
    expect(other.items.every(({ id }: { id: string }) => !first.items.some((item: { id: string }) => item.id === id))).toBe(true);
    const empty = (await list({}, "user-admin-empty")).body.data;
    expect(empty).toEqual({ items: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false }, statusCounts: { all: 0, planning: 0, active: 0, on_hold: 0, completed: 0 } });
    const global = (await list({}, "user-super-admin", "super_admin")).body.data;
    expect(global.pagination.total).toBe(28);
    expect(global.statusCounts).toEqual({ all: 28, planning: 7, active: 7, on_hold: 7, completed: 7 });
  });

  it("searches name, client and city literally without leaking another Admin's matches", async () => {
    const app = createApp({ repository: createMemoryRepository(projectListSeed()), auth, clock });
    const list = (query: Record<string, string | number>) => request(app)
      .get("/api/v1/admin/projects").query(query).set("Authorization", bearer("user-admin", "admin")).expect(200);
    const matches = (await list({ search: "  [a+b]  ", status: "completed" })).body.data;
    expect(matches.items.map(({ id }: { id: string }) => id)).toEqual(["project-list-23"]);
    expect(matches.statusCounts).toEqual({ all: 3, planning: 0, active: 1, on_hold: 1, completed: 1 });
    expect(matches.pagination.total).toBe(1);
    const noStatusMatches = (await list({ search: "[a+b]", status: "planning" })).body.data;
    expect(noStatusMatches.items).toEqual([]);
    expect(noStatusMatches.pagination.total).toBe(0);
    expect(noStatusMatches.statusCounts).toEqual(matches.statusCounts);
    for (const search of ["Hidden", ".*", "^", "\\"]) {
      const empty = (await list({ search })).body.data;
      expect(empty.items).toEqual([]);
      expect(empty.statusCounts.all).toBe(0);
    }
    expect((await list({ search: "  " })).body.data.pagination.total).toBe(24);
    expect((await list({ search: "cLiEnT 20" })).body.data.items[0].id).toBe("project-list-20");
  });

  it("sorts mixed-case names before pagination with stable ID ties", async () => {
    const app = createApp({ repository: createMemoryRepository(projectListSeed()), auth, clock });
    const list = (sort: string, offset = 0) => request(app).get("/api/v1/admin/projects")
      .query({ sort, limit: 2, offset }).set("Authorization", bearer("user-admin", "admin")).expect(200);
    const asc = (await list("name_asc")).body.data;
    expect(asc.items.map(({ id }: { id: string }) => id)).toEqual(["project-list-00", "project-list-01"]);
    expect((await list("name_asc", 2)).body.data.items[0].id).toBe("project-list-02");
    const desc = (await list("name_desc")).body.data;
    expect(desc.items.map(({ id }: { id: string }) => id)).toEqual(["project-list-23", "project-list-09"]);
    expect((await list("name_desc", 22)).body.data.items.map(({ id }: { id: string }) => id)).toEqual(["project-list-00", "project-list-01"]);
    expect(desc.statusCounts).toEqual(asc.statusCounts);
    const pastEnd = (await list("newest", 30)).body.data;
    expect(pastEnd.items).toEqual([]);
    expect(pastEnd.pagination).toEqual({ limit: 2, offset: 30, total: 24, hasMore: false });
  });

  it.each([
    { status: "archived" }, { sort: "cost" }, { search: "a".repeat(121) },
    { unknown: "value" }, { status: ["active", "planning"] }, { search: ["a", "b"] }
  ])("rejects unsupported or malformed selection %j", async (query) => {
    const app = createApp({ repository: createMemoryRepository(projectListSeed()), auth, clock });
    await request(app).get("/api/v1/admin/projects").query(query)
      .set("Authorization", bearer("user-admin", "admin")).expect(400);
  });

  it("keeps list permission enforcement with filters", async () => {
    const app = createApp({ repository: createMemoryRepository(projectListSeed()), auth, clock });
    await request(app).get("/api/v1/admin/projects?search=Client&status=active").expect(401);
    await request(app).get("/api/v1/admin/projects?search=Client&status=active")
      .set("Authorization", bearer("user-estimator-sales", "estimator_sales")).expect(403);
  });
});

describe("Admin-initiated projects", () => {
  it("keeps fallback-assigned Client-response history safe while exposing the task only to its assignee or Super Admin", async () => {
    const seed = structuredClone(demoSeedData);
    seed.projects = seed.projects.filter(({ id }) =>
      ["project-aurora-villa", "project-aurora-studio"].includes(id)
    );
    seed.leads = [
      {
        id: "lead-admin-round",
        ownerId: "user-estimator-sales",
        projectId: "project-aurora-villa",
        clientName: "Rhea Kapoor",
        clientEmail: "client@aurora.example",
        clientMobile: "+91 90000 00000",
        projectName: "Aurora Villa",
        location: "Bengaluru",
        propertyType: "villa",
        budgetMin: 1_000_000,
        budgetMax: 2_000_000,
        source: "admin_project",
        stage: "estimate_sent",
        nextAction: "client estimate decision",
        nextActionAt: "2026-08-25T10:00:00.000Z",
        builder: null,
        areaSqft: null,
        targetHandoverAt: null,
        notes: null,
        latestActivityAt: null,
        createdAt: "2026-08-23T10:00:00.000Z",
        updatedAt: "2026-08-23T10:00:00.000Z"
      },
      {
        id: "lead-admin-legacy",
        ownerId: "user-estimator-sales",
        projectId: "project-aurora-studio",
        clientName: "Rhea Kapoor",
        clientEmail: "client@aurora.example",
        clientMobile: "+91 90000 00000",
        projectName: "Aurora Studio",
        location: "Mumbai",
        propertyType: "studio",
        budgetMin: null,
        budgetMax: null,
        source: "admin_project",
        stage: "estimate_sent",
        nextAction: "client estimate decision",
        nextActionAt: "2026-08-25T10:00:00.000Z",
        builder: null,
        areaSqft: null,
        targetHandoverAt: null,
        notes: null,
        latestActivityAt: null,
        createdAt: "2026-08-23T10:00:00.000Z",
        updatedAt: "2026-08-23T10:00:00.000Z"
      }
    ];
    const safeRound = {
      id: "estimate-client-review-round-safe",
      sendGeneration: 2,
      estimateVersion: 4,
      version: 3,
      deliveryStatus: "sent" as const,
      deliveryAttemptCount: 1,
      deliveredAt: "2026-08-24T09:00:00.000Z",
      status: "pending" as const
    };
    seed.estimateSummaries = [
      {
        id: "estimate-admin-round",
        leadId: "lead-admin-round",
        projectId: "project-aurora-villa",
        status: "sent_to_client",
        total: 1_180_000,
        clientReview: safeRound,
        assignedAdminId: "user-super-admin"
      },
      {
        id: "estimate-admin-legacy",
        leadId: "lead-admin-legacy",
        projectId: "project-aurora-studio",
        status: "sent_to_client",
        total: 590_000,
        clientReview: null,
        assignedAdminId: null
      }
    ];
    seed.projectAccessGrants = seed.projects.map((project, index) => ({
      id: `grant-admin-summary-${index}`,
      projectId: project.id,
      userId: "user-admin",
      module: "projects" as const,
      source: "admin_initiator" as const,
      accessRequestId: null,
      grantedById: "user-admin",
      active: true,
      grantedAt: "2026-08-23T10:00:00.000Z",
      revokedAt: null,
      revokedById: null,
      revocationReason: null,
      version: 1,
      createdAt: "2026-08-23T10:00:00.000Z",
      updatedAt: "2026-08-23T10:00:00.000Z"
    }));
    const app = createApp({ repository: createMemoryRepository(seed), auth, clock });

    const reactivatedInitiator = await request(app)
      .get("/api/v1/admin/projects/project-aurora-villa")
      .set("Authorization", bearer("user-admin", "admin"))
      .expect(200);
    expect(reactivatedInitiator.body.data.estimate).toEqual({
      id: "estimate-admin-round",
      leadId: "lead-admin-round",
      projectId: "project-aurora-villa",
      resolvedProjectId: "project-aurora-villa",
      projectLinkSource: "estimate_and_lead",
      version: 1,
      status: "sent_to_client",
      subtotal: 1_180_000,
      gst: 0,
      total: 1_180_000,
      clientDecisionAt: null,
      clientDecisionSource: null,
      approvedBaseline: null,
      clientReview: safeRound,
      hasPendingClientResponseTask: false,
      designPlanStatus: null,
      designPlanVersion: 0,
      designPlanDesigner: null
    });
    expect(JSON.stringify(reactivatedInitiator.body.data.estimate)).not.toMatch(
      /assignedAdminId|recipient|decisionNote|storageReference|filename|proof/i
    );

    const superAdmin = await request(app)
      .get("/api/v1/admin/projects/project-aurora-villa")
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .expect(200);
    expect(superAdmin.body.data.estimate).toEqual({
      id: "estimate-admin-round",
      leadId: "lead-admin-round",
      projectId: "project-aurora-villa",
      resolvedProjectId: "project-aurora-villa",
      projectLinkSource: "estimate_and_lead",
      version: 1,
      status: "sent_to_client",
      subtotal: 1_180_000,
      gst: 0,
      total: 1_180_000,
      clientDecisionAt: null,
      clientDecisionSource: null,
      approvedBaseline: null,
      clientReview: safeRound,
      hasPendingClientResponseTask: true,
      designPlanStatus: null,
      designPlanVersion: 0,
      designPlanDesigner: null
    });
    expect(JSON.stringify(superAdmin.body.data.estimate)).not.toMatch(
      /assignedAdminId|recipient|decisionNote|storageReference|filename|proof/i
    );

    for (const [id, role] of [
      ["user-admin", "admin"],
      ["user-super-admin", "super_admin"]
    ] as const) {
      const legacy = await request(app)
        .get("/api/v1/admin/projects/project-aurora-studio")
        .set("Authorization", bearer(id, role))
        .expect(200);
      expect(legacy.body.data.estimate).toMatchObject({
        clientReview: null,
        hasPendingClientResponseTask: false
      });
    }

    seed.estimateSummaries[0]!.assignedAdminId = "user-admin";
    const assignedApp = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock
    });
    const assignedInitiator = await request(assignedApp)
      .get("/api/v1/admin/projects/project-aurora-villa")
      .set("Authorization", bearer("user-admin", "admin"))
      .expect(200);
    expect(assignedInitiator.body.data.estimate).toMatchObject({
      clientReview: safeRound,
      hasPendingClientResponseTask: true
    });
    expect(JSON.stringify(assignedInitiator.body.data.estimate)).not.toContain(
      "assignedAdminId"
    );

    const terminalRound = {
      ...safeRound,
      version: 4,
      status: "approved" as const
    };
    seed.estimateSummaries[0] = {
      ...seed.estimateSummaries[0]!,
      clientReview: terminalRound,
      assignedAdminId: "user-admin"
    };
    const terminalApp = createApp({
      repository: createMemoryRepository(seed),
      auth,
      clock
    });
    for (const [id, role] of [
      ["user-admin", "admin"],
      ["user-super-admin", "super_admin"]
    ] as const) {
      const terminal = await request(terminalApp)
        .get("/api/v1/admin/projects/project-aurora-villa")
        .set("Authorization", bearer(id, role))
        .expect(200);
      expect(terminal.body.data.estimate).toMatchObject({
        clientReview: terminalRound,
        hasPendingClientResponseTask: false
      });
    }
  });

  it("returns deterministic approved Estimate lineage for Lead-only and direct-only projects", async () => {
    const seed = structuredClone(demoSeedData);
    seed.projects = seed.projects.filter(({ id }) =>
      ["project-aurora-villa", "project-aurora-studio"].includes(id)
    );
    seed.leads = [{
      id: "lead-approved-legacy",
      ownerId: "user-estimator-sales",
      projectId: "project-aurora-villa",
      clientName: "Rhea Kapoor",
      clientEmail: "client@aurora.example",
      clientMobile: "+91 90000 00000",
      projectName: "Aurora Villa",
      location: "Bengaluru",
      propertyType: "villa",
      budgetMin: 200_000,
      budgetMax: 300_000,
      source: "legacy",
      stage: "won",
      nextAction: "Assign Designer",
      nextActionAt: "2026-08-27T10:00:00.000Z",
      builder: null,
      areaSqft: null,
      targetHandoverAt: null,
      notes: null,
      latestActivityAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
      updatedAt: "2026-08-26T10:00:00.000Z"
    }];
    seed.estimateSummaries = [
      {
        id: "estimate-approved-lead-only",
        leadId: "lead-approved-legacy",
        projectId: null,
        version: 5,
        status: "client_approved",
        subtotal: 236_190,
        gst: 42_514,
        total: 278_704,
        clientDecisionAt: "2026-08-26T09:00:00.000Z",
        clientDecisionSource: "admin_proof",
        approvedBaseline: {
          estimateVersion: 4,
          reviewRoundId: "round-approved-lead-only",
          subtotal: 236_190,
          gst: 42_514,
          total: 278_704,
          decisionAt: "2026-08-26T09:00:00.000Z",
          decisionSource: "admin_proof"
        },
        clientReview: null,
        assignedAdminId: "user-super-admin",
        designPlanStatus: "pending_assignment",
        designPlanVersion: 0,
        designPlanDesignerId: null,
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-26T09:00:00.000Z"
      },
      {
        id: "estimate-approved-direct-only",
        leadId: "lead-not-migrated",
        projectId: "project-aurora-studio",
        version: 8,
        status: "client_approved",
        subtotal: 500_000,
        gst: 90_000,
        total: 590_000,
        clientDecisionAt: "2026-08-25T09:00:00.000Z",
        clientDecisionSource: "client_portal",
        approvedBaseline: {
          estimateVersion: 7,
          reviewRoundId: "round-approved-direct-only",
          subtotal: 500_000,
          gst: 90_000,
          total: 590_000,
          decisionAt: "2026-08-25T09:00:00.000Z",
          decisionSource: "client_portal"
        },
        clientReview: null,
        assignedAdminId: null,
        designPlanStatus: "assigned",
        designPlanVersion: 0,
        designPlanDesignerId: null,
        createdAt: "2026-08-19T10:00:00.000Z",
        updatedAt: "2026-08-25T09:00:00.000Z"
      }
    ];
    const app = createApp({ repository: createMemoryRepository(seed), auth, clock });

    const legacy = await request(app)
      .get("/api/v1/admin/projects/project-aurora-villa")
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .expect(200);
    expect(legacy.body.data.estimate).toMatchObject({
      id: "estimate-approved-lead-only",
      leadId: "lead-approved-legacy",
      projectId: null,
      resolvedProjectId: "project-aurora-villa",
      projectLinkSource: "lead",
      version: 5,
      subtotal: 236_190,
      gst: 42_514,
      total: 278_704,
      clientDecisionAt: "2026-08-26T09:00:00.000Z",
      clientDecisionSource: "admin_proof",
      approvedBaseline: {
        estimateVersion: 4,
        reviewRoundId: "round-approved-lead-only",
        subtotal: 236_190,
        gst: 42_514,
        total: 278_704,
        decisionAt: "2026-08-26T09:00:00.000Z",
        decisionSource: "admin_proof"
      }
    });

    const direct = await request(app)
      .get("/api/v1/admin/projects/project-aurora-studio")
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .expect(200);
    expect(direct.body.data).toMatchObject({
      lead: null,
      estimate: {
        id: "estimate-approved-direct-only",
        leadId: "lead-not-migrated",
        projectId: "project-aurora-studio",
        resolvedProjectId: "project-aurora-studio",
        projectLinkSource: "estimate",
        version: 8,
        subtotal: 500_000,
        gst: 90_000,
        total: 590_000,
        clientDecisionAt: "2026-08-25T09:00:00.000Z",
        clientDecisionSource: "client_portal",
        approvedBaseline: {
          estimateVersion: 7,
          reviewRoundId: "round-approved-direct-only",
          subtotal: 500_000,
          gst: 90_000,
          total: 590_000,
          decisionAt: "2026-08-25T09:00:00.000Z",
          decisionSource: "client_portal"
        }
      }
    });
  });

  it("rejects an Admin project whose approved Estimate and Lead resolve to different projects", async () => {
    const seed = structuredClone(demoSeedData);
    seed.projects = seed.projects.filter(({ id }) =>
      ["project-aurora-villa", "project-aurora-studio"].includes(id)
    );
    seed.leads = [{
      id: "lead-conflicting-project",
      ownerId: "user-estimator-sales",
      projectId: "project-aurora-villa",
      clientName: "Rhea Kapoor",
      clientEmail: "client@aurora.example",
      clientMobile: "+91 90000 00000",
      projectName: "Aurora Villa",
      location: "Bengaluru",
      propertyType: "villa",
      budgetMin: null,
      budgetMax: null,
      source: "legacy",
      stage: "won",
      nextAction: "Assign Designer",
      nextActionAt: "2026-08-27T10:00:00.000Z",
      builder: null,
      areaSqft: null,
      targetHandoverAt: null,
      notes: null,
      latestActivityAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
      updatedAt: "2026-08-26T10:00:00.000Z"
    }];
    seed.estimateSummaries = [{
      id: "estimate-conflicting-project",
      leadId: "lead-conflicting-project",
      projectId: "project-aurora-studio",
      version: 3,
      status: "client_approved",
      subtotal: 100_000,
      gst: 18_000,
      total: 118_000,
      clientDecisionAt: "2026-08-26T09:00:00.000Z",
      clientDecisionSource: "client_portal",
      clientReview: null,
      assignedAdminId: null,
      designPlanStatus: "pending_assignment",
      designPlanVersion: 0,
      designPlanDesignerId: null,
      createdAt: "2026-08-20T10:00:00.000Z",
      updatedAt: "2026-08-26T09:00:00.000Z"
    }];
    const app = createApp({ repository: createMemoryRepository(seed), auth, clock });

    const response = await request(app)
      .get("/api/v1/admin/projects/project-aurora-studio")
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .expect(409);
    expect(response.body).toEqual({
      error: {
        code: "FINANCE_ESTIMATE_PROJECT_LINK_CONFLICT",
        message: "An approved Estimate is linked to different projects through its Estimate and Lead."
      }
    });
  });

  it("atomically initiates and returns the Admin-scoped project handoff", async () => {
    const seed = structuredClone(demoSeedData);
    seed.projects = [];
    seed.leads = [];
    seed.projectAccessGrants = [];
    seed.auditEvents = [];
    const repository = createMemoryRepository(seed);
    const app = createApp({ repository, auth, clock });

    const response = await request(app)
      .post("/api/v1/admin/projects")
      .set("Authorization", bearer("user-admin", "admin"))
      .send({
        clientName: "Asha Shah",
        clientEmail: "ASHA@example.com",
        clientMobile: "+91 90000 00000",
        projectName: "Asha home",
        location: "Pune",
        propertyType: "3BHK",
        budgetMin: 800000,
        budgetMax: 1200000,
        nextAction: "Schedule site visit",
        nextActionAt: "2026-08-25T10:30:00+05:30",
        estimatorId: "user-estimator-sales"
      })
      .expect(201);

    expect(response.body.data).toMatchObject({
      name: "Asha home",
      estimator: { id: "user-estimator-sales" },
      lead: { stage: "new_lead" },
      estimate: null
    });
    const projects = await repository.listProjectsForUserInModule(
      (await repository.findUserById("user-admin"))!,
      "projects"
    );
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      initiatingDesignerId: null,
      assignedEstimatorId: "user-estimator-sales",
      assignedDesignerIds: [],
      managerId: null,
      status: "planning"
    });
    expect(
      new Date(projects[0]!.plannedEndAt).getTime() -
        new Date(projects[0]!.plannedStartAt).getTime()
    ).toBe(90 * 24 * 60 * 60 * 1000);
    await expect(repository.findLeadById(response.body.data.lead.id)).resolves.toMatchObject({
      projectId: projects[0]!.id,
      ownerId: "user-estimator-sales",
      source: "admin_project"
    });
    await expect(repository.listActiveProjectAccessGrants("user-admin", "projects"))
      .resolves.toEqual([expect.objectContaining({
        projectId: projects[0]!.id,
        userId: "user-admin",
        source: "admin_initiator",
        active: true
      })]);
    const audits = await repository.pageAuditEvents({}, { limit: 20, offset: 0 });
    const initiationAudits = audits.items.filter(
      ({ occurredAt }) => occurredAt === clock().toISOString()
    );
    expect(initiationAudits).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "project_created", newValues: {
          status: "planning", assignedEstimatorId: "user-estimator-sales"
        }}),
        expect.objectContaining({ action: "project_access.granted", newValues: {
          projectId: projects[0]!.id,
          userId: "user-admin",
          module: "projects",
          source: "admin_initiator"
        }}),
        expect.objectContaining({ action: "lead_created", newValues: {
          stage: "new_lead", projectId: projects[0]!.id,
          ownerId: "user-estimator-sales"
        }})
      ]));
    expect(JSON.stringify(initiationAudits)).not.toMatch(
      /asha@example|90000 00000|schedule site visit|800000|1200000/i
    );
  });

  it("rejects unsafe initiation inputs and hides another Admin's project", async () => {
    const seed = structuredClone(demoSeedData);
    const otherAdmin = {
      ...structuredClone(seed.users.find((user) => user.id === "user-admin")!),
      id: "user-admin-other",
      email: "other-admin@example.com",
      emailNormalized: "other-admin@example.com"
    };
    seed.users.push(otherAdmin);
    const repository = createMemoryRepository(seed);
    const app = createApp({ repository, auth, clock });
    const base = {
      clientName: "Asha Shah", clientEmail: "asha@example.com", clientMobile: "9000000000",
      projectName: "Asha home", location: "Pune", propertyType: "3BHK",
      budgetMin: 1200000, budgetMax: 800000, nextAction: "Visit",
      nextActionAt: "2026-08-25T10:30:00", estimatorId: "user-estimator-sales",
      source: "forged"
    };
    const invalid = await request(app).post("/api/v1/admin/projects")
      .set("Authorization", bearer("user-admin", "admin")).send(base).expect(400);
    expect(invalid.body.error.fields).toMatchObject({ source: expect.any(String) });

    const detail = await request(app).get("/api/v1/admin/projects/project-aurora-villa")
      .set("Authorization", bearer(otherAdmin.id, "admin")).expect(404);
    expect(detail.body.error.code).toBe("NOT_FOUND");
  });

  it("locks the staff directory to Super Admin, exposes estimator options, and lets Super Admin initiate", async () => {
    const repository = createMemoryRepository(structuredClone(demoSeedData));
    const app = createApp({ repository, auth, clock });
    await request(app).get("/api/v1/admin/users")
      .set("Authorization", bearer("user-admin", "admin")).expect(403);
    const response = await request(app).get("/api/v1/admin/estimators?search=sales")
      .set("Authorization", bearer("user-admin", "admin")).expect(200);
    expect(response.body.data.items).toEqual([
      expect.objectContaining({ id: "user-estimator-sales" })
    ]);
    expect(JSON.stringify(response.body)).not.toContain("mobile");
    expect(JSON.stringify(response.body)).not.toContain("address");
    const initiated = await request(app).post("/api/v1/admin/projects")
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .send({
        clientName: "Asha", clientEmail: "asha@example.com", clientMobile: "1",
        projectName: "Home", location: "Pune", propertyType: "3BHK",
        budgetMin: 1, budgetMax: 2, nextAction: "Visit",
        nextActionAt: "2026-08-25T10:30:00+05:30",
        estimatorId: "user-estimator-sales"
      }).expect(201);
    await expect(
      repository.listActiveProjectAccessGrants("user-super-admin", "projects")
    ).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        projectId: initiated.body.data.id,
        source: "admin_initiator",
        active: true
      })
    ]));
  });

  it("returns field-addressable errors for the strict initiation contract and safe estimator validation", async () => {
    const seed = structuredClone(demoSeedData);
    const estimator = seed.users.find((user) => user.id === "user-estimator-sales")!;
    seed.users.push(
      { ...estimator, id: "inactive-estimator", email: "inactive@example.com", emailNormalized: "inactive@example.com", active: false },
      { ...estimator, id: "wrong-role-estimator", email: "wrong@example.com", emailNormalized: "wrong@example.com", role: "designer" }
    );
    const app = createApp({ repository: createMemoryRepository(seed), auth, clock });
    const valid = {
      clientName: "Asha Shah", clientEmail: "asha@example.com", clientMobile: "9000000000",
      projectName: "Asha home", location: "Pune", propertyType: "3BHK",
      budgetMin: 800000, budgetMax: 1200000, nextAction: "Visit",
      nextActionAt: "2026-08-25T10:30:00+05:30", estimatorId: estimator.id
    };
    const invalidCases: Array<[Record<string, unknown>, string]> = [
      [Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "estimatorId")), "estimatorId"],
      [{ ...valid, source: "forged" }, "source"],
      [{ ...valid, budgetMin: -1 }, "budgetMin"],
      [{ ...valid, budgetMax: 1 }, "budgetMax"],
      [{ ...valid, nextActionAt: "2026-08-25T10:30:00" }, "nextActionAt"]
    ];
    for (const [body, field] of invalidCases) {
      const response = await request(app).post("/api/v1/admin/projects")
        .set("Authorization", bearer("user-admin", "admin"))
        .send(body).expect(400);
      expect(response.body.error.fields).toHaveProperty(field);
    }
    for (const estimatorId of ["missing-estimator", "inactive-estimator", "wrong-role-estimator"]) {
      const response = await request(app).post("/api/v1/admin/projects")
        .set("Authorization", bearer("user-admin", "admin"))
        .send({ ...valid, estimatorId }).expect(400);
      expect(response.body.error.fields).toEqual({
        estimatorId: "Select an active Sales user."
      });
    }
  });

  it.each([
    ["createProject", 0],
    ["createProjectAccessGrant", 0],
    ["createLead", 0],
    ["appendAuditEvent", 1],
    ["appendAuditEvent", 2],
    ["appendAuditEvent", 3]
  ] as const)("rolls back every write when %s failure point %s throws", async (method, auditFailureAt) => {
    const seed = structuredClone(demoSeedData);
    seed.projects = [];
    seed.leads = [];
    seed.projectAccessGrants = [];
    seed.auditEvents = [];
    const base = createMemoryRepository(seed);
    let auditCalls = 0;
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        if (property !== "runInTransaction") return Reflect.get(target, property, receiver);
        return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
          target.runInTransaction((transaction) => operation(new Proxy(transaction, {
            get(inner, key, innerReceiver) {
              if (key === method) {
                if (key !== "appendAuditEvent") {
                  return async () => { throw new Error(`injected ${String(key)} failure`); };
                }
                return async (...args: unknown[]) => {
                  auditCalls += 1;
                  if (auditCalls === auditFailureAt) throw new Error("injected audit failure");
                  return (inner.appendAuditEvent as (...values: unknown[]) => unknown)(...args);
                };
              }
              return Reflect.get(inner, key, innerReceiver);
            }
          })));
      }
    });
    const service = createAdminProjectService(repository, createAuditService(repository), clock);
    const admin = (await base.findUserById("user-admin")) as UserRecord;
    await expect(service.initiate({
      id: admin.id, name: admin.name, email: admin.email, role: admin.role
    }, {
      clientName: "Asha Shah", clientEmail: "asha@example.com", clientMobile: "9000000000",
      projectName: "Asha home", location: "Pune", propertyType: "3BHK",
      budgetMin: 800000, budgetMax: 1200000, nextAction: "Visit",
      nextActionAt: "2026-08-25T10:30:00+05:30", estimatorId: "user-estimator-sales"
    })).rejects.toThrow(/injected/);
    const superAdmin = (await base.findUserById("user-super-admin"))!;
    await expect(base.pageAdminProjects(superAdmin, { limit: 20, offset: 0 }))
      .resolves.toMatchObject({ total: 0, items: [] });
    await expect(base.listActiveProjectAccessGrants(admin.id, "projects")).resolves.toEqual([]);
    await expect(base.pageAllLeads({}, { limit: 20, offset: 0 }))
      .resolves.toMatchObject({ total: 0, items: [] });
    await expect(base.pageAuditEvents({}, { limit: 20, offset: 0 }))
      .resolves.toMatchObject({ total: 0, items: [] });
  });
});
