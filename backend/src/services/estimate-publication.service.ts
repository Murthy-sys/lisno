import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import mongoose from "mongoose";

import {
  buildEstimateClientReviewDedupeKey,
  type EstimateClientReviewSnapshot,
  type EstimateClientReviewSummary
} from "../domain/estimate-client-review.js";
import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { EstimateModel } from "../models/Estimate.js";
import { LeadModel } from "../models/Lead.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import type { EstimateClientReviewStorage } from "./estimate-client-review-storage.js";
import type { EstimateClientReviewService } from "./estimate-client-review.service.js";
import type {
  EstimatePdfInput,
  EstimatePdfService
} from "./estimate-pdf.service.js";

const APPROVAL_THRESHOLD = 1_500_000;

export interface PublishEstimateToClientInput {
  estimateId: string;
  leadId: string;
  actorId: string;
  expectedEstimateVersion: number;
  expectedStatus: "draft" | "ready_for_client";
  submittedAt?: Date;
}

export interface PublishEstimateToClientResult {
  estimate: Record<string, unknown>;
  clientReview: EstimateClientReviewSummary;
}

export interface EstimatePublicationService {
  publishEstimateToClient(
    input: PublishEstimateToClientInput
  ): Promise<PublishEstimateToClientResult>;
}

interface PublicationEstimate {
  _id: string;
  leadId: string;
  ownerId: string;
  projectId: string | null;
  version: number;
  status: string;
  propertyType: string;
  lineItems: EstimatePdfInput["lineItems"];
  subtotal: number;
  gst: number;
  total: number;
  approvalRequired: boolean;
  reviews: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  [key: string]: unknown;
}

interface PublicationLead {
  _id: string;
  ownerId: string;
  projectId: string | null;
  clientName: string;
  clientEmail: string;
  projectName: string;
  location: string;
  [key: string]: unknown;
}

interface RoundRow {
  _id: string;
  estimateId: string;
  estimateVersion: number;
  sendGeneration: number;
  dedupeKey: string;
  recipientEmailNormalized: string;
  pdfStorageReference: string;
  deliveryStatus: EstimateClientReviewSummary["deliveryStatus"];
  deliveryAttemptCount: number;
  deliveredAt: Date | string | null;
  status: EstimateClientReviewSummary["status"];
  version: number;
}

export function createEstimatePublicationService(input: {
  pdf: EstimatePdfService;
  storage: EstimateClientReviewStorage;
  reviews: EstimateClientReviewService;
  audit: AuditService;
  deliverInitial: (
    roundId: string,
    actorId: string
  ) => Promise<EstimateClientReviewSummary>;
  now?: () => Date;
}): EstimatePublicationService {
  const now = input.now ?? (() => new Date());

  return {
    async publishEstimateToClient(
      publication: PublishEstimateToClientInput
    ): Promise<PublishEstimateToClientResult> {
      const preflightEstimate = await findEstimateForPublication(publication);
      if (!preflightEstimate) publicationConflict();
      if (
        publication.expectedStatus === "draft" &&
        preflightEstimate.total > APPROVAL_THRESHOLD
      ) {
        publicationConflict();
      }

      const preflightLead = await findMatchingLead(
        publication,
        preflightEstimate.projectId
      );
      if (!preflightLead) publicationConflict();

      const occurredAt = now();
      const submittedAt = publication.submittedAt ?? occurredAt;
      const pdfInput = toPostTransitionPdfInput(preflightEstimate, preflightLead);
      let retainedPdfBytes: Buffer | null = null;
      let stored: Awaited<ReturnType<EstimateClientReviewStorage["savePdfSnapshot"]>>;
      try {
        const generated = await input.pdf.generate(pdfInput, {
          profile: "compact_client_delivery"
        });
        retainedPdfBytes = generated.bytes;
        stored = await input.storage.savePdfSnapshot({
          bytes: retainedPdfBytes,
          filename: generated.filename
        });
      } catch (error) {
        retainedPdfBytes = null;
        throw error;
      }

      const recipientEmailNormalized = normalizeEmail(preflightLead.clientEmail);
      const dedupeKey = buildEstimateClientReviewDedupeKey({
        estimateId: publication.estimateId,
        estimateVersion: publication.expectedEstimateVersion,
        recipientEmailNormalized
      });
      const compatibilityNotification = {
        recipientEmail: preflightLead.clientEmail,
        recipientRole: "client",
        event: "estimate_ready_for_review",
        status: "queued",
        queuedAt: occurredAt
      };
      const submittedReview = {
        actorId: publication.actorId,
        action: "submitted",
        note: "",
        occurredAt: submittedAt
      };
      let resultEstimate = mapPublishedEstimate({
        estimate: preflightEstimate,
        expectedStatus: publication.expectedStatus,
        occurredAt,
        submittedAt,
        compatibilityNotification,
        submittedReview
      });

      let committedRound: RoundRow;
      let transactionBodyCompleted = false;
      try {
        committedRound = await inMongoTransaction(async (session) => {
          transactionBodyCompleted = false;
          const currentEstimate = await findEstimateForPublication(
            publication,
            session
          );
          if (!currentEstimate) publicationConflict();
          if (
            publication.expectedStatus === "draft" &&
            currentEstimate.total > APPROVAL_THRESHOLD
          ) {
            publicationConflict();
          }

          const currentLead = await findMatchingLead(
            publication,
            currentEstimate.projectId,
            session
          );
          if (!currentLead) publicationConflict();
          if (
            normalizeEmail(currentLead.clientEmail) !== recipientEmailNormalized
          ) {
            publicationConflict();
          }
          if (!isDeepStrictEqual(
            toPostTransitionPdfInput(currentEstimate, currentLead),
            pdfInput
          )) {
            publicationConflict();
          }

          const assignee = await input.reviews.resolveReviewAssignee(
            currentEstimate.projectId,
            session
          );
          const latestRound = await EstimateClientReviewRoundModel.findOne({
            estimateId: publication.estimateId
          })
            .sort({ sendGeneration: -1, _id: 1 })
            .session(session)
            .lean();
          const sendGeneration = latestRound
            ? Number(latestRound.sendGeneration) + 1
            : 1;
          const roundId = `estimate-client-review-${randomUUID()}`;
          const snapshot = toEstimateSnapshot(currentEstimate, currentLead);
          const roundInput = {
            _id: roundId,
            estimateId: publication.estimateId,
            leadId: publication.leadId,
            projectId: currentEstimate.projectId,
            estimateVersion: publication.expectedEstimateVersion,
            sendGeneration,
            dedupeKey,
            recipientEmail: currentLead.clientEmail,
            recipientEmailNormalized,
            estimateSnapshot: snapshot,
            pdfFilename: stored.filename,
            pdfMimeType: stored.mimeType,
            pdfByteSize: stored.byteSize,
            pdfSha256: stored.sha256,
            pdfStorageReference: stored.storageReference,
            deliveryStatus: "queued" as const,
            deliveryAttemptGeneration: 1,
            deliveryAttemptCount: 0,
            deliveryAttemptedAt: null,
            deliveryLeaseExpiresAt: null,
            deliveredAt: null,
            deliveryFailureCode: null,
            assignedAdminId: assignee.assignedAdminId,
            status: "pending" as const,
            decision: null,
            decisionSource: null,
            decisionNote: null,
            decidedById: null,
            decidedAt: null,
            version: 1
          };

          const [createdRound] = await EstimateClientReviewRoundModel.create(
            [roundInput],
            { session }
          );
          if (!createdRound) throw new Error("Estimate publication round was not created.");

          const estimateUpdate = publication.expectedStatus === "draft"
            ? {
                $set: {
                  status: "sent_to_client",
                  sentToClientAt: occurredAt,
                  submittedAt,
                  approvalRequired: false
                },
                $push: {
                  reviews: submittedReview,
                  notifications: compatibilityNotification
                }
              }
            : {
                $set: {
                  status: "sent_to_client",
                  sentToClientAt: occurredAt
                },
                $push: { notifications: compatibilityNotification }
              };
          const transition = await EstimateModel.updateOne(
            publicationEstimateFilter(publication),
            estimateUpdate,
            { session }
          );
          if (transition.matchedCount !== 1) publicationConflict();

          const leadTransition = await LeadModel.updateOne(
            {
              _id: publication.leadId,
              ownerId: publication.actorId,
              projectId: currentEstimate.projectId
            },
            {
              $set: {
                stage: "estimate_sent",
                nextAction: "client estimate decision",
                nextActionAt: occurredAt
              }
            },
            { session }
          );
          if (leadTransition.matchedCount !== 1) publicationConflict();

          await input.audit.appendInMongoTransaction({
            actorId: publication.actorId,
            action: "estimate_client_review_published",
            entityType: "estimate_client_review_round",
            entityId: roundId,
            occurredAt: occurredAt.toISOString(),
            oldValues: {
              estimateStatus: publication.expectedStatus
            },
            newValues: {
              estimateStatus: "sent_to_client",
              estimateVersion: publication.expectedEstimateVersion,
              sendGeneration,
              deliveryStatus: "queued"
            }
          }, session);
          await input.audit.appendInMongoTransaction({
            actorId: publication.actorId,
            action: "estimate_client_response_task_assigned",
            entityType: "estimate_client_review_round",
            entityId: roundId,
            occurredAt: occurredAt.toISOString(),
            oldValues: {},
            newValues: {
              assignedAdminId: assignee.assignedAdminId,
              assignmentSource: assignee.source,
              status: "pending"
            }
          }, session);

          const createdObject = createdRound.toObject() as unknown as RoundRow;
          transactionBodyCompleted = true;
          return {
            ...createdObject,
            _id: String(createdRound._id)
          };
        });
      } catch (error) {
        const recovery = await probeCommittedRound({
          publication,
          recipientEmailNormalized,
          dedupeKey,
          storageReference: stored.storageReference
        });
        if (recovery?.pdfStorageReference === stored.storageReference) {
          resultEstimate = await loadCommittedEstimate(publication);
          committedRound = recovery;
        } else if (recovery) {
          retainedPdfBytes = null;
          await input.storage.deleteQuietly(stored.storageReference);
          return {
            estimate: await loadCommittedEstimate(publication),
            clientReview: mapRoundSummary(recovery)
          };
        } else {
          retainedPdfBytes = null;
          if (transactionBodyCompleted) publicationRecoveryFailed();
          await input.storage.deleteQuietly(stored.storageReference);
          if (isDuplicateKeyError(error)) publicationConflict();
          if (error instanceof ApiError) throw error;
          publicationRecoveryFailed();
        }
      }

      const preDeliverySummary = mapRoundSummary(committedRound);
      let clientReview = preDeliverySummary;
      try {
        clientReview = await input.deliverInitial(
          committedRound._id,
          publication.actorId
        );
      } catch {
        try {
          clientReview =
            await input.reviews.currentSummaryForEstimate(
              publicationActor(publication.actorId),
              publication.estimateId
            ) ?? preDeliverySummary;
        } catch {
          clientReview = preDeliverySummary;
        }
      } finally {
        retainedPdfBytes = null;
      }

      return { estimate: resultEstimate, clientReview };
    }
  };
}

function publicationEstimateFilter(input: PublishEstimateToClientInput) {
  return {
    _id: input.estimateId,
    leadId: input.leadId,
    ownerId: input.actorId,
    status: input.expectedStatus,
    version: input.expectedEstimateVersion
  };
}

async function findEstimateForPublication(
  input: PublishEstimateToClientInput,
  session?: mongoose.ClientSession
): Promise<PublicationEstimate | null> {
  const query = EstimateModel.findOne(publicationEstimateFilter(input));
  if (session) query.session(session);
  return await query.lean() as unknown as PublicationEstimate | null;
}

async function findMatchingLead(
  input: PublishEstimateToClientInput,
  projectId: string | null,
  session?: mongoose.ClientSession
): Promise<PublicationLead | null> {
  const query = LeadModel.findOne({
    _id: input.leadId,
    ownerId: input.actorId,
    projectId
  });
  if (session) query.session(session);
  return await query.lean() as unknown as PublicationLead | null;
}

function toPostTransitionPdfInput(
  estimate: PublicationEstimate,
  lead: PublicationLead
): EstimatePdfInput {
  return {
    id: estimate._id,
    version: estimate.version,
    status: "sent_to_client",
    propertyType: estimate.propertyType,
    subtotal: estimate.subtotal,
    gst: estimate.gst,
    total: estimate.total,
    lineItems: estimate.lineItems.map((line) => ({ ...line })),
    lead: {
      clientName: lead.clientName,
      clientEmail: lead.clientEmail,
      projectName: lead.projectName,
      location: lead.location
    }
  };
}

function toEstimateSnapshot(
  estimate: PublicationEstimate,
  lead: PublicationLead
): EstimateClientReviewSnapshot {
  return {
    clientName: lead.clientName,
    projectName: lead.projectName,
    location: lead.location,
    propertyType: estimate.propertyType,
    lineItems: estimate.lineItems.map((line) => ({ ...line })),
    subtotal: estimate.subtotal,
    gst: estimate.gst,
    total: estimate.total
  };
}

function mapPublishedEstimate(input: {
  estimate: PublicationEstimate;
  expectedStatus: PublishEstimateToClientInput["expectedStatus"];
  occurredAt: Date;
  submittedAt: Date;
  compatibilityNotification: Record<string, unknown>;
  submittedReview: Record<string, unknown>;
}): Record<string, unknown> {
  const { _id, ...estimate } = input.estimate;
  return {
    ...estimate,
    id: _id,
    status: "sent_to_client",
    sentToClientAt: input.occurredAt,
    ...(input.expectedStatus === "draft"
      ? {
          approvalRequired: false,
          submittedAt: input.submittedAt,
          reviews: [
            ...input.estimate.reviews.map((review) => ({ ...review })),
            { ...input.submittedReview }
          ]
        }
      : {
          reviews: input.estimate.reviews.map((review) => ({ ...review }))
        }),
    notifications: [
      ...input.estimate.notifications.map((notification) => ({ ...notification })),
      { ...input.compatibilityNotification }
    ]
  };
}

function mapRoundSummary(round: RoundRow): EstimateClientReviewSummary {
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

async function probeCommittedRound(input: {
  publication: PublishEstimateToClientInput;
  recipientEmailNormalized: string;
  dedupeKey: string;
  storageReference: string;
}): Promise<RoundRow | null> {
  const identity = {
    dedupeKey: input.dedupeKey,
    estimateId: input.publication.estimateId,
    estimateVersion: input.publication.expectedEstimateVersion,
    recipientEmailNormalized: input.recipientEmailNormalized
  };
  try {
    const ownRound = await EstimateClientReviewRoundModel.findOne({
      ...identity,
      pdfStorageReference: input.storageReference
    })
      .select("+pdfStorageReference")
      .lean();
    if (isMatchingWinner(
      ownRound as unknown as RoundRow | null,
      input.publication,
      input.recipientEmailNormalized,
      input.dedupeKey
    ) && String(ownRound.pdfStorageReference) === input.storageReference) {
      return ownRound as unknown as RoundRow;
    }

    const winner = await EstimateClientReviewRoundModel.findOne(identity)
      .select("+pdfStorageReference")
      .lean();
    return isMatchingWinner(
      winner as unknown as RoundRow | null,
      input.publication,
      input.recipientEmailNormalized,
      input.dedupeKey
    )
      ? winner as unknown as RoundRow
      : null;
  } catch {
    publicationRecoveryFailed();
  }
}

async function loadCommittedEstimate(
  input: PublishEstimateToClientInput
): Promise<Record<string, unknown>> {
  try {
    const estimate = await EstimateModel.findOne({
      _id: input.estimateId,
      leadId: input.leadId,
      ownerId: input.actorId,
      status: "sent_to_client",
      version: input.expectedEstimateVersion
    }).lean();
    if (!estimate) publicationRecoveryFailed();
    const { _id, ...persisted } = estimate as unknown as PublicationEstimate;
    return { ...persisted, id: String(_id) };
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.code === "ESTIMATE_PUBLICATION_RECOVERY_FAILED"
    ) {
      throw error;
    }
    publicationRecoveryFailed();
  }
}

function publicationActor(actorId: string): PublicUser {
  return {
    id: actorId,
    name: "",
    email: "",
    role: "estimator_sales"
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function isMatchingWinner(
  round: RoundRow | null,
  input: PublishEstimateToClientInput,
  recipientEmailNormalized: string,
  dedupeKey: string
): round is RoundRow {
  return Boolean(
    round &&
    String(round.dedupeKey) === dedupeKey &&
    String(round.estimateId) === input.estimateId &&
    Number(round.estimateVersion) === input.expectedEstimateVersion &&
    String(round.recipientEmailNormalized) === recipientEmailNormalized
  );
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

function publicationConflict(): never {
  throw new ApiError(
    409,
    "ESTIMATE_PUBLICATION_CONFLICT",
    "This estimate changed before it could be sent. Refresh and try again."
  );
}

function publicationRecoveryFailed(): never {
  throw new ApiError(
    500,
    "ESTIMATE_PUBLICATION_RECOVERY_FAILED",
    "Estimate publication state could not be confirmed safely."
  );
}
