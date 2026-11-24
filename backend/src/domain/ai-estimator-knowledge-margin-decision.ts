import type { MarginChange, MarginComponent, MarginDefault, MarginImpact, MarginMatrix, MarginPreview, MarginPreviewInput, MarginScope, MarginTier } from "../contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { ApiError } from "../middleware/errors.js";
import { createKnowledgeContentDigest } from "./ai-estimator-knowledge.js";
import { asRow, componentIdentity, marginScopeKey, samePairs, tierSettings, validMarginChange, type SubBasketMarginLine } from "./ai-estimator-knowledge-margin-matrix.js";
import { inHouseMarginBounds, subBasketMarginPatchUnavailableReason, subBasketMarginRanges, withSubBasketMarginDefaults } from "./ai-estimator-knowledge-sub-basket-margins.js";
import { mergeKnowledgeModeTierPayload } from "./ai-estimator-knowledge-mode-tiers.js";
import { inHouseCostProblem, inheritedModeCopyIssues, preservedModeNamespaceIssues, validateKnowledgeSectionPayload } from "./ai-estimator-knowledge-validation.js";

type Row = Record<string, unknown>;
type Patches = Map<string, Map<MarginTier, Row>>;
type PlanInput = { matrix: MarginMatrix; lines: SubBasketMarginLine[]; labels?: ReadonlyMap<string, string> };

function resolveChanges(matrix: MarginMatrix, input: MarginPreviewInput): MarginChange[] {
  if (input.versionToken !== matrix.versionToken) throw new ApiError(409, "VERSION_CONFLICT", "The Sub-Basket changed. Refresh its margins and review the impact again.");
  const decision = input.decision;
  if (decision.kind === "approve") {
    const key = marginScopeKey(decision.candidate);
    const shared = input.inHouseScope === "sub_basket" && decision.candidate.mode === "in_house";
    const candidates = shared ? matrix.exceptions.flatMap(row => row.proposals ?? []) : matrix.exceptions;
    const candidate = candidates.find(row => row.mainLineId === decision.candidate.mainLineId && marginScopeKey(row) === key);
    if (!candidate) throw new ApiError(409, "MARGIN_EXCEPTION_UNAVAILABLE", "This saved margin exception is no longer available.");
    const { tier, mode, component, ranges } = candidate;
    return [{ tier, mode, ...(component && !shared ? { component } : {}), ranges }];
  }
  if (!decision.changes.length || !decision.changes.every(change => validMarginChange(change, input.inHouseScope))
    || new Set(decision.changes.map(marginScopeKey)).size !== decision.changes.length) {
    throw new ApiError(400, "VALIDATION_ERROR", "Select distinct margin scopes with valid, complete margin ranges.");
  }
  const known = new Set(matrix.defaults.map(marginScopeKey));
  if (decision.changes.some(change => !known.has(marginScopeKey(change)))) {
    throw new ApiError(400, "INVALID_MARGIN_SCOPE", "Select a component from this Sub-Basket's reviewed configuration.");
  }
  return decision.changes;
}

function equalComponent(a: MarginComponent | undefined, b: MarginComponent): boolean {
  return a?.basketId === b.basketId && a?.subBasketId === b.subBasketId;
}

function inHouseTarget(payload: Row, scope: MarginScope, owner: MarginComponent): { excluded?: string; blocked?: string } {
  let costs: unknown[];
  if (Object.hasOwn(payload, "inHouseComponents")) {
    if (!Array.isArray(payload.inHouseComponents)) return { blocked: "Invalid saved In-house components." };
    const target = payload.inHouseComponents.map(asRow).find(row => row && scope.component?.basketId === row.basketId && scope.component?.subBasketId === row.subBasketId);
    if (!target) return { excluded: "This component is absent." };
    costs = [target.labor, target.material];
  } else {
    if (!equalComponent(scope.component, owner)) return { excluded: "This component is absent." };
    const settings = asRow(payload.modeCalculations);
    if (Object.hasOwn(payload, "modeCalculations") && !settings) return { blocked: "Invalid saved In-house calculation settings." };
    if (settings && (Object.hasOwn(settings, "in_house_labor") || Object.hasOwn(settings, "in_house_material"))) {
      costs = [settings.in_house_labor, settings.in_house_material];
    } else {
      const single = settings ? settings.in_house : payload.modeCalculation;
      if (single == null) return { excluded: "In-house costs are not configured." };
      costs = [single];
    }
  }
  const problems = costs.map(inHouseCostProblem);
  return problems.find(problem => problem.blocked) ?? problems.find(problem => problem.excluded) ?? {};
}

function targetComponents(payload: Row, owner: MarginComponent): MarginComponent[] | null {
  if (!Object.hasOwn(payload, "inHouseComponents")) return [owner];
  if (!Array.isArray(payload.inHouseComponents)) return null;
  const components: MarginComponent[] = [];
  const identities = new Set<string>();
  for (const entry of payload.inHouseComponents) {
    const row = asRow(entry);
    const component = row && componentIdentity(row);
    if (!component) return null;
    const id = JSON.stringify([component.basketId, component.subBasketId]);
    if (identities.has(id)) return null;
    identities.add(id);
    components.push(component);
  }
  return components;
}

export function planMarginDecision(snapshot: PlanInput, input: MarginPreviewInput): {
  preview: MarginPreview; defaults: MarginDefault[]; patches: Patches;
} {
  const { matrix, lines } = snapshot;
  const { basketId, subBasketId } = matrix;
  const owner = { basketId, subBasketId };
  const changes = resolveChanges(matrix, input);
  const patches: Patches = new Map();
  const defaults = new Map(matrix.defaults.map(row => [marginScopeKey(row), row]));
  const impacts = changes.map((change): MarginImpact => {
    const key = marginScopeKey(change);
    const old = defaults.get(key)!;
    const impact: MarginImpact = { ...change, previous: old.ranges, affected: [], competing: [], excluded: [], blockers: [] };
    const shared = input.inHouseScope === "sub_basket" && change.mode === "in_house";
    if (shared) impact.componentChanges = [];
    if (!shared && input.decision.kind === "edit" && samePairs(change.ranges, old.ranges)) return impact;
    defaults.set(key, { ...change, provenance: "approved", ...(shared ? { resolution: "shared" as const } : {}) });
    for (const line of lines) {
      const mainLineId = String(line.line._id);
      const identity = { mainLineId, mainLineName: String(line.line.name) };
      const { ranges: _ranges, ...scope } = change;
      const issue = { ...identity, ...scope };
      const settings = tierSettings(line, change.tier);
      if (!line.revision || !line.section) {
        impact.blockers.push({ ...issue, reason: "The current saved Mode revision is unavailable." });
        continue;
      }
      if (settings.applicability !== "configured") {
        impact.excluded.push({ ...issue, reason: settings.applicability === "not_applicable" ? "Tier is not applicable." : "Tier is not configured." });
        continue;
      }
      const payload = patches.get(mainLineId)?.get(change.tier) ?? settings.payload;
      const components = shared ? targetComponents(payload, owner) : [change.component];
      if (components === null) {
        impact.blockers.push({ ...issue, reason: "Invalid or duplicate In-house component identity." });
        continue;
      }
      if (!components.length) {
        impact.excluded.push({ ...issue, reason: "In-house costs are not configured." });
        continue;
      }
      let next = payload;
      for (const component of components) {
        const target = { ...change, ...(component ? { component } : {}) };
        const componentName = component && snapshot.labels?.get(JSON.stringify([component.basketId, component.subBasketId]));
        const targetIssue = { ...issue, ...(component ? { component } : {}), ...(componentName ? { componentName } : {}) };
        if (change.mode === "in_house") {
          const eligibility = inHouseTarget(payload, target, owner);
          if (eligibility.excluded) { impact.excluded.push({ ...targetIssue, reason: eligibility.excluded }); continue; }
          if (eligibility.blocked) { impact.blockers.push({ ...targetIssue, reason: eligibility.blocked }); continue; }
        }
        const observed = change.mode === "in_house" && component
          ? inHouseMarginBounds(settings.payload, component) : subBasketMarginRanges(settings.payload, change.mode);
        const before = observed.flatMap(({ key, minimumBps, maximumBps }) =>
          minimumBps !== null && maximumBps !== null ? [{ key, minimumBps, maximumBps }] : []);
        if (samePairs(before, change.ranges)) continue;
        const ranges = change.ranges.map(range => ({ ...range, ...(component ? { component } : {}) }));
        const patched = withSubBasketMarginDefaults(next, change.mode, ranges, owner, { allowIncompleteMargins: true });
        if (!patched) {
          impact.blockers.push({ ...targetIssue, reason: subBasketMarginPatchUnavailableReason(payload, ranges, owner) });
          continue;
        }
        next = patched;
        if (shared && component) impact.componentChanges!.push({ ...identity, component, ...(componentName ? { componentName } : {}), previous: observed });
        if (validMarginChange({ ...targetIssue, ranges: before }) && !samePairs(before, old.ranges)) {
          impact.competing.push({ ...targetIssue, ranges: before });
        }
      }
      if (next !== payload) {
        if (!patches.has(mainLineId)) patches.set(mainLineId, new Map());
        patches.get(mainLineId)!.set(change.tier, next);
        impact.affected.push(identity);
      }
    }
    return impact;
  });
  // Validate the complete proposed tier after composing every selected scope. Two reviewed
  // changes can repair multiple incomplete fields in the same saved section together.
  for (const impact of impacts) {
    if (samePairs(impact.ranges, impact.previous) && !impact.componentChanges?.length) continue;
    const unavailable = new Set([...impact.blockers, ...impact.excluded].map(row => row.mainLineId));
    for (const line of lines) {
      const mainLineId = String(line.line._id);
      if (impact.componentChanges ? !impact.affected.some(row => row.mainLineId === mainLineId) : unavailable.has(mainLineId)) continue;
      const finalPayload = patches.get(mainLineId)?.get(impact.tier) ?? tierSettings(line, impact.tier).payload;
      const [invalid] = validateKnowledgeSectionPayload("advanced", finalPayload);
      if (invalid) {
        const { tier, mode, component } = impact;
        impact.blockers.push({ mainLineId, mainLineName: String(line.line.name), tier, mode, ...(component ? { component } : {}), reason: invalid.message });
      }
    }
  }
  if (input.inHouseScope) {
    for (const line of lines) {
      const mainLineId = String(line.line._id);
      const byTier = patches.get(mainLineId);
      if (!byTier?.size) continue;
      let root = asRow(line.section?.payload) ?? {};
      const active = line.revision?.status === "active";
      let [invalid] = active ? inheritedModeCopyIssues(root) : [];
      const copyBlocked = Boolean(invalid);
      for (const [tier, payload] of byTier) {
        if (invalid) break;
        const merged = mergeKnowledgeModeTierPayload(root, tier, payload, "configured");
        [invalid] = preservedModeNamespaceIssues(merged, root, tier);
        root = merged;
      }
      if (invalid) {
        const reason = copyBlocked ? `The Active Mode settings cannot be copied to a Draft. ${invalid.path}: ${invalid.message}`
          : `${invalid.path}: ${invalid.message}`;
        for (const impact of impacts) {
          if (impact.affected.some(row => row.mainLineId === mainLineId) && !impact.blockers.some(row => row.mainLineId === mainLineId)) {
            impact.blockers.push({ mainLineId, mainLineName: String(line.line.name), tier: impact.tier, mode: impact.mode, reason });
          }
        }
      }
    }
  }
  const reviewToken = createKnowledgeContentDigest({ basketId, subBasketId, versionToken: input.versionToken, decision: input.decision, impacts, ...(input.inHouseScope ? { inHouseScope: input.inHouseScope } : {}) });
  return { preview: { basketId, subBasketId, reviewToken, impacts }, defaults: [...defaults.values()], patches };
}
