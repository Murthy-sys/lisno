import {
  estimateSlabCostPaise,
  parseScaledQuantity
} from "./knowledgeSlabRate";
import { parseKnowledgeSpecifications } from "./knowledgeSpecificationConfiguration";
import type {
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster,
  KnowledgeSectionKey
} from "./knowledgeTypes";

export interface KnowledgeValidationIssue {
  readonly path: string;
  readonly message: string;
}

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;

export interface KnowledgeSectionValidationContext {
  readonly specifications?: KnowledgeJsonValue;
  readonly uoms?: readonly KnowledgeMaster[];
  readonly vendors?: readonly KnowledgeMaster[];
  readonly uomCatalogStatus?: "loading" | "ready" | "error";
  readonly vendorCatalogStatus?: "loading" | "ready" | "error";
}

export function validateKnowledgeSection(
  sectionKey: KnowledgeSectionKey,
  payload: KnowledgeJsonObject,
  context: KnowledgeSectionValidationContext = {}
): readonly KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  const rows = (key: string) => Array.isArray(payload[key]) ? payload[key].filter(isObject) : [];
  const requireString = (row: KnowledgeJsonObject, key: string, path: string) => {
    if (typeof row[key] !== "string" || !row[key].trim()) issues.push({ path: `${path}.${key}`, message: `${label(key)} is required.` });
  };
  if (sectionKey === "pricing") {
    issues.push(...parseKnowledgeSpecifications(payload.specifications).issues);
    rows("priceEntries").forEach((row, index) => {
      const path = `priceEntries.${index}`;
      if (row.operation === "reference") {
        if (!string(row.priceEntryId) || !string(row.priceVersionId)) {
          issues.push({ path, message: "Saved budget details are unavailable. Reload Budgeting and try again." });
        }
        return;
      }
      if (row.operation !== "set_budget" && row.operation !== "append") {
        issues.push({ path, message: "This budget needs attention before it can be saved." });
        return;
      }

      requireBudgetString(row, "vendorId", "Vendor", path, issues);
      requireBudgetString(row, "uomId", "Unit of measure", path, issues);
      requireBudgetString(row, "effectiveFrom", "Starts on", path, issues);
      if (row.operation === "append") {
        let missingCompatibilityValue = !string(row.priceEntryId);
        for (const key of ["taxRuleId", "taxVersionId", "treatment", "status"] as const) {
          missingCompatibilityValue ||= !string(row[key]);
        }
        if (missingCompatibilityValue) {
          issues.push({ path, message: "This budget needs attention before it can be saved." });
        }
      }
      if (
        row.operation === "set_budget"
        && row.sourcePriceVersionId !== undefined
        && row.sourcePriceVersionId !== null
        && (typeof row.sourcePriceVersionId !== "string" || !row.sourcePriceVersionId.trim())
      ) {
        issues.push({ path, message: "This saved budget can no longer be updated safely. Reload Budgeting and try again." });
      }
      if (!Number.isSafeInteger(row.inputAmountPaise) || (row.inputAmountPaise as number) < 0) {
        issues.push({ path: `${path}.inputAmountPaise`, message: "Enter a non-negative rupee amount with up to two decimal places." });
      }
      const startsOn = typeof row.effectiveFrom === "string" ? Date.parse(row.effectiveFrom) : Number.NaN;
      if (typeof row.effectiveFrom === "string" && row.effectiveFrom.trim() && Number.isNaN(startsOn)) {
        issues.push({ path: `${path}.effectiveFrom`, message: "Enter a valid start date and time." });
      }
      if (row.effectiveTo !== null && row.effectiveTo !== undefined && row.effectiveTo !== "") {
        const endsOn = typeof row.effectiveTo === "string" ? Date.parse(row.effectiveTo) : Number.NaN;
        if (Number.isNaN(endsOn)) {
          issues.push({ path: `${path}.effectiveTo`, message: "Enter a valid end date and time." });
        } else if (!Number.isNaN(startsOn) && endsOn <= startsOn) {
          issues.push({ path: `${path}.effectiveTo`, message: "Ends on must be later than Starts on." });
        }
      }

      requireActiveBudgetMaster(row, "vendorId", "Vendor", context.vendors, context.vendorCatalogStatus, path, issues);
      requireActiveBudgetMaster(row, "uomId", "Unit of measure", context.uoms, context.uomCatalogStatus, path, issues);
      requireBudgetCatalog("vendorId", "Vendor", context.vendorCatalogStatus, path, issues);
      requireBudgetCatalog("uomId", "Unit of measure", context.uomCatalogStatus, path, issues);
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
    const slabRates = rows("slabRates");
    if (slabRates.length > 0 && context.uomCatalogStatus && context.uomCatalogStatus !== "ready") {
      issues.push({ path: "slabRates", message: "Load the complete Unit of measure list before saving Quantity slabs." });
    }
    const parsedSpecifications = context.specifications === undefined
      ? null
      : parseKnowledgeSpecifications(context.specifications);
    const invalidSpecificationIndices = new Set(parsedSpecifications?.issues.flatMap(({ path }) => {
      const match = /^specifications\.(\d+)\.name$/u.exec(path);
      return match ? [Number(match[1])] : [];
    }) ?? []);
    const specificationIds = new Set(parsedSpecifications?.specifications
      .filter((specification, index) => specification.id.trim() && specification.name.trim() && !invalidSpecificationIndices.has(index))
      .map(({ id }) => id) ?? []);
    const rowIds = new Set<string>();
    const tuples = new Set<string>();
    slabRates.forEach((row, index) => {
      const path = `slabRates.${index}`;
      requireString(row, "id", path);
      if (!string(row.specificationId)) {
        issues.push({ path: `${path}.specificationId`, message: "Specification is required." });
      }
      if (!string(row.uomId)) {
        issues.push({ path: `${path}.uomId`, message: "Unit of measure is required." });
      }
      const id = string(row.id);
      if (id && rowIds.has(id)) issues.push({ path: `${path}.id`, message: "Quantity slab IDs must be unique." });
      if (id) rowIds.add(id);

      const specificationId = string(row.specificationId);
      if (specificationId && parsedSpecifications && !specificationIds.has(specificationId)) {
        issues.push({ path: `${path}.specificationId`, message: "Choose an available Specification from Budgeting." });
      }

      const uomId = string(row.uomId);
      const uom = context.uoms?.find(({ id: candidateId }) => candidateId === uomId);
      const quantity = typeof row.quantity === "string" ? row.quantity : "";
      let normalizedTupleQuantity: string | null = null;
      if (!quantity) {
        issues.push({ path: `${path}.quantity`, message: "Quantity is required." });
      } else if (uom && typeof uom.decimalScale === "number") {
        const parsedQuantity = parseScaledQuantity(quantity, uom.decimalScale);
        if (parsedQuantity.status !== "valid") {
          issues.push({
            path: `${path}.quantity`,
            message: parsedQuantity.reason === "scale"
              ? `Quantity supports up to ${uom.decimalScale} decimal place${uom.decimalScale === 1 ? "" : "s"} for this Unit.`
              : parsedQuantity.reason === "positive"
                ? "Quantity must be greater than zero."
                : "Enter a positive canonical decimal Quantity."
          });
        } else {
          normalizedTupleQuantity = parsedQuantity.scaledQuantity.toString();
        }
      } else if (!DECIMAL.test(quantity) || /^0(?:\.0+)?$/u.test(quantity)) {
        issues.push({ path: `${path}.quantity`, message: "Enter a positive canonical decimal Quantity." });
      } else {
        normalizedTupleQuantity = normalizeCanonicalDecimal(quantity);
      }

      const unitRatePaise = row.unitRatePaise;
      if (!Number.isSafeInteger(unitRatePaise) || (unitRatePaise as number) < 0) {
        issues.push({ path: `${path}.unitRatePaise`, message: "Enter a non-negative Unit rate in rupees with up to two decimal places." });
      }
      if (Object.hasOwn(row, "estimatedCostPaise")) {
        issues.push({ path: `${path}.estimatedCostPaise`, message: "Estimated cost is calculated and must not be stored." });
      }

      if (specificationId && uomId && normalizedTupleQuantity !== null) {
        const tuple = JSON.stringify([specificationId, uomId, normalizedTupleQuantity]);
        if (tuples.has(tuple)) {
          issues.push({ path, message: "Specification, Unit, and Quantity must be unique within Quantity slabs." });
        }
        tuples.add(tuple);
      }
      if (
        uom &&
        typeof uom.decimalScale === "number" &&
        Number.isSafeInteger(unitRatePaise) &&
        (unitRatePaise as number) >= 0 &&
        quantity &&
        parseScaledQuantity(quantity, uom.decimalScale).status === "valid" &&
        estimateSlabCostPaise(quantity, unitRatePaise as number, uom.decimalScale) === null
      ) {
        issues.push({ path: `${path}.unitRatePaise`, message: "Quantity × Unit rate exceeds the supported money range." });
      }
    });
  }
  if (sectionKey === "scope") rows("exclusions").forEach((row, index) => {
    if (!string(row.targetBasketId) && !string(row.targetMainLineId)) issues.push({ path: `exclusions.${index}`, message: "Choose a target Basket or Main Line." });
  });
  if (sectionKey === "recommendations") rows("exclusions").forEach((row, index) => {
    requireString(row, "name", `exclusions.${index}`);
  });
  if (sectionKey === "recommendations") rows("recommendations").forEach((row, index) => {
    const path = `recommendations.${index}`;
    for (const key of ["name", "priorityId"]) requireString(row, key, path);
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

function requireActiveBudgetMaster(
  row: KnowledgeJsonObject,
  field: "vendorId" | "uomId",
  fieldLabel: string,
  masters: readonly KnowledgeMaster[] | undefined,
  catalogStatus: "loading" | "ready" | "error" | undefined,
  path: string,
  issues: KnowledgeValidationIssue[]
) {
  const id = string(row[field]);
  if (!id || !masters || catalogStatus !== "ready") return;
  const selected = masters.find((master) => master.id === id);
  if (!selected || selected.status !== "active") {
    issues.push({ path: `${path}.${field}`, message: `Choose an active ${fieldLabel}.` });
  }
}

function requireBudgetString(
  row: KnowledgeJsonObject,
  field: "vendorId" | "uomId" | "effectiveFrom",
  fieldLabel: string,
  path: string,
  issues: KnowledgeValidationIssue[]
) {
  if (!string(row[field])) {
    issues.push({ path: `${path}.${field}`, message: `${fieldLabel} is required.` });
  }
}

function requireBudgetCatalog(
  field: "vendorId" | "uomId",
  fieldLabel: string,
  status: "loading" | "ready" | "error" | undefined,
  path: string,
  issues: KnowledgeValidationIssue[]
) {
  if (status && status !== "ready") {
    issues.push({
      path: `${path}.${field}`,
      message: `Load ${fieldLabel} options before saving this budget.`
    });
  }
}

function requireCanonical(value: KnowledgeJsonValue | undefined, path: string, issues: KnowledgeValidationIssue[]) {
  if (typeof value !== "string" || !DECIMAL.test(value)) issues.push({ path, message: "Enter a canonical non-negative decimal value." });
}
function string(value: KnowledgeJsonValue | undefined): string { return typeof value === "string" ? value.trim() : ""; }
function isObject(value: KnowledgeJsonValue): value is KnowledgeJsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
function label(value: string): string { return value.replace(/([A-Z])/gu, " $1").replace(/^./u, (char) => char.toUpperCase()); }
function normalizeCanonicalDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const normalizedFraction = fraction.replace(/0+$/u, "");
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole!;
}
function hasCycle(edges: ReadonlyMap<string, readonly string[]>): boolean {
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const next of edges.get(id) ?? []) if (visit(next)) return true; visiting.delete(id); visited.add(id); return false; };
  return [...edges.keys()].some(visit);
}
