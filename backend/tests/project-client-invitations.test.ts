import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuthService, toPublicUser } from "../src/services/auth.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createProjectClientInvitationService } from "../src/services/project-client-invitation.service.js";
import { createAdminProjectService } from "../src/services/admin-project.service.js";
import type { InvitationMailer } from "../src/services/invitation-mailer.js";

const password = "InvitationTestPassword!23";
const context = { remoteAddress: "127.0.0.1" };
function setup(options: { disabled?: boolean; failed?: boolean; existing?: boolean } = {}) {
  const seed = structuredClone(demoSeedData);
  seed.users.forEach(user => { user.accountKind = "standard"; });
  if (options.existing) {
    const client = seed.users.find(user => user.role === "client")!;
    client.id = "existing-invited-client";
    client.email = client.emailNormalized = "existing@project.test";
  }
  const email = options.existing ? "existing@project.test" : "invited@project.test";
  seed.projects = [1, 2].map(index => ({ ...seed.projects[0]!, id: `invited-project-${index}`, estimationWorkflowVersion: 2 as const, clientId: null, clientEmail: email, clientEmailNormalized: email.toLowerCase(), status: "planning" as const }));
  const repository = createMemoryRepository(seed);
  const actor = toPublicUser(seed.users.find(user => user.role === "super_admin")!);
  const audit = createAuditService(repository);
  const auth = createAuthService(repository, { jwtSecret: "project-invitations-test-secret-at-least-32-characters", jwtExpiresInSeconds: 900 });
  let now = new Date("2026-10-13T10:00:00.000Z");
  const deliveries: Array<{rawToken: string; purpose?: string}> = [];
  const mailer: InvitationMailer = options.disabled ? { deliveryKind: "disabled" } : { deliveryKind: "local_test", async sendInvitation(input) { deliveries.push(input); if (options.failed) throw new Error("Synthetic delivery failure"); } };
  const service = createProjectClientInvitationService({ repository, audit, auth, mailer, clock: () => now });
  return { seed, repository, actor, service, auth, audit, deliveries, advance: (milliseconds = 61_000) => { now = new Date(now.getTime() + milliseconds); } };
}

describe("project-bound client invitations", () => {
  it.each(["a".repeat(73), "é".repeat(37), "😀".repeat(19), "short"])("rejects an invalid password without consuming or linking the project invitation", async invalidPassword => {
    const f = setup();
    await f.service.send(f.actor, "invited-project-1");
    const token = f.deliveries[0]!.rawToken;
    const before = await f.repository.listUsers();
    const auditBefore = await f.repository.listAuditEvents({});
    await expect(f.service.acceptNew({ token, password: invalidPassword, passwordConfirmation: invalidPassword }, context)).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR", fields: { password: expect.any(String) } });
    await expect(f.service.inspect(token)).resolves.toMatchObject({ requiresSignIn: false });
    expect(await f.repository.listUsers()).toEqual(before);
    expect(await f.repository.listAuditEvents({})).toEqual(auditBefore);
    expect(await f.repository.findProjectById("invited-project-1")).toMatchObject({ clientId: null });
  });

  it("preflights disabled delivery without invitation or audit writes", async () => {
    const f = setup({ disabled: true });
    const before = await f.repository.listAuditEvents({});
    await expect(f.service.send(f.actor, "invited-project-1")).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    expect(await f.repository.findProjectClientInvitation("invited-project-1")).toBeNull();
    expect(await f.repository.listAuditEvents({})).toEqual(before);
    expect(await f.service.get(f.actor, "invited-project-1")).toMatchObject({ status: "not_issued", deliveryAvailable: false, expectedVersion: 0 });
  });

  it("creates a client and links only the accepted project with no token leakage", async () => {
    const f = setup();
    const status = await f.service.send(f.actor, "invited-project-1");
    expect(status).toMatchObject({ status: "pending", expectedVersion: 2 });
    const token = f.deliveries[0]!.rawToken;
    expect(f.deliveries[0]!.purpose).toBe("project_client");
    expect(JSON.stringify(status)).not.toContain(token);
    expect(await f.service.inspect(token)).toMatchObject({ requiresSignIn: false, projectId: "invited-project-1" });
    const accepted = await f.service.acceptNew({ token, password, passwordConfirmation: password }, context);
    expect(accepted.user.role).toBe("client");
    expect(await f.repository.findProjectById("invited-project-1")).toMatchObject({ clientId: accepted.user.id });
    expect(await f.repository.findProjectById("invited-project-2")).toMatchObject({ clientId: null });
    expect(await f.repository.findProjectClientInvitation("invited-project-1")).toMatchObject({ status: "accepted", tokenHash: null });
    await expect(f.service.inspect(token)).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
    expect(JSON.stringify(await f.repository.listAuditEvents({}))).not.toContain(token);
  });

  it("requires matching authenticated existing client, preserves password, and supports separate project invitations", async () => {
    const f = setup({ existing: true });
    await f.service.send(f.actor, "invited-project-1");
    const first = f.deliveries[0]!.rawToken;
    const existing = f.seed.users.find(user => user.role === "client")!;
    expect(await f.service.inspect(first)).toMatchObject({ requiresSignIn: true });
    await expect(f.service.acceptNew({ token: first, password, passwordConfirmation: password }, context)).rejects.toMatchObject({ code: "CLIENT_SIGN_IN_REQUIRED" });
    await expect(f.service.acceptExisting(f.actor, first)).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
    await f.service.acceptExisting(toPublicUser(existing), first);
    expect((await f.repository.findUserById(existing.id))!.passwordHash).toBe(existing.passwordHash);
    f.advance();
    await f.service.send(f.actor, "invited-project-2");
    await f.service.acceptExisting(toPublicUser(existing), f.deliveries[1]!.rawToken);
    expect(await f.repository.findProjectById("invited-project-2")).toMatchObject({ clientId: existing.id });
  });

  it("keeps failed delivery recoverable, rotates generations, and rejects stale resend/revoke", async () => {
    const f = setup({ failed: true });
    const first = await f.service.send(f.actor, "invited-project-1");
    expect(first.status).toBe("delivery_failed");
    await expect(f.service.resend(f.actor, first.projectId, first.expectedVersion)).rejects.toMatchObject({ code: "INVITATION_COOLDOWN" });
    f.advance();
    const next = await f.service.resend(f.actor, first.projectId, first.expectedVersion);
    expect(next.expectedVersion).toBe(4);
    await expect(f.service.inspect(f.deliveries[0]!.rawToken)).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
    await expect(f.service.revoke(f.actor, first.projectId, first.expectedVersion)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect((await f.service.revoke(f.actor, first.projectId, next.expectedVersion)).status).toBe("revoked");
    await expect(f.service.inspect(f.deliveries[1]!.rawToken)).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
  });

  it("does not grant project management to other Sales or clients", async () => {
    const f = setup();
    const sales = f.seed.users.find(user => user.role === "estimator_sales")!;
    const client = f.seed.users.find(user => user.role === "client")!;
    for (const actor of [sales, client]) await expect(f.service.send(toPublicUser(actor), "invited-project-1")).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
    expect(f.deliveries).toHaveLength(0);
  });

  it("serializes duplicate accepts into one account, one membership, and one audit", async () => {
    const f = setup();
    await f.service.send(f.actor, "invited-project-1");
    const input = { token: f.deliveries[0]!.rawToken, password, passwordConfirmation: password };
    const results = await Promise.allSettled([f.service.acceptNew(input, context), f.service.acceptNew(input, context)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await f.repository.listUsers()).filter(user => user.emailNormalized === "invited@project.test")).toHaveLength(1);
    expect((await f.repository.listAuditEvents({})).filter(row => row.action === "project_client_invitation.accepted")).toHaveLength(1);
  });

  it("keeps successful initiation idempotent when delivery is disabled and never auto-links an existing client", async () => {
    const f = setup({ disabled: true, existing: true });
    const service = createAdminProjectService(f.repository, f.audit, () => new Date("2026-10-13T10:00:00.000Z"), f.service);
    const input = { initiationKey: "initiate-repeat-1", clientName: "Synthetic Client", clientEmail: f.seed.projects[0]!.clientEmail, clientMobile: "9000000000", projectName: "New project", propertyType: "2BHK", nextAction: "Estimate", nextActionAt: "2026-10-15T10:00:00.000Z", estimatorId: f.seed.users.find(user => user.role === "estimator_sales")!.id };
    const first = await service.initiate(f.actor, input);
    const second = await service.initiate(f.actor, input);
    expect(second.id).toBe(first.id);
    expect(first.clientInvitation).toMatchObject({ status: "not_issued", deliveryAvailable: false });
    expect(await f.repository.findProjectById(first.id)).toMatchObject({ estimationWorkflowVersion: 2, clientId: null, estimateRequirementsVersion: 0 });
    await expect(service.initiate(f.actor, { ...input, projectName: "Different request" })).rejects.toMatchObject({ code: "INITIATION_KEY_REUSED" });
  });

  it("retires public registration without user, membership, or audit changes", async () => {
    const f = setup();
    const before = await f.repository.listUsers();
    await expect(f.auth.signupClient({ name: "Client", email: "invited@project.test", mobile: "9000000000", password }, context)).rejects.toMatchObject({ code: "CLIENT_INVITATION_REQUIRED" });
    expect(await f.repository.listUsers()).toEqual(before);
    expect(await f.repository.findProjectById("invited-project-1")).toMatchObject({ clientId: null });
  });
  it("rejects expiry and issuer authority revocation without linking a project", async () => {
    const f = setup();
    await f.service.send(f.actor, "invited-project-1");
    f.advance(24 * 60 * 60_000);
    expect(await f.service.get(f.actor, "invited-project-1")).toMatchObject({ status: "expired" });
    await expect(f.service.inspect(f.deliveries[0]!.rawToken)).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
    const current = await f.service.get(f.actor, "invited-project-1");
    await f.service.resend(f.actor, "invited-project-1", current.expectedVersion);
    const actor = (await f.repository.findUserById(f.actor.id))!;
    const changed = new Proxy(f.repository, { get(target, key, receiver) { if (key === "findUserById") return async (id: string) => id === actor.id ? { ...actor, version: actor.version + 1 } : target.findUserById(id); return Reflect.get(target, key, receiver); } });
    const service = createProjectClientInvitationService({ repository: changed, audit: f.audit, auth: f.auth, mailer: { deliveryKind: "disabled" }, clock: () => new Date("2026-10-14T10:00:00.000Z") });
    await expect(service.inspect(f.deliveries[1]!.rawToken)).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
    expect(await f.repository.findProjectById("invited-project-1")).toMatchObject({ clientId: null });
  });

  it("reports committed acceptance if session creation subsequently fails", async () => {
    const f = setup();
    await f.service.send(f.actor, "invited-project-1");
    const service = createProjectClientInvitationService({ repository: f.repository, audit: f.audit, auth: { ...f.auth, async login() { throw new Error("Synthetic session failure"); } }, mailer: { deliveryKind: "disabled" }, clock: () => new Date("2026-10-13T10:00:00.000Z") });
    await expect(service.acceptNew({ token: f.deliveries[0]!.rawToken, password, passwordConfirmation: password }, context)).rejects.toMatchObject({ code: "PROJECT_INVITATION_ACCEPTED_SIGN_IN_REQUIRED" });
    const client = await f.repository.findUserByEmail("invited@project.test");
    expect(client).not.toBeNull();
    expect(await f.repository.findProjectById("invited-project-1")).toMatchObject({ clientId: client!.id });
    expect(await f.repository.findProjectClientInvitation("invited-project-1")).toMatchObject({ status: "accepted" });
  });

  it("denies remote built-in-development-secret acceptance before identity writes", async () => {
    const f = setup();
    await f.service.send(f.actor, "invited-project-1");
    const auth = createAuthService(f.repository, { jwtSecret: "local-development-jwt-secret-do-not-use-in-production", jwtExpiresInSeconds: 900 });
    const service = createProjectClientInvitationService({ repository: f.repository, audit: f.audit, auth, mailer: { deliveryKind: "disabled" }, clock: () => new Date("2026-10-13T10:00:00.000Z") });
    await expect(service.acceptNew({ token: f.deliveries[0]!.rawToken, password, passwordConfirmation: password }, { remoteAddress: "203.0.113.10" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(await f.repository.findUserByEmail("invited@project.test")).toBeNull();
    expect(await f.repository.findProjectClientInvitation("invited-project-1")).toMatchObject({ status: "pending" });
  });

});
