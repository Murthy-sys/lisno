import { createMongoRepository } from "../repositories/mongo.js";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";

import { normalizeEmail } from "../domain/email.js";
import { ApiError } from "../middleware/errors.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import { EstimateModel } from "../models/Estimate.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { LeadModel } from "../models/Lead.js";
import { UserModel } from "../models/User.js";
import { resolveEstimatorCatalogueLines, type EstimatorCatalogueLine } from "../services/estimator-catalogue.service.js";
import type { AuditService } from "../services/audit.service.js";
import type { AuthService } from "../services/auth.service.js";
import type { EstimateDesignService } from "../services/estimate-design.service.js";
import type {
  EstimatePdfInput,
  EstimatePdfService
} from "../services/estimate-pdf.service.js";
import type { LeadService } from "../services/lead.service.js";
import type { EstimateClientReviewService } from "../services/estimate-client-review.service.js";
import type { EstimateDecisionService } from "../services/estimate-decision.service.js";
import type { EstimatePublicationService } from "../services/estimate-publication.service.js";
import { sendDownload } from "./estimate-client-responses.js";

const stableIdSchema = z.string().trim().min(1).max(128);
const estimateClassificationSchema = z.enum(["standard", "special"]);
const selectedMainBasketClassificationSchema = z.object({
  mainBasketId: stableIdSchema,
  classification: estimateClassificationSchema
}).strict();
const legacyEstimateLineSchema = z.object({
  source: z.literal("legacy").optional(), catalogueId: stableIdSchema,
  roomName: z.string().trim().min(1), specification: z.string().trim().min(1),
  unit: z.string().trim().min(1), rate: z.number().finite().nonnegative(),
  quantity: z.number().finite().nonnegative(), included: z.boolean()
}).strict();
const configuredEstimateLineSchema = z.object({
  source: z.literal("configuration"), id: stableIdSchema.optional(),
  catalogueId: stableIdSchema, roomId: stableIdSchema, roomName: z.string().trim().min(1),
  mainBasketId: stableIdSchema, subBasketId: stableIdSchema.nullable(),
  itemType: z.enum(["main_line", "temporary"]).default("main_line"),
  classification: estimateClassificationSchema.optional(),
  mainLineId: stableIdSchema, revisionId: stableIdSchema, uomId: stableIdSchema,
  recommendationSourceMainLineIds: z.array(stableIdSchema).optional(),
  itemVersion: z.number().int().positive().safe().optional(),
  revisionVersion: z.number().int().positive().safe().optional(),
  quantity: z.number().finite().nonnegative(), included: z.boolean(),
  ratePaise: z.number().int().nonnegative().safe().nullable()
}).strict().superRefine((line, context) => {
  if (line.catalogueId !== line.mainLineId) context.addIssue({
    code: z.ZodIssueCode.custom, path: ["catalogueId"], message: "Catalogue identity must match the Main Line."
  });
  if (line.itemType === "main_line" && line.subBasketId === null) context.addIssue({
    code: z.ZodIssueCode.custom, path: ["subBasketId"], message: "A Main Line requires a Sub Basket."
  });
  if (line.recommendationSourceMainLineIds !== undefined &&
    new Set(line.recommendationSourceMainLineIds).size !== line.recommendationSourceMainLineIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recommendationSourceMainLineIds"],
      message: "Select each recommendation source only once." });
  }
});
const estimateLineSchema = z.union([configuredEstimateLineSchema, legacyEstimateLineSchema]);
const estimateSchema = z.object({
  propertyType: z.string().trim().min(1), rooms: z.array(z.record(z.unknown())),
  scopes: z.array(z.string()), selectedMainBasketIds: z.array(stableIdSchema).optional(),
  selectedMainBasketClassifications: z.array(selectedMainBasketClassificationSchema).optional(),
  expectedVersion: z.number().int().positive().optional(),
  lineItems: z.array(estimateLineSchema)
}).strict().superRefine((value, context) => {
  const selected = value.selectedMainBasketIds ?? [];
  if (new Set(selected).size !== selected.length) context.addIssue({
    code: z.ZodIssueCode.custom, path: ["selectedMainBasketIds"], message: "Select each Main Basket only once."
  });
  const classifications = value.selectedMainBasketClassifications;
  if (classifications !== undefined) {
    const classifiedIds = classifications.map((entry) => entry.mainBasketId);
    if (new Set(classifiedIds).size !== classifiedIds.length) context.addIssue({
      code: z.ZodIssueCode.custom, path: ["selectedMainBasketClassifications"],
      message: "Classify each Main Basket only once."
    });
  }
  const identities = new Set<string>();
  const configuredInput = value.lineItems.some((line) => line.source === "configuration");
  const roomIds = new Set<string>();
  const roomLabels = new Map<string, string>();
  if (configuredInput) value.rooms.forEach((room, index) => {
    const id = room.id;
    const label = room.label;
    if (typeof id !== "string" || !id.trim() || typeof label !== "string" || !label.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["rooms", index], message: "Configured estimate rooms need an ID and label." });
      return;
    }
    if (roomIds.has(id)) context.addIssue({
      code: z.ZodIssueCode.custom, path: ["rooms", index, "id"], message: "Room IDs must be unique."
    });
    roomIds.add(id);
    roomLabels.set(id, label);
  });
  for (const [index, line] of value.lineItems.entries()) {
    if (line.source !== "configuration") continue;
    if (!roomIds.has(line.roomId)) context.addIssue({
      code: z.ZodIssueCode.custom, path: ["lineItems", index, "roomId"], message: "Select an existing room for this Main Line."
    });
    if (roomLabels.has(line.roomId) && roomLabels.get(line.roomId) !== line.roomName) context.addIssue({
      code: z.ZodIssueCode.custom, path: ["lineItems", index, "roomName"], message: "The Main Line room name must match the selected room."
    });
    const identity = `${line.roomId}\u0000${line.mainLineId}`;
    if (identities.has(identity)) context.addIssue({
      code: z.ZodIssueCode.custom, path: ["lineItems", index], message: "A room cannot contain the same Main Line twice."
    });
    identities.add(identity);
  }
});
type EstimateLineInput = z.infer<typeof estimateLineSchema>;

function configuredLineKey(roomId: string, mainLineId: string): string {
  return `${roomId}\u0000${mainLineId}`;
}

function normalizeRecommendationOrigins(
  lines: EstimateLineInput[],
  previousConfigured: ReadonlyMap<string, Record<string, unknown>>
): EstimateLineInput[] {
  const configuredIndices = new Map<string, number>();
  const roomsByMainLine = new Map<string, Set<string>>();
  lines.forEach((line, index) => {
    if (line.source !== "configuration") return;
    configuredIndices.set(configuredLineKey(line.roomId, line.mainLineId), index);
    const rooms = roomsByMainLine.get(line.mainLineId) ?? new Set<string>();
    rooms.add(line.roomId);
    roomsByMainLine.set(line.mainLineId, rooms);
  });

  const entries: Array<{ line: EstimateLineInput; recommendationOnly: boolean }> = lines.map((line) => {
    if (line.source !== "configuration") return { line, recommendationOnly: false };
    const prior = previousConfigured.get(configuredLineKey(line.roomId, line.mainLineId));
    const savedOrigins = prior?.recommendationSourceMainLineIds;
    let origins = line.recommendationSourceMainLineIds;
    if (origins !== undefined) {
      for (const sourceId of origins) {
        if (sourceId === line.mainLineId) {
          throw new ApiError(400, "ESTIMATE_RECOMMENDATION_SOURCE_INVALID",
            "A Main Line cannot recommend itself.");
        }
        const sourceIndex = configuredIndices.get(configuredLineKey(line.roomId, sourceId));
        const source = sourceIndex === undefined ? undefined : lines[sourceIndex];
        if (source?.source !== "configuration") {
          throw new ApiError(400,
            sourceIndex === undefined && roomsByMainLine.has(sourceId)
              ? "ESTIMATE_RECOMMENDATION_SOURCE_ROOM_INVALID"
              : "ESTIMATE_RECOMMENDATION_SOURCE_INVALID",
            "Choose a configured recommendation source in the same room.");
        }
      }
    } else if (Array.isArray(savedOrigins)) {
      // A legacy client may omit the field and remove an old source line entirely.
      origins = [...new Set(savedOrigins.filter((sourceId): sourceId is string => {
        if (typeof sourceId !== "string" || sourceId === line.mainLineId) return false;
        const sourceIndex = configuredIndices.get(configuredLineKey(line.roomId, sourceId));
        const source = sourceIndex === undefined ? undefined : lines[sourceIndex];
        return source?.source === "configuration";
      }))];
    }
    return {
      line: origins === undefined ? line : { ...line, recommendationSourceMainLineIds: origins },
      recommendationOnly: (origins?.length ?? 0) > 0 ||
        (line.recommendationSourceMainLineIds === undefined && Array.isArray(savedOrigins) && savedOrigins.length > 0)
    };
  });

  let changed: boolean;
  do {
    changed = false;
    for (const entry of entries) {
      if (entry.line.source !== "configuration" || !entry.recommendationOnly) continue;
      const line = entry.line;
      const currentOrigins = line.recommendationSourceMainLineIds ?? [];
      const includedOrigins = line.included ? currentOrigins.filter((sourceId) => {
        const sourceIndex = configuredIndices.get(configuredLineKey(line.roomId, sourceId));
        const source = sourceIndex === undefined ? undefined : entries[sourceIndex]?.line;
        return source?.source === "configuration" && source.included;
      }) : [];
      if (includedOrigins.length !== currentOrigins.length || line.included && includedOrigins.length === 0) {
        entry.line = {
          ...line,
          recommendationSourceMainLineIds: includedOrigins,
          included: line.included && includedOrigins.length > 0
        };
        changed = true;
      }
    }
  } while (changed);
  return entries.map((entry) => entry.line);
}

const assignmentSchema = z.object({ designerId: z.string().trim().min(1) }).strict();
const decisionSchema = z.object({ decision: z.enum(["approve", "request_changes"]), note: z.string().trim().max(1000).default("") }).strict();
const clientDecisionSchema = decisionSchema.extend({
  reviewRoundId: z.string().trim().min(1),
  reviewRoundVersion: z.number().int().positive()
}).superRefine((value, context) => {
  if (value.decision === "request_changes" && !value.note) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "Explain the changes you need." });
  }
});

export function createEstimatesRouter(
  auth: AuthService,
  leads: LeadService,
  estimatePdf: EstimatePdfService,
  estimateDesigns: EstimateDesignService,
  audit: AuditService,
  publication: EstimatePublicationService,
  decisions: EstimateDecisionService,
  reviews: EstimateClientReviewService
): Router {
  const router = Router(); const protectedRoute = authenticate(auth);
  const estimatorEstimate = async (
    actor: Parameters<EstimateClientReviewService["currentSummaryForEstimate"]>[0],
    value: Record<string, unknown> | null
  ) => {
    let estimate = mapEstimate(value);
    if (!estimate || !["estimator_sales", "super_admin"].includes(actor.role)) return estimate;
    if (isEditableEstimateStatus(estimate.status) && Array.isArray(estimate.lineItems)) {
      const savedLines = estimate.lineItems as Record<string, unknown>[];
      const latest = await resolveEstimatorCatalogueLines(savedLines.filter((line) =>
        line.source === "configuration" && typeof line.mainLineId === "string")
        .map((line) => String(line.mainLineId)));
      const lineItems = savedLines.map((line) => {
        if (line.source !== "configuration") return line;
        const source = latest.get(String(line.mainLineId));
        if (!source) return { ...line, configurationSourceUnavailable: true };
        const configurationUomChanged = line.uomId !== source.line.uom.id ||
          line.uomDecimalScale !== source.line.uom.decimalScale;
        return {
          ...line,
          ...currentConfiguredFields(source),
          configurationSourceUnavailable: false,
          configurationUomChanged,
          ...(configurationUomChanged ? { previousUomName: String(line.uomName ?? line.unit ?? "") } : {})
        };
      });
      estimate = { ...estimate, lineItems,
        isIncomplete: estimate.isIncomplete === true || lineItems.some((line) =>
          line.source === "configuration" &&
          (line.configurationSourceUnavailable === true || line.configurationUomChanged === true)) };
    }
    const [clientReview, clientFeedback] = await Promise.all([
      reviews.currentSummaryForEstimate(actor, String(estimate.id)),
      reviews.currentClientFeedbackForEstimate(actor, String(estimate.id), estimate)
    ]);
    return { ...estimate, ...(clientReview ? { clientReview } : {}), ...(clientFeedback ? { clientFeedback } : {}) };
  };
  router.get("/leads/:leadId/estimate", protectedRoute, requireOperation("GET /leads/:leadId/estimate"), async (req, res, next) => { try { const lead = await leads.get(req.authenticatedUser!, req.params.leadId as string); const estimateFilter = req.authenticatedUser!.role === "super_admin" ? { leadId: lead.id } : { leadId: lead.id, ownerId: req.authenticatedUser!.id }; const estimate = await EstimateModel.findOne(estimateFilter).lean(); res.json({ data: await estimatorEstimate(req.authenticatedUser!, estimate) }); } catch (error) { next(error); } });
  router.get("/estimates", protectedRoute, requireOperation("GET /estimates"), async (req, res, next) => { try {
    const estimateFilter = req.authenticatedUser!.role === "super_admin" ? {} : { ownerId: req.authenticatedUser!.id };
    const estimates = await EstimateModel.find(estimateFilter).sort({ updatedAt: -1 }).lean();
    const leadFilter = req.authenticatedUser!.role === "super_admin"
      ? { _id: { $in: estimates.map((estimate) => estimate.leadId) } }
      : { _id: { $in: estimates.map((estimate) => estimate.leadId) }, ownerId: req.authenticatedUser!.id };
    const leadItems = await LeadModel.find(leadFilter).lean();
    const byId = new Map(leadItems.map((lead) => [lead._id, lead]));
    res.json({ data: await Promise.all(estimates.map(async (estimate) => {
      const lead = byId.get(estimate.leadId);
      return { ...await estimatorEstimate(req.authenticatedUser!, estimate), lead: lead ? { ...lead, id: lead._id, _id: undefined } : null };
    })) });
  } catch (error) { next(error); } });
  router.put("/leads/:leadId/estimate", protectedRoute, requireOperation("PUT /leads/:leadId/estimate"), validateBody(estimateSchema), async (req, res, next) => { try {
    const lead = await leads.get(req.authenticatedUser!, req.params.leadId as string);
    let savedEstimate: Record<string, unknown>;
    try { savedEstimate = await withMongoTransaction(async (session) => {
      let estimate = await EstimateModel.findOne({ leadId: lead.id, ownerId: req.authenticatedUser!.id }).session(session);
      const configuredDraft = (req.body.lineItems as z.infer<typeof estimateLineSchema>[])
        .some((line) => line.source === "configuration") ||
        estimate?.lineItems.some((line: { source?: string }) => line.source === "configuration") === true ||
        Boolean((req.body.selectedMainBasketIds as string[] | undefined)?.length) ||
        Boolean(estimate?.selectedMainBasketIds?.length);
      const updatingExistingEstimate = Boolean(estimate);
      if (configuredDraft && estimate && req.body.expectedVersion !== estimate.version) {
        throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "This estimate changed. Refresh it before saving again.");
      }
      if (configuredDraft && !estimate && req.body.expectedVersion !== undefined) {
        throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "This estimate changed. Refresh it before saving again.");
      }
      const previousLines = (estimate?.toObject().lineItems ?? []) as Record<string, unknown>[];
      const previousConfigured = new Map(previousLines.filter((line) => line.source === "configuration")
        .map((line) => [`${String(line.roomId)}\u0000${String(line.mainLineId)}`, line]));
      const inputLines = normalizeRecommendationOrigins(
        req.body.lineItems as z.infer<typeof estimateLineSchema>[], previousConfigured);
      const selectedMainBasketIds: string[] = req.body.selectedMainBasketIds ?? estimate?.selectedMainBasketIds ?? [];
      const explicitBasketClassifications = req.body.selectedMainBasketClassifications as
        z.infer<typeof selectedMainBasketClassificationSchema>[] | undefined;
      if (explicitBasketClassifications !== undefined &&
        (explicitBasketClassifications.length !== selectedMainBasketIds.length ||
          explicitBasketClassifications.some((entry) => !selectedMainBasketIds.includes(entry.mainBasketId)))) {
        throw new ApiError(400, "ESTIMATE_BASKET_CLASSIFICATION_INVALID",
          "Classify each selected Main Basket exactly once.");
      }
      const previousBasketClassifications = (estimate?.toObject().selectedMainBasketClassifications ?? []) as
        z.infer<typeof selectedMainBasketClassificationSchema>[];
      const previousBasketClassificationById = new Map(previousBasketClassifications.map((entry) =>
        [entry.mainBasketId, entry.classification]));
      const explicitBasketClassificationById = new Map(explicitBasketClassifications?.map((entry) =>
        [entry.mainBasketId, entry.classification]) ?? []);
      const selectedMainBasketClassifications = selectedMainBasketIds.map((mainBasketId) => ({
        mainBasketId,
        classification: explicitBasketClassificationById.get(mainBasketId) ??
          previousBasketClassificationById.get(mainBasketId) ?? "standard"
      }));
      const previousSelected = new Set<string>(estimate?.selectedMainBasketIds ?? []);
      const newlySelected = selectedMainBasketIds.filter((id) => !previousSelected.has(id));
      if (newlySelected.length > 0 && await AiEstimatorKnowledgeBasketModel.countDocuments({
        _id: { $in: newlySelected }, status: "active"
      }).session(session) !== newlySelected.length) {
        throw new ApiError(409, "ESTIMATE_CATALOGUE_CHANGED", "Configuration changed. Refresh the catalogue before saving this basket.");
      }
      const configuredMainLineIds = inputLines
        .filter((line): line is z.infer<typeof configuredEstimateLineSchema> => line.source === "configuration")
        .map((line) => line.mainLineId);
      const configured = await resolveEstimatorCatalogueLines(configuredMainLineIds, session);
      const lineItems = inputLines.map((line, index) => {
        if (line.source !== "configuration") {
          const previous = previousLines[index];
          const amount = line.included ? Math.round(line.quantity * line.rate) : 0;
          if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(amount * 100)) {
            throw new ApiError(400, "ESTIMATE_AMOUNT_INVALID", "An estimate amount is too large.");
          }
          return {
            id: previous?.source !== "configuration" && typeof previous?.id === "string"
              ? previous.id : `estimate-line-${randomUUID()}`,
            ...line, source: "legacy" as const, amount, amountPaise: amount * 100
          };
        }
        const prior = previousConfigured.get(`${line.roomId}\u0000${line.mainLineId}`);
        if (prior && line.id && line.id !== prior.id) {
          throw new ApiError(409, "ESTIMATE_LINE_CHANGED", "Refresh the saved estimate line before editing it.");
        }
        const firstSave = configured.get(line.mainLineId);
        if (prior && !firstSave) {
          throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE",
            "This Main Line has no current Configuration. Correct it before saving the estimate.");
        }
        if (!prior && !selectedMainBasketIds.includes(line.mainBasketId)) {
          throw new ApiError(400, "ESTIMATE_BASKET_NOT_SELECTED", "Select the Main Basket before adding its item.");
        }
        if (!prior && (!firstSave || firstSave.line.itemType !== line.itemType ||
          firstSave.line.basketId !== line.mainBasketId ||
          firstSave.line.subBasketId !== line.subBasketId ||
          firstSave.line.revisionId !== line.revisionId || firstSave.line.uom.id !== line.uomId)) {
          throw new ApiError(409, "ESTIMATE_CATALOGUE_CHANGED", "Configuration changed. Refresh the catalogue before saving this line.");
        }
        if (!prior && firstSave && (
          firstSave.line.itemStatus !== "active" && (line.itemVersion === undefined || line.revisionVersion === undefined) ||
          line.itemVersion !== undefined && line.itemVersion !== firstSave.line.itemVersion ||
          line.revisionVersion !== undefined && line.revisionVersion !== firstSave.line.revisionVersion
        )) {
          throw new ApiError(409, "ESTIMATE_CATALOGUE_CHANGED", "Configuration changed. Refresh the catalogue before saving this line.");
        }
        if (prior) savedConfiguredSnapshot(prior);
        const snapshot = firstSave!;
        if (prior && snapshot.line.uom.id !== line.uomId) {
          throw new ApiError(409, "ESTIMATE_UOM_CHANGED",
            "The configured UOM changed. Review this line's quantity before saving.");
        }
        const quantityScale = snapshot.line.uom.decimalScale;
        const quantityUnits = scaledQuantity(line.quantity, quantityScale, line.included);
        const amountPaise = line.included && line.ratePaise === null
          ? null : line.included
            ? calculateAmountPaise(line.ratePaise!, quantityUnits, quantityScale)
            : 0;
        return {
          id: typeof prior?.id === "string" ? prior.id : `estimate-line-${randomUUID()}`,
          source: "configuration" as const, catalogueId: line.mainLineId,
          roomId: line.roomId, roomName: line.roomName,
          classification: line.classification ??
            (prior?.classification === "special" ? "special" : "standard"),
          ...(line.recommendationSourceMainLineIds !== undefined
            ? { recommendationSourceMainLineIds: line.recommendationSourceMainLineIds } : {}),
          ...currentConfiguredFields(snapshot),
          specification: null, unit: snapshot.line.uom.name,
          ratePaise: line.ratePaise, rate: line.ratePaise === null ? null : line.ratePaise / 100,
          quantity: line.quantity, included: line.included,
          amountPaise, amount: amountPaise === null ? null : amountPaise / 100
        };
      });
      const subtotalPaise = lineItems.reduce((sum, line) => {
        const next = sum + (line.amountPaise ?? 0);
        if (!Number.isSafeInteger(next)) throw new ApiError(400, "ESTIMATE_AMOUNT_INVALID", "The estimate total is too large.");
        return next;
      }, 0);
      const hasConfigured = lineItems.some((line) => line.source === "configuration");
      const gstPaise = hasConfigured
        ? Number((BigInt(subtotalPaise) * 18n + 50n) / 100n)
        : Math.round(subtotalPaise / 100 * .18) * 100;
      const totalPaise = subtotalPaise + gstPaise;
      if (!Number.isSafeInteger(gstPaise) || !Number.isSafeInteger(totalPaise)) {
        throw new ApiError(400, "ESTIMATE_AMOUNT_INVALID", "The estimate total is too large.");
      }
      const isIncomplete = lineItems.some((line) => line.source === "configuration" && line.included && line.ratePaise === null);
      const leadProjectId = lead.projectId ?? null;
      const estimateProjectId = estimate?.projectId ?? null;
      if (
        leadProjectId !== null &&
        estimateProjectId !== null &&
        leadProjectId !== estimateProjectId
      ) {
        throw new ApiError(
          409,
          "ESTIMATE_PROJECT_CONFLICT",
          "The estimate and lead are linked to different projects."
        );
      }
      if (estimate && !["draft", "designer_changes_requested", "client_changes_requested"].includes(estimate.status)) {
        throw new ApiError(409, "ESTIMATE_LOCKED", "This estimate is locked while another person is reviewing it.");
      }
      if (!estimate) {
        estimate = new EstimateModel({ _id: `estimate-${randomUUID()}`, leadId: lead.id, ownerId: req.authenticatedUser!.id, projectId: leadProjectId, version: 1, status: "draft" });
      } else if (estimate.projectId == null && leadProjectId !== null) {
        estimate.projectId = leadProjectId;
      }
      estimate.propertyType = req.body.propertyType;
      estimate.rooms = req.body.rooms;
      estimate.scopes = req.body.scopes;
      estimate.selectedMainBasketIds = selectedMainBasketIds;
      estimate.selectedMainBasketClassifications = selectedMainBasketClassifications;
      estimate.lineItems = lineItems;
      estimate.subtotalPaise = subtotalPaise;
      estimate.gstPaise = gstPaise;
      estimate.totalPaise = totalPaise;
      estimate.subtotal = subtotalPaise / 100;
      estimate.gst = gstPaise / 100;
      estimate.total = totalPaise / 100;
      estimate.isIncomplete = isIncomplete;
      if (estimate.status !== "draft") {
        estimate.status = "draft";
        estimate.version += 1;
      } else if (configuredDraft && updatingExistingEstimate) {
        estimate.version += 1;
      }
      await estimate.save({ session });
      return estimate.toObject();
    }); } catch (error) {
      if (isEstimateWriteConflict(error)) throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "This estimate changed. Refresh it before saving again.");
      throw error;
    }
    res.json({ data: await estimatorEstimate(req.authenticatedUser!, savedEstimate) });
  } catch (error) { next(error); } });
  router.post("/leads/:leadId/estimate/submit", protectedRoute, requireOperation("POST /leads/:leadId/estimate/submit"), async (req, res, next) => { try {
    const lead = await leads.get(req.authenticatedUser!, req.params.leadId as string);
    const estimate = await EstimateModel.findOne({ leadId: lead.id, ownerId: req.authenticatedUser!.id });
    if (!estimate || estimate.lineItems.every((line: { included: boolean }) => !line.included)) throw new ApiError(409, "ESTIMATE_EMPTY", "Select at least one estimate item before submitting.");
    assertEstimateReadyToSubmit(estimate.lineItems);
    await assertEstimateCurrentConfiguration(estimate.toObject());
    const approvalRequired = estimate.total > 1_500_000;
    const submittedAt = new Date();
    if (!approvalRequired) {
      const published = await publication.publishEstimateToClient({
        estimateId: String(estimate._id),
        leadId: lead.id,
        actorId: req.authenticatedUser!.id,
        expectedEstimateVersion: Number(estimate.version),
        expectedStatus: "draft",
        submittedAt
      });
      res.json({
        data: { ...published.estimate, clientReview: published.clientReview }
      });
      return;
    }
    const savedEstimate = await withMongoTransaction(async (session) => {
      const current = await EstimateModel.findOne({
        _id: estimate._id, ownerId: req.authenticatedUser!.id,
        version: estimate.version, status: "draft", total: { $gt: 1_500_000 }
      }).session(session);
      if (!current) throw new ApiError(409, "ESTIMATE_LOCKED", "The estimate changed before it could be submitted.");
      assertEstimateReadyToSubmit(current.lineItems);
      await fenceEstimateConfigurationDependencies(current.toObject().lineItems, session);
      await assertEstimateCurrentConfiguration(current.toObject(), session);
      current.approvalRequired = true;
      current.status = "pending_manager_assignment";
      current.submittedAt = submittedAt;
      current.reviews.push({ actorId: req.authenticatedUser!.id, action: "submitted", note: "", occurredAt: submittedAt });
      await current.save({ session });
      return current.toObject();
    });
    res.json({ data: await estimatorEstimate(req.authenticatedUser!, savedEstimate) });
  } catch (error) { next(error); } });

  router.get("/estimates/:estimateId/pdf", protectedRoute, requireOperation("GET /estimates/:estimateId/pdf"), async (req, res, next) => { try {
    const filter = req.authenticatedUser!.role === "super_admin"
      ? { _id: req.params.estimateId }
      : { _id: req.params.estimateId, ownerId: req.authenticatedUser!.id };
    const estimate = await EstimateModel.findOne(filter).lean();
    if (!estimate) throw estimateNotFound();
    if (estimate.lineItems.some((line: { source?: string; included?: boolean; ratePaise?: number | null }) =>
      line.source === "configuration" && line.included && line.ratePaise == null)) {
      throw new ApiError(409, "ESTIMATE_INCOMPLETE", "Enter all selected selling rates before downloading a proposal PDF.");
    }
    if (isEditableEstimateStatus(estimate.status)) await assertEstimateCurrentConfiguration(estimate);
    const lead = await LeadModel.findById(estimate.leadId).lean();
    if (!lead) throw estimateNotFound();
    const pdf = await estimatePdf.generate(toEstimatePdfInput(estimate, lead));
    res.set("Content-Type", "application/pdf").set("Content-Disposition", `attachment; filename="${pdf.filename}"`).send(pdf.bytes);
  } catch (error) { next(error); } });

  router.get("/estimates/review-queue", protectedRoute, requireOperation("GET /estimates/review-queue"), async (req, res, next) => { try {
    const user = req.authenticatedUser!;
    const filter = user.role === "super_admin"
      ? { status: { $in: ["pending_manager_assignment", "pending_designer_approval"] } }
      : user.role === "design_manager"
      ? { status: "pending_manager_assignment" }
      : { status: "pending_designer_approval", assignedDesignerId: user.id };
    const estimates = await EstimateModel.find(filter).sort({ submittedAt: 1 }).lean();
    const leadIds = estimates.map((estimate) => estimate.leadId);
    const leadItems = await LeadModel.find({ _id: { $in: leadIds } }).lean();
    const byId = new Map(leadItems.map((lead) => [lead._id, lead]));
    res.json({ data: estimates.map((estimate) => ({ ...mapEstimate(estimate), lead: byId.get(estimate.leadId) ?? null })) });
  } catch (error) { next(error); } });

  router.get("/estimates/designers", protectedRoute, requireOperation("GET /estimates/designers"), async (req, res, next) => { try {
    const filter = req.authenticatedUser!.role === "super_admin"
      ? { role: "designer", active: true }
      : { role: "designer", managerId: req.authenticatedUser!.id, active: true };
    const designers = await UserModel.find(filter).select("_id name email title").lean();
    res.json({ data: designers.map((designer) => ({ id: designer._id, name: designer.name, email: designer.email, title: designer.title ?? null })) });
  } catch (error) { next(error); } });

  router.post("/estimates/:estimateId/assign", protectedRoute, requireOperation("POST /estimates/:estimateId/assign"), validateBody(assignmentSchema), async (req, res, next) => { try {
    let responseEstimate: Record<string, unknown> | null = null;
    await withMongoTransaction(async (session) => {
      const designerFilter = req.authenticatedUser!.role === "super_admin"
        ? { _id: req.body.designerId, role: "designer", active: true }
        : { _id: req.body.designerId, role: "designer", managerId: req.authenticatedUser!.id, active: true };
      const designer = await UserModel.findOne(designerFilter).session(session).lean();
      if (!designer) throw new ApiError(404, "DESIGNER_NOT_FOUND", "Choose an active designer from your team.");
      const manager = designer.managerId
        ? await UserModel.findOne({ _id: designer.managerId, role: "design_manager", active: true }).session(session).lean()
        : null;
      if (!manager) throw new ApiError(404, "DESIGNER_MANAGER_NOT_FOUND", "Choose a designer with an active accountable manager.");
      const estimate = await EstimateModel.findOne({
        _id: req.params.estimateId,
        status: "pending_manager_assignment"
      }).session(session);
      if (!estimate) throw new ApiError(409, "ESTIMATE_NOT_ASSIGNABLE", "This estimate is no longer awaiting assignment.");
      const occurredAt = new Date();
      estimate.assignedManagerId = manager._id;
      estimate.assignedDesignerId = designer._id;
      estimate.status = "pending_designer_approval";
      estimate.reviews.push({ actorId: req.authenticatedUser!.id, action: "designer_assigned", note: designer.name, occurredAt });
      estimate.notifications.push({ recipientEmail: designer.email, recipientRole: "designer", event: "estimate_approval_assigned", status: "queued", queuedAt: occurredAt });
      await estimate.save({ session });
      await audit.appendInMongoTransaction({
        actorId: req.authenticatedUser!.id,
        action: "estimate_designer_assigned",
        entityType: "estimate",
        entityId: String(estimate._id),
        occurredAt: occurredAt.toISOString(),
        oldValues: { status: "pending_manager_assignment" },
        newValues: { status: "pending_designer_approval", designerId: String(designer._id), managerId: String(manager._id) }
      }, session);
      responseEstimate = estimate.toObject();
    });
    if (!responseEstimate) throw new Error("Estimate assignment transaction did not complete.");
    res.json({ data: mapEstimate(responseEstimate) });
  } catch (error) { next(error); } });

  router.post("/estimates/:estimateId/designer-decision", protectedRoute, requireOperation("POST /estimates/:estimateId/designer-decision"), validateBody(decisionSchema), async (req, res, next) => { try {
    const savedEstimate = await withMongoTransaction(async (session) => {
      const estimate = await EstimateModel.findOne({ _id: req.params.estimateId, status: "pending_designer_approval", assignedDesignerId: req.authenticatedUser!.id }).session(session);
      if (!estimate) throw new ApiError(409, "ESTIMATE_NOT_REVIEWABLE", "This estimate is not assigned to you for review.");
      estimate.status = req.body.decision === "approve" ? "ready_for_client" : "designer_changes_requested";
      estimate.reviews.push({ actorId: req.authenticatedUser!.id, action: req.body.decision === "approve" ? "designer_approved" : "designer_changes_requested", note: req.body.note, occurredAt: new Date() });
      await estimate.save({ session });
      return estimate.toObject();
    });
    res.json({ data: mapEstimate(savedEstimate) });
  } catch (error) { next(error); } });

  router.post("/estimates/:estimateId/send-client", protectedRoute, requireOperation("POST /estimates/:estimateId/send-client"), async (req, res, next) => { try {
    const estimate = await EstimateModel.findOne({ _id: req.params.estimateId, ownerId: req.authenticatedUser!.id, status: "ready_for_client" });
    if (!estimate) throw new ApiError(409, "ESTIMATE_NOT_READY", "Complete required approvals before sending this estimate.");
    assertEstimateReadyToSubmit(estimate.lineItems);
    const published = await publication.publishEstimateToClient({
      estimateId: String(estimate._id),
      leadId: String(estimate.leadId),
      actorId: req.authenticatedUser!.id,
      expectedEstimateVersion: Number(estimate.version),
      expectedStatus: "ready_for_client"
    });
    res.json({
      data: { ...published.estimate, clientReview: published.clientReview }
    });
  } catch (error) { next(error); } });

  router.get("/client/estimates", protectedRoute, requireOperation("GET /client/estimates"), async (req, res, next) => { try {
    res.json({ data: await reviews.listClientEstimates(req.authenticatedUser!) });
  } catch (error) { next(error); } });

  router.get("/client/estimates/:estimateId/pdf", protectedRoute, requireOperation("GET /client/estimates/:estimateId/pdf"), async (req, res, next) => { try {
    const roundId = z.string().trim().min(1).safeParse(req.query.roundId);
    if (!roundId.success) throw new ApiError(400, "ESTIMATE_REVIEW_ROUND_REQUIRED", "Refresh the estimate before downloading its PDF.");
    const actor = req.authenticatedUser!;
    const [estimate] = await reviews.listClientEstimates(actor, String(req.params.estimateId));
    if (!estimate) throw estimateNotFound();
    if (!estimate.publishedReview || estimate.publishedReview.id !== roundId.data) {
      throw new ApiError(409, "ESTIMATE_NOT_REVIEWABLE", "The submitted estimate changed. Refresh before downloading its PDF.");
    }
    const download = actor.role === "client"
      ? await reviews.readClientPdf(actor, roundId.data)
      : await reviews.readPdf(actor, roundId.data);
    sendDownload(res, download);
  } catch (error) { next(error); } });

  router.post("/client/estimates/:estimateId/decision", protectedRoute, requireOperation("POST /client/estimates/:estimateId/decision"), validateBody(clientDecisionSchema), async (req, res, next) => { try {
    const actor = req.authenticatedUser!;
    const estimateId = String(req.params.estimateId);
    const estimate = await EstimateModel.findOne({ _id: estimateId }).lean();
    if (!estimate) throw estimateNotFound();
    const lead = await LeadModel.findById(estimate.leadId).lean();
    if (
      !lead ||
      normalizeEmail(String(lead.clientEmail)) !== normalizeEmail(actor.email)
    ) {
      throw estimateNotFound();
    }
    await decisions.decide({
      estimateId,
      round: { id: req.body.reviewRoundId, expectedVersion: req.body.reviewRoundVersion },
      decision: req.body.decision,
      note: req.body.note,
      context: { source: "client_portal", actor, proof: null }
    });
    const [published] = await reviews.listClientEstimates(actor, estimateId);
    if (!published) throw estimateNotFound();
    res.json({ data: published });
  } catch (error) { next(error); } });
  return router;
}

function mapEstimate(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value) return null;
  const { _id, ...estimate } = value;
  const selectedMainBasketIds = Array.isArray(estimate.selectedMainBasketIds)
    ? estimate.selectedMainBasketIds as string[] : [];
  const savedBasketClassifications = Array.isArray(estimate.selectedMainBasketClassifications)
    ? estimate.selectedMainBasketClassifications as Array<{ mainBasketId: string; classification: string }> : [];
  const savedClassificationsById = new Map(savedBasketClassifications.map((entry) =>
    [entry.mainBasketId, entry.classification]));
  return {
    ...estimate,
    id: _id ?? value.id,
    selectedMainBasketClassifications: selectedMainBasketIds.map((mainBasketId) => ({
      mainBasketId,
      classification: savedClassificationsById.get(mainBasketId) === "special" ? "special" : "standard"
    })),
    lineItems: Array.isArray(estimate.lineItems) ? estimate.lineItems.map((line) => {
      const item = line as Record<string, unknown>;
      return item.source === "configuration"
        ? { ...item, classification: item.classification === "special" ? "special" : "standard" }
        : item;
    }) : estimate.lineItems
  };
}
function estimateNotFound() { return new ApiError(404, "ESTIMATE_NOT_FOUND", "Estimate not found."); }

function isEditableEstimateStatus(status: unknown): boolean {
  return status === "draft" || status === "designer_changes_requested" || status === "client_changes_requested";
}

function currentConfiguredFields(source: {
  line: EstimatorCatalogueLine;
  mainBasketName: string;
  subBasketName: string | null;
}) {
  return {
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
}

async function assertEstimateCurrentConfiguration(
  estimate: { lineItems?: unknown },
  session?: mongoose.ClientSession
): Promise<void> {
  const saved = Array.isArray(estimate.lineItems)
    ? estimate.lineItems.filter((line): line is Record<string, unknown> =>
      line && typeof line === "object" && line.source === "configuration") : [];
  if (saved.length === 0) return;
  const current = await resolveEstimatorCatalogueLines(saved.map((line) => String(line.mainLineId)), session);
  for (const line of saved) {
    const source = current.get(String(line.mainLineId));
    if (!source) {
      throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE",
        "This Main Line has no current Configuration. Correct it before submitting the estimate.");
    }
    const fields = currentConfiguredFields(source);
    if (Object.entries(fields).some(([field, value]) => line[field] !== value)) {
      throw new ApiError(409, "ESTIMATE_CONFIGURATION_CHANGED",
        "Configuration changed. Save the estimate with its current Main Line values before continuing.");
    }
  }
}

async function fenceEstimateConfigurationDependencies(lines: unknown, session: mongoose.ClientSession): Promise<void> {
  const configured = Array.isArray(lines) ? lines.filter((line): line is Record<string, unknown> =>
    line && typeof line === "object" && line.source === "configuration") : [];
  const ids = (field: "mainBasketId" | "subBasketId" | "uomId" | "mainLineId", optional = false) => {
    const values = configured.map((line) => line[field]);
    if (values.some((value) => !(optional && value === null) && (typeof value !== "string" || !value))) {
      throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE", "A configured Main Line dependency is unavailable.");
    }
    return [...new Set(values.filter((value): value is string => typeof value === "string"))].sort();
  };
  for (const id of ids("mainBasketId")) {
    const locked = await AiEstimatorKnowledgeBasketModel.findOneAndUpdate(
      { _id: id, status: { $in: ["active", "inactive"] } },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }
    ).select({ _id: 1 }).lean().exec();
    if (!locked) throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE", "A configured Main Basket is unavailable.");
  }
  for (const id of ids("subBasketId", true)) {
    const locked = await AiEstimatorKnowledgeSubBasketModel.findOneAndUpdate(
      { _id: id },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }
    ).select({ _id: 1 }).lean().exec();
    if (!locked) throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE", "A configured Sub Basket is unavailable.");
  }
  for (const id of ids("uomId")) {
    const locked = await AiEstimatorKnowledgeUomModel.findOneAndUpdate(
      { _id: id, status: { $in: ["active", "inactive"] } },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }
    ).select({ _id: 1 }).lean().exec();
    if (!locked) throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE", "A configured UOM is unavailable.");
  }
  for (const id of ids("mainLineId")) {
    const locked = await AiEstimatorKnowledgeMainLineModel.findOneAndUpdate(
      { _id: id, status: { $in: ["active", "draft", "inactive"] } },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }
    ).select({ _id: 1 }).lean().exec();
    if (!locked) {
      throw new ApiError(409, "ESTIMATE_CONFIGURATION_UNAVAILABLE", "A configured Main Line is unavailable.");
    }
  }
}

function savedConfiguredSnapshot(prior: Record<string, unknown>): {
  line: Omit<EstimatorCatalogueLine, "itemStatus" | "revisionStatus" | "itemVersion" | "revisionVersion" | "inHouseBaseRatePaise">;
  mainBasketName: string; subBasketName: string | null;
} {
  const strings = ["mainBasketId", "mainLineId", "revisionId", "uomId",
    "uomCode", "mainBasketName", "mainLineName", "uomName"] as const;
  const itemType = prior.itemType === "temporary" ? "temporary" :
    prior.itemType == null || prior.itemType === "main_line" ? "main_line" : null;
  const hasSubBasket = typeof prior.subBasketId === "string" && Boolean(prior.subBasketId) &&
    typeof prior.subBasketName === "string" && Boolean(prior.subBasketName);
  const directTemporary = itemType === "temporary" &&
    prior.subBasketId === null && prior.subBasketName === null;
  if (strings.some((field) => typeof prior[field] !== "string" || !prior[field]) ||
    !itemType || (!hasSubBasket && !directTemporary) ||
    !Number.isInteger(prior.uomDecimalScale) || Number(prior.uomDecimalScale) < 0 || Number(prior.uomDecimalScale) > 3) {
    throw new ApiError(409, "ESTIMATE_LINE_SNAPSHOT_INVALID", "This saved line needs review before it can be edited.");
  }
  return {
    mainBasketName: String(prior.mainBasketName),
    subBasketName: directTemporary ? null : String(prior.subBasketName),
    line: {
      id: String(prior.mainLineId), mainLineId: String(prior.mainLineId),
      basketId: String(prior.mainBasketId),
      subBasketId: directTemporary ? null : String(prior.subBasketId), itemType,
      name: String(prior.mainLineName), displayOrder: 0, revisionId: String(prior.revisionId),
      uom: { id: String(prior.uomId), code: String(prior.uomCode), name: String(prior.uomName),
        decimalScale: Number(prior.uomDecimalScale) }
    }
  };
}

function scaledQuantity(quantity: number, decimalScale: number, included: boolean): number {
  if (!Number.isFinite(quantity) || quantity < 0 || (included && quantity === 0)) {
    throw new ApiError(400, "ESTIMATE_QUANTITY_INVALID", "Enter a positive quantity for each selected line.");
  }
  const decimal = String(quantity);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(decimal)) {
    throw new ApiError(400, "ESTIMATE_QUANTITY_INVALID", "Enter a quantity using the configured UOM precision.");
  }
  const [whole, fraction = ""] = decimal.split(".");
  if (fraction.length > decimalScale) {
    throw new ApiError(400, "ESTIMATE_QUANTITY_INVALID", "Quantity exceeds the configured UOM precision.");
  }
  const units = Number(whole) * 10 ** decimalScale + Number(fraction.padEnd(decimalScale, "0"));
  if (!Number.isSafeInteger(units)) {
    throw new ApiError(400, "ESTIMATE_QUANTITY_INVALID", "Quantity is too large.");
  }
  return units;
}

function calculateAmountPaise(ratePaise: number, quantityUnits: number, decimalScale: number): number {
  const divisor = BigInt(10 ** decimalScale);
  const amount = (BigInt(ratePaise) * BigInt(quantityUnits) + divisor / 2n) / divisor;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ApiError(400, "ESTIMATE_AMOUNT_INVALID", "An estimate amount is too large.");
  }
  return Number(amount);
}

function assertEstimateReadyToSubmit(lines: readonly {
  source?: string; included?: boolean; ratePaise?: number | null; amountPaise?: number | null;
}[]): void {
  if (lines.some((line) => line.source === "configuration" && line.included &&
    (!Number.isSafeInteger(line.ratePaise) || !Number.isSafeInteger(line.amountPaise)))) {
    throw new ApiError(409, "ESTIMATE_INCOMPLETE", "Enter a valid selling rate for every selected item before submitting.");
  }
}

function isEstimateWriteConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; hasErrorLabel?: (label: string) => boolean };
  return candidate.code === 11000 || candidate.code === 112 ||
    candidate.hasErrorLabel?.("TransientTransactionError") === true;
}

async function withMongoTransaction<T>(
  operation: (session: mongoose.ClientSession) => Promise<T>
) {
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
function toEstimatePdfInput(
  estimate: {
    _id: string;
    version: number;
    status: string;
    propertyType: string;
    subtotal: number;
    gst: number;
    total: number;
    subtotalPaise?: number;
    gstPaise?: number;
    totalPaise?: number;
    lineItems: EstimatePdfInput["lineItems"];
  },
  lead: {
    clientName: string;
    clientEmail: string;
    projectName: string;
    location: string;
  }
): EstimatePdfInput {
  return {
    id: estimate._id,
    version: estimate.version,
    status: estimate.status,
    propertyType: estimate.propertyType,
    subtotal: estimate.subtotal,
    gst: estimate.gst,
    total: estimate.total,
    ...(estimate.subtotalPaise !== undefined ? { subtotalPaise: estimate.subtotalPaise } : {}),
    ...(estimate.gstPaise !== undefined ? { gstPaise: estimate.gstPaise } : {}),
    ...(estimate.totalPaise !== undefined ? { totalPaise: estimate.totalPaise } : {}),
    lineItems: estimate.lineItems,
    lead: {
      clientName: lead.clientName,
      clientEmail: lead.clientEmail,
      projectName: lead.projectName,
      location: lead.location
    }
  };
}
