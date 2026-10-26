import { MAX_FINANCE_AMOUNT_PAISE } from "./project-finance.js";
import type { PurchaseOrderPreparationEstimateLine } from "./project-purchase-order-preparation.js";

export interface ProcurementInHouseComponentBreakdown {
  complete: boolean;
  unavailableSourceLineItemKeys: string[];
  adjustedCostPaise: number | null;
  sellingPaise: number | null;
  subBaskets: Array<{
    basketId: string;
    basketName: string | null;
    subBasketId: string | null;
    subBasketName: string | null;
    adjustedCostPaise: number;
    sellingPaise: number;
    contributions: Array<{
      sourceLineItemKey: string;
      componentId: string;
      roomId: string | null;
      quantity: string;
      unit: string;
      laborAdjustedCostPaise: number;
      materialAdjustedCostPaise: number;
      laborSellingPaise: number;
      materialSellingPaise: number;
    }>;
  }>;
}
export type ProcurementComponentTargetNames = ReadonlyMap<string, { basketName: string | null; subBasketName: string | null }>;
type SubBasket = ProcurementInHouseComponentBreakdown["subBaskets"][number];
const id = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_FINANCE_AMOUNT_PAISE;
export const procurementComponentTargetKey = (basketId: string, subBasketId: string | null): string => JSON.stringify([basketId, subBasketId]);

export function isApprovedInHouseComponentSource(line: PurchaseOrderPreparationEstimateLine): boolean {
  const selection = line.estimateMode;
  // Match the existing actionable population used by basket and mode-group totals.
  return line.source === "configuration" && line.included && line.amountPaise !== null && line.amountPaise > 0 && selection?.provenance === "line" &&
    selection.mode === "in_house" && selection.approvedPricingMode === "in_house" && selection.issues.length === 0;
}

/** Component attribution is a read model, never a replacement for commercial source-line ownership. */
export function projectInHouseComponentBreakdown(lines: readonly PurchaseOrderPreparationEstimateLine[],
  names: ProcurementComponentTargetNames = new Map()): ProcurementInHouseComponentBreakdown | undefined {
  const contributions: SubBasket[] = [];
  const unavailable = new Set<string>();
  let applicable = false;
  for (const line of lines) {
    if (!isApprovedInHouseComponentSource(line)) continue;
    const mode = line.mode;
    // A later explicit Procurement mode keeps its existing behavior.
    if (mode?.decision?.mode && mode.decision.mode !== "in_house" || mode?.preview && mode.preview.mode !== "in_house") continue;
    const hasComponentEvidence = mode?.preview?.components?.some(row => row.componentId !== undefined) ?? false;
    if (line.selectedInHouseComponentIds === undefined && !hasComponentEvidence) continue;
    applicable = true;
    const selectedIds = line.selectedInHouseComponentIds;
    const preview = mode?.state === "ready" ? mode.preview : null;
    if (!money(line.amountPaise) || !selectedIds?.length || selectedIds.length > 50 || !selectedIds.every(id) || new Set(selectedIds).size !== selectedIds.length ||
      !preview || preview.mode !== "in_house" || !Array.isArray(preview.components) || !id(preview.quantity) ||
      !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(preview.quantity) || Number(preview.quantity) <= 0 ||
      !money(preview.adjustedCostPaise) || !money(preview.sellingPaise)) {
      unavailable.add(line.key);
      continue;
    }
    const pairs = new Map<string, { basketId: string; subBasketId: string | null;
      labor?: typeof preview.components[number]; material?: typeof preview.components[number] }>();
    let valid = true;
    for (const row of preview.components) {
      if (!id(row.componentId) || !selectedIds.includes(row.componentId) || !id(row.componentBasketId) ||
        !(row.componentSubBasketId === null || id(row.componentSubBasketId)) ||
        (row.componentSubBasketId === null && row.componentId !== "legacy-in-house") ||
        !(row.scope === "labor" || row.scope === "material") || !money(row.adjustedCostPaise) || !money(row.sellingPaise) || !money(row.floorSellingPaise)) {
        valid = false; break;
      }
      const pair = pairs.get(row.componentId) ?? { basketId: row.componentBasketId, subBasketId: row.componentSubBasketId };
      if (pair.basketId !== row.componentBasketId || pair.subBasketId !== row.componentSubBasketId || pair[row.scope]) { valid = false; break; }
      pair[row.scope] = row;
      pairs.set(row.componentId, pair);
    }
    if (!valid || pairs.size !== selectedIds.length || [...pairs.values()].some(pair => !pair.labor || !pair.material)) {
      unavailable.add(line.key); continue;
    }
    const cost = preview.components.reduce((sum, row) => sum + BigInt(row.adjustedCostPaise), 0n);
    const selling = preview.components.reduce((sum, row) => sum + BigInt(row.sellingPaise), 0n);
    if (cost !== BigInt(preview.adjustedCostPaise) || selling !== BigInt(preview.sellingPaise)) { unavailable.add(line.key); continue; }
    for (const [componentId, pair] of pairs) {
      const targetNames = names.get(procurementComponentTargetKey(pair.basketId, pair.subBasketId));
      contributions.push({ basketId: pair.basketId, subBasketId: pair.subBasketId,
        basketName: targetNames?.basketName ?? null, subBasketName: pair.subBasketId === null ? null : targetNames?.subBasketName ?? null,
        adjustedCostPaise: pair.labor!.adjustedCostPaise + pair.material!.adjustedCostPaise,
        sellingPaise: pair.labor!.sellingPaise + pair.material!.sellingPaise,
        contributions: [{ sourceLineItemKey: line.key, componentId, roomId: line.roomId, quantity: preview.quantity,
          unit: mode?.uom?.name ?? line.unit, laborAdjustedCostPaise: pair.labor!.adjustedCostPaise,
          materialAdjustedCostPaise: pair.material!.adjustedCostPaise, laborSellingPaise: pair.labor!.sellingPaise,
          materialSellingPaise: pair.material!.sellingPaise }] });
    }
  }
  if (!applicable) return undefined;
  return combineInHouseComponentBreakdowns([{ complete: unavailable.size === 0, unavailableSourceLineItemKeys: [...unavailable],
    adjustedCostPaise: null, sellingPaise: null, subBaskets: contributions }]);
}

/** Merge the same target across source baskets without merging the source contributions themselves. */
export function combineInHouseComponentBreakdowns(values: readonly ProcurementInHouseComponentBreakdown[]): ProcurementInHouseComponentBreakdown | undefined {
  if (!values.length) return undefined;
  const groups = new Map<string, SubBasket>();
  const unavailable = new Set(values.flatMap(value => value.unavailableSourceLineItemKeys));
  const identities = new Set<string>();
  for (const value of values) for (const target of value.subBaskets) {
    const key = procurementComponentTargetKey(target.basketId, target.subBasketId);
    const group = groups.get(key) ?? { ...target, contributions: [], adjustedCostPaise: 0, sellingPaise: 0 };
    for (const contribution of target.contributions) {
      const identity = JSON.stringify([contribution.sourceLineItemKey, contribution.componentId]);
      if (identities.has(identity)) throw new Error("An In-house component contribution belongs to more than one source group.");
      identities.add(identity);
      group.contributions.push(contribution);
      group.adjustedCostPaise = sumPaise([group.adjustedCostPaise, contribution.laborAdjustedCostPaise, contribution.materialAdjustedCostPaise]);
      group.sellingPaise = sumPaise([group.sellingPaise, contribution.laborSellingPaise, contribution.materialSellingPaise]);
    }
    if (group.basketName !== target.basketName) group.basketName = null;
    if (group.subBasketName !== target.subBasketName) group.subBasketName = null;
    groups.set(key, group);
  }
  const subBaskets = [...groups.values()].sort((left, right) => procurementComponentTargetKey(left.basketId, left.subBasketId)
    .localeCompare(procurementComponentTargetKey(right.basketId, right.subBasketId)));
  const cost = sumPaise(subBaskets.map(group => group.adjustedCostPaise));
  const selling = sumPaise(subBaskets.map(group => group.sellingPaise));
  const complete = unavailable.size === 0 && values.every(value => value.complete);
  return { complete, unavailableSourceLineItemKeys: [...unavailable].sort(), adjustedCostPaise: complete ? cost : null,
    sellingPaise: complete ? selling : null, subBaskets };
}

function sumPaise(values: readonly number[]): number {
  const amount = values.reduce((sum, value) => {
    if (!money(value)) throw new RangeError("Invalid In-house component amount.");
    return sum + BigInt(value);
  }, 0n);
  if (amount > BigInt(MAX_FINANCE_AMOUNT_PAISE)) throw new RangeError("In-house component amount exceeds the supported range.");
  return Number(amount);
}
