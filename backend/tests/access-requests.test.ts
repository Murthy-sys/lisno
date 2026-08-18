import { once } from "node:events";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp as createApplication } from "../src/app.js";
import type { Role } from "../src/contracts/domain.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type {
  AccessRequestRecord,
  AppRepository,
  SeedData,
  UserRecord
} from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { developmentDemoAuthentication } from "./helpers/development-demo-authentication.js";

const createApp = (dependencies: Parameters<typeof createApplication>[0]) =>
  createApplication({
    ...dependencies,
    developmentDemoAuthorization: developmentDemoAuthentication()
  });

const JWT_SECRET = "access-request-test-secret-with-at-least-32-characters";
const auth = { jwtSecret: JWT_SECRET, jwtExpiresInSeconds: 900 };
const clock = () => new Date("2026-08-17T10:00:00.000Z");

function bearer(id: string, role: Role): string {
  return `Bearer ${jwt.sign({ id, role }, JWT_SECRET, { expiresIn: 900 })}`;
}

function addUser(
  seed: SeedData,
  id: string,
  role: Role,
  overrides: Partial<UserRecord> = {}
): UserRecord {
  const template = structuredClone(seed.users[0]!);
  const user: UserRecord = {
    ...template,
    id,
    name: id,
    email: `${id}@access.lisno.example`,
    emailNormalized: `${id}@access.lisno.example`,
    role,
    active: true,
    accountKind: "standard",
    managerId: null,
    authorizedClientIds: [],
    ...overrides
  };
  seed.users.push(user);
  return user;
}

function setup(
  rateLimit: { windowMs?: number; maxAttempts?: number; maxEntries?: number } = {},
  corsOrigins?: readonly string[]
) {
  const seed = structuredClone(demoSeedData);
  addUser(seed, "user-requester-two", "designer");
  addUser(seed, "user-requester-three", "designer");
  addUser(seed, "user-super-admin", "super_admin");
  addUser(seed, "user-super-admin-two", "super_admin");
  addUser(seed, "user-admin", "admin");
  addUser(seed, "user-procurement", "procurement");
  addUser(seed, "user-inactive-requester", "designer", { active: false });
  const repository = createMemoryRepository(seed);
  const findProjectById = vi.spyOn(repository, "findProjectById");
  const app = createApp({
    repository,
    auth,
    clock,
    accessRequestRateLimit: rateLimit,
    ...(corsOrigins ? { corsOrigins } : {})
  });
  return { app, repository, findProjectById };
}

const validBody = {
  projectId: "project-aurora-villa",
  module: "design",
  reason: "Need design access."
} as const;

describe("access-request opaque submission", () => {
  it("keeps visible, hidden-existing, unknown, and duplicate-unknown receipts observably equivalent", async () => {
    const { app, repository, findProjectById } = setup(
      {},
      ["https://console.lisno.example"]
    );
    const visible = await repository.findProjectById("project-aurora-villa");
    const hidden = await repository.findProjectById("project-aurora-studio");
    expect(visible).toMatchObject({
      id: "project-aurora-villa",
      initiatingDesignerId: "user-designer-ananya",
      assignedDesignerIds: expect.arrayContaining(["user-designer-ananya"])
    });
    expect(hidden).toMatchObject({
      id: "project-aurora-studio",
      initiatingDesignerId: "user-designer-kabir",
      assignedDesignerIds: ["user-designer-kabir"]
    });
    expect(hidden?.initiatingDesignerId).not.toBe("user-designer-ananya");
    expect(hidden?.assignedDesignerIds).not.toContain("user-designer-ananya");
    findProjectById.mockClear();

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const token = bearer("user-designer-ananya", "designer");
      const responses = [];
      for (const projectId of [
        "project-aurora-villa",
        "project-aurora-studio",
        "project-does-not-exist",
        "project-does-not-exist"
      ]) {
        responses.push(
          await request(server)
            .post("/api/v1/access-requests")
            .set("Origin", "https://console.lisno.example")
            .set("Authorization", token)
            .send({ ...validBody, projectId })
        );
      }

      const corsSafelistedHeaderNames = [
        "cache-control",
        "content-language",
        "content-length",
        "content-type",
        "expires",
        "last-modified",
        "pragma"
      ] as const;
      const observableReceipt = (response: (typeof responses)[number]) => {
        const exposedHeaderNames = String(
          response.headers["access-control-expose-headers"] ?? ""
        )
          .split(",")
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean);
        const headerNames = new Set<string>([
          ...corsSafelistedHeaderNames,
          "vary",
          ...Object.keys(response.headers).filter((name) =>
            name.startsWith("access-control-")
          ),
          ...(exposedHeaderNames.includes("*")
            ? Object.keys(response.headers)
            : exposedHeaderNames)
        ]);
        return {
          status: response.status,
          body: response.body,
          bodyKeys: Object.keys(response.body),
          dataKeys: Object.keys(response.body.data ?? {}),
          contentType: response.headers["content-type"],
          corsVisibleHeaders: Object.fromEntries(
            [...headerNames].sort().map((name) => [
              name,
              response.headers[name] ?? null
            ])
          )
        };
      };
      const receipts = responses.map(observableReceipt);
      expect(receipts[0]).toMatchObject({
        status: 202,
        body: { data: { accepted: true } },
        bodyKeys: ["data"],
        dataKeys: ["accepted"],
        contentType: "application/json; charset=utf-8",
        corsVisibleHeaders: {
          "access-control-allow-origin": "https://console.lisno.example",
          "access-control-allow-methods":
            "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
          "access-control-allow-headers": "Authorization,Content-Type",
          vary: "Origin"
        }
      });
      for (const receipt of receipts.slice(1)) {
        expect(receipt).toEqual(receipts[0]);
      }

      const noOriginControl = await request(server)
        .post("/api/v1/access-requests")
        .set("Authorization", token)
        .send({ ...validBody, projectId: "project-does-not-exist" });
      expect(observableReceipt(noOriginControl)).toMatchObject({
        status: 202,
        body: { data: { accepted: true } }
      });
      expect(observableReceipt(noOriginControl).corsVisibleHeaders).not.toEqual(
        receipts[0]!.corsVisibleHeaders
      );
      expect(findProjectById).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("keeps duplicate submission opaque and writes one request and audit event", async () => {
    const { app, repository, findProjectById } = setup();
    const token = bearer("user-designer-ananya", "designer");
    const first = await request(app)
      .post("/api/v1/access-requests")
      .set("Authorization", token)
      .send(validBody);
    const second = await request(app)
      .post("/api/v1/access-requests")
      .set("Authorization", token)
      .send({ ...validBody, reason: "A duplicate with different text." });

    for (const response of [first, second]) {
      expect(response.status).toBe(202);
      expect(response.body).toEqual({ data: { accepted: true } });
      expect(response.type).toBe("application/json");
    }
    await expect(
      repository.pageAccessRequestsForRequester(
        "user-designer-ananya",
        {},
        { limit: 20, offset: 0 }
      )
    ).resolves.toMatchObject({ total: 1 });
    expect(
      (await repository.listAuditEvents({})).filter(
        ({ action }) => action === "access_request.created"
      )
    ).toHaveLength(1);
    expect(findProjectById).not.toHaveBeenCalled();
  });

  it("rejects a role-ineligible module before inspecting the project ID", async () => {
    const { app, findProjectById } = setup();

    const response = await request(app)
      .post("/api/v1/access-requests")
      .set("Authorization", bearer("user-designer-ananya", "designer"))
      .send({
        projectId: "invalid/project id",
        module: "finance",
        reason: "This must be denied by the role/module gate."
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "You are not authorized to perform this action."
      }
    });
    expect(findProjectById).not.toHaveBeenCalled();
  });

  it("denies anonymous and Client submissions without resolving a project", async () => {
    const anonymous = setup();
    const anonymousResponse = await request(anonymous.app)
      .post("/api/v1/access-requests")
      .send(validBody);
    expect(anonymousResponse.status).toBe(401);
    expect(anonymous.findProjectById).not.toHaveBeenCalled();

    const client = setup();
    const clientResponse = await request(client.app)
      .post("/api/v1/access-requests")
      .set("Authorization", bearer("user-client-aurora", "client"))
      .send(validBody);
    expect(clientResponse.status).toBe(403);
    expect(client.findProjectById).not.toHaveBeenCalled();
  });

  it("allows ten attempts per actor and IP in fifteen minutes", async () => {
    const { app } = setup({ windowMs: 15 * 60_000, maxAttempts: 10 });
    const token = bearer("user-designer-ananya", "designer");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app)
        .post("/api/v1/access-requests")
        .set("Authorization", token)
        .send({ ...validBody, projectId: `opaque-project-${attempt}` })
        .expect(202);
    }

    const limited = await request(app)
      .post("/api/v1/access-requests")
      .set("Authorization", token)
      .send({ ...validBody, projectId: "opaque-project-eleven" });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("opens a fresh actor/IP window after exactly fifteen minutes", async () => {
    const seed = structuredClone(demoSeedData);
    const repository = createMemoryRepository(seed);
    let now = Date.parse("2026-08-17T10:00:00.000Z");
    const app = createApp({
      repository,
      auth,
      clock: () => new Date(now),
      accessRequestRateLimit: { windowMs: 15 * 60_000, maxAttempts: 1 }
    });
    const token = bearer("user-designer-ananya", "designer");
    await request(app)
      .post("/api/v1/access-requests")
      .set("Authorization", token)
      .send(validBody)
      .expect(202);
    await request(app)
      .post("/api/v1/access-requests")
      .set("Authorization", token)
      .send(validBody)
      .expect(429);

    now += 15 * 60_000;
    await request(app)
      .post("/api/v1/access-requests")
      .set("Authorization", token)
      .send(validBody)
      .expect(202);
  });

  it("bounds actor/IP buckets and evicts the oldest bucket", async () => {
    const { app } = setup({ maxAttempts: 1, maxEntries: 2 });
    const actors = [
      ["user-designer-ananya", "designer"],
      ["user-requester-two", "designer"],
      ["user-requester-three", "designer"]
    ] as const satisfies readonly (readonly [string, Role])[];

    for (const [id, role] of actors) {
      await request(app)
        .post("/api/v1/access-requests")
        .set("Authorization", bearer(id, role))
        .send(validBody)
        .expect(202);
    }

    await request(app)
      .post("/api/v1/access-requests")
      .set("Authorization", bearer("user-designer-ananya", "designer"))
      .send(validBody)
      .expect(202);
  });

  it.each(["invalid/project", "invalid project", "x".repeat(129)])(
    "bounds validation disclosure for malformed opaque ID %s",
    async (projectId) => {
      const { app, findProjectById } = setup();
      const response = await request(app)
        .post("/api/v1/access-requests")
        .set("Authorization", bearer("user-designer-ananya", "designer"))
        .send({ ...validBody, projectId });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toBe("Request validation failed.");
      expect(Object.keys(response.body.error.fields)).toEqual(["projectId"]);
      expect(JSON.stringify(response.body).length).toBeLessThan(500);
      expect(findProjectById).not.toHaveBeenCalled();
    }
  );
});

describe("own access-request history and cancellation", () => {
  it("returns only the explicit own DTO and never resolves project identity", async () => {
    const { app, repository, findProjectById } = setup();
    const createdAt = clock().toISOString();
    const pending = await repository.createAccessRequest({
      id: "request-own-approved",
      requesterId: "user-designer-ananya",
      projectId: "project-hidden-valid",
      module: "design",
      reason: "Need hidden design access.",
      createdAt,
      updatedAt: createdAt
    });
    const grant = await repository.createProjectAccessGrant({
      id: "grant-own-approved",
      projectId: pending.projectId,
      userId: pending.requesterId,
      module: pending.module,
      source: "access_request",
      accessRequestId: pending.id,
      grantedById: "user-head",
      grantedAt: createdAt,
      createdAt,
      updatedAt: createdAt
    });
    await repository.transitionAccessRequest(pending.id, pending.version, {
      status: "approved",
      reviewerId: "user-head",
      decisionReason: null,
      decisionFingerprint: "a".repeat(64),
      approvedGrantId: grant.id,
      reviewedAt: createdAt,
      updatedAt: createdAt
    });

    const response = await request(app)
      .get("/api/v1/access-requests/mine?status=approved&module=design&limit=20&offset=0")
      .set("Authorization", bearer("user-designer-ananya", "designer"));

    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toEqual({
      limit: 20,
      offset: 0,
      total: 1,
      hasMore: false
    });
    expect(Object.keys(response.body.data.items[0]).sort()).toEqual([
      "createdAt",
      "decisionReason",
      "id",
      "module",
      "projectId",
      "reason",
      "reviewedAt",
      "status",
      "updatedAt",
      "version"
    ]);
    expect(response.body.data.items[0]).toMatchObject({
      id: pending.id,
      projectId: "project-hidden-valid",
      module: "design",
      status: "approved",
      version: 2
    });
    expect(JSON.stringify(response.body)).not.toContain("decisionFingerprint");
    expect(JSON.stringify(response.body)).not.toContain("approvedGrantId");
    expect(JSON.stringify(response.body)).not.toContain("requesterId");
    expect(JSON.stringify(response.body)).not.toContain("reviewerId");
    expect(findProjectById).not.toHaveBeenCalled();
  });

  it("cancels an owned pending request with CAS and reconstructs one retry", async () => {
    const { app, repository, findProjectById } = setup();
    const token = bearer("user-designer-ananya", "designer");
    await request(app)
      .post("/api/v1/access-requests")
      .set("Authorization", token)
      .send(validBody)
      .expect(202);
    const pending = await repository.findPendingAccessRequest(
      "user-designer-ananya",
      validBody.projectId,
      validBody.module
    );
    expect(pending).not.toBeNull();

    const first = await request(app)
      .post(`/api/v1/access-requests/${pending!.id}/cancel`)
      .set("Authorization", token)
      .send({ version: pending!.version });
    const retry = await request(app)
      .post(`/api/v1/access-requests/${pending!.id}/cancel`)
      .set("Authorization", token)
      .send({ version: pending!.version });

    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ status: "cancelled", version: 2 });
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(
      (await repository.listAuditEvents({})).filter(
        ({ action }) => action === "access_request.cancelled"
      )
    ).toHaveLength(1);
    expect(findProjectById).not.toHaveBeenCalled();
  });

  it("uses a non-disclosing 404 for another requester's cancellation", async () => {
    const { app, repository, findProjectById } = setup();
    const createdAt = clock().toISOString();
    const pending = await repository.createAccessRequest({
      id: "request-other-owner",
      requesterId: "user-requester-two",
      projectId: "project-hidden-valid",
      module: "design",
      reason: "Need access.",
      createdAt,
      updatedAt: createdAt
    });

    const response = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/cancel`)
      .set("Authorization", bearer("user-designer-ananya", "designer"))
      .send({ version: pending.version });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(findProjectById).not.toHaveBeenCalled();
  });

  it("rejects stale and non-pending cancellation transitions", async () => {
    const { app, repository } = setup();
    const createdAt = clock().toISOString();
    const pending = await repository.createAccessRequest({
      id: "request-stale-cancel",
      requesterId: "user-designer-ananya",
      projectId: "project-hidden-valid",
      module: "design",
      reason: "Need access.",
      createdAt,
      updatedAt: createdAt
    });
    const stale = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/cancel`)
      .set("Authorization", bearer("user-designer-ananya", "designer"))
      .send({ version: pending.version + 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");

    const grant = await repository.createProjectAccessGrant({
      id: "grant-stale-cancel",
      projectId: pending.projectId,
      userId: pending.requesterId,
      module: pending.module,
      source: "access_request",
      accessRequestId: pending.id,
      grantedById: "user-head",
      grantedAt: createdAt,
      createdAt,
      updatedAt: createdAt
    });
    await repository.transitionAccessRequest(pending.id, pending.version, {
      status: "approved",
      reviewerId: "user-head",
      decisionReason: null,
      decisionFingerprint: "b".repeat(64),
      approvedGrantId: grant.id,
      reviewedAt: createdAt,
      updatedAt: createdAt
    });
    const terminal = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/cancel`)
      .set("Authorization", bearer("user-designer-ananya", "designer"))
      .send({ version: pending.version });
    expect(terminal.status).toBe(409);
    expect(terminal.body.error.code).toBe("VERSION_CONFLICT");
  });
});

describe("access-request review decisions and grant revocation", () => {
  it("gives Super Admin resolved and unresolved review DTOs without secrets", async () => {
    const { app, repository } = setup();
    await createPending(repository, {
      id: "request-known-review",
      projectId: "project-aurora-villa"
    });
    await createPending(repository, {
      id: "request-unknown-review",
      projectId: "project-hidden-valid"
    });

    const response = await request(app)
      .get("/api/v1/access-requests/review?status=pending&module=design&limit=20&offset=0")
      .set("Authorization", bearer("user-super-admin", "super_admin"));

    expect(response.status).toBe(200);
    expect(response.body.data.pagination.total).toBe(2);
    const known = response.body.data.items.find(
      ({ id }: { id: string }) => id === "request-known-review"
    );
    const unknown = response.body.data.items.find(
      ({ id }: { id: string }) => id === "request-unknown-review"
    );
    expect(known.project).toEqual({
      id: "project-aurora-villa",
      resolved: true,
      name: "Aurora Villa"
    });
    expect(unknown.project).toEqual({
      id: "project-hidden-valid",
      resolved: false,
      name: null
    });
    expect(known.requester).toEqual({
      id: "user-designer-ananya",
      name: "Ananya Rao",
      email: "ananya@lisno.example",
      role: "designer",
      active: true
    });
    expect(known.activeGrant).toBeNull();
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|decisionFingerprint|approvedGrantId/
    );
  });

  it("keeps the real Admin inbox empty and limits an initiator fixture exactly", async () => {
    const { app, repository } = setup();
    await createPending(repository, {
      id: "request-admin-visible",
      projectId: "project-aurora-villa"
    });
    await createPending(repository, {
      id: "request-admin-unknown",
      projectId: "project-hidden-valid"
    });
    const token = bearer("user-admin", "admin");
    const empty = await request(app)
      .get("/api/v1/access-requests/review?limit=20&offset=0")
      .set("Authorization", token);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toMatchObject({ items: [], pagination: { total: 0 } });

    const now = clock().toISOString();
    await repository.createProjectAccessGrant({
      id: "grant-admin-initiator",
      projectId: "project-aurora-villa",
      userId: "user-admin",
      module: "projects",
      source: "admin_initiator",
      accessRequestId: null,
      grantedById: "user-super-admin",
      grantedAt: now,
      createdAt: now,
      updatedAt: now
    });
    const scoped = await request(app)
      .get("/api/v1/access-requests/review?limit=20&offset=0")
      .set("Authorization", token);
    expect(scoped.status).toBe(200);
    expect(scoped.body.data.items.map(({ id }: { id: string }) => id)).toEqual([
      "request-admin-visible"
    ]);
    expect(scoped.body.data.pagination.total).toBe(1);
  });

  it("approves an exact request atomically and reconstructs the same decision", async () => {
    const { app, repository } = setup();
    const pending = await createPending(repository, {
      id: "request-approve",
      requesterId: "user-requester-two",
      projectId: "project-aurora-villa"
    });
    const token = bearer("user-super-admin", "super_admin");
    const first = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send({ version: pending.version, decision: "approved" });
    const retry = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send({ version: pending.version, decision: "approved" });

    expect(first.status).toBe(200);
    expect(first.body.data.request).toMatchObject({
      id: pending.id,
      status: "approved",
      version: 2,
      reviewerId: "user-super-admin"
    });
    expect(first.body.data.grant).toMatchObject({
      projectId: pending.projectId,
      userId: pending.requesterId,
      module: "design",
      source: "access_request",
      accessRequestId: pending.id,
      grantedById: "user-super-admin",
      active: true,
      version: 1
    });
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(JSON.stringify(first.body)).not.toContain("decisionFingerprint");
    const events = await repository.listAuditEvents({});
    expect(events.filter(({ action }) => action === "access_request.approved")).toHaveLength(1);
    expect(events.filter(({ action }) => action === "project_access.granted")).toHaveLength(1);

    const competing = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send({ version: pending.version, decision: "rejected", reason: "Changed mind" });
    expect(competing.status).toBe(409);
    expect(competing.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("leaves unknown and ineligible approvals pending", async () => {
    const { app, repository } = setup();
    const unknown = await createPending(repository, {
      id: "request-unknown-approval",
      projectId: "project-does-not-exist"
    });
    const ineligible = await createPending(repository, {
      id: "request-ineligible-approval",
      requesterId: "user-procurement",
      projectId: "project-aurora-villa"
    });
    const inactive = await createPending(repository, {
      id: "request-inactive-approval",
      requesterId: "user-inactive-requester",
      projectId: "project-aurora-villa"
    });
    const token = bearer("user-super-admin", "super_admin");

    for (const pending of [unknown, ineligible, inactive]) {
      const response = await request(app)
        .post(`/api/v1/access-requests/${pending.id}/decision`)
        .set("Authorization", token)
        .send({ version: pending.version, decision: "approved" });
      expect(response.status).toBe(409);
      expect(response.body.error).toEqual({
        code: "ACCESS_REQUEST_NOT_APPROVABLE",
        message: "The access request could not be approved."
      });
      await expect(repository.findAccessRequestById(pending.id)).resolves.toMatchObject({
        status: "pending",
        version: 1
      });
    }
  });

  it("allows Admin decisions and revocation only inside one active initiator scope", async () => {
    const { app, repository } = setup();
    const visible = await createPending(repository, {
      id: "request-admin-decision-visible",
      requesterId: "user-requester-two",
      projectId: "project-aurora-villa"
    });
    const hidden = await createPending(repository, {
      id: "request-admin-decision-hidden",
      requesterId: "user-requester-three",
      projectId: "project-celeste-office"
    });
    const now = clock().toISOString();
    const initiator = await repository.createProjectAccessGrant({
      id: "grant-admin-decision-scope",
      projectId: visible.projectId,
      userId: "user-admin",
      module: "projects",
      source: "admin_initiator",
      accessRequestId: null,
      grantedById: "user-super-admin",
      grantedAt: now,
      createdAt: now,
      updatedAt: now
    });
    const token = bearer("user-admin", "admin");

    const approved = await request(app)
      .post(`/api/v1/access-requests/${visible.id}/decision`)
      .set("Authorization", token)
      .send({ version: visible.version, decision: "approved" });
    expect(approved.status).toBe(200);
    expect(approved.body.data.grant.grantedById).toBe("user-admin");

    const denied = await request(app)
      .post(`/api/v1/access-requests/${hidden.id}/decision`)
      .set("Authorization", token)
      .send({ version: hidden.version, decision: "approved" });
    expect(denied.status).toBe(403);
    await expect(repository.findAccessRequestById(hidden.id)).resolves.toMatchObject({
      status: "pending"
    });

    const revoke = await request(app)
      .post(`/api/v1/project-access-grants/${approved.body.data.grant.id}/revoke`)
      .set("Authorization", token)
      .send({ version: 1, reason: "No longer needed" });
    expect(revoke.status).toBe(200);
    const initiatorRevoke = await request(app)
      .post(`/api/v1/project-access-grants/${initiator.id}/revoke`)
      .set("Authorization", token)
      .send({ version: initiator.version, reason: "Not allowed" });
    expect(initiatorRevoke.status).toBe(403);
  });

  it("rolls back grant, request transition, and audits when decision audit storage fails", async () => {
    const seed = structuredClone(demoSeedData);
    addUser(seed, "user-super-admin", "super_admin");
    addUser(seed, "user-requester-two", "designer");
    const repository = createMemoryRepository(seed);
    const pending = await createPending(repository, {
      id: "request-audit-rollback",
      requesterId: "user-requester-two",
      projectId: "project-aurora-villa"
    });
    const app = createApp({
      repository: failAuditAction(repository, "access_request.approved"),
      auth,
      clock
    });

    const response = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .send({ version: pending.version, decision: "approved" });
    expect(response.status).toBe(500);
    await expect(repository.findAccessRequestById(pending.id)).resolves.toMatchObject({
      status: "pending",
      version: 1
    });
    await expect(
      repository.findActiveProjectAccessGrant(
        pending.requesterId,
        pending.projectId,
        pending.module
      )
    ).resolves.toBeNull();
    const actions = (await repository.listAuditEvents({})).map(({ action }) => action);
    expect(actions).not.toContain("access_request.approved");
    expect(actions).not.toContain("project_access.granted");
  });

  it("requires a bounded rejection reason before service entry", async () => {
    const { app, repository } = setup();
    const pending = await createPending(repository, { id: "request-blank-rejection" });
    const response = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .send({ version: pending.version, decision: "rejected", reason: "   " });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    await expect(repository.findAccessRequestById(pending.id)).resolves.toMatchObject({
      status: "pending"
    });
  });

  it("rejects reviewer or project substitution fields before decision service entry", async () => {
    const { app, repository } = setup();
    const pending = await createPending(repository, { id: "request-immutable-decision" });
    for (const substituted of [
      { projectId: "project-celeste-office" },
      { reviewerId: "user-super-admin-two" }
    ]) {
      const response = await request(app)
        .post(`/api/v1/access-requests/${pending.id}/decision`)
        .set("Authorization", bearer("user-super-admin", "super_admin"))
        .send({
          version: pending.version,
          decision: "approved",
          ...substituted
        });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    await expect(repository.findAccessRequestById(pending.id)).resolves.toMatchObject({
      status: "pending",
      version: 1
    });
  });

  it("stores only a generic unknown-project rejection but fingerprints the original retry", async () => {
    const { app, repository } = setup();
    const pending = await createPending(repository, {
      id: "request-unknown-rejection",
      projectId: "project-does-not-exist"
    });
    const token = bearer("user-super-admin", "super_admin");
    const input = {
      version: pending.version,
      decision: "rejected",
      reason: "Internal lookup detail"
    } as const;
    const first = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send(input);
    const retry = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send(input);
    const competing = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", token)
      .send({ ...input, reason: "Different internal detail" });

    expect(first.status).toBe(200);
    expect(first.body.data.request.decisionReason).toBe(
      "The access request could not be approved."
    );
    expect(first.body.data.grant).toBeNull();
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(competing.status).toBe(409);
    expect(JSON.stringify(first.body)).not.toContain("Internal lookup detail");
    expect(JSON.stringify(first.body)).not.toContain("decisionFingerprint");
    await expect(repository.findAccessRequestById(pending.id)).resolves.toMatchObject({
      decisionReason: "The access request could not be approved.",
      decisionFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/)
    });
  });

  it("does not approve through a dormant direct-assignment tuple", async () => {
    const { app, repository } = setup();
    const pending = await createPending(repository, {
      id: "request-dormant-tuple",
      requesterId: "user-requester-two",
      projectId: "project-aurora-villa"
    });
    const now = clock().toISOString();
    await repository.createProjectAccessGrant({
      id: "grant-dormant-direct",
      projectId: pending.projectId,
      userId: pending.requesterId,
      module: pending.module,
      source: "direct_assignment",
      accessRequestId: null,
      grantedById: "user-super-admin",
      grantedAt: now,
      createdAt: now,
      updatedAt: now
    });

    const response = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", bearer("user-super-admin", "super_admin"))
      .send({ version: pending.version, decision: "approved" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ACCESS_REQUEST_NOT_APPROVABLE");
    await expect(repository.findAccessRequestById(pending.id)).resolves.toMatchObject({
      status: "pending"
    });
  });

  it("revokes idempotently, removes Design scope, and never substitutes a later grant", async () => {
    const { app, repository } = setup();
    const pending = await createPending(repository, {
      id: "request-revoke",
      requesterId: "user-requester-two",
      projectId: "project-aurora-villa"
    });
    const superToken = bearer("user-super-admin", "super_admin");
    const approvalInput = { version: pending.version, decision: "approved" } as const;
    const approved = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", superToken)
      .send(approvalInput);
    expect(approved.status).toBe(200);
    const grant = approved.body.data.grant;
    await request(app)
      .get("/api/v1/projects/project-aurora-villa/design-versions?limit=20&offset=0")
      .set("Authorization", bearer("user-requester-two", "designer"))
      .expect(200);

    const revokeInput = { version: grant.version, reason: "Access no longer required" };
    const first = await request(app)
      .post(`/api/v1/project-access-grants/${grant.id}/revoke`)
      .set("Authorization", superToken)
      .send(revokeInput);
    const retry = await request(app)
      .post(`/api/v1/project-access-grants/${grant.id}/revoke`)
      .set("Authorization", superToken)
      .send(revokeInput);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ active: false, version: 2 });
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    await request(app)
      .get("/api/v1/projects/project-aurora-villa/design-versions?limit=20&offset=0")
      .set("Authorization", bearer("user-requester-two", "designer"))
      .expect(404);

    const now = clock().toISOString();
    await repository.createProjectAccessGrant({
      id: "grant-later-direct",
      projectId: pending.projectId,
      userId: pending.requesterId,
      module: pending.module,
      source: "direct_assignment",
      accessRequestId: null,
      grantedById: "user-super-admin",
      grantedAt: now,
      createdAt: now,
      updatedAt: now
    });
    const terminalRetry = await request(app)
      .post(`/api/v1/access-requests/${pending.id}/decision`)
      .set("Authorization", superToken)
      .send(approvalInput);
    expect(terminalRetry.status).toBe(200);
    expect(terminalRetry.body.data.grant).toBeNull();

    const otherReviewer = await request(app)
      .post(`/api/v1/project-access-grants/${grant.id}/revoke`)
      .set("Authorization", bearer("user-super-admin-two", "super_admin"))
      .send(revokeInput);
    expect(otherReviewer.status).toBe(409);
    const differentReason = await request(app)
      .post(`/api/v1/project-access-grants/${grant.id}/revoke`)
      .set("Authorization", superToken)
      .send({ ...revokeInput, reason: "Different reason" });
    expect(differentReason.status).toBe(409);
    expect(
      (await repository.listAuditEvents({})).filter(
        ({ action }) => action === "project_access.revoked"
      )
    ).toHaveLength(1);
  });
});

async function createPending(
  repository: AppRepository,
  overrides: Partial<AccessRequestRecord> = {}
): Promise<AccessRequestRecord> {
  const now = clock().toISOString();
  return repository.createAccessRequest({
    id: overrides.id ?? `request-${Math.random().toString(36).slice(2)}`,
    requesterId: overrides.requesterId ?? "user-designer-ananya",
    projectId: overrides.projectId ?? "project-aurora-villa",
    module: overrides.module ?? "design",
    reason: overrides.reason ?? "Need project module access.",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  });
}

function failAuditAction(
  repository: AppRepository,
  action: string
): AppRepository {
  return new Proxy(repository, {
    get(target, property, receiver) {
      if (property === "appendAuditEvent") {
        return async (input: { action: string }) => {
          if (input.action === action) throw new Error("simulated audit failure");
          return target.appendAuditEvent(input as never);
        };
      }
      if (property === "runInTransaction") {
        return <T>(operation: (transaction: AppRepository) => Promise<T>) =>
          target.runInTransaction((transaction) =>
            operation(failAuditAction(transaction, action))
          );
      }
      return Reflect.get(target, property, receiver);
    }
  });
}
