import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";
import { KNOWLEDGE_MODE_TIERS, type KnowledgeModeTier } from "../domain/ai-estimator-knowledge-mode-tiers.js";
import { canonicalEstimateDimensions, calculateDimensionQuantity, estimateLineDimensionsValid } from "../domain/estimate-dimensions.js";
import { ESTIMATE_COMPONENT_PRICING_BASIS, estimateComponentLineAmountIsValid } from "../domain/estimate-component-pricing.js";
import { clientQuotationEditable, effectiveCommercialStatus } from "../domain/estimation-lifecycle.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { createMongoRepository } from "../repositories/mongo.js";
import { assertEstimateEditable, estimatePhysicalScopeChanged, fenceCollaborativeEstimate } from "./estimate-collaboration-policy.service.js";
import { estimateAmountFor, estimateTierChoices, estimateTierScope, fenceEstimateTierSource, presentEstimateTiers } from "./estimate-tiers.service.js";
import { estimatorCatalogueTierPricing, fenceEstimateInHouseComponentReferences, resolveEstimatorCatalogueLines } from "./estimator-catalogue.service.js";
import { resolveEstimateComponentPricing } from "./estimate-component-pricing.service.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";

type Row = Record<string, any>;
type Source = NonNullable<ReturnType<Awaited<ReturnType<typeof resolveEstimatorCatalogueLines>>["get"]>>;
const id = z.string().trim().min(1).max(500);
const version = z.number().int().positive().safe();
export const quotationSourceSchema = z.object({ revisionId: id, itemVersion: version, revisionVersion: version, uomId: id }).strict();
const dimensions = z.object({ length: z.string().max(32), width: z.string().max(32), height: z.string().max(32) }).strict()
  .refine(value => canonicalEstimateDimensions(value) !== null, "Enter positive dimensions.");
const editableFields = {
  source: quotationSourceSchema,
  quantity: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  modeTier: z.enum(KNOWLEDGE_MODE_TIERS).optional(), dimensions: dimensions.optional(),
  selectedInHouseComponentIds: z.array(id).max(50).refine(ids => new Set(ids).size === ids.length).optional()
};
export const quotationPatchSchema = z.object({ expectedVersion: version, operations: z.array(z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), mainLineId: id, roomId: id, ...editableFields }).strict(),
  z.object({ kind: z.literal("update"), lineItemId: id, included: z.boolean().optional(), ...editableFields }).strict()
])).min(1).max(100) }).strict();
export type QuotationPatch = z.infer<typeof quotationPatchSchema>;
const missing = (): never => { throw new ApiError(404, "QUOTATION_NOT_FOUND", "Quotation unavailable."); };
const conflict = (): never => { throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "The quotation changed. Refresh before saving."); };
const unavailable = (): never => { throw new ApiError(409, "QUOTATION_CONFIGURATION_CHANGED", "Review the current item configuration before saving."); };
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

async function contextFor(actor: PublicUser, projectId: string, session?: ClientSession) {
  const context = await estimateTierScope(actor, projectId, session);
  if (context.project.estimationWorkflowVersion !== 3 || context.estimate?.estimation?.workflowVersion !== 3) return missing();
  return context;
}

/** The catalogue normalizes old flags; inspect raw current visibility to reject malformed data. */
async function clientVisible(source: Source, session?: ClientSession): Promise<boolean> {
  if (!source.line.clientVisible) return false;
  const query = AiEstimatorKnowledgeSectionModel.findOne({ mainLineId: source.line.mainLineId, revisionId: source.line.revisionId, sectionKey: "overview" });
  if (session) query.session(session);
  const overview = await query.select({ payload: 1 }).lean() as Row | null;
  return !!overview && (overview.payload?.clientVisible === undefined || overview.payload?.clientVisible === true);
}

function sourceIdentity(source: Source) {
  return { revisionId: source.line.revisionId, itemVersion: source.line.itemVersion,
    revisionVersion: source.line.revisionVersion, uomId: source.line.uom.id };
}

function currentFields(source: Source) {
  const line = source.line;
  return { mainLineId: line.mainLineId, mainBasketId: line.basketId, subBasketId: line.subBasketId,
    itemType: line.itemType, clientVisible: line.clientVisible, mainLineName: line.name,
    mainBasketName: source.mainBasketName, subBasketName: source.subBasketName,
    revisionId: line.revisionId, sourceItemVersion: line.itemVersion, sourceRevisionVersion: line.revisionVersion,
    sourceItemStatus: line.itemStatus, sourceRevisionStatus: line.revisionStatus,
    uomId: line.uom.id, uomCode: line.uom.code, uomName: line.uom.name, unit: line.uom.name, uomDecimalScale: line.uom.decimalScale,
    dimensionsMandatory: line.dimensionsMandatory, dimensionRule: line.dimensionRule,
    designRules: line.designRules, designRulesDigest: line.designRulesDigest, estimateNotes: line.estimateNotes };
}

function savedMode(estimate: Row, mainLineId: string): "pmc" | "sub_vendor" | "in_house" {
  const existing = estimate.lineItems.find((line: Row) => line.mainLineId === mainLineId);
  return ["pmc", "sub_vendor", "in_house"].includes(existing?.pricingMode) ? existing.pricingMode : "sub_vendor";
}

async function present(context: Awaited<ReturnType<typeof contextFor>>, session?: ClientSession) {
  const detail = await presentEstimateTiers(context, session);
  const estimate = context.estimate!;
  const current = await resolveEstimatorCatalogueLines(detail.lines.map(line => line.mainLineId), session);
  const lines = [];
  for (const line of detail.lines) {
    const source = current.get(line.mainLineId);
    if ((context.client || context.secondary) && (!source || !await clientVisible(source, session))) continue;
    const saved = estimate.lineItems.find((entry: Row) => entry.id === line.id);
    lines.push({ ...line, roomId: saved?.roomId ?? null, included: saved?.included === true,
      source: source ? sourceIdentity(source) : null });
  }
  const status = effectiveCommercialStatus(estimate);
  return { ...detail, lines, workflowVersion: 3 as const, phase: estimate.estimation.phase as "pre" | "post",
    status, pricedRevision: Number(estimate.estimation.pricedRevision),
    rooms: (estimate.rooms ?? []).map((room: Row) => ({ id: String(room.id), name: String(room.label ?? room.name ?? room.id) })),
    reviewState: estimate.estimation.editClosedAt ? "approved" as const : status === "sent_to_client" ? "ready_for_approval" as const :
      (estimate.reviews ?? []).at(-1)?.action === "client_quotation_saved" ? "awaiting_staff_review" as const : "draft" as const };
}

async function supersedePending(estimate: Row, actor: PublicUser, session: ClientSession, now: Date) {
  if (effectiveCommercialStatus(estimate) !== "sent_to_client") return;
  const changed = await EstimateClientReviewRoundModel.updateOne({ _id: estimate.estimation.pendingReviewRoundId,
    estimateId: estimate._id, projectId: estimate.projectId, estimateVersion: estimate.version, status: "pending" },
  { $set: { status: "superseded", decision: null, decisionSource: null, decisionNote: "Client saved quotation changes.",
    decidedById: actor.id, decidedAt: now }, $inc: { version: 1 } }, { session, runValidators: true });
  if (changed.matchedCount !== 1) conflict();
}

async function pricedLine(prior: Row, source: Source, operation: QuotationPatch["operations"][number], session: ClientSession): Promise<Row> {
  const next: Row = { ...prior, ...currentFields(source) };
  const tier = operation.modeTier ?? prior.modeTier ?? "signature";
  next.modeTier = tier;
  next.included = operation.kind === "update" ? operation.included ?? prior.included : true;
  next.quantity = operation.quantity ?? prior.quantity ?? 1;
  if (operation.dimensions) next.dimensions = canonicalEstimateDimensions(operation.dimensions);
  if (!next.included) {
    delete next.componentPricing;
    delete next.pricingBasis;
    next.amountPaise = 0;
    next.amount = 0;
    return next;
  }
  const pricing = estimatorCatalogueTierPricing(source.line, tier);
  if (!pricing) return unavailable();
  if (source.line.dimensionsMandatory && next.included) {
    if (!source.line.dimensionRule || !next.dimensions) throw new ApiError(400, "ESTIMATE_DIMENSIONS_REQUIRED", "Enter the item dimensions.");
    const calculated = calculateDimensionQuantity(source.line.dimensionRule, next.dimensions);
    if (!calculated) throw new ApiError(400, "ESTIMATE_DIMENSIONS_REQUIRED", "Enter valid item dimensions.");
    next.quantity = calculated.quantity;
  }
  next.rateSource = "configuration";
  delete next.componentPricing;
  delete next.pricingBasis;
  if (next.pricingMode === "in_house" && pricing.inHouseComponents !== undefined) {
    next.selectedInHouseComponentIds = operation.selectedInHouseComponentIds ?? prior.selectedInHouseComponentIds;
    const calculation = await resolveEstimateComponentPricing(source, tier as KnowledgeModeTier, next.quantity, next.selectedInHouseComponentIds, session);
    next.pricingBasis = ESTIMATE_COMPONENT_PRICING_BASIS;
    next.componentPricing = calculation;
    next.ratePaise = null;
    next.amountPaise = next.included ? calculation.totalPaise : 0;
  } else {
    if (operation.selectedInHouseComponentIds?.length) return unavailable();
    delete next.selectedInHouseComponentIds;
    next.ratePaise = pricing.modeBaseRatesPaise[next.pricingMode as keyof typeof pricing.modeBaseRatesPaise];
    if (!money(next.ratePaise)) return unavailable();
    const amount = estimateAmountFor(next.ratePaise, next.quantity, source.line.uom.decimalScale);
    if (amount === null) throw new ApiError(400, "ESTIMATE_QUANTITY_INVALID", "Enter a positive quantity using the configured unit precision.");
    next.amountPaise = next.included ? amount : 0;
  }
  next.rate = next.ratePaise === null ? null : next.ratePaise / 100;
  next.amount = next.amountPaise / 100;
  return next;
}

export function createQuotationService({ audit }: { audit: AuditService }) {
  return {
    async detail(actor: PublicUser, projectId: string) { return present(await contextFor(actor, projectId)); },
    async revision(actor: PublicUser, projectId: string) {
      const { estimate } = await contextFor(actor, projectId);
      return { estimateId: String(estimate!._id), estimateVersion: Number(estimate!.version), pricedRevision: Number(estimate!.estimation.pricedRevision),
        status: effectiveCommercialStatus(estimate!), phase: estimate!.estimation.phase as "pre" | "post" };
    },
    async items(actor: PublicUser, projectId: string, input: { search?: string; limit?: number; offset?: number } = {}) {
      const context = await contextFor(actor, projectId);
      const estimate = context.estimate!;
      const limit = Math.min(50, Math.max(1, input.limit ?? 20));
      const offset = Math.max(0, input.offset ?? 0);
      const ids = await AiEstimatorKnowledgeMainLineModel.find({ basketId: { $in: estimate.selectedMainBasketIds ?? [] }, status: { $in: ["active", "draft", "inactive"] } }).select({ _id: 1 }).lean();
      const sources = await resolveEstimatorCatalogueLines(ids.map(row => String(row._id)));
      const candidates = [];
      for (const source of sources.values()) {
        if (!await clientVisible(source) || input.search && !source.line.name.toLocaleLowerCase().includes(input.search.toLocaleLowerCase())) continue;
        const prior = estimate.lineItems.find((line: Row) => line.mainLineId === source.line.mainLineId);
        if (prior?.clientVisible === false) continue;
        const modeTier = prior?.modeTier ?? source.line.applicableTiers[0] ?? "signature";
        const pricingMode = savedMode(estimate, source.line.mainLineId);
        const choices = await estimateTierChoices({ quantity: 1, uomId: source.line.uom.id, pricingMode, modeTier }, source);
        if (!choices.some(choice => choice.available)) continue;
        candidates.push({ mainLineId: source.line.mainLineId, name: source.line.name, source: sourceIdentity(source),
          pricingMode, modeTier, dimensionsMandatory: source.line.dimensionsMandatory, dimensionRule: source.line.dimensionRule,
          uomName: source.line.uom.name, choices });
      }
      candidates.sort((a, b) => a.name.localeCompare(b.name) || a.mainLineId.localeCompare(b.mainLineId));
      return { items: candidates.slice(offset, offset + limit), total: candidates.length, limit, offset };
    },
    async save(actor: PublicUser, projectId: string, command: QuotationPatch) {
      const parsed = quotationPatchSchema.safeParse(command);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Choose valid quotation items, quantities and configured options.");
      const session = await mongoose.startSession();
      try {
        let result!: Awaited<ReturnType<typeof present>>;
        await session.withTransaction(async () => {
          await createMongoRepository(session).coordinateAuthorizationMutation();
          const context = await contextFor(actor, projectId, session);
          const estimate = context.estimate!;
          if (!context.canUpdate) return missing();
          if (context.client) { if (!clientQuotationEditable(estimate)) throw new ApiError(409, "ESTIMATE_LOCKED", "The quotation is not open for changes."); }
          else assertEstimateEditable(estimate);
          if (estimate.version !== parsed.data.expectedVersion) conflict();
          await fenceCollaborativeEstimate(estimate, session);
          const now = new Date();
          const lineItems: Row[] = structuredClone(estimate.lineItems);
          const touched = new Set<string>();
          for (const operation of parsed.data.operations) {
            let index = operation.kind === "update" ? lineItems.findIndex(line => line.id === operation.lineItemId) :
              lineItems.findIndex(line => line.mainLineId === operation.mainLineId && line.roomId === operation.roomId);
            const prior = index < 0 ? null : lineItems[index]!;
            if (operation.kind === "update" && (!prior || prior.source !== "configuration")) return missing();
            const mainLineId = operation.kind === "add" ? operation.mainLineId : String(prior!.mainLineId);
            const source = (await resolveEstimatorCatalogueLines([mainLineId], session)).get(mainLineId);
            if (!source || !await clientVisible(source, session) || prior?.clientVisible === false) return missing();
            if (Object.entries(sourceIdentity(source)).some(([key, value]) => operation.source[key as keyof typeof operation.source] !== value)) unavailable();
            if (prior && (prior.uomId !== source.line.uom.id || prior.mainBasketId !== source.line.basketId || prior.subBasketId !== source.line.subBasketId)) unavailable();
            const roomId = operation.kind === "add" ? operation.roomId : prior!.roomId;
            const room = estimate.rooms.find((row: Row) => row.id === roomId);
            if (!room || !(estimate.selectedMainBasketIds ?? []).includes(source.line.basketId)) return missing();
            const key = `${roomId}\u0000${mainLineId}`;
            if (touched.has(key)) throw new ApiError(400, "QUOTATION_DUPLICATE_OPERATION", "Change each quotation item once per save.");
            touched.add(key);
            if (operation.kind === "add" && prior?.included) throw new ApiError(409, "QUOTATION_ITEM_EXISTS", "This item is already selected in the room.");
            const base: Row = prior ?? { id: `estimate-line-${randomUUID()}`, source: "configuration", catalogueId: mainLineId,
              roomId, roomName: String(room.label ?? room.name ?? room.id), specification: null, included: true,
              classification: estimate.lineItems.find((line: Row) => line.mainLineId === mainLineId)?.classification ?? estimate.selectedMainBasketClassifications?.find((entry: Row) => entry.mainBasketId === source.line.basketId)?.classification ?? "standard",
              pricingMode: savedMode(estimate, mainLineId) };
            await fenceEstimateTierSource({ ...base, ...currentFields(source) }, session);
            const next = await pricedLine(base, source, operation, session);
            await fenceEstimateInHouseComponentReferences([next], new Map([[mainLineId, source]]), session);
            if (index < 0) lineItems.push(next); else lineItems[index] = next;
          }
          if (isDeepStrictEqual(lineItems, estimate.lineItems)) {
            result = await present(context, session);
            return;
          }
          let subtotalPaise = 0;
          for (const line of lineItems.filter(line => line.included)) {
            const amount = line.amountPaise ?? (line.source === "configuration" ? null : Math.round(line.amount * 100));
            if (amount === null) continue;
            if (!money(amount) || !Number.isSafeInteger(subtotalPaise + amount)) unavailable();
            subtotalPaise += amount;
          }
          const gstPaise = Number((BigInt(subtotalPaise) * 18n + 50n) / 100n);
          const totalPaise = subtotalPaise + gstPaise;
          if (!money(totalPaise)) unavailable();
          await supersedePending(estimate, actor, session, now);
          const physicalChange = estimatePhysicalScopeChanged(estimate, { ...estimate, lineItems });
          const saved = await EstimateModel.findOneAndUpdate({ _id: estimate._id, version: parsed.data.expectedVersion, "estimation.editClosedAt": null },
            { $set: { lineItems, subtotalPaise, gstPaise, totalPaise, subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: totalPaise / 100,
              isIncomplete: lineItems.some(line => line.included && line.source === "configuration" &&
                (!estimateLineDimensionsValid(line) || !estimateComponentLineAmountIsValid(line) && (!money(line.ratePaise) || !money(line.amountPaise)))),
              status: estimate.estimation.preApproval ? "client_approved" : "draft", "estimation.status": "draft", "estimation.pendingReviewRoundId": null,
              "estimation.salesApproval": null, "estimation.designScopeRevision": estimate.estimation.designScopeRevision + (physicalChange ? 1 : 0) },
              $inc: { version: 1, "estimation.pricedRevision": 1 },
              $push: { reviews: { actorId: actor.id, action: context.client ? "client_quotation_saved" : "quotation_saved", note: "", occurredAt: now } } },
            { session, returnDocument: "after", runValidators: true }).lean() as Row | null;
          if (!saved) conflict();
          await audit.appendInMongoTransaction({ actorId: actor.id, action: "quotation_saved", entityType: "estimate", entityId: String(estimate._id),
            occurredAt: now.toISOString(), oldValues: { estimateVersion: estimate.version, pricedRevision: estimate.estimation.pricedRevision },
            newValues: { estimateVersion: saved!.version, pricedRevision: saved!.estimation.pricedRevision, physicalChange, operationCount: parsed.data.operations.length } }, session);
          result = await present({ ...context, estimate: saved }, session);
        });
        return result;
      } finally { await session.endSession(); }
    }
  };
}
