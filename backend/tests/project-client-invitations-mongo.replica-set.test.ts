import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuthService, toPublicUser } from "../src/services/auth.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createProjectClientInvitationService } from "../src/services/project-client-invitation.service.js";
import { createAdminProjectService } from "../src/services/admin-project.service.js";
import { ProjectClientInvitationModel, ProjectInitiationReceiptModel } from "../src/models/ProjectClientInvitation.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { LeadModel } from "../src/models/Lead.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EmailCoordinationModel } from "../src/models/EmailCoordination.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import type { AppRepository } from "../src/repositories/types.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet();
  await Promise.all([ProjectClientInvitationModel, ProjectInitiationReceiptModel, ProjectModel, UserModel, LeadModel, AuditEventModel, EmailCoordinationModel, AuthorizationCoordinationModel, ProjectAccessGrantModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica.stop());

const password = "SyntheticProjectPassword!23";
const input = { initiationKey: "mongo-project-retry", clientName: "Synthetic Client", clientEmail: "client@project-invitation.test", clientMobile: "9000000000", projectName: "Synthetic project", propertyType: "2BHK", nextAction: "Estimate", nextActionAt: "2026-10-15T10:00:00.000Z", estimatorId: "sales-invitation" };
async function setup() {
  const repository = createMongoRepository();
  const at = "2026-10-13T10:00:00.000Z";
  for (const [id, role] of [["sa-invitation", "super_admin"], ["sales-invitation", "estimator_sales"]] as const) await UserModel.create({ _id: id, name: id, email: `${id}@invitation.test`, emailNormalized: `${id}@invitation.test`, passwordHash: "unused", role, active: true, accountKind: "standard", version: 1, sessionVersion: 1, managerId: null, authorizedClientIds: [], createdAt: at, updatedAt: at });
  const actor = toPublicUser((await repository.findUserById("sa-invitation"))!);
  let time = new Date(at);
  const clock = () => time;
  const audit = createAuditService(repository);
  const auth = createAuthService(repository, { jwtSecret: "project-invitation-mongo-test-secret-32-characters", jwtExpiresInSeconds: 900 });
  const deliveries: string[] = [];
  const invitations = createProjectClientInvitationService({ repository, audit, auth, clock, mailer: { deliveryKind: "local_test", async sendInvitation(value) { deliveries.push(value.rawToken); } } });
  const projects = createAdminProjectService(repository, audit, clock, invitations);
  return { repository, actor, deliveries, invitations, projects, advance: () => { time = new Date(time.getTime() + 61_000); } };
}

describe("project client invitation transactional persistence", () => {
  it("links an existing client under concurrent initiation with one audit and no invitation or mail", async () => {
    const f = await setup();
    const client = await f.repository.createUser({ name: "Existing project client", email: input.clientEmail, mobile: null, address: null, passwordHash: "unused", role: "client", active: true, createdAt: "2026-10-13T09:00:00.000Z", updatedAt: "2026-10-13T09:00:00.000Z" });
    const other = await f.repository.createUser({ name: "Existing project client", email: "other@project-invitation.test", mobile: null, address: null, passwordHash: "unused", role: "client", active: true, createdAt: "2026-10-13T09:00:00.000Z", updatedAt: "2026-10-13T09:00:00.000Z" });
    const command = { ...input, clientEmail: ` ${input.clientEmail.toUpperCase()} ` };
    const results = await Promise.all([f.projects.initiate(f.actor, command), f.projects.initiate(f.actor, command)]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(results.map(result => result.clientInvitation?.status)).toEqual(["linked", "linked"]);
    expect(await ProjectModel.countDocuments()).toBe(1);
    expect(await LeadModel.countDocuments()).toBe(1);
    expect(await ProjectInitiationReceiptModel.countDocuments()).toBe(1);
    expect(await ProjectClientInvitationModel.countDocuments()).toBe(0);
    expect(f.deliveries).toEqual([]);
    expect(await AuditEventModel.countDocuments({ action: "client_project_linked", entityId: results[0]!.id, actorId: f.actor.id })).toBe(1);
    expect((await f.repository.pageProjectsForUserRead(client, { limit: 100, offset: 0 })).items.map(project => project.id)).toEqual([results[0]!.id]);
    expect(await f.repository.findProjectForUserRead(client, results[0]!.id)).toMatchObject({ clientId: client.id });
    expect((await f.repository.pageProjectsForUserRead(other, { limit: 100, offset: 0 })).items).toEqual([]);
    expect(await f.repository.findProjectForUserRead(other, results[0]!.id)).toBeNull();
  });

  it("rolls back automatic ownership, project, lead, receipt, and grants when its linking audit fails", async () => {
    const f = await setup();
    await f.repository.createUser({ name: "Existing project client", email: input.clientEmail, mobile: null, address: null, passwordHash: "unused", role: "client", active: true, createdAt: "2026-10-13T09:00:00.000Z", updatedAt: "2026-10-13T09:00:00.000Z" });
    const audit = createAuditService(f.repository);
    const projects = createAdminProjectService(f.repository, { ...audit, async append(value, transaction) { if (value.action === "client_project_linked") throw new Error("Synthetic link audit failure"); return audit.append(value, transaction); } }, () => new Date("2026-10-13T10:00:00.000Z"), f.invitations);
    await expect(projects.initiate(f.actor, input)).rejects.toThrow("Synthetic link audit failure");
    for (const model of [ProjectModel, LeadModel, ProjectInitiationReceiptModel, ProjectAccessGrantModel, ProjectClientInvitationModel, AuditEventModel]) expect(await model.countDocuments()).toBe(0);
    expect(f.deliveries).toEqual([]);
  });

  it("rechecks eligibility when client deactivation wins a concurrent initiation", async () => {
    const f = await setup();
    const client = await f.repository.createUser({ name: "Existing project client", email: input.clientEmail, mobile: null, address: null, passwordHash: "unused", role: "client", active: true, createdAt: "2026-10-13T09:00:00.000Z", updatedAt: "2026-10-13T09:00:00.000Z" });
    let release!: () => void;
    let held!: () => void;
    let attempted!: () => void;
    const untilRelease = new Promise<void>(resolve => { release = resolve; });
    const untilHeld = new Promise<void>(resolve => { held = resolve; });
    const untilAttempted = new Promise<void>(resolve => { attempted = resolve; });
    const deactivate = f.repository.runInTransaction(async tx => {
      await tx.coordinateAuthorizationMutation();
      await tx.coordinateClientEmail(client.emailNormalized);
      await tx.updateUser(client.id, client.version, { active: false, updatedAt: "2026-10-13T10:00:00.000Z" });
      held();
      await untilRelease;
    });
    await untilHeld;
    const repository = new Proxy(f.repository, { get(target, key, receiver) {
      if (key === "runInTransaction") return <T>(operation: (tx: AppRepository) => Promise<T>) => target.runInTransaction(tx => operation(new Proxy(tx, { get(inner, property, innerReceiver) {
        if (property === "coordinateAuthorizationMutation") return async () => { attempted(); return inner.coordinateAuthorizationMutation(); };
        return Reflect.get(inner, property, innerReceiver);
      } })));
      return Reflect.get(target, key, receiver);
    } });
    const projects = createAdminProjectService(repository, createAuditService(repository), () => new Date("2026-10-13T10:00:00.000Z"), f.invitations);
    const initiated = projects.initiate(f.actor, input);
    const rejected = expect(initiated).rejects.toMatchObject({ code: "VALIDATION_ERROR", fields: { clientEmail: expect.any(String) } });
    try { await untilAttempted; } finally { release(); }
    await deactivate;
    await rejected;
    for (const model of [ProjectModel, LeadModel, ProjectInitiationReceiptModel, ProjectClientInvitationModel, AuditEventModel]) expect(await model.countDocuments()).toBe(0);
    expect(f.deliveries).toEqual([]);
  });

  it("deduplicates concurrent initiation and deliveries by actor command", async () => {
    const f = await setup();
    const results = await Promise.all([f.projects.initiate(f.actor, input), f.projects.initiate(f.actor, input)]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(await ProjectModel.countDocuments()).toBe(1);
    expect(await LeadModel.countDocuments()).toBe(1);
    expect(await ProjectInitiationReceiptModel.countDocuments()).toBe(1);
    expect(await ProjectClientInvitationModel.countDocuments()).toBe(1);
    expect(f.deliveries).toHaveLength(1);
    expect(await f.repository.findProjectById(results[0]!.id)).toMatchObject({ clientId: null, estimationWorkflowVersion: 3, estimateRequirementsVersion: 0 });
  });

  it("creates one account under concurrent acceptance and binds only the exact project", async () => {
    const f = await setup();
    const first = await f.projects.initiate(f.actor, input);
    f.advance();
    const second = await f.projects.initiate(f.actor, { ...input, initiationKey: "another-project-key", projectName: "Second synthetic project" });
    const token = f.deliveries[0]!;
    const accept = { token, password, passwordConfirmation: password };
    const results = await Promise.allSettled([f.invitations.acceptNew(accept, { remoteAddress: "127.0.0.1" }), f.invitations.acceptNew(accept, { remoteAddress: "127.0.0.1" })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await UserModel.countDocuments({ emailNormalized: input.clientEmail })).toBe(1);
    const user = (await f.repository.findUserByEmail(input.clientEmail))!;
    expect(await f.repository.findProjectById(first.id)).toMatchObject({ clientId: user.id });
    expect(await f.repository.findProjectById(second.id)).toMatchObject({ clientId: null });
    expect(await AuditEventModel.countDocuments({ action: "project_client_invitation.accepted" })).toBe(1);
    expect(await f.invitations.inspect(f.deliveries[1]!)).toMatchObject({ requiresSignIn: true });
    await f.invitations.acceptExisting(toPublicUser(user), f.deliveries[1]!);
    expect(await ProjectModel.countDocuments({ clientId: user.id })).toBe(2);
  });

  it("serializes resend and revoke and rejects the stale generation", async () => {
    const f = await setup();
    const project = await f.projects.initiate(f.actor, input);
    const status = await f.invitations.get(f.actor, project.id);
    f.advance();
    const results = await Promise.allSettled([f.invitations.resend(f.actor, project.id, status.expectedVersion), f.invitations.revoke(f.actor, project.id, status.expectedVersion)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    await expect(f.invitations.inspect(f.deliveries[0]!)).rejects.toMatchObject({ code: "PROJECT_INVITATION_UNAVAILABLE" });
    expect(await ProjectModel.findById(project.id).lean()).toMatchObject({ clientId: null });
  });

  it("rolls back new user, project membership, and acceptance together on audit failure", async () => {
    const f = await setup();
    const project = await f.projects.initiate(f.actor, input);
    const audit = createAuditService(f.repository);
    const service = createProjectClientInvitationService({ repository: f.repository, audit: { ...audit, async append(value, transaction) { if (value.action === "project_client_invitation.accepted") throw new Error("Synthetic audit failure"); return audit.append(value, transaction); } }, auth: createAuthService(f.repository, { jwtSecret: "project-invitation-mongo-test-secret-32-characters", jwtExpiresInSeconds: 900 }), clock: () => new Date("2026-10-13T10:00:00.000Z"), mailer: { deliveryKind: "disabled" } });
    await expect(service.acceptNew({ token: f.deliveries[0]!, password, passwordConfirmation: password }, { remoteAddress: "127.0.0.1" })).rejects.toThrow("Synthetic audit failure");
    expect(await UserModel.countDocuments({ emailNormalized: input.clientEmail })).toBe(0);
    expect(await f.repository.findProjectById(project.id)).toMatchObject({ clientId: null });
    expect(await f.repository.findProjectClientInvitation(project.id)).toMatchObject({ status: "pending" });
  });
});


describe("initiation intake Mongo persistence", () => {
  it("round-trips two distinct intakes and preserves metadata through unrelated Lead updates", async () => {
    const f = await setup();
    const values = [
      { nativePlace: "Kochi", tentativeBudget: "₹15–20 lakh", closureTentativeDate: "2028-02-29", category: "self_use" as const, languagesKnown: ["english", "malayalam"] as const, preferredLanguage: "tamil" as const },
      { nativePlace: "Pune", tentativeBudget: "To be discussed", closureTentativeDate: "2027-12-31", category: "rental" as const, languagesKnown: ["marathi"] as const, preferredLanguage: "english" as const }
    ];
    for (const [index, value] of values.entries()) {
      f.advance();
      const metadata = { ...value, languagesKnown: [...value.languagesKnown] };
      const created = await f.projects.initiate(f.actor, { ...input, initiationKey: `mongo-intake-${index}`, projectName: `Intake ${index}`, ...metadata });
      expect(created).toMatchObject(metadata);
      const leadId = created.lead!.id;
      expect(await f.repository.findLeadById(leadId)).toMatchObject(metadata);
      expect(await f.projects.get(f.actor, created.id)).toMatchObject(metadata);
      expect(await LeadModel.findById(leadId).lean()).toMatchObject(metadata);
      await f.repository.updateLead(leadId, { notes: "Unrelated note" });
      expect(await f.repository.findLeadById(leadId)).toMatchObject(metadata);
      expect(await ProjectModel.findById(created.id).lean()).not.toHaveProperty("nativePlace");
      expect(await ProjectModel.findById(created.id).lean()).not.toHaveProperty("tentativeBudget");
    }
    const leads = await f.repository.pageAllLeads({}, { limit: 20, offset: 0 });
    expect(leads.total).toBe(2);
    for (const value of values) expect(leads.items).toEqual(expect.arrayContaining([expect.objectContaining(value)]));
    const audits = await AuditEventModel.find({}).lean();
    for (const audit of audits) for (const key of Object.keys(values[0]!)) expect(audit.newValues).not.toHaveProperty(key);
  });

  it("deduplicates concurrent normalized intake retries and rejects a changed value", async () => {
    const f = await setup();
    const { nextAction: _removed, ...command } = input;
    const results = await Promise.all([
      f.projects.initiate(f.actor, command),
      f.projects.initiate(f.actor, { ...command, nextAction: "Estimation", nativePlace: null, tentativeBudget: " ", category: null, closureTentativeDate: null, languagesKnown: [], preferredLanguage: null })
    ]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(results[0]).toMatchObject({ nativePlace: null, tentativeBudget: null, closureTentativeDate: null, category: null, languagesKnown: [], preferredLanguage: null, lead: { nextAction: "Estimation" } });
    expect(await ProjectModel.countDocuments()).toBe(1);
    expect(await LeadModel.countDocuments()).toBe(1);
    expect(await ProjectInitiationReceiptModel.countDocuments()).toBe(1);
    expect(f.deliveries).toHaveLength(1);
    await expect(f.projects.initiate(f.actor, { ...command, nativePlace: "Kochi" })).rejects.toMatchObject({ code: "INITIATION_KEY_REUSED" });
    const leadId = results[0]!.lead!.id;
    await LeadModel.collection.updateOne({ _id: leadId }, { $unset: { nativePlace: "", tentativeBudget: "", closureTentativeDate: "", category: "", languagesKnown: "", preferredLanguage: "" } });
    expect(await f.repository.findLeadById(leadId)).toMatchObject({ nativePlace: null, tentativeBudget: null, closureTentativeDate: null, category: null, languagesKnown: [], preferredLanguage: null });
  });
});
