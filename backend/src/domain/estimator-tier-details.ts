import {
  AI_ESTIMATOR_KNOWLEDGE_MAX_ARRAY_ITEMS,
  AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT,
  AI_ESTIMATOR_KNOWLEDGE_MAX_SPECIFICATION_FIELDS
} from "./ai-estimator-knowledge.js";
import type { KnowledgeModeTier } from "./ai-estimator-knowledge-mode-tiers.js";

export interface EstimatorCatalogueTierDetails {
  specifications: Array<{
    id: string;
    name: string;
    brands: Array<{ id: string; name: string | null }>;
  }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isName = (value: unknown): value is string => typeof value === "string" &&
  value.trim().length > 0 && value.length <= AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT;
const isId = (value: unknown): value is string => isName(value) && value === value.trim();

interface SpecificationScope {
  applicability: "configured" | "not_configured" | "not_applicable";
  payload: Record<string, unknown>;
}

function readScope(value: unknown): SpecificationScope | null {
  if (!isRecord(value) || !isRecord(value.payload)) return null;
  const applicability = value.applicability;
  if (applicability !== "configured" && applicability !== "not_configured" && applicability !== "not_applicable") return null;
  return { applicability, payload: value.payload };
}

/** Undefined is an absent namespace; null is a present but malformed namespace. */
function namedScope(payload: Record<string, unknown>, name: string): SpecificationScope | null | undefined {
  if (!Object.hasOwn(payload, "tierConfigurations")) return undefined;
  if (!isRecord(payload.tierConfigurations)) return null;
  if (!Object.hasOwn(payload.tierConfigurations, name)) return undefined;
  return readScope(payload.tierConfigurations[name]);
}

/** Safe display metadata: prefer the selected tier, then Mode when its list is absent or empty. */
export function projectEstimatorTierDetails(section: unknown, tier: KnowledgeModeTier): EstimatorCatalogueTierDetails | null {
  if (!isRecord(section) || section.sectionKey !== "pricing" || !isRecord(section.payload)) return null;
  const selected = tier === "signature" ? readScope(section) : namedScope(section.payload, tier);
  if (selected === null) return null;
  const selectedDetails = selected ? projectScopeDetails(selected.payload) : null;
  // A broken list or retained disabled list is not an empty tier eligible for fallback.
  if (selected && !selectedDetails) return null;
  const selectedConfigured = selected?.applicability === "configured";
  if (selectedDetails?.specifications.length) return selectedConfigured ? selectedDetails : null;

  const mode = namedScope(section.payload, "default");
  const modeDetails = mode?.applicability === "configured" ? projectScopeDetails(mode.payload) : null;
  return modeDetails?.specifications.length ? modeDetails : selectedConfigured ? selectedDetails : null;
}

function projectScopeDetails(payload: Record<string, unknown>): EstimatorCatalogueTierDetails | null {
  const rows = payload.specifications === undefined ? [] : payload.specifications;
  if (!Array.isArray(rows) || rows.length > AI_ESTIMATOR_KNOWLEDGE_MAX_SPECIFICATION_FIELDS) return null;

  const brandNames = new Map<string, string | null>();
  if (Array.isArray(payload.brands) && payload.brands.length <= AI_ESTIMATOR_KNOWLEDGE_MAX_ARRAY_ITEMS) {
    for (const brand of payload.brands) {
      if (!isRecord(brand) || !isId(brand.id)) continue;
      // Duplicate IDs are ambiguous even when one of the names is invalid.
      brandNames.set(brand.id, brandNames.has(brand.id) || !isName(brand.name) ? null : brand.name);
    }
  }

  const specifications: EstimatorCatalogueTierDetails["specifications"] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row) || !isId(row.id) || !isName(row.name) || ids.has(row.id)) return null;
    ids.add(row.id);
    if (Object.hasOwn(row, "brandId") && Object.hasOwn(row, "brandIds")) return null;
    const references = Object.hasOwn(row, "brandId") ? [row.brandId]
      : Object.hasOwn(row, "brandIds") ? row.brandIds : [];
    if (!Array.isArray(references) || references.length > AI_ESTIMATOR_KNOWLEDGE_MAX_ARRAY_ITEMS ||
      !references.every(isId) || new Set(references).size !== references.length) return null;
    specifications.push({ id: row.id, name: row.name,
      brands: references.map(id => ({ id, name: brandNames.get(id) ?? null })) });
  }
  return { specifications };
}
