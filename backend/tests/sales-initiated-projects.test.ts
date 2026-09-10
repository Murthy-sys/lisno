import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { ROLE_CODES } from "../src/domain/roles.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { developmentDemoAuthentication } from "./helpers/development-demo-authentication.js";

const jwtSecret = "sales-initiation-test-secret-at-least-32-characters";
const clock = () => new Date("2026-09-09T10:00:00.000Z");
const input = {
  clientName: "Asha Shah", clientEmail: "asha@example.com", clientMobile: "9000000000",
  projectName: "Asha home", location: "Pune", propertyType: "3BHK",
  budgetMin: 800000, budgetMax: 1200000, nextAction: "Visit",
  nextActionAt: "2026-09-12T10:30:00+05:30", salesManagerId: "selected-manager"
};

function bearer(id = "user-estimator-sales", role = "estimator_sales") {
  return `Bearer ${jwt.sign({ id, role }, jwtSecret, { expiresIn: 900 })}`;
}

function setup() {
  const seed = structuredClone(demoSeedData);
  const manager = seed.users.find(({ id }) => id === "user-admin")!;
  seed.users.push(
    { ...manager, id: "selected-manager", name: "A Selected Manager", email: "selected@example.com", emailNormalized: "selected@example.com", title: "Sales Manager" },
    { ...manager, id: "inactive-manager", name: "Inactive Manager", email: "inactive@example.com", emailNormalized: "inactive@example.com", active: false }
  );
  seed.projects = [];
  seed.leads = [];
  seed.projectAccessGrants = [];
  seed.auditEvents = [];
  const repository = createMemoryRepository(seed);
  const app = createApp({
    repository, auth: { jwtSecret, jwtExpiresInSeconds: 900 }, clock,
    developmentDemoAuthorization: developmentDemoAuthentication()
  });
  return { repository, app, seed };
}

describe("Sales-initiated projects", () => {
  it("owns the linked lead as the authenticated estimator and scopes client representation to the selected manager", async () => {
    const { repository, app } = setup();
    const response = await request(app).post("/api/v1/admin/projects")
      .set("Authorization", bearer()).send(input).expect(201);
    const { id: projectId, lead } = response.body.data;
    expect(response.body.data).toMatchObject({ estimator: { id: "user-estimator-sales" }, lead: { stage: "new_lead" } });
    await expect(repository.findProjectById(projectId)).resolves.toMatchObject({
      assignedEstimatorId: "user-estimator-sales", managerId: null,
      initiatingDesignerId: null, assignedDesignerIds: []
    });
    await expect(repository.findLeadById(lead.id)).resolves.toMatchObject({
      projectId, ownerId: "user-estimator-sales", source: "admin_project"
    });
    await expect(repository.listActiveProjectAccessGrants("selected-manager", "projects"))
      .resolves.toEqual([expect.objectContaining({
        projectId, userId: "selected-manager", source: "admin_initiator", grantedById: "user-estimator-sales"
      })]);
    for (const userId of ["user-admin", "user-estimator-sales"]) {
      await expect(repository.listActiveProjectAccessGrants(userId, "projects")).resolves.toEqual([]);
    }
    const audits = await repository.pageAuditEvents({}, { limit: 20, offset: 0 });
    expect(audits.items).toHaveLength(3);
    expect(audits.items.every(({ actorId }) => actorId === "user-estimator-sales")).toBe(true);
    expect(audits.items).toContainEqual(expect.objectContaining({
      action: "project_access.granted",
      newValues: { projectId, userId: "selected-manager", module: "projects", source: "admin_initiator" }
    }));
    expect(JSON.stringify(audits.items)).not.toMatch(/asha@example|9000000000|800000|1200000/);
    await request(app).get(`/api/v1/admin/projects/${projectId}`)
      .set("Authorization", bearer("selected-manager", "admin")).expect(200);
    await request(app).get(`/api/v1/admin/projects/${projectId}`)
      .set("Authorization", bearer("user-admin", "admin")).expect(404);
    await request(app).get(`/api/v1/leads/${lead.id}`)
      .set("Authorization", bearer()).expect(200);
    for (const path of ["/admin/projects", `/admin/projects/${projectId}`, "/admin/estimators", "/admin/users", "/admin/estimate-client-response-tasks", "/admin/design-plan-response-tasks"]) {
      await request(app).get(`/api/v1${path}`).set("Authorization", bearer()).expect(403);
    }
    await request(app).post("/api/v1/admin/estimate-client-response-tasks/unknown-round/decision")
      .set("Authorization", bearer()).send({ decision: "approve" }).expect(403);
    await request(app).post("/api/v1/admin/design-plan-response-tasks/unknown-round/decision")
      .set("Authorization", bearer()).send({ decision: "approve" }).expect(403);
  });

  it.each([undefined, "missing-manager", "inactive-manager", "user-estimator-sales", "user-super-admin"])(
    "rejects missing, unavailable or wrong-role manager %s without writes", async (salesManagerId) => {
      const { repository, app } = setup();
      const response = await request(app).post("/api/v1/admin/projects")
        .set("Authorization", bearer()).send({ ...input, salesManagerId }).expect(400);
      expect(response.body.error.fields).toEqual({ salesManagerId: "Select an active Sales Manager." });
      await expect(repository.pageAllLeads({}, { limit: 20, offset: 0 })).resolves.toMatchObject({ total: 0 });
      await expect(repository.pageAuditEvents({}, { limit: 20, offset: 0 })).resolves.toMatchObject({ total: 0 });
      await expect(repository.listActiveProjectAccessGrants("selected-manager", "projects")).resolves.toEqual([]);
    }
  );

  it("rejects forged estimator ownership and accepts an explicitly supplied own ID", async () => {
    const { app } = setup();
    const response = await request(app).post("/api/v1/admin/projects")
      .set("Authorization", bearer()).send({ ...input, estimatorId: "other-estimator" }).expect(400);
    expect(response.body.error.fields).toHaveProperty("estimatorId");
    await request(app).post("/api/v1/admin/projects")
      .set("Authorization", bearer()).send({ ...input, estimatorId: "user-estimator-sales" }).expect(201);
  });

  it.each(["admin", "super_admin"] as const)("does not expand %s manager assignment", async (role) => {
    const { app } = setup();
    const id = role === "admin" ? "user-admin" : "user-super-admin";
    const response = await request(app).post("/api/v1/admin/projects")
      .set("Authorization", bearer(id, role))
      .send({ ...input, estimatorId: "user-estimator-sales" }).expect(400);
    expect(response.body.error.fields).toHaveProperty("salesManagerId");
    const { salesManagerId: _, ...withoutManager } = input;
    const missing = await request(app).post("/api/v1/admin/projects")
      .set("Authorization", bearer(id, role)).send(withoutManager).expect(400);
    expect(missing.body.error.fields).toHaveProperty("estimatorId");
  });

  it("exposes only safe active manager options with bounded search and pagination", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/v1/admin/sales-managers?limit=1")
      .set("Authorization", bearer()).expect(200);
    expect(response.body.data).toEqual({
      items: [{ id: "selected-manager", name: "A Selected Manager", email: "selected@example.com", title: "Sales Manager" }],
      pagination: { limit: 1, offset: 0, total: 2, hasMore: true }
    });
    const next = await request(app).get("/api/v1/admin/sales-managers?limit=1&offset=1")
      .set("Authorization", bearer()).expect(200);
    expect(next.body.data.items).toHaveLength(1);
    expect(next.body.data.items[0].id).toBe("user-admin");
    const search = await request(app).get("/api/v1/admin/sales-managers?search=selected@example")
      .set("Authorization", bearer()).expect(200);
    expect(search.body.data.pagination.total).toBe(1);
    const inactive = await request(app).get("/api/v1/admin/sales-managers?search=inactive")
      .set("Authorization", bearer()).expect(200);
    expect(inactive.body.data.items).toEqual([]);
    for (const query of ["limit=51", "offset=-1", "role=super_admin", `search=${"a".repeat(101)}`]) {
      await request(app).get(`/api/v1/admin/sales-managers?${query}`)
        .set("Authorization", bearer()).expect(400);
    }
    await request(app).get("/api/v1/admin/sales-managers").expect(401);
  });

  it.each(ROLE_CODES.filter((role) => !["admin", "super_admin", "estimator_sales"].includes(role)))(
    "denies project initiation and manager discovery to %s", async (role) => {
      const { app, seed } = setup();
      const user = seed.users.find((candidate) => candidate.role === role)!;
      await request(app).post("/api/v1/admin/projects")
        .set("Authorization", bearer(user.id, role)).send(input).expect(403);
      await request(app).get("/api/v1/admin/sales-managers")
        .set("Authorization", bearer(user.id, role)).expect(403);
    }
  );
});
