import { createHash } from "node:crypto";
import { procurementModeMatchesPolicy } from "./procurement-execution-policy.js";
import type { ProjectPurchaseOrderPreparationDto, PurchaseOrderPreparationEstimateLine } from "./project-purchase-order-preparation.js";
import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";
import { DEFAULT_PROCUREMENT_BASKET_PROJECT_RATE, type ProcurementBasketProjectRate } from "./procurement-basket-base-rate.js";
import type { ProcurementEstimateMode } from "./procurement-basket-mode-groups.js";
import { projectInHouseComponentBreakdown, type ProcurementInHouseComponentBreakdown, type ProcurementComponentTargetNames } from "./procurement-in-house-components.js";
import { projectProcurementModeResolution } from "./procurement-in-house-visibility.js";

export interface ProcurementBasketLineDto {
  estimateMode?: ProcurementEstimateMode;
  sourceLineItemKey: string;
  roomId: string | null;
  roomName: string;
  subBasketId: string | null;
  subBasketName: string | null;
  mainLineId: string | null;
  mainLineName: string | null;
  approvedQuantity: string;
  approvedUnit: string;
  specification?: string;
  approvedAmountPaise: number | null;
  included: boolean;
  source: PurchaseOrderPreparationEstimateLine["source"];
  mode: PurchaseOrderPreparationEstimateLine["mode"];
  baseUnitRatePaise: number | null;
  projectRate: ProcurementBasketProjectRate;
  standardCost: ProcurementBasketLineStandardCostDto | null;
}

export interface ProcurementBasketLineStandardCostDto {
  state: "suggested" | "observed_unverified" | "saved" | "unavailable";
  mode: "pmc" | "sub_vendor" | "in_house" | null;
  calculationQuantity: string | null;
  baseRates: Array<{ componentId?: string; componentBasketId?: string; componentSubBasketId?: string | null; scope: "pmc" | "sub_vendor" | "in_house_labor" | "in_house_material"; ratePaise: number }>;
  baseCostPaise: number | null;
  adjustedCostPaise: number | null;
  issues: Array<{ code: string; message: string }>;
}

export interface ProcurementBasketStandardCostDto {
  totalPaise: number | null;
  complete: boolean;
  provisional: boolean;
  pricedLineCount: number;
}

export interface ProcurementBasketSummaryDto {
  id: string;
  name: string;
  classification: "standard" | "special";
  automaticSubVendor: boolean;
  boqReady: boolean;
  standardCost: ProcurementBasketStandardCostDto | null;
  includedLineCount: number;
  readyLineCount: number;
  approvedEstimatePaise: number;
  baseCostPaise: number;
  adjustedCostPaise: number;
  workingTotalPaise: number;
  workingTotalComplete: boolean;
  committedNetPaise: number;
  state: "ready" | "partial" | "unavailable";
}

export interface ProcurementBasketDetailDto extends ProcurementBasketSummaryDto {
  inHouseComponentBreakdown?: ProcurementInHouseComponentBreakdown;
  projectId: string;
  estimateSource: ProjectPurchaseOrderPreparationDto["estimateSource"];
  preparationSource?: ProjectPurchaseOrderPreparationDto["preparationSource"];
  preparationDigest: string;
  lines: ProcurementBasketLineDto[];
}

/** Keep the unredacted projection available for BOQ/commercial calculations, redact only its response. */
export function projectProcurementBasketDetail(basket: ProcurementBasketDetailDto): ProcurementBasketDetailDto {
  const { inHouseComponentBreakdown, ...base } = basket;
  const visibleBreakdown = inHouseComponentBreakdown && !(inHouseComponentBreakdown.visibleComponentsOnly &&
    inHouseComponentBreakdown.complete && inHouseComponentBreakdown.subBaskets.length === 0) ? inHouseComponentBreakdown : undefined;
  return { ...base, ...(visibleBreakdown ? { inHouseComponentBreakdown: visibleBreakdown } : {}), lines: basket.lines.map(line => {
    if (line.mode?.inHouseComponentVisibility !== "hidden") return line;
    return { ...line, mode: projectProcurementModeResolution(line.mode),
      standardCost: line.standardCost?.mode === "in_house" ? { ...line.standardCost, baseRates: [] } : line.standardCost };
  }) };
}

/** The approved preparation is the only estimate source. Modes are internal benchmarks, never vendor payable amounts. */
export function projectProcurementBaskets(preparation: ProjectPurchaseOrderPreparationDto,
  committedBySourceLine: ReadonlyMap<string, number> = new Map(),
  componentTargetNames: ProcurementComponentTargetNames = new Map()): ProcurementBasketDetailDto[] {
  const groups = new Map<string, { name: string; classification: "standard" | "special";
    automaticSubVendor: boolean;
    lines: PurchaseOrderPreparationEstimateLine[] }>();
  for (const line of preparation.estimateLines) {
    const id = line.mainBasketId ?? `legacy:${line.key}`;
    const classification = line.mainBasketClassification ?? "standard";
    const automaticSubVendor = false;
    const group = groups.get(id) ?? { name: line.mainBasketName?.trim() || "Unassigned basket",
      classification, automaticSubVendor, lines: [] };
    if (group.classification !== classification || group.automaticSubVendor !== automaticSubVendor)
      throw new Error("Approved Main Basket classification is inconsistent.");
    group.lines.push(line);
    groups.set(id, group);
  }
  return [...groups.entries()].map(([id, group]) => {
    const included = group.lines.filter(line => line.included && line.amountPaise !== null && line.amountPaise > 0);
    const standardLineCosts = new Map(group.lines.map(line => [line.key,
      group.classification === "standard" ? projectStandardLineCost(line, group.automaticSubVendor) : null]));
    const priced = included.map(line => standardLineCosts.get(line.key)).filter(
      (cost): cost is ProcurementBasketLineStandardCostDto & { adjustedCostPaise: number } =>
        cost !== null && cost !== undefined && cost.adjustedCostPaise !== null);
    const standardComplete = included.length > 0 && priced.length === included.length;
    const standardCost: ProcurementBasketStandardCostDto | null = group.classification === "standard" ? {
      totalPaise: standardComplete ? safeSum(priced.map(cost => cost.adjustedCostPaise)) : null,
      complete: standardComplete,
      provisional: priced.some(cost => cost.state === "suggested" || cost.state === "observed_unverified"),
      pricedLineCount: priced.length
    } : null;
    const ready = included.filter(line => procurementBasketModeCostReady(line.mode));
    const baseCostPaise = safeSum(ready.map(line => line.mode!.preview!.baseCostPaise));
    const adjustedCostPaise = safeSum(ready.map(line => line.mode!.preview!.adjustedCostPaise));
    const workingTotalPaise = safeSum(ready.map(line => line.mode!.preview!.sellingPaise));
    const workingTotalComplete = included.length > 0 && ready.length === included.length;
    const state: ProcurementBasketSummaryDto["state"] = included.length === 0 ? "unavailable" : workingTotalComplete ? "ready" : "partial";
    const lines: ProcurementBasketLineDto[] = group.lines.map(line => {
      const standardCost = standardLineCosts.get(line.key) ?? null;
      return {
        sourceLineItemKey: line.key, roomId: line.roomId, roomName: line.roomName,
        ...(line.estimateMode ? { estimateMode: line.estimateMode } : {}),
        subBasketId: line.subBasketId, subBasketName: line.subBasketName,
        mainLineId: line.mainLineId, mainLineName: line.mainLineName,
        approvedQuantity: line.quantity, approvedUnit: line.unit,
        ...(line.specification === undefined ? {} : { specification: line.specification }),
        approvedAmountPaise: line.amountPaise, included: line.included, source: line.source, mode: line.mode,
        baseUnitRatePaise: projectBaseUnitRate(line, standardCost), standardCost,
        projectRate: line.projectRate ?? DEFAULT_PROCUREMENT_BASKET_PROJECT_RATE
      };
    });
    const boqReady = included.length > 0 && lines.filter(isActionableBasketLine)
      .every(line => procurementBasketLineBoqReady(group, line));
    // Purchase-order preparation also hashes project-wide commitments and child rows.
    // Tender links stay pinned to this basket's approved source and selected mode lineage.
    const preparationDigest = createHash("sha256").update(JSON.stringify({
      projectId: preparation.projectId, mainBasketId: id, estimateSource: preparation.estimateSource,
      ...(preparation.preparationSource ? { preparationSource: preparation.preparationSource } : {}),
      lines: group.lines.map(line => ({
        sourceLineItemKey: line.key, included: line.included, source: line.source,
        itemType: line.itemType ?? null, roomId: line.roomId, roomName: line.roomName,
        mainBasketId: line.mainBasketId, mainBasketName: line.mainBasketName,
        subBasketId: line.subBasketId, subBasketName: line.subBasketName,
        mainLineId: line.mainLineId, mainLineName: line.mainLineName,
        approvedQuantity: line.quantity, approvedUnit: line.unit,
        ...(line.specification === undefined ? {} : { specification: line.specification }), approvedAmountPaise: line.amountPaise,
        projectRate: line.projectRate ?? DEFAULT_PROCUREMENT_BASKET_PROJECT_RATE,
        mode: line.mode ? { state: line.mode.state, executionPolicy: line.mode.executionPolicy ?? null,
          decision: line.mode.decision ?? null, revision: line.mode.revision ?? null, uom: line.mode.uom ?? null,
          preview: line.mode.preview ?? null, integrity: line.mode.integrity ?? null } : null
      })).sort((left, right) => left.sourceLineItemKey.localeCompare(right.sourceLineItemKey))
    })).digest("hex");
    const componentCostLines = group.lines.filter(line => line.mode?.decision?.mode === "in_house");
    const inHouseComponentBreakdown = projectInHouseComponentBreakdown(componentCostLines, componentTargetNames);
    return {
      id, name: group.name, classification: group.classification, automaticSubVendor: group.automaticSubVendor,
      boqReady, standardCost, projectId: preparation.projectId,
      estimateSource: preparation.estimateSource, preparationDigest,
      ...(preparation.preparationSource ? { preparationSource: preparation.preparationSource } : {}),
      includedLineCount: included.length, readyLineCount: ready.length,
      approvedEstimatePaise: safeSum(included.map(line => line.amountPaise!)),
      baseCostPaise, adjustedCostPaise, workingTotalPaise, workingTotalComplete,
      committedNetPaise: safeSum(group.lines.map(line => committedBySourceLine.get(line.key) ?? 0)),
      state, lines, ...(inHouseComponentBreakdown ? { inHouseComponentBreakdown } : {})
    };
  }).sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function projectBaseUnitRate(line: PurchaseOrderPreparationEstimateLine,
  standardCost: ProcurementBasketLineStandardCostDto | null): number | null {
  if (!line.included || line.amountPaise === null || line.amountPaise <= 0) return null;
  const rates = standardCost !== null ? standardCost.baseRates.map(row => row.ratePaise)
    : procurementBasketModeCostReady(line.mode) && line.mode?.preview
      ? line.mode.preview.settings.scopes.map(row => row.baseRatePaise) : [];
  return rates.length ? safeSum(rates) : null;
}

/** Compatibility cost fields follow the saved Procurement decision, never the estimate default. */
function projectStandardLineCost(line: PurchaseOrderPreparationEstimateLine,
  _automaticSubVendor: boolean): ProcurementBasketLineStandardCostDto | null {
  if (!line.included || line.amountPaise === null || line.amountPaise <= 0) return null;
  const mode = line.mode;
  const preview = procurementBasketModeCostReady(mode) ? mode?.preview : null;
  if (preview) return {
    state: "saved", mode: preview.mode, calculationQuantity: preview.quantity,
    baseRates: preview.settings.scopes.map(row => ({ scope: row.scope, ratePaise: row.baseRatePaise,
      ...(row.componentId === undefined ? {} : { componentId: row.componentId,
        componentBasketId: row.componentBasketId, componentSubBasketId: row.componentSubBasketId }) })),
    baseCostPaise: preview.baseCostPaise, adjustedCostPaise: preview.adjustedCostPaise, issues: []
  };
  return { state: "unavailable", mode: mode?.decision?.mode ?? null,
    calculationQuantity: mode?.decision?.quantity ?? null, baseRates: [],
    baseCostPaise: null, adjustedCostPaise: null,
    issues: nonemptyIssues(mode?.issues, "SAVED_MODE_REQUIRED", "Confirm a valid saved Procurement mode for this line.") };
}

/** Internal cost needs an allowed, saved decision and its exact current preview. */
export function procurementBasketModeCostReady(mode: PurchaseOrderPreparationEstimateLine["mode"]): boolean {
  return Boolean(mode?.state === "ready" && mode.decision && mode.preview &&
    procurementModeMatchesPolicy(mode.executionPolicy, mode.decision.mode) &&
    mode.preview.mode === mode.decision.mode && mode.preview.quantity === mode.decision.quantity);
}

function isActionableBasketLine(line: ProcurementBasketLineDto): boolean {
  return line.included && line.approvedAmountPaise !== null && line.approvedAmountPaise > 0;
}

/** Shared eligibility for BOQ create/update/send and the frozen basket work-order issue. */
export function procurementBasketLineBoqReady(
  basket: Pick<ProcurementBasketSummaryDto, "automaticSubVendor">,
  line: ProcurementBasketLineDto): boolean {
  if (!isActionableBasketLine(line)) return false;
  const mode = line.mode;
  if (!mode?.uom || !mode.uom.id || !mode.uom.code ||
    !Number.isSafeInteger(mode.uom.decimalScale) || mode.uom.decimalScale < 0 || mode.uom.decimalScale > 3) return false;
  return procurementBasketModeCostReady(mode) &&
    (mode.revision?.status === "active" || mode.revision?.status === "superseded");
}

/** Project-only rates apply exclusively to a saved, allowed Sub-vendor calculation. */
export function procurementBasketLineStandardCostCalculable(
  _basket: Pick<ProcurementBasketSummaryDto, "automaticSubVendor">,
  line: ProcurementBasketLineDto): boolean {
  const mode = line.mode;
  if (!isActionableBasketLine(line) || line.source !== "configuration" || !procurementBasketModeCostReady(mode) ||
    mode?.decision?.mode !== "sub_vendor" || !mode.preview || !mode.uom?.id || !mode.uom.code ||
    !Number.isSafeInteger(mode.uom.decimalScale) || mode.uom.decimalScale < 0 || mode.uom.decimalScale > 3) return false;
  const preview = mode.preview;
  const rate = preview.settings.scopes[0];
  return Boolean(mode.revision?.id && typeof mode.revision.contentDigest === "string" &&
    /^[a-f0-9]{64}$/u.test(mode.revision.contentDigest) && preview.settings.scopes.length === 1 &&
    rate?.scope === "sub_vendor" && Number.isSafeInteger(rate.baseRatePaise) && rate.baseRatePaise >= 0 &&
    line.baseUnitRatePaise === rate.baseRatePaise && Number.isSafeInteger(preview.baseCostPaise) && preview.baseCostPaise >= 0 &&
    Number.isSafeInteger(preview.adjustedCostPaise) && preview.adjustedCostPaise >= preview.baseCostPaise);
}

function nonemptyIssues(issues: readonly { code: string; message: string }[] | undefined,
  code: string, message: string): Array<{ code: string; message: string }> {
  return issues?.length ? [...issues] : [{ code, message }];
}

function safeSum(values: readonly number[]): number {
  const result = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Invalid basket amount.");
    return sum + BigInt(value);
  }, 0n);
  if (result > BigInt(MAX_FINANCE_AMOUNT_PAISE)) throw new RangeError("Basket amount exceeds the supported range.");
  return Number(result);
}
