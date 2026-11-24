import type { KnowledgeSubBasketMarginRange, MarginCandidate, MarginChange, MarginComponent, MarginDefault, MarginMatrix, MarginPair, MarginScope, MarginTier } from "../contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { KNOWLEDGE_MODE_TIERS, isKnowledgeModeTier, projectKnowledgeModeTierSection } from "./ai-estimator-knowledge-mode-tiers.js";
import { SUB_BASKET_MARGIN_MODES, subBasketMarginRanges, validSubBasketMarginRanges } from "./ai-estimator-knowledge-sub-basket-margins.js";

type Row = Record<string, unknown>;
export interface PendingMarginEdit extends MarginChange {
  originalRanges?: MarginPair[];
  revisionId: string;
  sectionVersion: number;
  actorId: string;
}
export interface SubBasketMarginLine { line: Row; revision: Row | null; section: Row | null; pending?: PendingMarginEdit[] }
export interface StoredMarginBaseline {
  version: number;
  defaults: MarginDefault[];
  sharedInHouseDefaults?: MarginDefault[];
  updatedAt: Date;
  updatedById: string;
  operationId?: string;
}

export function marginScopeKey(scope: MarginScope): string {
  return JSON.stringify([scope.tier, scope.mode, scope.component?.basketId, scope.component?.subBasketId]);
}

export function validScope(scope: MarginScope, inHouseScope?: "sub_basket"): boolean {
  if (!scope || !isKnowledgeModeTier(scope.tier) || !SUB_BASKET_MARGIN_MODES.includes(scope.mode)) return false;
  if (scope.mode !== "in_house" || inHouseScope === "sub_basket") return scope.component === undefined;
  const id = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value;
  return !!scope.component && id(scope.component.basketId) && (scope.component.subBasketId === null || id(scope.component.subBasketId));
}

export function validMarginChange(scope: MarginChange, inHouseScope?: "sub_basket"): boolean {
  if (!validScope(scope, inHouseScope) || !Array.isArray(scope.ranges) || !scope.ranges.every(pair => pair && typeof pair === "object")) return false;
  const keys = scope.ranges.map(range => range.key);
  const complete = scope.mode === "in_house" ? keys.length === 2 && keys.includes("labor") && keys.includes("material")
    : keys.length === 1 && keys[0] === "margin";
  return complete && scope.ranges.every(pair => Number.isSafeInteger(pair.minimumBps) && Number.isSafeInteger(pair.maximumBps)
    && pair.minimumBps >= 0) && validSubBasketMarginRanges(scope.ranges, scope.mode);
}

type BaselineProblem = { repairTier?: MarginTier; reason: string };

/** A read may encounter a historic direct import predating Mongoose's baseline validators. */
export function inspectStoredMarginDefaults(baseline: StoredMarginBaseline | undefined) {
  const problems: BaselineProblem[] = [];
  const inspect = (value: unknown, shared: boolean): MarginDefault[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      problems.push({ reason: "A saved margin baseline has an unrecognizable format." });
      return [];
    }
    const rows = new Map<string, MarginDefault>();
    const seen = new Set<string>();
    for (const entry of value) {
      const row = asRow(entry) as unknown as MarginDefault | null;
      if (!row || !validScope(row, shared ? "sub_basket" : undefined) || (shared && row.mode !== "in_house")) {
        problems.push({ reason: "A saved margin baseline contains an unrecognizable tier, mode or component identity." });
        continue;
      }
      const key = marginScopeKey(row);
      if (seen.has(key)) {
        rows.delete(key);
        problems.push({ reason: "The saved margin baseline contains duplicate entries for the same scope." });
        continue;
      }
      seen.add(key);
      const approved = row.provenance === "approved";
      const complete = (approved || (!shared && row.provenance === "existing")) && validMarginChange(row, shared ? "sub_basket" : undefined);
      const unset = !shared && row.provenance === "unset" && Array.isArray(row.ranges) && !row.ranges.length;
      if (complete || unset) rows.set(key, row);
      else {
        problems.push({ ...(row.mode === "in_house" ? { repairTier: row.tier } : {}),
          reason: `The saved ${row.tier} ${row.mode === "in_house" ? "In-house" : row.mode} default is incomplete or invalid.` });
        if (!shared) rows.set(key, { tier: row.tier, mode: row.mode, ...(row.component ? { component: row.component } : {}), provenance: "unset", ranges: [] });
      }
    }
    return [...rows.values()];
  };
  const defaults = inspect(baseline?.defaults, false);
  const sharedInHouseDefaults = inspect(baseline?.sharedInHouseDefaults, true);
  return { defaults, sharedInHouseDefaults, problems };
}

export function validStoredDefaults(rows: MarginDefault[]): boolean {
  if (new Set(rows.map(marginScopeKey)).size !== rows.length) return false;
  const valid = rows.every(row => validScope(row) && (row.provenance === "unset"
    ? !row.ranges.length : validMarginChange(row)));
  return valid && KNOWLEDGE_MODE_TIERS.every(tier => SUB_BASKET_MARGIN_MODES.every(mode =>
    rows.some(row => row.tier === tier && row.mode === mode)));
}

export function samePairs(left: readonly MarginPair[], right: readonly MarginPair[]): boolean {
  return left.length === right.length && left.every(pair => right.some(other => other.key === pair.key
    && pair.minimumBps === other.minimumBps && pair.maximumBps === other.maximumBps));
}

export function asRow(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

export function tierSettings(entry: SubBasketMarginLine, tier: MarginTier) {
  const projected = entry.section ? projectKnowledgeModeTierSection(entry.section, tier) : null;
  return { payload: asRow(projected?.payload) ?? {}, applicability: projected?.applicability };
}

type SavedScope = { scope: MarginScope; pairs: MarginPair[]; hasCosts?: boolean };
function savedScope(scope: MarginScope, ranges: readonly KnowledgeSubBasketMarginRange[], hasCosts?: boolean): SavedScope {
  const pairs = ranges.flatMap(({ key, minimumBps, maximumBps }) =>
    minimumBps === null || maximumBps === null ? [] : [{ key, minimumBps, maximumBps }]);
  return { scope, hasCosts, pairs: validMarginChange({ ...scope, ranges: pairs }) ? pairs : [] };
}

/** Read component identities even when a saved cost is incomplete; its margin will need configuration. */
export function componentIdentity(row: Row): MarginComponent | null {
  const { basketId, subBasketId } = row;
  return typeof basketId === "string" && (subBasketId === null || typeof subBasketId === "string") ? { basketId, subBasketId } : null;
}
function savedScopes(payload: Row, tier: MarginTier, owner: MarginComponent): SavedScope[] {
  const scopes = (["pmc", "sub_vendor"] as const).map(mode => savedScope({ tier, mode }, subBasketMarginRanges(payload, mode)));
  if (!Object.hasOwn(payload, "inHouseComponents")) {
    const settings = asRow(payload.modeCalculations);
    const split = settings && (Object.hasOwn(settings, "in_house_labor") || Object.hasOwn(settings, "in_house_material"));
    const hasCosts = split ? Boolean(settings.in_house_labor && settings.in_house_material)
      : Boolean(settings ? settings.in_house : payload.modeCalculation);
    scopes.push(savedScope({ tier, mode: "in_house", component: owner }, subBasketMarginRanges(payload, "in_house"), hasCosts));
    return scopes;
  }
  if (!Array.isArray(payload.inHouseComponents)) return scopes;
  for (const value of payload.inHouseComponents) {
    const row = asRow(value);
    const component = row && componentIdentity(row);
    if (!component || !row) continue;
    scopes.push(savedScope({ tier, mode: "in_house", component }, subBasketMarginRanges({ inHouseComponents: [value] }, "in_house"),
      Boolean(row.labor && row.material)));
  }
  return scopes;
}

export function buildMarginMatrix(owner: { basketId: string; subBasketId: string }, lines: SubBasketMarginLine[],
  baseline: StoredMarginBaseline | undefined, versionToken: string, inHouseScope?: "sub_basket"): MarginMatrix {
  const defaults = new Map<string, MarginDefault>();
  const storedBaselines = inspectStoredMarginDefaults(baseline);
  const sharedByTier = new Map(storedBaselines.sharedInHouseDefaults.map(row => [row.tier, row]));
  for (const entry of storedBaselines.defaults) {
    const shared = entry.mode === "in_house" && sharedByTier.get(entry.tier);
    defaults.set(marginScopeKey(entry), shared ? { ...entry, ranges: shared.ranges, provenance: shared.provenance } : { ...entry });
  }
  const exceptions: MarginMatrix["exceptions"] = [];
  const issues: MarginMatrix["issues"] = [];
  const authored: MarginCandidate[] = [];
  const savedComponents = new Map<MarginTier, MarginPair[][]>();
  const define = (scope: MarginScope, ranges: MarginPair[] = []) => {
    const key = marginScopeKey(scope);
    const value: MarginDefault = defaults.get(key) ?? { ...scope, ranges, provenance: ranges.length ? "existing" : "unset" };
    const shared = scope.mode === "in_house" && sharedByTier.get(scope.tier);
    const resolved = shared ? { ...value, ranges: shared.ranges, provenance: shared.provenance } : value;
    defaults.set(key, resolved);
    return resolved;
  };
  for (const tier of KNOWLEDGE_MODE_TIERS) {
    const first = lines[0];
    if (!baseline && first?.revision) {
      const { payload, applicability } = tierSettings(first, tier);
      if (applicability === "configured") for (const { scope, pairs } of savedScopes(payload, tier, owner)) define(scope, pairs);
    }
    define({ tier, mode: "pmc" });
    define({ tier, mode: "sub_vendor" });
    for (const entry of lines) {
      const line = { mainLineId: String(entry.line._id), mainLineName: String(entry.line.name) };
      const { payload, applicability } = tierSettings(entry, tier);
      if (!entry.revision || applicability !== "configured") {
        const reason = !entry.revision || !entry.section ? "Current saved Mode settings are unavailable."
          : applicability === "not_applicable" ? "Tier is not applicable." : "Tier is not configured.";
        for (const mode of SUB_BASKET_MARGIN_MODES) issues.push({ ...line, tier, mode, reason });
        continue;
      }
      const scopes = savedScopes(payload, tier, owner);
      if (!scopes.some(s => s.scope.mode === "in_house")) issues.push({ ...line, tier, mode: "in_house", reason: "In-house components need configuration." });
      for (const { scope, pairs, hasCosts } of scopes) {
        const current = define(scope);
        if (inHouseScope && scope.mode === "in_house") {
          if (hasCosts) {
            if (!savedComponents.has(tier)) savedComponents.set(tier, []);
            savedComponents.get(tier)!.push(pairs);
          }
          if (pairs.length && entry.pending?.some(edit => marginScopeKey(edit) === marginScopeKey(scope) && samePairs(edit.ranges, pairs))) {
            authored.push({ ...line, ...scope, ranges: pairs });
          }
        }
        if (!pairs.length) issues.push({ ...line, ...scope, reason: "Margin needs configuration." });
        else if (!samePairs(pairs, current.ranges) && entry.pending?.some(edit =>
          marginScopeKey(edit) === marginScopeKey(scope) && samePairs(edit.ranges, pairs))) {
          exceptions.push({ ...line, ...scope, ranges: pairs });
        }
      }
    }
    if (![...defaults.values()].some(scope => scope.tier === tier && scope.mode === "in_house")) define({ tier, mode: "in_house", component: owner });
  }
  const result = { ...owner, baselineVersion: baseline?.version ?? 0, totalMainLines: lines.length, versionToken, defaults: [...defaults.values()], exceptions, issues };
  if (!inHouseScope) return result;

  const grouped: MarginCandidate[] = exceptions.filter(row => row.mode !== "in_house");
  const projected: MarginDefault[] = [];
  for (const tier of KNOWLEDGE_MODE_TIERS) {
    projected.push(...result.defaults.filter(row => row.tier === tier && row.mode !== "in_house"));
    const legacy = result.defaults.filter(row => row.tier === tier && row.mode === "in_house" && validMarginChange(row));
    const approved = legacy.filter(row => row.provenance === "approved");
    const distinct: MarginDefault[] = [];
    for (const source of approved.length ? approved : legacy) {
      if (!distinct.some(other => samePairs(other.ranges, source.ranges))) distinct.push(source);
    }
    const stored = sharedByTier.get(tier);
    const suggested = distinct.length === 1 ? distinct[0] : undefined;
    const ranges = stored?.ranges ?? suggested?.ranges ?? [];
    const shared: MarginDefault = {
      tier, mode: "in_house", ranges, provenance: stored?.provenance ?? suggested?.provenance ?? "unset",
      resolution: stored ? "shared" : suggested ? "suggested" : distinct.length ? "choose" : "unset",
      canApplyPrefilled: ranges.length > 0 && (!stored || storedBaselines.problems.some(issue => issue.repairTier === tier) || savedComponents.get(tier)?.some(pairs => !samePairs(pairs, ranges)) === true)
    };
    if (shared.resolution === "choose") shared.choices = distinct.map(({ component, ranges }) => ({ component, ranges }));
    projected.push(shared);
    const byLine = new Map<string, MarginCandidate>();
    for (const proposal of authored.filter(row => row.tier === tier && !samePairs(row.ranges, ranges))) {
      let group = byLine.get(proposal.mainLineId);
      if (!group) {
        group = { tier, mode: "in_house", mainLineId: proposal.mainLineId, mainLineName: proposal.mainLineName, ranges: [], proposals: [],
          ...(ranges.length ? {} : { requiresDefault: true }) };
        byLine.set(proposal.mainLineId, group);
      }
      group.proposals!.push(proposal);
    }
    grouped.push(...byLine.values());
  }
  return { ...result, defaults: projected, exceptions: grouped };
}
