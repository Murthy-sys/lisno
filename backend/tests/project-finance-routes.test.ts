import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../src/middleware/errors.js";
import { createProjectFinanceRouter } from "../src/routes/project-finance.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import type {
  ProjectFinanceBucketDto,
  ProjectFinanceService
} from "../src/services/project-finance.service.js";

const ACTORS = {
  superAdmin: actor("finance-route-super-admin", "super_admin"),
  financeManager: actor("finance-route-manager", "finance_head"),
  admin: actor("finance-route-admin", "admin")
} as const;

const BUCKET: ProjectFinanceBucketDto = {
  id: "finance-bucket-project-1",
  projectId: "project-1",
  projectName: "Aurora Residence",
  projectStatus: "active",
  estimateId: "estimate-1",
  estimateVersion: 4,
  estimateReviewRoundId: "estimate-round-1",
  designPlanVersion: 2,
  currency: "INR",
  approvedSubtotalPaise: 10_000_000,
  approvedGstPaise: 1_800_000,
  approvedContractTotalPaise: 11_800_000,
  targetMarginBps: 2_000,
  targetProfitPaise: 2_000_000,
  costBudgetPaise: 8_000_000,
  procurementCostPaise: 1_250_000,
  employeePaymentPaise: 0,
  otherExpensePaise: 0,
  directSpendPaise: 1_250_000,
  overheadPaise: 250_000,
  recordedCostPaise: 1_500_000,
  remainingBudgetPaise: 6_500_000,
  currentProfitPaise: 8_500_000,
  currentMarginBps: 8_500,
  overBudget: false,
  deadlineAt: "2026-11-26T10:00:00.000Z",
  overdueDays: 0,
  deadlineStatus: "on_track",
  overdueTaskCount: 0,
  status: "open",
  version: 3,
  openedAt: "2026-08-25T10:00:00.000Z",
  closedAt: null,
  createdAt: "2026-08-24T10:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z"
};

const ENTRY = {
  id: "finance-entry-1",
  bucketId: BUCKET.id,
  projectId: BUCKET.projectId,
  type: "direct_spend" as const,
  expenseClass: "procurement" as const,
  category: "Carpentry material",
  amountPaise: 125_000,
  incurredAt: "2026-08-26T00:00:00.000Z",
  description: "Plywood advance",
  vendor: "Woodworks",
  reference: "INV-101",
  sourceSectionId: null,
  idempotencyKey: "finance-request-1",
  status: "posted" as const,
  version: 1,
  createdById: ACTORS.financeManager.id,
  voidedAt: null,
  voidedById: null,
  voidReason: null,
  createdAt: "2026-08-26T10:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z"
};

function actor(id: string, role: PublicUser["role"]): PublicUser {
  return { id, role, name: id, email: `${id}@example.test` };
}

function setup() {
  const authenticate = vi.fn(async (token: string) => {
    const authenticated = ACTORS[token as keyof typeof ACTORS];
    if (!authenticated) throw new Error(`Unknown test token ${token}`);
    return authenticated;
  });
  const service = {
    listProjects: vi.fn(async () => ({
      items: [BUCKET],
      total: 1,
      summary: {
        projectCount: 1,
        approvedContractTotalPaise: BUCKET.approvedContractTotalPaise,
        approvedGstPaise: BUCKET.approvedGstPaise,
        approvedSubtotalPaise: BUCKET.approvedSubtotalPaise,
        targetProfitPaise: BUCKET.targetProfitPaise,
        costBudgetPaise: BUCKET.costBudgetPaise,
        procurementCostPaise: BUCKET.procurementCostPaise,
        employeePaymentPaise: BUCKET.employeePaymentPaise,
        otherExpensePaise: BUCKET.otherExpensePaise,
        directSpendPaise: BUCKET.directSpendPaise,
        overheadPaise: BUCKET.overheadPaise,
        recordedCostPaise: BUCKET.recordedCostPaise,
        remainingBudgetPaise: BUCKET.remainingBudgetPaise,
        currentProfitPaise: BUCKET.currentProfitPaise,
        currentMarginBps: BUCKET.currentMarginBps,
        overBudgetProjectCount: 0,
        overdueProjectCount: 0,
        lateCompletedProjectCount: 0,
        overdueTaskCount: 0
      }
    })),
    getBucket: vi.fn(async () => BUCKET),
    listEntries: vi.fn(async () => ({ items: [ENTRY], total: 1 })),
    postEntry: vi.fn(async () => ({ entry: ENTRY, bucket: BUCKET, replayed: false }))
  } satisfies ProjectFinanceService;
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createProjectFinanceRouter(
    { authenticate } as unknown as AuthService,
    service
  ));
  app.use(errorHandler);
  return { app, service };
}

function bearer(token: keyof typeof ACTORS) {
  return `Bearer ${token}`;
}

describe("project finance routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists finance buckets with validated pagination for Super Admin", async () => {
    const { app, service } = setup();

    const response = await request(app)
      .get("/api/v1/finance/projects?limit=25&offset=5")
      .set("Authorization", bearer("superAdmin"))
      .expect(200);

    expect(service.listProjects).toHaveBeenCalledWith(
      ACTORS.superAdmin,
      { limit: 25, offset: 5 }
    );
    expect(response.body.data).toEqual({
      items: [BUCKET],
      summary: expect.objectContaining({
        projectCount: 1,
        approvedContractTotalPaise: BUCKET.approvedContractTotalPaise
      }),
      pagination: { limit: 25, offset: 5, total: 1, hasMore: false }
    });
  });

  it("allows Finance Manager to read a scoped bucket and its ledger", async () => {
    const { app, service } = setup();

    await request(app)
      .get("/api/v1/finance/projects/project-1")
      .set("Authorization", bearer("financeManager"))
      .expect(200, { data: BUCKET });
    const entries = await request(app)
      .get("/api/v1/finance/projects/project-1/entries?limit=10&offset=0")
      .set("Authorization", bearer("financeManager"))
      .expect(200);

    expect(service.getBucket).toHaveBeenCalledWith(
      ACTORS.financeManager,
      "project-1"
    );
    expect(service.listEntries).toHaveBeenCalledWith(
      ACTORS.financeManager,
      "project-1",
      { limit: 10, offset: 0 }
    );
    expect(entries.body.data.items).toEqual([ENTRY]);
  });

  it("posts a validated direct-spend ledger entry and preserves replay status", async () => {
    const { app, service } = setup();
    const body = {
      type: "direct_spend",
      expenseClass: "procurement",
      category: "Carpentry material",
      amountPaise: 125_000,
      incurredAt: "2026-08-26T00:00:00.000Z",
      description: "Plywood advance",
      vendor: "Woodworks",
      reference: "INV-101",
      idempotencyKey: "finance-request-1"
    };

    await request(app)
      .post("/api/v1/finance/projects/project-1/entries")
      .set("Authorization", bearer("financeManager"))
      .send(body)
      .expect(201, { data: { entry: ENTRY, bucket: BUCKET, replayed: false } });

    expect(service.postEntry).toHaveBeenCalledWith(
      ACTORS.financeManager,
      "project-1",
      body
    );

    service.postEntry.mockResolvedValueOnce({
      entry: ENTRY,
      bucket: BUCKET,
      replayed: true
    });
    await request(app)
      .post("/api/v1/finance/projects/project-1/entries")
      .set("Authorization", bearer("financeManager"))
      .send(body)
      .expect(200);
  });

  it("rejects unauthorized roles and malformed ledger input before the service", async () => {
    const { app, service } = setup();

    await request(app)
      .get("/api/v1/finance/projects")
      .set("Authorization", bearer("admin"))
      .expect(403);
    await request(app)
      .post("/api/v1/finance/projects/project-1/entries")
      .set("Authorization", bearer("financeManager"))
      .send({
        type: "direct_spend",
        category: "Material",
        amountPaise: 0,
        incurredAt: "not-a-date",
        description: "Invalid",
        idempotencyKey: "short",
        unexpected: true
      })
      .expect(400);

    expect(service.listProjects).not.toHaveBeenCalled();
    expect(service.postEntry).not.toHaveBeenCalled();
  });

  it("requires an expense class for direct costs and rejects it for overheads", async () => {
    const { app, service } = setup();
    const common = {
      category: "Project cost",
      amountPaise: 10_000,
      incurredAt: "2026-08-26T00:00:00.000Z",
      description: "Recorded project cost",
      idempotencyKey: "classification-request"
    };

    await request(app)
      .post("/api/v1/finance/projects/project-1/entries")
      .set("Authorization", bearer("financeManager"))
      .send({ type: "direct_spend", ...common })
      .expect(400);
    await request(app)
      .post("/api/v1/finance/projects/project-1/entries")
      .set("Authorization", bearer("financeManager"))
      .send({
        type: "overhead",
        expenseClass: "employee_payment",
        ...common
      })
      .expect(400);

    expect(service.postEntry).not.toHaveBeenCalled();
  });
});
