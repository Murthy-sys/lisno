import { Readable } from "node:stream";

import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { FinanceEntryDocumentModel } from "../src/models/FinanceEntryDocument.js";
import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { ProcurementReceiptCleanupJobModel } from "../src/models/ProcurementReceiptCleanupJob.js";
import { ProcurementReceiptReconciliationJobModel } from "../src/models/ProcurementReceiptReconciliationJob.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import {
  createProcurementService,
  runProcurementReceiptCleanupJobs,
  runProcurementReceiptReconciliationJobs
} from "../src/services/procurement.service.js";
import { createProjectFinanceService } from "../src/services/project-finance.service.js";
import type { FileStorage, SaveFileInput } from "../src/storage/storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-08-26T09:00:00.000Z");
const PROJECT_ID = "procurement-project";
const ESTIMATE_ID = "procurement-estimate";
const ROUND_ID = "procurement-estimate-round";
const PROCUREMENT_ID = "procurement-user";
const SUPER_ADMIN_ID = "procurement-super-admin";
const OTHER_PROCUREMENT_ID = "other-procurement-user";
const CARPENTRY_LINE_ID = `legacy-estimate-line:${ESTIMATE_ID}:1:0`;
const ELECTRICAL_LINE_ID = `legacy-estimate-line:${ESTIMATE_ID}:1:1`;
const RECEIPT = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-tests");
  await Promise.all([
    AuditEventModel.syncIndexes(),
    EstimateClientReviewRoundModel.syncIndexes(),
    EstimateModel.syncIndexes(),
    FinanceEntryDocumentModel.syncIndexes(),
    FinanceLedgerEntryModel.syncIndexes(),
    ProjectFinanceBucketModel.syncIndexes(),
    ProjectModel.syncIndexes(),
    ProjectWorkflowTaskModel.syncIndexes(),
    ProcurementReceiptCleanupJobModel.syncIndexes(),
    ProcurementReceiptReconciliationJobModel.syncIndexes(),
    UserModel.syncIndexes()
  ]);
}, 120_000);

beforeEach(async () => {
  await replica.clear();
  await createFixture();
});

afterAll(async () => {
  await replica.stop();
});

describe("Procurement approved-item workspace and receipt ledger", () => {
  it("groups only included immutable approved-snapshot items by section", async () => {
    const storage = new MemoryStorage();
    const service = procurementService(storage);

    const projects = await service.listProjects(procurementActor());

    expect(projects).toEqual([expect.objectContaining({
      taskId: "procurement-task",
      taskVersion: 1,
      taskStatus: "open",
      taskProgress: 0,
      projectId: PROJECT_ID,
      projectName: "Procurement Residence",
      estimateId: ESTIMATE_ID,
      estimateVersion: 1,
      sections: [
        expect.objectContaining({
          id: "CA",
          label: "Carpentry",
          estimatedAmountPaise: 200_000,
          actualSpendPaise: 0,
          items: [expect.objectContaining({
            key: CARPENTRY_LINE_ID,
            catalogueId: "CA01",
            roomName: "Living Room",
            estimatedAmountPaise: 200_000,
            actualSpendPaise: 0,
            expenses: []
          })]
        }),
        expect.objectContaining({
          id: "EL",
          label: "Electrical",
          estimatedAmountPaise: 50_000,
          items: [expect.objectContaining({ key: ELECTRICAL_LINE_ID })]
        })
      ]
    })]);
    expect(JSON.stringify(projects)).not.toContain("PA01");
  });

  it("atomically records one paise-accurate expense, receipt, bucket update, and sanitized audit event", async () => {
    const storage = new MemoryStorage();
    const service = procurementService(storage);
    const expense = expenseInput();

    const posted = await service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expense,
      receiptUpload()
    );

    expect(posted).toMatchObject({
      replayed: false,
      entry: {
        projectId: PROJECT_ID,
        type: "direct_spend",
        expenseClass: "procurement",
        amountPaise: 125_000,
        sourceSectionId: "CA",
        sourceLineItemKey: CARPENTRY_LINE_ID,
        sourceSectionLabel: "Carpentry",
        sourceLineItemLabel: "Plywood and laminate · Living Room",
        supportingDocument: {
          originalFilename: "carpentry-receipt.jpg",
          mimeType: "image/jpeg",
          sizeBytes: RECEIPT.length
        }
      },
      bucket: {
        procurementCostPaise: 125_000,
        directSpendPaise: 125_000,
        recordedCostPaise: 125_000,
        remainingBudgetPaise: 675_000
      }
    });
    expect(await FinanceLedgerEntryModel.countDocuments({ projectId: PROJECT_ID })).toBe(1);
    expect(await FinanceEntryDocumentModel.countDocuments({ projectId: PROJECT_ID })).toBe(1);
    await expect(ProcurementReceiptReconciliationJobModel.findOne()
      .select("+leaseToken")
      .lean()).resolves.toMatchObject({
        status: "committed",
        cleanupStatus: null,
        attempts: 0,
        leaseToken: null,
        leaseExpiresAt: null
      });
    await expect(ProjectFinanceBucketModel.findOne({ projectId: PROJECT_ID }).lean())
      .resolves.toMatchObject({ directSpendPaise: 125_000, version: 2 });
    const audit = await AuditEventModel.findOne({
      action: "procurement_expense_recorded"
    }).lean();
    expect(audit).toMatchObject({
      actorId: PROCUREMENT_ID,
      entityId: posted.entry.id,
      newValues: {
        projectId: PROJECT_ID,
        sourceSectionId: "CA",
        sourceLineItemKey: CARPENTRY_LINE_ID,
        supportingDocumentMimeType: "image/jpeg",
        supportingDocumentSize: RECEIPT.length
      }
    });
    expect(JSON.stringify(audit)).not.toContain("125000");
    expect(JSON.stringify(audit)).not.toContain("carpentry-receipt.jpg");
    expect(JSON.stringify(audit)).not.toContain("stored-receipt");

    const workspace = await service.listProjects(procurementActor());
    expect(workspace[0]!.sections[0]).toMatchObject({
      id: "CA",
      actualSpendPaise: 125_000,
      items: [expect.objectContaining({
        actualSpendPaise: 125_000,
        expenses: [expect.objectContaining({ id: posted.entry.id })]
      })]
    });
    const procurementDownload = await service.readEntryDocument(
      procurementActor(),
      PROJECT_ID,
      posted.entry.id
    );
    expect(procurementDownload.bytes).toEqual(RECEIPT);

    const finance = createProjectFinanceService({
      now: () => NOW,
      storage
    });
    const entries = await finance.listEntries(
      superAdminActor(),
      PROJECT_ID,
      { limit: 20, offset: 0 }
    );
    expect(entries.items).toEqual([
      expect.objectContaining({
        id: posted.entry.id,
        /*
         * The ledger keeps the opaque approved-line key for reconciliation,
         * but resolves it to approved names so no client has to show an id.
         */
        sourceLineItemKey: CARPENTRY_LINE_ID,
        sourceSectionLabel: "Carpentry",
        sourceLineItemLabel: "Plywood and laminate · Living Room",
        supportingDocument: expect.objectContaining({
          originalFilename: "carpentry-receipt.jpg"
        })
      })
    ]);
    await expect(finance.readEntryDocument(
      superAdminActor(),
      PROJECT_ID,
      posted.entry.id
    )).resolves.toMatchObject({ bytes: RECEIPT });
  });

  it.each([
    ["decisionSource", "tampered", "list"],
    ["decidedById", null, "preflight"],
    ["decidedAt", null, "post"]
  ] as const)(
    "fails closed for invalid Client approval evidence %s even with an existing bucket",
    async (field, value, operation) => {
      await EstimateClientReviewRoundModel.collection.updateOne(
        { _id: ROUND_ID },
        { $set: { [field]: value } }
      );
      const storage = new MemoryStorage();
      const service = procurementService(storage);
      const request = operation === "list"
        ? service.listProjects(procurementActor())
        : operation === "preflight"
          ? service.preflightProject(procurementActor(), PROJECT_ID)
          : service.postExpense(
              procurementActor(),
              PROJECT_ID,
              expenseInput(),
              receiptUpload()
            );

      await expect(request).rejects.toMatchObject({
        status: 409,
        code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT"
      });
      expect(await ProjectFinanceBucketModel.countDocuments({
        projectId: PROJECT_ID
      })).toBe(1);
      expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
      expect(storage.files.size).toBe(0);
    }
  );

  it.each([
    ["designPlanApprovalSource", "tampered", "list"],
    ["designPlanApprovedById", null, "preflight"],
    ["designPlanApprovedAt", null, "post"]
  ] as const)(
    "fails closed for invalid Design approval evidence %s even with an existing bucket",
    async (field, value, operation) => {
      await EstimateModel.collection.updateOne(
        { _id: ESTIMATE_ID },
        { $set: { [field]: value } }
      );
      const storage = new MemoryStorage();
      const service = procurementService(storage);
      const request = operation === "list"
        ? service.listProjects(procurementActor())
        : operation === "preflight"
          ? service.preflightProject(procurementActor(), PROJECT_ID)
          : service.postExpense(
              procurementActor(),
              PROJECT_ID,
              expenseInput(),
              receiptUpload()
            );

      await expect(request).rejects.toMatchObject({
        status: 409,
        code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT"
      });
      expect(await ProjectFinanceBucketModel.countDocuments({
        projectId: PROJECT_ID
      })).toBe(1);
      expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
      expect(storage.files.size).toBe(0);
    }
  );

  it("atomically creates one bucket for concurrent first purchases", async () => {
    await ProjectFinanceBucketModel.deleteOne({ projectId: PROJECT_ID });
    const storage = new MemoryStorage();
    const service = procurementService(storage);

    const [carpentry, electrical] = await Promise.all([
      service.postExpense(
        procurementActor(),
        PROJECT_ID,
        expenseInput({ idempotencyKey: "procurement-first-carpentry" }),
        receiptUpload()
      ),
      service.postExpense(
        procurementActor(),
        PROJECT_ID,
        expenseInput({
          sourceLineItemKey: ELECTRICAL_LINE_ID,
          amountPaise: 50_000,
          idempotencyKey: "procurement-first-electrical"
        }),
        receiptUpload()
      )
    ]);

    expect([carpentry.replayed, electrical.replayed]).toEqual([false, false]);
    expect(await ProjectFinanceBucketModel.countDocuments({
      projectId: PROJECT_ID
    })).toBe(1);
    await expect(ProjectFinanceBucketModel.findOne({ projectId: PROJECT_ID }).lean())
      .resolves.toMatchObject({
        status: "open",
        directSpendPaise: 175_000,
        version: 4
      });
    expect(await FinanceLedgerEntryModel.countDocuments({
      projectId: PROJECT_ID
    })).toBe(2);
    expect(await FinanceEntryDocumentModel.countDocuments({
      projectId: PROJECT_ID
    })).toBe(2);
    expect(storage.files.size).toBe(2);
  });

  it("deduplicates concurrent retries and deletes the redundant uploaded object", async () => {
    const storage = new MemoryStorage();
    const service = procurementService(storage);

    const [left, right] = await Promise.all([
      service.postExpense(
        procurementActor(),
        PROJECT_ID,
        expenseInput(),
        receiptUpload()
      ),
      service.postExpense(
        procurementActor(),
        PROJECT_ID,
        expenseInput(),
        receiptUpload()
      )
    ]);

    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    expect(left.entry.id).toBe(right.entry.id);
    expect(await FinanceLedgerEntryModel.countDocuments({ projectId: PROJECT_ID })).toBe(1);
    expect(await FinanceEntryDocumentModel.countDocuments({ projectId: PROJECT_ID })).toBe(1);
    expect(storage.files.size).toBe(1);
    expect(storage.deleted).toHaveLength(1);
    await expect(ProjectFinanceBucketModel.findOne({ projectId: PROJECT_ID }).lean())
      .resolves.toMatchObject({ directSpendPaise: 125_000, version: 2 });
  });

  it("deletes a newly stored receipt when the finance bucket closes before posting", async () => {
    const storage = new MemoryStorage();
    const service = procurementService(storage);
    await ProjectFinanceBucketModel.updateOne(
      { projectId: PROJECT_ID },
      { $set: { status: "closed" } }
    );

    await expect(service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput(),
      receiptUpload()
    )).rejects.toMatchObject({ status: 409, code: "FINANCE_BUCKET_NOT_OPEN" });

    expect(storage.files.size).toBe(0);
    expect(storage.deleted).toHaveLength(1);
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
    expect(await FinanceEntryDocumentModel.countDocuments()).toBe(0);
  });

  it("durably reconciles an unknown commit after reassignment and retains the committed receipt", async () => {
    const storage = new MemoryStorage();
    let intentObservedBeforeTransaction = false;
    const service = procurementService(storage, {
      beforeTransactionStart: async () => {
        intentObservedBeforeTransaction = await ProcurementReceiptReconciliationJobModel
          .exists({
            projectId: PROJECT_ID,
            idempotencyKey: "procurement-request-0001",
            status: "pending"
          }) !== null;
      },
      afterTransactionCommit: () => {
        throw new Error("simulated response loss after commit");
      },
      beforeCommitProbe: () => {
        throw new Error("simulated probe outage");
      }
    });

    await expect(service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput(),
      receiptUpload()
    )).rejects.toThrow("simulated response loss after commit");

    expect(storage.files.size).toBe(1);
    expect(storage.deleted).toHaveLength(0);
    expect(intentObservedBeforeTransaction).toBe(true);
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(1);
    await expect(ProcurementReceiptReconciliationJobModel.findOne().lean())
      .resolves.toMatchObject({
        projectId: PROJECT_ID,
        idempotencyKey: "procurement-request-0001",
        status: "committed",
        attempts: 0
      });
    await expect(runProcurementReceiptReconciliationJobs({
      storage,
      now: NOW
    })).resolves.toMatchObject({ claimed: 0 });

    await ProjectWorkflowTaskModel.updateOne(
      { _id: "procurement-task" },
      { $set: { assigneeUserId: OTHER_PROCUREMENT_ID } }
    );
    const run = await runProcurementReceiptReconciliationJobs({
      storage,
      now: new Date(NOW.getTime() + 5 * 60_000)
    });

    expect(run).toEqual({
      claimed: 0,
      completed: 0,
      retried: 0,
      deadLettered: 0
    });
    await expect(ProcurementReceiptReconciliationJobModel.findOne().lean())
      .resolves.toMatchObject({ status: "committed", attempts: 0 });
    expect(storage.files.size).toBe(1);
    expect(storage.deleted).toHaveLength(0);
  });

  it("deletes a saved receipt and never starts finance work when intent persistence fails", async () => {
    const storage = new MemoryStorage();
    const beforeTransactionStart = vi.fn();
    const intentWrite = vi.spyOn(
      ProcurementReceiptReconciliationJobModel,
      "updateOne"
    ).mockRejectedValueOnce(new Error("simulated reconciliation database outage"));
    const service = procurementService(storage, { beforeTransactionStart });

    await expect(service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput(),
      receiptUpload()
    )).rejects.toMatchObject({
      status: 500,
      code: "PROCUREMENT_RECEIPT_RECONCILIATION_UNTRACKED"
    });

    expect(intentWrite).toHaveBeenCalledOnce();
    expect(beforeTransactionStart).not.toHaveBeenCalled();
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
    expect(await FinanceEntryDocumentModel.countDocuments()).toBe(0);
    expect(await ProcurementReceiptReconciliationJobModel.countDocuments()).toBe(0);
    expect(storage.files.size).toBe(0);
    expect(storage.deleted).toEqual(["stored-receipt-1.jpg"]);
  });

  it("aborts finance writes when reconciliation owns an expired request intent", async () => {
    const storage = new MemoryStorage();
    let releaseTransaction!: () => void;
    let signalPaused!: () => void;
    const paused = new Promise<void>((resolve) => {
      signalPaused = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    const service = procurementService(storage, {
      beforeTransactionStart: async () => {
        signalPaused();
        await resume;
      }
    });

    const posting = service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput(),
      receiptUpload()
    );
    await paused;
    const reconciliation = await runProcurementReceiptReconciliationJobs({
      storage,
      now: new Date(NOW.getTime() + 5 * 60_000)
    });
    expect(reconciliation).toMatchObject({ claimed: 1, completed: 1 });
    releaseTransaction();

    await expect(posting).rejects.toMatchObject({
      status: 409,
      code: "PROCUREMENT_RECEIPT_INTENT_LOST"
    });
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(0);
    expect(await FinanceEntryDocumentModel.countDocuments()).toBe(0);
    await expect(ProjectFinanceBucketModel.findOne({ projectId: PROJECT_ID }).lean())
      .resolves.toMatchObject({ directSpendPaise: 0, version: 1 });
    await expect(ProcurementReceiptReconciliationJobModel.findOne().lean())
      .resolves.toMatchObject({
        status: "aborted",
        cleanupStatus: "deleted",
        attempts: 1
      });
    expect(storage.files.size).toBe(0);
  });

  it("reconciles a same-content replay with a redundant storage reference as an abort", async () => {
    const storage = new MemoryStorage();
    const service = procurementService(storage);
    await service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput(),
      receiptUpload()
    );
    const document = await FinanceEntryDocumentModel.findOne({
      projectId: PROJECT_ID
    }).select("+sha256").lean();
    storage.files.set("redundant-receipt.jpg", Buffer.from(RECEIPT));
    await ProcurementReceiptReconciliationJobModel.create({
      _id: "redundant-reconciliation-job",
      projectId: PROJECT_ID,
      idempotencyKey: "procurement-request-0001",
      contentSha256: String(document!.sha256),
      sizeBytes: RECEIPT.length,
      storageReference: "redundant-receipt.jpg",
      status: "pending",
      cleanupStatus: null,
      attempts: 0,
      lastErrorCode: null,
      lastAttemptAt: null,
      nextAttemptAt: NOW,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: null,
      deadLetteredAt: null
    });

    const run = await runProcurementReceiptReconciliationJobs({
      storage,
      now: NOW
    });

    expect(run).toMatchObject({ claimed: 1, completed: 1, deadLettered: 0 });
    await expect(ProcurementReceiptReconciliationJobModel.findById(
      "redundant-reconciliation-job"
    ).lean()).resolves.toMatchObject({
      status: "aborted",
      cleanupStatus: "deleted"
    });
    expect(storage.files.has("redundant-receipt.jpg")).toBe(false);
  });

  it("durably reconciles a confirmed abort after reassignment and deletes its receipt", async () => {
    const storage = new MemoryStorage();
    const service = procurementService(storage, {
      beforeCommitProbe: () => {
        throw new Error("simulated probe outage");
      }
    });
    await ProjectFinanceBucketModel.updateOne(
      { projectId: PROJECT_ID },
      { $set: { status: "closed" } }
    );

    await expect(service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput(),
      receiptUpload()
    )).rejects.toMatchObject({ status: 409, code: "FINANCE_BUCKET_NOT_OPEN" });

    expect(storage.files.size).toBe(1);
    expect(await ProcurementReceiptReconciliationJobModel.countDocuments()).toBe(1);
    await ProjectWorkflowTaskModel.updateOne(
      { _id: "procurement-task" },
      { $set: { assigneeUserId: OTHER_PROCUREMENT_ID } }
    );

    await runProcurementReceiptReconciliationJobs({
      storage,
      now: new Date(NOW.getTime() + 5 * 60_000)
    });

    await expect(ProcurementReceiptReconciliationJobModel.findOne().lean())
      .resolves.toMatchObject({
        status: "aborted",
        cleanupStatus: "deleted",
        attempts: 1
      });
    expect(storage.files.size).toBe(0);
    expect(storage.deleted).toEqual(["stored-receipt-1.jpg"]);
  });

  it("persists failed cleanup for observable retry and compensates on the next write", async () => {
    const storage = new MemoryStorage();
    storage.failDelete = true;
    const service = procurementService(storage);
    const bucket = await ProjectFinanceBucketModel.findOne({ projectId: PROJECT_ID }).lean();
    await ProjectFinanceBucketModel.updateOne(
      { projectId: PROJECT_ID },
      { $set: { status: "closed" } }
    );

    await expect(service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput(),
      receiptUpload()
    )).rejects.toMatchObject({ status: 409, code: "FINANCE_BUCKET_NOT_OPEN" });

    expect(storage.files.size).toBe(1);
    await expect(ProcurementReceiptCleanupJobModel.findOne().lean())
      .resolves.toMatchObject({
        status: "pending",
        attempts: 1,
        lastErrorCode: "EIO",
        nextAttemptAt: new Date(NOW.getTime() + 60_000)
      });

    storage.failDelete = false;
    await runProcurementReceiptCleanupJobs({
      storage,
      now: new Date(NOW.getTime() + 60_000)
    });
    await ProjectFinanceBucketModel.deleteOne({ projectId: PROJECT_ID });
    await ProjectFinanceBucketModel.create(bucket!);
    await service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput(),
      receiptUpload()
    );

    await expect(ProcurementReceiptCleanupJobModel.findOne().lean())
      .resolves.toMatchObject({ status: "completed", attempts: 1 });
    expect(storage.files.size).toBe(1);
    expect(storage.deleted).toContain("stored-receipt-1.jpg");
  });

  it("uses fair leased cleanup claims so ten permanent failures do not starve a later job", async () => {
    const storage = new MemoryStorage();
    const jobs = Array.from({ length: 11 }, (_, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      const storageReference = `cleanup-${suffix}.jpg`;
      storage.files.set(storageReference, Buffer.from(RECEIPT));
      if (index < 10) storage.failDeleteReferences.add(storageReference);
      return {
        _id: `cleanup-job-${suffix}`,
        storageReference,
        status: "pending",
        attempts: 1,
        lastErrorCode: "EIO",
        lastAttemptAt: new Date(NOW.getTime() - 60_000),
        nextAttemptAt: NOW,
        leaseToken: null,
        leaseExpiresAt: null,
        completedAt: null,
        deadLetteredAt: null
      };
    });
    await ProcurementReceiptCleanupJobModel.create(jobs);

    const run = await runProcurementReceiptCleanupJobs({
      storage,
      now: NOW,
      limit: 11
    });

    expect(run).toEqual({
      claimed: 11,
      completed: 1,
      retried: 10,
      deadLettered: 0
    });
    await expect(ProcurementReceiptCleanupJobModel.findById("cleanup-job-11").lean())
      .resolves.toMatchObject({ status: "completed" });
    expect(storage.files.has("cleanup-11.jpg")).toBe(false);
    expect(await ProcurementReceiptCleanupJobModel.countDocuments({
      status: "pending",
      attempts: 2,
      nextAttemptAt: new Date(NOW.getTime() + 120_000)
    })).toBe(10);
  });

  it("dead-letters cleanup after bounded exponential retries and retains the object", async () => {
    const storage = new MemoryStorage();
    storage.files.set("cleanup-dead-letter.jpg", Buffer.from(RECEIPT));
    storage.failDeleteReferences.add("cleanup-dead-letter.jpg");
    await ProcurementReceiptCleanupJobModel.create({
      _id: "cleanup-dead-letter-job",
      storageReference: "cleanup-dead-letter.jpg",
      status: "pending",
      attempts: 5,
      lastErrorCode: "EIO",
      lastAttemptAt: new Date(NOW.getTime() - 60_000),
      nextAttemptAt: NOW,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: null,
      deadLetteredAt: null
    });

    const run = await runProcurementReceiptCleanupJobs({ storage, now: NOW });

    expect(run).toMatchObject({ claimed: 1, deadLettered: 1 });
    await expect(ProcurementReceiptCleanupJobModel.findById(
      "cleanup-dead-letter-job"
    ).lean()).resolves.toMatchObject({
      status: "dead_letter",
      attempts: 6,
      lastErrorCode: "EIO",
      deadLetteredAt: NOW
    });
    expect(storage.files.has("cleanup-dead-letter.jpg")).toBe(true);
  });

  it("does not expose a supporting-document DTO with corrupted lineage", async () => {
    const storage = new MemoryStorage();
    const service = procurementService(storage);
    const posted = await service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput(),
      receiptUpload()
    );
    await FinanceEntryDocumentModel.collection.updateOne(
      { entryId: posted.entry.id },
      { $set: { sourceLineItemKey: ELECTRICAL_LINE_ID } }
    );

    const workspace = await service.listProjects(procurementActor());
    expect(workspace[0]!.sections[0]!.items[0]!.expenses[0]!.supportingDocument)
      .toBeNull();
    const finance = createProjectFinanceService({ now: () => NOW, storage });
    const entries = await finance.listEntries(
      superAdminActor(),
      PROJECT_ID,
      { limit: 20, offset: 0 }
    );
    expect(entries.items[0]!.supportingDocument).toBeNull();
    await expect(finance.readEntryDocument(
      superAdminActor(),
      PROJECT_ID,
      posted.entry.id
    )).rejects.toThrow("Project finance storage is inconsistent.");
  });

  it("keeps duplicate room/catalogue rows distinct and allows spending on each", async () => {
    await EstimateClientReviewRoundModel.collection.updateOne(
      { _id: ROUND_ID },
      {
        $push: {
          "estimateSnapshot.lineItems": {
            catalogueId: "ca01",
            roomName: "Living Room",
            specification: "Duplicate approved row",
            unit: "sqft",
            rate: 100,
            quantity: 1,
            included: true,
            amount: 100
          }
        }
      }
    );
    const storage = new MemoryStorage();
    const service = procurementService(storage);

    const projects = await service.listProjects(procurementActor());
    const carpentryItems = projects[0]!.sections
      .find((section) => section.id === "CA")!.items;
    expect(carpentryItems).toHaveLength(2);
    expect(new Set(carpentryItems.map((item) => item.key)).size).toBe(2);

    await service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput(),
      receiptUpload()
    );
    await service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput({
        sourceLineItemKey: `legacy-estimate-line:${ESTIMATE_ID}:1:3`,
        idempotencyKey: "procurement-request-duplicate"
      }),
      receiptUpload()
    );
    expect(await FinanceLedgerEntryModel.countDocuments()).toBe(2);
    expect(storage.files.size).toBe(2);
  });

  it("shows every approved project role-wide regardless of Procurement assignment", async () => {
    await createUser(OTHER_PROCUREMENT_ID, "procurement");
    const storage = new MemoryStorage();
    const service = procurementService(storage);

    await ProjectWorkflowTaskModel.updateOne(
      { _id: "procurement-task" },
      { $set: { assigneeUserId: null } }
    );

    await expect(service.listProjects(procurementActor(OTHER_PROCUREMENT_ID)))
      .resolves.toHaveLength(1);
    await expect(service.preflightProject(
      procurementActor(OTHER_PROCUREMENT_ID),
      PROJECT_ID
    )).resolves.toBeUndefined();

    await ProjectWorkflowTaskModel.updateOne(
      { _id: "procurement-task" },
      { $set: { assigneeUserId: PROCUREMENT_ID } }
    );

    await expect(service.listProjects(procurementActor(OTHER_PROCUREMENT_ID)))
      .resolves.toHaveLength(1);
    const posted = await service.postExpense(
      procurementActor(OTHER_PROCUREMENT_ID),
      PROJECT_ID,
      expenseInput({ idempotencyKey: "procurement-role-wide-0001" }),
      receiptUpload()
    );
    await expect(service.readEntryDocument(
      procurementActor(),
      PROJECT_ID,
      posted.entry.id
    )).resolves.toMatchObject({
      filename: "carpentry-receipt.jpg",
      mimeType: "image/jpeg"
    });
  });

  it("lists historical Design approvals without tasks and opens their 80% Finance budget on first purchase", async () => {
    await Promise.all([
      ProjectWorkflowTaskModel.deleteMany({ projectId: PROJECT_ID }),
      ProjectFinanceBucketModel.deleteMany({ projectId: PROJECT_ID })
    ]);
    const storage = new MemoryStorage();
    const service = procurementService(storage);

    const projects = await service.listProjects(procurementActor());
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      projectId: PROJECT_ID,
      projectName: "Procurement Residence",
      taskId: `approved-procurement:${ESTIMATE_ID}`
    });

    const result = await service.postExpense(
      procurementActor(),
      PROJECT_ID,
      expenseInput({ idempotencyKey: "procurement-historical-0001" }),
      receiptUpload()
    );

    expect(result.bucket).toMatchObject({
      costBudgetPaise: 800_000,
      directSpendPaise: 125_000,
      recordedCostPaise: 125_000,
      remainingBudgetPaise: 675_000,
      overBudget: false,
      status: "open"
    });
    await expect(ProjectFinanceBucketModel.findOne({ projectId: PROJECT_ID }).lean())
      .resolves.toMatchObject({
        targetMarginBps: 2_000,
        targetProfitPaise: 200_000,
        costBudgetPaise: 800_000,
        directSpendPaise: 125_000
      });
  });
});

class MemoryStorage implements FileStorage {
  readonly files = new Map<string, Buffer>();
  readonly deleted: string[] = [];
  readonly failDeleteReferences = new Set<string>();
  private sequence = 0;
  failDelete = false;

  async save(input: SaveFileInput) {
    const reference = `stored-receipt-${++this.sequence}${input.extension}`;
    this.files.set(reference, Buffer.from(input.data));
    return { reference };
  }

  async saveGenerated(input: SaveFileInput) {
    return this.save(input);
  }

  async read(reference: string) {
    const value = this.files.get(reference);
    if (!value) throw new Error("Stored file missing");
    return Buffer.from(value);
  }

  async delete(reference: string) {
    if (this.failDelete || this.failDeleteReferences.has(reference)) {
      throw Object.assign(new Error("simulated storage delete failure"), {
        code: "EIO"
      });
    }
    this.deleted.push(reference);
    this.files.delete(reference);
  }

  async open(reference: string) {
    return Readable.from(await this.read(reference));
  }
}

function procurementService(
  storage: FileStorage,
  overrides: Pick<
    Parameters<typeof createProcurementService>[0],
    "beforeTransactionStart" | "afterTransactionCommit" | "beforeCommitProbe"
  > = {}
) {
  return createProcurementService({
    storage,
    audit: createAuditService(createMemoryRepository()),
    now: () => NOW,
    ...overrides
  });
}

function procurementActor(id = PROCUREMENT_ID) {
  return {
    id,
    name: "Procurement User",
    email: "procurement-user@example.test",
    role: "procurement" as const
  };
}

function superAdminActor() {
  return {
    id: SUPER_ADMIN_ID,
    name: "Super Admin",
    email: "procurement-super-admin@example.test",
    role: "super_admin" as const
  };
}

function expenseInput(overrides: Partial<ReturnType<typeof baseExpenseInput>> = {}) {
  return { ...baseExpenseInput(), ...overrides };
}

function baseExpenseInput() {
  return {
    sourceLineItemKey: CARPENTRY_LINE_ID,
    amountPaise: 125_000,
    incurredAt: NOW.toISOString(),
    description: "Plywood purchase",
    vendor: "Woodworks",
    reference: "INV-101",
    idempotencyKey: "procurement-request-0001"
  };
}

function receiptUpload() {
  return {
    data: Buffer.from(RECEIPT),
    extension: ".jpg" as const,
    originalFilename: "carpentry-receipt.jpg",
    mimeType: "image/jpeg" as const,
    sizeBytes: RECEIPT.length
  };
}

async function createFixture() {
  await Promise.all([
    createUser(PROCUREMENT_ID, "procurement"),
    createUser(SUPER_ADMIN_ID, "super_admin"),
    ProjectModel.create({
      _id: PROJECT_ID,
      name: "Procurement Residence",
      clientId: null,
      clientName: "Client",
      clientEmail: "client@example.test",
      clientEmailNormalized: "client@example.test",
      clientMobile: "9000000000",
      clientAddress: "Bengaluru",
      initiatingDesignerId: null,
      assignedEstimatorId: null,
      assignedDesignerIds: [],
      managerId: null,
      status: "active",
      location: "Bengaluru",
      plannedStartAt: NOW,
      plannedEndAt: new Date("2026-11-26T09:00:00.000Z"),
      actualStartAt: NOW,
      actualEndAt: null
    })
  ]);
  const approvedLines = [
    {
      catalogueId: "CA01",
      roomName: "Living Room",
      specification: "Plywood and laminate",
      unit: "sqft",
      rate: 1_000,
      quantity: 2,
      included: true,
      amount: 2_000
    },
    {
      catalogueId: "EL01",
      roomName: "Kitchen",
      specification: "Electrical points",
      unit: "point",
      rate: 500,
      quantity: 1,
      included: true,
      amount: 500
    },
    {
      catalogueId: "PA01",
      roomName: "Bedroom",
      specification: "Excluded paint",
      unit: "sqft",
      rate: 100,
      quantity: 5,
      included: false,
      amount: 500
    }
  ];
  await EstimateModel.create({
    _id: ESTIMATE_ID,
    leadId: "procurement-lead",
    ownerId: SUPER_ADMIN_ID,
    version: 2,
    status: "client_approved",
    propertyType: "villa",
    rooms: [],
    scopes: [],
    lineItems: approvedLines,
    subtotal: 10_000,
    gst: 1_800,
    total: 11_800,
    approvalRequired: false,
    projectId: PROJECT_ID,
    reviews: [{
      actorId: SUPER_ADMIN_ID,
      action: "client_approved",
      note: "Approved",
      occurredAt: NOW
    }],
    designPlanStatus: "approved",
    designPlanVersion: 1,
    designPlanApprovedAt: NOW,
    designPlanApprovedById: SUPER_ADMIN_ID,
    designPlanApprovalSource: "admin_proof",
    clientDecisionAt: NOW
  });
  await EstimateClientReviewRoundModel.create({
    _id: ROUND_ID,
    estimateId: ESTIMATE_ID,
    leadId: "procurement-lead",
    projectId: null,
    estimateVersion: 1,
    sendGeneration: 1,
    dedupeKey: "c".repeat(64),
    recipientEmail: "client@example.test",
    recipientEmailNormalized: "client@example.test",
    estimateSnapshot: {
      clientName: "Client",
      projectName: "Procurement Residence",
      location: "Bengaluru",
      propertyType: "villa",
      lineItems: approvedLines,
      subtotal: 10_000,
      gst: 1_800,
      total: 11_800
    },
    pdfFilename: "approved-estimate.pdf",
    pdfMimeType: "application/pdf",
    pdfByteSize: 1,
    pdfSha256: "d".repeat(64),
    pdfStorageReference: "approved-estimate.pdf",
    deliveryStatus: "sent",
    deliveryAttemptGeneration: 1,
    deliveryAttemptCount: 1,
    deliveryAttemptedAt: NOW,
    deliveryLeaseExpiresAt: null,
    deliveredAt: NOW,
    deliveryFailureCode: null,
    assignedAdminId: SUPER_ADMIN_ID,
    status: "approved",
    decision: "approve",
    decisionSource: "admin_proof",
    decisionNote: "Approved",
    decidedById: SUPER_ADMIN_ID,
    decidedAt: NOW,
    version: 2
  });
  await Promise.all([
    ProjectWorkflowTaskModel.create({
      _id: "procurement-task",
      dedupeKey: `${ESTIMATE_ID}:procurement`,
      projectId: PROJECT_ID,
      estimateId: ESTIMATE_ID,
      designPlanVersion: 1,
      kind: "procurement",
      title: "Prepare procurement plan",
      description: "Carpentry, Electrical",
      assigneeRole: "procurement",
      assigneeUserId: PROCUREMENT_ID,
      sourceSectionId: null,
      sourceLineItemKey: null,
      roomName: null,
      status: "open",
      progress: 0,
      version: 1,
      openedAt: NOW,
      completedAt: null
    }),
    ProjectFinanceBucketModel.create({
      _id: `finance-bucket-${PROJECT_ID}`,
      projectId: PROJECT_ID,
      estimateId: ESTIMATE_ID,
      estimateVersion: 1,
      estimateReviewRoundId: ROUND_ID,
      designPlanVersion: 1,
      currency: "INR",
      approvedSubtotalPaise: 1_000_000,
      approvedGstPaise: 180_000,
      approvedContractTotalPaise: 1_180_000,
      targetMarginBps: 2_000,
      targetProfitPaise: 200_000,
      costBudgetPaise: 800_000,
      directSpendPaise: 0,
      overheadPaise: 0,
      status: "open",
      version: 1,
      createdById: SUPER_ADMIN_ID,
      openedAt: NOW,
      openedById: SUPER_ADMIN_ID,
      closedAt: null,
      closedById: null
    })
  ]);
}

async function createUser(
  id: string,
  role: "procurement" | "super_admin"
) {
  await UserModel.create({
    _id: id,
    name: id,
    email: `${id}@example.test`,
    emailNormalized: `${id}@example.test`,
    passwordHash: "unused-by-procurement-test",
    role,
    active: true,
    accountKind: "standard",
    version: 1,
    managerId: null,
    authorizedClientIds: []
  });
}
