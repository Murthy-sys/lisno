import { createHash } from "node:crypto";
import type { ProjectPurchaseOrderPreparationDto, PurchaseOrderPreparationEstimateLine } from "./project-purchase-order-preparation.js";
import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";
import { DEFAULT_PROCUREMENT_BASKET_PROJECT_RATE, type ProcurementBasketProjectRate } from "./procurement-basket-base-rate.js";

export interface ProcurementBasketLineDto {
  sourceLineItemKey: string;
  roomId: string | null;
  roomName: string;
  subBasketId: string | null;
  subBasketName: string | null;
  mainLineId: string | null;
  mainLineName: string | null;
  approvedQuantity: string;
  approvedUnit: string;
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
  baseRates: Array<{ scope: "pmc" | "sub_vendor" | "in_house_labor" | "in_house_material"; ratePaise: number }>;
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
  projectId: string;
  estimateSource: ProjectPurchaseOrderPreparationDto["estimateSource"];
  preparationDigest: string;
  lines: ProcurementBasketLineDto[];
}

/** The approved preparation is the only estimate source. Modes are internal benchmarks, never vendor payable amounts. */
export function projectProcurementBaskets(preparation: ProjectPurchaseOrderPreparationDto,
  committedBySourceLine: ReadonlyMap<string, number> = new Map()): ProcurementBasketDetailDto[] {
  const groups = new Map<string, { name: string; classification: "standard" | "special";
    automaticSubVendor: boolean;
    lines: PurchaseOrderPreparationEstimateLine[] }>();
  for (const line of preparation.estimateLines) {
    const id = line.mainBasketId ?? `legacy:${line.key}`;
    const classification = line.mainBasketClassification ?? "standard";
    const automaticSubVendor = classification === "standard" && line.mainBasketClassificationExplicit === true;
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
    const ready = included.filter(line => line.mode?.state === "ready" && line.mode.preview !== null);
    const baseCostPaise = safeSum(ready.map(line => line.mode!.preview!.baseCostPaise));
    const adjustedCostPaise = safeSum(ready.map(line => line.mode!.preview!.adjustedCostPaise));
    const workingTotalPaise = safeSum(ready.map(line => line.mode!.preview!.sellingPaise));
    const workingTotalComplete = included.length > 0 && ready.length === included.length;
    const state: ProcurementBasketSummaryDto["state"] = included.length === 0 ? "unavailable" : workingTotalComplete ? "ready" : "partial";
    const lines: ProcurementBasketLineDto[] = group.lines.map(line => {
      const standardCost = standardLineCosts.get(line.key) ?? null;
      return {
        sourceLineItemKey: line.key, roomId: line.roomId, roomName: line.roomName,
        subBasketId: line.subBasketId, subBasketName: line.subBasketName,
        mainLineId: line.mainLineId, mainLineName: line.mainLineName,
        approvedQuantity: line.quantity, approvedUnit: line.unit,
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
      lines: group.lines.map(line => ({
        sourceLineItemKey: line.key, included: line.included, source: line.source,
        itemType: line.itemType ?? null, roomId: line.roomId, roomName: line.roomName,
        mainBasketId: line.mainBasketId, mainBasketName: line.mainBasketName,
        subBasketId: line.subBasketId, subBasketName: line.subBasketName,
        mainLineId: line.mainLineId, mainLineName: line.mainLineName,
        approvedQuantity: line.quantity, approvedUnit: line.unit, approvedAmountPaise: line.amountPaise,
        ...(group.automaticSubVendor ? { standardPriceBasis: {
          projectRate: line.projectRate ?? DEFAULT_PROCUREMENT_BASKET_PROJECT_RATE,
          revisionId: line.mode?.revision?.id ?? null,
          revisionStatus: line.mode?.revision?.status ?? null,
          activatedDigest: line.mode?.revision?.contentDigest ?? null,
          observedDigest: line.mode?.integrity?.observedDigest ?? null,
          uom: line.mode?.uom ?? null,
          cost: standardLineCosts.get(line.key) ? {
            state: standardLineCosts.get(line.key)!.state,
            calculationQuantity: standardLineCosts.get(line.key)!.calculationQuantity,
            baseRates: standardLineCosts.get(line.key)!.baseRates,
            baseCostPaise: standardLineCosts.get(line.key)!.baseCostPaise,
            adjustedCostPaise: standardLineCosts.get(line.key)!.adjustedCostPaise
          } : null
        } } : { mode: line.mode ? { state: line.mode.state, decision: line.mode.decision ?? null,
          revision: line.mode.revision ?? null, uom: line.mode.uom ?? null,
          preview: line.mode.preview ?? null, integrity: line.mode.integrity ?? null } : null })
      })).sort((left, right) => left.sourceLineItemKey.localeCompare(right.sourceLineItemKey))
    })).digest("hex");
    return {
      id, name: group.name, classification: group.classification, automaticSubVendor: group.automaticSubVendor,
      boqReady, standardCost, projectId: preparation.projectId,
      estimateSource: preparation.estimateSource, preparationDigest,
      includedLineCount: included.length, readyLineCount: ready.length,
      approvedEstimatePaise: safeSum(included.map(line => line.amountPaise!)),
      baseCostPaise, adjustedCostPaise, workingTotalPaise, workingTotalComplete,
      committedNetPaise: safeSum(group.lines.map(line => committedBySourceLine.get(line.key) ?? 0)),
      state, lines
    };
  }).sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function projectBaseUnitRate(line: PurchaseOrderPreparationEstimateLine,
  standardCost: ProcurementBasketLineStandardCostDto | null): number | null {
  if (!line.included || line.amountPaise === null || line.amountPaise <= 0) return null;
  const rates = standardCost !== null ? standardCost.baseRates.map(row => row.ratePaise)
    : line.mode?.state === "ready" && line.mode.preview
      ? line.mode.preview.settings.scopes.map(row => row.baseRatePaise) : [];
  return rates.length ? safeSum(rates) : null;
}

function projectStandardLineCost(line: PurchaseOrderPreparationEstimateLine,
  automaticSubVendor: boolean): ProcurementBasketLineStandardCostDto | null {
  if (!line.included || line.amountPaise === null || line.amountPaise <= 0) return null;
  const mode = line.mode;
  const savedPreview = !automaticSubVendor && mode?.state === "ready" && mode.decision ? mode.preview : null;
  const suggestedPreview = automaticSubVendor || !mode?.decision ? line.standardSuggestion?.preview : null;
  if (savedPreview) return {
    state: "saved", mode: savedPreview.mode, calculationQuantity: savedPreview.quantity,
    baseRates: savedPreview.settings.scopes.map(row => ({ scope: row.scope, ratePaise: row.baseRatePaise })),
    baseCostPaise: savedPreview.baseCostPaise, adjustedCostPaise: savedPreview.adjustedCostPaise, issues: []
  };
  if (suggestedPreview) return {
    state: mode?.integrity?.status === "mismatch" ? "observed_unverified" : "suggested",
    mode: suggestedPreview.mode, calculationQuantity: suggestedPreview.quantity,
    baseRates: suggestedPreview.baseRates,
    baseCostPaise: suggestedPreview.baseCostPaise, adjustedCostPaise: suggestedPreview.adjustedCostPaise,
    issues: [...(line.standardSuggestion?.issues ?? [])]
  };
  return {
    state: "unavailable", mode: automaticSubVendor ? "sub_vendor" : mode?.decision?.mode ?? null,
    calculationQuantity: automaticSubVendor ? line.quantity : mode?.decision?.quantity ?? null, baseRates: [],
    baseCostPaise: null, adjustedCostPaise: null,
    issues: !automaticSubVendor && mode?.decision
      ? nonemptyIssues(mode?.issues, "SAVED_MODE_UNAVAILABLE", "The saved mode cannot be priced from its pinned Configuration revision.")
      : nonemptyIssues(line.standardSuggestion?.issues ?? mode?.issues,
        "SUB_VENDOR_COST_UNAVAILABLE", "The saved Sub-Vendor settings cannot price this approved line.")
  };
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
  if (!basket.automaticSubVendor) return mode.state === "ready" && mode.preview !== null &&
    (mode.revision?.status === "active" || mode.revision?.status === "superseded");
  return procurementBasketLineStandardCostCalculable(basket, line) &&
    (mode.revision?.status === "active" || mode.revision?.status === "superseded");
}

/** A draft-only item can have a valid internal cost before its revision is orderable. */
export function procurementBasketLineStandardCostCalculable(
  basket: Pick<ProcurementBasketSummaryDto, "automaticSubVendor">,
  line: ProcurementBasketLineDto): boolean {
  if (!basket.automaticSubVendor || !isActionableBasketLine(line)) return false;
  const mode = line.mode;
  if (!mode?.uom || !mode.uom.id || !mode.uom.code ||
    !Number.isSafeInteger(mode.uom.decimalScale) || mode.uom.decimalScale < 0 || mode.uom.decimalScale > 3) return false;
  const cost = line.standardCost;
  const rate = cost?.baseRates[0];
  return line.source === "configuration" && Boolean(mode.revision?.id) &&
    (mode.revision?.status === "draft" || mode.revision?.status === "active" || mode.revision?.status === "superseded") &&
    typeof mode.revision?.contentDigest === "string" && /^[a-f0-9]{64}$/u.test(mode.revision.contentDigest) &&
    (cost?.state === "suggested" || cost?.state === "observed_unverified") &&
    cost.mode === "sub_vendor" && cost.calculationQuantity === line.approvedQuantity &&
    cost.baseRates.length === 1 && rate?.scope === "sub_vendor" &&
    Number.isSafeInteger(rate.ratePaise) && rate.ratePaise >= 0 &&
    line.baseUnitRatePaise === rate.ratePaise &&
    Number.isSafeInteger(cost.baseCostPaise) && cost.baseCostPaise! >= 0 &&
    Number.isSafeInteger(cost.adjustedCostPaise) && cost.adjustedCostPaise! >= cost.baseCostPaise! &&
    (cost.state !== "observed_unverified" || (mode.integrity?.status === "mismatch" &&
      mode.integrity.activatedDigest === mode.revision.contentDigest &&
      /^[a-f0-9]{64}$/u.test(mode.integrity.observedDigest)));
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
