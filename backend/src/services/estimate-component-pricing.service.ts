import { readInHouseUsagePolicy } from "../domain/in-house-usage-policy.js";
import { createHash } from "node:crypto";
import type { ClientSession } from "mongoose";
import { z } from "zod";
import { ESTIMATE_COMPONENT_PRICING_BASIS, estimateComponentLineAmountIsValid, readEstimateComponentPricing,
  type EstimateComponentPricing, type EstimateComponentPricingLine } from "../domain/estimate-component-pricing.js";
import { KNOWLEDGE_MODE_TIERS, projectKnowledgeModeTierSection, type KnowledgeModeTier } from "../domain/ai-estimator-knowledge-mode-tiers.js";
import { readInHouseComponents, selectedInHouseComponents, type KnowledgeInHouseComponent } from "../domain/ai-estimator-knowledge-in-house-components.js";
import { canonicalizeScaledDecimal } from "../domain/ai-estimator-knowledge-calculation.js";
import { calculateKnowledgeInHousePrice } from "../domain/ai-estimator-knowledge-mode-calculation.js";
import { ESTIMATE_DIMENSION_INPUT_UNITS, ESTIMATE_DIMENSION_QUANTITY_UNITS, readEstimateDimensionRule } from "../domain/estimate-dimensions.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { ApiError } from "../middleware/errors.js";
import { estimatorCatalogueTierPricing, type EstimatorCatalogueLine } from "./estimator-catalogue.service.js";

type Source = { line: EstimatorCatalogueLine; mainBasketName: string; subBasketName: string | null };
const id = z.string().trim().min(1).max(128);
export const estimateInHousePreviewSchema = z.object({ lines: z.array(z.object({
  key: z.string().min(1).max(500), mainLineId: id, roomId: id,
  pricingMode: z.literal("in_house"), rateSource: z.literal("configuration"), modeTier: z.enum(KNOWLEDGE_MODE_TIERS),
  selectedInHouseComponentIds: z.array(id).max(50).refine(ids => new Set(ids).size === ids.length).optional(),
  quantity: z.number().finite().nonnegative(), revisionId: id, itemVersion: z.number().int().positive().safe(),
  revisionVersion: z.number().int().positive().safe(), uomId: id,
  dimensions: z.object({ length: z.string().max(32), width: z.string().max(32), height: z.string().max(32) }).strict().optional(),
  expectedDimensionRule: z.object({ formula: z.literal("length_width"), inputUnit: z.enum(ESTIMATE_DIMENSION_INPUT_UNITS),
    quantityUnit: z.enum(ESTIMATE_DIMENSION_QUANTITY_UNITS), uomId: id, decimalScale: z.number().int().min(0).max(3)
  }).strict().refine(value => readEstimateDimensionRule(value) !== null).optional()
}).strict()).min(1).max(100).refine(lines => new Set(lines.map(line => line.key)).size === lines.length) }).strict();

const unavailable = () => new ApiError(409, "ESTIMATE_COMPONENT_PRICING_UNAVAILABLE", "Complete the selected In-house components before calculating this line.");

/** Private arithmetic boundary; only its selling evidence may leave the server. */
export function calculateEstimateComponentPricing(source: Source, modeTier: KnowledgeModeTier, quantity: number,
  selectedIds: unknown, configuration: readonly KnowledgeInHouseComponent[]): EstimateComponentPricing {
  selectedIds = resolveEstimateInHouseSelection(source, modeTier, selectedIds);
  const metadata = estimatorCatalogueTierPricing(source.line, modeTier)?.inHouseComponents;
  const selected = selectedInHouseComponents(configuration, selectedIds);
  const names = selectedInHouseComponents(metadata ?? null, selectedIds);
  if (!selected || !names || names.some(row => row.unavailableReason != null) || selected.some(row => !row.labor || !row.material)) throw unavailable();
  try {
    const canonicalQuantity = canonicalizeScaledDecimal(String(quantity), source.line.uom.decimalScale);
    if (Number(canonicalQuantity) <= 0) throw unavailable();
    const components = selected.map(component => {
      const name = names.find(row => row.id === component.id)!;
      if (name.basketId !== component.basketId || name.subBasketId !== component.subBasketId) throw unavailable();
      const result = calculateKnowledgeInHousePrice({ labor: component.labor!, material: component.material!,
        quantity: canonicalQuantity, quantityScale: source.line.uom.decimalScale, markupBasis: "starting" });
      return { id: component.id, basketId: component.basketId, subBasketId: component.subBasketId,
        basketName: name.basketName, subBasketName: name.subBasketName,
        laborSellingPaise: result.labor.totalPaise, materialSellingPaise: result.material.totalPaise, totalPaise: result.totalPaise };
    });
    const sum = components.reduce((total, row) => total + BigInt(row.totalPaise), 0n);
    if (sum > BigInt(Number.MAX_SAFE_INTEGER)) throw unavailable();
    const evidence = { formulaVersion: ESTIMATE_COMPONENT_PRICING_BASIS, mainLineId: source.line.mainLineId,
      revisionId: source.line.revisionId, sourceItemVersion: source.line.itemVersion, sourceRevisionVersion: source.line.revisionVersion,
      modeTier, quantity: canonicalQuantity, uom: source.line.uom,
      selectedComponentIds: selected.map(row => row.id), components, totalPaise: Number(sum) };
    const inputFingerprint = createHash("sha256").update(JSON.stringify({ ...evidence,
      ...(estimatorCatalogueTierPricing(source.line, modeTier)?.inHousePolicy ? { policy: estimatorCatalogueTierPricing(source.line, modeTier)!.inHousePolicy } : {}),
      settings: selected.map(row => ({ id: row.id, labor: row.labor, material: row.material })) })).digest("hex");
    const snapshot = readEstimateComponentPricing({ ...evidence, inputFingerprint });
    if (!snapshot) throw unavailable();
    return snapshot;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}

/** Current source has already been resolved by stable Main Line ID. This function performs no writes. */
export async function resolveEstimateComponentPricing(source: Source, modeTier: KnowledgeModeTier,
  quantity: number, selectedIds: unknown, session?: ClientSession): Promise<EstimateComponentPricing> {
  const components = await readCurrentEstimateComponentConfiguration(source, modeTier, session);
  return calculateEstimateComponentPricing(source, modeTier, quantity, selectedIds, components);
}

export async function readCurrentEstimateComponentConfiguration(source: Source, modeTier: KnowledgeModeTier,
  session?: ClientSession): Promise<KnowledgeInHouseComponent[]> {
  const raw = await AiEstimatorKnowledgeSectionModel.findOne({ mainLineId: source.line.mainLineId,
    revisionId: source.line.revisionId, sectionKey: "advanced" }).session(session ?? null).lean();
  if (!raw) throw unavailable();
  const section = projectKnowledgeModeTierSection(raw, modeTier);
  if (section.applicability !== "configured") throw unavailable();
  const policy = readInHouseUsagePolicy(section.payload);
  const expectedPolicy = estimatorCatalogueTierPricing(source.line, modeTier)?.inHousePolicy;
  if (policy.state === "legacy" ? expectedPolicy !== undefined : !expectedPolicy || JSON.stringify(policy) !== JSON.stringify(expectedPolicy)) {
    throw new ApiError(409, "ESTIMATE_CONFIGURATION_CHANGED", "Configuration changed. Refresh price.");
  }
  const components = readInHouseComponents(section.payload);
  if (!components) throw unavailable();
  return components;
}

export async function currentEstimateComponentPricingMatches(line: EstimateComponentPricingLine, source: Source,
  session?: ClientSession): Promise<boolean> {
  if (!estimateComponentLineAmountIsValid(line)) return false;
  try {
    const snapshot = await resolveEstimateComponentPricing(source, (line.modeTier ?? "signature") as KnowledgeModeTier,
      Number(line.quantity), line.selectedInHouseComponentIds, session);
    return snapshot.inputFingerprint === readEstimateComponentPricing(line.componentPricing)!.inputFingerprint;
  } catch { return false; }
}

/** New governed selections are server owned; legacy lines retain explicit component selection. */
export function resolveEstimateInHouseSelection(source: Source, modeTier: KnowledgeModeTier, supplied: unknown): unknown {
  const policy = estimatorCatalogueTierPricing(source.line, modeTier)?.inHousePolicy;
  if (!policy || policy.state === "legacy") return supplied;
  if (policy.state !== "ready") throw new ApiError(409, "ESTIMATE_IN_HOUSE_PRESET_UNAVAILABLE", "Complete the In-house price selection in Configuration.");
  if (supplied !== undefined && (!Array.isArray(supplied) || supplied.length !== policy.componentIds.length || new Set(supplied).size !== supplied.length || supplied.some(id => !policy.componentIds.includes(id)))) {
    throw new ApiError(409, "ESTIMATE_IN_HOUSE_PRESET_READ_ONLY", "The In-house price selection is managed in Configuration. Refresh price.");
  }
  return [...policy.componentIds];
}
