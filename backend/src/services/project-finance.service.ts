import { randomUUID } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import {
  workflowTaskDueAt,
  type ProjectWorkflowTaskKind
} from "../domain/project-workflow.js";
import {
  FINANCE_EXPENSE_CLASSES,
  FINANCE_LEDGER_ENTRY_TYPES,
  PROJECT_FINANCE_CURRENCY,
  PROJECT_FINANCE_TARGET_MARGIN_BPS,
  assertFinanceAmount,
  projectFinanceBaseline,
  projectFinancePosition,
  safeAddFinanceAmounts,
  type FinanceExpenseClass,
  type FinanceLedgerEntryType,
  type ProjectDeadlineStatus,
  type ProjectFinanceBucketStatus
} from "../domain/project-finance.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { FinanceLedgerEntryModel } from "../models/FinanceLedgerEntry.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectFinanceBucketModel } from "../models/ProjectFinanceBucket.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { UserModel } from "../models/User.js";
import type { PublicUser } from "./auth.service.js";

type Row = Record<string, any>;

export interface ProjectFinancePagination {
  limit: number;
  offset: number;
}

export interface ProjectFinanceBucketDto {
  id: string;
  projectId: string;
  projectName: string;
  projectStatus: string;
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
  designPlanVersion: number;
  currency: typeof PROJECT_FINANCE_CURRENCY;
  approvedSubtotalPaise: number;
  approvedGstPaise: number;
  approvedContractTotalPaise: number;
  targetMarginBps: typeof PROJECT_FINANCE_TARGET_MARGIN_BPS;
  targetProfitPaise: number;
  costBudgetPaise: number;
  procurementCostPaise: number;
  employeePaymentPaise: number;
  otherExpensePaise: number;
  directSpendPaise: number;
  overheadPaise: number;
  recordedCostPaise: number;
  remainingBudgetPaise: number;
  currentProfitPaise: number;
  currentMarginBps: number | null;
  overBudget: boolean;
  deadlineAt: string;
  overdueDays: number;
  deadlineStatus: ProjectDeadlineStatus;
  overdueTaskCount: number;
  status: ProjectFinanceBucketStatus;
  version: number;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceLedgerEntryDto {
  id: string;
  bucketId: string;
  projectId: string;
  type: FinanceLedgerEntryType;
  expenseClass: FinanceExpenseClass | null;
  category: string;
  amountPaise: number;
  incurredAt: string;
  description: string;
  vendor: string | null;
  reference: string | null;
  sourceSectionId: string | null;
  idempotencyKey: string;
  status: "posted" | "voided";
  version: number;
  createdById: string;
  voidedAt: string | null;
  voidedById: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostFinanceEntryInput {
  type: FinanceLedgerEntryType;
  expenseClass?: FinanceExpenseClass | null;
  category: string;
  amountPaise: number;
  incurredAt: string;
  description: string;
  vendor?: string | null;
  reference?: string | null;
  sourceSectionId?: string | null;
  idempotencyKey: string;
}

export interface PostFinanceEntryResult {
  entry: FinanceLedgerEntryDto;
  bucket: ProjectFinanceBucketDto;
  replayed: boolean;
}

export interface ProjectFinancePortfolioSummary {
  projectCount: number;
  approvedContractTotalPaise: number;
  approvedGstPaise: number;
  approvedSubtotalPaise: number;
  targetProfitPaise: number;
  costBudgetPaise: number;
  procurementCostPaise: number;
  employeePaymentPaise: number;
  otherExpensePaise: number;
  directSpendPaise: number;
  overheadPaise: number;
  recordedCostPaise: number;
  remainingBudgetPaise: number;
  currentProfitPaise: number;
  currentMarginBps: number | null;
  overBudgetProjectCount: number;
  overdueProjectCount: number;
  lateCompletedProjectCount: number;
  overdueTaskCount: number;
}

export interface ProjectFinanceService {
  listProjects(
    actor: PublicUser,
    pagination: ProjectFinancePagination
  ): Promise<{
    items: ProjectFinanceBucketDto[];
    total: number;
    summary: ProjectFinancePortfolioSummary;
  }>;
  getBucket(
    actor: PublicUser,
    projectId: string
  ): Promise<ProjectFinanceBucketDto>;
  listEntries(
    actor: PublicUser,
    projectId: string,
    pagination: ProjectFinancePagination
  ): Promise<{ items: FinanceLedgerEntryDto[]; total: number }>;
  postEntry(
    actor: PublicUser,
    projectId: string,
    input: PostFinanceEntryInput
  ): Promise<PostFinanceEntryResult>;
}

export interface EnsurePendingFinanceBucketInput {
  projectId: string;
  estimateId: string;
  estimateVersion: number;
  estimateReviewRoundId: string | null;
  approvedSubtotalRupees: number;
  approvedGstRupees: number;
  approvedContractTotalRupees: number;
  createdById: string;
  occurredAt: Date;
}

export interface OpenFinanceBucketInput {
  projectId: string;
  designPlanVersion: number;
  openedById: string;
  occurredAt: Date;
  fallbackBaseline?: {
    estimateId: string;
    estimateVersion: number;
    estimateReviewRoundId: string | null;
    approvedSubtotalRupees: number;
    approvedGstRupees: number;
    approvedContractTotalRupees: number;
  };
}

export function createProjectFinanceService(input: {
  now?: () => Date;
  /** Test-only synchronization hook invoked after bucket counters are read. */
  afterSnapshotEstablished?: () => Promise<void>;
} = {}): ProjectFinanceService {
  const now = input.now ?? (() => new Date());

  return {
    async listProjects(actor, pagination) {
      validatePagination(pagination);
      return financeSnapshotRead(async (session) => {
        const storedActor = await requireFinanceActor(actor, session);
        const projectIds = storedActor.role === "super_admin"
          ? null
          : await financeWorkflowProjectIds(session);
        if (projectIds?.length === 0) {
          return { items: [], total: 0, summary: emptyPortfolioSummary() };
        }

        /*
         * Client-approved Estimates are the portfolio membership source—the
         * same source shown on the Projects list. A finance bucket is an
         * optional materialized ledger state, not evidence that a project was
         * approved. This keeps pre-backfill approvals visible and prevents a
         * zero portfolio when approved Estimates already exist.
         */
        const approvedEstimates = await approvedFinanceEstimates(
          projectIds,
          session
        );
        const approvedProjectIds = [
          ...new Set(approvedEstimates.map((estimate) => String(estimate.projectId)))
        ];
        const materializedBuckets = await ProjectFinanceBucketModel.find({
          projectId: { $in: approvedProjectIds }
        })
          .session(session)
          .lean();
        await input.afterSnapshotEstablished?.();
        const bucketsByProjectId = new Map(
          materializedBuckets.map((bucket) => [String(bucket.projectId), bucket])
        );
        const estimatesByProjectId = groupEstimatesByProject(approvedEstimates);
        const financeSources = [...estimatesByProjectId.entries()].map(
          ([projectId, estimates]) => {
            const materialized = bucketsByProjectId.get(projectId);
            const estimate = canonicalApprovedEstimate(estimates, materialized);
            return materialized && String(materialized.estimateId) === String(estimate._id)
              ? materialized
              : syntheticFinanceBucket(estimate);
          }
        ).sort(compareFinanceSources);
        const total = financeSources.length;
        const buckets = financeSources.slice(
          pagination.offset,
          pagination.offset + pagination.limit
        );
        const allProjectIds = financeSources.map((bucket) => String(bucket.projectId));
        const observedAt = now();
        const projects = await ProjectModel.find({ _id: { $in: allProjectIds } })
          .select({
            _id: 1,
            name: 1,
            status: 1,
            plannedEndAt: 1,
            actualEndAt: 1
          })
          .session(session)
          .lean();
        const enrichments = await loadFinanceEnrichments(
          allProjectIds,
          observedAt,
          session
        );
        const projectsById = new Map(
          projects.map((project) => [String(project._id), project])
        );
        requireCompletePortfolio(financeSources, projectsById);
        return {
          items: buckets.map((bucket) => {
            const projectId = String(bucket.projectId);
            const project = projectsById.get(projectId);
            if (!project) financeStateCorrupt();
            return bucketDto(
              bucket,
              project,
              enrichments.get(projectId),
              observedAt
            );
          }),
          total,
          summary: portfolioSummary(
            financeSources,
            projectsById,
            enrichments,
            observedAt
          )
        };
      });
    },

    async getBucket(actor, projectId) {
      return financeSnapshotRead(async (session) => {
        const storedActor = await requireFinanceActor(actor, session);
        await requireFinanceProjectAccess(storedActor, projectId, session);
        const observedAt = now();
        const materialized = await ProjectFinanceBucketModel.findOne({ projectId })
          .session(session)
          .lean();
        await input.afterSnapshotEstablished?.();
        const estimates = await approvedFinanceEstimates([projectId], session);
        if (estimates.length === 0) notFound();
        const estimate = canonicalApprovedEstimate(estimates, materialized);
        const bucket = materialized &&
          String(materialized.estimateId) === String(estimate._id)
          ? materialized
          : syntheticFinanceBucket(estimate);
        const project = await ProjectModel.findById(projectId)
          .select({ _id: 1, name: 1, status: 1, plannedEndAt: 1, actualEndAt: 1 })
          .session(session)
          .lean();
        const enrichments = await loadFinanceEnrichments(
          [projectId],
          observedAt,
          session
        );
        if (!bucket || !project) notFound();
        return bucketDto(bucket, project, enrichments.get(projectId), observedAt);
      });
    },

    async listEntries(actor, projectId, pagination) {
      validatePagination(pagination);
      return financeSnapshotRead(async (session) => {
        const storedActor = await requireFinanceActor(actor, session);
        await requireFinanceProjectAccess(storedActor, projectId, session);
        const bucket = await ProjectFinanceBucketModel.findOne({ projectId })
          .select({ _id: 1 })
          .session(session)
          .lean();
        if (!bucket) {
          const estimates = await approvedFinanceEstimates([projectId], session);
          if (estimates.length === 0) notFound();
          return { items: [], total: 0 };
        }
        const filter = { bucketId: String(bucket._id), projectId };
        const entries = await FinanceLedgerEntryModel.find(filter)
          .sort({ incurredAt: -1, _id: -1 })
          .skip(pagination.offset)
          .limit(pagination.limit)
          .session(session)
          .lean();
        await input.afterSnapshotEstablished?.();
        const total = await FinanceLedgerEntryModel.countDocuments(filter)
          .session(session);
        return { items: entries.map(entryDto), total };
      });
    },

    async postEntry(actor, projectId, rawInput) {
      const preflightActor = await requireFinanceActor(actor);
      await requireFinanceProjectAccess(preflightActor, projectId);
      const normalized = normalizeEntryInput(rawInput);
      try {
        return await mongoose.connection.transaction(async (session) => {
          const storedActor = await requireFinanceActor(actor, session);
          await requireFinanceProjectAccess(storedActor, projectId, session);
          const bucket = await ProjectFinanceBucketModel.findOne({ projectId })
            .session(session)
            .lean();
          const project = await ProjectModel.findById(projectId)
              .select({
                _id: 1,
                name: 1,
                status: 1,
                plannedEndAt: 1,
                actualEndAt: 1
              })
              .session(session)
              .lean();
          if (!project) notFound();
          if (!bucket) {
            const estimates = await approvedFinanceEstimates([projectId], session);
            if (estimates.length === 0) notFound();
          }
          if (!bucket || bucket.status !== "open") {
            throw new ApiError(
              409,
              "FINANCE_BUCKET_NOT_OPEN",
              "Project spending can be recorded only after its approved finance bucket is opened."
            );
          }

          const replay = await FinanceLedgerEntryModel.findOne({
            projectId,
            idempotencyKey: normalized.idempotencyKey
          }).session(session).lean();
          if (replay) {
            requireMatchingReplay(replay, normalized);
            const observedAt = now();
            const enrichments = await loadFinanceEnrichments(
              [projectId],
              observedAt,
              session
            );
            return {
              entry: entryDto(replay),
              bucket: bucketDto(
                bucket,
                project,
                enrichments.get(projectId),
                observedAt
              ),
              replayed: true
            };
          }

          const currentDirect = Number(bucket.directSpendPaise ?? 0);
          const currentOverhead = Number(bucket.overheadPaise ?? 0);
          const nextDirect = normalized.type === "direct_spend"
            ? safeAddFinanceAmounts(
                currentDirect,
                normalized.amountPaise,
                "Direct spending"
              )
            : currentDirect;
          const nextOverhead = normalized.type === "overhead"
            ? safeAddFinanceAmounts(
                currentOverhead,
                normalized.amountPaise,
                "Overheads"
              )
            : currentOverhead;
          safeAddFinanceAmounts(nextDirect, nextOverhead, "Recorded project cost");

          const occurredAt = now();
          const entryId = `finance-entry-${randomUUID()}`;
          const [entry] = await FinanceLedgerEntryModel.create([{
            _id: entryId,
            bucketId: String(bucket._id),
            projectId,
            ...normalized,
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

          const amountField = normalized.type === "direct_spend"
            ? "directSpendPaise"
            : "overheadPaise";
          const updated = await ProjectFinanceBucketModel.findOneAndUpdate(
            {
              _id: bucket._id,
              projectId,
              status: "open",
              version: Number(bucket.version)
            },
            {
              $inc: { [amountField]: normalized.amountPaise, version: 1 },
              $set: { updatedAt: occurredAt }
            },
            {
              returnDocument: "after",
              runValidators: true,
              session,
              timestamps: false
            }
          ).lean();
          if (!updated) {
            throw new ApiError(
              409,
              "FINANCE_BUCKET_STALE",
              "The project budget changed before this entry could be recorded."
            );
          }

          const enrichments = await loadFinanceEnrichments(
            [projectId],
            occurredAt,
            session
          );

          /*
           * The immutable ledger is the financial audit trail. Deliberately do
           * not copy amounts into the generic AuditEvent stream, which is also
           * readable by non-finance Design leadership.
           */
          return {
            entry: entryDto(entry.toObject()),
            bucket: bucketDto(
              updated,
              project,
              enrichments.get(projectId),
              occurredAt
            ),
            replayed: false
          };
        });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        return replayCommittedEntry(
          actor,
          projectId,
          normalized,
          now(),
          input.afterSnapshotEstablished
        );
      }
    }
  };
}

/**
 * Stores the exact Client-approved Estimate value before Design work begins.
 * This helper is intended to run inside the Estimate-approval transaction.
 */
export async function ensurePendingProjectFinanceBucket(
  input: EnsurePendingFinanceBucketInput,
  session: ClientSession
): Promise<Row> {
  validateLifecycleInput(input);
  const baseline = projectFinanceBaseline({
    subtotalRupees: input.approvedSubtotalRupees,
    gstRupees: input.approvedGstRupees,
    totalRupees: input.approvedContractTotalRupees
  });
  const candidate = {
    _id: `finance-bucket-${input.projectId}`,
    projectId: input.projectId,
    estimateId: input.estimateId,
    estimateVersion: input.estimateVersion,
    estimateReviewRoundId: input.estimateReviewRoundId,
    designPlanVersion: 0,
    currency: PROJECT_FINANCE_CURRENCY,
    ...baseline,
    directSpendPaise: 0,
    overheadPaise: 0,
    status: "pending_design",
    version: 1,
    createdById: input.createdById,
    openedAt: null,
    openedById: null,
    closedAt: null,
    closedById: null,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt
  } as const;
  let bucket = await ProjectFinanceBucketModel.findOne({
    projectId: input.projectId
  }).session(session).lean();
  if (!bucket) {
    const [created] = await ProjectFinanceBucketModel.create([candidate], { session });
    if (!created) financeStateCorrupt();
    bucket = created.toObject();
  }
  requireMatchingBaseline(bucket, candidate);
  return bucket;
}

/** Activates the immutable budget when the Design plan is approved. */
export async function openProjectFinanceBucket(
  input: OpenFinanceBucketInput,
  session: ClientSession
): Promise<Row> {
  if (
    !input.projectId.trim() ||
    !input.openedById.trim() ||
    !Number.isSafeInteger(input.designPlanVersion) ||
    input.designPlanVersion < 1 ||
    !isValidDate(input.occurredAt)
  ) {
    throw new TypeError("Finance bucket activation input is invalid.");
  }
  let current = await ProjectFinanceBucketModel.findOne({
    projectId: input.projectId
  }).session(session).lean();
  if (!current && input.fallbackBaseline) {
    await ensurePendingProjectFinanceBucket({
      projectId: input.projectId,
      ...input.fallbackBaseline,
      createdById: input.openedById,
      occurredAt: input.occurredAt
    }, session);
    current = await ProjectFinanceBucketModel.findOne({
      projectId: input.projectId
    }).session(session).lean();
  }
  if (!current) {
    throw new ApiError(
      409,
      "FINANCE_BUCKET_MISSING",
      "The approved project budget is missing."
    );
  }
  if (
    current.status === "open" &&
    Number(current.designPlanVersion) === input.designPlanVersion
  ) {
    return current;
  }
  const updated = await ProjectFinanceBucketModel.findOneAndUpdate(
    {
      _id: current._id,
      projectId: input.projectId,
      status: "pending_design",
      designPlanVersion: 0,
      version: Number(current.version)
    },
    {
      $set: {
        status: "open",
        designPlanVersion: input.designPlanVersion,
        openedAt: input.occurredAt,
        openedById: input.openedById,
        updatedAt: input.occurredAt
      },
      $inc: { version: 1 }
    },
    {
      returnDocument: "after",
      runValidators: true,
      session,
      timestamps: false
    }
  ).lean();
  if (!updated) {
    throw new ApiError(
      409,
      "FINANCE_BUCKET_STATE_CONFLICT",
      "The approved project budget changed before it could be opened."
    );
  }
  return updated;
}

async function replayCommittedEntry(
  actor: PublicUser,
  projectId: string,
  input: NormalizedEntryInput,
  observedAt: Date,
  afterSnapshotEstablished?: () => Promise<void>
): Promise<PostFinanceEntryResult> {
  return financeSnapshotRead(async (session) => {
    const storedActor = await requireFinanceActor(actor, session);
    await requireFinanceProjectAccess(storedActor, projectId, session);
    const entry = await FinanceLedgerEntryModel.findOne({
      projectId,
      idempotencyKey: input.idempotencyKey
    }).session(session).lean();
    await afterSnapshotEstablished?.();
    const bucket = await ProjectFinanceBucketModel.findOne({ projectId })
      .session(session)
      .lean();
    const project = await ProjectModel.findById(projectId)
      .select({ _id: 1, name: 1, status: 1, plannedEndAt: 1, actualEndAt: 1 })
      .session(session)
      .lean();
    const enrichments = await loadFinanceEnrichments(
      [projectId],
      observedAt,
      session
    );
    if (!entry || !bucket || !project) throw duplicateConflict();
    requireMatchingReplay(entry, input);
    return {
      entry: entryDto(entry),
      bucket: bucketDto(bucket, project, enrichments.get(projectId), observedAt),
      replayed: true
    };
  });
}

async function requireFinanceActor(
  actor: PublicUser,
  session?: ClientSession
): Promise<{ id: string; role: "finance_head" | "super_admin" }> {
  const query = UserModel.findOne({
    _id: actor.id,
    role: actor.role,
    active: true
  }).select({ _id: 1, role: 1 }).lean();
  if (session) query.session(session);
  const stored = await query.exec();
  if (!stored) {
    throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  }
  if (stored.role !== "finance_head" && stored.role !== "super_admin") {
    forbidden();
  }
  return { id: String(stored._id), role: stored.role };
}

async function requireFinanceProjectAccess(
  actor: { id: string; role: "finance_head" | "super_admin" },
  projectId: string,
  session?: ClientSession
): Promise<void> {
  if (!projectId.trim()) notFound();
  if (actor.role === "super_admin") return;
  /*
   * The operational Finance queue is role-wide. Its project task is therefore
   * the Finance Manager's project scope; retaining the task after completion
   * also retains access to the project's long-lived ledger.
   */
  const query = ProjectWorkflowTaskModel.exists({
    projectId,
    kind: "finance",
    assigneeRole: "finance_head"
  });
  if (session) query.session(session);
  if (!(await query.exec())) notFound();
}

async function financeWorkflowProjectIds(session?: ClientSession): Promise<string[]> {
  const query = ProjectWorkflowTaskModel.find({
    kind: "finance",
    assigneeRole: "finance_head"
  }).select({ projectId: 1, _id: 0 }).lean();
  if (session) query.session(session);
  const tasks = await query.exec();
  return [...new Set(tasks.map((task) => String(task.projectId)))];
}

async function approvedFinanceEstimates(
  projectIds: readonly string[] | null,
  session: ClientSession
): Promise<Row[]> {
  const leadFilter = projectIds === null
    ? { projectId: { $type: "string", $ne: "" } }
    : { projectId: { $in: projectIds } };
  const leads = await LeadModel.find(leadFilter)
    .select({ _id: 1, projectId: 1 })
    .session(session)
    .lean();
  const projectByLeadId = new Map(
    leads.map((lead) => [String(lead._id), String(lead.projectId)])
  );
  const directProjectFilter = projectIds === null
    ? { $type: "string", $ne: "" }
    : { $in: projectIds };
  const linkFilters: Row[] = [{ projectId: directProjectFilter }];
  if (leads.length > 0) {
    linkFilters.push({ leadId: { $in: leads.map((lead) => String(lead._id)) } });
  }
  const estimates = await EstimateModel.find({
    status: "client_approved",
    $or: linkFilters
  })
    .select({
      _id: 1,
      leadId: 1,
      projectId: 1,
      version: 1,
      subtotal: 1,
      gst: 1,
      total: 1,
      designPlanStatus: 1,
      designPlanVersion: 1,
      clientDecisionAt: 1,
      createdAt: 1,
      updatedAt: 1
    })
    .sort({ clientDecisionAt: -1, updatedAt: -1, _id: 1 })
    .session(session)
    .lean();
  const unresolvedLeadIds = [
    ...new Set(
      estimates
        .map((estimate) => String(estimate.leadId))
        .filter((leadId) => !projectByLeadId.has(leadId))
    )
  ];
  if (unresolvedLeadIds.length > 0) {
    const linkedLeads = await LeadModel.find({ _id: { $in: unresolvedLeadIds } })
      .select({ _id: 1, projectId: 1 })
      .session(session)
      .lean();
    for (const lead of linkedLeads) {
      const leadProjectId = nonEmptyIdentifier(lead.projectId);
      if (leadProjectId !== null) {
        projectByLeadId.set(String(lead._id), leadProjectId);
      }
    }
  }
  const requestedProjectIds = projectIds === null ? null : new Set(projectIds);
  const resolved: Row[] = [];
  for (const estimate of estimates) {
    const directProjectId = nonEmptyIdentifier(estimate.projectId);
    const leadProjectId = projectByLeadId.get(String(estimate.leadId)) ?? null;
    if (
      directProjectId !== null &&
      leadProjectId !== null &&
      directProjectId !== leadProjectId
    ) {
      throw new ApiError(
        409,
        "FINANCE_ESTIMATE_PROJECT_LINK_CONFLICT",
        "An approved Estimate is linked to different projects through its Estimate and Lead."
      );
    }
    const resolvedProjectId = directProjectId ?? leadProjectId;
    if (
      resolvedProjectId === null ||
      (requestedProjectIds !== null && !requestedProjectIds.has(resolvedProjectId))
    ) continue;
    resolved.push({ ...estimate, projectId: resolvedProjectId });
  }
  return resolved;
}

function groupEstimatesByProject(estimates: readonly Row[]): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const estimate of estimates) {
    const projectId = String(estimate.projectId);
    const existing = grouped.get(projectId) ?? [];
    existing.push(estimate);
    grouped.set(projectId, existing);
  }
  return grouped;
}

function canonicalApprovedEstimate(
  estimates: readonly Row[],
  materializedBucket?: Row | null
): Row {
  if (estimates.length === 0) financeStateCorrupt();
  if (materializedBucket) {
    const matching = estimates.find(
      (estimate) => String(estimate._id) === String(materializedBucket.estimateId)
    );
    if (matching) return matching;
  }
  const [latest] = estimates;
  if (!latest) financeStateCorrupt();
  return latest;
}

function syntheticFinanceBucket(estimate: Row): Row {
  const baseline = projectFinanceBaseline({
    subtotalRupees: Number(estimate.subtotal),
    gstRupees: Number(estimate.gst),
    totalRupees: Number(estimate.total)
  });
  const projectId = String(estimate.projectId);
  const estimateVersion = Number(estimate.version ?? 1);
  if (!Number.isSafeInteger(estimateVersion) || estimateVersion < 1) {
    financeStateCorrupt();
  }
  const createdAt = validStoredDate(
    estimate.clientDecisionAt ?? estimate.updatedAt ?? estimate.createdAt
  );
  const updatedAt = validStoredDate(estimate.updatedAt ?? createdAt);
  return {
    _id: `finance-bucket-${projectId}`,
    projectId,
    estimateId: String(estimate._id),
    estimateVersion,
    estimateReviewRoundId: null,
    designPlanVersion: 0,
    currency: PROJECT_FINANCE_CURRENCY,
    ...baseline,
    directSpendPaise: 0,
    overheadPaise: 0,
    status: "pending_design",
    version: 1,
    openedAt: null,
    closedAt: null,
    createdAt,
    updatedAt
  };
}

function compareFinanceSources(left: Row, right: Row): number {
  const timeDifference = validStoredDate(right.updatedAt).getTime() -
    validStoredDate(left.updatedAt).getTime();
  return timeDifference || String(left._id).localeCompare(String(right._id));
}

function nonEmptyIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function validStoredDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(value as never);
  if (!isValidDate(date)) financeStateCorrupt();
  return date;
}

async function financeSnapshotRead<T>(
  operation: (session: ClientSession) => Promise<T>
): Promise<T> {
  const result = await mongoose.connection.transaction(operation, {
    readConcern: { level: "snapshot" },
    readPreference: "primary"
  });
  if (result === undefined) financeStateCorrupt();
  return result;
}

interface NormalizedEntryInput {
  type: FinanceLedgerEntryType;
  expenseClass: FinanceExpenseClass | null;
  category: string;
  amountPaise: number;
  incurredAt: Date;
  description: string;
  vendor: string | null;
  reference: string | null;
  sourceSectionId: string | null;
  idempotencyKey: string;
}

function normalizeEntryInput(input: PostFinanceEntryInput): NormalizedEntryInput {
  if (!FINANCE_LEDGER_ENTRY_TYPES.includes(input.type)) {
    throw validationError("type", "Choose direct spending or overhead.");
  }
  try {
    assertFinanceAmount(input.amountPaise, "Finance entry amount");
  } catch {
    throw validationError("amountPaise", "Enter a valid amount in paise.");
  }
  if (input.amountPaise === 0) {
    throw validationError("amountPaise", "Finance entry amount must be greater than zero.");
  }
  let expenseClass: FinanceExpenseClass | null;
  if (input.type === "direct_spend") {
    if (
      typeof input.expenseClass !== "string" ||
      !FINANCE_EXPENSE_CLASSES.includes(input.expenseClass)
    ) {
      throw validationError(
        "expenseClass",
        "Classify direct spending as procurement, employee payment, or other."
      );
    }
    expenseClass = input.expenseClass;
  } else {
    if (input.expenseClass != null) {
      throw validationError(
        "expenseClass",
        "Overheads cannot be classified as direct project expenses."
      );
    }
    expenseClass = null;
  }
  const incurredAt = new Date(input.incurredAt);
  if (!isValidDate(incurredAt)) {
    throw validationError("incurredAt", "Enter a valid incurred date and time.");
  }
  return {
    type: input.type,
    expenseClass,
    category: requiredText(input.category, "category", 100),
    amountPaise: input.amountPaise,
    incurredAt,
    description: requiredText(input.description, "description", 1_000),
    vendor: optionalText(input.vendor, "vendor", 200),
    reference: optionalText(input.reference, "reference", 200),
    sourceSectionId: optionalText(input.sourceSectionId, "sourceSectionId", 64),
    idempotencyKey: requiredText(input.idempotencyKey, "idempotencyKey", 128, 8)
  };
}

interface FinanceEnrichment {
  procurementCostPaise: number;
  employeePaymentPaise: number;
  otherExpensePaise: number;
  overdueTaskCount: number;
}

function bucketDto(
  bucket: Row,
  project: Row,
  enrichment: FinanceEnrichment | undefined,
  observedAt: Date
): ProjectFinanceBucketDto {
  const resolvedEnrichment = enrichment ?? emptyEnrichment();
  const directSpendPaise = Number(bucket.directSpendPaise ?? 0);
  const classifiedSpendPaise = safePortfolioAdd(
    resolvedEnrichment.procurementCostPaise,
    resolvedEnrichment.employeePaymentPaise,
    "Classified project spending"
  );
  if (classifiedSpendPaise > directSpendPaise) financeStateCorrupt();
  /*
   * The residual includes explicit `other` and pre-classification legacy
   * entries. It is derived from the authoritative bucket counter so historic
   * data is never silently omitted from the project expense total.
   */
  const otherExpensePaise = directSpendPaise - classifiedSpendPaise;
  const position = projectFinancePosition({
    approvedSubtotalPaise: Number(bucket.approvedSubtotalPaise),
    costBudgetPaise: Number(bucket.costBudgetPaise),
    directSpendPaise,
    overheadPaise: Number(bucket.overheadPaise ?? 0)
  });
  const deadline = projectDeadline(project, observedAt);
  return {
    id: String(bucket._id),
    projectId: String(bucket.projectId),
    projectName: String(project.name),
    projectStatus: String(project.status),
    estimateId: String(bucket.estimateId),
    estimateVersion: Number(bucket.estimateVersion),
    estimateReviewRoundId: bucket.estimateReviewRoundId == null
      ? null
      : String(bucket.estimateReviewRoundId),
    designPlanVersion: Number(bucket.designPlanVersion),
    currency: PROJECT_FINANCE_CURRENCY,
    approvedSubtotalPaise: Number(bucket.approvedSubtotalPaise),
    approvedGstPaise: Number(bucket.approvedGstPaise),
    approvedContractTotalPaise: Number(bucket.approvedContractTotalPaise),
    targetMarginBps: PROJECT_FINANCE_TARGET_MARGIN_BPS,
    targetProfitPaise: Number(bucket.targetProfitPaise),
    costBudgetPaise: Number(bucket.costBudgetPaise),
    procurementCostPaise: resolvedEnrichment.procurementCostPaise,
    employeePaymentPaise: resolvedEnrichment.employeePaymentPaise,
    otherExpensePaise,
    ...position,
    ...deadline,
    overdueTaskCount: resolvedEnrichment.overdueTaskCount,
    status: bucket.status,
    version: Number(bucket.version),
    openedAt: nullableIso(bucket.openedAt),
    closedAt: nullableIso(bucket.closedAt),
    createdAt: new Date(bucket.createdAt).toISOString(),
    updatedAt: new Date(bucket.updatedAt).toISOString()
  };
}

async function loadFinanceEnrichments(
  projectIds: readonly string[],
  observedAt: Date,
  session?: ClientSession
): Promise<Map<string, FinanceEnrichment>> {
  const uniqueIds = [...new Set(projectIds)];
  const result = new Map(
    uniqueIds.map((projectId) => [projectId, emptyEnrichment()])
  );
  if (uniqueIds.length === 0) return result;

  const spendingAggregate = FinanceLedgerEntryModel.aggregate<Row>([
    {
      $match: {
        projectId: { $in: uniqueIds },
        type: "direct_spend",
        status: "posted"
      }
    },
    {
      $group: {
        _id: "$projectId",
        procurementCostPaise: {
          $sum: {
            $cond: [
              { $eq: ["$expenseClass", "procurement"] },
              "$amountPaise",
              0
            ]
          }
        },
        employeePaymentPaise: {
          $sum: {
            $cond: [
              { $eq: ["$expenseClass", "employee_payment"] },
              "$amountPaise",
              0
            ]
          }
        }
      }
    }
  ]);
  const overdueTaskQuery = ProjectWorkflowTaskModel.find({
    projectId: { $in: uniqueIds },
    status: { $in: ["open", "in_progress"] }
  }).select({ projectId: 1, kind: 1, openedAt: 1, dueAt: 1 }).lean();
  if (session) {
    spendingAggregate.session(session);
    overdueTaskQuery.session(session);
  }
  let spendingRows: Row[];
  let taskRows: Row[];
  if (session) {
    /* The Mongo driver forbids parallel operations on one transaction session. */
    spendingRows = await spendingAggregate.exec();
    taskRows = await overdueTaskQuery.exec() as Row[];
  } else {
    [spendingRows, taskRows] = await Promise.all([
      spendingAggregate.exec(),
      overdueTaskQuery.exec() as Promise<Row[]>
    ]);
  }
  for (const row of spendingRows) {
    const projectId = String(row._id);
    const current = result.get(projectId);
    if (!current) continue;
    current.procurementCostPaise = safeStoredAmount(row.procurementCostPaise);
    current.employeePaymentPaise = safeStoredAmount(row.employeePaymentPaise);
  }
  for (const row of taskRows) {
    const projectId = String(row.projectId);
    const current = result.get(projectId);
    if (!current) continue;
    const openedAt = new Date(row.openedAt);
    if (!isValidDate(openedAt)) financeStateCorrupt();
    const dueAt = row.dueAt == null
      ? workflowTaskDueAt(row.kind as ProjectWorkflowTaskKind, openedAt)
      : new Date(row.dueAt);
    if (!isValidDate(dueAt)) financeStateCorrupt();
    if (dueAt.getTime() < observedAt.getTime()) {
      current.overdueTaskCount += 1;
    }
  }
  return result;
}

function projectDeadline(project: Row, observedAt: Date): {
  deadlineAt: string;
  overdueDays: number;
  deadlineStatus: ProjectDeadlineStatus;
} {
  const deadlineAt = new Date(project.plannedEndAt);
  if (!isValidDate(deadlineAt)) financeStateCorrupt();
  const isCompleted = project.status === "completed";
  const actualEndAt = project.actualEndAt == null
    ? null
    : new Date(project.actualEndAt);
  if (actualEndAt && !isValidDate(actualEndAt)) financeStateCorrupt();
  if (isCompleted && actualEndAt === null) {
    return {
      deadlineAt: deadlineAt.toISOString(),
      overdueDays: 0,
      deadlineStatus: "completed_date_unknown"
    };
  }
  const comparisonAt = isCompleted ? actualEndAt! : observedAt;
  const crossedDeadline = comparisonAt.getTime() > deadlineAt.getTime();
  const overdueDays = crossedDeadline
    ? Math.ceil(
        (comparisonAt.getTime() - deadlineAt.getTime()) / (24 * 60 * 60 * 1_000)
      )
    : 0;
  return {
    deadlineAt: deadlineAt.toISOString(),
    overdueDays,
    deadlineStatus: isCompleted
      ? crossedDeadline ? "completed_late" : "completed_on_time"
      : crossedDeadline ? "overdue" : "on_track"
  };
}

function portfolioSummary(
  buckets: readonly Row[],
  projectsById: ReadonlyMap<string, Row>,
  enrichments: ReadonlyMap<string, FinanceEnrichment>,
  observedAt: Date
): ProjectFinancePortfolioSummary {
  const summary = emptyPortfolioSummary();
  for (const bucket of buckets) {
    const projectId = String(bucket.projectId);
    const project = projectsById.get(projectId);
    if (!project) financeStateCorrupt();
    const item = bucketDto(
      bucket,
      project,
      enrichments.get(projectId),
      observedAt
    );
    summary.projectCount += 1;
    for (const key of [
      "approvedContractTotalPaise",
      "approvedGstPaise",
      "approvedSubtotalPaise",
      "targetProfitPaise",
      "costBudgetPaise",
      "procurementCostPaise",
      "employeePaymentPaise",
      "otherExpensePaise",
      "directSpendPaise",
      "overheadPaise",
      "recordedCostPaise",
      "remainingBudgetPaise",
      "currentProfitPaise"
    ] as const) {
      summary[key] = safePortfolioAdd(summary[key], item[key], key, true);
    }
    if (item.overBudget) summary.overBudgetProjectCount += 1;
    if (item.deadlineStatus === "overdue") {
      summary.overdueProjectCount += 1;
    }
    if (item.deadlineStatus === "completed_late") {
      summary.lateCompletedProjectCount += 1;
    }
    summary.overdueTaskCount = safePortfolioAdd(
      summary.overdueTaskCount,
      item.overdueTaskCount,
      "overdueTaskCount"
    );
  }
  summary.currentMarginBps = portfolioMarginBps(
    summary.currentProfitPaise,
    summary.approvedSubtotalPaise
  );
  return summary;
}

function emptyPortfolioSummary(): ProjectFinancePortfolioSummary {
  return {
    projectCount: 0,
    approvedContractTotalPaise: 0,
    approvedGstPaise: 0,
    approvedSubtotalPaise: 0,
    targetProfitPaise: 0,
    costBudgetPaise: 0,
    procurementCostPaise: 0,
    employeePaymentPaise: 0,
    otherExpensePaise: 0,
    directSpendPaise: 0,
    overheadPaise: 0,
    recordedCostPaise: 0,
    remainingBudgetPaise: 0,
    currentProfitPaise: 0,
    currentMarginBps: null,
    overBudgetProjectCount: 0,
    overdueProjectCount: 0,
    lateCompletedProjectCount: 0,
    overdueTaskCount: 0
  };
}

function emptyEnrichment(): FinanceEnrichment {
  return {
    procurementCostPaise: 0,
    employeePaymentPaise: 0,
    otherExpensePaise: 0,
    overdueTaskCount: 0
  };
}

function requireCompletePortfolio(
  buckets: readonly Row[],
  projectsById: ReadonlyMap<string, Row>
): void {
  if (buckets.some((bucket) => !projectsById.has(String(bucket.projectId)))) {
    financeStateCorrupt();
  }
}

function safeStoredAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isSafeInteger(amount) || amount < 0) financeStateCorrupt();
  return amount;
}

function safePortfolioAdd(
  left: number,
  right: number,
  label: string,
  allowSigned = false
): number {
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    (!allowSigned && (left < 0 || right < 0))
  ) financeStateCorrupt();
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    throw new ApiError(
      500,
      "FINANCE_PORTFOLIO_TOO_LARGE",
      `The ${label} portfolio total exceeds the supported reporting range.`
    );
  }
  return sum;
}

function portfolioMarginBps(profitPaise: number, revenuePaise: number): number | null {
  if (revenuePaise === 0) return null;
  const negative = profitPaise < 0;
  const rounded = (
    BigInt(Math.abs(profitPaise)) * 10_000n + BigInt(Math.floor(revenuePaise / 2))
  ) / BigInt(revenuePaise);
  const value = Number(negative ? -rounded : rounded);
  if (!Number.isSafeInteger(value)) financeStateCorrupt();
  return value;
}

function entryDto(entry: Row): FinanceLedgerEntryDto {
  return {
    id: String(entry._id),
    bucketId: String(entry.bucketId),
    projectId: String(entry.projectId),
    type: entry.type,
    expenseClass: entry.expenseClass == null
      ? null
      : entry.expenseClass,
    category: String(entry.category),
    amountPaise: Number(entry.amountPaise),
    incurredAt: new Date(entry.incurredAt).toISOString(),
    description: String(entry.description),
    vendor: nullableString(entry.vendor),
    reference: nullableString(entry.reference),
    sourceSectionId: nullableString(entry.sourceSectionId),
    idempotencyKey: String(entry.idempotencyKey),
    status: entry.status,
    version: Number(entry.version),
    createdById: String(entry.createdById),
    voidedAt: nullableIso(entry.voidedAt),
    voidedById: nullableString(entry.voidedById),
    voidReason: nullableString(entry.voidReason),
    createdAt: new Date(entry.createdAt).toISOString(),
    updatedAt: new Date(entry.updatedAt).toISOString()
  };
}

function requireMatchingBaseline(bucket: Row, expected: Row): void {
  const keys = [
    "projectId",
    "estimateId",
    "estimateVersion",
    "estimateReviewRoundId",
    "currency",
    "approvedSubtotalPaise",
    "approvedGstPaise",
    "approvedContractTotalPaise",
    "targetMarginBps",
    "targetProfitPaise",
    "costBudgetPaise"
  ] as const;
  if (keys.some((key) => String(bucket[key] ?? "") !== String(expected[key] ?? ""))) {
    throw new ApiError(
      409,
      "FINANCE_BUCKET_SOURCE_CONFLICT",
      "A different approved Estimate is already linked to this project budget."
    );
  }
}

function requireMatchingReplay(entry: Row, expected: NormalizedEntryInput): void {
  if (
    entry.type !== expected.type ||
    nullableString(entry.expenseClass) !== expected.expenseClass ||
    String(entry.category) !== expected.category ||
    Number(entry.amountPaise) !== expected.amountPaise ||
    new Date(entry.incurredAt).getTime() !== expected.incurredAt.getTime() ||
    String(entry.description) !== expected.description ||
    nullableString(entry.vendor) !== expected.vendor ||
    nullableString(entry.reference) !== expected.reference ||
    nullableString(entry.sourceSectionId) !== expected.sourceSectionId
  ) {
    throw duplicateConflict();
  }
}

function validateLifecycleInput(input: EnsurePendingFinanceBucketInput): void {
  if (
    !input.projectId.trim() ||
    !input.estimateId.trim() ||
    !input.createdById.trim() ||
    !Number.isSafeInteger(input.estimateVersion) ||
    input.estimateVersion < 1 ||
    !isValidDate(input.occurredAt)
  ) {
    throw new TypeError("Approved project finance input is invalid.");
  }
}

function validatePagination(input: ProjectFinancePagination): void {
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100 ||
    !Number.isSafeInteger(input.offset) ||
    input.offset < 0
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.");
  }
}

function requiredText(
  value: unknown,
  field: string,
  maximum: number,
  minimum = 1
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < minimum || normalized.length > maximum) {
    throw validationError(field, `Enter between ${minimum} and ${maximum} characters.`);
  }
  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  maximum: number
): string | null {
  if (value == null || value === "") return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > maximum) {
    throw validationError(field, `Enter no more than ${maximum} characters.`);
  }
  return normalized;
}

function validationError(field: string, message: string): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {
    [field]: message
  });
}

function duplicateConflict(): ApiError {
  return new ApiError(
    409,
    "FINANCE_IDEMPOTENCY_CONFLICT",
    "This finance entry key was already used for different entry details."
  );
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error as { code?: unknown }).code === 11_000;
}

function nullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function nullableIso(value: unknown): string | null {
  return value == null ? null : new Date(value as never).toISOString();
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
}

function forbidden(): never {
  throw new ApiError(403, "FORBIDDEN", "You are not authorized to perform this action.");
}

function financeStateCorrupt(): never {
  throw new Error("Project finance storage is inconsistent.");
}
