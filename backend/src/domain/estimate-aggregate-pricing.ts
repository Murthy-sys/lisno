/** Public selling total. Full component evidence stays in the internal pricing contract. */
export interface EstimateAggregatePricing {
  visibility: "aggregate";
  formulaVersion: "in_house_components_v1";
  mainLineId: string;
  revisionId: string;
  sourceItemVersion: number;
  sourceRevisionVersion: number;
  modeTier: "signature" | "premium" | "functional";
  quantity: string;
  uom: { id: string; code: string; name: string; decimalScale: number };
  totalPaise: number;
  inputFingerprint: string;
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
export function toEstimateAggregatePricing(pricing: Omit<EstimateAggregatePricing, "visibility">): EstimateAggregatePricing {
  return { visibility: "aggregate", formulaVersion: pricing.formulaVersion, mainLineId: pricing.mainLineId,
    revisionId: pricing.revisionId, sourceItemVersion: pricing.sourceItemVersion, sourceRevisionVersion: pricing.sourceRevisionVersion,
    modeTier: pricing.modeTier, quantity: pricing.quantity, uom: { id: pricing.uom.id, code: pricing.uom.code, name: pricing.uom.name, decimalScale: pricing.uom.decimalScale }, totalPaise: pricing.totalPaise,
    inputFingerprint: pricing.inputFingerprint };
}
export function readEstimateAggregatePricing(value: unknown): EstimateAggregatePricing | null {
  const row = record(value);
  if (!row || !only(row, ["visibility", "formulaVersion", "mainLineId", "revisionId", "sourceItemVersion", "sourceRevisionVersion", "modeTier", "quantity", "uom", "totalPaise", "inputFingerprint"]) ||
    row.visibility !== "aggregate" || row.formulaVersion !== "in_house_components_v1" || !text(row.mainLineId) || !text(row.revisionId) ||
    !version(row.sourceItemVersion) || !version(row.sourceRevisionVersion) || !["signature", "premium", "functional"].includes(String(row.modeTier)) ||
    !money(row.totalPaise) || typeof row.inputFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(row.inputFingerprint)) return null;
  const uom = record(row.uom);
  if (!uom || !only(uom, ["id", "code", "name", "decimalScale"]) || !text(uom.id) || !text(uom.code) || !text(uom.name) ||
    !Number.isSafeInteger(uom.decimalScale) || Number(uom.decimalScale) < 0 || Number(uom.decimalScale) > 3 ||
    typeof row.quantity !== "string" || canonicalQuantity(row.quantity, Number(uom.decimalScale)) !== row.quantity) return null;
  return toEstimateAggregatePricing({ formulaVersion: row.formulaVersion, mainLineId: row.mainLineId, revisionId: row.revisionId,
    sourceItemVersion: row.sourceItemVersion, sourceRevisionVersion: row.sourceRevisionVersion,
    modeTier: row.modeTier as EstimateAggregatePricing["modeTier"], quantity: row.quantity,
    uom: { id: uom.id, code: uom.code, name: uom.name, decimalScale: Number(uom.decimalScale) },
    totalPaise: row.totalPaise, inputFingerprint: row.inputFingerprint });
}
/** Display/input match only. A server must independently resolve the preset and validate the fingerprint. */
export function estimateAggregatePricingMatchesLine(value: unknown): boolean {
  const line = record(value);
  const pricing = readEstimateAggregatePricing(line?.aggregatePricing);
  return !!line && !!pricing && line.source === "configuration" && line.pricingMode === "in_house" &&
    line.rateSource === "configuration" && line.pricingBasis === pricing.formulaVersion &&
    line.mainLineId === pricing.mainLineId && line.revisionId === pricing.revisionId &&
    (line.sourceItemVersion ?? line.itemVersion) === pricing.sourceItemVersion &&
    (line.sourceRevisionVersion ?? line.revisionVersion) === pricing.sourceRevisionVersion &&
    (line.modeTier ?? "signature") === pricing.modeTier && canonicalQuantity(line.quantity, pricing.uom.decimalScale) === pricing.quantity &&
    line.uomId === pricing.uom.id && line.uomDecimalScale === pricing.uom.decimalScale &&
    (line.uomCode === undefined || line.uomCode === pricing.uom.code);
}
export function estimateAggregateLineAmountIsValid(value: unknown): boolean {
  if (!estimateAggregatePricingMatchesLine(value)) return false;
  const line = record(value)!;
  const pricing = readEstimateAggregatePricing(line.aggregatePricing)!;
  return line.ratePaise === null && (line.rate === undefined || line.rate === null) &&
    line.amountPaise === pricing.totalPaise && (line.amount === undefined || line.amount === pricing.totalPaise / 100);
}
