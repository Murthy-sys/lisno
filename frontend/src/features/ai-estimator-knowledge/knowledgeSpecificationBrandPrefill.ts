import {
  collectSpecificationItemNames,
  normalizeSpecificationItemName,
  sanitizeSpecificationItemName
} from "../../../../shared/knowledge/knowledgeSpecificationItemNames";
import {
  KNOWLEDGE_MAX_BRANDS,
  validateKnowledgeBrands,
  withSpecificationBrandIds,
  type KnowledgeSpecificationConfiguration
} from "./knowledgeSpecificationConfiguration";
import type { KnowledgeJsonObject, KnowledgeJsonValue, KnowledgeSpecificationBrandPrefill } from "./knowledgeTypes";

export interface KnowledgeSpecificationItemSelection {
  readonly name: string;
  readonly origin: "saved" | "draft" | "new";
  readonly brandPrefill?: KnowledgeSpecificationBrandPrefill;
}

type Result =
  | { readonly ok: true; readonly specification: KnowledgeSpecificationConfiguration; readonly brands: readonly KnowledgeJsonValue[]; readonly notice?: string }
  | { readonly ok: false; readonly error: string };

/** Copies suggested names into the destination draft; foreign Brand identities never enter it. */
export function prefillSpecificationBrands(
  specification: KnowledgeSpecificationConfiguration,
  selection: KnowledgeSpecificationItemSelection,
  brands: KnowledgeJsonValue | undefined,
  createBrand: (name: string) => KnowledgeJsonObject
): Result {
  if (brands !== undefined && !Array.isArray(brands)) {
    return { ok: false, error: "Review the existing Brand definitions before changing this item." };
  }
  const values = Array.isArray(brands) ? brands : [];
  const renamed = { ...specification, name: selection.name };
  if (specification.brandIds.length || specification.invalidBrandAssociation || selection.origin !== "saved") {
    return { ok: true, specification: renamed, brands: values };
  }
  if (!selection.brandPrefill || selection.brandPrefill.status !== "ready") {
    return { ok: true, specification: renamed, brands: values,
      notice: "Saved Brands could not be filled. Choose Brands manually." };
  }
  const suggested = selection.brandPrefill.names;
  if (!Array.isArray(suggested) || suggested.some(name => sanitizeSpecificationItemName(name) === null)) {
    return { ok: false, error: "Saved Brands could not be verified. Refresh the item list and try again." };
  }
  const names = collectSpecificationItemNames(suggested).map(entry => entry.name);
  if (!names.length) return { ok: true, specification: renamed, brands: values };
  if (validateKnowledgeBrands(brands ?? []).length) {
    return { ok: false, error: "Review the existing Brand definitions before filling saved Brands." };
  }
  // The validator guarantees unique, bounded local IDs and normalized names.
  const byName = new Map(values.map(value => {
    const brand = value as KnowledgeJsonObject;
    return [normalizeSpecificationItemName(brand.name as string), brand];
  }));
  const missing = names.filter(name => !byName.has(normalizeSpecificationItemName(name)));
  if (names.length > KNOWLEDGE_MAX_BRANDS || values.length + missing.length > KNOWLEDGE_MAX_BRANDS) {
    return { ok: false, error: `Filling these Brands would exceed the ${KNOWLEDGE_MAX_BRANDS}-Brand limit. Remove unused Brands first.` };
  }
  const added = missing.map(name => createBrand(name));
  const nextBrands = [...values, ...added];
  if (validateKnowledgeBrands(nextBrands).length) {
    return { ok: false, error: "The new Brand definitions could not be verified. Try selecting the item again." };
  }
  for (const brand of added) byName.set(normalizeSpecificationItemName(brand.name as string), brand);
  const ids = names.map(name => byName.get(normalizeSpecificationItemName(name))!.id as string);
  return { ok: true, specification: withSpecificationBrandIds(renamed, ids), brands: nextBrands };
}
