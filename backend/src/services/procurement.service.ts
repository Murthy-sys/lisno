import { createHash, randomUUID } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { approvedEstimateLineItemKey } from "../domain/estimate-line-item.js";
import {
  projectWorkflowSectionLabel
} from "../domain/project-workflow.js";
import {
  assertFinanceAmount,
  projectFinanceBaseline,
  rupeesToPaise,
  safeAddFinanceAmounts
} from "../domain/project-finance.js";
import { ApiError } from "../middleware/errors.js";
import type { ValidatedUpload } from "../middleware/upload.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import {
  FINANCE_DOCUMENT_MIME_TYPES,
  FinanceEntryDocumentModel
} from "../models/FinanceEntryDocument.js";
import { FinanceLedgerEntryModel } from "../models/FinanceLedgerEntry.js";
import { ProjectFinanceBucketModel } from "../models/ProjectFinanceBucket.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { ProcurementReceiptCleanupJobModel } from "../models/ProcurementReceiptCleanupJob.js";
import { ProcurementReceiptReconciliationJobModel } from "../models/ProcurementReceiptReconciliationJob.js";
import { UserModel } from "../models/User.js";
import type { FileStorage } from "../storage/storage.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import {
  financeEntryDto,
  financeApprovalLineage,
  financeDesignApproval,
  openProjectFinanceBucket,
  projectFinanceBucketDtoForTransaction,
  type FinanceDocumentDownload,
  type FinanceLedgerEntryDto,
  type PostFinanceEntryResult
} from "./project-finance.service.js";

type Row = Record<string, any>;

export interface ProcurementExpenseInput {
  sourceLineItemKey: string;
  amountPaise: number;
  incurredAt: string;
  description: string;
  vendor?: string | null;
  reference?: string | null;
  idempotencyKey: string;
}

export interface ProcurementItemDto {
  key: string;
  catalogueId: string;
  roomName: string;
  specification: string;
  unit: string;
  quantity: number;
  estimatedAmountPaise: number;
  actualSpendPaise: number;
  expenses: FinanceLedgerEntryDto[];
}

export interface ProcurementSectionDto {
  id: string;
  label: string;
  estimatedAmountPaise: number;
  actualSpendPaise: number;
  items: ProcurementItemDto[];
}

export interface ProcurementProjectDto {
  taskId: string;
  taskVersion: number;
  taskStatus: string;
  taskProgress: number;
  openedAt: string;
  updatedAt: string;
  projectId: string;
  projectName: string;
  estimateId: string;
  estimateVersion: number;
  sections: ProcurementSectionDto[];
}

export interface ProcurementService {
  preflightProject(actor: PublicUser, projectId: string): Promise<void>;
  listProjects(actor: PublicUser): Promise<ProcurementProjectDto[]>;
  postExpense(
    actor: PublicUser,
    projectId: string,
    input: ProcurementExpenseInput,
    receipt: ValidatedUpload
  ): Promise<PostFinanceEntryResult>;
  readEntryDocument(
    actor: PublicUser,
    projectId: string,
    entryId: string
  ): Promise<FinanceDocumentDownload>;
}

interface ApprovedProcurementSnapshot {
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
  designPlanVersion: number;
  designPlanApprovedAt: Date;
  designPlanApprovedById: string;
  subtotalRupees: number;
  gstRupees: number;
  totalRupees: number;
  lineItems: ApprovedProcurementLine[];
}

interface ApprovedProcurementLine {
  key: string;
  sectionId: string;
  catalogueId: string;
  roomName: string;
  specification: string;
  unit: string;
  quantity: number;
  amountPaise: number;
}

interface ResolvedProcurementProject {
  task: Row;
  project: Row;
  snapshot: ApprovedProcurementSnapshot;
}

interface NormalizedProcurementExpense {
  sourceLineItemKey: string;
  amountPaise: number;
  incurredAt: Date;
  description: string;
  vendor: string | null;
  reference: string | null;
  idempotencyKey: string;
}

interface StoredReceiptIdentity {
  reference: string;
  originalFilename: string;
  mimeType: (typeof FINANCE_DOCUMENT_MIME_TYPES)[number];
  sizeBytes: number;
  sha256: string;
}

interface ReceiptReconciliationIdentity {
  projectId: string;
  idempotencyKey: string;
  contentSha256: string;
  sizeBytes: number;
  storageReference: string;
  leaseToken: string;
}

const allowedReceiptMimeTypes = new Set<string>(FINANCE_DOCUMENT_MIME_TYPES);
const receiptMaintenanceLeaseMs = 5 * 60 * 1_000;
const receiptMaintenanceBaseBackoffMs = 60 * 1_000;
const receiptMaintenanceMaximumBackoffMs = 24 * 60 * 60 * 1_000;
const receiptMaintenanceMaximumAttempts = 6;
const receiptMaintenanceDefaultLimit = 25;
const receiptMaintenanceMaximumLimit = 100;

export interface ProcurementReceiptMaintenanceResult {
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
}

export function createProcurementService(input: {
  storage: FileStorage;
  audit: AuditService;
  now?: () => Date;
  beforeTransactionStart?: () => Promise<void> | void;
  afterTransactionCommit?: () => Promise<void> | void;
  beforeCommitProbe?: () => Promise<void> | void;
}): ProcurementService {
  const now = input.now ?? (() => new Date());

  return {
    async preflightProject(actor, projectId) {
      await procurementSnapshotRead(async (session) => {
        await requireProcurementActor(actor, session);
        await resolveProcurementProject(projectId, session);
        return null;
      });
    },

    async listProjects(actor) {
      return procurementSnapshotRead(async (session) => {
        await requireProcurementActor(actor, session);
        const estimates = await EstimateModel.find({
          status: "client_approved",
          designPlanStatus: "approved",
          projectId: { $nin: [null, ""] }
        })
          .sort({ designPlanApprovedAt: -1, _id: 1 })
          .session(session)
          .lean();
        const duplicateProjectId = firstDuplicate(
          estimates.map((estimate) => String(estimate.projectId))
        );
        if (duplicateProjectId) procurementLineageConflict();
        const tasks = estimates.length === 0
          ? []
          : await ProjectWorkflowTaskModel.find({
              estimateId: { $in: estimates.map((estimate) => String(estimate._id)) },
              kind: "procurement",
              assigneeRole: "procurement"
            }).session(session).lean();
        if (firstDuplicate(tasks.map((task) => String(task.estimateId)))) {
          procurementLineageConflict();
        }
        const taskByEstimateId = new Map(
          tasks.map((task) => [String(task.estimateId), task])
        );

        const projects: ProcurementProjectDto[] = [];
        for (const estimate of estimates) {
          const resolved = await resolveProcurementProjectFromEstimate(
            estimate,
            taskByEstimateId.get(String(estimate._id)) ?? null,
            session
          );
          projects.push(await procurementProjectDto(resolved, session));
        }
        return projects;
      });
    },

    async postExpense(actor, projectId, rawInput, receipt) {
      const normalized = normalizeExpenseInput(rawInput);
      validateReceipt(receipt);
      await procurementSnapshotRead(async (session) => {
        await requireProcurementActor(actor, session);
        const resolved = await resolveProcurementProject(
          projectId,
          session
        );
        requireSnapshotLine(resolved.snapshot, normalized.sourceLineItemKey);
        return null;
      });
      await Promise.all([
        runProcurementReceiptCleanupJobs({
          storage: input.storage,
          now: now(),
          limit: 2
        }),
        runProcurementReceiptReconciliationJobs({
          storage: input.storage,
          now: now(),
          limit: 2
        })
      ]);

      const saved = await input.storage.save({
        data: receipt.data,
        extension: receipt.extension
      });
      const storedReceipt: StoredReceiptIdentity = {
        reference: saved.reference,
        originalFilename: receipt.originalFilename,
        mimeType: receipt.mimeType as StoredReceiptIdentity["mimeType"],
        sizeBytes: receipt.sizeBytes,
        sha256: sha256(receipt.data)
      };
      const reconciliationIdentity = receiptReconciliationIdentity(
        projectId,
        normalized.idempotencyKey,
        storedReceipt
      );
      try {
        await persistReceiptReconciliationJob(reconciliationIdentity, now());
      } catch (error) {
        await cleanupStoredReceipt(input.storage, storedReceipt.reference, now());
        throw error;
      }
      let retainSavedFile = true;
      let reconciliationResolution: "committed" | "aborted" | null = null;
      try {
        try {
          await input.beforeTransactionStart?.();
          const result = await postProcurementExpenseInTransaction(
            actor,
            projectId,
            normalized,
            storedReceipt,
            reconciliationIdentity,
            input.audit,
            now
          );
          await input.afterTransactionCommit?.();
          retainSavedFile = !result.replayed;
          reconciliationResolution = result.replayed ? "aborted" : "committed";
          return result;
        } catch (error) {
          const probe = await probeCommittedExpense(
            actor,
            projectId,
            normalized,
            storedReceipt,
            now,
            input.beforeCommitProbe
          );
          if (probe.status === "committed") {
            retainSavedFile = probe.storageReference === storedReceipt.reference;
            reconciliationResolution = retainSavedFile ? "committed" : "aborted";
            return probe.result;
          }
          if (probe.status === "not_found") {
            retainSavedFile = false;
            reconciliationResolution = "aborted";
          }
          throw error;
        }
      } finally {
        let cleanupStatus: "deleted" | "scheduled" | null = null;
        if (!retainSavedFile) {
          cleanupStatus = await cleanupStoredReceipt(
            input.storage,
            storedReceipt.reference,
            now()
          );
        }
        if (reconciliationResolution) {
          await closeReceiptReconciliationJob(
            reconciliationIdentity,
            reconciliationResolution,
            cleanupStatus,
            now()
          ).catch(() => undefined);
        }
      }
    },

    async readEntryDocument(actor, projectId, entryId) {
      const document = await procurementSnapshotRead(async (session) => {
        await requireProcurementActor(actor, session);
        const resolved = await resolveProcurementProject(
          projectId,
          session
        );
        const bucket = await requireMatchingBucket(resolved, session);
        const entry = await FinanceLedgerEntryModel.findOne({
          _id: entryId,
          projectId,
          bucketId: String(bucket._id),
          type: "direct_spend",
          expenseClass: "procurement"
        }).select({
          _id: 1,
          bucketId: 1,
          sourceSectionId: 1,
          sourceLineItemKey: 1
        }).session(session).lean();
        if (!entry) notFound();
        const storedDocument = await FinanceEntryDocumentModel.findOne({
          entryId,
          projectId
        }).select("+storageReference +sha256").session(session).lean();
        if (!storedDocument) notFound();
        requireProcurementDocumentLineage(
          storedDocument,
          entry,
          resolved.snapshot
        );
        return storedDocument;
      });
      const bytes = await input.storage.read(String(document.storageReference));
      requireDocumentIntegrity(document, bytes);
      return {
        filename: String(document.originalFilename),
        mimeType: document.mimeType,
        bytes
      };
    }
  };
}

async function postProcurementExpenseInTransaction(
  actor: PublicUser,
  projectId: string,
  input: NormalizedProcurementExpense,
  receipt: StoredReceiptIdentity,
  reconciliationIdentity: ReceiptReconciliationIdentity,
  audit: AuditService,
  now: () => Date
): Promise<PostFinanceEntryResult> {
  const result = await mongoose.connection.transaction(async (session) => {
    const storedActor = await requireProcurementActor(actor, session);
    const resolved = await resolveProcurementProject(
      projectId,
      session
    );
    const line = requireSnapshotLine(
      resolved.snapshot,
      input.sourceLineItemKey
    );
    const bucket = await requireOpenMatchingBucket(resolved, session);
    const existing = await FinanceLedgerEntryModel.findOne({
      projectId,
      idempotencyKey: input.idempotencyKey
    }).session(session).lean();
    if (existing) {
      const document = await FinanceEntryDocumentModel.findOne({
        entryId: String(existing._id),
        projectId
      }).select("+sha256 +storageReference").session(session).lean();
      requireMatchingProcurementReplay(existing, document, line, input, receipt);
      await consumeReceiptReconciliationIntent(
        reconciliationIdentity,
        "aborted",
        now(),
        session
      );
      return {
        entry: financeEntryDto(existing, document, procurementLineLabel(line)),
        bucket: await projectFinanceBucketDtoForTransaction(
          projectId,
          bucket,
          now(),
          session
        ),
        replayed: true
      };
    }

    const nextDirectSpendPaise = safeAddFinanceAmounts(
      Number(bucket.directSpendPaise ?? 0),
      input.amountPaise,
      "Direct spending"
    );
    safeAddFinanceAmounts(
      nextDirectSpendPaise,
      Number(bucket.overheadPaise ?? 0),
      "Recorded project cost"
    );
    const occurredAt = now();
    await consumeReceiptReconciliationIntent(
      reconciliationIdentity,
      "committed",
      occurredAt,
      session
    );
    const entryId = `finance-entry-${randomUUID()}`;
    const documentId = `finance-document-${randomUUID()}`;
    const [entry] = await FinanceLedgerEntryModel.create([{
      _id: entryId,
      bucketId: String(bucket._id),
      projectId,
      type: "direct_spend",
      expenseClass: "procurement",
      category: projectWorkflowSectionLabel(line.sectionId),
      amountPaise: input.amountPaise,
      incurredAt: input.incurredAt,
      description: input.description,
      vendor: input.vendor,
      reference: input.reference,
      sourceSectionId: line.sectionId,
      sourceLineItemKey: line.key,
      idempotencyKey: input.idempotencyKey,
      status: "posted",
      version: 1,
      createdById: storedActor.id,
      voidedAt: null,
      voidedById: null,
      voidReason: null,
      createdAt: occurredAt,
      updatedAt: occurredAt
    }], { session });
    if (!entry) financeStateCorrupt();
    const [document] = await FinanceEntryDocumentModel.create([{
      _id: documentId,
      entryId,
      bucketId: String(bucket._id),
      projectId,
      estimateId: resolved.snapshot.estimateId,
      estimateVersion: resolved.snapshot.estimateVersion,
      estimateReviewRoundId: resolved.snapshot.estimateReviewRoundId,
      sourceSectionId: line.sectionId,
      sourceLineItemKey: line.key,
      originalFilename: receipt.originalFilename,
      mimeType: receipt.mimeType,
      sizeBytes: receipt.sizeBytes,
      sha256: receipt.sha256,
      storageReference: receipt.reference,
      createdById: storedActor.id,
      createdAt: occurredAt
    }], { session });
    if (!document) financeStateCorrupt();

    const updatedBucket = await ProjectFinanceBucketModel.findOneAndUpdate(
      {
        _id: bucket._id,
        projectId,
        status: "open",
        version: Number(bucket.version)
      },
      {
        $inc: { directSpendPaise: input.amountPaise, version: 1 },
        $set: { updatedAt: occurredAt }
      },
      {
        returnDocument: "after",
        runValidators: true,
        session,
        timestamps: false
      }
    ).lean();
    if (!updatedBucket) {
      throw new ApiError(
        409,
        "FINANCE_BUCKET_STALE",
        "The project budget changed before this expense could be recorded."
      );
    }
    await audit.appendInMongoTransaction({
      actorId: storedActor.id,
      action: "procurement_expense_recorded",
      entityType: "finance_ledger_entry",
      entityId: entryId,
      occurredAt: occurredAt.toISOString(),
      oldValues: {},
      newValues: {
        projectId,
        estimateId: resolved.snapshot.estimateId,
        estimateVersion: resolved.snapshot.estimateVersion,
        sourceSectionId: line.sectionId,
        sourceLineItemKey: line.key,
        supportingDocumentId: documentId,
        supportingDocumentMimeType: receipt.mimeType,
        supportingDocumentSize: receipt.sizeBytes
      }
    }, session);
    return {
      entry: financeEntryDto(
        entry.toObject(),
        document.toObject(),
        procurementLineLabel(line)
      ),
      bucket: await projectFinanceBucketDtoForTransaction(
        projectId,
        updatedBucket,
        occurredAt,
        session
      ),
      replayed: false
    };
  });
  if (!result) financeStateCorrupt();
  return result;
}

async function probeCommittedExpense(
  actor: PublicUser,
  projectId: string,
  input: NormalizedProcurementExpense,
  receipt: StoredReceiptIdentity,
  now: () => Date,
  beforeProbe?: () => Promise<void> | void
): Promise<
  | { status: "committed"; result: PostFinanceEntryResult; storageReference: string }
  | { status: "not_found" }
  | { status: "uncertain" }
> {
  try {
    await beforeProbe?.();
    const committed = await procurementSnapshotRead(async (session) => {
      await requireProcurementActor(actor, session);
      const resolved = await resolveProcurementProject(
        projectId,
        session
      );
      const line = requireSnapshotLine(
        resolved.snapshot,
        input.sourceLineItemKey
      );
      const entry = await FinanceLedgerEntryModel.findOne({
        projectId,
        idempotencyKey: input.idempotencyKey
      }).session(session).lean();
      if (!entry) return null;
      const bucket = await requireOpenMatchingBucket(resolved, session);
      const document = await FinanceEntryDocumentModel.findOne({
        entryId: String(entry._id),
        projectId
      }).select("+sha256 +storageReference").session(session).lean();
      requireMatchingProcurementReplay(entry, document, line, input, receipt);
      return {
        result: {
          entry: financeEntryDto(entry, document, procurementLineLabel(line)),
          bucket: await projectFinanceBucketDtoForTransaction(
            projectId,
            bucket,
            now(),
            session
          ),
          replayed: true
        },
        storageReference: String(document.storageReference)
      };
    });
    return committed
      ? { status: "committed", ...committed }
      : { status: "not_found" };
  } catch (error) {
    if (error instanceof ApiError && error.code === "FINANCE_ENTRY_IDEMPOTENCY_CONFLICT") {
      throw error;
    }
    return { status: "uncertain" };
  }
}

async function procurementProjectDto(
  resolved: ResolvedProcurementProject,
  session: ClientSession
): Promise<ProcurementProjectDto> {
  const { task, project, snapshot } = resolved;
  const bucket = await ProjectFinanceBucketModel.findOne({
    projectId: String(project._id)
  }).session(session).lean();
  if (bucket) requireMatchingBucketLineage(bucket, snapshot);
  const entries = bucket
    ? await FinanceLedgerEntryModel.find({
        bucketId: String(bucket._id),
        projectId: String(project._id),
        type: "direct_spend",
        expenseClass: "procurement",
        status: "posted"
      }).sort({ incurredAt: -1, _id: -1 }).session(session).lean()
    : [];
  const documents = entries.length === 0
    ? []
    : await FinanceEntryDocumentModel.find({
        projectId: String(project._id),
        entryId: { $in: entries.map((entry) => String(entry._id)) }
      }).session(session).lean();
  const documentByEntryId = new Map(
    documents.map((document) => [String(document.entryId), document])
  );
  const expensesByLineItemKey = new Map<string, FinanceLedgerEntryDto[]>();
  const actualBySectionId = new Map<string, number>();
  const approvedLineByKey = new Map(
    snapshot.lineItems.map((line) => [line.key, line])
  );
  for (const entry of entries) {
    const key = nullableText(entry.sourceLineItemKey);
    if (!key) continue;
    const approvedLine = approvedLineByKey.get(key);
    if (
      !approvedLine ||
      nullableText(entry.sourceSectionId) !== approvedLine.sectionId
    ) continue;
    actualBySectionId.set(
      approvedLine.sectionId,
      safeAddFinanceAmounts(
        actualBySectionId.get(approvedLine.sectionId) ?? 0,
        Number(entry.amountPaise),
        "Procurement section spending"
      )
    );
    const current = expensesByLineItemKey.get(key) ?? [];
    const document = documentByEntryId.get(String(entry._id));
    current.push(financeEntryDto(
      entry,
      document && isMatchingProcurementDocumentLineage(
        document,
        entry,
        snapshot
      )
        ? document
        : null,
      procurementLineLabel(approvedLine)
    ));
    expensesByLineItemKey.set(key, current);
  }

  const sectionRows = new Map<string, ApprovedProcurementLine[]>();
  for (const line of snapshot.lineItems) {
    const current = sectionRows.get(line.sectionId) ?? [];
    current.push(line);
    sectionRows.set(line.sectionId, current);
  }
  const sections = [...sectionRows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sectionId, lines]) => ({
      id: sectionId,
      label: projectWorkflowSectionLabel(sectionId),
      estimatedAmountPaise: lines.reduce(
        (total, line) => safeAddFinanceAmounts(
          total,
          line.amountPaise,
          "Procurement section estimate"
        ),
        0
      ),
      actualSpendPaise: actualBySectionId.get(sectionId) ?? 0,
      items: lines.map((line) => {
        const expenses = expensesByLineItemKey.get(line.key) ?? [];
        return {
          key: line.key,
          catalogueId: line.catalogueId,
          roomName: line.roomName,
          specification: line.specification,
          unit: line.unit,
          quantity: line.quantity,
          estimatedAmountPaise: line.amountPaise,
          actualSpendPaise: expenses.reduce(
            (total, expense) => safeAddFinanceAmounts(
              total,
              expense.amountPaise,
              "Procurement item spending"
            ),
            0
          ),
          expenses
        };
      })
    }));
  return {
    taskId: String(task._id),
    taskVersion: Number(task.version ?? 1),
    taskStatus: String(task.status),
    taskProgress: Number(task.progress ?? 0),
    openedAt: validDate(task.openedAt).toISOString(),
    updatedAt: validDate(task.updatedAt ?? task.openedAt).toISOString(),
    projectId: String(project._id),
    projectName: String(project.name),
    estimateId: snapshot.estimateId,
    estimateVersion: snapshot.estimateVersion,
    sections
  };
}

async function resolveProcurementProject(
  projectId: string,
  session: ClientSession
): Promise<ResolvedProcurementProject> {
  if (!projectId.trim()) notFound();
  const estimates = await EstimateModel.find({
    projectId,
    status: "client_approved",
    designPlanStatus: "approved"
  }).limit(2).session(session).lean();
  if (estimates.length === 0) notFound();
  if (estimates.length !== 1) procurementLineageConflict();
  const estimate = estimates[0]!;
  const tasks = await ProjectWorkflowTaskModel.find({
    projectId,
    estimateId: String(estimate._id),
    kind: "procurement",
    assigneeRole: "procurement"
  }).limit(2).session(session).lean();
  if (tasks.length > 1) procurementLineageConflict();
  return resolveProcurementProjectFromEstimate(
    estimate,
    tasks[0] ?? null,
    session
  );
}

async function resolveProcurementProjectFromEstimate(
  estimate: Row,
  storedTask: Row | null,
  session: ClientSession
): Promise<ResolvedProcurementProject> {
  const projectId = requiredStoredText(estimate.projectId);
  const project = await ProjectModel.findById(projectId)
    .select({ _id: 1, name: 1 })
    .session(session)
    .lean();
  if (!project) notFound();
  if (
    estimate.status !== "client_approved" ||
    estimate.designPlanStatus !== "approved"
  ) notFound();
  if (
    storedTask && (
      storedTask.kind !== "procurement" ||
      storedTask.assigneeRole !== "procurement" ||
      String(storedTask.projectId) !== projectId ||
      String(storedTask.estimateId) !== String(estimate._id) ||
      Number(storedTask.designPlanVersion) !== Number(estimate.designPlanVersion)
    )
  ) {
    procurementLineageConflict();
  }
  const task = storedTask ?? syntheticProcurementTask(estimate, projectId);
  return {
    task,
    project,
    snapshot: await approvedProcurementSnapshot(estimate, session)
  };
}

async function approvedProcurementSnapshot(
  estimate: Row,
  session: ClientSession
): Promise<ApprovedProcurementSnapshot> {
  const approvedRounds = await EstimateClientReviewRoundModel.find({
    estimateId: String(estimate._id),
    status: "approved",
    decision: "approve"
  }).session(session).lean();
  let approval: ReturnType<typeof financeApprovalLineage>;
  let designApproval: NonNullable<ReturnType<typeof financeDesignApproval>>;
  try {
    approval = financeApprovalLineage(estimate, approvedRounds);
    const resolvedDesignApproval = financeDesignApproval(estimate);
    if (!resolvedDesignApproval) procurementLineageConflict();
    designApproval = resolvedDesignApproval;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.code === "FINANCE_APPROVAL_SOURCE_CONFLICT"
    ) procurementLineageConflict();
    throw error;
  }
  const lineItems = approvedSnapshotLines(
    approval.snapshot.lineItems,
    String(estimate._id),
    approval.estimateVersion
  );
  return {
    estimateId: String(estimate._id),
    estimateVersion: approval.estimateVersion,
    estimateReviewRoundId: approval.estimateReviewRoundId,
    designPlanVersion: designApproval.designPlanVersion,
    designPlanApprovedAt: designApproval.occurredAt,
    designPlanApprovedById: designApproval.openedById,
    subtotalRupees: approval.baseline.approvedSubtotalPaise / 100,
    gstRupees: approval.baseline.approvedGstPaise / 100,
    totalRupees: approval.baseline.approvedContractTotalPaise / 100,
    lineItems
  };
}

function syntheticProcurementTask(estimate: Row, projectId: string): Row {
  const approvedAt = validDate(estimate.designPlanApprovedAt);
  return {
    _id: `approved-procurement:${String(estimate._id)}`,
    projectId,
    estimateId: String(estimate._id),
    designPlanVersion: Number(estimate.designPlanVersion),
    kind: "procurement",
    assigneeRole: "procurement",
    assigneeUserId: null,
    status: "open",
    progress: 0,
    version: 1,
    openedAt: approvedAt,
    updatedAt: approvedAt
  };
}

function approvedSnapshotLines(
  value: unknown,
  estimateId: string,
  estimateVersion: number
): ApprovedProcurementLine[] {
  if (!Array.isArray(value)) procurementLineageConflict();
  const lines = value.map((line: Row, index: number) => ({ line, index }))
    .filter(({ line }) => line?.included === true)
    .map(({ line, index }) => {
    const catalogueId = requiredStoredText(line.catalogueId).toUpperCase();
    const roomName = requiredStoredText(line.roomName);
    let key: string;
    try {
      key = approvedEstimateLineItemKey({
        id: line.id,
        estimateId,
        estimateVersion,
        index
      });
    } catch {
      procurementLineageConflict();
    }
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) procurementLineageConflict();
    return {
      key,
      sectionId: catalogueId.slice(0, 2) || "OTHER",
      catalogueId,
      roomName,
      specification: requiredStoredText(line.specification),
      unit: requiredStoredText(line.unit),
      quantity,
      amountPaise: storedRupeesToPaise(line.amount)
    };
  });
  if (firstDuplicate(lines.map((line) => line.key))) {
    procurementLineageConflict();
  }
  return lines;
}

async function requireOpenMatchingBucket(
  resolved: ResolvedProcurementProject,
  session: ClientSession
): Promise<Row> {
  let bucket = await ProjectFinanceBucketModel.findOne({
    projectId: String(resolved.project._id)
  }).session(session).lean();
  if (!bucket) {
    bucket = await openProjectFinanceBucket({
      projectId: String(resolved.project._id),
      designPlanVersion: resolved.snapshot.designPlanVersion,
      openedById: resolved.snapshot.designPlanApprovedById,
      occurredAt: resolved.snapshot.designPlanApprovedAt,
      fallbackBaseline: {
        estimateId: resolved.snapshot.estimateId,
        estimateVersion: resolved.snapshot.estimateVersion,
        estimateReviewRoundId: resolved.snapshot.estimateReviewRoundId,
        approvedSubtotalRupees: resolved.snapshot.subtotalRupees,
        approvedGstRupees: resolved.snapshot.gstRupees,
        approvedContractTotalRupees: resolved.snapshot.totalRupees
      }
    }, session);
  }
  requireMatchingBucketLineage(bucket, resolved.snapshot);
  if (bucket.status !== "open") {
    throw new ApiError(
      409,
      "FINANCE_BUCKET_NOT_OPEN",
      "Project spending can be recorded only after its approved finance bucket is opened."
    );
  }
  return bucket;
}

async function requireMatchingBucket(
  resolved: ResolvedProcurementProject,
  session: ClientSession
): Promise<Row> {
  const bucket = await ProjectFinanceBucketModel.findOne({
    projectId: String(resolved.project._id)
  }).session(session).lean();
  if (!bucket) {
    throw new ApiError(
      409,
      "FINANCE_BUCKET_MISSING",
      "The approved project budget is missing."
    );
  }
  requireMatchingBucketLineage(bucket, resolved.snapshot);
  return bucket;
}

function requireMatchingBucketLineage(
  bucket: Row,
  snapshot: ApprovedProcurementSnapshot
): void {
  let baseline: ReturnType<typeof projectFinanceBaseline>;
  try {
    baseline = projectFinanceBaseline({
      subtotalRupees: snapshot.subtotalRupees,
      gstRupees: snapshot.gstRupees,
      totalRupees: snapshot.totalRupees
    });
  } catch {
    procurementLineageConflict();
  }
  const actualRoundId = bucket.estimateReviewRoundId == null
    ? null
    : String(bucket.estimateReviewRoundId);
  if (
    String(bucket.estimateId) !== snapshot.estimateId ||
    Number(bucket.estimateVersion) !== snapshot.estimateVersion ||
    actualRoundId !== snapshot.estimateReviewRoundId ||
    Number(bucket.designPlanVersion) !== snapshot.designPlanVersion ||
    Number(bucket.approvedSubtotalPaise) !== baseline.approvedSubtotalPaise ||
    Number(bucket.approvedGstPaise) !== baseline.approvedGstPaise ||
    Number(bucket.approvedContractTotalPaise) !== baseline.approvedContractTotalPaise
  ) procurementLineageConflict();
}


/** The room and specification a Client approved, for display in place of the opaque line key. */
function procurementLineLabel(line: ApprovedProcurementLine): string {
  return `${line.specification} · ${line.roomName}`;
}

function requireSnapshotLine(
  snapshot: ApprovedProcurementSnapshot,
  key: string
): ApprovedProcurementLine {
  const line = snapshot.lineItems.find((candidate) => candidate.key === key);
  if (!line) {
    throw new ApiError(
      400,
      "PROCUREMENT_ITEM_INVALID",
      "Choose an included item from the approved Estimate."
    );
  }
  return line;
}

function requireMatchingProcurementReplay(
  entry: Row,
  document: Row | null,
  line: ApprovedProcurementLine,
  input: NormalizedProcurementExpense,
  receipt: StoredReceiptIdentity
): void {
  if (
    entry.type !== "direct_spend" ||
    entry.expenseClass !== "procurement" ||
    String(entry.category) !== projectWorkflowSectionLabel(line.sectionId) ||
    Number(entry.amountPaise) !== input.amountPaise ||
    validDate(entry.incurredAt).getTime() !== input.incurredAt.getTime() ||
    String(entry.description) !== input.description ||
    nullableText(entry.vendor) !== input.vendor ||
    nullableText(entry.reference) !== input.reference ||
    nullableText(entry.sourceSectionId) !== line.sectionId ||
    nullableText(entry.sourceLineItemKey) !== line.key ||
    !document ||
    String(document.sha256) !== receipt.sha256 ||
    String(document.mimeType) !== receipt.mimeType ||
    Number(document.sizeBytes) !== receipt.sizeBytes
  ) {
    throw new ApiError(
      409,
      "FINANCE_ENTRY_IDEMPOTENCY_CONFLICT",
      "This idempotency key was already used for a different finance entry."
    );
  }
}

function requireProcurementDocumentLineage(
  document: Row,
  entry: Row,
  snapshot: ApprovedProcurementSnapshot
): void {
  if (!isMatchingProcurementDocumentLineage(document, entry, snapshot)) {
    financeStateCorrupt();
  }
}

function isMatchingProcurementDocumentLineage(
  document: Row,
  entry: Row,
  snapshot: ApprovedProcurementSnapshot
): boolean {
  const documentReviewRoundId = document.estimateReviewRoundId == null
    ? null
    : String(document.estimateReviewRoundId);
  return !(
    String(document.bucketId) !== String(entry.bucketId) ||
    String(document.estimateId) !== snapshot.estimateId ||
    Number(document.estimateVersion) !== snapshot.estimateVersion ||
    documentReviewRoundId !== snapshot.estimateReviewRoundId ||
    nullableText(document.sourceSectionId) !== nullableText(entry.sourceSectionId) ||
    nullableText(document.sourceLineItemKey) !== nullableText(entry.sourceLineItemKey) ||
    !snapshot.lineItems.some((line) =>
      line.key === String(entry.sourceLineItemKey) &&
      line.sectionId === String(entry.sourceSectionId)
    )
  );
}

async function requireProcurementActor(
  actor: PublicUser,
  session: ClientSession
): Promise<{ id: string }> {
  const stored = await UserModel.findOne({
    _id: actor.id,
    role: actor.role,
    active: true
  }).select({ _id: 1, role: 1 }).session(session).lean();
  if (!stored) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }
  if (stored.role !== "procurement") forbidden();
  return { id: String(stored._id) };
}

function normalizeExpenseInput(
  input: ProcurementExpenseInput
): NormalizedProcurementExpense {
  try {
    assertFinanceAmount(input.amountPaise, "Procurement expense amount");
  } catch {
    throw validationError("amountPaise", "Enter a valid amount in paise.");
  }
  if (input.amountPaise === 0) {
    throw validationError("amountPaise", "Expense amount must be greater than zero.");
  }
  const incurredAt = new Date(input.incurredAt);
  if (Number.isNaN(incurredAt.getTime())) {
    throw validationError("incurredAt", "Enter a valid incurred date and time.");
  }
  return {
    sourceLineItemKey: requiredText(
      input.sourceLineItemKey,
      "sourceLineItemKey",
      500
    ),
    amountPaise: input.amountPaise,
    incurredAt,
    description: requiredText(input.description, "description", 1_000),
    vendor: optionalText(input.vendor, "vendor", 200),
    reference: optionalText(input.reference, "reference", 200),
    idempotencyKey: requiredText(
      input.idempotencyKey,
      "idempotencyKey",
      128,
      8
    )
  };
}

function validateReceipt(receipt: ValidatedUpload): void {
  if (
    !allowedReceiptMimeTypes.has(receipt.mimeType) ||
    receipt.sizeBytes !== receipt.data.length ||
    receipt.sizeBytes < 1
  ) {
    throw validationError(
      "receipt",
      "Choose a valid PDF, JPEG, PNG, or WebP receipt."
    );
  }
}

function requireDocumentIntegrity(document: Row, bytes: Buffer): void {
  if (
    bytes.length !== Number(document.sizeBytes) ||
    sha256(bytes) !== String(document.sha256)
  ) {
    throw new ApiError(
      500,
      "FINANCE_DOCUMENT_INTEGRITY_FAILED",
      "The supporting document could not be verified."
    );
  }
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function cleanupStoredReceipt(
  storage: FileStorage,
  reference: string,
  attemptedAt: Date
): Promise<"deleted" | "scheduled"> {
  try {
    await storage.delete(reference);
    return "deleted";
  } catch (error) {
    try {
      await ProcurementReceiptCleanupJobModel.updateOne(
        { storageReference: reference },
        {
          $setOnInsert: {
            _id: `procurement-cleanup-${randomUUID()}`,
            storageReference: reference,
            status: "pending",
            attempts: 1,
            lastErrorCode: storageErrorCode(error),
            lastAttemptAt: attemptedAt,
            nextAttemptAt: receiptMaintenanceNextAttempt(attemptedAt, 1),
            leaseToken: null,
            leaseExpiresAt: null,
            completedAt: null,
            deadLetteredAt: null
          },
          $set: {
            updatedAt: attemptedAt
          }
        },
        { upsert: true, runValidators: true, timestamps: false }
      );
      return "scheduled";
    } catch {
      throw new ApiError(
        500,
        "PROCUREMENT_RECEIPT_CLEANUP_UNTRACKED",
        "Receipt cleanup failed and could not be scheduled for retry."
      );
    }
  }
}

export async function runProcurementReceiptCleanupJobs(input: {
  storage: FileStorage;
  now?: Date;
  limit?: number;
  leaseMs?: number;
}): Promise<ProcurementReceiptMaintenanceResult> {
  const attemptedAt = input.now ?? new Date();
  const limit = receiptMaintenanceLimit(input.limit);
  const leaseMs = receiptMaintenanceLeaseDuration(input.leaseMs);
  const result = emptyReceiptMaintenanceResult();
  for (let index = 0; index < limit; index += 1) {
    const leaseToken = randomUUID();
    const job = await ProcurementReceiptCleanupJobModel.findOneAndUpdate(
      {
        status: "pending",
        nextAttemptAt: { $lte: attemptedAt },
        $or: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { $lte: attemptedAt } }
        ]
      },
      {
        $set: {
          leaseToken,
          leaseExpiresAt: new Date(attemptedAt.getTime() + leaseMs),
          lastAttemptAt: attemptedAt
        }
      },
      {
        returnDocument: "after",
        sort: { nextAttemptAt: 1, createdAt: 1, _id: 1 },
        runValidators: true,
        timestamps: false
      }
    ).select("+storageReference +leaseToken").lean();
    if (!job) break;
    result.claimed += 1;
    try {
      await input.storage.delete(String(job.storageReference));
      const completed = await ProcurementReceiptCleanupJobModel.updateOne(
        { _id: job._id, status: "pending", leaseToken },
        {
          $set: {
            status: "completed",
            completedAt: attemptedAt,
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: attemptedAt
          }
        },
        { runValidators: true, timestamps: false }
      );
      if (completed.modifiedCount !== 1) receiptMaintenanceLeaseLost();
      result.completed += 1;
    } catch (error) {
      const attempts = Number(job.attempts) + 1;
      const deadLettered = attempts >= receiptMaintenanceMaximumAttempts;
      const failed = await ProcurementReceiptCleanupJobModel.updateOne(
        { _id: job._id, status: "pending", leaseToken },
        {
          $set: {
            status: deadLettered ? "dead_letter" : "pending",
            attempts,
            lastErrorCode: storageErrorCode(error),
            lastAttemptAt: attemptedAt,
            nextAttemptAt: receiptMaintenanceNextAttempt(attemptedAt, attempts),
            leaseToken: null,
            leaseExpiresAt: null,
            deadLetteredAt: deadLettered ? attemptedAt : null,
            updatedAt: attemptedAt
          }
        },
        { runValidators: true, timestamps: false }
      );
      if (failed.modifiedCount !== 1) receiptMaintenanceLeaseLost();
      if (deadLettered) result.deadLettered += 1;
      else result.retried += 1;
    }
  }
  return result;
}

export async function runProcurementReceiptReconciliationJobs(input: {
  storage: FileStorage;
  now?: Date;
  limit?: number;
  leaseMs?: number;
}): Promise<ProcurementReceiptMaintenanceResult> {
  const attemptedAt = input.now ?? new Date();
  const limit = receiptMaintenanceLimit(input.limit);
  const leaseMs = receiptMaintenanceLeaseDuration(input.leaseMs);
  const result = emptyReceiptMaintenanceResult();
  for (let index = 0; index < limit; index += 1) {
    const leaseToken = randomUUID();
    const job = await ProcurementReceiptReconciliationJobModel.findOneAndUpdate(
      {
        status: "pending",
        nextAttemptAt: { $lte: attemptedAt },
        $or: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { $lte: attemptedAt } }
        ]
      },
      {
        $set: {
          leaseToken,
          leaseExpiresAt: new Date(attemptedAt.getTime() + leaseMs),
          lastAttemptAt: attemptedAt
        }
      },
      {
        returnDocument: "after",
        sort: { nextAttemptAt: 1, createdAt: 1, _id: 1 },
        runValidators: true,
        timestamps: false
      }
    ).select("+storageReference +leaseToken").lean();
    if (!job) break;
    result.claimed += 1;
    try {
      const resolution = await probeReceiptReconciliationJob(job);
      if (resolution === "conflict") {
        throw Object.assign(new Error("Receipt reconciliation conflict"), {
          code: "RECONCILIATION_CONFLICT"
        });
      }
      let cleanupStatus: "deleted" | "scheduled" | null = null;
      if (resolution === "not_found" || resolution === "redundant") {
        cleanupStatus = await cleanupStoredReceipt(
          input.storage,
          String(job.storageReference),
          attemptedAt
        );
      }
      const completed = await ProcurementReceiptReconciliationJobModel.updateOne(
        { _id: job._id, status: "pending", leaseToken },
        {
          $set: {
            status: resolution === "committed" ? "committed" : "aborted",
            cleanupStatus,
            attempts: Number(job.attempts) + 1,
            lastErrorCode: null,
            lastAttemptAt: attemptedAt,
            completedAt: attemptedAt,
            leaseToken: null,
            leaseExpiresAt: null,
            updatedAt: attemptedAt
          }
        },
        { runValidators: true, timestamps: false }
      );
      if (completed.modifiedCount !== 1) receiptMaintenanceLeaseLost();
      result.completed += 1;
    } catch (error) {
      const attempts = Number(job.attempts) + 1;
      const deadLettered = attempts >= receiptMaintenanceMaximumAttempts;
      const failed = await ProcurementReceiptReconciliationJobModel.updateOne(
        { _id: job._id, status: "pending", leaseToken },
        {
          $set: {
            status: deadLettered ? "dead_letter" : "pending",
            attempts,
            lastErrorCode: maintenanceErrorCode(error),
            lastAttemptAt: attemptedAt,
            nextAttemptAt: receiptMaintenanceNextAttempt(attemptedAt, attempts),
            leaseToken: null,
            leaseExpiresAt: null,
            deadLetteredAt: deadLettered ? attemptedAt : null,
            updatedAt: attemptedAt
          }
        },
        { runValidators: true, timestamps: false }
      );
      if (failed.modifiedCount !== 1) receiptMaintenanceLeaseLost();
      if (deadLettered) result.deadLettered += 1;
      else result.retried += 1;
    }
  }
  return result;
}

async function persistReceiptReconciliationJob(
  identity: ReceiptReconciliationIdentity,
  createdAt: Date
): Promise<void> {
  try {
    await ProcurementReceiptReconciliationJobModel.updateOne(
      {
        projectId: identity.projectId,
        idempotencyKey: identity.idempotencyKey,
        contentSha256: identity.contentSha256,
        storageReference: identity.storageReference
      },
      {
        $setOnInsert: {
          _id: `procurement-reconciliation-${randomUUID()}`,
          projectId: identity.projectId,
          idempotencyKey: identity.idempotencyKey,
          contentSha256: identity.contentSha256,
          sizeBytes: identity.sizeBytes,
          storageReference: identity.storageReference,
          status: "pending",
          cleanupStatus: null,
          attempts: 0,
          lastErrorCode: null,
          lastAttemptAt: null,
          nextAttemptAt: createdAt,
          leaseToken: identity.leaseToken,
          leaseExpiresAt: new Date(
            createdAt.getTime() + receiptMaintenanceLeaseMs
          ),
          completedAt: null,
          deadLetteredAt: null,
          createdAt,
          updatedAt: createdAt
        }
      },
      { upsert: true, runValidators: true, timestamps: false }
    );
  } catch {
    throw new ApiError(
      500,
      "PROCUREMENT_RECEIPT_RECONCILIATION_UNTRACKED",
      "Receipt reconciliation could not be scheduled safely."
    );
  }
}

async function closeReceiptReconciliationJob(
  identity: ReceiptReconciliationIdentity,
  resolution: "committed" | "aborted",
  cleanupStatus: "deleted" | "scheduled" | null,
  completedAt: Date
): Promise<void> {
  await ProcurementReceiptReconciliationJobModel.updateOne(
    {
      projectId: identity.projectId,
      idempotencyKey: identity.idempotencyKey,
      contentSha256: identity.contentSha256,
      storageReference: identity.storageReference,
      status: "pending",
      leaseToken: identity.leaseToken
    },
    {
      $set: {
        status: resolution,
        cleanupStatus,
        lastErrorCode: null,
        completedAt,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: completedAt
      }
    },
    { runValidators: true, timestamps: false }
  );
}

function receiptReconciliationIdentity(
  projectId: string,
  idempotencyKey: string,
  receipt: StoredReceiptIdentity
): ReceiptReconciliationIdentity {
  return {
    projectId,
    idempotencyKey,
    contentSha256: receipt.sha256,
    sizeBytes: receipt.sizeBytes,
    storageReference: receipt.reference,
    leaseToken: `request-${randomUUID()}`
  };
}

async function consumeReceiptReconciliationIntent(
  identity: ReceiptReconciliationIdentity,
  resolution: "committed" | "aborted",
  completedAt: Date,
  session: ClientSession
): Promise<void> {
  const consumed = await ProcurementReceiptReconciliationJobModel.findOneAndUpdate(
    {
      projectId: identity.projectId,
      idempotencyKey: identity.idempotencyKey,
      contentSha256: identity.contentSha256,
      storageReference: identity.storageReference,
      status: "pending",
      leaseToken: identity.leaseToken
    },
    {
      $set: {
        status: resolution,
        cleanupStatus: null,
        lastErrorCode: null,
        completedAt,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: completedAt
      }
    },
    {
      returnDocument: "after",
      runValidators: true,
      timestamps: false,
      session
    }
  ).lean();
  if (!consumed) {
    throw new ApiError(
      409,
      "PROCUREMENT_RECEIPT_INTENT_LOST",
      "Receipt ownership changed before the expense could be recorded."
    );
  }
}

async function probeReceiptReconciliationJob(
  job: Row
): Promise<"committed" | "redundant" | "not_found" | "conflict"> {
  return procurementSnapshotRead(async (session) => {
    const entries = await FinanceLedgerEntryModel.find({
      projectId: String(job.projectId),
      idempotencyKey: String(job.idempotencyKey)
    }).limit(2).session(session).lean();
    if (entries.length === 0) return "not_found";
    if (entries.length !== 1) return "conflict";
    const entry = entries[0]!;
    const documents = await FinanceEntryDocumentModel.find({
      entryId: String(entry._id),
      projectId: String(job.projectId)
    }).select("+storageReference +sha256").limit(2).session(session).lean();
    if (documents.length !== 1) return "conflict";
    const document = documents[0]!;
    if (
      entry.type !== "direct_spend" ||
      entry.expenseClass !== "procurement" ||
      entry.status !== "posted" ||
      String(document.sha256) !== String(job.contentSha256) ||
      Number(document.sizeBytes) !== Number(job.sizeBytes)
    ) return "conflict";
    return String(document.storageReference) === String(job.storageReference)
      ? "committed"
      : "redundant";
  });
}

function emptyReceiptMaintenanceResult(): ProcurementReceiptMaintenanceResult {
  return { claimed: 0, completed: 0, retried: 0, deadLettered: 0 };
}

function receiptMaintenanceLimit(value: number | undefined): number {
  if (value === undefined) return receiptMaintenanceDefaultLimit;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Receipt maintenance limit must be a positive integer.");
  }
  return Math.min(value, receiptMaintenanceMaximumLimit);
}

function receiptMaintenanceLeaseDuration(value: number | undefined): number {
  if (value === undefined) return receiptMaintenanceLeaseMs;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Receipt maintenance lease duration must be positive.");
  }
  return value;
}

function receiptMaintenanceNextAttempt(attemptedAt: Date, attempts: number): Date {
  const exponent = Math.max(0, Math.min(attempts - 1, 20));
  const delay = Math.min(
    receiptMaintenanceBaseBackoffMs * (2 ** exponent),
    receiptMaintenanceMaximumBackoffMs
  );
  return new Date(attemptedAt.getTime() + delay);
}

function receiptMaintenanceLeaseLost(): never {
  throw new Error("Procurement receipt maintenance lease was lost.");
}

function storageErrorCode(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code).toUpperCase()
    : "STORAGE_DELETE_FAILED";
  return /^[A-Z0-9_]{1,64}$/u.test(code) ? code : "STORAGE_DELETE_FAILED";
}

function maintenanceErrorCode(error: unknown): string {
  if (error instanceof ApiError) return storageErrorCode({ code: error.code });
  return storageErrorCode(error);
}

function storedRupeesToPaise(value: unknown): number {
  try {
    return rupeesToPaise(Number(value));
  } catch {
    procurementLineageConflict();
  }
}

function requiredStoredText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) procurementLineageConflict();
  return value.trim();
}

function requiredText(
  value: unknown,
  field: string,
  maximum: number,
  minimum = 1
): string {
  if (typeof value !== "string") {
    throw validationError(field, `Enter ${field}.`);
  }
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw validationError(field, `Enter ${field} using ${minimum}-${maximum} characters.`);
  }
  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  maximum: number
): string | null {
  if (value == null || value === "") return null;
  return requiredText(value, field, maximum);
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function validDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(value as never);
  if (Number.isNaN(date.getTime())) financeStateCorrupt();
  return date;
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

async function procurementSnapshotRead<T>(
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  const result = await mongoose.connection.transaction(operation, {
    readConcern: { level: "snapshot" },
    readPreference: "primary"
  });
  if (result === undefined) financeStateCorrupt();
  return result;
}

function validationError(field: string, message: string): ApiError {
  return new ApiError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed.",
    { [field]: message }
  );
}

function forbidden(): never {
  throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "Resource not found.");
}

function procurementLineageConflict(): never {
  throw new ApiError(
    409,
    "PROCUREMENT_APPROVAL_SOURCE_CONFLICT",
    "The procurement workspace does not match one immutable approved Estimate."
  );
}

function financeStateCorrupt(): never {
  throw new ApiError(
    500,
    "FINANCE_STATE_INVALID",
    "The stored project finance state is invalid."
  );
}
