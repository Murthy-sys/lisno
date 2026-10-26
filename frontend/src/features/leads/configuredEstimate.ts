import { calculateDimensionQuantity, estimateDimensionRulesEqual, type EstimateDimensions, type EstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { EstimationCatalogue, EstimationCatalogueBasket, EstimationCatalogueMainLine, EstimationCatalogueSubBasket, EstimationCatalogueTemporaryItem, EstimationModeBaseRatesPaise, EstimationInHouseComponent, EstimationTierPricing } from "./estimationCatalogueApi";
import type { ConfiguredEstimateLine, EstimateClassification, EstimatePricingMode, EstimateRateSource } from "./leadsApi";

export interface ConfiguredEstimateRoom {
  id: string;
  label: string;
}

export interface ConfiguredLineDraft {
  key: string;
  persistedId?: string;
  roomId: string;
  roomName: string;
  catalogueId: string;
  mainBasketId: string;
  mainBasketName: string;
  itemType: "main_line" | "temporary";
  classification?: EstimateClassification;
  pricingMode?: EstimatePricingMode;
  modeTier?: KnowledgeModeTier;
  applicableTiers?: KnowledgeModeTier[];
  tierPricing?: Partial<Record<KnowledgeModeTier, EstimationTierPricing>>;
  selectedInHouseComponentIds?: string[];
  rateSource?: EstimateRateSource;
  subBasketId: string | null;
  subBasketName: string | null;
  mainLineId: string;
  recommendationSourceMainLineIds?: string[];
  mainLineName: string;
  estimateNotes?: string[];
  revisionId: string;
  itemStatus?: "draft" | "active" | "inactive";
  revisionStatus?: "draft" | "active";
  itemVersion?: number;
  revisionVersion?: number;
  sourceItemStatus?: "draft" | "active" | "inactive";
  sourceRevisionStatus?: "draft" | "active";
  sourceItemVersion?: number;
  sourceRevisionVersion?: number;
  uomId: string;
  uomName: string;
  uomDecimalScale: number;
  inHouseBaseRatePaise?: number | null;
  inHouseComponents?: EstimationInHouseComponent[];
  modeBaseRatesPaise?: EstimationModeBaseRatesPaise;
  dimensionsMandatory?: boolean;
  dimensionRule?: EstimateDimensionRule | null;
  dimensions?: EstimateDimensions;
  dimensionsNeedReview?: boolean;
  quantity: number;
  rateInput: string;
  included: boolean;
  sourceMissing: boolean;
  uomNeedsQuantityReview?: boolean;
  previousUomName?: string;
}

export function configuredLineKey(roomId: string, mainLineId: string): string {
  return JSON.stringify([roomId, mainLineId]);
}

export const estimatePricingModeLabels: Record<EstimatePricingMode, string> = {
  pmc: "PMC", sub_vendor: "Sub-Vendor", in_house: "In-house"
};

type TierPricingSource = Pick<ConfiguredLineDraft, "modeTier" | "applicableTiers" | "tierPricing" | "modeBaseRatesPaise" | "inHouseComponents">;

/** Only legacy Signature may read the pre-tier catalogue fields. */
export function configuredTierPricing(line: TierPricingSource, modeTier: KnowledgeModeTier = line.modeTier ?? "signature"): EstimationTierPricing | undefined {
  if (!(line.applicableTiers ?? ["signature"]).includes(modeTier)) return undefined;
  if (line.tierPricing !== undefined) return line.tierPricing[modeTier];
  if (modeTier !== "signature") return undefined;
  return { modeBaseRatesPaise: line.modeBaseRatesPaise ?? { pmc: null, sub_vendor: null, in_house: null }, inHouseComponents: line.inHouseComponents };
}

function withSelectedTierPricing(line: ConfiguredLineDraft): ConfiguredLineDraft {
  const pricing = configuredTierPricing(line);
  return { ...line, modeBaseRatesPaise: pricing?.modeBaseRatesPaise, inHouseComponents: pricing?.inHouseComponents,
    inHouseBaseRatePaise: pricing?.modeBaseRatesPaise.in_house ?? null };
}

export function configuredTierUnavailableReason(line: TierPricingSource, modeTier: KnowledgeModeTier, mode?: EstimatePricingMode): string | null {
  if (!(line.applicableTiers ?? ["signature"]).includes(modeTier)) return "Not applicable";
  const pricing = configuredTierPricing(line, modeTier);
  if (!pricing) return "Not configured";
  const available = (selectedMode: EstimatePricingMode) => selectedMode === "in_house" && pricing.inHouseComponents !== undefined
    ? pricing.inHouseComponents.some(component => !component.unavailableReason && typeof component.baseRatePaise === "number" && Number.isSafeInteger(component.baseRatePaise) && component.baseRatePaise >= 0)
    : typeof pricing.modeBaseRatesPaise[selectedMode] === "number" && Number.isSafeInteger(pricing.modeBaseRatesPaise[selectedMode]) && pricing.modeBaseRatesPaise[selectedMode]! >= 0;
  return (mode ? available(mode) : (["pmc", "sub_vendor", "in_house"] as const).some(available)) ? null : "Price not configured";
}

export function configuredModeBaseRate(line: TierPricingSource & Pick<ConfiguredLineDraft, "selectedInHouseComponentIds">, mode: EstimatePricingMode): number | null {
  const pricing = configuredTierPricing(line);
  if (!pricing) return null;
  if (mode === "in_house" && pricing.inHouseComponents !== undefined) {
    const selected = line.selectedInHouseComponentIds ?? [];
    if (!selected.length || new Set(selected).size !== selected.length) return null;
    let total = 0;
    for (const id of selected) {
      const matches = pricing.inHouseComponents.filter((component) => component.id === id);
      const rate = matches.length === 1 && !matches[0]!.unavailableReason ? matches[0]!.baseRatePaise : null;
      if (rate === null || !Number.isSafeInteger(rate) || rate < 0) return null;
      total += rate;
      if (!Number.isSafeInteger(total)) return null;
    }
    return total;
  }
  const rate = pricing.modeBaseRatesPaise[mode];
  return typeof rate === "number" && Number.isSafeInteger(rate) && rate >= 0 ? rate : null;
}

export function configuredInHouseSelectionIssue(line: Pick<ConfiguredLineDraft, "pricingMode" | "inHouseComponents" | "selectedInHouseComponentIds" | "modeBaseRatesPaise" | "rateSource" | "modeTier" | "tierPricing" | "applicableTiers">): string | null {
  if (line.pricingMode !== "in_house" || line.inHouseComponents === undefined) return null;
  if (!line.selectedInHouseComponentIds?.length) return "Choose at least one In-house component.";
  const selected = line.selectedInHouseComponentIds;
  if (new Set(selected).size !== selected.length || selected.some((id) => line.inHouseComponents!.filter((component) => component.id === id && !component.unavailableReason).length !== 1)) return "Review unavailable selected In-house components.";
  return line.rateSource === "configuration" && configuredModeBaseRate(line, "in_house") === null ? "Configure costs for the selected In-house components, or enter a manual rate." : null;
}

export function configuredDimensionsIssue(line: Pick<ConfiguredLineDraft, "dimensionsMandatory" | "dimensionRule" | "dimensions" | "dimensionsNeedReview">): string | null {
  if (!line.dimensionsMandatory) return null;
  if (!line.dimensionRule) return "Configure a matching area unit before entering dimensions.";
  if (line.dimensionsNeedReview) return "Review and confirm dimensions for the current measurement rule.";
  return calculateDimensionQuantity(line.dimensionRule, line.dimensions) ? null : "Enter valid length, width and height before saving.";
}

/** Only deliberate mode/type changes adopt a configured rate. Historical prices stay manual. */
export function updateConfiguredLinePricing(
  line: ConfiguredLineDraft,
  change: Partial<ConfiguredLineDraft>,
  inheritedClassification: EstimateClassification = "standard"
): ConfiguredLineDraft {
  if (line.dimensionsMandatory) {
    const measured = change.dimensions !== undefined || change.dimensionsNeedReview === false;
    const { quantity: _ignoredQuantity, ...rest } = change;
    change = { ...rest, ...(measured ? { quantity: calculateDimensionQuantity(line.dimensionRule, change.dimensions ?? line.dimensions)?.quantity ?? line.quantity } : {}) };
  }
  const classification = line.classification ?? inheritedClassification;
  const explicitTypeOrMode = change.classification !== undefined || change.pricingMode !== undefined;
  const tierChanged = change.modeTier !== undefined && change.modeTier !== (line.modeTier ?? "signature");
  const next = withSelectedTierPricing({ ...line, ...(explicitTypeOrMode ? { classification } : {}), ...change,
    ...(tierChanged ? { selectedInHouseComponentIds: [] } : {}) });
  if (tierChanged) {
    const pricingMode = next.pricingMode ?? (classification === "standard" ? "sub_vendor" : undefined);
    return { ...next, pricingMode, rateSource: "configuration", rateInput: formatRateInput(pricingMode ? configuredModeBaseRate(next, pricingMode) : null) };
  }
  const mode = change.classification === "standard" && classification === "special"
    ? "sub_vendor"
    : change.pricingMode !== undefined && change.pricingMode !== line.pricingMode ? change.pricingMode : undefined;
  if (mode) return { ...next, pricingMode: mode, rateSource: "configuration", rateInput: formatRateInput(configuredModeBaseRate(next, mode)) };
  if (change.selectedInHouseComponentIds !== undefined && next.pricingMode === "in_house" && next.rateSource === "configuration") {
    return { ...next, rateInput: formatRateInput(configuredModeBaseRate(next, "in_house")) };
  }
  if (change.rateInput !== undefined) return { ...next, rateSource: "manual" };
  return next;
}

export function deselectConfiguredRecommendationSources(
  lines: readonly ConfiguredLineDraft[],
  sourceKeys: ReadonlySet<string>
): ConfiguredLineDraft[] {
  let next = lines.map((line) => sourceKeys.has(line.key) && line.included
    ? { ...line, included: false, recommendationSourceMainLineIds: [] }
    : line);
  let changed = true;
  while (changed) {
    changed = false;
    const included = new Set(next.filter((line) => line.included).map((line) => line.key));
    next = next.map((line) => {
      if (!line.included || !line.recommendationSourceMainLineIds?.length) return line;
      const sources = line.recommendationSourceMainLineIds.filter((id) =>
        included.has(configuredLineKey(line.roomId, id)));
      if (sources.length === line.recommendationSourceMainLineIds.length) return line;
      changed = true;
      return { ...line, included: sources.length > 0, recommendationSourceMainLineIds: sources };
    });
  }
  return next;
}

export function formatRateInput(ratePaise: number | null): string {
  if (ratePaise === null) return "";
  const whole = Math.floor(ratePaise / 100);
  const fraction = ratePaise % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0").replace(/0$/u, "")}`;
}

export type ParsedRate =
  | { kind: "blank"; paise: null }
  | { kind: "invalid"; paise: null }
  | { kind: "value"; paise: number };

export function parseSellingRate(input: string): ParsedRate {
  const value = input.trim();
  if (!value) return { kind: "blank", paise: null };
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(value)) return { kind: "invalid", paise: null };
  const [rupees, fraction = ""] = value.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise)
    ? { kind: "value", paise }
    : { kind: "invalid", paise: null };
}

export function configuredLineAmountPaise(line: ConfiguredLineDraft): number | null {
  if (!line.included) return 0;
  return configuredLinePreviewAmountPaise(line);
}

export function configuredLinePreviewAmountPaise(line: ConfiguredLineDraft): number | null {
  if (line.uomNeedsQuantityReview || configuredDimensionsIssue(line)) return null;
  const rate = parseSellingRate(line.rateInput);
  if (rate.kind !== "value") return null;
  const units = configuredQuantityUnits(line.quantity, line.uomDecimalScale, true);
  if (units === null) return null;
  const divisor = BigInt(10 ** line.uomDecimalScale);
  const amount = (BigInt(rate.paise) * BigInt(units) + divisor / 2n) / divisor;
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

export function configuredQuantityUnits(quantity: number, decimalScale: number, included: boolean): number | null {
  if (!Number.isFinite(quantity) || quantity < 0 || (included && quantity === 0)) return null;
  const value = String(quantity);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimalScale) return null;
  const units = Number(whole) * 10 ** decimalScale + Number(fraction.padEnd(decimalScale, "0"));
  return Number.isSafeInteger(units) ? units : null;
}

export function restoreConfiguredLine(line: ConfiguredEstimateLine): ConfiguredLineDraft {
  return {
    key: configuredLineKey(line.roomId, line.mainLineId),
    persistedId: line.id,
    roomId: line.roomId,
    roomName: line.roomName,
    catalogueId: line.catalogueId,
    mainBasketId: line.mainBasketId,
    mainBasketName: line.mainBasketName,
    itemType: line.itemType ?? "main_line",
    classification: line.classification ?? "standard",
    pricingMode: line.pricingMode,
    modeTier: line.modeTier ?? "signature",
    selectedInHouseComponentIds: line.selectedInHouseComponentIds,
    rateSource: line.rateSource ?? "manual",
    subBasketId: line.subBasketId,
    subBasketName: line.subBasketName,
    mainLineId: line.mainLineId,
    recommendationSourceMainLineIds: line.recommendationSourceMainLineIds,
    mainLineName: line.mainLineName,
    estimateNotes: line.estimateNotes,
    revisionId: line.revisionId,
    sourceItemStatus: line.sourceItemStatus,
    sourceRevisionStatus: line.sourceRevisionStatus,
    sourceItemVersion: line.sourceItemVersion,
    sourceRevisionVersion: line.sourceRevisionVersion,
    uomId: line.uomId,
    uomName: line.uomName,
    uomDecimalScale: line.uomDecimalScale,
    dimensionsMandatory: line.dimensionsMandatory,
    dimensionRule: line.dimensionRule,
    dimensions: line.dimensions ? { ...line.dimensions } : undefined,
    dimensionsNeedReview: line.dimensionsNeedReview ?? line.configurationDimensionsChanged,
    quantity: line.quantity,
    rateInput: formatRateInput(line.ratePaise),
    included: line.included,
    sourceMissing: true,
    uomNeedsQuantityReview: line.configurationUomChanged === true,
    previousUomName: line.configurationUomChanged === true ? line.previousUomName ?? line.uomName : undefined
  };
}

function newLine(
  room: ConfiguredEstimateRoom,
  basket: EstimationCatalogueBasket,
  subBasket: EstimationCatalogueSubBasket | null,
  mainLine: EstimationCatalogueMainLine | EstimationCatalogueTemporaryItem
): ConfiguredLineDraft {
  const inHouseBaseRatePaise = typeof mainLine.inHouseBaseRatePaise === "number" &&
    Number.isSafeInteger(mainLine.inHouseBaseRatePaise) && mainLine.inHouseBaseRatePaise >= 0
    ? mainLine.inHouseBaseRatePaise : null;
  return withSelectedTierPricing({
    key: configuredLineKey(room.id, mainLine.mainLineId),
    roomId: room.id,
    roomName: room.label,
    catalogueId: mainLine.mainLineId,
    mainBasketId: basket.id,
    mainBasketName: basket.name,
    itemType: mainLine.itemType ?? "main_line",
    subBasketId: subBasket?.id ?? null,
    subBasketName: subBasket?.name ?? null,
    mainLineId: mainLine.mainLineId,
    mainLineName: mainLine.name,
    estimateNotes: mainLine.estimateNotes,
    revisionId: mainLine.revisionId,
    itemStatus: mainLine.itemStatus,
    revisionStatus: mainLine.revisionStatus,
    itemVersion: mainLine.itemVersion,
    revisionVersion: mainLine.revisionVersion,
    uomId: mainLine.uom.id,
    uomName: mainLine.uom.name,
    uomDecimalScale: mainLine.uom.decimalScale,
    modeTier: "signature",
    applicableTiers: mainLine.applicableTiers,
    tierPricing: mainLine.tierPricing,
    inHouseBaseRatePaise,
    inHouseComponents: mainLine.inHouseComponents,
    ...(mainLine.inHouseComponents !== undefined ? { selectedInHouseComponentIds: [] } : {}),
    modeBaseRatesPaise: mainLine.modeBaseRatesPaise,
    pricingMode: "sub_vendor",
    rateSource: "configuration",
    dimensionsMandatory: mainLine.dimensionsMandatory,
    dimensionRule: mainLine.dimensionRule,
    quantity: mainLine.dimensionsMandatory ? Number.NaN : 1,
    rateInput: formatRateInput(configuredModeBaseRate(mainLine, "sub_vendor")),
    included: false,
    sourceMissing: false
  });
}

export function buildConfiguredLines(
  catalogue: EstimationCatalogue,
  rooms: readonly ConfiguredEstimateRoom[],
  selectedMainBasketIds: ReadonlySet<string>,
  previous: readonly ConfiguredLineDraft[],
  preservePersisted = false
): ConfiguredLineDraft[] {
  const prior = new Map(previous.map((line) => [line.key, line]));
  const next = rooms.flatMap((room) => catalogue.items
    .filter((basket) => selectedMainBasketIds.has(basket.id))
    .flatMap((basket) => [
      ...(basket.directTemporaryItems ?? []).map((item) => newLine(room, basket, null, item)),
      ...basket.subBaskets.flatMap((subBasket) => [
        ...subBasket.mainLines.map((item) => newLine(room, basket, subBasket, item)),
        ...(subBasket.temporaryItems ?? []).map((item) => newLine(room, basket, subBasket, item))
      ])
    ].map((fresh) => {
      const saved = prior.get(fresh.key);
      if (!saved) return fresh;
      const selectedFresh = withSelectedTierPricing({ ...fresh, modeTier: saved.modeTier ?? "signature" });
      if (preservePersisted && saved.persistedId) return {
        ...saved,
        applicableTiers: fresh.applicableTiers,
        tierPricing: fresh.tierPricing,
        modeBaseRatesPaise: selectedFresh.modeBaseRatesPaise,
        inHouseBaseRatePaise: selectedFresh.inHouseBaseRatePaise,
        inHouseComponents: selectedFresh.inHouseComponents,
        sourceMissing: saved.mainBasketId !== fresh.mainBasketId ||
          saved.subBasketId !== fresh.subBasketId || saved.itemType !== fresh.itemType
      };
      const uomChanged = saved.uomId !== fresh.uomId || Boolean(fresh.dimensionsMandatory && saved.uomDecimalScale !== fresh.uomDecimalScale);
      const dimensionsNeedReview = Boolean(fresh.dimensionsMandatory && (saved.dimensionsNeedReview ||
        saved.dimensionsMandatory !== true || !estimateDimensionRulesEqual(saved.dimensionRule, fresh.dimensionRule)));
      const measuredQuantity = fresh.dimensionsMandatory && !dimensionsNeedReview
        ? calculateDimensionQuantity(fresh.dimensionRule, saved.dimensions)?.quantity : undefined;
      return {
        ...selectedFresh,
        persistedId: saved.persistedId,
        dimensions: saved.dimensions ? { ...saved.dimensions } : undefined,
        dimensionRule: fresh.dimensionsMandatory ? fresh.dimensionRule : saved.dimensions ? saved.dimensionRule ?? fresh.dimensionRule : fresh.dimensionRule,
        dimensionsNeedReview,
        quantity: measuredQuantity ?? saved.quantity,
        pricingMode: saved.pricingMode,
        selectedInHouseComponentIds: saved.selectedInHouseComponentIds,
        rateSource: saved.rateSource ?? "manual",
        rateInput: saved.rateSource === "configuration" && saved.pricingMode
          ? formatRateInput(configuredModeBaseRate({ ...selectedFresh, selectedInHouseComponentIds: saved.selectedInHouseComponentIds }, saved.pricingMode)) : saved.rateInput,
        included: saved.included,
        recommendationSourceMainLineIds: saved.recommendationSourceMainLineIds,
        classification: saved.classification,
        sourceItemStatus: fresh.itemStatus,
        sourceRevisionStatus: fresh.revisionStatus,
        sourceItemVersion: fresh.itemVersion,
        sourceRevisionVersion: fresh.revisionVersion,
        sourceMissing: saved.mainBasketId !== fresh.mainBasketId || saved.subBasketId !== fresh.subBasketId || saved.itemType !== fresh.itemType,
        uomNeedsQuantityReview: Boolean(saved.uomNeedsQuantityReview || uomChanged),
        previousUomName: uomChanged ? saved.uomName : saved.previousUomName
      };
    })));
  const seen = new Set(next.map((line) => line.key));
  const roomIds = new Set(rooms.map((room) => room.id));
  for (const line of previous) {
    if (!seen.has(line.key) && roomIds.has(line.roomId) && (line.persistedId || line.included ||
      line.classification !== undefined || line.rateSource === "manual" || line.quantity !== 1)) {
      next.push({ ...line, sourceMissing: true, modeBaseRatesPaise: undefined, tierPricing: {}, inHouseComponents: undefined,
        rateInput: !preservePersisted && line.rateSource === "configuration" ? "" : line.rateInput });
    }
  }
  return next;
}
