import { estimateDimensionRulesEqual, estimateLineDimensionsValid, type EstimateDimensions, type EstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";
// Native counterpart of the web configured estimate model; retain integer-paise pricing and source identities.
import type { EstimationCatalogue, EstimationCatalogueBasket, EstimationCatalogueMainLine, EstimationCatalogueSubBasket, EstimationCatalogueTemporaryItem, EstimationInHouseComponent, EstimationModeBaseRatesPaise } from "./catalogueTypes";
import type { ConfiguredEstimateLine, EstimateClassification, EstimateModeTier, EstimatePricingMode, EstimateRateSource } from "./types";

export interface ConfiguredEstimateRoom {
  id: string;
  label: string;
}

export interface ConfiguredLineDraft {
  key: string;
  persistedId?: string | undefined;
  roomId: string;
  roomName: string;
  catalogueId: string;
  mainBasketId: string;
  mainBasketName: string;
  itemType: "main_line" | "temporary";
  classification?: EstimateClassification | undefined;
  pricingMode?: EstimatePricingMode | undefined;
  modeTier?: EstimateModeTier | undefined;
  dimensionsMandatory?: boolean | undefined;
  dimensions?: EstimateDimensions | undefined;
  dimensionRule?: EstimateDimensionRule | null | undefined;
  nativeDimensionsNeedReview?: boolean | undefined;
  applicableTiers?: EstimateModeTier[] | undefined;
  nativeTierNeedsReview?: boolean | undefined;
  rateSource?: EstimateRateSource | undefined;
  subBasketId: string | null;
  subBasketName: string | null;
  mainLineId: string;
  recommendationSourceMainLineIds?: string[] | undefined;
  mainLineName: string;
  estimateNotes?: string[] | undefined;
  revisionId: string;
  itemStatus?: "draft" | "active" | "inactive" | undefined;
  revisionStatus?: "draft" | "active" | undefined;
  itemVersion?: number | undefined;
  revisionVersion?: number | undefined;
  sourceItemStatus?: "draft" | "active" | "inactive" | undefined;
  sourceRevisionStatus?: "draft" | "active" | undefined;
  sourceItemVersion?: number | undefined;
  sourceRevisionVersion?: number | undefined;
  uomId: string;
  uomName: string;
  uomDecimalScale: number;
  inHouseBaseRatePaise?: number | null | undefined;
  modeBaseRatesPaise?: EstimationModeBaseRatesPaise | undefined;
  inHouseComponents?: EstimationInHouseComponent[] | undefined;
  selectedInHouseComponentIds?: string[] | undefined;
  inHouseComponentsNeedReview?: boolean | undefined;
  quantity: number;
  rateInput: string;
  included: boolean;
  sourceMissing: boolean;
  uomNeedsQuantityReview?: boolean | undefined;
  previousUomName?: string | undefined;
}

export function configuredLineKey(roomId: string, mainLineId: string): string {
  return JSON.stringify([roomId, mainLineId]);
}

export const estimatePricingModeLabels: Record<EstimatePricingMode, string> = {
  pmc: "PMC", sub_vendor: "Sub-Vendor", in_house: "In-house"
};

export function configuredModeBaseRate(line: Pick<ConfiguredLineDraft, "modeBaseRatesPaise">, mode: EstimatePricingMode): number | null {
  const rate = line.modeBaseRatesPaise?.[mode];
  return typeof rate === "number" && Number.isSafeInteger(rate) && rate >= 0 ? rate : null;
}

export function hasNativeReadOnlyDimensionQuantity(line: ConfiguredLineDraft): boolean {
  return line.dimensionsMandatory === true || Boolean(line.nativeDimensionsNeedReview);
}

export function hasNativeReadOnlyTierPricing(line: ConfiguredLineDraft): boolean {
  return (line.modeTier ?? "signature") !== "signature" || Boolean(line.nativeTierNeedsReview);
}

export function hasNativeReadOnlyInHousePricing(line: ConfiguredLineDraft): boolean {
  return line.pricingMode === "in_house" && (line.inHouseComponents !== undefined || line.selectedInHouseComponentIds !== undefined);
}

/** Only deliberate mode/type changes adopt a configured rate. Historical prices stay manual. */
export function updateConfiguredLinePricing(
  line: ConfiguredLineDraft,
  change: Partial<ConfiguredLineDraft>,
  inheritedClassification: EstimateClassification = "standard"
): ConfiguredLineDraft {
  if (hasNativeReadOnlyDimensionQuantity(line) || hasNativeReadOnlyTierPricing(line) || hasNativeReadOnlyInHousePricing(line) || change.modeTier !== undefined && change.modeTier !== (line.modeTier ?? "signature") || change.pricingMode === "in_house" && line.inHouseComponents !== undefined) return line;
  const classification = line.classification ?? inheritedClassification;
  const explicitTypeOrMode = change.classification !== undefined || change.pricingMode !== undefined;
  const next = { ...line, ...(explicitTypeOrMode ? { classification } : {}), ...change };
  const mode = change.classification === "standard" && classification === "special"
    ? "sub_vendor"
    : change.pricingMode !== undefined && change.pricingMode !== line.pricingMode ? change.pricingMode : undefined;
  if (mode) return { ...next, pricingMode: mode, rateSource: "configuration", rateInput: formatRateInput(configuredModeBaseRate(line, mode)) };
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
  if (line.uomNeedsQuantityReview) return null;
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
    modeTier: line.modeTier,
    dimensionsMandatory: line.dimensionsMandatory,
    dimensions: line.dimensions ? { ...line.dimensions } : undefined,
    dimensionRule: line.dimensionRule ? { ...line.dimensionRule } : line.dimensionRule,
    nativeDimensionsNeedReview: line.configurationDimensionsChanged === true || line.included && !estimateLineDimensionsValid(line),
    nativeTierNeedsReview: line.configurationTierUnavailable === true,
    rateSource: line.rateSource ?? "manual",
    selectedInHouseComponentIds: line.selectedInHouseComponentIds?.slice(),
    subBasketId: line.subBasketId,
    subBasketName: line.subBasketName,
    mainLineId: line.mainLineId,
    recommendationSourceMainLineIds: line.recommendationSourceMainLineIds,
    mainLineName: line.mainLineName,
    estimateNotes: line.estimateNotes,
    revisionId: line.revisionId,
    itemVersion: line.itemVersion ?? line.sourceItemVersion,
    revisionVersion: line.revisionVersion ?? line.sourceRevisionVersion,
    sourceItemStatus: line.sourceItemStatus,
    sourceRevisionStatus: line.sourceRevisionStatus,
    sourceItemVersion: line.sourceItemVersion,
    sourceRevisionVersion: line.sourceRevisionVersion,
    uomId: line.uomId,
    uomName: line.uomName,
    uomDecimalScale: line.uomDecimalScale,
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
  return {
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
    applicableTiers: mainLine.applicableTiers,
    dimensionsMandatory: mainLine.dimensionsMandatory,
    dimensionRule: mainLine.dimensionRule,
    nativeDimensionsNeedReview: mainLine.dimensionsMandatory === true,
    nativeTierNeedsReview: mainLine.applicableTiers !== undefined && !mainLine.applicableTiers.includes("signature"),
    itemStatus: mainLine.itemStatus,
    revisionStatus: mainLine.revisionStatus,
    itemVersion: mainLine.itemVersion,
    revisionVersion: mainLine.revisionVersion,
    uomId: mainLine.uom.id,
    uomName: mainLine.uom.name,
    uomDecimalScale: mainLine.uom.decimalScale,
    inHouseBaseRatePaise,
    modeBaseRatesPaise: mainLine.modeBaseRatesPaise,
    inHouseComponents: mainLine.inHouseComponents,
    pricingMode: "sub_vendor",
    rateSource: "configuration",
    quantity: 1,
    rateInput: formatRateInput(configuredModeBaseRate(mainLine, "sub_vendor")),
    included: false,
    sourceMissing: false
  };
}

export function buildConfiguredLines(
  catalogue: EstimationCatalogue,
  rooms: readonly ConfiguredEstimateRoom[],
  selectedMainBasketIds: ReadonlySet<string>,
  previous: readonly ConfiguredLineDraft[],
  preservePersisted = false
): ConfiguredLineDraft[] {
  const prior = new Map(previous.map((line) => [line.key, line]));
  const next: ConfiguredLineDraft[] = rooms.flatMap((room) => catalogue.items
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
      // Dimension-owned quantities cannot be changed or rebased by this scalar-only native editor.
      if (saved.dimensionsMandatory === true || fresh.dimensionsMandatory === true) return {
        ...saved,
        nativeDimensionsNeedReview: Boolean(saved.nativeDimensionsNeedReview ||
          (saved.dimensionsMandatory === true) !== (fresh.dimensionsMandatory === true) ||
          !estimateDimensionRulesEqual(saved.dimensionRule, fresh.dimensionRule) ||
          saved.included && !estimateLineDimensionsValid(saved) ||
          saved.revisionId !== fresh.revisionId || saved.itemVersion !== fresh.itemVersion || saved.revisionVersion !== fresh.revisionVersion ||
          saved.uomId !== fresh.uomId || saved.uomDecimalScale !== fresh.uomDecimalScale),
        sourceMissing: saved.mainBasketId !== fresh.mainBasketId || saved.subBasketId !== fresh.subBasketId || saved.itemType !== fresh.itemType
      };
      // This native editor cannot select tiers. Keep its saved price and identity pins intact.
      if ((saved.modeTier ?? "signature") !== "signature") return {
        ...saved, applicableTiers: fresh.applicableTiers,
        nativeTierNeedsReview: Boolean(saved.nativeTierNeedsReview ||
          fresh.applicableTiers !== undefined && !fresh.applicableTiers.includes(saved.modeTier!) ||
          saved.revisionId !== fresh.revisionId || saved.itemVersion !== fresh.itemVersion || saved.revisionVersion !== fresh.revisionVersion ||
          saved.uomId !== fresh.uomId || saved.uomDecimalScale !== fresh.uomDecimalScale),
        sourceMissing: saved.mainBasketId !== fresh.mainBasketId || saved.subBasketId !== fresh.subBasketId || saved.itemType !== fresh.itemType
      };
      const componentPricing = saved.pricingMode === "in_house" && (fresh.inHouseComponents !== undefined || hasNativeReadOnlyInHousePricing(saved));
      if (preservePersisted && saved.persistedId || componentPricing) return {
        ...saved,
        nativeTierNeedsReview: fresh.nativeTierNeedsReview,
        modeBaseRatesPaise: fresh.modeBaseRatesPaise,
        inHouseBaseRatePaise: fresh.inHouseBaseRatePaise,
        inHouseComponents: fresh.inHouseComponents ?? saved.inHouseComponents,
        inHouseComponentsNeedReview: componentPricing && (!saved.selectedInHouseComponentIds?.length ||
          saved.revisionId !== fresh.revisionId || saved.itemVersion !== fresh.itemVersion || saved.revisionVersion !== fresh.revisionVersion ||
          saved.uomId !== fresh.uomId || saved.uomDecimalScale !== fresh.uomDecimalScale ||
          saved.selectedInHouseComponentIds.some(id => !fresh.inHouseComponents?.some(component => component.id === id && !component.unavailableReason && (saved.rateSource !== "configuration" || component.baseRatePaise !== null)))),
        sourceMissing: saved.mainBasketId !== fresh.mainBasketId ||
          saved.subBasketId !== fresh.subBasketId || saved.itemType !== fresh.itemType
      };
      const uomChanged = saved.uomId !== fresh.uomId || saved.uomDecimalScale !== fresh.uomDecimalScale;
      return {
        ...fresh,
        persistedId: saved.persistedId,
        quantity: saved.quantity,
        pricingMode: saved.pricingMode,
        modeTier: saved.modeTier,
        dimensionsMandatory: fresh.dimensionsMandatory ?? saved.dimensionsMandatory,
        dimensions: saved.dimensions,
        dimensionRule: saved.dimensions ? saved.dimensionRule : fresh.dimensionRule,
        nativeDimensionsNeedReview: saved.nativeDimensionsNeedReview,
        selectedInHouseComponentIds: saved.selectedInHouseComponentIds,
        rateSource: saved.rateSource ?? "manual",
        rateInput: saved.rateSource === "configuration" && saved.pricingMode
          ? formatRateInput(configuredModeBaseRate(fresh, saved.pricingMode)) : saved.rateInput,
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
      next.push({ ...line, sourceMissing: true, modeBaseRatesPaise: undefined,
        rateInput: !preservePersisted && !hasNativeReadOnlyDimensionQuantity(line) && !hasNativeReadOnlyTierPricing(line) && !hasNativeReadOnlyInHousePricing(line) && line.rateSource === "configuration" ? "" : line.rateInput });
    }
  }
  return next;
}
