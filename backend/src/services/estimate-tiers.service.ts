import mongoose, { type ClientSession } from "mongoose";
import { z } from "zod";
import { canonicalEstimateDimensions, calculateDimensionQuantity, estimateDimensionRulesEqual, estimateLineDimensionsValid, readEstimateDimensionRule, ESTIMATE_DIMENSION_INPUT_UNITS, ESTIMATE_DIMENSION_QUANTITY_UNITS } from "../domain/estimate-dimensions.js";
import { KNOWLEDGE_MODE_TIERS, type KnowledgeModeTier } from "../domain/ai-estimator-knowledge-mode-tiers.js";
import { selectedInHouseBaseRate, selectedInHouseComponents } from "../domain/ai-estimator-knowledge-in-house-components.js";
import { ESTIMATE_PRICING_MODES, estimateConfigurationRateMatches, type EstimatePricingMode } from "../domain/estimate-mode-pricing.js";
import { effectiveCommercialStatus, isCollaborativeEstimate } from "../domain/estimation-lifecycle.js";
import { ApiError } from "../middleware/errors.js";
import { EstimateModel } from "../models/Estimate.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectModel } from "../models/Project.js";
import { UserModel } from "../models/User.js";
import { AuthorizationCoordinationModel } from "../models/AuthorizationCoordination.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { assertEstimateEditable, estimatePhysicalScopeChanged, fenceCollaborativeEstimate } from "./estimate-collaboration-policy.service.js";
import { estimatorCatalogueTierPricing, fenceEstimateInHouseComponentReferences, resolveEstimatorCatalogueLines } from "./estimator-catalogue.service.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";

type Row = Record<string, any>;
type Resolved = Awaited<ReturnType<typeof resolveEstimatorCatalogueLines>>;
type Source = NonNullable<ReturnType<Resolved["get"]>>;
const stableId = z.string().trim().min(1).max(500);
const version = z.number().int().positive().safe();
export const estimateTierSelectionSchema = z.object({
  expectedVersion: version,
  modeTier: z.enum(KNOWLEDGE_MODE_TIERS),
  revisionId: stableId,
  itemVersion: version,
  revisionVersion: version,
  uomId: stableId,
  selectedInHouseComponentIds: z.array(stableId).max(50).refine(ids => new Set(ids).size === ids.length).optional()
}).strict();
export type EstimateTierSelection = z.infer<typeof estimateTierSelectionSchema>;
export const estimateDimensionsUpdateSchema = z.object({
  expectedVersion: version, revisionId: stableId, itemVersion: version, revisionVersion: version, uomId: stableId,
  expectedDimensionRule: z.object({ formula: z.literal("length_width"), inputUnit: z.enum(ESTIMATE_DIMENSION_INPUT_UNITS),
    quantityUnit: z.enum(ESTIMATE_DIMENSION_QUANTITY_UNITS), uomId: stableId, decimalScale: z.number().int().min(0).max(3) }).strict()
    .refine(value => readEstimateDimensionRule(value) !== null, "Review the dimension units."),
  dimensions: z.object({ length: z.string().max(32), width: z.string().max(32), height: z.string().max(32) }).strict()
    .refine(value => canonicalEstimateDimensions(value) !== null, "Enter positive Length, Width and Height with up to six decimal places.")
}).strict();
export type EstimateDimensionsUpdate = z.infer<typeof estimateDimensionsUpdateSchema>;
type LineChange = { kind: "tier"; input: EstimateTierSelection } | { kind: "dimensions"; input: EstimateDimensionsUpdate };
const dimensionsNeedReview = (line: Row, source: Source) => source.line.dimensionsMandatory === true &&
  (!source.line.dimensionRule || !estimateDimensionRulesEqual(source.line.dimensionRule, line.dimensionRule) ||
    !estimateLineDimensionsValid({ ...line, dimensionsMandatory: true }));

const notFound = (): never => { throw new ApiError(404, "ESTIMATE_TIERS_NOT_FOUND", "Estimate tier choices are unavailable."); };
const changed = (): never => { throw new ApiError(409, "ESTIMATE_VERSION_CONFLICT", "The estimate changed. Refresh before applying this tier."); };
const unavailable = (): never => { throw new ApiError(409, "ESTIMATE_TIER_UNAVAILABLE", "This tier or its configured price is unavailable. Refresh the available choices."); };
const tierOf = (line: Row): KnowledgeModeTier => line.modeTier ?? "signature";
const modeOf = (line: Row): EstimatePricingMode | null => ESTIMATE_PRICING_MODES.includes(line.pricingMode) ? line.pricingMode : null;
const validMoney = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

async function scope(actor: PublicUser, projectId: string, session?: ClientSession) {
  const userQuery = UserModel.findOne({ _id: actor.id, active: true, role: actor.role });
  const projectQuery = ProjectModel.findById(projectId);
  const estimateQuery = EstimateModel.findOne({ projectId });
  if (session) { userQuery.session(session); projectQuery.session(session); estimateQuery.session(session); }
  const user = await userQuery.lean();
  const project = await projectQuery.lean() as Row | null;
  const estimate = await estimateQuery.lean() as Row | null;
  if (!user || !project) return notFound();
  const client = actor.role === "client" && project.clientId === actor.id;
  const sales = actor.role === "estimator_sales" && project.assignedEstimatorId === actor.id && (!estimate || estimate.ownerId === actor.id);
  const designer = actor.role === "designer" && estimate?.estimation?.phase === "post" && estimate.designPlanDesignerId === actor.id;
  if (!(client || sales || designer || actor.role === "super_admin")) return notFound();
  if (estimate) {
    const query = LeadModel.findOne({ _id: estimate.leadId, projectId });
    if (session) query.session(session);
    if (!await query.select({ _id: 1 }).lean()) return notFound();
  }
  return { project, estimate, client, canUpdate: client || sales || designer };
}

function editing(context: Awaited<ReturnType<typeof scope>>) {
  if (!context.estimate) return { editingAllowed: false, editingBlockReason: "not_started" as const };
  try {
    assertEstimateEditable(context.estimate);
    if (!context.canUpdate) return { editingAllowed: false, editingBlockReason: "closed" as const };
    return { editingAllowed: true, editingBlockReason: null };
  } catch {
    const status = effectiveCommercialStatus(context.estimate);
    return { editingAllowed: false, editingBlockReason: ["sent_to_client", "ready_for_client", "pending_manager_assignment", "pending_designer_approval"].includes(status)
      ? "review_pending" as const : "closed" as const };
  }
}

function amountFor(ratePaise: number, quantity: unknown, decimalScale: number): number | null {
  if (!validMoney(ratePaise) || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 ||
    !Number.isSafeInteger(decimalScale) || decimalScale < 0 || decimalScale > 6) return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/u.exec(String(quantity));
  if (!match || (match[2]?.length ?? 0) > decimalScale) return null;
  const divisor = 10n ** BigInt(decimalScale);
  const units = BigInt(match[1]!) * divisor + BigInt((match[2] ?? "").padEnd(decimalScale, "0") || "0");
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const value = (BigInt(ratePaise) * units + divisor / 2n) / divisor;
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function choicesFor(line: Row, source?: Source) {
  const mode = modeOf(line);
  return KNOWLEDGE_MODE_TIERS.map(modeTier => {
    const pricing = source ? estimatorCatalogueTierPricing(source.line, modeTier) : null;
    const matchingUom = source?.line.uom.id === line.uomId;
    const components = mode === "in_house" ? pricing?.inHouseComponents : undefined;
    const componentChoices = components?.map(component => ({ id: component.id,
      label: [component.basketName, component.subBasketName].filter(Boolean).join(" / "),
      ratePaise: !component.unavailableReason && validMoney(component.baseRatePaise) ? component.baseRatePaise : null,
      available: !component.unavailableReason && validMoney(component.baseRatePaise) }));
    const ratePaise = components !== undefined
      ? tierOf(line) === modeTier ? selectedInHouseBaseRate(components, line.selectedInHouseComponentIds) : null
      : mode && pricing ? pricing.modeBaseRatesPaise[mode] : null;
    const hasCost = components !== undefined ? componentChoices!.some(component => component.available) : validMoney(ratePaise);
    const available = Boolean(pricing && mode && matchingUom && hasCost);
    const unavailableReason = !source ? "Configuration is unavailable." : !matchingUom ? "Ask Sales to review the changed unit and quantity." :
      !pricing ? "This tier is not configured for this main line." : !mode ? "Ask Sales to choose a pricing mode." :
      !hasCost ? "Price is not configured for this tier." : null;
    return { modeTier, available, unavailableReason,
      ratePaise: available && validMoney(ratePaise) ? ratePaise : null,
      amountPaise: available && validMoney(ratePaise) ? amountFor(ratePaise, line.quantity, source!.line.uom.decimalScale) : null,
      source: source ? { revisionId: source.line.revisionId, itemVersion: source.line.itemVersion,
        revisionVersion: source.line.revisionVersion, uomId: source.line.uom.id } : null,
      ...(componentChoices === undefined ? {} : { inHouseComponents: componentChoices }) };
  });
}

async function present(context: Awaited<ReturnType<typeof scope>>, session?: ClientSession) {
  const estimate = context.estimate;
  const savedLines: Row[] = (estimate?.lineItems ?? []).filter((line: Row) => line.source === "configuration" && line.included);
  const current = await resolveEstimatorCatalogueLines(savedLines.map(line => String(line.mainLineId)), session);
  // An unresolved current source cannot establish client visibility. Keep its cost in the total,
  // but let staff repair it without exposing a formerly visible line to the client.
  const lines = savedLines.filter(line => !context.client || current.has(line.mainLineId) &&
    line.clientVisible !== false && current.get(line.mainLineId)!.line.clientVisible !== false)
    .map(line => {
      const source = current.get(line.mainLineId);
      return { id: String(line.id), mainLineId: String(line.mainLineId), mainLineName: source?.line.name ?? line.mainLineName,
        roomName: line.roomName, quantity: line.quantity, uomName: line.uomName ?? line.unit,
        dimensionsMandatory: source?.line.dimensionsMandatory === true,
        dimensionRule: source?.line.dimensionsMandatory ? source.line.dimensionRule ?? null : readEstimateDimensionRule(line.dimensionRule),
        ...(canonicalEstimateDimensions(line.dimensions) ? { dimensions: canonicalEstimateDimensions(line.dimensions)! } : {}),
        dimensionsNeedReview: source ? dimensionsNeedReview(line, source) : true,
        pricingMode: modeOf(line), modeTier: tierOf(line), ratePaise: validMoney(line.ratePaise) ? line.ratePaise : null,
        amountPaise: validMoney(line.amountPaise) ? line.amountPaise : null,
        ...(line.selectedInHouseComponentIds === undefined ? {} : { selectedInHouseComponentIds: line.selectedInHouseComponentIds }),
        choices: choicesFor(line, source) };
    });
  const totalPaise = estimate?.totalPaise ?? (typeof estimate?.total === "number" ? Math.round(estimate.total * 100) : null);
  return { projectId: String(context.project._id), estimateId: estimate ? String(estimate._id) : null,
    estimateVersion: estimate?.version ?? null, ...editing(context), totalPaise: validMoney(totalPaise) ? totalPaise : null,
    isIncomplete: Boolean(estimate?.isIncomplete) || savedLines.some(line => {
      const source = current.get(line.mainLineId);
      return source ? dimensionsNeedReview(line, source) : false;
    }), lines };
}

async function fenceSource(line: Row, session: ClientSession) {
  const dependencies = [
    [AiEstimatorKnowledgeBasketModel, { _id: line.mainBasketId, status: { $in: ["active", "inactive"] } }],
    ...(line.subBasketId ? [[AiEstimatorKnowledgeSubBasketModel, { _id: line.subBasketId, basketId: line.mainBasketId }]] : []),
    [AiEstimatorKnowledgeUomModel, { _id: line.uomId, status: { $in: ["active", "inactive"] } }],
    [AiEstimatorKnowledgeMainLineModel, { _id: line.mainLineId, basketId: line.mainBasketId, status: { $in: ["active", "draft", "inactive"] } }]
  ] as const;
  for (const [model, filter] of dependencies) {
    const result = await (model as typeof AiEstimatorKnowledgeMainLineModel).updateOne(filter,
      { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false });
    if (result.matchedCount !== 1) unavailable();
  }
}

/** Narrow client commands derive commercial values on the server under the same estimate locks. */
export function createEstimateTiersService({ audit }: { audit: AuditService }) {
  async function changeLine(actor: PublicUser, projectId: string, lineItemId: string, change: LineChange) {
    const input = change.input;
    const session = await mongoose.startSession();
    try {
      let result!: Awaited<ReturnType<typeof present>>;
      await session.withTransaction(async () => {
        await AuthorizationCoordinationModel.updateOne({ _id: "authorization" },
          { $inc: { revision: 1 }, $set: { updatedAt: new Date() } }, { upsert: true, session });
        const context = await scope(actor, projectId, session);
        const estimate = context.estimate;
        if (!estimate || !context.canUpdate) return notFound();
        assertEstimateEditable(estimate);
        if (estimate.version !== input.expectedVersion) changed();
        const locked = await ProjectModel.updateOne({ _id: projectId,
          ...(context.client ? { clientId: actor.id } : {}) }, { $inc: { estimationFenceEpoch: 1 } }, { session });
        if (locked.matchedCount !== 1) return notFound();
        await fenceCollaborativeEstimate(estimate, session);
        const line: Row | undefined = estimate.lineItems.find((entry: Row) => entry.id === lineItemId && entry.source === "configuration" && entry.included);
        if (!line || context.client && line.clientVisible === false) return notFound();
        await fenceSource(line, session);
        const current = await resolveEstimatorCatalogueLines([String(line.mainLineId)], session);
        const source = current.get(line.mainLineId);
        if (context.client && source?.line.clientVisible === false) return notFound();
        if (!source) return unavailable();
        if (source.line.revisionId !== input.revisionId || source.line.itemVersion !== input.itemVersion ||
          source.line.revisionVersion !== input.revisionVersion || source.line.uom.id !== input.uomId || line.uomId !== input.uomId ||
          source.line.basketId !== line.mainBasketId || source.line.subBasketId !== line.subBasketId) {
          throw new ApiError(409, "ESTIMATE_CONFIGURATION_CHANGED", "Configuration changed. Refresh and review this line before saving.");
        }
        const mode = modeOf(line);
        const selectedTier = change.kind === "tier" ? change.input.modeTier : tierOf(line);
        const pricing = estimatorCatalogueTierPricing(source.line, selectedTier);
        let selected: string[] | undefined = line.selectedInHouseComponentIds;
        let quantity = line.quantity;
        let dimensions = line.dimensions;
        let ratePaise: number | null;
        let rateSource = line.rateSource;
        if (change.kind === "tier") {
          if (dimensionsNeedReview(line, source)) {
            throw new ApiError(409, "ESTIMATE_DIMENSIONS_REQUIRED", "Enter or review Length, Width and Height before changing this line’s tier.");
          }
          if (!pricing || !mode) return unavailable();
          if (mode === "in_house" && pricing.inHouseComponents !== undefined) {
            selected = change.input.selectedInHouseComponentIds;
            const components = selectedInHouseComponents(pricing.inHouseComponents, selected);
            if (!components || components.some(component => component.unavailableReason)) return unavailable();
            ratePaise = selectedInHouseBaseRate(pricing.inHouseComponents, selected);
          } else {
            if (change.input.selectedInHouseComponentIds?.length) return unavailable();
            selected = undefined;
            ratePaise = pricing.modeBaseRatesPaise[mode];
          }
          if (!validMoney(ratePaise)) return unavailable();
          rateSource = "configuration";
        } else {
          if (!pricing) return unavailable();
          if (!source.line.dimensionsMandatory || !source.line.dimensionRule) {
            throw new ApiError(409, "ESTIMATE_DIMENSIONS_UNAVAILABLE", "Dimensions require a supported area UOM configured for this main line.");
          }
          if (!estimateDimensionRulesEqual(change.input.expectedDimensionRule, source.line.dimensionRule)) {
            throw new ApiError(409, "ESTIMATE_DIMENSIONS_CHANGED", "The measurement units or precision changed. Refresh and review the dimensions before saving.");
          }
          const calculated = calculateDimensionQuantity(source.line.dimensionRule, change.input.dimensions);
          if (!calculated) throw new ApiError(400, "ESTIMATE_DIMENSIONS_INVALID", "Enter valid positive dimensions that produce a supported quantity.");
          dimensions = calculated.dimensions;
          quantity = calculated.quantity;
          ratePaise = validMoney(line.ratePaise) ? line.ratePaise : null;
          if (!estimateConfigurationRateMatches({ ...line, rateSource: "manual" }, pricing.modeBaseRatesPaise, pricing.inHouseComponents)) {
            throw new ApiError(409, "ESTIMATE_COMPONENT_SELECTION_INVALID", "Ask Sales to review this line’s pricing mode and In-house components before saving dimensions.");
          }
          // Measurement edits never silently replace a manual rate or a saved component choice.
          // Configured rates must still agree with the current chosen tier before changing money.
          if (rateSource === "configuration") {
            const configuredRate = mode && pricing ? mode === "in_house" && pricing.inHouseComponents !== undefined
              ? selectedInHouseBaseRate(pricing.inHouseComponents, selected) : pricing.modeBaseRatesPaise[mode] : null;
            if (validMoney(ratePaise) && (!pricing || configuredRate !== ratePaise)) {
              throw new ApiError(409, "ESTIMATE_DIMENSIONS_PRICE_CHANGED", "The configured price changed. Ask Sales to review this line before saving dimensions.");
            }
          }
        }
        const amountPaise = ratePaise === null ? null : amountFor(ratePaise, quantity, source.line.uom.decimalScale);
        if (ratePaise !== null && amountPaise === null) return unavailable();
        const nextLine: Row = { ...line, modeTier: selectedTier, rateSource, ratePaise, rate: ratePaise === null ? null : ratePaise / 100,
          quantity, amountPaise, amount: amountPaise === null ? null : amountPaise / 100, revisionId: source.line.revisionId,
          sourceItemStatus: source.line.itemStatus, sourceRevisionStatus: source.line.revisionStatus,
          sourceItemVersion: source.line.itemVersion, sourceRevisionVersion: source.line.revisionVersion,
          mainBasketName: source.mainBasketName, subBasketName: source.subBasketName, mainLineName: source.line.name,
          itemType: source.line.itemType, clientVisible: source.line.clientVisible, uomCode: source.line.uom.code,
          uomDecimalScale: source.line.uom.decimalScale, uomName: source.line.uom.name, unit: source.line.uom.name,
          dimensionsMandatory: source.line.dimensionsMandatory === true,
          designRules: source.line.designRules, designRulesDigest: source.line.designRulesDigest, estimateNotes: source.line.estimateNotes };
        if (source.line.dimensionsMandatory) nextLine.dimensionRule = source.line.dimensionRule;
        if (dimensions !== undefined) nextLine.dimensions = dimensions;
        delete nextLine.selectedInHouseComponentIds;
        if (selected !== undefined) nextLine.selectedInHouseComponentIds = selected;
        const lineItems = estimate.lineItems.map((entry: Row) => entry.id === lineItemId ? nextLine : entry);
        await fenceEstimateInHouseComponentReferences([nextLine], current, session);
        let subtotalPaise = 0;
        for (const entry of lineItems) {
          if (!entry.included) continue;
          const amount = entry.amountPaise ?? (entry.source === "configuration" ? null : Math.round(Number(entry.amount) * 100));
          if (amount === null) continue;
          if (!validMoney(amount) || !Number.isSafeInteger(subtotalPaise + amount)) return unavailable();
          subtotalPaise += amount;
        }
        const gstPaise = Number((BigInt(subtotalPaise) * 18n + 50n) / 100n);
        const totalPaise = subtotalPaise + gstPaise;
        if (!validMoney(totalPaise)) return unavailable();
        const values: Row = { lineItems, subtotalPaise, gstPaise, totalPaise,
          subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: totalPaise / 100,
          isIncomplete: lineItems.some((entry: Row) => entry.included && entry.source === "configuration" &&
            (!validMoney(entry.ratePaise) || !validMoney(entry.amountPaise) || !estimateLineDimensionsValid(entry))), status: "draft" };
        if (isCollaborativeEstimate(estimate)) {
          values["estimation.status"] = "draft";
          values.status = estimate.estimation.preApproval ? "client_approved" : "draft";
          if (estimatePhysicalScopeChanged(estimate, { ...estimate, lineItems })) values["estimation.designScopeRevision"] = estimate.estimation.designScopeRevision + 1;
        }
        const saved = await EstimateModel.findOneAndUpdate({ _id: estimate._id, version: input.expectedVersion },
          { $set: values, $inc: { version: 1 } }, { session, returnDocument: "after", runValidators: true }).lean() as Row | null;
        if (!saved) return changed();
        await audit.appendInMongoTransaction({ actorId: actor.id,
          action: change.kind === "tier" ? "estimate_tier_selected" : "estimate_dimensions_updated", entityType: "estimate", entityId: String(estimate._id),
          occurredAt: new Date().toISOString(), oldValues: { lineItemId, modeTier: tierOf(line), estimateVersion: input.expectedVersion,
            ...(change.kind === "dimensions" ? { dimensions: line.dimensions ?? null, quantity: line.quantity, dimensionRule: line.dimensionRule ?? null } : {}) },
          newValues: { lineItemId, modeTier: selectedTier, estimateVersion: saved.version, ratePaise, amountPaise,
            selectedInHouseComponentIds: selected ?? [], ...(change.kind === "dimensions" ? { dimensions, quantity, dimensionRule: nextLine.dimensionRule } : {}) } }, session);
        result = await present({ ...context, estimate: saved }, session);
      });
      return result;
    } finally { await session.endSession(); }
  }
  return {
    async detail(actor: PublicUser, projectId: string) { return present(await scope(actor, projectId)); },
    async select(actor: PublicUser, projectId: string, lineItemId: string, command: EstimateTierSelection) {
      const parsed = estimateTierSelectionSchema.safeParse(command);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Choose a valid tier and current configuration.");
      return changeLine(actor, projectId, lineItemId, { kind: "tier", input: parsed.data });
    },
    async updateDimensions(actor: PublicUser, projectId: string, lineItemId: string, command: EstimateDimensionsUpdate) {
      const parsed = estimateDimensionsUpdateSchema.safeParse(command);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Enter valid Length, Width and Height and current configuration.");
      return changeLine(actor, projectId, lineItemId, { kind: "dimensions", input: parsed.data });
    }
  };
}
