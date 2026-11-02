import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuthService, toPublicUser } from "../src/services/auth.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createProjectClientInvitationService } from "../src/services/project-client-invitation.service.js";
import { createAdminProjectService } from "../src/services/admin-project.service.js";
import type { InvitationMailer } from "../src/services/invitation-mailer.js";
import type { UserRecord } from "../src/repositories/types.js";

const password = "InvitationTestPassword!23";
const context = { remoteAddress: "127.0.0.1" };
function setup(options: { disabled?: boolean; failed?: boolean; existing?: boolean; clientOverrides?: Partial<UserRecord> } = {}) {
  const seed = structuredClone(demoSeedData);
  seed.users.forEach(user => { user.accountKind = "standard"; });
  if (options.existing) {
    const client = seed.users.find(user => user.role === "client")!;
    client.id = "existing-invited-client";
    client.email = client.emailNormalized = "existing@project.test";
    Object.assign(client, options.clientOverrides);
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
    expect(await f.service.get(f.actor, "invited-project-1")).toMatchObject({ status: "accepted", acceptedAt: "2026-10-13T10:00:00.000Z", availableActions: [] });
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

  it.each(["deactivated", "deleted"] as const)("preserves accepted invitation history after its client is %s", async state => {
    const f = setup({ existing: true });
    await f.service.send(f.actor, "invited-project-1");
    const client = (await f.repository.findUserByEmail("existing@project.test"))!;
    await f.service.acceptExisting(toPublicUser(client), f.deliveries[0]!.rawToken);
    const accepted = await f.service.get(f.actor, "invited-project-1");
    expect(accepted).toMatchObject({ status: "accepted", acceptedAt: "2026-10-13T10:00:00.000Z", availableActions: [] });
    if (state === "deleted") await f.repository.deleteUser(client.id, client.version, { deletedAt: "2026-10-14T10:00:00.000Z", deletedById: f.actor.id });
    else await f.repository.updateUser(client.id, client.version, { active: false, updatedAt: "2026-10-14T10:00:00.000Z" });
    const auditBefore = await f.repository.listAuditEvents({});
    const recordBefore = await f.repository.findProjectClientInvitation("invited-project-1");
    expect(await f.service.get(f.actor, "invited-project-1")).toEqual(accepted);
    expect(await f.service.send(f.actor, "invited-project-1")).toEqual(accepted);
    expect(await f.service.resend(f.actor, "invited-project-1", accepted.expectedVersion)).toEqual(accepted);
    expect(await f.repository.findProjectClientInvitation("invited-project-1")).toEqual(recordBefore);
    expect(await f.repository.listAuditEvents({})).toEqual(auditBefore);
    expect(f.deliveries).toHaveLength(1);
    expect(await f.repository.findProjectForUserRead((await f.repository.findUserById(client.id))!, "invited-project-1")).toBeNull();
  });

  it.each([{ acceptedUserId: "different-client" }, { emailNormalized: "other@project.test" }])("rejects inconsistent accepted ownership history (%j)", async mismatch => {
    const f = setup({ existing: true });
    await f.service.send(f.actor, "invited-project-1");
    const client = (await f.repository.findUserByEmail("existing@project.test"))!;
    await f.service.acceptExisting(toPublicUser(client), f.deliveries[0]!.rawToken);
    const repository = new Proxy(f.repository, { get(target, key, receiver) {
      if (key === "findProjectClientInvitation") return async (id: string) => {
        const record = await target.findProjectClientInvitation(id);
        return record ? { ...record, ...mismatch } : record;
      };
      return Reflect.get(target, key, receiver);
    } });
    const service = createProjectClientInvitationService({ repository, audit: f.audit, auth: f.auth, mailer: { deliveryKind: "disabled" }, clock: () => new Date("2026-10-14T10:00:00.000Z") });
    await expect(service.get(f.actor, "invited-project-1")).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
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

  it.each([{ disabled: true }, { failed: true }, {}])("links an existing client once without delivery or invitation writes (%j)", async options => {
    const f = setup({ ...options, existing: true });
    const service = createAdminProjectService(f.repository, f.audit, () => new Date("2026-10-13T10:00:00.000Z"), f.service);
    const input = { initiationKey: "initiate-repeat-1", clientName: "Synthetic Client", clientEmail: f.seed.projects[0]!.clientEmail, clientMobile: "9000000000", projectName: "New project", propertyType: "2BHK", nextAction: "Estimate", nextActionAt: "2026-10-15T10:00:00.000Z", estimatorId: f.seed.users.find(user => user.role === "estimator_sales")!.id };
    const first = await service.initiate(f.actor, input);
    const second = await service.initiate(f.actor, input);
    expect(second.id).toBe(first.id);
    const client = (await f.repository.findUserByEmail("existing@project.test"))!;
    expect(first.clientInvitation).toMatchObject({ status: "linked", deliveryAvailable: !options.disabled, availableActions: [], acceptedAt: null });
    expect(second.clientInvitation).toEqual(first.clientInvitation);
    expect(await f.repository.findProjectById(first.id)).toMatchObject({ estimationWorkflowVersion: 3, clientId: client.id, estimateRequirementsVersion: 0 });
    expect(await f.repository.findProjectClientInvitation(first.id)).toBeNull();
    expect(f.deliveries).toHaveLength(0);
    expect((await f.repository.listAuditEvents({})).filter(row => row.action === "client_project_linked")).toEqual([
      expect.objectContaining({ actorId: f.actor.id, entityId: first.id, oldValues: { clientId: null }, newValues: { clientId: client.id } })
    ]);
    expect(await f.service.send(f.actor, first.id)).toEqual(first.clientInvitation);
    expect(await f.service.resend(f.actor, first.id, 99)).toEqual(first.clientInvitation);
    expect(await f.service.revoke(f.actor, first.id, 99)).toEqual(first.clientInvitation);
    expect(await f.repository.findProjectClientInvitation(first.id)).toBeNull();
    expect(f.deliveries).toHaveLength(0);
    await expect(service.initiate(f.actor, { ...input, projectName: "Different request" })).rejects.toMatchObject({ code: "INITIATION_KEY_REUSED" });
  });

  it.each([
    { active: false }, { deletedAt: "2026-10-01T00:00:00.000Z" }, { role: "designer" as const },
    { accountKind: "development_demo" as const }, { id: "user-client-aurora" }
  ])("rejects an ineligible existing account with no partial initiation (%j)", async clientOverrides => {
    const f = setup({ existing: true, clientOverrides });
    const service = createAdminProjectService(f.repository, f.audit, () => new Date("2026-10-13T10:00:00.000Z"), f.service);
    const before = { leads: await f.repository.pageAllLeads({}, { limit: 100, offset: 0 }), audits: await f.repository.listAuditEvents({}), projects: await f.repository.listProjectsForUserInModule((await f.repository.findUserById(f.actor.id))!, "projects") };
    await expect(service.initiate(f.actor, { initiationKey: "ineligible-client-project", clientName: "Synthetic Client", clientEmail: "existing@project.test", clientMobile: "9000000000", projectName: "Invalid client project", propertyType: "2BHK", nextActionAt: "2026-10-15T10:00:00.000Z", estimatorId: "user-estimator-sales" })).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { clientEmail: expect.any(String) } });
    expect(await f.repository.pageAllLeads({}, { limit: 100, offset: 0 })).toEqual(before.leads);
    expect(await f.repository.listAuditEvents({})).toEqual(before.audits);
    expect(await f.repository.listProjectsForUserInModule((await f.repository.findUserById(f.actor.id))!, "projects")).toEqual(before.projects);
    expect(f.deliveries).toHaveLength(0);
  });

  it("keeps linked reads side-effect free and refuses a forged or inactive project owner", async () => {
    const f = setup({ existing: true });
    const client = (await f.repository.findUserByEmail("existing@project.test"))!;
    await f.repository.runInTransaction(tx => tx.linkProjectClient("invited-project-1", client.emailNormalized, client.id, "2026-10-13T10:00:00.000Z"));
    const before = await f.repository.listAuditEvents({});
    expect(await f.service.get(f.actor, "invited-project-1")).toMatchObject({ status: "linked", availableActions: [], expectedVersion: 0, acceptedAt: null });
    expect(await f.repository.listAuditEvents({})).toEqual(before);
    for (const override of [{ active: false }, { emailNormalized: "someone-else@project.test" }, { role: "designer" as const }]) {
      const repo = new Proxy(f.repository, { get(target, key, receiver) { if (key === "findUserById") return async (id: string) => id === client.id ? { ...client, ...override } : target.findUserById(id); return Reflect.get(target, key, receiver); } });
      const service = createProjectClientInvitationService({ repository: repo, audit: f.audit, auth: f.auth, mailer: { deliveryKind: "disabled" }, clock: () => new Date("2026-10-13T10:00:00.000Z") });
      await expect(service.get(f.actor, "invited-project-1")).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
    }
  });

  it("does not resend a historical failed invitation after its project is linked", async () => {
    const f = setup({ existing: true, failed: true });
    const failed = await f.service.send(f.actor, "invited-project-1");
    const client = (await f.repository.findUserByEmail("existing@project.test"))!;
    await f.repository.runInTransaction(tx => tx.linkProjectClient(failed.projectId, client.emailNormalized, client.id, "2026-10-13T10:00:00.000Z"));
    const recordBefore = await f.repository.findProjectClientInvitation(failed.projectId);
    const auditsBefore = await f.repository.listAuditEvents({});
    f.advance();
    expect(await f.service.get(f.actor, failed.projectId)).toMatchObject({ status: "linked", acceptedAt: null, availableActions: [] });
    expect(await f.service.resend(f.actor, failed.projectId, failed.expectedVersion)).toMatchObject({ status: "linked", acceptedAt: null, availableActions: [] });
    expect(f.deliveries).toHaveLength(1);
    expect(await f.repository.findProjectClientInvitation(failed.projectId)).toEqual(recordBefore);
    expect(await f.repository.listAuditEvents({})).toEqual(auditsBefore);
    await expect(f.service.inspect(f.deliveries[0]!.rawToken)).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
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


describe("initiation intake retry compatibility", () => {
  const input = { clientName: "Synthetic Intake", clientEmail: "intake@project.test", clientMobile: "9000000000", projectName: "Intake project", propertyType: "2BHK", nextActionAt: "2026-11-05T00:00:00.000Z", estimatorId: "user-estimator-sales" };
  const emptyMetadata = { nativePlace: null, tentativeBudget: null, closureTentativeDate: null, category: null, languagesKnown: [], preferredLanguage: null };

  it("deduplicates normalized defaults and known-language sets but rejects changed metadata", async () => {
    const f = setup({ disabled: true });
    const service = createAdminProjectService(f.repository, f.audit, () => new Date("2026-11-02T00:00:00Z"), f.service);
    const command = { ...input, initiationKey: "intake-default-retry" };
    const first = await service.initiate(f.actor, command);
    const repeated = await service.initiate(f.actor, { ...command, ...emptyMetadata, nativePlace: "  ", tentativeBudget: "", nextAction: "Estimation" });
    expect(repeated.id).toBe(first.id);
    const secondCommand = { ...input, initiationKey: "intake-known-languages", languagesKnown: ["english", "hindi"] as const };
    const second = await service.initiate(f.actor, { ...secondCommand, languagesKnown: [...secondCommand.languagesKnown] });
    expect((await service.initiate(f.actor, { ...secondCommand, languagesKnown: ["hindi", "english"] })).id).toBe(second.id);
    for (const changed of [{ category: "rental" as const }, { languagesKnown: ["english" as const] }, { preferredLanguage: "english" as const }, { tentativeBudget: "₹20 lakh" }, { closureTentativeDate: "2026-12-01" }, { nativePlace: "Pune" }]) {
      await expect(service.initiate(f.actor, { ...command, ...changed })).rejects.toMatchObject({ code: "INITIATION_KEY_REUSED" });
    }
    await expect(service.initiate(f.actor, { ...secondCommand, languagesKnown: [] })).rejects.toMatchObject({ code: "INITIATION_KEY_REUSED" });
    expect(f.deliveries).toHaveLength(0);
  });

  it("replays a historical receipt only for the same legacy payload with empty new metadata", async () => {
    const f = setup({ disabled: true });
    const service = createAdminProjectService(f.repository, f.audit, () => new Date("2026-11-02T00:00:00Z"));
    const legacy = { ...input, nextAction: "Estimation" };
    const created = await service.initiate(f.actor, legacy);
    const initiationKey = "historical-intake-retry";
    const receipt = {
      id: createHash("sha256").update(`${f.actor.id}:${initiationKey}`).digest("hex"),
      actorId: f.actor.id,
      projectId: created.id,
      fingerprint: createHash("sha256").update(JSON.stringify(Object.keys(legacy).sort().map(key => [key, legacy[key as keyof typeof legacy]]))).digest("hex")
    };
    await f.repository.runInTransaction(tx => tx.createProjectInitiationReceipt(receipt));
    const before = await f.repository.pageAllLeads({}, { limit: 100, offset: 0 });
    const auditsBefore = await f.repository.listAuditEvents({});
    expect((await service.initiate(f.actor, { ...legacy, initiationKey })).id).toBe(created.id);
    expect((await service.initiate(f.actor, { ...input, ...emptyMetadata, nativePlace: " ", initiationKey })).id).toBe(created.id);
    for (const changed of [
      { nativePlace: "Kochi" }, { tentativeBudget: "₹20 lakh" }, { closureTentativeDate: "2026-12-01" },
      { category: "rental" as const }, { languagesKnown: ["english" as const] }, { preferredLanguage: "tamil" as const },
      { projectName: "Changed project" }, { estimatorId: "different-estimator" }, { nextAction: "Visit" }
    ]) await expect(service.initiate(f.actor, { ...legacy, initiationKey, ...changed })).rejects.toMatchObject({ code: "INITIATION_KEY_REUSED" });
    expect(await f.repository.findProjectInitiationReceipt(receipt.id)).toEqual(receipt);
    expect(await f.repository.pageAllLeads({}, { limit: 100, offset: 0 })).toEqual(before);
    expect(await f.repository.listAuditEvents({})).toEqual(auditsBefore);
  });
});
