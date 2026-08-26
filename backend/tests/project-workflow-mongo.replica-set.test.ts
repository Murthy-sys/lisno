import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

import { sha256Hex } from "../src/domain/estimate-client-review.js";
import type { WorkerRole } from "../src/domain/roles.js";
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
import { createEstimateDesignService } from "../src/services/estimate-design.service.js";
import { createProjectWorkflowService } from "../src/services/project-workflow.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-08-25T10:00:00.000Z");
const ESTIMATE_ID = "workflow-commercial-estimate";
const LEAD_ID = "workflow-commercial-lead";

function workerUser(
  id: string,
  name: string,
  role: WorkerRole,
  active = true
) {
  const email = `${id}@example.test`;
  return {
    _id: id,
    name,
    email,
    emailNormalized: email,
    passwordHash: "unused-by-workflow-test",
    role,
    active,
    accountKind: "standard",
    version: 1,
    managerId: null,
    authorizedClientIds: [],
    createdAt: NOW,
    updatedAt: NOW
  };
}

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

describe("Design review email retry", () => {
  it("atomically retries one failed snapshot delivery and rejects stale or unscoped attempts", async () => {
    const projectId = "workflow-email-retry-project";
    const roundId = "workflow-email-retry-round";
    const adminId = "workflow-email-retry-admin";
    const planBytes = Buffer.from("immutable Design plan retry snapshot");
    await Promise.all([
      ProjectModel.create({
        _id: projectId,
        name: "Retry Residence",
        clientId: "workflow-email-retry-client",
        clientName: "Asha Rao",
        clientEmail: "asha@example.test",
        clientEmailNormalized: "asha@example.test",
        clientMobile: "9000000000",
        clientAddress: "Pune",
        initiatingDesignerId: null,
        assignedEstimatorId: "workflow-email-retry-estimator",
        assignedDesignerIds: ["workflow-email-retry-designer"],
        managerId: null,
        status: "planning",
        location: "Pune",
        plannedStartAt: NOW,
        plannedEndAt: new Date("2026-11-23T10:00:00.000Z"),
        actualStartAt: null,
        actualEndAt: null,
        createdAt: NOW,
        updatedAt: NOW
      }),
      ProjectAccessGrantModel.create({
        _id: "workflow-email-retry-grant",
        projectId,
        userId: adminId,
        module: "projects",
        source: "admin_initiator",
        accessRequestId: null,
        grantedById: "workflow-email-retry-super-admin",
        active: true,
        grantedAt: NOW,
        revokedAt: null,
        revokedById: null,
        revocationReason: null,
        createdAt: NOW,
        updatedAt: NOW
      }),
      DesignPlanReviewRoundModel.create({
        _id: roundId,
        estimateId: "workflow-email-retry-estimate",
        projectId,
        leadId: "workflow-email-retry-lead",
        designPlanVersion: 2,
        recipientEmail: "asha@example.test",
        clientName: "Asha Rao",
        projectName: "Retry Residence",
        submittedRevisionIds: ["workflow-email-retry-revision"],
        attachments: [{
          uploadId: "workflow-email-retry-upload",
          filename: "retry-plan.pdf",
          mimeType: "application/pdf",
          byteSize: planBytes.byteLength,
          sha256: sha256Hex(planBytes),
          storageReference: "design-plans/retry-plan.pdf"
        }],
        submittedById: "workflow-email-retry-designer",
        submittedAt: NOW,
        assignedAdminId: adminId,
        deliveryStatus: "failed",
        deliveryAttemptCount: 1,
        deliveredAt: null,
        deliveryFailureCode: "SMTP_TIMEOUT",
        status: "pending",
        decision: null,
        decisionSource: null,
        decisionNote: null,
        decidedById: null,
        decidedAt: null,
        version: 3,
        createdAt: NOW,
        updatedAt: NOW
      })
    ]);
    const sendDesignPlan = vi.fn(async () => ({ kind: "sent" as const }));
    const append = vi.fn(async () => ({ id: "audit-email-retry-delivery" }));
    const appendInMongoTransaction = vi.fn(async () => ({
      id: "audit-email-retry-request"
    }));
    const workflow = createProjectWorkflowService({
      storage: {
        read: vi.fn(async (reference: string) => {
          if (reference !== "design-plans/retry-plan.pdf") {
            throw new Error(`Unexpected storage reference ${reference}`);
          }
          return Buffer.from(planBytes);
        })
      } as never,
      mailer: { deliveryKind: "local_test", sendDesignPlan },
      portalUrl: "https://portal.example.test/client",
      audit: { append, appendInMongoTransaction } as unknown as AuditService,
      now: () => NOW
    });
    const scopedAdmin = {
      id: adminId,
      name: "Ari Admin",
      email: "ari@example.test",
      role: "admin"
    } as const;

    await expect(workflow.retryDesignReviewDelivery({
      ...scopedAdmin,
      id: "workflow-email-retry-unscoped-admin",
      email: "unscoped@example.test"
    }, roundId, 3)).rejects.toMatchObject({
      status: 409,
      code: "DESIGN_PLAN_EMAIL_NOT_RETRYABLE"
    });

    const attempts = await Promise.allSettled([
      workflow.retryDesignReviewDelivery(scopedAdmin, roundId, 3),
      workflow.retryDesignReviewDelivery(scopedAdmin, roundId, 3)
    ]);
    const completed = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      value: { id: roundId, deliveryStatus: "sent", version: 6 }
    });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: {
        status: 409,
        code: "DESIGN_PLAN_EMAIL_NOT_RETRYABLE"
      }
    });
    expect(sendDesignPlan).toHaveBeenCalledOnce();
    expect(sendDesignPlan).toHaveBeenCalledWith(expect.objectContaining({
      to: "asha@example.test",
      designPlanVersion: 2,
      attachments: [{
        filename: "retry-plan.pdf",
        mimeType: "application/pdf",
        bytes: planBytes
      }]
    }));
    expect(await DesignPlanReviewRoundModel.findById(roundId).lean()).toMatchObject({
      deliveryStatus: "sent",
      deliveryAttemptCount: 2,
      deliveredAt: NOW,
      deliveryFailureCode: null,
      version: 6
    });
    expect(appendInMongoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        action: "design_plan_email_retry_requested",
        oldValues: {
          deliveryStatus: "failed",
          deliveryFailureCode: "SMTP_TIMEOUT"
        },
        newValues: { deliveryStatus: "queued" }
      }),
      expect.anything()
    );
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      actorId: adminId,
      action: "design_plan_email_delivery_sent"
    }));

    await expect(
      workflow.retryDesignReviewDelivery(scopedAdmin, roundId, 3)
    ).rejects.toMatchObject({
      status: 409,
      code: "DESIGN_PLAN_EMAIL_NOT_RETRYABLE"
    });
    expect(sendDesignPlan).toHaveBeenCalledOnce();
  });
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
        _id: adminId,
        name: "Ari Admin",
        email: "ari@example.test",
        emailNormalized: "ari@example.test",
        passwordHash: "unused-by-workflow-test",
        role: "admin",
        active: true,
        accountKind: "standard",
        version: 1,
        managerId: null,
        authorizedClientIds: [],
        createdAt: NOW,
        updatedAt: NOW
      }),
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

    const planBytes = Buffer.from("%PDF-1.7 legacy Designer plan");
    const storage = {
      read: vi.fn(async (reference: string) => {
        if (reference !== "design-plans/legacy-designer-plan.pdf") {
          throw new Error(`Missing test storage object: ${reference}`);
        }
        return Buffer.from(planBytes);
      })
    };
    const sendDesignPlan = vi.fn(async () => ({ kind: "sent" as const }));
    const append = vi.fn(async () => ({ id: "audit-legacy-delivery" }));
    const appendInMongoTransaction = vi.fn(async () => ({ id: "audit-legacy-assignment" }));
    const audit = {
      append,
      appendInMongoTransaction
    } as unknown as AuditService;
    const workflow = createProjectWorkflowService({
      storage: storage as never,
      mailer: { deliveryKind: "local_test", sendDesignPlan },
      portalUrl: "https://portal.example.test/client",
      audit,
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
      designPlanVersion: 0,
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

    const uploadId = "workflow-legacy-designer-upload";
    const pageId = "workflow-legacy-designer-page";
    const drawingId = "workflow-legacy-designer-drawing";
    const revisionId = "workflow-legacy-designer-revision";
    await Promise.all([
      EstimateDesignUploadModel.create({
        _id: uploadId,
        estimateId,
        leadId,
        originalFilename: "legacy-designer-plan.pdf",
        storedFileReference: "design-plans/legacy-designer-plan.pdf",
        mimeType: "application/pdf",
        sizeBytes: planBytes.byteLength,
        uploaderId: designerId,
        uploadedAt: NOW,
        extractionStatus: "estimator_review"
      }),
      EstimateDesignExtractionJobModel.create({
        _id: "workflow-legacy-designer-job",
        uploadId,
        status: "estimator_review",
        attemptCount: 1,
        queuedAt: NOW,
        completedAt: NOW
      }),
      EstimateDesignSourcePageModel.create({
        _id: pageId,
        uploadId,
        pageNumber: 1,
        normalizedFileReference: "design-plans/legacy-designer-page.png",
        width: 1_000,
        height: 700
      }),
      EstimateDesignDrawingModel.create({
        _id: drawingId,
        uploadId,
        sourcePageId: pageId,
        estimateId,
        active: true,
        verified: false,
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc",
        detectedTitle: "Legacy drawing",
        displayTitle: "Legacy drawing",
        source: "ocr"
      }),
      EstimateDesignRevisionModel.create({
        _id: revisionId,
        drawingId,
        revisionNumber: 1,
        sourcePageId: pageId,
        crop: { x: 0, y: 0, width: 1_000, height: 700 },
        croppedFileReference: "design-plans/legacy-designer-crop.png",
        roomId: null,
        scopeSectionId: null,
        catalogueId: null,
        mappingStatus: "misc",
        label: "Legacy drawing",
        reviewStatus: "draft"
      })
    ]);
    await EstimateModel.collection.updateOne(
      { _id: estimateId },
      { $unset: { designPlanVersion: "" } }
    );
    const physicallyVersionlessEstimate = await EstimateModel.collection.findOne({
      _id: estimateId
    });
    expect(physicallyVersionlessEstimate).not.toHaveProperty("designPlanVersion");

    const estimateDesigns = createEstimateDesignService({
      storage: storage as never,
      audit,
      maxUploadBytes: 10_000_000,
      projectWorkflow: workflow,
      now: () => NOW
    });
    const designer = {
      id: designerId,
      name: "Nia Designer",
      email: "nia@example.test",
      role: "designer"
    } as const;

    const submitted = await estimateDesigns.submitDrawings(designer, estimateId);

    expect(submitted).toMatchObject({
      submittedCount: 1,
      reviewRoundId: expect.stringMatching(/^design-plan-review-/),
      designPlanVersion: 1,
      deliveryStatus: "sent"
    });
    const [submittedEstimate, submittedRevision, submittedUpload, submittedJob, reviewRound, designTask] =
      await Promise.all([
        EstimateModel.findById(estimateId).lean(),
        EstimateDesignRevisionModel.findById(revisionId).lean(),
        EstimateDesignUploadModel.findById(uploadId).lean(),
        EstimateDesignExtractionJobModel.findOne({ uploadId }).lean(),
        DesignPlanReviewRoundModel.findById(submitted.reviewRoundId!).lean(),
        ProjectWorkflowTaskModel.findOne({
          dedupeKey: `${estimateId}:design-plan-upload`
        }).lean()
      ]);
    expect(submittedEstimate).toMatchObject({
      designPlanStatus: "ready_for_client",
      designPlanVersion: 1,
      designPlanSubmittedAt: NOW
    });
    expect(submittedRevision).toMatchObject({
      reviewStatus: "submitted",
      submittedAt: NOW
    });
    expect(submittedUpload).toMatchObject({ extractionStatus: "submitted" });
    expect(submittedJob).toMatchObject({ status: "submitted" });
    expect(reviewRound).toMatchObject({
      estimateId,
      designPlanVersion: 1,
      deliveryStatus: "sent",
      status: "pending"
    });
    expect(designTask).toMatchObject({
      assigneeUserId: designerId,
      status: "completed",
      progress: 100,
      completedAt: NOW
    });
    expect(sendDesignPlan).toHaveBeenCalledOnce();
    expect(sendDesignPlan).toHaveBeenCalledWith(expect.objectContaining({
      to: "mira@example.test",
      clientName: "Mira Rao",
      projectName: "Legacy Approval Residence",
      designPlanVersion: 1,
      attachments: [{
        filename: "legacy-designer-plan.pdf",
        mimeType: "application/pdf",
        bytes: planBytes
      }]
    }));
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
    expect(prepared.designPlanVersion).toBe(1);
    const [preparedRound, preparedEstimate] = await Promise.all([
      DesignPlanReviewRoundModel.findById(prepared.roundId)
        .select("+attachments.storageReference")
        .lean(),
      EstimateModel.findById(estimateId).lean()
    ]);
    expect(preparedEstimate).toMatchObject({
      designPlanStatus: "ready_for_client",
      designPlanVersion: 1,
      designPlanSubmittedAt: NOW
    });
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
    await expect(
      workflow.readDesignReviewAttachment(superAdmin, prepared.roundId, 0)
    ).resolves.toEqual({
      filename: "original-plan.pdf",
      mimeType: "application/pdf",
      bytes: originalBytes
    });
    await expect(workflow.readDesignReviewAttachment({
      id: "workflow-unassigned-admin",
      name: "Una Admin",
      email: "unassigned.admin@example.test",
      role: "admin"
    }, prepared.roundId, 0)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND"
    });
    storedBytes.set(
      "design-plans/original-plan.pdf",
      Buffer.from("tampered Design plan")
    );
    await expect(
      workflow.readDesignReviewAttachment(superAdmin, prepared.roundId, 0)
    ).rejects.toMatchObject({
      status: 409,
      code: "DESIGN_PLAN_ATTACHMENT_CONFLICT"
    });
    storedBytes.set("design-plans/original-plan.pdf", originalBytes);
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
      UserModel.create(workerUser(
        "workflow-worker-carpenter",
        "Carla Carpenter",
        "worker_carpenter"
      )),
      UserModel.create(workerUser(
        "workflow-worker-carpenter-next",
        "Carmen Carpenter",
        "worker_carpenter"
      )),
      UserModel.create(workerUser(
        "workflow-worker-carpenter-inactive",
        "Inactive Carpenter",
        "worker_carpenter",
        false
      )),
      UserModel.create(workerUser(
        "workflow-worker-plumber",
        "Paulo Plumber",
        "worker_plumber"
      )),
      UserModel.create(workerUser(
        "workflow-worker-electrician",
        "Elena Electrician",
        "worker_electrician"
      )),
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
    const openFinance = vi.fn(async () => ({ id: "finance-bucket-project-approved" }));
    const workflow = createProjectWorkflowService({
      storage: {} as never,
      mailer: { deliveryKind: "disabled" },
      portalUrl: "https://portal.example.test/client",
      audit: {
        appendInMongoTransaction
      } as unknown as AuditService,
      finance: { open: openFinance },
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
    expect(openFinance).toHaveBeenCalledWith({
      projectId,
      designPlanVersion: 1,
      openedById: superAdmin.id,
      occurredAt: NOW,
      fallbackBaseline: {
        estimateId,
        estimateVersion: 5,
        estimateReviewRoundId: null,
        approvedSubtotalRupees: 32_000,
        approvedGstRupees: 5_760,
        approvedContractTotalRupees: 37_760
      }
    }, expect.anything());
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
      ["finance_head", "finance"]
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
        status: "open",
        progress: 0,
        version: 1,
        assignedWorker: null
      });
    }

    for (const role of [
      "worker_carpenter",
      "worker_plumber",
      "worker_electrician"
    ] as const) {
      await expect(workflow.listOperationalTasks({
        id: `workflow-${role}`,
        name: role,
        email: `${role}@example.test`,
        role
      })).resolves.toEqual([]);
    }

    await expect(workflow.listAssignableWorkers(superAdmin)).resolves.toEqual([
      {
        id: "workflow-worker-carpenter",
        name: "Carla Carpenter",
        email: "workflow-worker-carpenter@example.test",
        role: "worker_carpenter"
      },
      {
        id: "workflow-worker-carpenter-next",
        name: "Carmen Carpenter",
        email: "workflow-worker-carpenter-next@example.test",
        role: "worker_carpenter"
      },
      {
        id: "workflow-worker-electrician",
        name: "Elena Electrician",
        email: "workflow-worker-electrician@example.test",
        role: "worker_electrician"
      },
      {
        id: "workflow-worker-plumber",
        name: "Paulo Plumber",
        email: "workflow-worker-plumber@example.test",
        role: "worker_plumber"
      }
    ]);
    const admin = {
      id: "workflow-admin",
      name: "Ari Admin",
      email: "ari@example.test",
      role: "admin"
    } as const;
    await expect(workflow.listAssignableWorkers(admin)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN"
    });

    const projectTasks = await workflow.listProjectWorkflowTasks(
      superAdmin,
      projectId
    );
    expect(projectTasks).toHaveLength(6);
    expect(projectTasks.filter(({ kind }) => kind === "trade_execution")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assigneeRole: "worker_carpenter",
          assignedWorker: null
        }),
        expect.objectContaining({
          assigneeRole: "worker_plumber",
          assignedWorker: null
        }),
        expect.objectContaining({
          assigneeRole: "worker_electrician",
          assignedWorker: null
        })
      ])
    );
    await expect(
      workflow.listProjectWorkflowTasks(admin, projectId)
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });

    const siteManager = {
      id: "workflow-site-manager",
      name: "Site Manager",
      email: "site.manager@example.test",
      role: "site_manager"
    } as const;
    const siteVisible = await workflow.listOperationalTasks(siteManager);
    expect(siteVisible).toHaveLength(4);
    expect(siteVisible).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "site_execution",
        assigneeRole: "site_manager",
        progress: 0
      }),
      expect.objectContaining({
        kind: "trade_execution",
        assigneeRole: "worker_carpenter",
        progress: 0,
        assignedWorker: null
      }),
      expect.objectContaining({
        kind: "trade_execution",
        assigneeRole: "worker_plumber",
        progress: 0
      }),
      expect.objectContaining({
        kind: "trade_execution",
        assigneeRole: "worker_electrician",
        progress: 0
      })
    ]));

    const carpenterTask = siteVisible.find(
      ({ assigneeRole }) => assigneeRole === "worker_carpenter"
    )!;
    const carpenter = {
      id: "workflow-worker-carpenter",
      name: "Carla Carpenter",
      email: "workflow-worker-carpenter@example.test",
      role: "worker_carpenter"
    } as const;

    await expect(workflow.overrideWorkerAssignment({
      actor: superAdmin,
      projectId,
      taskId: carpenterTask.id,
      expectedVersion: carpenterTask.version,
      workerId: "workflow-worker-plumber"
    })).rejects.toMatchObject({ status: 400, code: "WORKER_NOT_ASSIGNABLE" });
    await expect(workflow.overrideWorkerAssignment({
      actor: superAdmin,
      projectId,
      taskId: carpenterTask.id,
      expectedVersion: carpenterTask.version,
      workerId: "workflow-worker-carpenter-inactive"
    })).rejects.toMatchObject({ status: 400, code: "WORKER_NOT_ASSIGNABLE" });
    await expect(workflow.overrideWorkerAssignment({
      actor: admin,
      projectId,
      taskId: carpenterTask.id,
      expectedVersion: carpenterTask.version,
      workerId: carpenter.id
    })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });

    const assigned = await workflow.overrideWorkerAssignment({
      actor: superAdmin,
      projectId,
      taskId: carpenterTask.id,
      expectedVersion: carpenterTask.version,
      workerId: carpenter.id
    });
    expect(assigned).toMatchObject({
      version: 2,
      progress: 0,
      assignedWorker: {
        id: carpenter.id,
        name: carpenter.name,
        email: carpenter.email,
        role: carpenter.role,
        active: true
      }
    });
    await expect(workflow.overrideWorkerAssignment({
      actor: superAdmin,
      projectId,
      taskId: carpenterTask.id,
      expectedVersion: carpenterTask.version,
      workerId: "workflow-worker-carpenter-next"
    })).rejects.toMatchObject({ status: 409, code: "WORKFLOW_TASK_STALE" });

    await expect(workflow.listOperationalTasks(carpenter)).resolves.toEqual([
      expect.objectContaining({
        id: carpenterTask.id,
        assignedWorker: expect.objectContaining({ id: carpenter.id })
      })
    ]);
    await expect(workflow.listOperationalTasks({
      id: "workflow-worker-carpenter-next",
      name: "Carmen Carpenter",
      email: "workflow-worker-carpenter-next@example.test",
      role: "worker_carpenter"
    })).resolves.toEqual([]);

    await expect(workflow.updateOperationalTask(
      carpenter,
      carpenterTask.id,
      assigned.version,
      45
    )).resolves.toMatchObject({
      status: "in_progress",
      progress: 45,
      version: 3,
      assignedWorker: { id: carpenter.id }
    });

    expect(await workflow.listOperationalTasks(siteManager)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: carpenterTask.id,
          assigneeRole: "worker_carpenter",
          status: "in_progress",
          progress: 45,
          version: 3,
          assignedWorker: expect.objectContaining({ id: carpenter.id })
        })
      ])
    );

    const reassigned = await workflow.overrideWorkerAssignment({
      actor: superAdmin,
      projectId,
      taskId: carpenterTask.id,
      expectedVersion: 3,
      workerId: "workflow-worker-carpenter-next"
    });
    expect(reassigned).toMatchObject({
      status: "in_progress",
      progress: 45,
      version: 4,
      assignedWorker: { id: "workflow-worker-carpenter-next", active: true }
    });
    await expect(workflow.updateOperationalTask(
      carpenter,
      carpenterTask.id,
      reassigned.version,
      60
    )).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND"
    });

    const unassigned = await workflow.overrideWorkerAssignment({
      actor: superAdmin,
      projectId,
      taskId: carpenterTask.id,
      expectedVersion: reassigned.version,
      workerId: null
    });
    expect(unassigned).toMatchObject({
      progress: 45,
      version: 5,
      assignedWorker: null
    });
    const assignedAgain = await workflow.overrideWorkerAssignment({
      actor: superAdmin,
      projectId,
      taskId: carpenterTask.id,
      expectedVersion: unassigned.version,
      workerId: "workflow-worker-carpenter-next"
    });
    const completed = await workflow.updateOperationalTask({
      id: "workflow-worker-carpenter-next",
      name: "Carmen Carpenter",
      email: "workflow-worker-carpenter-next@example.test",
      role: "worker_carpenter"
    },
      carpenterTask.id,
      assignedAgain.version,
      100
    );
    expect(completed).toMatchObject({ status: "completed", version: 7 });
    await expect(workflow.overrideWorkerAssignment({
      actor: superAdmin,
      projectId,
      taskId: carpenterTask.id,
      expectedVersion: completed.version,
      workerId: carpenter.id
    })).rejects.toMatchObject({
      status: 409,
      code: "WORKFLOW_TASK_COMPLETED"
    });

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
    expect(appendInMongoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project_workflow_task_assignee_changed",
        entityId: carpenterTask.id,
        oldValues: { assigneeUserId: null, version: 1 },
        newValues: { assigneeUserId: carpenter.id, version: 2 }
      }),
      expect.anything()
    );
    expect(appendInMongoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project_workflow_task_progress_changed",
        entityId: carpenterTask.id,
        oldValues: { progress: 0, status: "open" },
        newValues: { progress: 45, status: "in_progress" }
      }),
      expect.anything()
    );
  });
});

describe("operational workflow project completion", () => {
  it("keeps the project active until the last execution task completes and keeps completion terminal", async () => {
    const projectId = "workflow-completion-sequential-project";
    const procurementTaskId = "workflow-completion-procurement";
    const financeTaskId = "workflow-completion-finance";
    await createOperationalCompletionFixture(projectId, [
      {
        id: procurementTaskId,
        kind: "procurement",
        role: "procurement"
      },
      {
        id: financeTaskId,
        kind: "finance",
        role: "finance_head"
      }
    ]);
    const appendInMongoTransaction = vi.fn(async () => ({
      id: "audit-workflow-project-completion"
    }));
    const workflow = completionWorkflow(appendInMongoTransaction);

    const first = await workflow.updateOperationalTask(
      operationalActor("procurement"),
      procurementTaskId,
      1,
      100
    );
    expect(first).toMatchObject({ status: "completed", progress: 100, version: 2 });
    expect(await ProjectModel.findById(projectId).lean()).toMatchObject({
      status: "active",
      actualEndAt: null
    });

    const last = await workflow.updateOperationalTask(
      operationalActor("finance_head"),
      financeTaskId,
      1,
      100
    );
    expect(last).toMatchObject({ status: "completed", progress: 100, version: 2 });
    expect(await ProjectModel.findById(projectId).lean()).toMatchObject({
      status: "completed",
      actualEndAt: NOW
    });
    expect(appendInMongoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project_workflow_task_progress_changed",
        entityId: financeTaskId,
        oldValues: {
          progress: 0,
          status: "open",
          projectStatus: "active",
          projectActualEndAt: null
        },
        newValues: {
          progress: 100,
          status: "completed",
          projectStatus: "completed",
          projectActualEndAt: NOW.toISOString()
        }
      }),
      expect.anything()
    );

    await expect(workflow.updateOperationalTask(
      operationalActor("finance_head"),
      financeTaskId,
      last.version,
      50
    )).rejects.toMatchObject({
      status: 409,
      code: "WORKFLOW_TASK_COMPLETED"
    });
    expect(await ProjectWorkflowTaskModel.findById(financeTaskId).lean()).toMatchObject({
      status: "completed",
      progress: 100,
      version: 2,
      completedAt: NOW
    });
    expect(await ProjectModel.findById(projectId).lean()).toMatchObject({
      status: "completed",
      actualEndAt: NOW
    });
  });

  it("serializes two concurrent final task completions so one transaction closes the project", async () => {
    const projectId = "workflow-completion-concurrent-project";
    const procurementTaskId = "workflow-completion-concurrent-procurement";
    const financeTaskId = "workflow-completion-concurrent-finance";
    await createOperationalCompletionFixture(projectId, [
      {
        id: procurementTaskId,
        kind: "procurement",
        role: "procurement"
      },
      {
        id: financeTaskId,
        kind: "finance",
        role: "finance_head"
      }
    ]);
    const workflow = completionWorkflow(vi.fn(async () => ({
      id: "audit-workflow-concurrent-completion"
    })));

    const results = await Promise.all([
      workflow.updateOperationalTask(
        operationalActor("procurement"),
        procurementTaskId,
        1,
        100
      ),
      workflow.updateOperationalTask(
        operationalActor("finance_head"),
        financeTaskId,
        1,
        100
      )
    ]);

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: procurementTaskId, status: "completed" }),
      expect.objectContaining({ id: financeTaskId, status: "completed" })
    ]));
    expect(await ProjectWorkflowTaskModel.countDocuments({
      projectId,
      status: { $ne: "completed" }
    })).toBe(0);
    expect(await ProjectModel.findById(projectId).lean()).toMatchObject({
      status: "completed",
      actualEndAt: NOW
    });
  });

  it("preserves an already completed project's original completion timestamp", async () => {
    const projectId = "workflow-completion-existing-project";
    const taskId = "workflow-completion-existing-finance";
    const originalCompletion = new Date("2026-08-20T10:00:00.000Z");
    await createOperationalCompletionFixture(
      projectId,
      [{ id: taskId, kind: "finance", role: "finance_head" }],
      { status: "completed", actualEndAt: originalCompletion }
    );
    const workflow = completionWorkflow(vi.fn(async () => ({
      id: "audit-workflow-existing-completion"
    })));

    await expect(workflow.updateOperationalTask(
      operationalActor("finance_head"),
      taskId,
      1,
      100
    )).resolves.toMatchObject({ status: "completed", progress: 100 });
    expect(await ProjectModel.findById(projectId).lean()).toMatchObject({
      status: "completed",
      actualEndAt: originalCompletion
    });
  });
});

function completionWorkflow(
  appendInMongoTransaction: ReturnType<typeof vi.fn>
) {
  return createProjectWorkflowService({
    storage: {} as never,
    mailer: { deliveryKind: "disabled" },
    portalUrl: "https://portal.example.test/client",
    audit: { appendInMongoTransaction } as unknown as AuditService,
    now: () => NOW
  });
}

function operationalActor(role: "procurement" | "finance_head") {
  return {
    id: `workflow-completion-${role}`,
    name: role,
    email: `${role}@example.test`,
    role
  } as const;
}

async function createOperationalCompletionFixture(
  projectId: string,
  tasks: Array<{
    id: string;
    kind: "procurement" | "finance";
    role: "procurement" | "finance_head";
  }>,
  projectState: {
    status: "active" | "completed";
    actualEndAt: Date | null;
  } = { status: "active", actualEndAt: null }
) {
  const createdAt = new Date(NOW.getTime() - 60_000);
  await ProjectModel.create({
    _id: projectId,
    name: "Workflow Completion Residence",
    clientId: null,
    clientName: "Client",
    clientEmail: `${projectId}@client.example.test`,
    clientEmailNormalized: `${projectId}@client.example.test`,
    clientMobile: "9000000000",
    clientAddress: "Pune",
    initiatingDesignerId: null,
    assignedEstimatorId: "workflow-completion-estimator",
    assignedDesignerIds: ["workflow-completion-designer"],
    managerId: null,
    status: projectState.status,
    location: "Pune",
    plannedStartAt: createdAt,
    plannedEndAt: new Date("2026-11-23T10:00:00.000Z"),
    actualStartAt: createdAt,
    actualEndAt: projectState.actualEndAt,
    createdAt,
    updatedAt: createdAt
  });
  await ProjectWorkflowTaskModel.create(tasks.map((task) => ({
    _id: task.id,
    dedupeKey: `${task.id}:dedupe`,
    projectId,
    estimateId: `estimate-${projectId}`,
    designPlanVersion: 1,
    kind: task.kind,
    title: `${task.kind} task`,
    description: "Completion boundary test",
    assigneeRole: task.role,
    assigneeUserId: null,
    sourceSectionId: null,
    sourceLineItemKey: null,
    roomName: null,
    status: "open",
    progress: 0,
    version: 1,
    openedAt: createdAt,
    dueAt: NOW,
    plannedEffort: 1,
    completedAt: null,
    createdAt,
    updatedAt: createdAt
  })));
}
