import type { KnowledgeSpecificationItemName } from "../contracts/ai-estimator-knowledge.js";
import { normalizeSpecificationItemName, sanitizeSpecificationItemName } from "./knowledge-specification-item-names.js";

const MAX_BRANDS = 200;
const MAX_ID_LENGTH = 240;
type Row = Record<string, unknown>;
const record = (value: unknown): Row => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Row : {};
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0
  && value.length <= MAX_ID_LENGTH && value.trim() === value;
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

interface ItemGroup {
  name: string;
  names: Map<string, string>;
  invalid: boolean;
  tooMany: boolean;
}

/** Resolve source IDs within each pricing scope before grouping reusable display values. */
export function collectSpecificationItemsWithBrandPrefill(payloads: readonly unknown[]): KnowledgeSpecificationItemName[] {
  const groups = new Map<string, ItemGroup>();
  for (const payload of payloads) {
    const scope = record(payload);
    if (!Array.isArray(scope.specifications)) continue;
    const brandsById = new Map<string, Row[]>();
    const brandNameCounts = new Map<string, number>();
    if (Array.isArray(scope.brands)) for (const value of scope.brands) {
      const brand = record(value);
      if (!validId(brand.id)) continue;
      const rows = brandsById.get(brand.id) ?? [];
      rows.push(brand);
      brandsById.set(brand.id, rows);
      const name = sanitizeSpecificationItemName(brand.name);
      if (name) {
        const key = normalizeSpecificationItemName(name);
        brandNameCounts.set(key, (brandNameCounts.get(key) ?? 0) + 1);
      }
    }
    for (const value of scope.specifications) {
      const specification = record(value);
      const name = sanitizeSpecificationItemName(specification.name);
      if (!name) continue;
      const key = normalizeSpecificationItemName(name);
      const group = groups.get(key) ?? { name, names: new Map<string, string>(), invalid: false, tooMany: false };
      if (compare(name, group.name) < 0) group.name = name;
      groups.set(key, group);
      const ids = associationIds(specification);
      if (ids === null) { group.invalid = true; continue; }
      for (const id of ids) {
        const candidates = brandsById.get(id) ?? [];
        const brandName = candidates.length === 1 ? sanitizeSpecificationItemName(candidates[0]!.name) : null;
        if (!brandName || brandNameCounts.get(normalizeSpecificationItemName(brandName)) !== 1) {
          group.invalid = true;
          continue;
        }
        const brandKey = normalizeSpecificationItemName(brandName);
        const previous = group.names.get(brandKey);
        if (previous !== undefined) {
          if (compare(brandName, previous) < 0) group.names.set(brandKey, brandName);
        } else if (group.names.size < MAX_BRANDS) {
          group.names.set(brandKey, brandName);
        } else {
          group.tooMany = true;
        }
      }
    }
  }
  return [...groups].sort(([left], [right]) => compare(left, right)).map(([, group]) => ({
    name: group.name,
    brandPrefill: group.invalid ? { status: "unavailable", reason: "invalid_source" }
      : group.tooMany ? { status: "unavailable", reason: "too_many_brands" }
      : { status: "ready", names: [...group.names].sort(([left], [right]) => compare(left, right)).map(([, name]) => name) }
  }));
}

function associationIds(specification: Row): string[] | null {
  const single = Object.hasOwn(specification, "brandId");
  const multiple = Object.hasOwn(specification, "brandIds");
  if (single && multiple) return null;
  const ids = single ? [specification.brandId] : multiple ? specification.brandIds : [];
  if (!Array.isArray(ids) || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length) return null;
  return ids as string[];
}
