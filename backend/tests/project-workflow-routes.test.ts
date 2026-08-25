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
  procurement: actor("workflow-route-procurement", "procurement")
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
    listOperationalTasks: vi.fn(async () => [])
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
