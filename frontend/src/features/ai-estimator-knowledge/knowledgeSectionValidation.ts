import type { KnowledgeJsonObject, KnowledgeJsonValue, KnowledgeSectionKey } from "./knowledgeTypes";
import { parseKnowledgeSpecifications } from "./knowledgeSpecificationConfiguration";

export interface KnowledgeValidationIssue {
  readonly path: string;
  readonly message: string;
}

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;

export function validateKnowledgeSection(sectionKey: KnowledgeSectionKey, payload: KnowledgeJsonObject): readonly KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  const rows = (key: string) => Array.isArray(payload[key]) ? payload[key].filter(isObject) : [];
  const requireString = (row: KnowledgeJsonObject, key: string, path: string) => {
    if (typeof row[key] !== "string" || !row[key].trim()) issues.push({ path: `${path}.${key}`, message: `${label(key)} is required.` });
  };
  if (sectionKey === "pricing") {
    issues.push(...parseKnowledgeSpecifications(payload.specifications).issues);
    rows("priceEntries").forEach((row, index) => {
      const path = `priceEntries.${index}`;
      requireString(row, "priceEntryId", path);
      if (row.operation === "reference") requireString(row, "priceVersionId", path);
      else for (const key of ["vendorId", "uomId", "taxRuleId", "taxVersionId", "treatment", "effectiveFrom", "status"]) requireString(row, key, path);
      if (row.operation !== "reference" && (!Number.isSafeInteger(row.inputAmountPaise) || (row.inputAmountPaise as number) < 0)) issues.push({ path: `${path}.inputAmountPaise`, message: "Enter a non-negative rupee amount with up to two decimal places." });
      if (typeof row.effectiveFrom === "string" && typeof row.effectiveTo === "string" && row.effectiveTo && row.effectiveTo <= row.effectiveFrom) issues.push({ path: `${path}.effectiveTo`, message: "Effective to must be later than effective from." });
    });
  }
  if (sectionKey === "quantity-margin") {
    for (const key of ["startMarginBps", "bottomMarginBps", "pmcMarkupBps", "wastageBps"]) {
      const value = payload[key];
      if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 10_000)) issues.push({ path: key, message: `${label(key)} must be an integer from 0 to 10000.` });
    }
    rows("quantitySlabs").forEach((row, index) => {
      const path = `quantitySlabs.${index}`;
      requireCanonical(row.minimumQuantity, `${path}.minimumQuantity`, issues);
      if (row.maximumQuantity !== null && row.maximumQuantity !== undefined) requireCanonical(row.maximumQuantity, `${path}.maximumQuantity`, issues);
      if (typeof row.minimumQuantity === "string" && typeof row.maximumQuantity === "string" && Number(row.minimumQuantity) >= Number(row.maximumQuantity)) issues.push({ path: `${path}.maximumQuantity`, message: "Maximum quantity must be greater than minimum quantity." });
    });
  }
  if (sectionKey === "scope") rows("exclusions").forEach((row, index) => {
    if (!string(row.targetBasketId) && !string(row.targetMainLineId)) issues.push({ path: `exclusions.${index}`, message: "Choose a target Basket or Main Line." });
  });
  if (sectionKey === "recommendations") rows("recommendations").forEach((row, index) => {
    const path = `recommendations.${index}`;
    for (const key of ["targetBasketId", "targetMainLineId", "type", "reason", "quantityRelationship"]) requireString(row, key, path);
    if (row.quantityRelationship !== "same_quantity") requireCanonical(row.quantityValue, `${path}.quantityValue`, issues);
  });
  if (sectionKey === "quality") rows("parameters").forEach((row, index) => {
    const path = `parameters.${index}`;
    requireString(row, "type", path); requireString(row, "label", path);
    const type = string(row.type);
    const allowed = Array.isArray(row.allowedValues) ? row.allowedValues.filter((item): item is string => typeof item === "string") : [];
    if (["dropdown", "radio", "multi_select"].includes(type) && allowed.length === 0) issues.push({ path: `${path}.allowedValues`, message: "Add at least one allowed value." });
    if (type === "number") {
      if (row.defaultValue !== null && row.defaultValue !== undefined) requireCanonical(row.defaultValue, `${path}.defaultValue`, issues);
      if (typeof row.minimum === "string" && typeof row.maximum === "string" && Number(row.minimum) > Number(row.maximum)) issues.push({ path: `${path}.maximum`, message: "Maximum must be greater than or equal to minimum." });
    }
    if ((type === "dropdown" || type === "radio") && typeof row.defaultValue === "string" && row.defaultValue && !allowed.includes(row.defaultValue)) issues.push({ path: `${path}.defaultValue`, message: "Default value must be one of the allowed values." });
    if (type === "multi_select" && Array.isArray(row.defaultValue) && row.defaultValue.some((item) => typeof item !== "string" || !allowed.includes(item))) issues.push({ path: `${path}.defaultValue`, message: "Every default value must be allowed." });
  });
  if (sectionKey === "execution") {
    const steps = rows("steps");
    const ids = new Set(steps.map((row) => string(row.id)).filter(Boolean));
    const edges = new Map<string, readonly string[]>();
    steps.forEach((row, index) => {
      const path = `steps.${index}`; requireString(row, "name", path);
      const id = string(row.id); const dependencies = Array.isArray(row.dependencyStepIds) ? row.dependencyStepIds.filter((item): item is string => typeof item === "string") : [];
      if (dependencies.some((dependency) => dependency === id || !ids.has(dependency))) issues.push({ path: `${path}.dependencyStepIds`, message: "Dependencies must reference another step in this section." });
      edges.set(id, dependencies);
    });
    if (hasCycle(edges)) issues.push({ path: "steps", message: "Execution step dependencies must not contain a cycle." });
  }
  if (sectionKey === "advanced") rows("dependencies").forEach((row, index) => {
    if (!string(row.targetMainLineId)) issues.push({ path: `dependencies.${index}.targetMainLineId`, message: "Target Main Line is required." });
  });
  return issues;
}

function requireCanonical(value: KnowledgeJsonValue | undefined, path: string, issues: KnowledgeValidationIssue[]) {
  if (typeof value !== "string" || !DECIMAL.test(value)) issues.push({ path, message: "Enter a canonical non-negative decimal value." });
}
function string(value: KnowledgeJsonValue | undefined): string { return typeof value === "string" ? value.trim() : ""; }
function isObject(value: KnowledgeJsonValue): value is KnowledgeJsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
function label(value: string): string { return value.replace(/([A-Z])/gu, " $1").replace(/^./u, (char) => char.toUpperCase()); }
function hasCycle(edges: ReadonlyMap<string, readonly string[]>): boolean {
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const next of edges.get(id) ?? []) if (visit(next)) return true; visiting.delete(id); visited.add(id); return false; };
  return [...edges.keys()].some(visit);
}
