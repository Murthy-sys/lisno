import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, errorHandler } from "../src/middleware/errors.js";
import { createProjectWorkflowRouter } from "../src/routes/project-workflow.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import type { EstimateClientReviewStorage } from "../src/services/estimate-client-review-storage.js";
import type { ProjectWorkflowService } from "../src/services/project-workflow.service.js";

const ACTORS = {
  admin: actor("workflow-route-admin", "admin"),
  superAdmin: actor("workflow-route-super-admin", "super_admin"),
  estimator: actor("workflow-route-estimator", "estimator_sales"),
  designer: actor("workflow-route-designer", "designer"),
  procurement: actor("workflow-route-procurement", "procurement"),
  carpenter: actor("workflow-route-carpenter", "worker_carpenter")
} as const;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

function actor(id: string, role: PublicUser["role"]): PublicUser {
  return {
    id,
    role,
    name: id,
    email: `${id}@example.test`
  };
}

function setup() {
  const authenticate = vi.fn(async (token: string) => {
    const authenticated = ACTORS[token as keyof typeof ACTORS];
    if (!authenticated) throw new Error(`Unknown test token ${token}`);
    return authenticated;
  });
  const service = {
    listAssignableDesigners: vi.fn(async () => []),
    assignDesigner: vi.fn(async () => ({
      id: "estimate-1:design-plan-upload",
      estimateId: "estimate-1",
      projectId: "project-1",
      projectName: "Aurora Residence",
      clientName: "Asha Rao",
      status: "assigned",
      designPlanVersion: 0,
      rooms: [],
      scopes: [],
      lineItems: []
    })),
    listDesignerTasks: vi.fn(async () => []),
    prepareDesignReview: vi.fn(),
    deliverDesignReview: vi.fn(),
    recordClientDrawingDecision: vi.fn(),
    listDesignReviewTasks: vi.fn(async () => []),
    readDesignReviewAttachment: vi.fn(async () => ({
      filename: "design-plan.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("design plan")
    })),
    retryDesignReviewDelivery: vi.fn(async () => ({
      id: "round-1",
      estimateId: "estimate-1",
      projectId: "project-1",
      projectName: "Aurora Residence",
      clientName: "Asha Rao",
      designPlanVersion: 1,
      status: "pending",
      deliveryStatus: "sent",
      submittedAt: "2026-08-25T10:00:00.000Z",
      version: 5,
      attachmentNames: ["design-plan.pdf"]
    })),
    decideDesignReviewAsAdmin: vi.fn(async () => ({
      id: "round-1",
      estimateId: "estimate-1",
      projectId: "project-1",
      projectName: "Aurora Residence",
      clientName: "Asha Rao",
      designPlanVersion: 1,
      status: "approved",
      deliveryStatus: "sent",
      submittedAt: "2026-08-25T10:00:00.000Z",
      version: 2,
      attachmentNames: ["design-plan.pdf"]
    })),
    listAssignableWorkers: vi.fn(async () => [{
      id: "workflow-route-carpenter",
      name: "Carla Carpenter",
      email: "carla@example.test",
      role: "worker_carpenter" as const
    }]),
    listProjectWorkflowTasks: vi.fn(async () => []),
    overrideWorkerAssignment: vi.fn(async () => ({
      id: "workflow-task-1",
      projectId: "project-1",
      projectName: "Aurora Residence",
      estimateId: "estimate-1",
      kind: "trade_execution",
      title: "Carpentry · Living Room",
      description: "Execute the approved carpentry work.",
      assigneeRole: "worker_carpenter",
      assignedWorker: {
        id: "workflow-route-carpenter",
        name: "Carla Carpenter",
        email: "carla@example.test",
        role: "worker_carpenter",
        active: true
      },
      sourceSectionId: "CA",
      roomName: "Living Room",
      status: "open",
      progress: 0,
      version: 2,
      openedAt: "2026-08-25T10:00:00.000Z",
      updatedAt: "2026-08-26T10:00:00.000Z"
    })),
    listOperationalTasks: vi.fn(async () => []),
    updateOperationalTask: vi.fn(async () => ({
      id: "workflow-task-1",
      projectId: "project-1",
      projectName: "Aurora Residence",
      estimateId: "estimate-1",
      kind: "trade_execution",
      title: "Carpentry · Living Room",
      description: "Execute the approved carpentry work.",
      assigneeRole: "worker_carpenter",
      assignedWorker: {
        id: "workflow-route-carpenter",
        name: "Carla Carpenter",
        email: "carla@example.test",
        role: "worker_carpenter",
        active: true
      },
      sourceSectionId: "CA",
      roomName: "Living Room",
      status: "in_progress",
      progress: 65,
      version: 3,
      openedAt: "2026-08-25T10:00:00.000Z",
      updatedAt: "2026-08-26T10:00:00.000Z"
    }))
  } satisfies ProjectWorkflowService;
  const savedProof = {
    storageReference: "proofs/client-approval.jpg",
    originalFilename: "client-approval.jpg",
    mimeType: "image/jpeg",
    byteSize: 16,
    sha256: "a".repeat(64)
  } as const;
  const proofStorage = {
    savePdfSnapshot: vi.fn(),
    saveProof: vi.fn(async () => savedProof),
    read: vi.fn(),
    deleteQuietly: vi.fn(async () => undefined)
  } satisfies EstimateClientReviewStorage;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createProjectWorkflowRouter(
    { authenticate } as unknown as AuthService,
    service,
    proofStorage,
    2 * 1024 * 1024
  ));
  app.use(errorHandler);
  return { app, service, proofStorage, savedProof };
}

function bearer(token: keyof typeof ACTORS) {
  return `Bearer ${token}`;
}

describe("project workflow routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes scoped Admin assignment and Designer task reads to the workflow service", async () => {
    const { app, service } = setup();

    const assignment = await request(app)
      .post("/api/v1/admin/projects/project-1/design-assignment")
      .set("Authorization", bearer("admin"))
      .send({ designerId: "designer-1" })
      .expect(200);
    expect(assignment.body.data).toMatchObject({
      estimateId: "estimate-1",
      projectId: "project-1",
      status: "assigned"
    });
    expect(service.assignDesigner).toHaveBeenCalledWith(
      ACTORS.admin,
      "project-1",
      "designer-1"
    );

    await request(app)
      .post("/api/v1/admin/projects/project-1/design-assignment")
      .set("Authorization", bearer("estimator"))
      .send({ designerId: "designer-1" })
      .expect(403, {
        error: {
          code: "FORBIDDEN",
          message: "You are not authorized to perform this action."
        }
      });
    expect(service.assignDesigner).toHaveBeenCalledTimes(1);

    await request(app)
      .get("/api/v1/designer/design-plan-tasks")
      .set("Authorization", bearer("designer"))
      .expect(200, { data: [] });
    expect(service.listDesignerTasks).toHaveBeenCalledWith(ACTORS.designer);
  });

  it("validates review filters and exposes operational queues only to operational roles", async () => {
    const { app, service } = setup();

    await request(app)
      .get("/api/v1/admin/design-plan-response-tasks?status=changes_requested")
      .set("Authorization", bearer("superAdmin"))
      .expect(200, { data: [] });
    expect(service.listDesignReviewTasks).toHaveBeenCalledWith(
      ACTORS.superAdmin,
      "changes_requested"
    );

    await request(app)
      .get("/api/v1/admin/design-plan-response-tasks?status=unknown")
      .set("Authorization", bearer("admin"))
      .expect(400);
    expect(service.listDesignReviewTasks).toHaveBeenCalledTimes(1);

    await request(app)
      .get("/api/v1/workflow-tasks")
      .set("Authorization", bearer("procurement"))
      .expect(200, { data: [] });
    expect(service.listOperationalTasks).toHaveBeenCalledWith(ACTORS.procurement);

    await request(app)
      .get("/api/v1/workflow-tasks")
      .set("Authorization", bearer("designer"))
      .expect(403);
    expect(service.listOperationalTasks).toHaveBeenCalledTimes(1);
  });

  it("exposes Super Admin worker assignment reads and a versioned override", async () => {
    const { app, service } = setup();

    const workers = await request(app)
      .get("/api/v1/admin/workers")
      .set("Authorization", bearer("superAdmin"))
      .expect(200);
    expect(workers.body.data).toEqual([expect.objectContaining({
      id: "workflow-route-carpenter",
      role: "worker_carpenter"
    })]);
    expect(service.listAssignableWorkers).toHaveBeenCalledWith(ACTORS.superAdmin);

    await request(app)
      .get("/api/v1/admin/projects/project-1/workflow-tasks")
      .set("Authorization", bearer("superAdmin"))
      .expect(200, { data: [] });
    expect(service.listProjectWorkflowTasks).toHaveBeenCalledWith(
      ACTORS.superAdmin,
      "project-1"
    );

    const assigned = await request(app)
      .post("/api/v1/execution/worker-assignments/override")
      .set("Authorization", bearer("superAdmin"))
      .send({
        projectId: "project-1",
        taskId: "workflow-task-1",
        expectedVersion: 1,
        workerId: "workflow-route-carpenter"
      })
      .expect(200);
    expect(assigned.body.data).toMatchObject({
      id: "workflow-task-1",
      version: 2,
      assignedWorker: { id: "workflow-route-carpenter" }
    });
    expect(service.overrideWorkerAssignment).toHaveBeenCalledWith({
      actor: ACTORS.superAdmin,
      projectId: "project-1",
      taskId: "workflow-task-1",
      expectedVersion: 1,
      workerId: "workflow-route-carpenter"
    });

    await request(app)
      .post("/api/v1/execution/worker-assignments/override")
      .set("Authorization", bearer("superAdmin"))
      .send({
        projectId: "project-1",
        taskId: "workflow-task-1",
        expectedVersion: 0,
        workerId: null
      })
      .expect(400);
    await request(app)
      .get("/api/v1/admin/workers")
      .set("Authorization", bearer("admin"))
      .expect(403);
    await request(app)
      .post("/api/v1/execution/worker-assignments/override")
      .set("Authorization", bearer("admin"))
      .send({
        projectId: "project-1",
        taskId: "workflow-task-1",
        expectedVersion: 1,
        workerId: null
      })
      .expect(403);
    expect(service.overrideWorkerAssignment).toHaveBeenCalledTimes(1);
  });

  it("downloads a review attachment through the scoped service boundary", async () => {
    const { app, service } = setup();

    const response = await request(app)
      .get("/api/v1/admin/design-plan-response-tasks/round-1/attachments/0")
      .set("Authorization", bearer("admin"))
      .expect(200);

    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="design-plan.pdf"'
    );
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toEqual(Buffer.from("design plan"));
    expect(service.readDesignReviewAttachment).toHaveBeenCalledWith(
      ACTORS.admin,
      "round-1",
      0
    );

    await request(app)
      .get("/api/v1/admin/design-plan-response-tasks/round-1/attachments/not-an-index")
      .set("Authorization", bearer("admin"))
      .expect(400);
    await request(app)
      .get("/api/v1/admin/design-plan-response-tasks/round-1/attachments/0")
      .set("Authorization", bearer("estimator"))
      .expect(403);
    expect(service.readDesignReviewAttachment).toHaveBeenCalledTimes(1);
  });

  it("validates and forwards a versioned Design email retry for Admin roles", async () => {
    const { app, service } = setup();

    const response = await request(app)
      .post("/api/v1/admin/design-plan-response-tasks/round-1/email/retry")
      .set("Authorization", bearer("admin"))
      .send({ expectedVersion: 2 })
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: "round-1",
      status: "pending",
      deliveryStatus: "sent",
      version: 5
    });
    expect(service.retryDesignReviewDelivery).toHaveBeenCalledWith(
      ACTORS.admin,
      "round-1",
      2
    );

    await request(app)
      .post("/api/v1/admin/design-plan-response-tasks/round-1/email/retry")
      .set("Authorization", bearer("superAdmin"))
      .send({ expectedVersion: 3 })
      .expect(200);
    expect(service.retryDesignReviewDelivery).toHaveBeenLastCalledWith(
      ACTORS.superAdmin,
      "round-1",
      3
    );

    await request(app)
      .post("/api/v1/admin/design-plan-response-tasks/round-1/email/retry")
      .set("Authorization", bearer("estimator"))
      .send({ expectedVersion: 2 })
      .expect(403);
    await request(app)
      .post("/api/v1/admin/design-plan-response-tasks/round-1/email/retry")
      .set("Authorization", bearer("admin"))
      .send({ expectedVersion: 0 })
      .expect(400);
    expect(service.retryDesignReviewDelivery).toHaveBeenCalledTimes(2);
  });

  it("validates and forwards versioned worker progress updates", async () => {
    const { app, service } = setup();

    const response = await request(app)
      .patch("/api/v1/workflow-tasks/workflow-task-1")
      .set("Authorization", bearer("carpenter"))
      .send({ version: 2, progress: 65 })
      .expect(200);
    expect(response.body.data).toMatchObject({
      id: "workflow-task-1",
      status: "in_progress",
      progress: 65,
      version: 3
    });
    expect(service.updateOperationalTask).toHaveBeenCalledWith(
      ACTORS.carpenter,
      "workflow-task-1",
      2,
      65
    );

    await request(app)
      .patch("/api/v1/workflow-tasks/workflow-task-1")
      .set("Authorization", bearer("carpenter"))
      .send({ version: 2, progress: 101 })
      .expect(400);
    await request(app)
      .patch("/api/v1/workflow-tasks/workflow-task-1")
      .set("Authorization", bearer("designer"))
      .send({ version: 2, progress: 65 })
      .expect(403);
    expect(service.updateOperationalTask).toHaveBeenCalledTimes(1);
  });

  it("stores an Admin proof before the Design decision and forwards the exact version", async () => {
    const { app, service, proofStorage, savedProof } = setup();
    const response = await request(app)
      .post("/api/v1/admin/design-plan-response-tasks/round-1/decision")
      .set("Authorization", bearer("admin"))
      .field("expectedVersion", "1")
      .field("decision", "approve")
      .field("note", "Approved by the Client")
      .attach("proof", JPEG, {
        filename: "client-approval.jpg",
        contentType: "image/jpeg"
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: "round-1",
      status: "approved",
      version: 2
    });
    expect(proofStorage.saveProof).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: "client-approval.jpg",
        mimeType: "image/jpeg",
        data: JPEG
      })
    );
    expect(service.decideDesignReviewAsAdmin).toHaveBeenCalledWith({
      actor: ACTORS.admin,
      roundId: "round-1",
      expectedVersion: 1,
      decision: "approve",
      note: "Approved by the Client",
      proof: savedProof
    });
    expect(proofStorage.deleteQuietly).not.toHaveBeenCalled();
  });

  it("deletes newly stored proof when the Design decision does not commit", async () => {
    const { app, service, proofStorage, savedProof } = setup();
    service.decideDesignReviewAsAdmin.mockRejectedValueOnce(
      new ApiError(
        409,
        "DESIGN_PLAN_NOT_REVIEWABLE",
        "This Design plan is no longer awaiting review."
      )
    );

    await request(app)
      .post("/api/v1/admin/design-plan-response-tasks/round-1/decision")
      .set("Authorization", bearer("admin"))
      .field("expectedVersion", "1")
      .field("decision", "approve")
      .attach("proof", JPEG, {
        filename: "client-approval.jpg",
        contentType: "image/jpeg"
      })
      .expect(409);

    expect(proofStorage.deleteQuietly).toHaveBeenCalledWith(
      savedProof.storageReference
    );
  });
});
