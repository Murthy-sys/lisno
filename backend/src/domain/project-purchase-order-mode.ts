import { z } from "zod";
import type { KnowledgeConfigurationContext, KnowledgeModeCalculationSettings } from "../contracts/ai-estimator-knowledge.js";
import { canonicalizeScaledDecimal, calculateProcurementQuantity, multiplyMoneyByQuantity, parseScaledDecimal } from "./ai-estimator-knowledge-calculation.js";
import { buildKnowledgeConfigurationContext } from "./ai-estimator-knowledge-configuration-context.js";
import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";
import { calculateKnowledgeInHousePrice, calculateKnowledgeModeBaseRate, calculateKnowledgeModePrice, calculateKnowledgePmcPrice,
  calculateKnowledgeSubVendorPrice, KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS } from "./ai-estimator-knowledge-mode-calculation.js";

export const PURCHASE_ORDER_MODE_KEYS = ["pmc", "sub_vendor", "in_house"] as const;
export type PurchaseOrderModeKey = typeof PURCHASE_ORDER_MODE_KEYS[number];
export type PurchaseOrderModeIssue = { code: string; message: string };
export interface PurchaseOrderModeIntegrityBasis {
  kind: "observed_unverified";
  activatedDigest: string;
  observedDigest: string;
  reason: string;
  actorId: string;
  acknowledgedAt: string;
}
export interface PurchaseOrderModeIntegrity {
  status: "mismatch";
  activatedDigest: string;
  observedDigest: string;
  candidateAvailability: Array<{ key: PurchaseOrderModeKey; label: string; available: boolean; issues: PurchaseOrderModeIssue[] }>;
}

const id = z.string().trim().min(1).max(500);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const estimateSourceSchema = z.object({
  estimateId: id,
  estimateVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  estimateReviewRoundId: id.nullable()
}).strict();
export const purchaseOrderModeDecisionSaveSchema = z.object({
  sourceLineItemKey: id,
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  expectedEstimateSource: estimateSourceSchema,
  expectedRevisionDigest: digestSchema.nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
  mode: z.enum(PURCHASE_ORDER_MODE_KEYS).nullable(),
  quantity: z.string().trim().min(1).max(64).nullable(),
  discountBps: z.number().int().min(0).max(10_000).default(0),
  markupBasis: z.enum(["starting", "minimum"]).default("starting"),
  exceptionReason: z.string().trim().min(10).max(2_000).nullable().default(null),
  recovery: z.object({ expectedObservedDigest: digestSchema,
    reason: z.string().trim().min(10).max(2_000), acknowledge: z.literal(true) }).strict().optional()
}).strict().superRefine((value, context) => {
  if (value.mode && value.expectedRevisionDigest === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedRevisionDigest"],
      message: "Confirm the saved Configuration revision before selecting a mode." });
  }
  if (value.mode && (!value.quantity || value.exceptionReason)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: "Select a calculation quantity without a manual exception." });
  }
  if (!value.mode && (value.quantity || value.discountBps !== 0 || value.markupBasis !== "starting")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["mode"], message: "Clear the calculation fields when no mode is selected." });
  }
  if (value.recovery && (!value.mode || !value.quantity || value.exceptionReason)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recovery"],
      message: "Recovery requires a selected mode and calculation quantity without a manual exception." });
  }
});
export type PurchaseOrderModeDecisionSaveInput = z.infer<typeof purchaseOrderModeDecisionSaveSchema>;

export const purchaseOrderModePreviewSchema = z.object({
  estimateSource: estimateSourceSchema,
  sourceLineItemKey: id,
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  mode: z.enum(PURCHASE_ORDER_MODE_KEYS),
  quantity: z.string().trim().min(1).max(64),
  discountBps: z.number().int().min(0).max(10_000),
  markupBasis: z.enum(["starting", "minimum"]),
  expectedObservedDigest: digestSchema.optional()
}).strict();
export type PurchaseOrderModeDraftPreviewInput = z.infer<typeof purchaseOrderModePreviewSchema>;

export interface PurchaseOrderModeSourceLine {
  key: string;
  included: boolean;
  source?: "configuration" | "legacy";
  amountPaise: number | null;
  mainBasketId?: string;
  quantity?: number;
  mainLineId?: string;
  revisionId?: string;
  sourceRevisionVersion?: number;
  sourceRevisionStatus?: "draft" | "active" | "superseded";
  uomId?: string;
  uomCode?: string;
  uomDecimalScale?: number;
}

export interface PurchaseOrderModeDecisionDto {
  id: string;
  version: number;
  sourceLineItemKey: string;
  mode: PurchaseOrderModeKey | null;
  quantity: string | null;
  discountBps: number;
  markupBasis: "starting" | "minimum";
  exceptionReason: string | null;
  revisionId: string | null;
  revisionDigest: string | null;
  integrityBasis?: PurchaseOrderModeIntegrityBasis;
  updatedAt: string;
}

export interface PurchaseOrderModePreview {
  formulaVersion: "mode-margin-v2";
  mode: PurchaseOrderModeKey;
  quantity: string;
  quantityScale: number;
  baseCostPaise: number;
  adjustedCostPaise: number;
  lowQuantityImpactPaise: number;
  appliedImpactBps: number | null;
  sellingPaise: number;
  /** Signed internal remainder from the Sub-Vendor formula; never a vendor PO payable amount. */
  finalVendorChargesPaise: number | null;
  floorSellingPaise: number | null;
  marginBps: number | null;
  discountBps: number;
  discountAmountPaise: number;
  quantityRule: { slabId: string; minimumQuantity: string; maximumQuantity: string | null; adjustmentBps: number } | null;
  procurementQuantitySuggestion: string | null;
  settings: {
    scopes: Array<{ scope: "pmc" | "sub_vendor" | "in_house_labor" | "in_house_material";
      source: "scoped" | "legacy_shared" | "legacy_in_house" | null;
      baseRatePaise: number; lowQuantityLimit: string; impactBps: number;
      minimumMarkupBps: number; startingMarkupBps: number }>;
    configuredMarginBps: number | null;
    markupBasis: "starting" | "minimum";
  };
  components: Array<{ scope: "labor" | "material"; adjustedCostPaise: number; sellingPaise: number; floorSellingPaise: number }>;
}

/** Transient calculation evidence; never persisted or included in preparation digests. */
export interface PurchaseOrderModeCalculationStage {
  scope: "pmc" | "sub_vendor" | "in_house_labor" | "in_house_material";
  baseRatePaise: number;
  baseSubtotalPaise: number;
  lowQuantityLimit: string;
  configuredImpactBps: number;
  thresholdMet: boolean;
  appliedImpactBps: number;
  adjustedUnitRatePaise: number;
  adjustedCostPaise: number;
  lowQuantityImpactPaise: number;
  marginBps: number;
  marginAmountPaise: number;
  sellingBeforeDiscountPaise: number;
  discountBasisPaise: number;
  discountAmountPaise: number;
  floorSellingPaise: number | null;
  sellingPaise: number;
}

export interface PurchaseOrderModeDraftPreview {
  projectId: string;
  estimateSource: PurchaseOrderModeDraftPreviewInput["estimateSource"];
  sourceLineItemKey: string;
  decisionVersion: number;
  revision: PurchaseOrderModeResolution["revision"];
  uom: PurchaseOrderModeResolution["uom"];
  preview: PurchaseOrderModePreview | null;
  scopes: PurchaseOrderModeCalculationStage[];
  issues: PurchaseOrderModeIssue[];
  integrity?: PurchaseOrderModeIntegrity;
}

export interface PurchaseOrderModePriceReference {
  state: "ready" | "unavailable";
  priceVersionId: string | null;
  priceVersionNumber: number | null;
  taxVersionId: string | null;
  taxVersionNumber: number | null;
  unitPricePaise: number | null;
  gstBasisPoints: number | null;
  treatment: "inclusive" | "exclusive" | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  issues: PurchaseOrderModeIssue[];
}

export interface PurchaseOrderModeResolution {
  state: "ready" | "selection_required" | "unavailable" | "exception";
  options: Array<{ key: PurchaseOrderModeKey; label: string }>;
  availability: Array<{ key: PurchaseOrderModeKey; label: string; available: boolean; issues: PurchaseOrderModeIssue[] }>;
  decision: PurchaseOrderModeDecisionDto | null;
  preview: PurchaseOrderModePreview | null;
  issues: PurchaseOrderModeIssue[];
  revision: { id: string; version: number; status: "draft" | "active" | "superseded"; contentDigest: string | null } | null;
  uom: { id: string; code: string; name?: string; decimalScale: number } | null;
  priceReferences: Record<string, PurchaseOrderModePriceReference>;
  integrity?: PurchaseOrderModeIntegrity;
}

export interface PurchaseOrderModeSettingsAnalysis {
  options: PurchaseOrderModeResolution["options"];
  availability: PurchaseOrderModeResolution["availability"];
  issues: PurchaseOrderModeIssue[];
  preview: PurchaseOrderModePreview | null;
}

/** Read-only Standard-basket hint, kept outside saved mode resolutions and request snapshots. */
export interface PurchaseOrderModeStandardCostPreview {
  mode: "sub_vendor";
  quantity: string;
  baseCostPaise: number;
  adjustedCostPaise: number;
  baseRates: Array<{ scope: "sub_vendor"; ratePaise: number }>;
}

export interface PurchaseOrderModeStandardSuggestion {
  preview: PurchaseOrderModeStandardCostPreview | null;
  issues: PurchaseOrderModeIssue[];
}

export function suggestStandardSubVendorCost(input: {
  advanced: Record<string, unknown>;
  uom: { id: string; name: string; decimalScale: number };
  quantity: string;
  baseRateOverridePaise?: number | null;
}): PurchaseOrderModeStandardSuggestion {
  const unavailable = (code: string, message: string): PurchaseOrderModeStandardSuggestion => ({
    preview: null, issues: [{ code, message }]
  });
  // Match Configuration's scoped/legacy lookup, but validate only fields used by
  // this internal cost. Selling margins, markup and quantity slabs are irrelevant.
  const settings = !Object.hasOwn(input.advanced, "modeCalculations")
    ? input.advanced.modeCalculation
    : asObject(input.advanced.modeCalculations)?.sub_vendor;
  if (settings == null) return unavailable("CALCULATION_NOT_CONFIGURED",
    "No Sub-Vendor base rate is configured in this saved Configuration revision.");
  const scope = asObject(settings);
  if (!scope || !Number.isSafeInteger(scope.baseRatePaise) || (scope.baseRatePaise as number) < 0 ||
    typeof scope.lowQuantityLimit !== "string" ||
    (scope.impactBps !== undefined && (!Number.isSafeInteger(scope.impactBps) ||
      (scope.impactBps as number) < 0 || (scope.impactBps as number) > Number.MAX_SAFE_INTEGER - 10_000))) {
    return unavailable("INVALID_CALCULATION_SETTINGS", "The saved Sub-Vendor cost settings are invalid.");
  }
  let quantity: string;
  try {
    quantity = canonicalizeScaledDecimal(input.quantity, input.uom.decimalScale);
    if (parseScaledDecimal(quantity, input.uom.decimalScale) <= 0n) throw new Error("zero quantity");
  } catch {
    return unavailable("INVALID_QUANTITY", "The approved quantity must be positive and fit its UOM precision.");
  }
  try { parseScaledDecimal(scope.lowQuantityLimit, input.uom.decimalScale); }
  catch { return unavailable("INVALID_LOW_QUANTITY_PRECISION", "The saved low-quantity limit exceeds the approved UOM precision."); }
  try {
    const ratePaise = input.baseRateOverridePaise ?? scope.baseRatePaise as number;
    if (!Number.isSafeInteger(ratePaise) || ratePaise < 0 || ratePaise > MAX_FINANCE_AMOUNT_PAISE)
      return unavailable("INVALID_PROJECT_BASE_RATE", "The saved project Base amount is invalid.");
    const baseCostPaise = multiplyMoneyByQuantity(ratePaise, quantity, input.uom.decimalScale);
    const adjustedCostPaise = calculateKnowledgeModeBaseRate({ baseRatePaise: ratePaise,
      lowQuantityLimit: scope.lowQuantityLimit, impactBps: scope.impactBps as number | undefined,
      quantity, quantityScale: input.uom.decimalScale }, "inclusive").revisedAmountPaise;
    if (baseCostPaise > MAX_FINANCE_AMOUNT_PAISE || adjustedCostPaise > MAX_FINANCE_AMOUNT_PAISE) {
      return unavailable("AMOUNT_UNSUPPORTED", "The calculated Sub-Vendor cost exceeds the supported amount.");
    }
    return { preview: { mode: "sub_vendor", quantity, baseCostPaise, adjustedCostPaise,
      baseRates: [{ scope: "sub_vendor", ratePaise }] }, issues: [] };
  } catch {
    return unavailable("AMOUNT_UNSUPPORTED", "The saved Sub-Vendor cost cannot price this approved quantity.");
  }
}

/** Applies Configuration's existing mode formulas to one explicitly confirmed line quantity. */
export function analyzePurchaseOrderModeSettings(input: {
  advanced: Record<string, unknown>;
  quantityMargin?: Record<string, unknown>;
  uom: { id: string; name: string; decimalScale: number };
  mode?: PurchaseOrderModeKey | null;
  quantity?: string | null;
  discountBps?: number;
  markupBasis?: "starting" | "minimum";
}): PurchaseOrderModeSettingsAnalysis {
  const options: PurchaseOrderModeSettingsAnalysis["options"] = [];
  const availability: PurchaseOrderModeSettingsAnalysis["availability"] = [];
  const contexts = new Map<PurchaseOrderModeKey, KnowledgeConfigurationContext>();
  const selectors = [
    { key: "pmc", label: "PMC", modeKind: "pmc", executionSource: undefined },
    { key: "sub_vendor", label: "Sub-Vendor", modeKind: "execution", executionSource: "sub_vendor" },
    { key: "in_house", label: "In-house", modeKind: "execution", executionSource: "in_house" }
  ] as const;
  for (const selector of selectors) {
    const context = buildKnowledgeConfigurationContext({ advanced: input.advanced, uom: input.uom,
      modeKind: selector.modeKind, executionSource: selector.executionSource });
    contexts.set(selector.key, context);
    const validMargin = selector.key === "pmc" ? validPmcMargin(input.advanced.pmcMarginBps)
      : selector.key === "sub_vendor" ? validSubVendorMargin(input.advanced.subVendorMarginBps) : true;
    const available = context.state === "ready" && validMargin;
    availability.push({ key: selector.key, label: selector.label, available,
      issues: available ? [] : [
        ...context.issues.map((issue) => ({ code: issue.code, message: modeIssueMessage(issue.code) })),
        ...(!validMargin ? [{ code: selector.key === "pmc" ? "PMC_MARGIN_INVALID" : "SUB_VENDOR_MARGIN_INVALID",
          message: selector.key === "pmc" ? "The saved PMC margin must be between 10% and 20%."
            : "The saved Sub-Vendor margin must be between 0% and 95% in 5% steps." }] : [])
      ] });
    if (available) options.push({ key: selector.key, label: selector.label });
  }
  if (!input.mode || !input.quantity) return { options, availability, issues: [], preview: null };
  if (!options.some((option) => option.key === input.mode)) {
    return { options, availability, issues: [{ code: "MODE_NOT_CONFIGURED", message: "This mode is not valid in the saved Configuration revision." }], preview: null };
  }
  const selector = selectors.find((entry) => entry.key === input.mode)!;
  const context = buildKnowledgeConfigurationContext({ advanced: input.advanced, uom: input.uom,
    modeKind: selector.modeKind, executionSource: selector.executionSource, quantity: input.quantity });
  const issues = context.issues.map((issue) => ({ code: issue.code, message: modeIssueMessage(issue.code) }));
  if (issues.length) return { options, availability, issues, preview: null };
  let quantity: string;
  try {
    quantity = canonicalizeScaledDecimal(input.quantity, input.uom.decimalScale);
    if (parseScaledDecimal(quantity, input.uom.decimalScale) <= 0n) throw new Error("zero");
  } catch {
    return { options, availability, issues: [{ code: "INVALID_QUANTITY", message: "Enter a positive quantity within the approved UOM precision." }], preview: null };
  }
  const discountBps = input.discountBps ?? 0;
  const markupBasis = input.markupBasis ?? "starting";
  try {
    const rules = quantityRules(input.quantityMargin ?? {}, quantity, input.uom.decimalScale);
    const scopes = new Map(context.calculations.map((calculation) => [calculation.scope, calculation.settings]));
    if (input.mode === "pmc") {
      const settings = scopes.get("pmc")!;
      const result = calculateKnowledgePmcPrice({ ...settings!, quantity, quantityScale: input.uom.decimalScale,
        pmcMarginBps: input.advanced.pmcMarginBps as number, discountBps });
      return { options, availability, issues: [], preview: {
        formulaVersion: "mode-margin-v2", mode: input.mode, quantity, quantityScale: input.uom.decimalScale,
        baseCostPaise: result.baseAmountPaise, adjustedCostPaise: result.revisedAmountPaise,
        lowQuantityImpactPaise: result.lowQuantityImpactAmountPaise, appliedImpactBps: result.appliedImpactBps,
        sellingPaise: result.totalPaise, finalVendorChargesPaise: null, floorSellingPaise: result.revisedAmountPaise,
        marginBps: result.pmcMarginBps, discountBps, discountAmountPaise: result.discount?.amountPaise ?? 0,
        quantityRule: rules.slab, procurementQuantitySuggestion: rules.suggestion,
        settings: snapshotSettings(context, result.pmcMarginBps, markupBasis), components: []
      } };
    }
    if (input.mode === "sub_vendor") {
      const settings = scopes.get("sub_vendor")!;
      const result = calculateKnowledgeSubVendorPrice({ ...settings!, quantity, quantityScale: input.uom.decimalScale,
        subVendorMarginBps: input.advanced.subVendorMarginBps as number, discountBps });
      return { options, availability, issues: [], preview: {
        formulaVersion: "mode-margin-v2", mode: input.mode, quantity, quantityScale: input.uom.decimalScale,
        baseCostPaise: result.baseAmountPaise, adjustedCostPaise: result.revisedAmountPaise,
        lowQuantityImpactPaise: result.lowQuantityImpactAmountPaise, appliedImpactBps: result.appliedImpactBps,
        sellingPaise: result.totalPaise, finalVendorChargesPaise: result.finalVendorChargesPaise,
        floorSellingPaise: result.revisedAmountPaise,
        marginBps: result.subVendorMarginBps, discountBps, discountAmountPaise: result.discount?.amountPaise ?? 0,
        quantityRule: rules.slab, procurementQuantitySuggestion: rules.suggestion,
        settings: snapshotSettings(context, result.subVendorMarginBps, markupBasis), components: []
      } };
    }
    const labor = scopes.get("in_house_labor")!;
    const material = scopes.get("in_house_material")!;
    const result = calculateKnowledgeInHousePrice({ labor: labor!, material: material!, quantity,
      quantityScale: input.uom.decimalScale, markupBasis, discountBps });
    const adjustedCostPaise = safeSum(result.labor.revisedAmountPaise, result.material.revisedAmountPaise);
    const floorSellingPaise = safeSum(result.labor.floorPricePaise, result.material.floorPricePaise);
    const baseCostPaise = safeSum(
      baseAmount(labor!, quantity, input.uom.decimalScale),
      baseAmount(material!, quantity, input.uom.decimalScale)
    );
    return { options, availability, issues: [], preview: {
      formulaVersion: "mode-margin-v2", mode: input.mode, quantity, quantityScale: input.uom.decimalScale,
      baseCostPaise, adjustedCostPaise, lowQuantityImpactPaise: adjustedCostPaise - baseCostPaise,
      appliedImpactBps: null, sellingPaise: result.totalPaise, finalVendorChargesPaise: null,
      floorSellingPaise, marginBps: null,
      discountBps, discountAmountPaise: safeSum(result.labor.discount?.amountPaise ?? 0, result.material.discount?.amountPaise ?? 0),
      quantityRule: rules.slab, procurementQuantitySuggestion: rules.suggestion,
      settings: snapshotSettings(context, null, markupBasis),
      components: [
        { scope: "labor", adjustedCostPaise: result.labor.revisedAmountPaise, sellingPaise: result.labor.totalPaise, floorSellingPaise: result.labor.floorPricePaise },
        { scope: "material", adjustedCostPaise: result.material.revisedAmountPaise, sellingPaise: result.material.totalPaise, floorSellingPaise: result.material.floorPricePaise }
      ]
    } };
  } catch (error) {
    return { options, availability, issues: [{ code: "MODE_CALCULATION_INVALID", message: error instanceof Error ? error.message : "The saved mode cannot be calculated." }], preview: null };
  }
}

/** Replays the verified preview's frozen settings through the same Configuration calculators. */
export function buildPurchaseOrderModeCalculationStages(preview: PurchaseOrderModePreview): PurchaseOrderModeCalculationStage[] {
  const { quantity, quantityScale } = preview;
  const settings = new Map(preview.settings.scopes.map((row) => [row.scope, row]));
  let stages: PurchaseOrderModeCalculationStage[];
  if (preview.mode === "pmc") {
    const scope = settings.get("pmc");
    if (!scope || preview.settings.configuredMarginBps === null) throw new Error("The PMC preview has no frozen calculation settings.");
    const result = calculateKnowledgePmcPrice({ ...scope, quantity, quantityScale,
      pmcMarginBps: preview.settings.configuredMarginBps, discountBps: preview.discountBps });
    stages = [calculationStage("pmc", scope, quantity, quantityScale, {
      appliedImpactBps: result.appliedImpactBps, revisedUnitRatePaise: result.revisedUnitRatePaise,
      revisedAmountPaise: result.revisedAmountPaise, totalBeforeDiscountPaise: result.totalBeforeDiscountPaise,
      discountBasisPaise: result.pmcMarginAmountPaise, discountAmountPaise: result.discount?.amountPaise ?? 0,
      floorSellingPaise: result.revisedAmountPaise, totalPaise: result.totalPaise, marginBps: result.pmcMarginBps
    })];
  } else if (preview.mode === "sub_vendor") {
    const scope = settings.get("sub_vendor");
    if (!scope || preview.settings.configuredMarginBps === null) throw new Error("The Sub-Vendor preview has no frozen calculation settings.");
    const result = calculateKnowledgeSubVendorPrice({ ...scope, quantity, quantityScale,
      subVendorMarginBps: preview.settings.configuredMarginBps, discountBps: preview.discountBps });
    stages = [calculationStage("sub_vendor", scope, quantity, quantityScale, {
      appliedImpactBps: result.appliedImpactBps, revisedUnitRatePaise: result.revisedUnitRatePaise,
      revisedAmountPaise: result.revisedAmountPaise, totalBeforeDiscountPaise: result.totalBeforeDiscountPaise,
      discountBasisPaise: result.totalBeforeDiscountPaise, discountAmountPaise: result.discount?.amountPaise ?? 0,
      floorSellingPaise: null, totalPaise: result.totalPaise, marginBps: result.subVendorMarginBps
    })];
  } else {
    stages = (["in_house_labor", "in_house_material"] as const).map((name) => {
      const scope = settings.get(name);
      if (!scope) throw new Error("The In-house preview has incomplete frozen calculation settings.");
      const result = calculateKnowledgeModePrice({ ...scope, quantity, quantityScale,
        markupBasis: preview.settings.markupBasis, discountBps: preview.discountBps });
      return calculationStage(name, scope, quantity, quantityScale, {
        appliedImpactBps: result.appliedImpactBps, revisedUnitRatePaise: result.revisedUnitRatePaise,
        revisedAmountPaise: result.revisedAmountPaise, totalBeforeDiscountPaise: result.discount?.totalBeforeDiscountPaise ?? result.totalPaise,
        discountBasisPaise: result.discount?.totalBeforeDiscountPaise ?? result.totalPaise,
        discountAmountPaise: result.discount?.amountPaise ?? 0,
        floorSellingPaise: result.floorPricePaise, totalPaise: result.totalPaise,
        marginBps: preview.settings.markupBasis === "minimum" ? scope.minimumMarkupBps : scope.startingMarkupBps
      });
    });
  }
  if (stages.reduce((sum, row) => safeSum(sum, row.sellingPaise), 0) !== preview.sellingPaise ||
      stages.reduce((sum, row) => safeSum(sum, row.adjustedCostPaise), 0) !== preview.adjustedCostPaise ||
      stages.reduce((sum, row) => safeSum(sum, row.baseSubtotalPaise), 0) !== preview.baseCostPaise) {
    throw new Error("The mode preview stages do not reconcile to the configured calculation.");
  }
  return stages;
}

function calculationStage(
  scope: PurchaseOrderModeCalculationStage["scope"],
  settings: KnowledgeModeCalculationSettings,
  quantity: string,
  quantityScale: number,
  result: { appliedImpactBps: number; revisedUnitRatePaise: number; revisedAmountPaise: number;
    totalBeforeDiscountPaise: number; discountBasisPaise: number; discountAmountPaise: number;
    floorSellingPaise: number | null; totalPaise: number; marginBps: number }
): PurchaseOrderModeCalculationStage {
  const baseSubtotalPaise = baseAmount(settings, quantity, quantityScale);
  return {
    scope, baseRatePaise: settings.baseRatePaise, baseSubtotalPaise,
    lowQuantityLimit: settings.lowQuantityLimit, configuredImpactBps: settings.impactBps ?? KNOWLEDGE_LOW_QUANTITY_IMPACT_BPS,
    thresholdMet: parseScaledDecimal(quantity, quantityScale) <= parseScaledDecimal(settings.lowQuantityLimit, quantityScale),
    appliedImpactBps: result.appliedImpactBps, adjustedUnitRatePaise: result.revisedUnitRatePaise,
    adjustedCostPaise: result.revisedAmountPaise, lowQuantityImpactPaise: result.revisedAmountPaise - baseSubtotalPaise,
    marginBps: result.marginBps, marginAmountPaise: result.totalBeforeDiscountPaise - result.revisedAmountPaise,
    sellingBeforeDiscountPaise: result.totalBeforeDiscountPaise, discountBasisPaise: result.discountBasisPaise,
    discountAmountPaise: result.discountAmountPaise, floorSellingPaise: result.floorSellingPaise,
    sellingPaise: result.totalPaise
  };
}

function snapshotSettings(
  context: KnowledgeConfigurationContext,
  configuredMarginBps: number | null,
  markupBasis: "starting" | "minimum"
): PurchaseOrderModePreview["settings"] {
  return { configuredMarginBps, markupBasis, scopes: context.calculations.flatMap((calculation) =>
    calculation.settings ? [{ scope: calculation.scope, source: calculation.source,
      baseRatePaise: calculation.settings.baseRatePaise, lowQuantityLimit: calculation.settings.lowQuantityLimit,
      impactBps: calculation.settings.impactBps, minimumMarkupBps: calculation.settings.minimumMarkupBps,
      startingMarkupBps: calculation.settings.startingMarkupBps }] : []) };
}

function validPmcMargin(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1_000 && (value as number) <= 2_000;
}
function validSubVendorMargin(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 9_500 && (value as number) % 500 === 0;
}
function safeSum(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error("The calculated amount exceeds the supported value.");
  return result;
}
function baseAmount(settings: KnowledgeModeCalculationSettings, quantity: string, scale: number): number {
  return multiplyMoneyByQuantity(settings.baseRatePaise, quantity, scale);
}
function quantityRules(payload: Record<string, unknown>, quantity: string, scale: number): {
  slab: PurchaseOrderModePreview["quantityRule"]; suggestion: string | null;
} {
  const requested = parseScaledDecimal(quantity, scale);
  const slabs = Array.isArray(payload.quantitySlabs) ? payload.quantitySlabs : [];
  let slab: PurchaseOrderModePreview["quantityRule"] = null;
  for (const candidate of slabs) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const row = candidate as Record<string, unknown>;
    if (typeof row.minimumQuantity !== "string" || (row.maximumQuantity !== null && typeof row.maximumQuantity !== "string")) continue;
    const min = parseScaledDecimal(row.minimumQuantity, scale);
    const max = row.maximumQuantity === null ? null : parseScaledDecimal(row.maximumQuantity, scale);
    if (requested >= min && (max === null || requested < max)) {
      if (typeof row.id !== "string" || !Number.isSafeInteger(row.adjustmentBps)) throw new Error("The saved quantity slab is invalid.");
      slab = { slabId: row.id, minimumQuantity: row.minimumQuantity,
        maximumQuantity: row.maximumQuantity as string | null, adjustmentBps: row.adjustmentBps as number };
      break;
    }
  }
  if (slabs.length > 0 && slab === null && payload.gapBehavior === "reject") throw new Error("No saved quantity slab applies.");
  const wastage = payload.wastageBps;
  const suggestion = Number.isSafeInteger(wastage) && (wastage as number) >= 0
    ? calculateProcurementQuantity({ quantity, quantityScale: scale, wastageBps: wastage as number }) : null;
  return { slab, suggestion };
}
function modeIssueMessage(code: string): string {
  const messages: Record<string, string> = {
    CALCULATION_NOT_CONFIGURED: "No calculation is configured for this mode in the approved revision.",
    CONFLICTING_SCOPE_SELECTION: "The saved mode scope contains conflicting selections.",
    INVALID_QUANTITY_PRECISION: "The quantity exceeds the approved UOM precision.",
    INVALID_LOW_QUANTITY_PRECISION: "A saved low-quantity limit exceeds the approved UOM precision.",
    INVALID_CALCULATION_SETTINGS: "The saved calculation settings are invalid.",
    AMBIGUOUS_SHARED_SCOPE: "The saved mode scope is ambiguous.",
    INVALID_SHARED_SCOPE: "The saved mode scope is invalid."
  };
  return messages[code] ?? "The saved mode cannot be calculated.";
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
