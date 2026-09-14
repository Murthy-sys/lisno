import { Readable } from "node:stream";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { emptyDesignWorkflowState, type DesignWorkflowState } from "../src/domain/design-workflow-state.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import * as mongoRepository from "../src/repositories/mongo.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { DesignWorkflowStateModel } from "../src/models/DesignWorkflowState.js";
import { DesignVersionModel } from "../src/models/DesignVersion.js";
import { DesignVersionSequenceModel } from "../src/models/DesignVersionSequence.js";
import { DesignExtractionJobModel } from "../src/models/DesignExtractionJob.js";
import { ProjectModel } from "../src/models/Project.js";
import { TaskModel } from "../src/models/Task.js";
import { UserModel } from "../src/models/User.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createDesignSectionService } from "../src/services/design-section.service.js";
import { createDesignVersionService } from "../src/services/design-version.service.js";
import { assertDesignWorkflowSubmissionAllowed } from "../src/services/design-workflow-state.service.js";
import { createEstimateDesignService } from "../src/services/estimate-design.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const PROJECT_ID = "project-aurora-villa";
const NOW = "2026-09-11T12:00:00.000Z";
afterEach(() => vi.restoreAllMocks());
const FILE = {
  data: Buffer.from("valid-test-upload"), extension: ".pdf", originalFilename: "plan.pdf",
  mimeType: "application/pdf", sizeBytes: 17
} as const;

class TestStorage {
  readonly objects = new Map<string, Buffer>();
  readonly deleted: string[] = [];
  afterSave?: () => Promise<void>;
  async save(input: { data: Buffer; extension: string }) {
    const reference = `upload-${this.objects.size + 1}${input.extension}`;
    this.objects.set(reference, input.data);
    await this.afterSave?.();
    return { reference };
  }
  async saveGenerated(input: { data: Buffer; extension: string }) { return this.save(input); }
  async delete(reference: string) { this.deleted.push(reference); this.objects.delete(reference); }
  async read(reference: string) { return this.objects.get(reference)!; }
  async open(reference: string) { return Readable.from(await this.read(reference)); }
}

function readyState(): DesignWorkflowState {
  return {
    ...emptyDesignWorkflowState(PROJECT_ID),
    version: 1,
    initialPaymentAt: "2026-09-01T12:00:00.000Z",
    stages: {
      internal_kickoff: { completedAt: NOW },
      client_kickoff: { completedAt: NOW, notRequired: true },
      key_collection: { handedOverAt: NOW, receivedAt: NOW, completedAt: NOW },
      site_measurement: { completedAt: NOW },
      existing_furniture_dimensions: {
        acceptedAt: NOW,
        scopeEstimateId: "gate-approved-estimate",
        scopeEstimateVersion: 3,
        rooms: [
          { id: "room-living", name: "Living room", required: true, uploadedAt: NOW, proceed: false },
          { id: "room-bedroom", name: "Bedroom", required: true, uploadedAt: null, proceed: false }
        ]
      }
    }
  };
}

function setup(options: { legacy?: boolean; state?: DesignWorkflowState } = {}) {
  const seed = structuredClone(demoSeedData);
  const project = seed.projects.find((item) => item.id === PROJECT_ID)!;
  if (!options.legacy) project.designWorkflowStages = createProjectDesignWorkflow(project.id);
  seed.designWorkflowStates = options.state ? [options.state] : [];
  seed.estimateSummaries = [{
    id: "gate-approved-estimate", leadId: "gate-approved-lead", projectId: PROJECT_ID,
    version: 4, status: "client_approved", subtotal: 1000, gst: 0, total: 1000,
    clientDecisionAt: NOW, clientDecisionSource: "client_portal", approvedBaseline: null,
    clientReview: null, assignedAdminId: null, createdAt: NOW, updatedAt: NOW,
    rooms: [{ id: "room-living", label: "Living room" }, { id: "room-bedroom", label: "Bedroom" }]
  }];
  seed.extractionJobs.push({
    id: "gate-job", designVersionId: "version-aurora-plan-1", status: "designer_review",
    attemptCount: 1, queuedAt: NOW, nextAttemptAt: null, claimGeneration: 1,
    startedAt: NOW, completedAt: NOW, leaseExpiresAt: null, failureCode: null,
    failureMessage: null, claimId: null, workerResultId: "gate-result", createdAt: NOW, updatedAt: NOW
  });
  seed.designSections.push({
    id: "gate-section", designVersionId: "version-aurora-plan-1", sourcePageId: "gate-page",
    label: "Furniture layout", active: true, source: "manual", ocrConfidence: null,
    createdAt: NOW, updatedAt: NOW
  });
  seed.designSectionRevisions.push({
    id: "gate-revision", sectionId: "gate-section", revisionNumber: 1, sourcePageId: "gate-page",
    crop: { x: 0, y: 0, width: 1, height: 1 }, croppedFileReference: "gate-image.png",
    label: "Furniture layout", reviewStatus: "draft", submittedAt: null, reviewerId: null,
    reviewedAt: null, rejectionComment: null, createdAt: NOW
  });
  const user = seed.users.find((item) => item.id === "user-designer-ananya")!;
  const actor: PublicUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  const repository = createMemoryRepository(seed);
  const storage = new TestStorage();
  const audit = createAuditService(repository);
  return {
    repository, storage, actor,
    versions: createDesignVersionService(repository, audit, storage, () => new Date(NOW)),
    sections: createDesignSectionService(repository, audit, storage, () => new Date(NOW))
  };
}

describe("Design workflow upload and submission gates", () => {
  it("gates approved-estimate Designer uploads before any file is saved", async () => {
    const { repository, storage, actor } = setup();
    vi.spyOn(mongoRepository, "createMongoRepository").mockReturnValue(repository);
    vi.spyOn(EstimateModel, "findOne").mockReturnValue({ lean: async () => ({
      _id: "gate-estimate", projectId: PROJECT_ID, status: "client_approved",
      designPlanDesignerId: actor.id, designPlanStatus: "assigned"
    }) } as never);
    const service = createEstimateDesignService({ storage, audit: createAuditService(repository), maxUploadBytes: 1_000 });
    await expect(service.upload(actor, "gate-estimate", FILE)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(storage.objects.size).toBe(0);
  });

  it("uses the persisted drawing room IDs to reject pending-room estimate submission", async () => {
    const { repository, storage, actor } = setup({ state: readyState() });
    vi.spyOn(mongoRepository, "createMongoRepository").mockReturnValue(repository);
    vi.spyOn(EstimateModel, "findOne").mockReturnValue({ lean: async () => ({
      _id: "gate-estimate", projectId: PROJECT_ID, status: "client_approved",
      designPlanDesignerId: actor.id, designPlanStatus: "in_progress"
    }) } as never);
    vi.spyOn(EstimateDesignDrawingModel, "find").mockReturnValue({
      sort: () => ({ lean: async () => [{ _id: "bedroom-drawing", roomId: "room-bedroom" }] })
    } as never);
    const service = createEstimateDesignService({ storage, audit: createAuditService(repository), maxUploadBytes: 1_000 });
    await expect(service.submitDrawings(actor, "gate-estimate")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect((await repository.findDesignWorkflowState(PROJECT_ID))!.version).toBe(1);
  });

  it("rejects uploads before initial payment and stage completion without storing a file", async () => {
    const { versions, actor, storage, repository } = setup();
    await expect(versions.upload(actor, "task-furniture-layout", FILE)).rejects.toMatchObject({
      status: 409, code: "DESIGN_WORKFLOW_BLOCKED"
    });
    expect(storage.objects.size).toBe(0);
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toBeNull();
  });

  it("still requires Internal Kick off when Client Kick off and measurement are complete", async () => {
    const state = readyState();
    delete state.stages.internal_kickoff;
    const { versions, actor, storage } = setup({ state });
    await expect(versions.upload(actor, "task-furniture-layout", FILE)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(storage.objects.size).toBe(0);
  });

  it.each(["handedOverAt", "receivedAt"] as const)("requires the %s key confirmation independently", async (confirmation) => {
    const state = readyState();
    delete state.stages.key_collection![confirmation];
    const { versions, actor, storage } = setup({ state });
    await expect(versions.upload(actor, "task-furniture-layout", FILE)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(storage.objects.size).toBe(0);
  });

  it("allows preparation after universal prerequisites while furniture rooms remain pending", async () => {
    const { versions, actor, storage, repository } = setup({ state: readyState() });
    const uploaded = await versions.upload(actor, "task-furniture-layout", FILE);
    expect(uploaded.approvalStatus).toBe("draft");
    expect(storage.objects.size).toBe(1);
    expect((await repository.findDesignWorkflowState(PROJECT_ID))!.version).toBe(2);
  });

  it("rechecks an access pause after storage and compensates the uncommitted upload", async () => {
    const { versions, actor, storage, repository } = setup({ state: readyState() });
    storage.afterSave = async () => {
      const state = (await repository.findDesignWorkflowState(PROJECT_ID))!;
      await repository.saveDesignWorkflowState(PROJECT_ID, state.version, {
        ...state, pauses: [{ startedAt: NOW, endedAt: null }]
      });
    };
    await expect(versions.upload(actor, "task-furniture-layout", FILE)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(storage.objects.size).toBe(0);
    expect(storage.deleted).toHaveLength(1);
    expect(await repository.listDesignVersions(PROJECT_ID)).toHaveLength(1);
  });

  it("preserves upload behavior for legacy projects without a configured workflow", async () => {
    const { versions, actor, repository } = setup({ legacy: true });
    await expect(versions.upload(actor, "task-furniture-layout", FILE)).resolves.toMatchObject({ approvalStatus: "draft" });
    expect(await repository.findDesignWorkflowState(PROJECT_ID)).toBeNull();
  });

  it("prevents broad section submission while an affected furniture room is pending", async () => {
    const { sections, actor, repository } = setup({ state: readyState() });
    await expect(sections.submit(actor, "version-aurora-plan-1")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect((await repository.listSectionRevisions("gate-section"))[0]!.reviewStatus).toBe("draft");
    expect((await repository.findExtractionJobByVersionId("version-aurora-plan-1"))!.status).toBe("designer_review");
  });

  it("submits sections when all affected furniture rooms have data or Client permission", async () => {
    const state = readyState();
    state.stages.existing_furniture_dimensions!.rooms![1]!.proceed = true;
    const { sections, actor, repository } = setup({ state });
    await expect(sections.submit(actor, "version-aurora-plan-1")).resolves.toMatchObject({ submittedCount: 1 });
    expect((await repository.listSectionRevisions("gate-section"))[0]!.reviewStatus).toBe("submitted");
    expect((await repository.findDesignWorkflowState(PROJECT_ID))!.version).toBe(2);
  });

  it("allows a mapped room with uploaded data while another room remains pending", async () => {
    const { repository } = setup({ state: readyState() });
    await expect(assertDesignWorkflowSubmissionAllowed(repository, PROJECT_ID, { roomIds: ["room-living"] })).resolves.toBeUndefined();
    await expect(assertDesignWorkflowSubmissionAllowed(repository, PROJECT_ID, { roomIds: ["room-bedroom"] })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
  });

  it("allows explicit Client permission to proceed without dimensions for that room", async () => {
    const state = readyState();
    state.stages.existing_furniture_dimensions!.rooms![1]!.proceed = true;
    const { repository } = setup({ state });
    await expect(assertDesignWorkflowSubmissionAllowed(repository, PROJECT_ID, { roomIds: ["room-bedroom"] })).resolves.toBeUndefined();
  });

  it("rejects a different room identifier even when it has the same room name", async () => {
    const { repository } = setup({ state: readyState() });
    await expect(assertDesignWorkflowSubmissionAllowed(repository, PROJECT_ID, { roomIds: ["another-project-living"] })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
  });

  it.each(["scopeEstimateId", "scopeEstimateVersion"] as const)("rejects a stale furniture %s even when the room ID still exists", async (field) => {
    const state = readyState();
    if (field === "scopeEstimateId") state.stages.existing_furniture_dimensions!.scopeEstimateId = "different-estimate";
    else state.stages.existing_furniture_dimensions!.scopeEstimateVersion = 4;
    const { repository } = setup({ state });
    await expect(assertDesignWorkflowSubmissionAllowed(repository, PROJECT_ID, { roomIds: ["room-living"] })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
  });
});

describe("Mongo submission gate transaction", () => {
  let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
  beforeAll(async () => {
    replica = await startMongoReplicaSet("design-workflow-submission-gates");
    await Promise.all([
      ProjectModel.syncIndexes(), UserModel.syncIndexes(), TaskModel.syncIndexes(),
      DesignWorkflowStateModel.syncIndexes(), DesignVersionModel.syncIndexes(),
      DesignVersionSequenceModel.syncIndexes(), DesignExtractionJobModel.syncIndexes(), AuditEventModel.syncIndexes()
    ]);
  }, 120_000);
  afterAll(async () => replica?.stop());

  it("commits the stage lock with the upload and rolls both back on persistence failure", async () => {
    const project = demoSeedData.projects.find((item) => item.id === PROJECT_ID)!;
    const user = demoSeedData.users.find((item) => item.id === "user-designer-ananya")!;
    const task = demoSeedData.tasks.find((item) => item.id === "task-furniture-layout")!;
    await ProjectModel.create({
      ...project, _id: project.id, clientMobile: "9000000000", clientAddress: "Test address",
      designWorkflowStages: createProjectDesignWorkflow(project.id)
    });
    await UserModel.create({ ...user, _id: user.id });
    await TaskModel.create({ ...task, _id: task.id });
    const repository = mongoRepository.createMongoRepository();
    await repository.saveDesignWorkflowState(PROJECT_ID, 0, readyState());
    const actor: PublicUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    const storage = new TestStorage();
    const audit = createAuditService(repository);
    const failingService = createDesignVersionService(repository, {
      ...audit, append: async () => { throw new Error("Audit persistence failed"); }
    }, storage, () => new Date(NOW));
    await expect(failingService.upload(actor, task.id, FILE)).rejects.toThrow("Audit persistence failed");
    expect((await repository.findDesignWorkflowState(PROJECT_ID))!.version).toBe(1);
    expect(await DesignVersionModel.countDocuments()).toBe(0);
    expect(await DesignExtractionJobModel.countDocuments()).toBe(0);
    expect(storage.objects.size).toBe(0);
    const service = createDesignVersionService(repository, audit, storage, () => new Date(NOW));
    await expect(service.upload(actor, task.id, FILE)).resolves.toMatchObject({ versionNumber: 1 });
    expect((await repository.findDesignWorkflowState(PROJECT_ID))!.version).toBe(2);
    expect(await DesignVersionModel.countDocuments()).toBe(1);
    expect(await DesignExtractionJobModel.countDocuments()).toBe(1);
    expect(storage.objects.size).toBe(1);
  });
});
