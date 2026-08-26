import "dotenv/config";

import { pathToFileURL } from "node:url";

import mongoose, { type ClientSession } from "mongoose";

import {
  PROJECT_FINANCE_CURRENCY,
  projectFinanceBaseline
} from "../domain/project-finance.js";
import { loadEnvironment } from "../config/env.js";
import { ApiError } from "../middleware/errors.js";
import { DesignPlanReviewRoundModel } from "../models/DesignPlanReviewRound.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectFinanceBucketModel } from "../models/ProjectFinanceBucket.js";
import {
  ensurePendingProjectFinanceBucket,
  openProjectFinanceBucket,
  type EnsurePendingFinanceBucketInput
} from "../services/project-finance.service.js";

type Row = Record<string, any>;

const conflictDetailLimit = 1_000;
const eligibleEstimateFilter = {
  status: "client_approved"
} as const;

export const PROJECT_FINANCE_BACKFILL_SKIP_REASONS = [
  "concurrent_change",
  "duplicate_project_estimates",
  "missing_project_link",
  "estimate_project_link_conflict",
  "missing_project",
  "invalid_design_approval",
  "missing_estimate_approval_evidence",
  "ambiguous_estimate_approval_evidence",
  "estimate_review_version_conflict",
  "estimate_review_project_conflict",
  "invalid_estimate_money",
  "existing_bucket_conflict"
] as const;

export type ProjectFinanceBackfillSkipReason =
  (typeof PROJECT_FINANCE_BACKFILL_SKIP_REASONS)[number];

export interface ProjectFinanceBackfillConflict {
  estimateId: string;
  projectId: string | null;
  reason: ProjectFinanceBackfillSkipReason;
}

export interface ProjectFinanceBackfillReport {
  estimatesScanned: number;
  projectsSourceResolved: number;
  immutableSnapshotSources: number;
  legacyFallbackSources: number;
  createdPending: number;
  alreadyPending: number;
  createdAndOpened: number;
  pendingOpened: number;
  alreadyOpen: number;
  skippedCount: number;
  skipCounts: Record<ProjectFinanceBackfillSkipReason, number>;
  conflicts: ProjectFinanceBackfillConflict[];
  conflictsTruncated: boolean;
  dryRun: boolean;
}

type EstimateApprovalSource = {
  kind: "immutable_snapshot" | "legacy_fallback";
  input: Omit<EnsurePendingFinanceBucketInput, "projectId">;
};

type DesignApprovalSource = {
  designPlanVersion: number;
  openedById: string;
  occurredAt: Date;
};

type BackfillAction =
  | "created_pending"
  | "already_pending"
  | "created_and_opened"
  | "pending_opened"
  | "already_open";

type BackfillOutcome =
  | {
      kind: "action";
      action: BackfillAction;
      estimateSource: EstimateApprovalSource["kind"];
    }
  | {
      kind: "skip";
      estimateId: string;
      projectId: string | null;
      reason: ProjectFinanceBackfillSkipReason;
      estimateSource?: EstimateApprovalSource["kind"];
    };

export interface ProjectFinanceBackfillOptions {
  dryRun?: boolean;
  batchSize?: number;
}

function emptyReport(dryRun: boolean): ProjectFinanceBackfillReport {
  return {
    estimatesScanned: 0,
    projectsSourceResolved: 0,
    immutableSnapshotSources: 0,
    legacyFallbackSources: 0,
    createdPending: 0,
    alreadyPending: 0,
    createdAndOpened: 0,
    pendingOpened: 0,
    alreadyOpen: 0,
    skippedCount: 0,
    skipCounts: Object.fromEntries(
      PROJECT_FINANCE_BACKFILL_SKIP_REASONS.map((reason) => [reason, 0])
    ) as Record<ProjectFinanceBackfillSkipReason, number>,
    conflicts: [],
    conflictsTruncated: false,
    dryRun
  };
}

/**
 * Backfills every project with a Client-approved Estimate. Project linkage
 * follows the Projects-list contract: a direct Estimate link or its Lead's
 * project link. Design-pending projects receive a pending bucket so Super
 * Admin portfolio totals are complete; only projects with verifiable Design
 * approval are opened.
 * Action counts describe writes that were performed, or writes that would be
 * performed when `dryRun` is true.
 */
export async function backfillApprovedProjectFinanceBuckets(
  options: ProjectFinanceBackfillOptions = {}
): Promise<ProjectFinanceBackfillReport> {
  const dryRun = options.dryRun === true;
  const batchSize = options.batchSize ?? 250;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new RangeError("batchSize must be an integer from 1 through 1000");
  }

  /* The two unique source indexes are the concurrency boundary for this migration. */
  if (!dryRun) await ProjectFinanceBucketModel.createIndexes();

  const report = emptyReport(dryRun);
  const cursor = EstimateModel.find(eligibleEstimateFilter)
    .sort({ _id: 1 })
    .lean()
    .cursor({ batchSize }) as unknown as AsyncIterable<Row>;

  for await (const candidate of cursor) {
    report.estimatesScanned += 1;
    const estimateId = stringId(candidate._id);
    let outcome: BackfillOutcome;
    if (dryRun) {
      outcome = await inspectAndMaybeBackfill(estimateId, true);
    } else {
      try {
        outcome = await mongoose.connection.transaction((session) =>
          inspectAndMaybeBackfill(estimateId, false, session)
        );
      } catch (error) {
        if (!isExpectedWriteConflict(error)) throw error;
        outcome = {
          kind: "skip",
          estimateId,
          projectId: nullableString(candidate.projectId),
          reason: error instanceof ApiError &&
            [
              "FINANCE_BUCKET_SOURCE_CONFLICT",
              "FINANCE_BUCKET_STATE_CONFLICT"
            ].includes(error.code)
            ? "existing_bucket_conflict"
            : "concurrent_change"
        };
      }
    }
    applyOutcome(report, outcome);
  }
  return report;
}

async function inspectAndMaybeBackfill(
  estimateId: string,
  dryRun: boolean,
  session?: ClientSession
): Promise<BackfillOutcome> {
  const estimateQuery = EstimateModel.findOne({
    _id: estimateId,
    ...eligibleEstimateFilter
  });
  if (session) estimateQuery.session(session);
  const estimate = await estimateQuery.lean() as Row | null;
  if (!estimate) return skip(estimateId, null, "concurrent_change");

  const projectLink = await resolveEstimateProjectLink(estimate, session);
  if ("reason" in projectLink) {
    return skip(estimateId, projectLink.projectId, projectLink.reason);
  }
  const { projectId } = projectLink;

  const linkedLeadQuery = LeadModel.find({ projectId })
    .select({ _id: 1 })
    .lean();
  if (session) linkedLeadQuery.session(session);
  const linkedLeadIds = (await linkedLeadQuery.exec()).map((lead) =>
    stringId(lead._id)
  );
  const duplicateQuery = EstimateModel.countDocuments({
    ...eligibleEstimateFilter,
    $or: [
      { projectId },
      ...(linkedLeadIds.length > 0 ? [{ leadId: { $in: linkedLeadIds } }] : [])
    ]
  });
  if (session) duplicateQuery.session(session);
  if (await duplicateQuery.exec() !== 1) {
    return skip(estimateId, projectId, "duplicate_project_estimates");
  }

  const projectQuery = ProjectModel.exists({ _id: projectId });
  if (session) projectQuery.session(session);
  if (!await projectQuery.exec()) {
    return skip(estimateId, projectId, "missing_project");
  }

  const designIsApproved = estimate.designPlanStatus === "approved";
  const designApproval = designIsApproved
    ? await resolveDesignApproval(estimate, projectId, session)
    : null;
  if (designIsApproved && !designApproval) {
    return skip(estimateId, projectId, "invalid_design_approval");
  }

  const estimateApproval = await resolveEstimateApproval(estimate, projectId, session);
  if ("reason" in estimateApproval) {
    return skip(estimateId, projectId, estimateApproval.reason);
  }

  const existingQuery = ProjectFinanceBucketModel.findOne({ projectId });
  if (session) existingQuery.session(session);
  const existing = await existingQuery.lean() as Row | null;
  const expectedBaseline = expectedStoredBaseline(projectId, estimateApproval);
  if (existing && !storedBaselineMatches(existing, expectedBaseline)) {
    return skip(
      estimateId,
      projectId,
      "existing_bucket_conflict",
      estimateApproval.kind
    );
  }

  let action: BackfillAction;
  if (!existing) {
    action = designApproval ? "created_and_opened" : "created_pending";
  } else if (!designApproval &&
    existing.status === "pending_design" &&
    Number(existing.designPlanVersion) === 0
  ) {
    action = "already_pending";
  } else if (designApproval &&
    existing.status === "open" &&
    Number(existing.designPlanVersion) === designApproval.designPlanVersion
  ) {
    action = "already_open";
  } else if (designApproval &&
    existing.status === "pending_design" &&
    Number(existing.designPlanVersion) === 0
  ) {
    action = "pending_opened";
  } else {
    return skip(
      estimateId,
      projectId,
      "existing_bucket_conflict",
      estimateApproval.kind
    );
  }

  if (!dryRun) {
    if (!session) throw new TypeError("A transaction is required for finance backfill writes.");
    await ensurePendingProjectFinanceBucket({
      projectId,
      ...estimateApproval.input
    }, session);
    if (designApproval) {
      await openProjectFinanceBucket({
        projectId,
        designPlanVersion: designApproval.designPlanVersion,
        openedById: designApproval.openedById,
        occurredAt: designApproval.occurredAt
      }, session);
    }
  }

  return { kind: "action", action, estimateSource: estimateApproval.kind };
}

async function resolveEstimateProjectLink(
  estimate: Row,
  session?: ClientSession
): Promise<
  | { projectId: string }
  | {
      projectId: string | null;
      reason: "missing_project_link" | "estimate_project_link_conflict";
    }
> {
  const estimateProjectId = nullableString(estimate.projectId);
  const leadId = nonEmptyString(estimate.leadId);
  let leadProjectId: string | null = null;
  if (leadId) {
    const leadQuery = LeadModel.findById(leadId)
      .select({ projectId: 1 })
      .lean();
    if (session) leadQuery.session(session);
    const lead = await leadQuery.exec() as Row | null;
    leadProjectId = lead ? nullableString(lead.projectId) : null;
  }

  if (
    estimateProjectId !== null &&
    leadProjectId !== null &&
    estimateProjectId !== leadProjectId
  ) {
    return {
      projectId: estimateProjectId,
      reason: "estimate_project_link_conflict"
    };
  }
  const projectId = estimateProjectId ?? leadProjectId;
  return projectId === null
    ? { projectId: null, reason: "missing_project_link" }
    : { projectId };
}

async function resolveDesignApproval(
  estimate: Row,
  projectId: string,
  session?: ClientSession
): Promise<DesignApprovalSource | null> {
  const designPlanVersion = positiveSafeInteger(estimate.designPlanVersion);
  if (!designPlanVersion) return null;

  const query = DesignPlanReviewRoundModel.find({
    estimateId: stringId(estimate._id),
    designPlanVersion,
    status: "approved",
    decision: "approve"
  }).sort({ _id: 1 });
  if (session) query.session(session);
  const rounds = await query.lean() as Row[];
  if (rounds.length > 0) {
    if (rounds.length !== 1) return null;
    const [round] = rounds;
    if (
      !round ||
      stringId(round.projectId) !== projectId ||
      !["client_portal", "admin_proof"].includes(String(round.decisionSource))
    ) return null;
    const openedById = nonEmptyString(round.decidedById);
    const occurredAt = validDate(round.decidedAt);
    return openedById && occurredAt
      ? { designPlanVersion, openedById, occurredAt }
      : null;
  }

  const openedById = nonEmptyString(estimate.designPlanApprovedById);
  const occurredAt = validDate(estimate.designPlanApprovedAt);
  if (
    !openedById ||
    !occurredAt ||
    !["client_portal", "admin_proof"].includes(String(estimate.designPlanApprovalSource))
  ) return null;
  return { designPlanVersion, openedById, occurredAt };
}

async function resolveEstimateApproval(
  estimate: Row,
  projectId: string,
  session?: ClientSession
): Promise<
  | EstimateApprovalSource
  | { reason: ProjectFinanceBackfillSkipReason }
> {
  const estimateId = stringId(estimate._id);
  const approvedVersion = approvalSnapshotVersion(estimate.version);
  if (!approvedVersion) return { reason: "estimate_review_version_conflict" };

  const query = EstimateClientReviewRoundModel.find({
    estimateId,
    status: "approved",
    decision: "approve"
  }).sort({ sendGeneration: 1, _id: 1 });
  if (session) query.session(session);
  const rounds = await query.lean() as Row[];
  if (rounds.length > 0) {
    const matching = rounds.filter(
      (round) => Number(round.estimateVersion) === approvedVersion
    );
    if (matching.length !== 1) {
      return { reason: "estimate_review_version_conflict" };
    }
    const [round] = matching;
    if (!round) return { reason: "estimate_review_version_conflict" };
    const reviewProjectId = nullableString(round.projectId);
    if (reviewProjectId !== null && reviewProjectId !== projectId) {
      return { reason: "estimate_review_project_conflict" };
    }
    const createdById = nonEmptyString(round.decidedById);
    const occurredAt = validDate(round.decidedAt);
    if (
      !createdById ||
      !occurredAt ||
      !["client_portal", "admin_proof"].includes(String(round.decisionSource))
    ) return { reason: "ambiguous_estimate_approval_evidence" };
    const money = approvedMoney(round.estimateSnapshot);
    if (!money) return { reason: "invalid_estimate_money" };
    return {
      kind: "immutable_snapshot",
      input: {
        estimateId,
        estimateVersion: approvedVersion,
        estimateReviewRoundId: stringId(round._id),
        ...money,
        createdById,
        occurredAt
      }
    };
  }

  const reviews = Array.isArray(estimate.reviews)
    ? estimate.reviews.filter((review: unknown): review is Row =>
        isRow(review) &&
        review.action === "client_approved" &&
        nonEmptyString(review.actorId) !== null &&
        validDate(review.occurredAt) !== null
      )
    : [];
  if (reviews.length === 0) {
    return { reason: "missing_estimate_approval_evidence" };
  }
  if (reviews.length !== 1) {
    return { reason: "ambiguous_estimate_approval_evidence" };
  }
  const [review] = reviews;
  if (!review) return { reason: "missing_estimate_approval_evidence" };
  const money = approvedMoney(estimate);
  if (!money) return { reason: "invalid_estimate_money" };
  return {
    kind: "legacy_fallback",
    input: {
      estimateId,
      estimateVersion: approvedVersion,
      estimateReviewRoundId: null,
      ...money,
      createdById: nonEmptyString(review.actorId)!,
      occurredAt: validDate(review.occurredAt)!
    }
  };
}

function approvedMoney(value: unknown): Pick<
  EnsurePendingFinanceBucketInput,
  "approvedSubtotalRupees" | "approvedGstRupees" | "approvedContractTotalRupees"
> | null {
  if (!isRow(value)) return null;
  const approvedSubtotalRupees = Number(value.subtotal);
  const approvedGstRupees = Number(value.gst);
  const approvedContractTotalRupees = Number(value.total);
  try {
    projectFinanceBaseline({
      subtotalRupees: approvedSubtotalRupees,
      gstRupees: approvedGstRupees,
      totalRupees: approvedContractTotalRupees
    });
  } catch {
    return null;
  }
  return {
    approvedSubtotalRupees,
    approvedGstRupees,
    approvedContractTotalRupees
  };
}

function expectedStoredBaseline(
  projectId: string,
  approval: EstimateApprovalSource
): Row {
  return {
    projectId,
    estimateId: approval.input.estimateId,
    estimateVersion: approval.input.estimateVersion,
    estimateReviewRoundId: approval.input.estimateReviewRoundId,
    currency: PROJECT_FINANCE_CURRENCY,
    ...projectFinanceBaseline({
      subtotalRupees: approval.input.approvedSubtotalRupees,
      gstRupees: approval.input.approvedGstRupees,
      totalRupees: approval.input.approvedContractTotalRupees
    })
  };
}

function storedBaselineMatches(bucket: Row, expected: Row): boolean {
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
  return keys.every(
    (key) => String(bucket[key] ?? "") === String(expected[key] ?? "")
  );
}

function applyOutcome(report: ProjectFinanceBackfillReport, outcome: BackfillOutcome): void {
  if (outcome.estimateSource) {
    report.projectsSourceResolved += 1;
    if (outcome.estimateSource === "immutable_snapshot") {
      report.immutableSnapshotSources += 1;
    } else {
      report.legacyFallbackSources += 1;
    }
  }
  if (outcome.kind === "action") {
    if (outcome.action === "created_pending") report.createdPending += 1;
    else if (outcome.action === "already_pending") report.alreadyPending += 1;
    else if (outcome.action === "created_and_opened") report.createdAndOpened += 1;
    else if (outcome.action === "pending_opened") report.pendingOpened += 1;
    else report.alreadyOpen += 1;
    return;
  }
  report.skippedCount += 1;
  report.skipCounts[outcome.reason] += 1;
  if (report.conflicts.length < conflictDetailLimit) {
    report.conflicts.push({
      estimateId: outcome.estimateId,
      projectId: outcome.projectId,
      reason: outcome.reason
    });
  } else {
    report.conflictsTruncated = true;
  }
}

function skip(
  estimateId: string,
  projectId: string | null,
  reason: ProjectFinanceBackfillSkipReason,
  estimateSource?: EstimateApprovalSource["kind"]
): BackfillOutcome {
  return {
    kind: "skip",
    estimateId,
    projectId,
    reason,
    ...(estimateSource ? { estimateSource } : {})
  };
}

function approvalSnapshotVersion(value: unknown): number | null {
  const current = positiveSafeInteger(value);
  if (!current) return null;
  return current > 1 ? current - 1 : 1;
}

function positiveSafeInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableString(value: unknown): string | null {
  return value == null ? null : nonEmptyString(value);
}

function stringId(value: unknown): string {
  return String(value ?? "").trim();
}

function validDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function isRow(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isExpectedWriteConflict(error: unknown): boolean {
  if (error instanceof ApiError) {
    return [
      "FINANCE_BUCKET_SOURCE_CONFLICT",
      "FINANCE_BUCKET_STATE_CONFLICT"
    ].includes(error.code);
  }
  if (!isRow(error)) return false;
  /*
   * Never turn an exhausted transaction/unknown-commit error into a reported
   * skip: the operator must see that failure and rerun the idempotent command.
   */
  return error.code === 11000;
}

export interface ProjectFinanceBackfillCommandDependencies {
  argv?: string[];
  loadEnvironment?: () => { MONGODB_URI: string };
  connect?: (uri: string, options: { autoIndex: false }) => Promise<unknown>;
  disconnect?: () => Promise<unknown>;
  writeOutput?: (output: string) => void;
}

export async function runProjectFinanceBackfillMigrationCommand(
  dependencies: ProjectFinanceBackfillCommandDependencies = {}
): Promise<void> {
  const argv = dependencies.argv ?? process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const batchSizeArgument = argv.find((argument) => argument.startsWith("--batch-size="));
  const batchSize = batchSizeArgument
    ? Number(batchSizeArgument.slice("--batch-size=".length))
    : undefined;
  const env = (dependencies.loadEnvironment ?? loadEnvironment)();
  const connect = dependencies.connect ?? (
    (uri: string, options: { autoIndex: false }) => mongoose.connect(uri, options)
  );
  const disconnect = dependencies.disconnect ?? (() => mongoose.disconnect());
  const writeOutput = dependencies.writeOutput ?? (
    (output: string) => process.stdout.write(output)
  );
  try {
    await connect(env.MONGODB_URI, { autoIndex: false });
    const report = await backfillApprovedProjectFinanceBuckets({
      dryRun,
      ...(batchSize === undefined ? {} : { batchSize })
    });
    writeOutput(`${JSON.stringify(report)}\n`);
  } finally {
    await disconnect();
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  runProjectFinanceBackfillMigrationCommand().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
