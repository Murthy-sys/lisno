import mongoose from "mongoose";

import {
  ESTIMATE_DELIVERY_FAILURE_CODE,
  sha256Hex,
  type EstimateClientReviewSnapshot,
  type EstimateClientReviewSummary,
  type EstimateClientReviewStatus,
  type EstimateDeliveryStatus
} from "../domain/estimate-client-review.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { EstimateClientReviewStorage } from "./estimate-client-review-storage.js";
import type { EstimateClientReviewService } from "./estimate-client-review.service.js";
import type { EstimateMailer } from "./estimate-mailer.js";

const DELIVERY_ATTEMPT_DEADLINE_MS = 30_000;
const PDF_STORAGE_READ_FAILED = "PDF_STORAGE_READ_FAILED";
const PDF_BYTE_SIZE_MISMATCH = "PDF_BYTE_SIZE_MISMATCH";
const PDF_SHA256_MISMATCH = "PDF_SHA256_MISMATCH";
const ESTIMATE_MAILER_FAILED = "ESTIMATE_MAILER_FAILED";

interface DeliveryRoundRow {
  _id: string;
  estimateId: string;
  estimateVersion: number;
  sendGeneration: number;
  recipientEmail: string;
  estimateSnapshot: EstimateClientReviewSnapshot;
  pdfFilename: string;
  pdfMimeType: "application/pdf";
  pdfByteSize: number;
  pdfSha256: string;
  pdfStorageReference?: string;
  deliveryStatus: EstimateDeliveryStatus;
  deliveryAttemptGeneration: number;
  deliveryAttemptCount: number;
  deliveryAttemptedAt: Date | null;
  deliveryLeaseExpiresAt: Date | null;
  deliveredAt: Date | string | null;
  deliveryFailureCode: string | null;
  assignedAdminId: string;
  status: EstimateClientReviewStatus;
  version: number;
}

interface AttemptLease extends DeliveryRoundRow {
  pdfStorageReference?: never;
}

type AttemptOutcome =
  | { status: "sent" }
  | { status: "failed"; failureCode: string };

export interface EstimateDeliveryService {
  deliverInitial(roundId: string): Promise<EstimateClientReviewSummary>;
  retry(
    actor: PublicUser,
    input: { estimateId: string; roundId: string; version: number }
  ): Promise<EstimateClientReviewSummary>;
}

export function createEstimateDeliveryService(input: {
  reviews: EstimateClientReviewService;
  storage: EstimateClientReviewStorage;
  mailer: EstimateMailer;
  portalUrl: string;
  audit: AuditService;
  now?: () => Date;
}): EstimateDeliveryService {
  const now = input.now ?? (() => new Date());

  async function deliverInitial(
    roundId: string
  ): Promise<EstimateClientReviewSummary> {
    try {
      const current = await loadRound(roundId);
      if (!current) deliveryStateUnavailable();

      if (input.mailer.deliveryKind === "disabled") {
        const disabled = await EstimateClientReviewRoundModel.findOneAndUpdate(
          initialRoundFilter(current),
          {
            $set: {
              deliveryStatus: "disabled",
              deliveryLeaseExpiresAt: null,
              deliveredAt: null,
              deliveryFailureCode: null
            },
            $inc: { version: 1 }
          },
          { new: true }
        ).lean();
        return disabled
          ? mapRoundSummary(disabled as unknown as DeliveryRoundRow)
          : await loadRequiredSummary(roundId);
      }

      const attemptedAt = now();
      const leaseExpiresAt = new Date(
        attemptedAt.getTime() + DELIVERY_ATTEMPT_DEADLINE_MS
      );
      const leased = await EstimateClientReviewRoundModel.findOneAndUpdate(
        initialRoundFilter(current),
        {
          $set: {
            deliveryAttemptedAt: attemptedAt,
            deliveryLeaseExpiresAt: leaseExpiresAt,
            deliveredAt: null,
            deliveryFailureCode: null
          },
          $inc: { version: 1, deliveryAttemptCount: 1 }
        },
        { new: true }
      ).lean();
      if (!leased) return loadRequiredSummary(roundId);

      return await deliverLease(
        leased as unknown as AttemptLease,
        current.assignedAdminId
      );
    } catch {
      return loadRequiredSummaryOrFail(roundId);
    }
  }

  async function retry(
    actor: PublicUser,
    retryInput: { estimateId: string; roundId: string; version: number }
  ): Promise<EstimateClientReviewSummary> {
    await input.reviews.requireRetryScope(
      actor,
      retryInput.estimateId,
      retryInput.roundId
    );
    if (input.mailer.deliveryKind === "disabled") retryConflict();

    const current = await loadCurrentRound(retryInput.estimateId);
    const attemptedAt = now();
    if (!isRetryCandidate(current, retryInput, attemptedAt)) {
      retryConflict();
    }

    const leaseExpiresAt = new Date(
      attemptedAt.getTime() + DELIVERY_ATTEMPT_DEADLINE_MS
    );
    const leased = await inMongoTransaction(async (session) => {
      const transactionalCurrent = await loadCurrentRound(
        retryInput.estimateId,
        session
      );
      if (!isRetryCandidate(transactionalCurrent, retryInput, attemptedAt)) {
        retryConflict();
      }

      const acquired = await EstimateClientReviewRoundModel.findOneAndUpdate(
        {
          _id: retryInput.roundId,
          estimateId: retryInput.estimateId,
          sendGeneration: transactionalCurrent.sendGeneration,
          version: retryInput.version,
          status: "pending",
          deliveryAttemptGeneration:
            transactionalCurrent.deliveryAttemptGeneration,
          $or: [
            { deliveryStatus: { $in: ["failed", "disabled"] } },
            {
              deliveryStatus: "queued",
              $or: [
                {
                  deliveryAttemptCount: 0,
                  deliveryAttemptedAt: null,
                  deliveryLeaseExpiresAt: null
                },
                { deliveryLeaseExpiresAt: { $lte: attemptedAt } }
              ]
            }
          ]
        },
        {
          $set: {
            deliveryStatus: "queued",
            deliveryAttemptedAt: attemptedAt,
            deliveryLeaseExpiresAt: leaseExpiresAt,
            deliveredAt: null,
            deliveryFailureCode: null
          },
          $inc: {
            version: 1,
            deliveryAttemptGeneration: 1,
            deliveryAttemptCount: 1
          }
        },
        { new: true, session }
      ).lean();
      if (!acquired) retryConflict();

      const lease = acquired as unknown as AttemptLease;
      await input.audit.appendInMongoTransaction({
        actorId: actor.id,
        action: "estimate_email_retry_requested",
        entityType: "estimate_client_review_round",
        entityId: retryInput.roundId,
        occurredAt: attemptedAt.toISOString(),
        oldValues: {
          deliveryStatus: transactionalCurrent.deliveryStatus,
          deliveryAttemptGeneration:
            transactionalCurrent.deliveryAttemptGeneration,
          deliveryAttemptCount: transactionalCurrent.deliveryAttemptCount
        },
        newValues: {
          deliveryStatus: "queued",
          deliveryAttemptGeneration: lease.deliveryAttemptGeneration,
          deliveryAttemptCount: lease.deliveryAttemptCount,
          roundVersion: lease.version
        }
      }, session);
      return lease;
    });

    return deliverLease(leased, actor.id, async () => {
      try {
        await input.reviews.requireRetryScope(
          actor,
          retryInput.estimateId,
          retryInput.roundId
        );
      } catch {
        retryConflict();
      }
    });
  }

  async function deliverLease(
    lease: AttemptLease,
    actorId: string,
    reauthorizeBeforePayload?: () => Promise<void>
  ): Promise<EstimateClientReviewSummary> {
    await reauthorizeBeforePayload?.();
    const payload = await loadAttemptPayload(lease);
    if (!payload) return loadRequiredSummary(lease._id);

    const outcome = await attemptDelivery(payload);
    const completedAt = now();
    await inMongoTransaction(async (session) => {
      const completion = await EstimateClientReviewRoundModel.updateOne(
        {
          _id: lease._id,
          deliveryStatus: "queued",
          deliveryAttemptGeneration: lease.deliveryAttemptGeneration
        },
        completionUpdate(outcome, completedAt),
        { session }
      );
      if (completion.matchedCount !== 1) return;

      await input.audit.appendInMongoTransaction({
        actorId,
        action: outcome.status === "sent"
          ? "estimate_email_delivery_sent"
          : "estimate_email_delivery_failed",
        entityType: "estimate_client_review_round",
        entityId: lease._id,
        occurredAt: completedAt.toISOString(),
        oldValues: {
          deliveryStatus: "queued",
          deliveryAttemptGeneration: lease.deliveryAttemptGeneration,
          deliveryAttemptCount: lease.deliveryAttemptCount
        },
        newValues: {
          deliveryStatus: outcome.status,
          deliveryAttemptGeneration: lease.deliveryAttemptGeneration,
          deliveryAttemptCount: lease.deliveryAttemptCount,
          ...(outcome.status === "failed"
            ? { failureCode: outcome.failureCode }
            : {})
        }
      }, session);
    });
    return loadRequiredSummary(lease._id);
  }

  async function loadAttemptPayload(
    lease: AttemptLease
  ): Promise<DeliveryRoundRow | null> {
    const payload = await EstimateClientReviewRoundModel.findOne({
      _id: lease._id,
      deliveryStatus: "queued",
      deliveryAttemptGeneration: lease.deliveryAttemptGeneration
    })
      .select("+pdfStorageReference")
      .lean();
    return payload as unknown as DeliveryRoundRow | null;
  }

  async function attemptDelivery(
    payload: DeliveryRoundRow
  ): Promise<AttemptOutcome> {
    let bytes: Buffer;
    try {
      if (!payload.pdfStorageReference) throw new Error("Missing PDF reference.");
      bytes = await input.storage.read(payload.pdfStorageReference);
    } catch {
      return { status: "failed", failureCode: PDF_STORAGE_READ_FAILED };
    }
    if (bytes.byteLength !== payload.pdfByteSize) {
      return { status: "failed", failureCode: PDF_BYTE_SIZE_MISMATCH };
    }
    if (sha256Hex(bytes) !== payload.pdfSha256) {
      return { status: "failed", failureCode: PDF_SHA256_MISMATCH };
    }

    try {
      if (input.mailer.deliveryKind === "disabled") {
        return { status: "failed", failureCode: ESTIMATE_MAILER_FAILED };
      }
      const result = await input.mailer.send({
        to: payload.recipientEmail,
        clientName: payload.estimateSnapshot.clientName,
        projectName: payload.estimateSnapshot.projectName,
        estimateVersion: payload.estimateVersion,
        total: payload.estimateSnapshot.total,
        portalUrl: input.portalUrl,
        attachment: {
          filename: payload.pdfFilename,
          mimeType: payload.pdfMimeType,
          bytes
        }
      });
      if (result.kind === "sent") return { status: "sent" };
      return {
        status: "failed",
        failureCode: boundedFailureCode(result.failureCode)
      };
    } catch {
      return { status: "failed", failureCode: ESTIMATE_MAILER_FAILED };
    }
  }

  return { deliverInitial, retry };
}

function initialRoundFilter(round: DeliveryRoundRow) {
  return {
    _id: round._id,
    version: round.version,
    status: "pending" as const,
    deliveryStatus: "queued" as const,
    deliveryAttemptGeneration: 1,
    deliveryAttemptCount: 0
  };
}

function completionUpdate(outcome: AttemptOutcome, completedAt: Date) {
  return outcome.status === "sent"
    ? {
        $set: {
          deliveryStatus: "sent",
          deliveryLeaseExpiresAt: null,
          deliveredAt: completedAt,
          deliveryFailureCode: null
        },
        $inc: { version: 1 }
      }
    : {
        $set: {
          deliveryStatus: "failed",
          deliveryLeaseExpiresAt: null,
          deliveredAt: null,
          deliveryFailureCode: outcome.failureCode
        },
        $inc: { version: 1 }
      };
}

function isRetryable(round: DeliveryRoundRow, attemptedAt: Date): boolean {
  if (round.deliveryStatus === "failed" || round.deliveryStatus === "disabled") {
    return true;
  }
  if (round.deliveryStatus !== "queued") return false;
  const neverLeased = round.deliveryAttemptCount === 0 &&
    round.deliveryAttemptedAt === null &&
    round.deliveryLeaseExpiresAt === null;
  const leaseExpired = round.deliveryLeaseExpiresAt instanceof Date &&
    round.deliveryLeaseExpiresAt.getTime() <= attemptedAt.getTime();
  return neverLeased || leaseExpired;
}

function isRetryCandidate(
  round: DeliveryRoundRow | null,
  input: { estimateId: string; roundId: string; version: number },
  attemptedAt: Date
): round is DeliveryRoundRow {
  return Boolean(
    round &&
    String(round._id) === input.roundId &&
    round.estimateId === input.estimateId &&
    round.version === input.version &&
    round.status === "pending" &&
    isRetryable(round, attemptedAt)
  );
}

function boundedFailureCode(value: unknown): string {
  return typeof value === "string" && ESTIMATE_DELIVERY_FAILURE_CODE.test(value)
    ? value
    : ESTIMATE_MAILER_FAILED;
}

async function loadRound(roundId: string): Promise<DeliveryRoundRow | null> {
  const round = await EstimateClientReviewRoundModel.findOne({ _id: roundId }).lean();
  return round as unknown as DeliveryRoundRow | null;
}

async function loadCurrentRound(
  estimateId: string,
  session?: mongoose.ClientSession
): Promise<DeliveryRoundRow | null> {
  let query = EstimateClientReviewRoundModel.findOne({ estimateId })
    .sort({ sendGeneration: -1, _id: 1 });
  if (session) query = query.session(session);
  const round = await query.lean();
  return round as unknown as DeliveryRoundRow | null;
}

async function loadRequiredSummary(
  roundId: string
): Promise<EstimateClientReviewSummary> {
  const round = await loadRound(roundId);
  if (!round) deliveryStateUnavailable();
  return mapRoundSummary(round);
}

async function loadRequiredSummaryOrFail(
  roundId: string
): Promise<EstimateClientReviewSummary> {
  try {
    return await loadRequiredSummary(roundId);
  } catch {
    deliveryStateUnavailable();
  }
}

function mapRoundSummary(round: DeliveryRoundRow): EstimateClientReviewSummary {
  return {
    id: String(round._id),
    sendGeneration: Number(round.sendGeneration),
    estimateVersion: Number(round.estimateVersion),
    version: Number(round.version),
    deliveryStatus: round.deliveryStatus,
    deliveryAttemptCount: Number(round.deliveryAttemptCount),
    deliveredAt: round.deliveredAt instanceof Date
      ? round.deliveredAt.toISOString()
      : round.deliveredAt,
    status: round.status
  };
}

async function inMongoTransaction<T>(
  operation: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}

function retryConflict(): never {
  throw new ApiError(
    409,
    "ESTIMATE_EMAIL_RETRY_CONFLICT",
    "Email delivery state changed. Refresh and try again."
  );
}

function deliveryStateUnavailable(): never {
  throw new ApiError(
    500,
    "ESTIMATE_DELIVERY_STATE_UNAVAILABLE",
    "Estimate delivery state could not be confirmed safely."
  );
}
