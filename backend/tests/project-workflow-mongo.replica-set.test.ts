import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

import { DesignPlanResponseProofModel } from "../src/models/DesignPlanResponseProof.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignExtractionJobModel } from "../src/models/EstimateDesignExtractionJob.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import type { AuditService } from "../src/services/audit.service.js";
import { createEstimateDecisionService } from "../src/services/estimate-decision.service.js";
import { createProjectWorkflowService } from "../src/services/project-workflow.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-08-25T10:00:00.000Z");
const ESTIMATE_ID = "workflow-commercial-estimate";
const LEAD_ID = "workflow-commercial-lead";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("project-workflow-tests");
  await Promise.all([
    EstimateModel.syncIndexes(),
    EstimateDesignDrawingModel.syncIndexes(),
    EstimateDesignExtractionJobModel.syncIndexes(),
    EstimateDesignRevisionModel.syncIndexes(),
    EstimateDesignSourcePageModel.syncIndexes(),
    EstimateDesignUploadModel.syncIndexes(),
    DesignPlanReviewRoundModel.syncIndexes(),
    DesignPlanResponseProofModel.syncIndexes(),
    LeadModel.syncIndexes(),
    ProjectAccessGrantModel.syncIndexes(),
    ProjectModel.syncIndexes(),
    ProjectWorkflowTaskModel.syncIndexes(),
    UserModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterAll(async () => {
  await replica.stop();
});

describe("commercial approval handoff", () => {
  it("opens unassigned Design work without drawings, a Designer team, freezing, or downstream queues", async () => {
    await LeadModel.create({
      _id: LEAD_ID,
      projectId: null,
      ownerId: "workflow-estimator",
      clientName: "Asha Rao",
      clientEmail: "asha@example.test",
      clientMobile: "9000000000",
      projectName: "Aurora Residence",
      location: "Pune",
      propertyType: "Apartment",
      source: "direct",
      stage: "estimate_sent",
      nextAction: "Client estimate decision",
      nextActionAt: NOW,
      createdAt: NOW,
      updatedAt: NOW
    });
    await EstimateModel.create({
      _id: ESTIMATE_ID,
      leadId: LEAD_ID,
      ownerId: "workflow-estimator",
      projectId: null,
      version: 3,
      designLifecycleVersion: 0,
      designFrozenAt: null,
      status: "sent_to_client",
      propertyType: "Apartment",
      rooms: [],
      scopes: ["carpentry"],
      lineItems: [{
        catalogueId: "CA02",
        roomName: "Master Bedroom",
        specification: "Wardrobe",
        unit: "sqft",
        rate: 1_000,
        quantity: 10,
        included: true,
        amount: 10_000
      }],
      subtotal: 10_000,
      gst: 1_800,
      total: 11_800,
      approvalRequired: false,
      assignedManagerId: null,
      assignedDesignerId: null,
      submittedAt: NOW,
      sentToClientAt: NOW,
      clientDecisionAt: null,
      reviews: [],
      notifications: [],
      createdAt: NOW,
      updatedAt: NOW
    });

    const drawingReadiness = vi.fn(async () => {
      throw new Error("Commercial approval must not inspect Design drawings.");
    });
    const appendInMongoTransaction = vi.fn(async () => ({ id: "audit-workflow" }));
    const service = createEstimateDecisionService({
      audit: {
        appendInMongoTransaction
      } as unknown as AuditService,
      estimateDesigns: {
        approvalReadinessForDecision: drawingReadiness
      },
      reviews: {
        requireDecisionScope: vi.fn()
      },
      now: () => NOW
    });

    const result = await service.decide({
      estimateId: ESTIMATE_ID,
      round: null,
      decision: "approve",
      note: "Approved",
      context: {
        source: "client_portal",
        actor: {
          id: "workflow-client",
          name: "Asha Rao",
          email: "asha@example.test",
          role: "client"
        },
        proof: null
      }
    });

    expect(drawingReadiness).not.toHaveBeenCalled();
    expect(result.estimate).toMatchObject({
      id: ESTIMATE_ID,
      status: "client_approved",
      designPlanStatus: "pending_assignment",
      designPlanVersion: 0,
      designPlanDesignerId: null,
      designFrozenAt: null
    });

    const [estimate, lead, projects, workflowTaskCount] = await Promise.all([
      EstimateModel.findById(ESTIMATE_ID).lean(),
      LeadModel.findById(LEAD_ID).lean(),
      ProjectModel.find().lean(),
      ProjectWorkflowTaskModel.countDocuments()
    ]);
    expect(estimate).toMatchObject({
      status: "client_approved",
      designPlanStatus: "pending_assignment",
      designPlanVersion: 0,
      designPlanDesignerId: null,
      designFrozenAt: null
    });
    expect(lead).toMatchObject({ stage: "won" });
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      clientId: "workflow-client",
      initiatingDesignerId: null,
      assignedEstimatorId: "workflow-estimator",
      assignedDesignerIds: [],
      managerId: null,
      status: "planning"
    });
    expect(workflowTaskCount).toBe(0);
    expect(appendInMongoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "estimate_design_final_approved",
        newValues: expect.objectContaining({
          status: "client_approved",
          designPlanStatus: "pending_assignment"
        })
      }),
      expect.anything()
    );
  });
});

describe("Designer assignment and task access", () => {
  it("lets Super Admin assign an active Designer and exposes the task only to that Designer", async () => {
    const projectId = "workflow-assignment-project";
    const leadId = "workflow-assignment-lead";
    const estimateId = "workflow-assignment-estimate";
    const designerId = "workflow-assigned-designer";
    await Promise.all([
      UserModel.create({
        _id: designerId,
        name: "Dee Designer",
        email: "dee@example.test",
        emailNormalized: "dee@example.test",
        passwordHash: "unused-by-workflow-test",
        role: "designer",
        active: true,
        accountKind: "standard",
        version: 1,
        managerId: null,
        authorizedClientIds: [],
        createdAt: NOW,
        updatedAt: NOW
      }),
      ProjectModel.create({
        _id: projectId,
        name: "Assignment Residence",
        clientId: "workflow-assignment-client",
        clientName: "Asha Rao",
        clientEmail: "asha@example.test",
        clientEmailNormalized: "asha@example.test",
        clientMobile: "9000000000",
        clientAddress: "Pune",
        initiatingDesignerId: null,
        assignedEstimatorId: "workflow-estimator",
        assignedDesignerIds: [],
        managerId: null,
        status: "planning",
        location: "Pune",
        plannedStartAt: NOW,
        plannedEndAt: new Date("2026-11-23T10:00:00.000Z"),
        createdAt: NOW,
        updatedAt: NOW
      }),
      LeadModel.create({
        _id: leadId,
        projectId,
        ownerId: "workflow-estimator",
        clientName: "Asha Rao",
        clientEmail: "asha@example.test",
        clientMobile: "9000000000",
        projectName: "Assignment Residence",
        location: "Pune",
        propertyType: "Apartment",
        source: "direct",
        stage: "won",
        nextAction: "Assign Designer",
        nextActionAt: NOW,
        createdAt: NOW,
        updatedAt: NOW
      }),
      EstimateModel.create({
        _id: estimateId,
        leadId,
        ownerId: "workflow-estimator",
        projectId,
        version: 4,
        designLifecycleVersion: 1,
        designFrozenAt: null,
        status: "client_approved",
        designPlanStatus: "pending_assignment",
        designPlanVersion: 0,
        propertyType: "Apartment",
        rooms: [{ id: "living-room", label: "Living Room" }],
        scopes: ["carpentry"],
        lineItems: [{
          catalogueId: "CA01",
          roomName: "Living Room",
          specification: "TV unit",
          unit: "nos",
          rate: 10_000,
          quantity: 1,
          included: true,
          amount: 10_000
        }],
        subtotal: 10_000,
        gst: 1_800,
        total: 11_800,
        approvalRequired: false,
        assignedManagerId: null,
        assignedDesignerId: null,
        submittedAt: NOW,
        sentToClientAt: NOW,
        clientDecisionAt: NOW,
        reviews: [],
        notifications: [],
        createdAt: NOW,
        updatedAt: NOW
      })
    ]);

    const workflow = createProjectWorkflowService({
      storage: {} as never,
      mailer: { deliveryKind: "disabled" },
      portalUrl: "https://portal.example.test/client",
      audit: {
        appendInMongoTransaction: vi.fn(async () => ({ id: "audit-assignment" }))
      } as unknown as AuditService,
      now: () => NOW
    });
    const superAdmin = {
      id: "workflow-super-admin",
      name: "Sam Super",
      email: "sam@example.test",
      role: "super_admin"
    } as const;
    const assignedDesigner = {
      id: designerId,
      name: "Dee Designer",
      email: "dee@example.test",
      role: "designer"
    } as const;

    await expect(
      workflow.assignDesigner(superAdmin, projectId, designerId)
    ).resolves.toMatchObject({
      estimateId,
      projectId,
      projectName: "Assignment Residence",
      clientName: "Asha Rao",
      status: "assigned",
      designPlanVersion: 0
    });

    const [estimate, project, workflowTasks] = await Promise.all([
      EstimateModel.findById(estimateId).lean(),
      ProjectModel.findById(projectId).lean(),
      ProjectWorkflowTaskModel.find().lean()
    ]);
    expect(estimate).toMatchObject({
      status: "client_approved",
      designPlanStatus: "assigned",
      designPlanDesignerId: designerId,
      designPlanAssignedById: superAdmin.id,
      designPlanAssignedAt: NOW,
      designFrozenAt: null
    });
    expect(project).toMatchObject({
      assignedDesignerIds: [designerId],
      managerId: null,
      status: "planning"
    });
    expect(workflowTasks).toHaveLength(1);
    expect(workflowTasks[0]).toMatchObject({
      dedupeKey: `${estimateId}:design-plan-upload`,
      projectId,
      estimateId,
      kind: "design_plan_upload",
      assigneeRole: "designer",
      assigneeUserId: designerId,
      status: "open"
    });

    await expect(workflow.listDesignerTasks(assignedDesigner)).resolves.toEqual([
      expect.objectContaining({ estimateId, projectId, status: "assigned" })
    ]);
    await EstimateModel.updateOne(
      { _id: estimateId },
      { $set: { designPlanStatus: "approved", designPlanVersion: 1 } }
    );
    await expect(workflow.listDesignerTasks(assignedDesigner)).resolves.toEqual([
      expect.objectContaining({
        estimateId,
        projectId,
        status: "approved",
        designPlanVersion: 1
      })
    ]);
    await expect(workflow.listDesignerTasks({
      ...assignedDesigner,
      id: "workflow-foreign-designer",
      email: "foreign@example.test"
    })).resolves.toEqual([]);
    await expect(workflow.listDesignerTasks({
      id: "workflow-estimator",
      name: "Est Estimator",
      email: "est@example.test",
      role: "estimator_sales"
    })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("lets the scoped Admin assign a Designer from a legacy approval and normalizes its stale handoff", async () => {
    const projectId = "workflow-legacy-assignment-project";
    const leadId = "workflow-legacy-assignment-lead";
    const estimateId = "workflow-legacy-assignment-estimate";
    const designerId = "workflow-legacy-selected-designer";
    const adminId = "workflow-legacy-admin";
    await Promise.all([
      UserModel.create({
        _id: designerId,
        name: "Nia Designer",
        email: "nia@example.test",
        emailNormalized: "nia@example.test",
        passwordHash: "unused-by-workflow-test",
        role: "designer",
        active: true,
        accountKind: "standard",
        version: 1,
        managerId: null,
        authorizedClientIds: [],
        createdAt: NOW,
        updatedAt: NOW
      }),
      ProjectModel.create({
        _id: projectId,
        name: "Legacy Approval Residence",
        clientId: "workflow-legacy-client",
        clientName: "Mira Rao",
        clientEmail: "mira@example.test",
        clientEmailNormalized: "mira@example.test",
        clientMobile: "9000000001",
        clientAddress: "Pune",
        initiatingDesignerId: null,
        assignedEstimatorId: "workflow-estimator",
        assignedDesignerIds: ["legacy-auto-designer"],
        managerId: "legacy-auto-manager",
        status: "planning",
        location: "Pune",
        plannedStartAt: NOW,
        plannedEndAt: new Date("2026-11-23T10:00:00.000Z"),
        createdAt: NOW,
        updatedAt: NOW
      }),
      LeadModel.create({
        _id: leadId,
        projectId,
        ownerId: "workflow-estimator",
        clientName: "Mira Rao",
        clientEmail: "mira@example.test",
        clientMobile: "9000000001",
        projectName: "Legacy Approval Residence",
        location: "Pune",
        propertyType: "Villa",
        source: "direct",
        stage: "won",
        nextAction: "project kickoff",
        nextActionAt: NOW,
        createdAt: NOW,
        updatedAt: NOW
      }),
      EstimateModel.create({
        _id: estimateId,
        leadId,
        ownerId: "workflow-estimator",
        projectId,
        version: 4,
        designLifecycleVersion: 1,
        designFrozenAt: NOW,
        status: "client_approved",
        propertyType: "Villa",
        rooms: [],
        scopes: ["carpentry"],
        lineItems: [],
        subtotal: 0,
        gst: 0,
        total: 278_704,
        approvalRequired: false,
        assignedManagerId: null,
        assignedDesignerId: "legacy-auto-designer",
        submittedAt: NOW,
        sentToClientAt: NOW,
        clientDecisionAt: NOW,
        reviews: [],
        notifications: [],
        createdAt: NOW,
        updatedAt: NOW
      }),
      ProjectAccessGrantModel.create({
        _id: "workflow-legacy-admin-grant",
        projectId,
        userId: adminId,
        module: "projects",
        source: "admin_initiator",
        accessRequestId: null,
        grantedById: adminId,
        active: true,
        grantedAt: NOW,
        revokedAt: null,
        revokedById: null,
        revocationReason: null
      })
    ]);
    await EstimateModel.collection.updateOne(
      { _id: estimateId },
      {
        $unset: {
          designPlanStatus: "",
          designPlanVersion: "",
          designPlanDesignerId: ""
        }
      }
    );

    const appendInMongoTransaction = vi.fn(async () => ({ id: "audit-legacy-assignment" }));
    const workflow = createProjectWorkflowService({
      storage: {} as never,
      mailer: { deliveryKind: "disabled" },
      portalUrl: "https://portal.example.test/client",
      audit: { appendInMongoTransaction } as unknown as AuditService,
      now: () => NOW
    });

    await expect(workflow.assignDesigner({
      id: adminId,
      name: "Ari Admin",
      email: "ari@example.test",
      role: "admin"
    }, projectId, designerId)).resolves.toMatchObject({
      estimateId,
      projectId,
      status: "assigned",
      designPlanVersion: 0
    });

    const [estimate, project, lead, workflowTasks] = await Promise.all([
      EstimateModel.findById(estimateId).lean(),
      ProjectModel.findById(projectId).lean(),
      LeadModel.findById(leadId).lean(),
      ProjectWorkflowTaskModel.find({ projectId }).lean()
    ]);
    expect(estimate).toMatchObject({
      designPlanStatus: "assigned",
      designPlanDesignerId: designerId,
      designPlanAssignedById: adminId,
      designFrozenAt: null
    });
    expect(project).toMatchObject({
      assignedDesignerIds: [designerId],
      managerId: null,
      status: "planning"
    });
    expect(lead).toMatchObject({
      stage: "won",
      nextAction: "Designer to upload design plan",
      nextActionAt: NOW
    });
    expect(workflowTasks).toEqual([
      expect.objectContaining({
        kind: "design_plan_upload",
        assigneeRole: "designer",
        assigneeUserId: designerId,
        status: "open"
      })
    ]);
    expect(appendInMongoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "design_plan_designer_assigned",
        oldValues: expect.objectContaining({
          designPlanStatus: undefined,
          projectManagerId: "legacy-auto-manager",
          nextAction: "project kickoff"
        }),
        newValues: expect.objectContaining({
          designPlanStatus: "assigned",
          designerId,
          projectManagerId: null,
          nextAction: "Designer to upload design plan"
        })
      }),
      expect.anything()
    );
  });
});

describe("Design review replacement delivery and Admin feedback", () => {
  it("emails the latest replacement snapshot and reopens both upload aggregates after proof-backed changes", async () => {
    const projectId = "workflow-replacement-project";
    const leadId = "workflow-replacement-lead";
    const estimateId = "workflow-replacement-estimate";
    const designerId = "workflow-replacement-designer";
    const originalUploadId = "workflow-original-upload";
    const replacementUploadId = "workflow-replacement-upload";
    const drawingId = "workflow-replacement-drawing";
    const originalRevisionId = "workflow-original-revision";
    const replacementRevisionId = "workflow-replacement-revision";
    const originalBytes = Buffer.from("%PDF-1.7 original Design plan");
    const replacementSourceBytes = Buffer.from("replacement source image");
    const replacementSnapshotBytes = Buffer.from("replacement drawing snapshot");

    await Promise.all([
      UserModel.create({
        _id: designerId,
        name: "Dee Designer",
        email: "replacement.designer@example.test",
        emailNormalized: "replacement.designer@example.test",
        passwordHash: "unused-by-workflow-test",
        role: "designer",
        active: true
      }),
      UserModel.create({
        _id: "workflow-review-super-admin",
        name: "Sam Super",
        email: "review.admin@example.test",
        emailNormalized: "review.admin@example.test",
        passwordHash: "unused-by-workflow-test",
        role: "super_admin",
        active: true
      }),
      ProjectModel.create({
        _id: projectId,
        name: "Replacement Residence",
        clientId: "workflow-replacement-client",
        clientName: "Asha Rao",
        clientEmail: "asha@example.test",
        clientEmailNormalized: "asha@example.test",
        clientMobile: "9000000000",
        clientAddress: "Pune",
        initiatingDesignerId: null,
        assignedEstimatorId: "workflow-estimator",
        assignedDesignerIds: [designerId],
        managerId: null,
        status: "planning",
        location: "Pune",
        plannedStartAt: NOW,
        plannedEndAt: new Date("2026-11-23T10:00:00.000Z")
      }),
      LeadModel.create({
        _id: leadId,
        projectId,
        ownerId: "workflow-estimator",
        clientName: "Asha Rao",
        clientEmail: "asha@example.test",
        clientMobile: "9000000000",
        projectName: "Replacement Residence",
        location: "Pune",
        propertyType: "Apartment",
        source: "direct",
        stage: "won",
        nextAction: "Review Design plan",
        nextActionAt: NOW
      }),
      EstimateModel.create({
        _id: estimateId,
        leadId,
        ownerId: "workflow-estimator",
        projectId,
        version: 5,
        designLifecycleVersion: 3,
        designFrozenAt: null,
        status: "client_approved",
        designPlanStatus: "in_progress",
        designPlanVersion: 0,
        designPlanDesignerId: designerId,
        designPlanAssignedById: "workflow-review-super-admin",
        designPlanAssignedAt: NOW,
        propertyType: "Apartment",
        rooms: [],
        scopes: [],
        lineItems: [],
        subtotal: 0,
        gst: 0,
        total: 0,
        approvalRequired: false,
        reviews: [],
        notifications: []
      }),
      EstimateDesignUploadModel.create({
        _id: originalUploadId,
        estimateId,
        leadId,
        originalFilename: "original-plan.pdf",
        storedFileReference: "design-plans/original-plan.pdf",
        mimeType: "application/pdf",
        sizeBytes: originalBytes.byteLength,
        uploaderId: designerId,
        uploadedAt: NOW,
        extractionStatus: "submitted"
      }),
      EstimateDesignUploadModel.create({
        _id: replacementUploadId,
        estimateId,
        leadId,
        originalFilename: "replacement.png",
        storedFileReference: "design-plans/replacement-source.png",
        mimeType: "image/png",
        sizeBytes: replacementSourceBytes.byteLength,
        uploaderId: designerId,
        uploadedAt: NOW,
        extractionStatus: "submitted",
        replacementDrawingId: drawingId,
        replacesRevisionId: originalRevisionId,
        replacementVersion: 2
      }),
      EstimateDesignExtractionJobModel.create({
        _id: "workflow-original-job",
        uploadId: originalUploadId,
        status: "submitted",
        attemptCount: 1,
        queuedAt: NOW,
        completedAt: NOW
      }),
      EstimateDesignExtractionJobModel.create({
        _id: "workflow-replacement-job",
        uploadId: replacementUploadId,
        status: "submitted",
        attemptCount: 1,
        queuedAt: NOW,
        completedAt: NOW
      }),
      EstimateDesignSourcePageModel.create({
        _id: "workflow-original-page",
        uploadId: originalUploadId,
        pageNumber: 1,
        normalizedFileReference: "design-plans/original-page.png",
        width: 1_000,
        height: 700
      }),
      EstimateDesignSourcePageModel.create({
        _id: "workflow-replacement-page",
        uploadId: replacementUploadId,
        pageNumber: 1,
        normalizedFileReference: "design-plans/replacement-source.png",
        width: 600,
        height: 400
      }),
      EstimateDesignDrawingModel.create({
        _id: drawingId,
        uploadId: originalUploadId,
        sourcePageId: "workflow-original-page",
        estimateId,
        active: true,
        verified: true,
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc",
        detectedTitle: "kitchen-layout",
        displayTitle: "kitchen-layout",
        source: "manual"
      }),
      EstimateDesignRevisionModel.create({
        _id: originalRevisionId,
        drawingId,
        revisionNumber: 1,
        sourcePageId: "workflow-original-page",
        crop: { x: 0, y: 0, width: 500, height: 350 },
        croppedFileReference: "design-plans/original-crop.png",
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc",
        label: "kitchen-layout",
        reviewStatus: "changes_requested",
        submittedAt: NOW
      }),
      EstimateDesignRevisionModel.create({
        _id: replacementRevisionId,
        drawingId,
        revisionNumber: 2,
        sourcePageId: "workflow-replacement-page",
        crop: { x: 0, y: 0, width: 600, height: 400 },
        croppedFileReference: "design-plans/replacement-crop.png",
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc",
        label: "kitchen-layout",
        reviewStatus: "submitted",
        submittedAt: NOW,
        replacementUploadId,
        replacesRevisionId: originalRevisionId
      }),
      ProjectWorkflowTaskModel.create({
        _id: "workflow-replacement-design-task",
        dedupeKey: `${estimateId}:design-plan-upload`,
        projectId,
        estimateId,
        designPlanVersion: 0,
        kind: "design_plan_upload",
        title: "Upload Design plan",
        description: "Prepare the Design plan for Client review.",
        assigneeRole: "designer",
        assigneeUserId: designerId,
        sourceSectionId: null,
        sourceLineItemKey: null,
        roomName: null,
        status: "open",
        openedAt: NOW,
        completedAt: null
      })
    ]);

    const storedBytes = new Map<string, Buffer>([
      ["design-plans/original-plan.pdf", originalBytes],
      ["design-plans/replacement-source.png", replacementSourceBytes],
      ["design-plans/replacement-crop.png", replacementSnapshotBytes]
    ]);
    const sendDesignPlan = vi.fn(async () => ({ kind: "sent" as const }));
    const workflow = createProjectWorkflowService({
      storage: {
        read: vi.fn(async (reference: string) => {
          const bytes = storedBytes.get(reference);
          if (!bytes) throw new Error(`Missing test storage object: ${reference}`);
          return Buffer.from(bytes);
        })
      } as never,
      mailer: { deliveryKind: "local_test", sendDesignPlan },
      portalUrl: "https://portal.example.test/client",
      audit: {
        append: vi.fn(async () => ({ id: "audit-delivery" })),
        appendInMongoTransaction: vi.fn(async () => ({ id: "audit-review" }))
      } as unknown as AuditService,
      now: () => NOW
    });
    const designer = {
      id: designerId,
      name: "Dee Designer",
      email: "replacement.designer@example.test",
      role: "designer"
    } as const;
    const superAdmin = {
      id: "workflow-review-super-admin",
      name: "Sam Super",
      email: "review.admin@example.test",
      role: "super_admin"
    } as const;

    const prepared = await mongoose.connection.transaction((session) =>
      workflow.prepareDesignReview(
        designer,
        estimateId,
        [replacementRevisionId],
        [originalUploadId],
        NOW,
        session
      )
    );
    const preparedRound = await DesignPlanReviewRoundModel.findById(
      prepared.roundId
    ).select("+attachments.storageReference").lean();
    expect(preparedRound?.attachments).toEqual([
      expect.objectContaining({
        uploadId: originalUploadId,
        filename: "original-plan.pdf",
        mimeType: "application/pdf",
        byteSize: originalBytes.byteLength,
        storageReference: "design-plans/original-plan.pdf"
      }),
      expect.objectContaining({
        uploadId: `revision:${replacementRevisionId}`,
        filename: "revised-kitchen-layout-v2.png",
        mimeType: "image/png",
        byteSize: replacementSnapshotBytes.byteLength,
        storageReference: "design-plans/replacement-crop.png"
      })
    ]);
    expect(await ProjectWorkflowTaskModel.findById(
      "workflow-replacement-design-task"
    ).lean()).toMatchObject({ status: "completed", completedAt: NOW });

    await workflow.deliverDesignReview(prepared.roundId, designer.id);

    expect(sendDesignPlan).toHaveBeenCalledOnce();
    expect(sendDesignPlan).toHaveBeenCalledWith(expect.objectContaining({
      to: "asha@example.test",
      designPlanVersion: 1,
      attachments: [
        {
          filename: "original-plan.pdf",
          mimeType: "application/pdf",
          bytes: originalBytes
        },
        {
          filename: "revised-kitchen-layout-v2.png",
          mimeType: "image/png",
          bytes: replacementSnapshotBytes
        }
      ]
    }));
    const deliveredRound = await DesignPlanReviewRoundModel.findById(
      prepared.roundId
    ).lean();
    expect(deliveredRound).toMatchObject({ deliveryStatus: "sent" });

    await workflow.decideDesignReviewAsAdmin({
      actor: superAdmin,
      roundId: prepared.roundId,
      expectedVersion: Number(deliveredRound!.version),
      decision: "request_changes",
      note: "Please revise the kitchen layout.",
      proof: {
        storageReference: "design-plan-proofs/client-request.pdf",
        originalFilename: "client-request.pdf",
        mimeType: "application/pdf",
        byteSize: 512,
        sha256: "d".repeat(64)
      }
    });

    const [estimate, revision, uploads, jobs, reopenedTask, decidedRound] =
      await Promise.all([
        EstimateModel.findById(estimateId).lean(),
        EstimateDesignRevisionModel.findById(replacementRevisionId).lean(),
        EstimateDesignUploadModel.find({ estimateId }).sort({ _id: 1 }).lean(),
        EstimateDesignExtractionJobModel.find({
          uploadId: { $in: [originalUploadId, replacementUploadId] }
        }).sort({ uploadId: 1 }).lean(),
        ProjectWorkflowTaskModel.findById(
          "workflow-replacement-design-task"
        ).lean(),
        DesignPlanReviewRoundModel.findById(prepared.roundId).lean()
      ]);
    expect(estimate).toMatchObject({ designPlanStatus: "changes_requested" });
    expect(revision).toMatchObject({
      reviewStatus: "changes_requested",
      reviewerId: superAdmin.id,
      changeSummary: "Please revise the kitchen layout."
    });
    expect(uploads).toHaveLength(2);
    expect(uploads.every(({ extractionStatus }) =>
      extractionStatus === "changes_requested"
    )).toBe(true);
    expect(jobs).toHaveLength(2);
    expect(jobs.every(({ status }) => status === "changes_requested")).toBe(true);
    expect(reopenedTask).toMatchObject({ status: "open", completedAt: null });
    expect(decidedRound).toMatchObject({
      status: "changes_requested",
      decision: "request_changes",
      decisionSource: "admin_proof"
    });
    expect(await DesignPlanResponseProofModel.countDocuments({
      reviewRoundId: prepared.roundId
    })).toBe(1);
  });
});

describe("approved Design plan operational queues", () => {
  it("freezes the reviewed plan and idempotently opens role-scoped coordination and trade work", async () => {
    const projectId = "workflow-approved-project";
    const leadId = "workflow-approved-lead";
    const estimateId = "workflow-approved-estimate";
    const roundId = "workflow-approved-round";
    const drawingId = "workflow-approved-drawing";
    const revisionId = "workflow-approved-revision";
    await Promise.all([
      ProjectModel.create({
        _id: projectId,
        name: "Approved Design Residence",
        clientId: "workflow-approved-client",
        clientName: "Asha Rao",
        clientEmail: "asha@example.test",
        clientEmailNormalized: "asha@example.test",
        clientMobile: "9000000000",
        clientAddress: "Pune",
        initiatingDesignerId: null,
        assignedEstimatorId: "workflow-estimator",
        assignedDesignerIds: ["workflow-designer"],
        managerId: null,
        status: "planning",
        location: "Pune",
        plannedStartAt: NOW,
        plannedEndAt: new Date("2026-11-23T10:00:00.000Z"),
        actualStartAt: null,
        createdAt: NOW,
        updatedAt: NOW
      }),
      LeadModel.create({
        _id: leadId,
        projectId,
        ownerId: "workflow-estimator",
        clientName: "Asha Rao",
        clientEmail: "asha@example.test",
        clientMobile: "9000000000",
        projectName: "Approved Design Residence",
        location: "Pune",
        propertyType: "Apartment",
        source: "direct",
        stage: "won",
        nextAction: "Approve Design plan",
        nextActionAt: NOW,
        createdAt: NOW,
        updatedAt: NOW
      }),
      EstimateModel.create({
        _id: estimateId,
        leadId,
        ownerId: "workflow-estimator",
        projectId,
        version: 5,
        designLifecycleVersion: 4,
        designFrozenAt: null,
        status: "client_approved",
        designPlanStatus: "ready_for_client",
        designPlanVersion: 1,
        designPlanDesignerId: "workflow-designer",
        designPlanAssignedById: "workflow-admin",
        designPlanAssignedAt: NOW,
        designPlanSubmittedAt: NOW,
        propertyType: "Apartment",
        rooms: [],
        scopes: ["carpentry", "civil", "electrical", "painting"],
        lineItems: [
          {
            catalogueId: "CA01",
            roomName: "Living Room",
            specification: "TV unit",
            unit: "nos",
            rate: 10_000,
            quantity: 1,
            included: true,
            amount: 10_000
          },
          {
            catalogueId: "CV02",
            roomName: "Bathroom",
            specification: "Shower fittings",
            unit: "lot",
            rate: 20_000,
            quantity: 1,
            included: true,
            amount: 20_000
          },
          {
            catalogueId: "EL01",
            roomName: "Kitchen",
            specification: "Light points",
            unit: "nos",
            rate: 500,
            quantity: 4,
            included: true,
            amount: 2_000
          },
          {
            catalogueId: "PA01",
            roomName: "Excluded Room",
            specification: "Paint",
            unit: "sqft",
            rate: 30,
            quantity: 100,
            included: false,
            amount: 0
          }
        ],
        subtotal: 32_000,
        gst: 5_760,
        total: 37_760,
        approvalRequired: false,
        assignedManagerId: null,
        assignedDesignerId: null,
        submittedAt: NOW,
        sentToClientAt: NOW,
        clientDecisionAt: NOW,
        reviews: [],
        notifications: [],
        createdAt: NOW,
        updatedAt: NOW
      }),
      DesignPlanReviewRoundModel.create({
        _id: roundId,
        estimateId,
        projectId,
        leadId,
        designPlanVersion: 1,
        recipientEmail: "asha@example.test",
        clientName: "Asha Rao",
        projectName: "Approved Design Residence",
        submittedRevisionIds: [revisionId],
        attachments: [{
          uploadId: "workflow-approved-upload",
          filename: "approved-plan.pdf",
          mimeType: "application/pdf",
          byteSize: 1_024,
          sha256: "b".repeat(64),
          storageReference: "design-plans/approved-plan.pdf"
        }],
        submittedById: "workflow-designer",
        submittedAt: NOW,
        assignedAdminId: "workflow-admin",
        deliveryStatus: "sent",
        deliveryAttemptCount: 1,
        deliveredAt: NOW,
        deliveryFailureCode: null,
        status: "pending",
        decision: null,
        decisionSource: null,
        decisionNote: null,
        decidedById: null,
        decidedAt: null,
        version: 1,
        createdAt: NOW,
        updatedAt: NOW
      }),
      EstimateDesignDrawingModel.create({
        _id: drawingId,
        uploadId: "workflow-approved-upload",
        sourcePageId: "workflow-approved-source-page",
        estimateId,
        active: true,
        verified: true,
        roomId: "living-room",
        scopeSectionId: "CA",
        catalogueId: "CA01",
        mappingStatus: "estimator_assigned",
        detectedTitle: "Living room TV unit",
        displayTitle: "Living room TV unit",
        source: "manual",
        roomConfidence: null,
        scopeConfidence: null,
        ocrConfidence: null,
        roomEvidence: [],
        scopeEvidence: [],
        createdAt: NOW,
        updatedAt: NOW
      }),
      EstimateDesignRevisionModel.create({
        _id: revisionId,
        drawingId,
        revisionNumber: 1,
        sourcePageId: "workflow-approved-source-page",
        crop: { x: 0, y: 0, width: 100, height: 100 },
        croppedFileReference: "design-plans/crop.png",
        roomId: "living-room",
        scopeSectionId: "CA",
        catalogueId: "CA01",
        mappingStatus: "estimator_assigned",
        label: "Living room TV unit",
        reviewStatus: "submitted",
        submittedAt: NOW,
        reviewerId: null,
        reviewedAt: null,
        changeSummary: null,
        annotations: null,
        createdAt: NOW,
        updatedAt: NOW
      })
    ]);

    const appendInMongoTransaction = vi.fn(async () => ({ id: "audit-approved" }));
    const workflow = createProjectWorkflowService({
      storage: {} as never,
      mailer: { deliveryKind: "disabled" },
      portalUrl: "https://portal.example.test/client",
      audit: {
        appendInMongoTransaction
      } as unknown as AuditService,
      now: () => NOW
    });
    const superAdmin = {
      id: "workflow-super-admin",
      name: "Sam Super",
      email: "sam@example.test",
      role: "super_admin"
    } as const;
    const proof = {
      storageReference: "design-plan-proofs/client-approval.pdf",
      originalFilename: "client-approval.pdf",
      mimeType: "application/pdf",
      byteSize: 512,
      sha256: "c".repeat(64)
    } as const;

    await expect(workflow.decideDesignReviewAsAdmin({
      actor: superAdmin,
      roundId,
      expectedVersion: 1,
      decision: "approve",
      note: "Approved by the Client.",
      proof
    })).resolves.toMatchObject({
      id: roundId,
      status: "approved",
      version: 2
    });

    const [estimate, project, revision, round, proofCount, tasks] = await Promise.all([
      EstimateModel.findById(estimateId).lean(),
      ProjectModel.findById(projectId).lean(),
      EstimateDesignRevisionModel.findById(revisionId).lean(),
      DesignPlanReviewRoundModel.findById(roundId).lean(),
      DesignPlanResponseProofModel.countDocuments({ reviewRoundId: roundId }),
      ProjectWorkflowTaskModel.find().sort({ kind: 1, assigneeRole: 1 }).lean()
    ]);
    expect(estimate).toMatchObject({
      designPlanStatus: "approved",
      designPlanVersion: 1,
      designPlanApprovedAt: NOW,
      designPlanApprovedById: superAdmin.id,
      designPlanApprovalSource: "admin_proof",
      designFrozenAt: NOW
    });
    expect(project).toMatchObject({ status: "active", actualStartAt: NOW });
    expect(revision).toMatchObject({
      reviewStatus: "approved",
      reviewerId: superAdmin.id,
      reviewedAt: NOW
    });
    expect(round).toMatchObject({
      status: "approved",
      decision: "approve",
      decisionSource: "admin_proof",
      version: 2
    });
    expect(proofCount).toBe(1);
    expect(tasks).toHaveLength(6);
    expect(tasks.map(({ kind, assigneeRole, sourceSectionId }) => ({
      kind,
      assigneeRole,
      sourceSectionId
    }))).toEqual(expect.arrayContaining([
      { kind: "procurement", assigneeRole: "procurement", sourceSectionId: null },
      { kind: "finance", assigneeRole: "finance_head", sourceSectionId: null },
      { kind: "site_execution", assigneeRole: "site_manager", sourceSectionId: null },
      { kind: "trade_execution", assigneeRole: "worker_carpenter", sourceSectionId: "CA" },
      { kind: "trade_execution", assigneeRole: "worker_plumber", sourceSectionId: "CV" },
      { kind: "trade_execution", assigneeRole: "worker_electrician", sourceSectionId: "EL" }
    ]));
    expect(tasks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ assigneeRole: "worker_painter" })
    ]));

    for (const [role, expectedKind] of [
      ["procurement", "procurement"],
      ["finance_head", "finance"],
      ["site_manager", "site_execution"],
      ["worker_carpenter", "trade_execution"],
      ["worker_plumber", "trade_execution"],
      ["worker_electrician", "trade_execution"]
    ] as const) {
      const visible = await workflow.listOperationalTasks({
        id: `workflow-${role}`,
        name: role,
        email: `${role}@example.test`,
        role
      });
      expect(visible).toHaveLength(1);
      expect(visible[0]).toMatchObject({
        projectId,
        estimateId,
        kind: expectedKind,
        assigneeRole: role,
        status: "open"
      });
    }

    await expect(workflow.decideDesignReviewAsAdmin({
      actor: superAdmin,
      roundId,
      expectedVersion: 1,
      decision: "approve",
      note: "Duplicate approval.",
      proof
    })).rejects.toMatchObject({
      status: 409,
      code: "DESIGN_PLAN_NOT_REVIEWABLE"
    });
    expect(await ProjectWorkflowTaskModel.countDocuments()).toBe(6);
    expect(await DesignPlanResponseProofModel.countDocuments({
      reviewRoundId: roundId
    })).toBe(1);
    expect(appendInMongoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "design_plan_approved" }),
      expect.anything()
    );
  });
});
