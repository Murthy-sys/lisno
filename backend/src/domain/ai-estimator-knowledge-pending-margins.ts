import { isDeepStrictEqual } from "node:util";
import type { KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginRange, MarginComponent, MarginEditField, MarginPair, MarginScope, MarginTier } from "../contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { asRow, marginScopeKey, samePairs, validMarginChange } from "./ai-estimator-knowledge-margin-matrix.js";
import { SUB_BASKET_MARGIN_MODES, subBasketMarginRanges } from "./ai-estimator-knowledge-sub-basket-margins.js";

type Row = Record<string, unknown>;
type ScopedRanges = { scope: MarginScope; ranges: KnowledgeSubBasketMarginRange[] };
export interface MarginDelta {
  scope: MarginScope;
  ranges: MarginPair[];
  previous: KnowledgeSubBasketMarginRange[];
  manual: boolean;
}

function groupRanges(tier: MarginTier, mode: KnowledgeSubBasketMarginMode, owner: MarginComponent, rows: readonly KnowledgeSubBasketMarginRange[]) {
  const groups = new Map<string, ScopedRanges>();
  for (const row of rows) {
    const component = row.component ?? owner;
    const scope = { tier, mode, ...(mode === "in_house" ? { component: { basketId: component.basketId, subBasketId: component.subBasketId } } : {}) };
    const key = marginScopeKey(scope);
    const group = groups.get(key) ?? { scope, ranges: [] };
    group.ranges.push({ key: row.key, minimumBps: row.minimumBps, maximumBps: row.maximumBps });
    groups.set(key, group);
  }
  return groups;
}

/** Numeric intent is checked by bound and component. A generated initial pair is ambiguous without an editor hint. */
export function scopeMarginDeltas(tier: MarginTier, mode: KnowledgeSubBasketMarginMode, owner: MarginComponent,
  before: readonly KnowledgeSubBasketMarginRange[], after: readonly KnowledgeSubBasketMarginRange[], hints?: readonly MarginEditField[]): MarginDelta[] {
  const old = groupRanges(tier, mode, owner, before);
  const next = groupRanges(tier, mode, owner, after);
  const result: MarginDelta[] = [];
  // Component copies can change only the percentages. A whole-mode snapshot cannot establish which controls were edited.
  const componentCopyAmbiguous = mode === "in_house" && hints === undefined &&
    (before.some(pair => pair.component !== undefined) || after.some(pair => pair.component !== undefined));
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    const scope = (next.get(key) ?? old.get(key))!.scope;
    const previous = old.get(key)?.ranges ?? [];
    const current = next.get(key)?.ranges ?? [];
    const pairs = (rows: readonly KnowledgeSubBasketMarginRange[]) => rows.flatMap(({ key: pairKey, minimumBps, maximumBps }) =>
      minimumBps !== null && maximumBps !== null ? [{ key: pairKey, minimumBps, maximumBps }] : []);
    const ranges = pairs(current);
    if (samePairs(pairs(previous), ranges)) continue;
    const manual = !componentCopyAmbiguous && validMarginChange({ ...scope, ranges }) && current.some(pair => {
      const prior = previous.find(entry => entry.key === pair.key);
      return (["minimumBps", "maximumBps"] as const).some(bound => typeof pair[bound] === "number" && pair[bound] !== prior?.[bound] &&
        (hints === undefined ? typeof prior?.[bound] === "number" : hints.some(hint =>
          marginScopeKey({ ...hint, tier }) === key && hint.key === pair.key && hint.bound === bound)));
    });
    result.push({ scope, previous, ranges, manual });
  }
  return result;
}

// An older client sends no field intent. Accept an existing numeric change only on a margin-only save.
function withoutMarginFields(payload: Row): Row {
  const { pmcMinimumMarginBps: _pmcMin, pmcMarginBps: _pmcMax, subVendorMinimumMarginBps: _vendorMin,
    subVendorMarginBps: _vendorMax, ...rest } = payload;
  const stripCost = (value: unknown) => {
    const cost = asRow(value);
    if (!cost) return value;
    const { minimumMarkupBps: _min, startingMarkupBps: _start, ...fields } = cost;
    return fields;
  };
  if (Object.hasOwn(rest, "modeCalculation")) rest.modeCalculation = stripCost(rest.modeCalculation);
  const calculations = asRow(rest.modeCalculations);
  if (calculations) rest.modeCalculations = Object.fromEntries(Object.entries(calculations).map(([key, value]) =>
    [key, ["in_house_labor", "in_house_material", "in_house"].includes(key) ? stripCost(value) : value]));
  if (Array.isArray(rest.inHouseComponents)) rest.inHouseComponents = rest.inHouseComponents.map(value => {
    const component = asRow(value);
    return component ? { ...component, labor: stripCost(component.labor), material: stripCost(component.material) } : value;
  });
  return rest;
}

export function savedMarginDeltas(tier: MarginTier, owner: MarginComponent, previous: Row, next: Row,
  eligibleBefore: boolean, eligibleAfter: boolean, hints?: readonly MarginEditField[]): MarginDelta[] {
  if (!eligibleBefore && !eligibleAfter) return [];
  const fields = hints ?? (eligibleBefore && eligibleAfter && isDeepStrictEqual(withoutMarginFields(previous), withoutMarginFields(next)) ? undefined : []);
  // Toggling applicability alone must never turn retained hidden values into a purported edit.
  return SUB_BASKET_MARGIN_MODES.flatMap(mode => {
    const oldRanges = subBasketMarginRanges(previous, mode);
    const newRanges = subBasketMarginRanges(next, mode);
    if (!eligibleAfter) return scopeMarginDeltas(tier, mode, owner, oldRanges, [], []);
    return scopeMarginDeltas(tier, mode, owner, oldRanges, newRanges, fields);
  });
}
