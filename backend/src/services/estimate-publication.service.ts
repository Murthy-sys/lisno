import { estimateConfigurationRateMatches } from "../domain/estimate-mode-pricing.js";
import { createMongoRepository } from "../repositories/mongo.js";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import mongoose from "mongoose";

import {
  buildEstimateClientReviewDedupeKey,
  configuredEstimateParentIsValid,
  type EstimateClientReviewSnapshot,
  type SelectedMainBasketClassification,
  type EstimateClientReviewSummary
} from "../domain/estimate-client-review.js";
import { approvedEstimateLineItemKey } from "../domain/estimate-line-item.js";
import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { EstimateModel } from "../models/Estimate.js";
import { LeadModel } from "../models/Lead.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { resolveEstimatorCatalogueLines } from "./estimator-catalogue.service.js";
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
  lineItems: Array<EstimateClientReviewSnapshot["lineItems"][number] & { recommendationSourceMainLineIds?: string[] }>;
  subtotal: number;
  gst: number;
  total: number;
  subtotalPaise?: number;
  gstPaise?: number;
  totalPaise?: number;
  selectedMainBasketIds?: string[];
  selectedMainBasketClassifications?: SelectedMainBasketClassification[];
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
      assertPublishableConfiguredLines(preflightEstimate);
      if (publication.expectedStatus === "draft") await assertCurrentConfiguredPublication(preflightEstimate);
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
          assertPublishableConfiguredLines(currentEstimate);
          if (publication.expectedStatus === "draft") {
            await fencePublicationConfigurationDependencies(currentEstimate, session);
            await assertCurrentConfiguredPublication(currentEstimate, session);
          }
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
    subtotalPaise: estimate.subtotalPaise,
    gstPaise: estimate.gstPaise,
    totalPaise: estimate.totalPaise,
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
    lineItems: estimate.lineItems.map((line, index) => ({
      source: line.source,
      itemType: line.itemType,
      classification: line.source === "configuration"
        ? line.classification === "special" ? "special" : "standard"
        : line.classification,
      pricingMode: line.pricingMode,
      rateSource: line.rateSource,
      catalogueId: line.catalogueId,
      roomId: line.roomId,
      roomName: line.roomName,
      specification: line.specification,
      unit: line.unit,
      rate: line.rate,
      ratePaise: line.ratePaise,
      quantity: line.quantity,
      included: line.included,
      amount: line.amount,
      amountPaise: line.amountPaise,
      mainBasketId: line.mainBasketId,
      subBasketId: line.subBasketId,
      mainLineId: line.mainLineId,
      revisionId: line.revisionId,
      sourceItemStatus: line.sourceItemStatus,
      sourceRevisionStatus: line.sourceRevisionStatus,
      sourceItemVersion: line.sourceItemVersion,
      sourceRevisionVersion: line.sourceRevisionVersion,
      uomId: line.uomId,
      uomCode: line.uomCode,
      uomDecimalScale: line.uomDecimalScale,
      mainBasketName: line.mainBasketName,
      subBasketName: line.subBasketName,
      mainLineName: line.mainLineName,
      uomName: line.uomName,
      id: approvedEstimateLineItemKey({
        id: (line as { id?: unknown }).id,
        estimateId: estimate._id,
        estimateVersion: estimate.version,
        index
      })
    })),
    subtotal: estimate.subtotal,
    gst: estimate.gst,
    total: estimate.total,
    ...(estimate.subtotalPaise === undefined ? {} : { subtotalPaise: estimate.subtotalPaise }),
    ...(estimate.gstPaise === undefined ? {} : { gstPaise: estimate.gstPaise }),
    ...(estimate.totalPaise === undefined ? {} : { totalPaise: estimate.totalPaise }),
    ...(estimate.selectedMainBasketIds === undefined ? {} : {
      selectedMainBasketIds: [...estimate.selectedMainBasketIds],
      selectedMainBasketClassifications: estimate.selectedMainBasketIds.map((mainBasketId) => ({
        mainBasketId,
        classification: estimate.selectedMainBasketClassifications?.find((entry) =>
          entry.mainBasketId === mainBasketId)?.classification === "special" ? "special" as const : "standard" as const
      }))
    })
  };
}

function assertPublishableConfiguredLines(estimate: PublicationEstimate): void {
  const configured = estimate.lineItems.filter((line) => line.source === "configuration" && line.included);
  if (configured.length === 0) return;
  if (configured.some((line) =>
    !Number.isSafeInteger(line.ratePaise) ||
    !Number.isSafeInteger(line.amountPaise) ||
    Number(line.ratePaise) < 0 || Number(line.amountPaise) < 0 ||
    !line.mainBasketId || !configuredEstimateParentIsValid(line) || !line.mainLineId ||
    !line.revisionId || !line.uomId || !line.roomId ||
    !line.mainBasketName || !line.mainLineName ||
    !line.uomName || line.catalogueId !== line.mainLineId ||
    line.specification !== null ||
    line.rate !== Number(line.ratePaise) / 100 ||
    line.amount !== Number(line.amountPaise) / 100
  ) || ![estimate.subtotalPaise, estimate.gstPaise, estimate.totalPaise].every(Number.isSafeInteger) ||
    estimate.subtotalPaise !== estimate.lineItems.reduce((sum, line) =>
      sum + (line.included ? Number(line.amountPaise ?? Number(line.amount) * 100) : 0), 0) ||
    estimate.subtotalPaise! + estimate.gstPaise! !== estimate.totalPaise ||
    estimate.subtotal !== estimate.subtotalPaise! / 100 ||
    estimate.gst !== estimate.gstPaise! / 100 ||
    estimate.total !== estimate.totalPaise! / 100) {
    throw new ApiError(409, "ESTIMATE_INCOMPLETE", "Complete every included configured line before sending the estimate.");
  }
}

async function fencePublicationConfigurationDependencies(
  estimate: PublicationEstimate,
  session: mongoose.ClientSession
): Promise<void> {
  const configured = estimate.lineItems.filter((line) => line.source === "configuration");
  const ids = (field: "mainBasketId" | "subBasketId" | "uomId" | "mainLineId", optional = false) => {
    const values = configured.map((line) => line[field]);
    if (values.some((value) => !(optional && value === null) && (typeof value !== "string" || !value))) {
      publicationConflict();
    }
    return [...new Set(values.filter((value): value is string => typeof value === "string"))].sort();
  };
  for (const id of ids("mainBasketId")) {
    const locked = await AiEstimatorKnowledgeBasketModel.findOneAndUpdate(
      { _id: id, status: { $in: ["active", "inactive"] } },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }
    ).select({ _id: 1 }).lean().exec();
    if (!locked) throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE",
      "This Main Basket has no current Configuration. Correct it before sending the estimate.");
  }
  for (const id of ids("subBasketId", true)) {
    const locked = await AiEstimatorKnowledgeSubBasketModel.findOneAndUpdate(
      { _id: id },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }
    ).select({ _id: 1 }).lean().exec();
    if (!locked) throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE",
      "This Sub Basket has no current Configuration. Correct it before sending the estimate.");
  }
  for (const id of ids("uomId")) {
    const locked = await AiEstimatorKnowledgeUomModel.findOneAndUpdate(
      { _id: id, status: { $in: ["active", "inactive"] } },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }
    ).select({ _id: 1 }).lean().exec();
    if (!locked) throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE",
      "This UOM has no current Configuration. Correct it before sending the estimate.");
  }
  for (const id of ids("mainLineId")) {
    const locked = await AiEstimatorKnowledgeMainLineModel.findOneAndUpdate(
      { _id: id, status: { $in: ["active", "draft", "inactive"] } },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }
    ).select({ _id: 1 }).lean().exec();
    if (!locked) throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE",
      "This Main Line has no current Configuration. Correct it before sending the estimate.");
  }
}

async function assertCurrentConfiguredPublication(
  estimate: PublicationEstimate,
  session?: mongoose.ClientSession
): Promise<void> {
  const lines = estimate.lineItems.filter((line) => line.source === "configuration");
  if (lines.length === 0) return;
  const current = await resolveEstimatorCatalogueLines(lines.map((line) => String(line.mainLineId)), session);
  for (const line of lines) {
    const source = current.get(String(line.mainLineId));
    if (!source) throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE",
      "This Main Line has no current Configuration. Correct it before sending the estimate.");
    const stored = line as unknown as Record<string, unknown>;
    const expected: Record<string, unknown> = {
      itemType: source.line.itemType,
      mainBasketId: source.line.basketId,
      subBasketId: source.line.subBasketId,
      mainLineId: source.line.mainLineId,
      revisionId: source.line.revisionId,
      sourceItemStatus: source.line.itemStatus,
      sourceRevisionStatus: source.line.revisionStatus,
      sourceItemVersion: source.line.itemVersion,
      sourceRevisionVersion: source.line.revisionVersion,
      uomId: source.line.uom.id,
      uomCode: source.line.uom.code,
      uomDecimalScale: source.line.uom.decimalScale,
      mainBasketName: source.mainBasketName,
      subBasketName: source.subBasketName,
      mainLineName: source.line.name,
      uomName: source.line.uom.name,
      unit: source.line.uom.name
    };
    if (Object.entries(expected).some(([field, value]) => stored[field] !== value) ||
      !estimateConfigurationRateMatches(line, source.line.modeBaseRatesPaise)) {
      throw new ApiError(409, "ESTIMATE_CONFIGURATION_CHANGED",
        "Configuration changed. Save the estimate with its current Main Line values before sending it.");
    }
  }
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
      await createMongoRepository(session).coordinateAuthorizationMutation();
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
