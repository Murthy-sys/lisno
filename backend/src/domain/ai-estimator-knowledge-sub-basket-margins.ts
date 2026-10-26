import type { KnowledgeDefaultModeCalculation, KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginRange } from "../contracts/ai-estimator-knowledge-sub-basket-margins.js";
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

/** Copy margins only. Callers validate the complete result before saving. */
export function withSubBasketMarginDefaults(
  payload: Row, mode: KnowledgeSubBasketMarginMode, ranges: readonly KnowledgeSubBasketMarginRange[], owner?: Owner,
  options: { allowIncompleteMargins?: boolean } = {}
): Row | null {
  if (!validSubBasketMarginRanges(ranges, mode)) return null;
  if (mode === "pmc") return { ...payload, pmcMinimumMarginBps: ranges[0]!.minimumBps, pmcMarginBps: ranges[0]!.maximumBps };
  if (mode === "sub_vendor") return { ...payload, subVendorMinimumMarginBps: ranges[0]!.minimumBps, subVendorMarginBps: ranges[0]!.maximumBps };
  const pairFor = (identity: Owner): readonly KnowledgeSubBasketMarginRange[] =>
    configuredInHouseMarginRanges(ranges, owner ?? identity).filter((range) => componentKey(range, owner ?? identity) === JSON.stringify([identity.basketId, identity.subBasketId]));
  if (Object.hasOwn(payload, "inHouseComponents")) {
    // The explicit single-line action may repair margin fields, but never missing cost objects.
    const components = options.allowIncompleteMargins
      ? Array.isArray(payload.inHouseComponents) && payload.inHouseComponents.every((entry) => object(entry)) ? payload.inHouseComponents as Row[] : null
      : readInHouseComponents(payload) as unknown as Row[] | null;
    if (!components || !owner) return null;
    let matched = 0;
    let missingCosts = false;
    const patched = components.map((component) => {
      const ownRanges = subBasketMarginRanges({ inHouseComponents: [component] }, "in_house");
      const source = options.allowIncompleteMargins
        ? pairFor({ basketId: String(component.basketId), subBasketId: component.subBasketId === null ? null : String(component.subBasketId) })
        : comparableInHouseMarginRanges(ranges, ownRanges, owner).source;
      if (source.length !== 2) return component;
      const labor = object(component.labor);
      const material = object(component.material);
      if (!labor || !material) { missingCosts = true; return component; }
      matched++;
      return { ...component,
        labor: withMargins(labor, source.find(({ key }) => key === "labor")!),
        material: withMargins(material, source.find(({ key }) => key === "material")!) };
    });
    if (options.allowIncompleteMargins && (!matched || missingCosts)) return null;
    return { ...payload, inHouseComponents: patched };
  }
  const applicable = ranges.some(({ component }) => component) && owner
    ? options.allowIncompleteMargins ? pairFor(owner) : comparableInHouseMarginRanges(ranges, subBasketMarginRanges(payload, "in_house"), owner).source
    : ranges;
  if (applicable.length !== 2) return null;
  const laborMargin = applicable.find(({ key }) => key === "labor")!;
  const materialMargin = applicable.find(({ key }) => key === "material")!;
  const map = object(payload.modeCalculations);
  const hasSplit = map && (Object.hasOwn(map, "in_house_labor") || Object.hasOwn(map, "in_house_material"));
  if (!hasSplit) {
    const single = calculation(payload, "in_house_labor");
    // A global legacy calculator has different pricing-consumer semantics. Materializing
    // scoped rates during a margin-only operation could change PMC/Sub-vendor prices.
    if (!Object.hasOwn(payload, "modeCalculations")) return null;
    if (!single || laborMargin.minimumBps !== materialMargin.minimumBps || laborMargin.maximumBps !== materialMargin.maximumBps) return null;
    // A saved single cost remains a single cost. Creating two scopes would double its base rate.
    return { ...payload, modeCalculations: {
      ...map,
      in_house: withMargins(single, laborMargin)
    } };
  }
  const labor = calculation(payload, "in_house_labor");
  const material = calculation(payload, "in_house_material");
  if (!labor || !material) return null;
  return { ...payload, modeCalculations: { ...map,
    in_house_labor: withMargins(labor, laborMargin), in_house_material: withMargins(material, materialMargin) } };
}

/** Explain why a margin-only patch cannot safely represent the target's saved costs. */
export function subBasketMarginPatchUnavailableReason(payload: Row, ranges: readonly KnowledgeSubBasketMarginRange[], owner?: Owner): string {
  if (!Object.hasOwn(payload, "inHouseComponents")) {
    if (!Object.hasOwn(payload, "modeCalculations") && object(payload.modeCalculation)) {
      return "Save scoped In-house cost settings first. Applying defaults to shared legacy settings could change other mode prices.";
    }
    const map = object(payload.modeCalculations);
    if (map && object(map.in_house) && !Object.hasOwn(map, "in_house_labor") && !Object.hasOwn(map, "in_house_material")) {
      const applicable = ranges.filter(({ component }) => !component || (owner && component.basketId === owner.basketId && component.subBasketId === owner.subBasketId));
      const labor = applicable.find(({ key }) => key === "labor");
      const material = applicable.find(({ key }) => key === "material");
      if (labor && material && (labor.minimumBps !== material.minimumBps || labor.maximumBps !== material.maximumBps)) {
        return "The default labor and material margins differ. Configure separate labor and material cost settings before applying these defaults.";
      }
    }
  }
  return "Save matching labor and material calculation settings on this main line before applying In-house margins.";
}

function withMargins(settings: Row, range: KnowledgeSubBasketMarginRange): Row {
  return { ...settings, minimumMarkupBps: range.minimumBps, startingMarkupBps: range.maximumBps };
}

/** Read-only saved prices. Never substitute simulator defaults or expand a legacy single cost. */
export function subBasketDefaultModeCalculations(payload: Row): Record<KnowledgeSubBasketMarginMode, { calculations: KnowledgeDefaultModeCalculation[] }> {
  const project = (scope: KnowledgeDefaultModeCalculation["scope"], value: unknown,
    component?: KnowledgeDefaultModeCalculation["component"]): KnowledgeDefaultModeCalculation => {
    const row = object(value);
    const base = row?.baseRatePaise;
    const limit = row?.lowQuantityLimit;
    const impact = row?.impactBps;
    return { scope, ...(component ? { component } : {}),
      baseRatePaise: typeof base === "number" && Number.isSafeInteger(base) && base >= 0 ? base : null,
      lowQuantityLimit: typeof limit === "string" && limit.length <= 64 && /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(limit) ? limit : null,
      impactBps: typeof impact === "number" && Number.isSafeInteger(impact) && impact >= 0 && impact <= Number.MAX_SAFE_INTEGER - 10_000 ? impact : null };
  };
  const modes = { pmc: { calculations: [project("pmc", calculation(payload, "pmc"))] },
    sub_vendor: { calculations: [project("sub_vendor", calculation(payload, "sub_vendor"))] },
    in_house: { calculations: [] as KnowledgeDefaultModeCalculation[] } };
  if (Object.hasOwn(payload, "inHouseComponents")) {
    modes.in_house.calculations = (readInHouseComponents(payload) ?? []).flatMap((component) => (["labor", "material"] as const).map((key) =>
      project(`in_house_${key}`, component[key], { id: component.id, basketId: component.basketId, subBasketId: component.subBasketId })));
  } else {
    const map = object(payload.modeCalculations);
    const hasSplit = map && (Object.hasOwn(map, "in_house_labor") || Object.hasOwn(map, "in_house_material"));
    modes.in_house.calculations = hasSplit
      ? [project("in_house_labor", calculation(payload, "in_house_labor")), project("in_house_material", calculation(payload, "in_house_material"))]
      : [project("in_house", calculation(payload, "in_house_labor"))];
  }
  return modes;
}
