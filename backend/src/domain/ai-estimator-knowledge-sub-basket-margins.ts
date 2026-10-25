import type { KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginRange } from "../contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { readInHouseComponents } from "./ai-estimator-knowledge-in-house-components.js";

type Row = Record<string, unknown>;
type Owner = { basketId: string; subBasketId: string | null };
export const SUB_BASKET_MARGIN_MODES = ["pmc", "sub_vendor", "in_house"] as const;

function object(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}
function basisPoints(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Preserve the same legacy resolution as the saved Mode workspace. Explicit nulls never inherit. */
function calculation(payload: Row, scope: "pmc" | "sub_vendor" | "in_house_labor" | "in_house_material"): Row | null {
  if (!Object.hasOwn(payload, "modeCalculations")) return object(payload.modeCalculation);
  const map = object(payload.modeCalculations);
  if (!map) return null;
  if (scope.startsWith("in_house") && !Object.hasOwn(map, "in_house_labor") && !Object.hasOwn(map, "in_house_material")) {
    return object(map.in_house);
  }
  return object(map[scope]);
}

export function subBasketMarginRanges(payload: Row, mode: KnowledgeSubBasketMarginMode): KnowledgeSubBasketMarginRange[] {
  if (mode === "in_house" && Object.hasOwn(payload, "inHouseComponents")) {
    return (readInHouseComponents(payload) ?? []).flatMap((component) => (["labor", "material"] as const).map((key) => ({
      key, minimumBps: basisPoints(component[key]?.minimumMarkupBps), maximumBps: basisPoints(component[key]?.startingMarkupBps),
      component: { basketId: component.basketId, subBasketId: component.subBasketId }
    })));
  }
  if (mode === "in_house") return (["labor", "material"] as const).map((key) => {
    const settings = calculation(payload, `in_house_${key}`);
    return { key, minimumBps: basisPoints(settings?.minimumMarkupBps), maximumBps: basisPoints(settings?.startingMarkupBps) };
  });
  const maximumKey = mode === "pmc" ? "pmcMarginBps" : "subVendorMarginBps";
  const minimumKey = mode === "pmc" ? "pmcMinimumMarginBps" : "subVendorMinimumMarginBps";
  return [{ key: "margin", minimumBps: basisPoints(Object.hasOwn(payload, minimumKey) ? payload[minimumKey] : payload[maximumKey]),
    maximumBps: basisPoints(payload[maximumKey]) }];
}

export function validSubBasketMarginRanges(ranges: readonly KnowledgeSubBasketMarginRange[], mode: KnowledgeSubBasketMarginMode): boolean {
  return ranges.length > 0 && ranges.every(({ minimumBps, maximumBps }) => {
    if (minimumBps === null || maximumBps === null || minimumBps > maximumBps) return false;
    if (mode === "pmc") return minimumBps >= 1_000 && maximumBps <= 2_000;
    if (mode === "sub_vendor") return maximumBps <= 9_500 && minimumBps % 500 === 0 && maximumBps % 500 === 0;
    return maximumBps < 10_000;
  });
}

function componentKey(range: KnowledgeSubBasketMarginRange, owner: Owner): string {
  return JSON.stringify([range.component?.basketId ?? owner.basketId, range.component ? range.component.subBasketId : owner.subBasketId]);
}

/** A component is comparable only when both of its saved margin pairs are complete. */
export function configuredInHouseMarginRanges(ranges: readonly KnowledgeSubBasketMarginRange[], owner: Owner): KnowledgeSubBasketMarginRange[] {
  const groups = new Map<string, KnowledgeSubBasketMarginRange[]>();
  for (const range of ranges) {
    const key = componentKey(range, owner);
    groups.set(key, [...(groups.get(key) ?? []), range]);
  }
  return [...groups.values()].flatMap((group) => group.length === 2 && group.some(({ key }) => key === "labor")
    && group.some(({ key }) => key === "material") && validSubBasketMarginRanges(group, "in_house") ? group : []);
}

export function comparableInHouseMarginRanges(source: readonly KnowledgeSubBasketMarginRange[], target: readonly KnowledgeSubBasketMarginRange[], owner: Owner): {
  source: KnowledgeSubBasketMarginRange[]; target: KnowledgeSubBasketMarginRange[];
} {
  const defaults = new Map(configuredInHouseMarginRanges(source, owner).map((range) => [`${componentKey(range, owner)}:${range.key}`, range]));
  const comparable = configuredInHouseMarginRanges(target, owner).filter((range) => defaults.has(`${componentKey(range, owner)}:${range.key}`));
  return { source: comparable.map((range) => defaults.get(`${componentKey(range, owner)}:${range.key}`)!), target: comparable };
}

/** Copy margins only. Callers must validate the complete resulting advanced payload before saving. */
export function withSubBasketMarginDefaults(payload: Row, mode: KnowledgeSubBasketMarginMode, ranges: readonly KnowledgeSubBasketMarginRange[], owner?: Owner): Row | null {
  if (mode === "pmc") return { ...payload, pmcMinimumMarginBps: ranges[0]!.minimumBps, pmcMarginBps: ranges[0]!.maximumBps };
  if (mode === "sub_vendor") return { ...payload, subVendorMinimumMarginBps: ranges[0]!.minimumBps, subVendorMarginBps: ranges[0]!.maximumBps };
  if (Object.hasOwn(payload, "inHouseComponents")) {
    const components = readInHouseComponents(payload);
    if (!components || !owner) return null;
    return { ...payload, inHouseComponents: components.map((component) => {
      const ownRanges = subBasketMarginRanges({ inHouseComponents: [component] }, "in_house");
      const comparison = comparableInHouseMarginRanges(ranges, ownRanges, owner);
      if (comparison.target.length !== 2 || !component.labor || !component.material) return component;
      const labor = comparison.source.find(({ key }) => key === "labor")!;
      const material = comparison.source.find(({ key }) => key === "material")!;
      return { ...component,
        labor: { ...component.labor, minimumMarkupBps: labor.minimumBps, startingMarkupBps: labor.maximumBps },
        material: { ...component.material, minimumMarkupBps: material.minimumBps, startingMarkupBps: material.maximumBps } };
    }) };
  }
  const applicable = ranges.some(({ component }) => component) && owner
    ? comparableInHouseMarginRanges(ranges, subBasketMarginRanges(payload, "in_house"), owner).source : ranges;
  if (applicable.length !== 2) return null;
  const labor = calculation(payload, "in_house_labor");
  const material = calculation(payload, "in_house_material");
  if (!labor || !material) return null;
  const map = object(payload.modeCalculations) ?? {};
  return { ...payload, modeCalculations: {
    ...map,
    ...(!Object.hasOwn(payload, "modeCalculations") ? { pmc: calculation(payload, "pmc"), sub_vendor: calculation(payload, "sub_vendor") } : {}),
    in_house_labor: { ...labor, minimumMarkupBps: applicable.find(({ key }) => key === "labor")!.minimumBps, startingMarkupBps: applicable.find(({ key }) => key === "labor")!.maximumBps },
    in_house_material: { ...material, minimumMarkupBps: applicable.find(({ key }) => key === "material")!.minimumBps, startingMarkupBps: applicable.find(({ key }) => key === "material")!.maximumBps }
  } };
}
