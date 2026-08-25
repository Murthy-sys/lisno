import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp as createApplication } from "../src/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { AppRepository, UserRecord } from "../src/repositories/types.js";
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
      status: "sent_to_client",
      total: 1_180_000,
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
      status: "sent_to_client",
      total: 1_180_000,
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

  it("locks the staff directory to Super Admin while exposing purpose-built estimator options", async () => {
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
    await request(app).post("/api/v1/admin/projects")
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .send({
        clientName: "Asha", clientEmail: "asha@example.com", clientMobile: "1",
        projectName: "Home", location: "Pune", propertyType: "3BHK",
        budgetMin: 1, budgetMax: 2, nextAction: "Visit",
        nextActionAt: "2026-08-25T10:30:00+05:30",
        estimatorId: "user-estimator-sales"
      }).expect(403);
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
        estimatorId: "Select an active Estimator/Sales user."
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
