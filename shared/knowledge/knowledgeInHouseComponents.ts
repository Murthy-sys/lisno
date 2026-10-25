import { modeCalculationIssues, modeCalculationsForPayload, type ModeCalculationSettings } from "./knowledgeModeCalculation";
import { parseKnowledgeModeConfigurations, partitionKnowledgeModeConfigurations } from "./knowledgeModeConfiguration";
import { inHouseScopeStarterItems, normalizePmcScopeName, parsePmcScopeItems, type KnowledgePmcScopeItem } from "./knowledgePmcScope";
import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

export const MAX_IN_HOUSE_COMPONENTS = 50;
export const LEGACY_IN_HOUSE_COMPONENT_ID = "legacy-in-house";

export interface KnowledgeInHouseComponent {
  readonly id: string;
  readonly basketId: string;
  readonly subBasketId: string | null;
  readonly inclusions: readonly KnowledgePmcScopeItem[];
  readonly exclusions: readonly KnowledgePmcScopeItem[];
  readonly labor: ModeCalculationSettings | null;
  readonly material: ModeCalculationSettings | null;
}

type Issue = { readonly path: string; readonly message: string };
const componentKeys = ["id", "basketId", "subBasketId", "inclusions", "exclusions", "labor", "material"];
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128 && value === value.trim();

/** Absent storage stays legacy. An explicit empty list never inherits legacy costs. */
export function parseInHouseComponents(value: KnowledgeJsonValue | undefined): {
  readonly components: readonly KnowledgeInHouseComponent[];
  readonly issues: readonly Issue[];
} {
  if (value === undefined) return { components: [], issues: [] };
  if (!Array.isArray(value)) return { components: [], issues: [{ path: "inHouseComponents", message: "In-house components must be a list." }] };
  const issues: Issue[] = [];
  const components: KnowledgeInHouseComponent[] = [];
  if (value.length > MAX_IN_HOUSE_COMPONENTS) issues.push({ path: "inHouseComponents", message: `Add up to ${MAX_IN_HOUSE_COMPONENTS} In-house components.` });
  const ids = new Set<string>();
  const targets = new Set<string>();
  value.forEach((raw, index) => {
    const path = `inHouseComponents.${index}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({ path, message: "Each In-house component must have saved settings." });
      return;
    }
    for (const key of Object.keys(raw)) if (!componentKeys.includes(key)) issues.push({ path: `${path}.${key}`, message: "Unknown In-house component setting." });
    for (const key of componentKeys) if (!Object.hasOwn(raw, key)) issues.push({ path: `${path}.${key}`, message: "This component setting is missing." });
    if (!validId(raw.id)) issues.push({ path: `${path}.id`, message: "A valid component ID is required." });
    if (!validId(raw.basketId)) issues.push({ path: `${path}.basketId`, message: "Select a Main basket." });
    if (!validId(raw.subBasketId) && !(raw.id === LEGACY_IN_HOUSE_COMPONENT_ID && raw.subBasketId === null)) {
      issues.push({ path: `${path}.subBasketId`, message: "Select a Sub-basket." });
    }
    const id = typeof raw.id === "string" ? raw.id : "";
    const basketId = typeof raw.basketId === "string" ? raw.basketId : "";
    const subBasketId = typeof raw.subBasketId === "string" ? raw.subBasketId : null;
    if (ids.has(id)) issues.push({ path: `${path}.id`, message: "Component IDs must be unique." });
    ids.add(id);
    const target = JSON.stringify([basketId, subBasketId]);
    if (targets.has(target)) issues.push({ path: `${path}.subBasketId`, message: "This Sub-basket is already a component." });
    targets.add(target);
    const inclusions = parsePmcScopeItems(raw.inclusions, `${path}.inclusions`);
    const exclusions = parsePmcScopeItems(raw.exclusions, `${path}.exclusions`);
    issues.push(...inclusions.issues, ...exclusions.issues);
    const includedNames = new Set(inclusions.items.filter(({ selected }) => selected).map(({ name }) => normalizePmcScopeName(name)));
    exclusions.items.forEach((item, row) => {
      if (item.selected && includedNames.has(normalizePmcScopeName(item.name))) issues.push({ path: `${path}.exclusions.${row}.selected`, message: "An item cannot be included and excluded in the same component." });
    });
    for (const key of ["labor", "material"] as const) {
      // Validate with the established In-house rules, then locate issues in this component.
      const canonicalPath = `modeCalculations.in_house_${key}`;
      issues.push(...modeCalculationIssues(raw[key], canonicalPath).map((issue) => ({ ...issue, path: issue.path.replace(canonicalPath, `${path}.${key}`) })));
    }
    components.push({ id, basketId, subBasketId, inclusions: inclusions.items, exclusions: exclusions.items,
      labor: (raw.labor ?? null) as unknown as ModeCalculationSettings | null,
      material: (raw.material ?? null) as unknown as ModeCalculationSettings | null });
  });
  return { components, issues };
}

export function inHouseComponentsIssues(payload: KnowledgeJsonObject): readonly Issue[] {
  return Object.hasOwn(payload, "inHouseComponents") ? parseInHouseComponents(payload.inHouseComponents).issues : [];
}

export function withInHouseComponents(payload: KnowledgeJsonObject, components: readonly KnowledgeInHouseComponent[]): KnowledgeJsonObject {
  return { ...payload, inHouseComponents: components.map((component) => ({
    id: component.id, basketId: component.basketId, subBasketId: component.subBasketId,
    inclusions: component.inclusions.map((item) => ({ ...item })), exclusions: component.exclusions.map((item) => ({ ...item })),
    labor: component.labor ? { ...component.labor } : null, material: component.material ? { ...component.material } : null
  })) };
}

/** Copy configuration content without changing either component's catalogue or estimate identity. */
export function copyInHouseComponentConfiguration(
  payload: KnowledgeJsonObject,
  sourceId: string,
  targetId: string
): KnowledgeJsonObject | null {
  if (sourceId === targetId || !Object.hasOwn(payload, "inHouseComponents")) return null;
  const parsed = parseInHouseComponents(payload.inHouseComponents);
  if (parsed.issues.length) return null;
  const source = parsed.components.find(({ id }) => id === sourceId);
  const target = parsed.components.find(({ id }) => id === targetId);
  if (!source || !target) return null;
  return withInHouseComponents(payload, parsed.components.map((component) => component.id === targetId
    ? { ...component, inclusions: source.inclusions, exclusions: source.exclusions, labor: source.labor, material: source.material }
    : component));
}

/** Preserve the whole existing editor on first addition, including unconfigured sections. */
export function legacyInHouseComponent(payload: KnowledgeJsonObject, owner: { readonly basketId: string; readonly subBasketId?: string | null }): KnowledgeInHouseComponent {
  const costs = modeCalculationsForPayload(payload);
  const scoped = payload.modeCalculations;
  const hasSplitCosts = scoped !== null && typeof scoped === "object" && !Array.isArray(scoped)
    && (Object.hasOwn(scoped, "in_house_labor") || Object.hasOwn(scoped, "in_house_material"));
  const configuration = partitionKnowledgeModeConfigurations(parseKnowledgeModeConfigurations(payload.modeConfigurations).configurations).primary.execution.in_house;
  return { id: LEGACY_IN_HOUSE_COMPONENT_ID, basketId: owner.basketId, subBasketId: owner.subBasketId ?? null,
    inclusions: (configuration?.inclusions ?? inHouseScopeStarterItems("inclusions")).map((item) => ({ ...item })),
    exclusions: (configuration?.exclusions ?? inHouseScopeStarterItems("exclusions")).map((item) => ({ ...item })),
    labor: costs.in_house_labor as unknown as ModeCalculationSettings | null,
    // An older single cost is not a second Material expense. Its split needs review.
    material: hasSplitCosts ? costs.in_house_material as unknown as ModeCalculationSettings | null : null };
}

export function inHouseComponentBaseRatePaise(component: KnowledgeInHouseComponent): number | null {
  if (!component.labor || !component.material) return null;
  if (modeCalculationIssues(component.labor as unknown as KnowledgeJsonValue, "modeCalculations.in_house_labor").length
    || modeCalculationIssues(component.material as unknown as KnowledgeJsonValue, "modeCalculations.in_house_material").length) return null;
  const rate = component.labor.baseRatePaise + component.material.baseRatePaise;
  return Number.isSafeInteger(rate) ? rate : null;
}
