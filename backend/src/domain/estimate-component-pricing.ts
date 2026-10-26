/** Selling-only evidence. Internal costs and margin rules never belong in this contract. */
export const ESTIMATE_COMPONENT_PRICING_BASIS = "in_house_components_v1" as const;
export interface EstimateComponentSellingAmount {
  id: string;
  basketId: string;
  subBasketId: string | null;
  basketName: string;
  subBasketName: string | null;
  laborSellingPaise: number;
  materialSellingPaise: number;
  totalPaise: number;
}
export interface EstimateComponentPricing {
  formulaVersion: typeof ESTIMATE_COMPONENT_PRICING_BASIS;
  mainLineId: string;
  revisionId: string;
  sourceItemVersion: number;
  sourceRevisionVersion: number;
  modeTier: "signature" | "premium" | "functional";
  quantity: string;
  uom: { id: string; code: string; name: string; decimalScale: number };
  selectedComponentIds: string[];
  components: EstimateComponentSellingAmount[];
  totalPaise: number;
  inputFingerprint: string;
}
export interface EstimateInHousePreviewLine {
  key: string;
  mainLineId: string;
  roomId: string;
  pricingMode: "in_house";
  rateSource: "configuration";
  modeTier: "signature" | "premium" | "functional";
  selectedInHouseComponentIds: string[];
  quantity: number;
  revisionId: string;
  itemVersion: number;
  revisionVersion: number;
  uomId: string;
  dimensions?: { length: string; width: string; height: string };
  expectedDimensionRule?: { formula: "length_width"; inputUnit: "ft" | "m" | "cm" | "mm" | "in" | "yd";
    quantityUnit: "sq_ft" | "sq_m" | "sq_cm" | "sq_mm" | "sq_in" | "sq_yd"; uomId: string; decimalScale: number };
}
export interface EstimateInHousePreviewResult {
  key: string;
  state: "ready" | "incomplete" | "conflict";
  componentPricing: EstimateComponentPricing | null;
  issues: Array<{ code: string; message: string }>;
}
export interface EstimateComponentPricingLine {
  source?: unknown;
  pricingMode?: unknown;
  rateSource?: unknown;
  pricingBasis?: unknown;
  componentPricing?: unknown;
  mainLineId?: unknown;
  revisionId?: unknown;
  sourceItemVersion?: unknown;
  sourceRevisionVersion?: unknown;
  itemVersion?: unknown;
  revisionVersion?: unknown;
  modeTier?: unknown;
  quantity?: unknown;
  uomId?: unknown;
  uomDecimalScale?: unknown;
  uomCode?: unknown;
  selectedInHouseComponentIds?: unknown;
  amountPaise?: unknown;
  amount?: unknown;
  ratePaise?: unknown;
  rate?: unknown;
}
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 500 && value.trim() === value;
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const version = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const only = (row: Record<string, unknown>, fields: readonly string[]) => Object.keys(row).every(key => fields.includes(key));
function canonicalQuantity(value: unknown, scale: number): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/u.exec(String(value));
  if (!match || (match[2]?.length ?? 0) > scale) return null;
  const units = BigInt(match[1]!) * 10n ** BigInt(scale) + BigInt((match[2] ?? "").padEnd(scale, "0") || "0");
  if (units <= 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const fraction = (match[2] ?? "").replace(/0+$/u, "");
  return `${match[1]}${fraction ? `.${fraction}` : ""}`;
}

export function readEstimateComponentPricing(value: unknown): EstimateComponentPricing | null {
  const row = record(value);
  if (!row || !only(row, ["formulaVersion", "mainLineId", "revisionId", "sourceItemVersion", "sourceRevisionVersion", "modeTier", "quantity", "uom", "selectedComponentIds", "components", "totalPaise", "inputFingerprint"]) ||
      row.formulaVersion !== ESTIMATE_COMPONENT_PRICING_BASIS || !text(row.mainLineId) || !text(row.revisionId) || !version(row.sourceItemVersion) || !version(row.sourceRevisionVersion) ||
      !["signature", "premium", "functional"].includes(String(row.modeTier)) || !money(row.totalPaise) || typeof row.inputFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(row.inputFingerprint)) return null;
  const uom = record(row.uom);
  if (!uom || !only(uom, ["id", "code", "name", "decimalScale"]) || !text(uom.id) || !text(uom.code) || !text(uom.name) || !Number.isSafeInteger(uom.decimalScale) || Number(uom.decimalScale) < 0 || Number(uom.decimalScale) > 3 ||
      typeof row.quantity !== "string" || canonicalQuantity(row.quantity, Number(uom.decimalScale)) !== row.quantity) return null;
  const ids = row.selectedComponentIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 || !ids.every(text) || new Set(ids).size !== ids.length || !Array.isArray(row.components) || row.components.length !== ids.length) return null;
  const components: EstimateComponentSellingAmount[] = [];
  for (const value of row.components) {
    const item = record(value);
    if (!item || !only(item, ["id", "basketId", "subBasketId", "basketName", "subBasketName", "laborSellingPaise", "materialSellingPaise", "totalPaise"]) ||
        !text(item.id) || !text(item.basketId) || !text(item.basketName) || !(item.subBasketId === null || text(item.subBasketId)) ||
        !(item.subBasketId === null ? item.subBasketName === null : text(item.subBasketName)) || !money(item.laborSellingPaise) || !money(item.materialSellingPaise) || !money(item.totalPaise) ||
        BigInt(item.laborSellingPaise) + BigInt(item.materialSellingPaise) !== BigInt(item.totalPaise)) return null;
    components.push({ id: item.id, basketId: item.basketId, subBasketId: item.subBasketId as string | null, basketName: item.basketName,
      subBasketName: item.subBasketName as string | null, laborSellingPaise: item.laborSellingPaise, materialSellingPaise: item.materialSellingPaise, totalPaise: item.totalPaise });
  }
  if (new Set(components.map(item => item.id)).size !== ids.length || components.some(item => !ids.includes(item.id)) ||
      components.reduce((sum, item) => sum + BigInt(item.totalPaise), 0n) !== BigInt(row.totalPaise)) return null;
  return { formulaVersion: ESTIMATE_COMPONENT_PRICING_BASIS, mainLineId: row.mainLineId, revisionId: row.revisionId,
    sourceItemVersion: row.sourceItemVersion, sourceRevisionVersion: row.sourceRevisionVersion,
    modeTier: row.modeTier as EstimateComponentPricing["modeTier"], quantity: row.quantity,
    uom: { id: uom.id, code: uom.code, name: uom.name, decimalScale: Number(uom.decimalScale) },
    selectedComponentIds: [...ids], components, totalPaise: row.totalPaise, inputFingerprint: row.inputFingerprint };
}

/** Identity/current-input check; persistence callers must additionally validate exact amount parity. */
export function estimateComponentPricingMatchesLine(line: EstimateComponentPricingLine): boolean {
  const pricing = readEstimateComponentPricing(line.componentPricing);
  const ids = line.selectedInHouseComponentIds;
  return !!pricing && line.source === "configuration" && line.pricingMode === "in_house" && line.rateSource === "configuration" && line.pricingBasis === ESTIMATE_COMPONENT_PRICING_BASIS &&
    line.mainLineId === pricing.mainLineId && line.revisionId === pricing.revisionId &&
    (line.sourceItemVersion ?? line.itemVersion) === pricing.sourceItemVersion && (line.sourceRevisionVersion ?? line.revisionVersion) === pricing.sourceRevisionVersion &&
    (line.modeTier ?? "signature") === pricing.modeTier && canonicalQuantity(line.quantity, pricing.uom.decimalScale) === pricing.quantity &&
    line.uomId === pricing.uom.id && line.uomDecimalScale === pricing.uom.decimalScale && (line.uomCode === undefined || line.uomCode === pricing.uom.code) &&
    Array.isArray(ids) && ids.length === pricing.selectedComponentIds.length && new Set(ids).size === ids.length && ids.every(id => pricing.selectedComponentIds.includes(id));
}

/** Narrow exception to unit-rate completeness for validated, stored component amounts. */
export function estimateComponentLineAmountIsValid(line: EstimateComponentPricingLine): boolean {
  if (!estimateComponentPricingMatchesLine(line)) return false;
  const pricing = readEstimateComponentPricing(line.componentPricing)!;
  return line.ratePaise === null && (line.rate === undefined || line.rate === null) && line.amountPaise === pricing.totalPaise &&
    (line.amount === undefined || line.amount === pricing.totalPaise / 100);
}
