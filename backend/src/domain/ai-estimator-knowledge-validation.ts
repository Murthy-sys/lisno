import type {
  KnowledgeQualityParameter,
  KnowledgeQuantitySlab
} from "../contracts/ai-estimator-knowledge.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS,
  AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS,
  AI_ESTIMATOR_KNOWLEDGE_MAX_ARRAY_ITEMS,
  AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT,
  AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT,
  AI_ESTIMATOR_KNOWLEDGE_QUANTITY_GAP_BEHAVIORS,
  AI_ESTIMATOR_KNOWLEDGE_QUANTITY_RELATIONSHIPS,
  AI_ESTIMATOR_KNOWLEDGE_QUALITY_PARAMETER_TYPES,
  AI_ESTIMATOR_KNOWLEDGE_RECOMMENDATION_TYPES,
  AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
  AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS,
  AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_MAX_MONEY_PAISE,
  normalizeKnowledgeIdentity,
  type KnowledgeQuantityGapBehavior,
  type KnowledgeSectionKey
} from "./ai-estimator-knowledge.js";
import { parseScaledDecimal } from "./ai-estimator-knowledge-calculation.js";

export type { KnowledgeCompletenessSectionInput } from "./ai-estimator-knowledge-completeness.js";

const MAX_SECTION_BYTES = 256 * 1024;
const MAX_OBJECT_KEYS = 100;
const MAX_NESTING_DEPTH = 10;

export interface KnowledgeValidationIssue {
  path: string;
  code: string;
  message: string;
}

export class KnowledgeValidationError extends Error {
  constructor(public readonly issues: KnowledgeValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "));
    this.name = "KnowledgeValidationError";
  }
}

export interface KnowledgeEffectiveWindow {
  id: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export function validateEffectiveWindow(
  window: KnowledgeEffectiveWindow
): KnowledgeValidationIssue[] {
  if (Number.isNaN(window.effectiveFrom.getTime())) {
    return [{ path: "effectiveFrom", code: "INVALID_DATE", message: "Effective start is invalid." }];
  }
  if (window.effectiveTo !== null) {
    if (Number.isNaN(window.effectiveTo.getTime())) {
      return [{ path: "effectiveTo", code: "INVALID_DATE", message: "Effective end is invalid." }];
    }
    if (window.effectiveFrom.getTime() >= window.effectiveTo.getTime()) {
      return [{
        path: "effectiveTo",
        code: "INVALID_EFFECTIVE_WINDOW",
        message: "Effective end must be later than effective start."
      }];
    }
  }
  return [];
}

export function findOverlappingEffectiveWindows(
  windows: readonly KnowledgeEffectiveWindow[]
): Array<[string, string]> {
  const sorted = [...windows].sort(
    (left, right) =>
      left.effectiveFrom.getTime() - right.effectiveFrom.getTime() ||
      left.id.localeCompare(right.id)
  );
  const overlaps: Array<[string, string]> = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    if (validateEffectiveWindow(current).length > 0) continue;
    const currentEnd = current.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
    for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
      const next = sorted[nextIndex]!;
      if (next.effectiveFrom.getTime() >= currentEnd) break;
      if (validateEffectiveWindow(next).length === 0) {
        overlaps.push([current.id, next.id]);
      }
    }
  }
  return overlaps;
}

export function validateQuantitySlabs(input: {
  slabs: readonly KnowledgeQuantitySlab[];
  decimalScale: number;
  gapBehavior: KnowledgeQuantityGapBehavior;
}): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if (input.slabs.length > AI_ESTIMATOR_KNOWLEDGE_MAX_ARRAY_ITEMS) {
    issues.push({ path: "slabs", code: "TOO_MANY_ITEMS", message: "Too many quantity slabs." });
    return issues;
  }
  let previousMaximum: bigint | null = null;
  const ids = new Set<string>();
  input.slabs.forEach((slab, index) => {
    const path = `slabs.${index}`;
    if (ids.has(slab.id)) {
      issues.push({ path: `${path}.id`, code: "DUPLICATE_ID", message: "Quantity slab IDs must be unique." });
    }
    ids.add(slab.id);
    try {
      const minimum = parseScaledDecimal(slab.minimumQuantity, input.decimalScale);
      const maximum = slab.maximumQuantity === null
        ? null
        : parseScaledDecimal(slab.maximumQuantity, input.decimalScale);
      if (maximum !== null && minimum >= maximum) {
        issues.push({ path: `${path}.maximumQuantity`, code: "INVALID_RANGE", message: "Quantity slab maximum must exceed its minimum." });
      }
      if (previousMaximum === null && index > 0) {
        issues.push({ path, code: "SLAB_AFTER_OPEN_END", message: "No slab may follow an open-ended slab." });
      } else if (previousMaximum !== null) {
        if (minimum < previousMaximum) {
          issues.push({ path: `${path}.minimumQuantity`, code: "SLAB_OVERLAP", message: "Quantity slabs cannot overlap." });
        } else if (minimum > previousMaximum && input.gapBehavior === "reject") {
          issues.push({ path: `${path}.minimumQuantity`, code: "SLAB_GAP", message: "Quantity slab gaps require no_adjustment behavior." });
        }
      }
      previousMaximum = maximum;
    } catch (error) {
      issues.push({ path, code: "INVALID_QUANTITY", message: error instanceof Error ? error.message : "Quantity is invalid." });
    }
    if (!Number.isSafeInteger(slab.adjustmentBps) || slab.adjustmentBps < 0 || slab.adjustmentBps > AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS) {
      issues.push({ path: `${path}.adjustmentBps`, code: "INVALID_BPS", message: "Quantity adjustment must be between 0 and 10000 basis points." });
    }
  });
  return issues;
}

export interface KnowledgeGraphEdge {
  fromId: string;
  toId: string;
}

export function validateAcyclicGraph(
  nodeIds: readonly string[],
  edges: readonly KnowledgeGraphEdge[]
): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  const nodes = new Set(nodeIds);
  const edgeKeys = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const nodeId of nodes) adjacency.set(nodeId, []);

  edges.forEach((edge, index) => {
    const path = `edges.${index}`;
    if (!nodes.has(edge.fromId) || !nodes.has(edge.toId)) {
      issues.push({ path, code: "INVALID_REFERENCE", message: "Dependency references an unknown stable ID." });
      return;
    }
    if (edge.fromId === edge.toId) {
      issues.push({ path, code: "SELF_DEPENDENCY", message: "A resource cannot depend on itself." });
      return;
    }
    const key = `${edge.fromId}\u0000${edge.toId}`;
    if (edgeKeys.has(key)) {
      issues.push({ path, code: "DUPLICATE_EDGE", message: "Dependency edges must be unique." });
      return;
    }
    edgeKeys.add(key);
    adjacency.get(edge.fromId)!.push(edge.toId);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const targetId of adjacency.get(nodeId) ?? []) {
      if (visit(targetId)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  if ([...nodes].some(visit)) {
    issues.push({ path: "edges", code: "DEPENDENCY_CYCLE", message: "Dependency graph cannot contain a cycle." });
  }
  return issues;
}

export function validateQualityParameter(
  parameter: KnowledgeQualityParameter
): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if (!AI_ESTIMATOR_KNOWLEDGE_QUALITY_PARAMETER_TYPES.includes(parameter.type)) {
    issues.push({ path: "type", code: "INVALID_TYPE", message: "Quality parameter type is invalid." });
    return issues;
  }
  const choiceType = ["dropdown", "radio", "multi_select"].includes(parameter.type);
  if (choiceType && parameter.allowedValues.length === 0) {
    issues.push({ path: "allowedValues", code: "REQUIRED", message: "Choice parameters require allowed values." });
  }
  if (!choiceType && parameter.allowedValues.length > 0) {
    issues.push({ path: "allowedValues", code: "IRRELEVANT_FIELD", message: "Allowed values are valid only for choice parameters." });
  }
  const numeric = parameter.type === "number";
  if (!numeric && (parameter.minimum !== null || parameter.maximum !== null || parameter.unit !== null)) {
    issues.push({ path: "minimum", code: "IRRELEVANT_FIELD", message: "Numeric bounds and unit are valid only for number parameters." });
  }
  let minimum: bigint | null = null;
  let maximum: bigint | null = null;
  if (numeric) {
    try {
      minimum = parameter.minimum === null
        ? null
        : parseScaledDecimal(parameter.minimum, 6);
      maximum = parameter.maximum === null
        ? null
        : parseScaledDecimal(parameter.maximum, 6);
      if (minimum !== null && maximum !== null && minimum > maximum) {
        issues.push({ path: "maximum", code: "INVALID_RANGE", message: "Maximum cannot be less than minimum." });
      }
    } catch (error) {
      issues.push({ path: "minimum", code: "INVALID_DECIMAL", message: error instanceof Error ? error.message : "Numeric bound is invalid." });
    }
  }
  if (parameter.defaultValue !== null) {
    if (parameter.type === "text") {
      if (typeof parameter.defaultValue !== "string") {
        issues.push({ path: "defaultValue", code: "INVALID_DEFAULT", message: "Text defaults must be strings or null." });
      }
    } else if (numeric) {
      if (typeof parameter.defaultValue !== "string") {
        issues.push({ path: "defaultValue", code: "INVALID_DEFAULT", message: "Number defaults must use canonical decimal strings or null." });
      } else {
        try {
          const defaultValue = parseScaledDecimal(parameter.defaultValue, 6);
          if ((minimum !== null && defaultValue < minimum) || (maximum !== null && defaultValue > maximum)) {
            issues.push({ path: "defaultValue", code: "INVALID_DEFAULT", message: "Number default must be within the configured bounds." });
          }
        } catch (error) {
          issues.push({ path: "defaultValue", code: "INVALID_DEFAULT", message: error instanceof Error ? error.message : "Number default is invalid." });
        }
      }
    } else if (parameter.type === "dropdown" || parameter.type === "radio") {
      if (typeof parameter.defaultValue !== "string" || !parameter.allowedValues.includes(parameter.defaultValue)) {
        issues.push({ path: "defaultValue", code: "INVALID_DEFAULT", message: "Choice default must be one configured allowed value." });
      }
    } else if (parameter.type === "multi_select") {
      if (
        !Array.isArray(parameter.defaultValue) ||
        parameter.defaultValue.some(
          (value) =>
            typeof value !== "string" ||
            !parameter.allowedValues.includes(value)
        )
      ) {
        issues.push({ path: "defaultValue", code: "INVALID_DEFAULT", message: "Multi-select defaults must contain only configured allowed values." });
      }
    } else if (typeof parameter.defaultValue !== "boolean") {
      issues.push({ path: "defaultValue", code: "INVALID_DEFAULT", message: "Checkbox and boolean defaults must be booleans or null." });
    }
  }
  return issues;
}

const ALLOWED_SECTION_KEYS: Record<KnowledgeSectionKey, ReadonlySet<string>> = {
  overview: new Set(["description", "uomId", "priorityId", "surfaceIds", "modeIds", "sectionApplicability"]),
  pricing: new Set(["specifications", "brands", "technicalDescription", "qualityLevel", "internalVendorNotes", "priceEntries"]),
  "quantity-margin": new Set(["quantitySlabs", "gapBehavior", "startMarginBps", "bottomMarginBps", "pmcMarkupBps", "wastageBps", "previewInputs"]),
  scope: new Set(["modeIds", "surfaceIds", "exclusions"]),
  recommendations: new Set(["recommendations"]),
  quality: new Set(["parameters"]),
  execution: new Set(["steps", "productivity"]),
  advanced: new Set(["dependencies", "modeOverrides", "revisionLineage"])
};

function inspectBoundedValue(
  value: unknown,
  path: string,
  depth: number,
  issues: KnowledgeValidationIssue[]
): void {
  if (depth > MAX_NESTING_DEPTH) {
    issues.push({ path, code: "TOO_DEEP", message: "Section payload nesting is too deep." });
    return;
  }
  if (typeof value === "string") {
    if (value.length > AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT) {
      issues.push({ path, code: "TEXT_TOO_LONG", message: "Section text exceeds the supported length." });
    }
    return;
  }
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    issues.push({ path, code: "UNSAFE_NUMBER", message: "Section numeric values must be safe integers; decimals use strings." });
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > AI_ESTIMATOR_KNOWLEDGE_MAX_ARRAY_ITEMS) {
      issues.push({ path, code: "TOO_MANY_ITEMS", message: "Section array exceeds the supported length." });
      return;
    }
    value.forEach((entry, index) => inspectBoundedValue(entry, `${path}.${index}`, depth + 1, issues));
    return;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_OBJECT_KEYS) {
      issues.push({ path, code: "TOO_MANY_FIELDS", message: "Section object contains too many fields." });
      return;
    }
    entries.forEach(([key, entry]) => inspectBoundedValue(entry, `${path}.${key}`, depth + 1, issues));
  }
}

export function validateKnowledgeSectionPayload(
  sectionKey: KnowledgeSectionKey,
  payload: unknown
): KnowledgeValidationIssue[] {
  if (!AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.includes(sectionKey)) {
    return [{ path: "sectionKey", code: "INVALID_SECTION", message: "Knowledge section is invalid." }];
  }
  if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
    return [{ path: "payload", code: "INVALID_PAYLOAD", message: "Section payload must be an object." }];
  }
  const issues: KnowledgeValidationIssue[] = [];
  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_SECTION_KEYS[sectionKey].has(key)) {
      issues.push({ path: `payload.${key}`, code: "UNKNOWN_FIELD", message: `Field ${key} is not valid for ${sectionKey}.` });
    }
  }
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > MAX_SECTION_BYTES) {
    issues.push({ path: "payload", code: "PAYLOAD_TOO_LARGE", message: "Section payload exceeds 256 KiB." });
    return issues;
  }
  inspectBoundedValue(payload, "payload", 0, issues);

  if (sectionKey === "pricing") {
    issues.push(...validatePricingPayload(record));
    if (record.priceEntries !== undefined) {
      issues.push(...validatePriceEntryCommands(record.priceEntries));
    }
  } else {
    issues.push(...validateNonPricingSectionPayload(sectionKey, record));
  }

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && value.length > AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT && !["description", "technicalDescription", "internalVendorNotes"].includes(key)) {
      issues.push({ path: `payload.${key}`, code: "TEXT_TOO_LONG", message: `${key} exceeds the supported short-text length.` });
    }
    if (key.endsWith("Bps") && (
      !Number.isSafeInteger(value) ||
      (value as number) < 0 ||
      (value as number) > AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS
    )) {
      issues.push({ path: `payload.${key}`, code: "INVALID_BPS", message: `${key} must be between 0 and 10000 integer basis points.` });
    }
    if (["startMarginBps", "bottomMarginBps"].includes(key) && typeof value === "number" && value >= AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS) {
      issues.push({ path: `payload.${key}`, code: "INVALID_MARGIN", message: "Margin must be less than 10000 basis points." });
    }
  }
  return issues;
}

function validatePricingPayload(
  record: Record<string, unknown>
): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  for (const field of ["specifications", "brands"] as const) {
    if (!(field in record)) continue;
    const path = `payload.${field}`;
    const rows = validateObjectArray(record[field], path, issues);
    const ids = new Set<string>();
    const names = new Set<string>();
    rows.forEach((row, index) => {
      const rowPath = `${path}.${index}`;
      validateExactRowKeys(
        row,
        ["id", "name", "description"],
        ["id", "name"],
        rowPath,
        issues
      );
      validateStableId(row.id, `${rowPath}.id`, issues);
      validateText(
        row.name,
        `${rowPath}.name`,
        issues,
        AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT
      );
      if ("description" in row) {
        validateNullableText(
          row.description,
          `${rowPath}.description`,
          issues,
          AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT
        );
      }
      addUniqueString(row.id, ids, `${rowPath}.id`, "DUPLICATE_ID", issues);
      if (typeof row.name === "string" && row.name.trim().length > 0) {
        addUniqueString(
          normalizeKnowledgeIdentity(row.name),
          names,
          `${rowPath}.name`,
          "DUPLICATE_NAME",
          issues
        );
      }
    });
  }
  if ("technicalDescription" in record) {
    validateNullableText(
      record.technicalDescription,
      "payload.technicalDescription",
      issues,
      AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT
    );
  }
  if ("qualityLevel" in record) {
    validateNullableText(
      record.qualityLevel,
      "payload.qualityLevel",
      issues,
      AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT
    );
  }
  if ("internalVendorNotes" in record) {
    validateNullableText(
      record.internalVendorNotes,
      "payload.internalVendorNotes",
      issues,
      AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT
    );
  }
  return issues;
}

function validateNonPricingSectionPayload(
  sectionKey: Exclude<KnowledgeSectionKey, "pricing">,
  record: Record<string, unknown>
): KnowledgeValidationIssue[] {
  switch (sectionKey) {
    case "overview":
      return validateOverviewPayload(record);
    case "quantity-margin":
      return validateQuantityMarginPayload(record);
    case "scope":
      return validateScopePayload(record);
    case "recommendations":
      return validateRecommendationsPayload(record);
    case "quality":
      return validateQualityPayload(record);
    case "execution":
      return validateExecutionPayload(record);
    case "advanced":
      return validateAdvancedPayload(record);
  }
}

function validateOverviewPayload(
  record: Record<string, unknown>
): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if ("description" in record) {
    validateNullableText(record.description, "payload.description", issues, AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT);
  }
  if ("uomId" in record) {
    validateNullableStableId(record.uomId, "payload.uomId", issues);
  }
  if ("priorityId" in record) {
    validateNullableStableId(record.priorityId, "payload.priorityId", issues);
  }
  if ("surfaceIds" in record) {
    validateStableIdArray(record.surfaceIds, "payload.surfaceIds", issues);
  }
  if ("modeIds" in record) {
    validateStableIdArray(record.modeIds, "payload.modeIds", issues);
  }
  if ("sectionApplicability" in record) {
    const rows = validateObjectArray(
      record.sectionApplicability,
      "payload.sectionApplicability",
      issues
    );
    const ids = new Set<string>();
    const sectionKeys = new Set<string>();
    rows.forEach((row, index) => {
      const path = `payload.sectionApplicability.${index}`;
      validateExactRowKeys(
        row,
        ["id", "sectionKey", "applicability"],
        ["id", "sectionKey", "applicability"],
        path,
        issues
      );
      validateStableId(row.id, `${path}.id`, issues);
      validateClosedEnum(
        row.sectionKey,
        AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
        `${path}.sectionKey`,
        issues
      );
      validateClosedEnum(
        row.applicability,
        AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY,
        `${path}.applicability`,
        issues
      );
      addUniqueString(row.id, ids, `${path}.id`, "DUPLICATE_ID", issues);
      addUniqueString(
        row.sectionKey,
        sectionKeys,
        `${path}.sectionKey`,
        "DUPLICATE_SECTION",
        issues
      );
    });
  }
  return issues;
}

function validateQuantityMarginPayload(
  record: Record<string, unknown>
): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if ("gapBehavior" in record) {
    validateClosedEnum(
      record.gapBehavior,
      AI_ESTIMATOR_KNOWLEDGE_QUANTITY_GAP_BEHAVIORS,
      "payload.gapBehavior",
      issues
    );
  }
  if ("quantitySlabs" in record) {
    const rows = validateObjectArray(
      record.quantitySlabs,
      "payload.quantitySlabs",
      issues
    );
    const validSlabs: KnowledgeQuantitySlab[] = [];
    rows.forEach((row, index) => {
      const path = `payload.quantitySlabs.${index}`;
      const issueCount = issues.length;
      validateExactRowKeys(
        row,
        ["id", "minimumQuantity", "maximumQuantity", "adjustmentBps"],
        ["id", "minimumQuantity", "maximumQuantity", "adjustmentBps"],
        path,
        issues
      );
      validateStableId(row.id, `${path}.id`, issues);
      validateCanonicalDecimal(row.minimumQuantity, `${path}.minimumQuantity`, issues);
      validateNullableCanonicalDecimal(row.maximumQuantity, `${path}.maximumQuantity`, issues);
      validateInteger(
        row.adjustmentBps,
        `${path}.adjustmentBps`,
        issues,
        0,
        AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS
      );
      if (issues.length === issueCount) {
        validSlabs.push(row as unknown as KnowledgeQuantitySlab);
      }
    });
    if (!("gapBehavior" in record)) {
      issues.push(requiredIssue("payload.gapBehavior"));
    } else if (
      AI_ESTIMATOR_KNOWLEDGE_QUANTITY_GAP_BEHAVIORS.includes(
        record.gapBehavior as never
      ) &&
      validSlabs.length === rows.length
    ) {
      issues.push(
        ...validateQuantitySlabs({
          slabs: validSlabs,
          decimalScale: 6,
          gapBehavior: record.gapBehavior as KnowledgeQuantityGapBehavior
        }).map((issue) => ({
          ...issue,
          path: issue.path.replace(/^slabs/u, "payload.quantitySlabs")
        }))
      );
    }
  }
  if ("previewInputs" in record) {
    validatePreviewInputs(record.previewInputs, issues);
  }
  return issues;
}

function validatePreviewInputs(
  value: unknown,
  issues: KnowledgeValidationIssue[]
): void {
  if (value === null) return;
  const path = "payload.previewInputs";
  const row = validateObject(value, path, issues);
  if (!row) return;
  validateExactRowKeys(
    row,
    [
      "priceVersionId",
      "taxVersionId",
      "unitRatePaise",
      "quantityAdjustmentBps",
      "quantity",
      "quantityScale",
      "wastageBps",
      "taxRateBps",
      "taxTreatment",
      "startMarginBps",
      "bottomMarginBps",
      "pmcMarkupBps",
      "duration"
    ],
    ["quantityScale"],
    path,
    issues
  );
  for (const key of ["priceVersionId", "taxVersionId"] as const) {
    if (key in row) validateNullableStableId(row[key], `${path}.${key}`, issues);
  }
  if ("unitRatePaise" in row && row.unitRatePaise !== null) {
    validateInteger(
      row.unitRatePaise,
      `${path}.unitRatePaise`,
      issues,
      0,
      AI_ESTIMATOR_KNOWLEDGE_MAX_MONEY_PAISE
    );
  }
  if ("quantity" in row) {
    validateNullableCanonicalDecimal(row.quantity, `${path}.quantity`, issues);
  }
  validateInteger(row.quantityScale, `${path}.quantityScale`, issues, 0, 18);
  for (const key of [
    "quantityAdjustmentBps",
    "wastageBps",
    "taxRateBps",
    "pmcMarkupBps"
  ] as const) {
    if (key in row && row[key] !== null) {
      validateInteger(
        row[key],
        `${path}.${key}`,
        issues,
        0,
        AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS
      );
    }
  }
  for (const key of ["startMarginBps", "bottomMarginBps"] as const) {
    if (key in row && row[key] !== null) {
      validateInteger(
        row[key],
        `${path}.${key}`,
        issues,
        0,
        AI_ESTIMATOR_KNOWLEDGE_BASIS_POINTS - 1
      );
    }
  }
  if ("taxTreatment" in row && row.taxTreatment !== null) {
    validateClosedEnum(
      row.taxTreatment,
      AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS,
      `${path}.taxTreatment`,
      issues
    );
  }
  if ("duration" in row && row.duration !== null) {
    validatePreviewDuration(row.duration, `${path}.duration`, issues);
  }
}

function validatePreviewDuration(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): void {
  const row = validateObject(value, path, issues);
  if (!row) return;
  validateExactRowKeys(
    row,
    ["productivity", "productivityScale", "unit", "minimum", "maximum"],
    ["productivity", "productivityScale", "unit"],
    path,
    issues
  );
  validatePositiveCanonicalDecimal(row.productivity, `${path}.productivity`, issues);
  validateInteger(row.productivityScale, `${path}.productivityScale`, issues, 0, 18);
  validateClosedEnum(
    row.unit,
    AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS,
    `${path}.unit`,
    issues
  );
  const minimum = "minimum" in row
    ? validateNullableCanonicalDecimal(row.minimum, `${path}.minimum`, issues)
    : null;
  const maximum = "maximum" in row
    ? validateNullableCanonicalDecimal(row.maximum, `${path}.maximum`, issues)
    : null;
  if (minimum !== null && maximum !== null && minimum > maximum) {
    issues.push(invalidRangeIssue(`${path}.maximum`));
  }
}

function validateScopePayload(
  record: Record<string, unknown>
): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if ("modeIds" in record) {
    validateStableIdArray(record.modeIds, "payload.modeIds", issues);
  }
  if ("surfaceIds" in record) {
    validateStableIdArray(record.surfaceIds, "payload.surfaceIds", issues);
  }
  if ("exclusions" in record) {
    validateRelationshipRows(
      record.exclusions,
      "payload.exclusions",
      issues,
      false
    );
  }
  return issues;
}

function validateRecommendationsPayload(
  record: Record<string, unknown>
): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if (!("recommendations" in record)) return issues;
  const rows = validateObjectArray(
    record.recommendations,
    "payload.recommendations",
    issues
  );
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    const path = `payload.recommendations.${index}`;
    validateExactRowKeys(
      row,
      [
        "id",
        "targetBasketId",
        "targetMainLineId",
        "type",
        "priorityId",
        "reason",
        "quantityRelationship",
        "quantityValue",
        "dependency",
        "active"
      ],
      [
        "id",
        "targetBasketId",
        "targetMainLineId",
        "type",
        "priorityId",
        "reason",
        "quantityRelationship",
        "quantityValue",
        "dependency",
        "active"
      ],
      path,
      issues
    );
    validateStableId(row.id, `${path}.id`, issues);
    validateStableId(row.targetBasketId, `${path}.targetBasketId`, issues);
    validateStableId(row.targetMainLineId, `${path}.targetMainLineId`, issues);
    validateClosedEnum(
      row.type,
      AI_ESTIMATOR_KNOWLEDGE_RECOMMENDATION_TYPES,
      `${path}.type`,
      issues
    );
    validateNullableStableId(row.priorityId, `${path}.priorityId`, issues);
    validateText(row.reason, `${path}.reason`, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT);
    validateClosedEnum(
      row.quantityRelationship,
      AI_ESTIMATOR_KNOWLEDGE_QUANTITY_RELATIONSHIPS,
      `${path}.quantityRelationship`,
      issues
    );
    const quantity = validateNullableCanonicalDecimal(
      row.quantityValue,
      `${path}.quantityValue`,
      issues
    );
    if (row.quantityRelationship === "same_quantity" && row.quantityValue !== null) {
      issues.push(irrelevantFieldIssue(`${path}.quantityValue`));
    } else if (
      ["percentage_of_source", "fixed", "per_unit"].includes(
        String(row.quantityRelationship)
      ) &&
      (quantity === null || quantity === 0n)
    ) {
      issues.push(requiredIssue(`${path}.quantityValue`));
    }
    validateBoolean(row.dependency, `${path}.dependency`, issues);
    validateBoolean(row.active, `${path}.active`, issues);
    addUniqueString(row.id, ids, `${path}.id`, "DUPLICATE_ID", issues);
  });
  return issues;
}

function validateQualityPayload(
  record: Record<string, unknown>
): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if (!("parameters" in record)) return issues;
  const rows = validateObjectArray(record.parameters, "payload.parameters", issues);
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    const path = `payload.parameters.${index}`;
    validateExactRowKeys(
      row,
      [
        "id",
        "type",
        "label",
        "unit",
        "allowedValues",
        "minimum",
        "maximum",
        "defaultValue",
        "required",
        "category",
        "active"
      ],
      [
        "id",
        "type",
        "label",
        "unit",
        "allowedValues",
        "minimum",
        "maximum",
        "defaultValue",
        "required",
        "category",
        "active"
      ],
      path,
      issues
    );
    validateStableId(row.id, `${path}.id`, issues);
    validateClosedEnum(
      row.type,
      AI_ESTIMATOR_KNOWLEDGE_QUALITY_PARAMETER_TYPES,
      `${path}.type`,
      issues
    );
    validateText(row.label, `${path}.label`, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT);
    validateNullableText(row.unit, `${path}.unit`, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT);
    validateStringArray(row.allowedValues, `${path}.allowedValues`, issues);
    validateNullableCanonicalDecimal(row.minimum, `${path}.minimum`, issues);
    validateNullableCanonicalDecimal(row.maximum, `${path}.maximum`, issues);
    validateBoolean(row.required, `${path}.required`, issues);
    validateNullableText(row.category, `${path}.category`, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT);
    validateBoolean(row.active, `${path}.active`, issues);
    addUniqueString(row.id, ids, `${path}.id`, "DUPLICATE_ID", issues);
    if (isStructurallyValidQualityParameter(row)) {
      issues.push(
        ...validateQualityParameter(row as unknown as KnowledgeQualityParameter).map(
          (issue) => ({ ...issue, path: `${path}.${issue.path}` })
        )
      );
    }
  });
  return issues;
}

function isStructurallyValidQualityParameter(
  row: Record<string, unknown>
): boolean {
  return (
    typeof row.id === "string" &&
    typeof row.type === "string" &&
    AI_ESTIMATOR_KNOWLEDGE_QUALITY_PARAMETER_TYPES.includes(row.type as never) &&
    typeof row.label === "string" &&
    (row.unit === null || typeof row.unit === "string") &&
    Array.isArray(row.allowedValues) &&
    row.allowedValues.every((value) => typeof value === "string") &&
    (row.minimum === null || typeof row.minimum === "string") &&
    (row.maximum === null || typeof row.maximum === "string") &&
    typeof row.required === "boolean" &&
    (row.category === null || typeof row.category === "string") &&
    typeof row.active === "boolean"
  );
}

function validateExecutionPayload(
  record: Record<string, unknown>
): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if ("steps" in record) {
    const rows = validateObjectArray(record.steps, "payload.steps", issues);
    const ids = new Set<string>();
    const orders = new Set<number>();
    const validRows: Record<string, unknown>[] = [];
    rows.forEach((row, index) => {
      const path = `payload.steps.${index}`;
      const issueCount = issues.length;
      validateExactRowKeys(
        row,
        [
          "id",
          "order",
          "name",
          "description",
          "durationValue",
          "durationUnit",
          "crewSize",
          "skillType",
          "mandatory",
          "parallelizable",
          "active",
          "dependencyStepIds"
        ],
        [
          "id",
          "order",
          "name",
          "description",
          "durationValue",
          "durationUnit",
          "crewSize",
          "skillType",
          "mandatory",
          "parallelizable",
          "active",
          "dependencyStepIds"
        ],
        path,
        issues
      );
      validateStableId(row.id, `${path}.id`, issues);
      validateInteger(row.order, `${path}.order`, issues, 0, Number.MAX_SAFE_INTEGER);
      validateText(row.name, `${path}.name`, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT);
      validateNullableText(row.description, `${path}.description`, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT);
      validateNullableCanonicalDecimal(row.durationValue, `${path}.durationValue`, issues);
      if (row.durationUnit !== null) {
        validateClosedEnum(
          row.durationUnit,
          AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS,
          `${path}.durationUnit`,
          issues
        );
      }
      if ((row.durationValue === null) !== (row.durationUnit === null)) {
        issues.push({
          path: `${path}.durationUnit`,
          code: "COUPLED_FIELDS",
          message: "Duration value and unit must both be configured or both be null."
        });
      }
      if (row.crewSize !== null) {
        validateInteger(row.crewSize, `${path}.crewSize`, issues, 1, Number.MAX_SAFE_INTEGER);
      }
      validateNullableText(row.skillType, `${path}.skillType`, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT);
      validateBoolean(row.mandatory, `${path}.mandatory`, issues);
      validateBoolean(row.parallelizable, `${path}.parallelizable`, issues);
      validateBoolean(row.active, `${path}.active`, issues);
      validateStableIdArray(row.dependencyStepIds, `${path}.dependencyStepIds`, issues);
      addUniqueString(row.id, ids, `${path}.id`, "DUPLICATE_ID", issues);
      if (typeof row.order === "number" && Number.isSafeInteger(row.order)) {
        if (orders.has(row.order)) {
          issues.push({
            path: `${path}.order`,
            code: "DUPLICATE_ORDER",
            message: "Execution step order values must be unique."
          });
        }
        orders.add(row.order);
      }
      if (issues.length === issueCount) validRows.push(row);
    });
    if (validRows.length === rows.length) {
      const nodeIds = validRows.map((row) => String(row.id));
      const edges = validRows.flatMap((row) =>
        (row.dependencyStepIds as string[]).map((dependencyStepId) => ({
          fromId: dependencyStepId,
          toId: String(row.id)
        }))
      );
      issues.push(
        ...validateAcyclicGraph(nodeIds, edges).map((issue) => ({
          ...issue,
          path: issue.path === "edges"
            ? "payload.steps"
            : issue.path.replace(/^edges/u, "payload.steps.dependencies")
        }))
      );
    }
  }
  if ("productivity" in record && record.productivity !== null) {
    validateProductivityRows(record.productivity, issues);
  }
  return issues;
}

function validateProductivityRows(
  value: unknown,
  issues: KnowledgeValidationIssue[]
): void {
  const rows = validateObjectArray(value, "payload.productivity", issues);
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    const path = `payload.productivity.${index}`;
    validateExactRowKeys(
      row,
      [
        "id",
        "value",
        "uomId",
        "crewSize",
        "skillType",
        "minimumDuration",
        "maximumDuration",
        "durationUnit",
        "active"
      ],
      [
        "id",
        "value",
        "uomId",
        "crewSize",
        "skillType",
        "minimumDuration",
        "maximumDuration",
        "durationUnit",
        "active"
      ],
      path,
      issues
    );
    validateStableId(row.id, `${path}.id`, issues);
    validatePositiveCanonicalDecimal(row.value, `${path}.value`, issues);
    validateStableId(row.uomId, `${path}.uomId`, issues);
    if (row.crewSize !== null) {
      validateInteger(row.crewSize, `${path}.crewSize`, issues, 1, Number.MAX_SAFE_INTEGER);
    }
    validateNullableText(row.skillType, `${path}.skillType`, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT);
    const minimum = validateNullableCanonicalDecimal(
      row.minimumDuration,
      `${path}.minimumDuration`,
      issues
    );
    const maximum = validateNullableCanonicalDecimal(
      row.maximumDuration,
      `${path}.maximumDuration`,
      issues
    );
    if (minimum !== null && maximum !== null && minimum > maximum) {
      issues.push(invalidRangeIssue(`${path}.maximumDuration`));
    }
    validateClosedEnum(
      row.durationUnit,
      AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS,
      `${path}.durationUnit`,
      issues
    );
    validateBoolean(row.active, `${path}.active`, issues);
    addUniqueString(row.id, ids, `${path}.id`, "DUPLICATE_ID", issues);
  });
}

function validateAdvancedPayload(
  record: Record<string, unknown>
): KnowledgeValidationIssue[] {
  const issues: KnowledgeValidationIssue[] = [];
  if ("dependencies" in record) {
    validateRelationshipRows(
      record.dependencies,
      "payload.dependencies",
      issues,
      true
    );
  }
  if ("modeOverrides" in record) {
    const rows = validateObjectArray(record.modeOverrides, "payload.modeOverrides", issues);
    const ids = new Set<string>();
    const modeIds = new Set<string>();
    rows.forEach((row, index) => {
      const path = `payload.modeOverrides.${index}`;
      validateExactRowKeys(
        row,
        ["id", "modeId", "description", "active"],
        ["id", "modeId", "description", "active"],
        path,
        issues
      );
      validateStableId(row.id, `${path}.id`, issues);
      validateStableId(row.modeId, `${path}.modeId`, issues);
      validateText(row.description, `${path}.description`, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT);
      validateBoolean(row.active, `${path}.active`, issues);
      addUniqueString(row.id, ids, `${path}.id`, "DUPLICATE_ID", issues);
      addUniqueString(
        row.modeId,
        modeIds,
        `${path}.modeId`,
        "DUPLICATE_MODE_OVERRIDE",
        issues
      );
    });
  }
  if ("revisionLineage" in record) {
    validateRevisionLineage(record.revisionLineage, issues);
  }
  return issues;
}

function validateRelationshipRows(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[],
  requireMainLine: boolean
): void {
  const rows = validateObjectArray(value, path, issues);
  const ids = new Set<string>();
  const targetIds = new Set<string>();
  rows.forEach((row, index) => {
    const rowPath = `${path}.${index}`;
    validateExactRowKeys(
      row,
      ["id", "targetBasketId", "targetMainLineId", "reason", "active"],
      requireMainLine
        ? ["id", "targetMainLineId", "active"]
        : ["id", "active"],
      rowPath,
      issues
    );
    validateStableId(row.id, `${rowPath}.id`, issues);
    if ("targetBasketId" in row) {
      validateNullableStableId(row.targetBasketId, `${rowPath}.targetBasketId`, issues);
    }
    if ("targetMainLineId" in row) {
      validateNullableStableId(row.targetMainLineId, `${rowPath}.targetMainLineId`, issues);
    }
    const hasBasket = typeof row.targetBasketId === "string" && row.targetBasketId.trim().length > 0;
    const hasMainLine = typeof row.targetMainLineId === "string" && row.targetMainLineId.trim().length > 0;
    if (requireMainLine ? !hasMainLine : !hasBasket && !hasMainLine) {
      issues.push({
        path: `${rowPath}.targetMainLineId`,
        code: "REQUIRED_REFERENCE",
        message: requireMainLine
          ? "An item dependency requires a target Main Line stable ID."
          : "A relationship requires a target Basket or Main Line stable ID."
      });
    }
    if ("reason" in row) {
      validateNullableText(row.reason, `${rowPath}.reason`, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT);
    }
    validateBoolean(row.active, `${rowPath}.active`, issues);
    addUniqueString(row.id, ids, `${rowPath}.id`, "DUPLICATE_ID", issues);
    if (hasBasket || hasMainLine) {
      addUniqueString(
        `${hasBasket ? row.targetBasketId : ""}\u0000${hasMainLine ? row.targetMainLineId : ""}`,
        targetIds,
        hasMainLine ? `${rowPath}.targetMainLineId` : `${rowPath}.targetBasketId`,
        "DUPLICATE_REFERENCE",
        issues
      );
    }
  });
}

function validateRevisionLineage(
  value: unknown,
  issues: KnowledgeValidationIssue[]
): void {
  const path = "payload.revisionLineage";
  const rows = validateObjectArray(value, path, issues);
  const revisionIds = new Set<string>();
  rows.forEach((row, index) => {
    const rowPath = `${path}.${index}`;
    validateExactRowKeys(
      row,
      [
        "revisionId",
        "sourceRevisionId",
        "revisionNumber",
        "status",
        "contentDigest",
        "activatedAt",
        "supersededAt"
      ],
      [
        "revisionId",
        "sourceRevisionId",
        "revisionNumber",
        "status",
        "contentDigest",
        "activatedAt",
        "supersededAt"
      ],
      rowPath,
      issues
    );
    validateStableId(row.revisionId, `${rowPath}.revisionId`, issues);
    validateNullableStableId(row.sourceRevisionId, `${rowPath}.sourceRevisionId`, issues);
    validateInteger(row.revisionNumber, `${rowPath}.revisionNumber`, issues, 1, Number.MAX_SAFE_INTEGER);
    validateClosedEnum(
      row.status,
      AI_ESTIMATOR_KNOWLEDGE_REVISION_STATUSES,
      `${rowPath}.status`,
      issues
    );
    if (
      row.contentDigest !== null &&
      (typeof row.contentDigest !== "string" || !/^[a-f0-9]{64}$/u.test(row.contentDigest))
    ) {
      issues.push({
        path: `${rowPath}.contentDigest`,
        code: "INVALID_DIGEST",
        message: "Revision lineage content digest must be a SHA-256 hex value or null."
      });
    }
    validateNullableIsoDate(row.activatedAt, `${rowPath}.activatedAt`, issues);
    validateNullableIsoDate(row.supersededAt, `${rowPath}.supersededAt`, issues);
    addUniqueString(
      row.revisionId,
      revisionIds,
      `${rowPath}.revisionId`,
      "DUPLICATE_ID",
      issues
    );
  });
}

function validateObjectArray(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    issues.push(invalidTypeIssue(path, "an array"));
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  value.forEach((entry, index) => {
    const row = validateObject(entry, `${path}.${index}`, issues);
    if (row) rows.push(row);
  });
  return rows;
}

function validateObject(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): Record<string, unknown> | null {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    issues.push(invalidTypeIssue(path, "an object"));
    return null;
  }
  return value as Record<string, unknown>;
}

function validateExactRowKeys(
  row: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  path: string,
  issues: KnowledgeValidationIssue[]
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(row)) {
    if (!allowed.has(key)) {
      issues.push({
        path: `${path}.${key}`,
        code: "UNKNOWN_FIELD",
        message: `Field ${key} is not valid at ${path}.`
      });
    }
  }
  for (const key of requiredKeys) {
    if (!(key in row)) issues.push(requiredIssue(`${path}.${key}`));
  }
}

function validateStableIdArray(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): void {
  if (!Array.isArray(value)) {
    issues.push(invalidTypeIssue(path, "an array of stable IDs"));
    return;
  }
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const itemPath = `${path}.${index}`;
    validateStableId(entry, itemPath, issues);
    addUniqueString(entry, ids, itemPath, "DUPLICATE_ID", issues);
  });
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): void {
  if (!Array.isArray(value)) {
    issues.push(invalidTypeIssue(path, "an array of strings"));
    return;
  }
  const values = new Set<string>();
  value.forEach((entry, index) => {
    const itemPath = `${path}.${index}`;
    validateText(entry, itemPath, issues, AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT);
    addUniqueString(entry, values, itemPath, "DUPLICATE_VALUE", issues);
  });
}

function validateNullableStableId(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): void {
  if (value !== null) validateStableId(value, path, issues);
}

function validateText(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[],
  maximumLength: number
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximumLength
  ) {
    issues.push(invalidTypeIssue(path, `a nonempty string up to ${maximumLength} characters`));
  }
}

function validateNullableText(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[],
  maximumLength: number
): void {
  if (value !== null) validateText(value, path, issues, maximumLength);
}

function validateBoolean(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): void {
  if (typeof value !== "boolean") issues.push(invalidTypeIssue(path, "a boolean"));
}

function validateInteger(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[],
  minimum: number,
  maximum: number
): void {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    issues.push({
      path,
      code: "INVALID_INTEGER",
      message: `${path} must be a safe integer between ${minimum} and ${maximum}.`
    });
  }
}

function validateClosedEnum(
  value: unknown,
  allowed: readonly string[],
  path: string,
  issues: KnowledgeValidationIssue[]
): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({
      path,
      code: "INVALID_ENUM",
      message: `${path} must use a supported value.`
    });
  }
}

function validateCanonicalDecimal(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): bigint | null {
  if (typeof value !== "string") {
    issues.push(invalidTypeIssue(path, "a canonical decimal string"));
    return null;
  }
  try {
    return parseScaledDecimal(value, 6);
  } catch (error) {
    issues.push({
      path,
      code: "INVALID_DECIMAL",
      message: error instanceof Error ? error.message : "Decimal value is invalid."
    });
    return null;
  }
}

function validatePositiveCanonicalDecimal(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): bigint | null {
  const parsed = validateCanonicalDecimal(value, path, issues);
  if (parsed === 0n) {
    issues.push({
      path,
      code: "INVALID_RANGE",
      message: `${path} must be greater than zero.`
    });
  }
  return parsed;
}

function validateNullableCanonicalDecimal(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): bigint | null {
  return value === null ? null : validateCanonicalDecimal(value, path, issues);
}

function validateNullableIsoDate(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): void {
  if (value !== null && parseIsoDate(value) === null) {
    issues.push({
      path,
      code: "INVALID_DATE",
      message: `${path} must be an ISO date-time or null.`
    });
  }
}

function addUniqueString(
  value: unknown,
  values: Set<string>,
  path: string,
  code: string,
  issues: KnowledgeValidationIssue[]
): void {
  if (typeof value !== "string" || value.length === 0) return;
  if (values.has(value)) {
    issues.push({ path, code, message: `${path} must be unique.` });
  }
  values.add(value);
}

function requiredIssue(path: string): KnowledgeValidationIssue {
  return { path, code: "REQUIRED", message: `${path} is required.` };
}

function irrelevantFieldIssue(path: string): KnowledgeValidationIssue {
  return {
    path,
    code: "IRRELEVANT_FIELD",
    message: `${path} is not relevant for the selected type.`
  };
}

function invalidRangeIssue(path: string): KnowledgeValidationIssue {
  return {
    path,
    code: "INVALID_RANGE",
    message: `${path} cannot be less than its minimum.`
  };
}

function invalidTypeIssue(path: string, expected: string): KnowledgeValidationIssue {
  return {
    path,
    code: "INVALID_TYPE",
    message: `${path} must be ${expected}.`
  };
}

function validatePriceEntryCommands(value: unknown): KnowledgeValidationIssue[] {
  if (!Array.isArray(value)) {
    return [{ path: "payload.priceEntries", code: "INVALID_PRICE_ENTRIES", message: "Price entries must be an array of append commands or version references." }];
  }
  const issues: KnowledgeValidationIssue[] = [];
  const identities = new Set<string>();
  value.forEach((entry, index) => {
    const path = `payload.priceEntries.${index}`;
    if (entry === null || Array.isArray(entry) || typeof entry !== "object") {
      issues.push({ path, code: "INVALID_PRICE_ENTRY", message: "Price entry must be an object." });
      return;
    }
    const record = entry as Record<string, unknown>;
    if (record.operation === "reference") {
      validateExactKeys(record, ["operation", "priceEntryId", "priceVersionId"], path, issues);
      validateStableId(record.priceEntryId, `${path}.priceEntryId`, issues);
      validateStableId(record.priceVersionId, `${path}.priceVersionId`, issues);
      const identity = `reference:${String(record.priceVersionId)}`;
      if (identities.has(identity)) issues.push({ path, code: "DUPLICATE_PRICE_ENTRY", message: "Price version references must be unique." });
      identities.add(identity);
      return;
    }
    if (record.operation !== "append") {
      issues.push({ path: `${path}.operation`, code: "INVALID_PRICE_OPERATION", message: "Price entry operation must be append or reference." });
      return;
    }
    validateExactKeys(record, [
      "operation", "priceEntryId", "vendorId", "uomId", "specificationId", "modeId",
      "taxRuleId", "taxVersionId", "inputAmountPaise", "treatment", "effectiveFrom",
      "effectiveTo", "status"
    ], path, issues);
    for (const key of ["priceEntryId", "vendorId", "uomId", "taxRuleId", "taxVersionId"] as const) {
      validateStableId(record[key], `${path}.${key}`, issues);
    }
    for (const key of ["specificationId", "modeId"] as const) {
      if (record[key] !== null) validateStableId(record[key], `${path}.${key}`, issues);
    }
    if (!Number.isSafeInteger(record.inputAmountPaise) || (record.inputAmountPaise as number) < 0 || (record.inputAmountPaise as number) > AI_ESTIMATOR_KNOWLEDGE_MAX_MONEY_PAISE) {
      issues.push({ path: `${path}.inputAmountPaise`, code: "INVALID_AMOUNT", message: "Price input must be a nonnegative safe integer in paise." });
    }
    if (!AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS.includes(record.treatment as never)) {
      issues.push({ path: `${path}.treatment`, code: "INVALID_TAX_TREATMENT", message: "Price tax treatment is invalid." });
    }
    if (!AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES.includes(record.status as never)) {
      issues.push({ path: `${path}.status`, code: "INVALID_STATUS", message: "Price version status is invalid." });
    }
    const from = parseIsoDate(record.effectiveFrom);
    const to = record.effectiveTo === null ? null : parseIsoDate(record.effectiveTo);
    if (from === null) issues.push({ path: `${path}.effectiveFrom`, code: "INVALID_DATE", message: "Price effective start must be an ISO date-time." });
    if (record.effectiveTo !== null && to === null) issues.push({ path: `${path}.effectiveTo`, code: "INVALID_DATE", message: "Price effective end must be an ISO date-time or null." });
    if (from !== null && to !== null && from.getTime() >= to.getTime()) issues.push({ path: `${path}.effectiveTo`, code: "INVALID_EFFECTIVE_WINDOW", message: "Price effective end must be later than its start." });
    const identity = `append:${String(record.priceEntryId)}:${String(record.effectiveFrom)}`;
    if (identities.has(identity)) issues.push({ path, code: "DUPLICATE_PRICE_ENTRY", message: "Proposed price append commands must be unique." });
    identities.add(identity);
  });
  return issues;
}

function validateExactKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: KnowledgeValidationIssue[]
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) issues.push({ path: `${path}.${key}`, code: "UNKNOWN_FIELD", message: `Field ${key} is not valid for this price entry operation.` });
  }
  for (const key of allowedKeys) {
    if (!(key in record)) issues.push({ path: `${path}.${key}`, code: "REQUIRED", message: `Price entry field ${key} is required.` });
  }
}

function validateStableId(
  value: unknown,
  path: string,
  issues: KnowledgeValidationIssue[]
): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 240) {
    issues.push({ path, code: "INVALID_REFERENCE", message: "References require a bounded stable ID." });
  }
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/u.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function assertValidKnowledgeSectionPayload(
  sectionKey: KnowledgeSectionKey,
  payload: unknown
): void {
  const issues = validateKnowledgeSectionPayload(sectionKey, payload);
  if (issues.length > 0) throw new KnowledgeValidationError(issues);
}
