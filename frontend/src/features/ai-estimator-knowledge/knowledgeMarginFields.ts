import type {
  KnowledgeSubBasketMarginRange, MarginChange, MarginComponent, MarginDefault, MarginPair, MarginScope
} from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import { KNOWLEDGE_MODE_TIER_LABELS } from "../../../../shared/knowledge/knowledgeModeTiers";
import { parseRupeeInputToPaise } from "./knowledgePresentation";

export const marginModes = ["pmc", "sub_vendor", "in_house"] as const;
export const modeLabel = { pmc: "PMC", sub_vendor: "Sub-vendor", in_house: "In-house" };
export const pairLabel = { margin: "", labor: "Labour", material: "Material" };
export const provenanceLabel = { existing: "Existing default", approved: "Approved default", unset: "Not configured" };

export function sharedTierDefaults(defaults: readonly MarginDefault[], tier: MarginScope["tier"]): MarginDefault[] | null {
  const entries = defaults.filter(entry => entry.tier === tier);
  if (entries.length !== marginModes.length) return null;
  const ordered: MarginDefault[] = [];
  for (const mode of marginModes) {
    const entry = entries.find(row => row.mode === mode && !row.component);
    if (!entry) return null;
    ordered.push(entry);
  }
  return ordered;
}

export function defaultLabel(entry: MarginDefault) {
  if (entry.resolution === "choose") return "Choose shared margins";
  if (entry.resolution === "suggested") return "Proposed shared default";
  return provenanceLabel[entry.provenance];
}

export function componentLabel(source: { component?: MarginComponent; componentName?: string }) {
  return source.componentName ?? (source.component && [source.component.basketId, source.component.subBasketId].filter(Boolean).join(" / "));
}

export function scopeKey(scope: MarginScope) {
  return JSON.stringify([scope.tier, scope.mode, scope.component?.basketId, scope.component?.subBasketId]);
}

export function scopeFields(scope: MarginScope): MarginScope {
  return { tier: scope.tier, mode: scope.mode, ...(scope.component ? { component: scope.component } : {}) };
}

export function scopeLabel(scope: MarginScope & { componentName?: string }, defaults: readonly MarginDefault[]) {
  const componentName = componentLabel(scope) ?? defaults.find((entry) => scopeKey(entry) === scopeKey(scope))?.componentName;
  return [KNOWLEDGE_MODE_TIER_LABELS[scope.tier], modeLabel[scope.mode], componentName].filter(Boolean).join(" · ");
}

export function rangeText(ranges: readonly KnowledgeSubBasketMarginRange[]) {
  if (!ranges.length) return "Not configured";
  const percentage = (bps: number | null) => bps === null ? "not configured" : `${bps / 100}%`;
  if (ranges.some(range => range.minimumBps === null || range.maximumBps === null)) {
    return ranges.map(range => {
      const upper = range.key === "margin" ? "maximum" : "starting";
      return [pairLabel[range.key], `minimum ${percentage(range.minimumBps)}, ${upper} ${percentage(range.maximumBps)}`].filter(Boolean).join(" ");
    }).join(" · ");
  }
  return ranges.map((range) => [pairLabel[range.key], `${percentage(range.minimumBps)} / ${percentage(range.maximumBps)}`].filter(Boolean).join(" ")).join(" · ");
}

export function entryKeys(entry: MarginScope): MarginPair["key"][] {
  return entry.mode === "in_house" ? ["labor", "material"] : ["margin"];
}

export type Bound = "minimumBps" | "maximumBps";
export type DraftValues = Record<string, string>;
export function fieldId(scope: MarginScope, key: MarginPair["key"], bound: Bound) {
  return JSON.stringify([scopeKey(scope), key, bound]);
}
export function fieldValue(entry: MarginDefault, key: MarginPair["key"], bound: Bound, draft: DraftValues) {
  const saved = entry.ranges.find((range) => range.key === key)?.[bound];
  return draft[fieldId(entry, key, bound)] ?? (saved === undefined ? "" : String(saved / 100));
}

export function draftChanges(defaults: MarginDefault[], values: DraftValues): { changes: MarginChange[]; error?: string } {
  const changes: MarginChange[] = [];
  for (const entry of defaults) {
    const keys = entryKeys(entry);
    if (!keys.some((key) => (["minimumBps", "maximumBps"] as const).some((bound) =>
      fieldValue(entry, key, bound, values) !== fieldValue(entry, key, bound, {})))) continue;
    const ranges: MarginPair[] = [];
    for (const key of keys) {
      const min = parseRupeeInputToPaise(fieldValue(entry, key, "minimumBps", values));
      const max = parseRupeeInputToPaise(fieldValue(entry, key, "maximumBps", values));
      const label = [scopeLabel(entry, defaults), pairLabel[key]].filter(Boolean).join(" · ");
      if (min.status !== "valid" || max.status !== "valid") return { changes, error: `Enter both percentages for ${label}, with up to two decimal places.` };
      if (min.paise > max.paise) return { changes, error: `Review ${label}. The minimum exceeds the upper margin.` };
      if (entry.mode === "pmc" && (min.paise < 1000 || max.paise > 2000)) return { changes, error: `${label} must be between 10% and 20%.` };
      if (entry.mode === "sub_vendor" && (max.paise > 9500 || min.paise % 500 || max.paise % 500)) return { changes, error: `${label} accepts 0% to 95% in 5% steps.` };
      if (entry.mode === "in_house" && max.paise >= 10000) return { changes, error: `${label} must be below 100%.` };
      ranges.push({ key, minimumBps: min.paise, maximumBps: max.paise });
    }
    if (ranges.some((range) => !entry.ranges.some((old) => old.key === range.key && old.minimumBps === range.minimumBps && old.maximumBps === range.maximumBps))) {
      changes.push({ ...scopeFields(entry), ranges });
    }
  }
  return { changes };
}
