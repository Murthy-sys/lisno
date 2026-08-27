import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, errorHandler } from "../src/middleware/errors.js";
import { createProcurementRouter } from "../src/routes/procurement.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import type { ProcurementService } from "../src/services/procurement.service.js";

const PROCUREMENT = actor("procurement-route-user", "procurement");
const SUPER_ADMIN = actor("procurement-route-super-admin", "super_admin");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

function actor(id: string, role: PublicUser["role"]): PublicUser {
  return { id, role, name: id, email: `${id}@example.test` };
}

function setup() {
  const authenticate = vi.fn(async (token: string) => {
    if (token === "procurement") return PROCUREMENT;
    if (token === "superAdmin") return SUPER_ADMIN;
    throw new Error("Unknown token");
  });
  const project = {
    taskId: "procurement-task",
    taskVersion: 1,
    taskStatus: "open",
    taskProgress: 0,
    openedAt: "2026-08-25T09:00:00.000Z",
    updatedAt: "2026-08-25T09:00:00.000Z",
    projectId: "project-1",
    projectName: "Aurora Residence",
    estimateId: "estimate-1",
    estimateVersion: 1,
    sections: []
  };
  const result = {
    entry: {
      id: "finance-entry-1",
      bucketId: "finance-bucket-project-1",
      projectId: "project-1",
      type: "direct_spend" as const,
      expenseClass: "procurement" as const,
      category: "Carpentry",
      amountPaise: 125_000,
      incurredAt: "2026-08-26T09:00:00.000Z",
      description: "Plywood purchase",
      vendor: "Woodworks",
      reference: "INV-101",
      sourceSectionId: "CA",
      sourceLineItemKey: "Living Room::CA01",
      supportingDocument: {
        id: "finance-document-1",
        originalFilename: "receipt.jpg",
        mimeType: "image/jpeg" as const,
        sizeBytes: JPEG.length,
        createdAt: "2026-08-26T09:00:00.000Z"
      },
      idempotencyKey: "procurement-request-1",
      status: "posted" as const,
      version: 1,
      createdById: PROCUREMENT.id,
      voidedAt: null,
      voidedById: null,
      voidReason: null,
      createdAt: "2026-08-26T09:00:00.000Z",
      updatedAt: "2026-08-26T09:00:00.000Z"
    },
    bucket: {
      id: "finance-bucket-project-1",
      projectId: "project-1",
      projectName: "Aurora Residence",
      projectStatus: "active",
      estimateId: "estimate-1",
      estimateVersion: 1,
      estimateReviewRoundId: "estimate-round-1",
      designPlanVersion: 1,
      currency: "INR" as const,
      approvedSubtotalPaise: 1_000_000,
      approvedGstPaise: 180_000,
      approvedContractTotalPaise: 1_180_000,
      targetMarginBps: 2_000 as const,
      targetProfitPaise: 200_000,
      costBudgetPaise: 800_000,
      procurementCostPaise: 125_000,
      employeePaymentPaise: 0,
      otherExpensePaise: 0,
      directSpendPaise: 125_000,
      overheadPaise: 0,
      recordedCostPaise: 125_000,
      remainingBudgetPaise: 675_000,
      currentProfitPaise: 875_000,
      currentMarginBps: 8_750,
      overBudget: false,
      deadlineAt: "2026-11-26T09:00:00.000Z",
      overdueDays: 0,
      deadlineStatus: "on_track" as const,
      overdueTaskCount: 0,
      status: "open" as const,
      version: 2,
      openedAt: "2026-08-25T09:00:00.000Z",
      closedAt: null,
      createdAt: "2026-08-25T09:00:00.000Z",
      updatedAt: "2026-08-26T09:00:00.000Z"
    },
    replayed: false
  };
  const service = {
    preflightProject: vi.fn(async () => undefined),
    listProjects: vi.fn(async () => [project]),
    postExpense: vi.fn(async () => result),
    readEntryDocument: vi.fn(async () => ({
      filename: "receipt.jpg",
      mimeType: "image/jpeg" as const,
      bytes: JPEG
    }))
  } satisfies ProcurementService;
  const app = express();
  app.use("/api/v1", createProcurementRouter(
    { authenticate } as unknown as AuthService,
    service,
    1_024
  ));
  app.use(errorHandler);
  return { app, service, project, result };
}

function bearer(token: "procurement" | "superAdmin") {
  return `Bearer ${token}`;
}

describe("procurement routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the Procurement role-wide workspace and keeps Super Admin document access in Finance", async () => {
    const { app, service, project } = setup();

    await request(app)
      .get("/api/v1/procurement/projects")
      .set("Authorization", bearer("procurement"))
      .expect(200, { data: [project] });
    expect(service.listProjects).toHaveBeenCalledWith(PROCUREMENT);

    await request(app)
      .get("/api/v1/procurement/projects")
      .set("Authorization", bearer("superAdmin"))
      .expect(403);
    expect(service.listProjects).toHaveBeenCalledTimes(1);
  });

  it("preflights scope before buffering and posts one validated receipt expense", async () => {
    const { app, service, result } = setup();

    await request(app)
      .post("/api/v1/procurement/projects/project-1/expenses")
      .set("Authorization", bearer("procurement"))
      .field("sourceLineItemKey", "Living Room::CA01")
      .field("amountPaise", "125000")
      .field("incurredAt", "2026-08-26T09:00:00.000Z")
      .field("description", "Plywood purchase")
      .field("vendor", "Woodworks")
      .field("reference", "INV-101")
      .field("idempotencyKey", "procurement-request-1")
      .attach("receipt", JPEG, {
        filename: "receipt.jpg",
        contentType: "image/jpeg"
      })
      .expect(201, { data: result });

    expect(service.preflightProject).toHaveBeenCalledWith(PROCUREMENT, "project-1");
    expect(service.postExpense).toHaveBeenCalledWith(
      PROCUREMENT,
      "project-1",
      {
        sourceLineItemKey: "Living Room::CA01",
        amountPaise: 125_000,
        incurredAt: "2026-08-26T09:00:00.000Z",
        description: "Plywood purchase",
        vendor: "Woodworks",
        reference: "INV-101",
        idempotencyKey: "procurement-request-1"
      },
      expect.objectContaining({
        originalFilename: "receipt.jpg",
        mimeType: "image/jpeg",
        sizeBytes: JPEG.length,
        data: JPEG
      })
    );
  });

  it("returns an unscoped 404 before rejecting or buffering an invalid receipt", async () => {
    const { app, service } = setup();
    service.preflightProject.mockRejectedValueOnce(
      new ApiError(404, "NOT_FOUND", "Resource not found.")
    );

    await request(app)
      .post("/api/v1/procurement/projects/other-project/expenses")
      .set("Authorization", bearer("procurement"))
      .field("sourceLineItemKey", "Living Room::CA01")
      .attach("receipt", Buffer.from("not an image"), {
        filename: "fake.jpg",
        contentType: "image/jpeg"
      })
      .expect(404);

    expect(service.postExpense).not.toHaveBeenCalled();
  });

  it("rejects a scoped TIFF receipt before calling the expense service", async () => {
    const { app, service } = setup();
    const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);

    await request(app)
      .post("/api/v1/procurement/projects/project-1/expenses")
      .set("Authorization", bearer("procurement"))
      .field("sourceLineItemKey", "Living Room::CA01")
      .field("amountPaise", "125000")
      .field("incurredAt", "2026-08-26T09:00:00.000Z")
      .field("description", "Plywood purchase")
      .field("idempotencyKey", "procurement-request-1")
      .attach("receipt", tiff, {
        filename: "receipt.tif",
        contentType: "image/tiff"
      })
      .expect(415);

    expect(service.preflightProject).toHaveBeenCalledOnce();
    expect(service.postExpense).not.toHaveBeenCalled();
  });

  it("downloads an authenticated document with private, no-sniff headers", async () => {
    const { app, service } = setup();

    const response = await request(app)
      .get("/api/v1/procurement/projects/project-1/entries/finance-entry-1/document")
      .set("Authorization", bearer("procurement"))
      .expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-type"]).toMatch(/^image\/jpeg/u);
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="receipt.jpg"'
    );
    expect(service.readEntryDocument).toHaveBeenCalledWith(
      PROCUREMENT,
      "project-1",
      "finance-entry-1"
    );
  });
});
