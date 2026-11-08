import express from "express";
import request from "supertest";
import { Readable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { emptyDesignWorkflowState } from "../src/domain/design-workflow-state.js";
import { newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { sha256Hex } from "../src/domain/estimate-client-review.js";
import { errorHandler } from "../src/middleware/errors.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createDesignWorkflowStateRouter } from "../src/routes/design-workflow-state.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import { createDesignTeamService } from "../src/services/design-team.service.js";
import { createDesignWorkflowStateService, type WorkflowActionInput } from "../src/services/design-workflow-state.service.js";
import { createProjectService } from "../src/services/project.service.js";
import { quotationSnapshotDigest } from "../src/services/quotation-digest.js";
import { createWorkflowEvidenceStorage } from "../src/services/workflow-evidence-storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const AT = "2026-11-05T10:00:00.000Z", PROJECT = "measurement-race-project";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZAAAAABJRU5ErkJggg==", "base64");
const primary: PublicUser = { id: "primary", name: "Synthetic Primary", role: "designer", email: "primary@example.test" };
const one: PublicUser = { id: "secondary-one", name: "Synthetic Secondary One", role: "designer", email: "one@example.test" };
const two: PublicUser = { id: "secondary-two", name: "Synthetic Secondary Two", role: "designer", email: "two@example.test" };
const client: PublicUser = { id: "client", name: "Synthetic Client", role: "client", email: "client@example.test" };
const media = { id: "synthetic-photo", storageReference: "synthetic-photo", originalFilename: "site.png", mimeType: "image/png", byteSize: png.length, sha256: sha256Hex(png), kind: "image" as const };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => {
  replica = await startMongoReplicaSet("secondary-measurement");
  await Promise.all([UserModel.init(), ProjectModel.init(), EstimateModel.init(), EstimateClientReviewRoundModel.init(), DesignWorkflowStateModel.init(), AuthorizationCoordinationModel.init(), AuditEventModel.init()]);
}, 120_000);
beforeEach(async () => replica.clear());
afterAll(async () => replica?.stop());

async function setup(secondaries = [one.id, two.id]) {
  await UserModel.create([primary, one, two, client].map(user => ({ _id: user.id, ...user, emailNormalized: user.email, active: true, passwordHash: "synthetic-unused", accountKind: "standard" })));
  const stages = createProjectDesignWorkflow(PROJECT);
  await ProjectModel.create({ _id: PROJECT, name: "Synthetic measurement project", clientName: "Synthetic Client", clientEmail: client.email, clientEmailNormalized: client.email,
    clientMobile: "0000000000", status: "planning", plannedStartAt: new Date(AT), plannedEndAt: new Date(AT), estimationWorkflowVersion: 3,
    primaryDesignerId: primary.id, secondaryDesignerIds: secondaries, assignedDesignerIds: [primary.id, ...secondaries], designTeamVersion: 0, clientId: client.id, designWorkflowStages: stages });
  await EstimateModel.create({ _id: "measurement-estimate", leadId: "measurement-lead", projectId: PROJECT, ownerId: "synthetic-sales", propertyType: "2BHK", rooms: [{ id: "living", label: "Living room" }], scopes: [],
    lineItems: [{ id: "new-work", catalogueId: "CUSTOM", roomName: "Living room", specification: "Synthetic work", unit: "nos", quantity: 1, rate: 1000, amount: 1000, amountPaise: 100_000, included: true }],
    subtotal: 1000, gst: 0, total: 1000, subtotalPaise: 100_000, gstPaise: 0, totalPaise: 100_000, status: "client_approved", version: 5,
    designPlanDesignerId: primary.id, designPlanStatus: "assigned", designPlanAssignedAt: new Date(AT),
    estimation: { ...newQuotationLifecycle(), phase: "post", status: "client_approved", pricedRevision: 2, designStartedAt: AT, editClosedAt: AT,
      preApproval: { reviewRoundId: "measurement-pre", estimateVersion: 2, approvedAt: AT },
      finalApproval: { reviewRoundId: "measurement-post", estimateVersion: 4, approvedAt: AT, requirementsVersion: 0, designReviewRoundId: null, designPlanVersion: null, designScopeRevision: 1 } } });
  const estimate = (await EstimateModel.findById("measurement-estimate").lean())!;
  const snapshot = { clientName: "Synthetic Client", projectName: "Synthetic measurement project", location: "Synthetic location", propertyType: estimate.propertyType,
    bedroomCount: estimate.bedroomCount ?? null, rooms: estimate.rooms, scopes: estimate.scopes, lineItems: estimate.lineItems,
    selectedMainBasketIds: estimate.selectedMainBasketIds, selectedMainBasketClassifications: estimate.selectedMainBasketClassifications,
    subtotal: 1000, gst: 0, total: 1000, subtotalPaise: 100_000, gstPaise: 0, totalPaise: 100_000 };
  const sourceDigest = quotationSnapshotDigest(snapshot);
  await EstimateClientReviewRoundModel.create([2, 4].map(version => ({ _id: version === 2 ? "measurement-pre" : "measurement-post", estimateId: "measurement-estimate", leadId: "measurement-lead", projectId: PROJECT,
    workflowVersion: 3, phase: version === 2 ? "pre" : "post", requirementsVersion: 0, designScopeRevision: 1, pricedRevision: version / 2,
    sourceDigest, estimateSnapshot: snapshot, submittedById: version === 2 ? "synthetic-sales" : primary.id, estimateVersion: version, sendGeneration: version / 2, dedupeKey: sha256Hex(`measurement-round-${version}`),
    recipientEmail: client.email, recipientEmailNormalized: client.email, pdfFilename: "synthetic.pdf", pdfMimeType: "application/pdf", pdfByteSize: 5, pdfSha256: sha256Hex("proof"), pdfStorageReference: "synthetic-quotation",
    deliveryStatus: "disabled", deliveryAttemptGeneration: 1, deliveryAttemptCount: 0, assignedAdminId: "synthetic-admin", status: "approved", decision: "approve", decisionSource: "client_portal", decisionNote: "Approved",
    decidedById: client.id, decidedAt: new Date(AT), version: 2,
    salesApproval: version === 2 ? { actorId: "synthetic-sales", estimateVersion: 2, pricedRevision: 1, sourceDigest, approvedAt: AT } : null })));
  const repository = createMongoRepository(), audit = createAuditService(repository), clock = () => new Date(AT);
  const service = createDesignWorkflowStateService(repository, audit, clock), teams = createDesignTeamService(audit), projects = createProjectService(repository, audit, clock);
  const ready = emptyDesignWorkflowState(PROJECT);
  ready.estimationWorkflowVersion = 3; ready.designStartedAt = AT;
  ready.stages = { internal_kickoff: { completedAt: AT }, client_kickoff: { completedAt: AT }, key_collection: { completedAt: AT, receivedAt: AT, handedOverAt: AT }, site_measurement: { assignedDesignerId: primary.id } };
  await repository.saveDesignWorkflowState(PROJECT, 0, ready);
  const input = (key: string): WorkflowActionInput => ({ action: "measurement_complete", expectedVersion: 1, stageId: stages.find(stage => stage.type === "site_measurement")!.id, idempotencyKey: key, note: "Synthetic measurement", data: {} });
  const state = () => repository.findDesignWorkflowState(PROJECT);
  const view = async (actor = primary) => (await projects.designWorkflow(actor, PROJECT)).projectStages!.find(stage => stage.type === "site_measurement")!;
  const files = new Map<string, Buffer>(); let counter = 0;
  const hooks: { afterSave?: () => Promise<void> } = {};
  const save = vi.fn(async ({ data }: { data: Buffer }) => { const reference = `synthetic-stored-${++counter}`; files.set(reference, data); await hooks.afterSave?.(); return { reference }; });
  const remove = vi.fn(async (reference: string) => { files.delete(reference); });
  const storage = createWorkflowEvidenceStorage({ save, importStream: async ({ source }: { source: Readable }) => { const chunks: Buffer[] = []; for await (const chunk of source) chunks.push(Buffer.from(chunk)); return save({ data: Buffer.concat(chunks) }); },
    read: async reference => files.get(reference)!, delete: remove, open: async reference => Readable.from([files.get(reference)!]) });
  const app = express(); app.use(express.json());
  app.use(createDesignWorkflowStateRouter({ authenticate: async token => [primary, one, two, client].find(user => user.id === token)! } as AuthService, service, storage, 1024 * 1024)); app.use(errorHandler);
  const send = (actor: PublicUser, key: string) => request(app).post(`/projects/${PROJECT}/design-workflow/actions`).set("Authorization", `Bearer ${actor.id}`)
    .field("action", "measurement_complete").field("expectedVersion", "1").field("stageId", input(key).stageId!).field("idempotencyKey", key).field("note", "Synthetic measurement").field("data", "{}")
    .attach("mediaFiles", png, { filename: "site.png", contentType: "image/png" });
  const eventCount = () => AuditEventModel.countDocuments({ action: "design_workflow_action_recorded", "newValues.action": "measurement_complete" });
  return { repository, service, teams, projects, input, state, view, files, save, remove, hooks, send, eventCount };
}

describe("Secondary measurement assignment/completion transactions", () => {
  it("uses the saved secondary team immediately and preserves completion when the team changes later", async () => {
    const f = await setup([]);
    await f.teams.update(primary, PROJECT, { expectedVersion: 0, designerIds: [one.id] });
    expect((await f.view(one)).operational).toMatchObject({ availableActions: [{ id: "measurement_complete" }], facts: [{ label: "Secondary Designer", value: one.name }] });
    expect((await f.view()).operational!.availableActions).toEqual([]);
    await f.service.act(one, PROJECT, f.input("complete-before-removal"), null, [media]);
    const completed = await f.state();
    await f.teams.update(primary, PROJECT, { expectedVersion: 1, designerIds: [two.id] });
    expect(await f.state()).toEqual(completed);
    expect((await f.view()).operational).toMatchObject({ status: "completed", availableActions: [] });
    expect((await f.view()).operational!.facts).toContainEqual({ label: "Measurement completed by", value: one.name });
    expect((await f.view()).operational!.facts).toContainEqual({ label: "Current Secondary Designers", value: two.name });
    expect(await f.eventCount()).toBe(1);
    expect(await AuditEventModel.countDocuments({ action: "design_team_updated" })).toBe(2);
  });

  it("rejects a removed secondary after upload preflight and compensates every staged file", async () => {
    const f = await setup([one.id]);
    f.hooks.afterSave = () => f.teams.update(primary, PROJECT, { expectedVersion: 0, designerIds: [two.id] }).then(() => undefined);
    await f.send(one, "removed-during-upload").expect(404);
    expect(f.save).toHaveBeenCalledTimes(1); expect(f.remove).toHaveBeenCalledTimes(1); expect(f.files.size).toBe(0);
    expect((await f.state())!.history).toEqual([]); expect(await f.eventCount()).toBe(0);
    expect((await f.view(two)).operational!.availableActions).toContainEqual(expect.objectContaining({ id: "measurement_complete" }));
  });

  it("serializes two secondary submissions into one event and cleans losing and replayed evidence", async () => {
    const f = await setup();
    const outcomes = await Promise.all([f.send(one, "concurrent-secondary-one"), f.send(two, "concurrent-secondary-two")]);
    expect(outcomes.map(outcome => outcome.status).sort()).toEqual([200, 409]);
    const state = (await f.state())!, event = state.history[0]!;
    expect(state.history).toHaveLength(1); expect(event.mediaFiles).toHaveLength(1); expect(await f.eventCount()).toBe(1);
    expect(f.save).toHaveBeenCalledTimes(2); expect(f.remove).toHaveBeenCalledTimes(1); expect(f.files.size).toBe(1);
    const winner = outcomes[0]!.status === 200 ? one : two, key = winner === one ? "concurrent-secondary-one" : "concurrent-secondary-two";
    await f.send(winner, key).expect(200);
    expect(await f.state()).toEqual(state); expect(await f.eventCount()).toBe(1);
    expect(f.save).toHaveBeenCalledTimes(3); expect(f.remove).toHaveBeenCalledTimes(2); expect(f.files.size).toBe(1);
    expect(f.files.has(event.mediaFiles![0]!.storageReference)).toBe(true);
  });

  it("coordinates a simultaneous team removal and completion without stale authority or duplicate history", async () => {
    const f = await setup([one.id]);
    const outcomes = await Promise.allSettled([
      f.teams.update(primary, PROJECT, { expectedVersion: 0, designerIds: [two.id] }),
      f.service.act(one, PROJECT, f.input("concurrent-team-removal"), null, [media])
    ]);
    expect(outcomes[0]!.status).toBe("fulfilled");
    const state = (await f.state())!;
    if (outcomes[1]!.status === "fulfilled") {
      expect(state.history).toMatchObject([{ actorId: one.id, action: "measurement_complete" }]); expect(await f.eventCount()).toBe(1);
    } else {
      expect(outcomes[1]!.reason).toMatchObject({ status: 404 }); expect(state.history).toEqual([]); expect(await f.eventCount()).toBe(0);
    }
    await expect(f.service.act(one, PROJECT, { ...f.input("removed-cannot-retry"), expectedVersion: state.version }, null, [media])).rejects.toMatchObject({ status: 404 });
    expect(await AuditEventModel.countDocuments({ action: "design_team_updated" })).toBe(1);
    expect((await ProjectModel.findById(PROJECT).lean())!.secondaryDesignerIds).toEqual([two.id]);
  });
});
