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
  it("deduplicates concurrent initiation and deliveries by actor command", async () => {
    const f = await setup();
    const results = await Promise.all([f.projects.initiate(f.actor, input), f.projects.initiate(f.actor, input)]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(await ProjectModel.countDocuments()).toBe(1);
    expect(await LeadModel.countDocuments()).toBe(1);
    expect(await ProjectInitiationReceiptModel.countDocuments()).toBe(1);
    expect(await ProjectClientInvitationModel.countDocuments()).toBe(1);
    expect(f.deliveries).toHaveLength(1);
    expect(await f.repository.findProjectById(results[0]!.id)).toMatchObject({ clientId: null, estimationWorkflowVersion: 2, estimateRequirementsVersion: 0 });
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
