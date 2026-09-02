import { Surface } from "../../components/ui/Surface";
import {
  KNOWLEDGE_SECTION_LABELS,
  formatKnowledgeDateTime,
  formatKnowledgeMoney,
  formatKnowledgePercentage
} from "./knowledgePresentation";
import {
  isChoiceField,
  knowledgeModeFieldTypeLabel,
  parseKnowledgeModeConfigurations,
  partitionKnowledgeModeConfigurations,
  projectKnowledgeModeConfigurationFieldSummaries,
  type KnowledgeModeConfiguration,
  type KnowledgeModeFieldSummary
} from "./knowledgeModeConfiguration";
import type {
  KnowledgeBasket,
  KnowledgeItemListItem,
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgeSectionKey
} from "./knowledgeTypes";

interface ConflictReviewValue {
  readonly label: string;
  readonly value: string;
}

export interface KnowledgeConflictReviewProps {
  readonly sectionKey: KnowledgeSectionKey;
  readonly localVersion: number;
  readonly serverVersion: number;
  readonly payload: KnowledgeJsonObject;
  readonly specifications?: KnowledgeJsonValue;
  readonly overviewFields?: readonly KnowledgeOverviewConflictField[];
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
  readonly relationshipBaskets: readonly KnowledgeBasket[];
  readonly relationshipItems: readonly KnowledgeItemListItem[];
}

export function KnowledgeConflictReview({
  sectionKey,
  localVersion,
  serverVersion,
  payload,
  specifications,
  overviewFields,
  masters,
  relationshipBaskets,
  relationshipItems
}: KnowledgeConflictReviewProps) {
  const label = KNOWLEDGE_SECTION_LABELS[sectionKey];
  const context = {
    masters,
    relationshipBaskets,
    relationshipItems,
    rootPayload: payload,
    specifications: specifications ?? payload.specifications
  } satisfies ProjectionContext;
  const values = sectionKey === "overview"
    ? overviewValues(payload, masters, overviewFields)
    : sectionKey === "pricing"
      ? pricingValues(payload, context)
      : sectionKey === "advanced"
        ? advancedValues(payload, context)
      : projectValues(payload, context);

  return (
    <Surface
      as="section"
      variant="subtle"
      className="knowledge-conflict-review"
      aria-label={`Latest ${label} server version`}
    >
      <div className="knowledge-conflict-review__heading">
        <h2>Latest {label} values</h2>
        <p>Local version {localVersion} · Latest server version {serverVersion}</p>
      </div>
      <p>Your unsaved local editor remains below for comparison.</p>
      {values.length ? (
        <dl className="knowledge-conflict-review__values">
          {values.map((entry, index) => (
            <div key={`${entry.label}-${index}`}>
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>No configured values are available in the latest server version.</p>
      )}
    </Surface>
  );
}

function advancedValues(
  payload: KnowledgeJsonObject,
  context: ProjectionContext
): readonly ConflictReviewValue[] {
  const parsed = parseKnowledgeModeConfigurations(
    payload.modeConfigurations,
    context.masters.modes ?? []
  );
  const partitioned = partitionKnowledgeModeConfigurations(parsed.configurations);
  const values: ConflictReviewValue[] = [];
  if (partitioned.primary.pmc) {
    values.push(...modeDefinitionValues(
      "PMC",
      partitioned.primary.pmc
    ));
  }
  for (const [source, label] of [
    ["sub_vendor", "Execution · Sub-Vendor"],
    ["in_house", "Execution · In-house"]
  ] as const) {
    const configuration = partitioned.primary.execution[source];
    if (configuration) values.push(...modeDefinitionValues(label, configuration));
  }
  partitioned.recovery.forEach((recovery, index) => {
    values.push(...modeDefinitionValues(
      `Mode recovery ${index + 1}`,
      recovery.configuration
    ));
  });

  const { modeConfigurations: _privateModeConfigurations, ...otherAdvanced } = payload;
  return [...values, ...projectValues(otherAdvanced, {
    ...context,
    rootPayload: otherAdvanced
  })];
}

function modeDefinitionValues(
  prefix: string,
  configuration: KnowledgeModeConfiguration
): readonly ConflictReviewValue[] {
  return projectKnowledgeModeConfigurationFieldSummaries(configuration).flatMap(
    (field, index) => definitionConflictValues(prefix, field, index)
  );
}

function definitionConflictValues(
  prefix: string,
  field: KnowledgeModeFieldSummary,
  index: number
): readonly ConflictReviewValue[] {
  const component = `${prefix} · Component ${index + 1}`;
  return [
    { label: `${component} · Component label`, value: field.label },
    {
      label: `${component} · Component type`,
      value: knowledgeModeFieldTypeLabel(field.type)
    },
    ...(isChoiceField(field.type) && field.options.length
      ? [{ label: `${component} · Allowed options`, value: field.options.join(", ") }]
      : [])
  ];
}

export type KnowledgeOverviewConflictField = "uomId" | "surfaceIds" | "priorityId";

function overviewValues(
  payload: KnowledgeJsonObject,
  masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>,
  fields: readonly KnowledgeOverviewConflictField[] = ["uomId", "surfaceIds"]
): readonly ConflictReviewValue[] {
  const values: Readonly<Record<KnowledgeOverviewConflictField, ConflictReviewValue>> = {
    uomId: {
      label: "Unit of measure (UOM)",
      value: resolveMaster(payload.uomId, masters.uoms)
    },
    surfaceIds: {
      label: "Surfaces",
      value: resolveMasterList(payload.surfaceIds, masters.surfaces)
    },
    priorityId: {
      label: "Priority",
      value: resolveMaster(payload.priorityId, masters.priorities, "Unavailable priority")
    }
  };
  return fields.map((field) => values[field]);
}

interface ProjectionContext {
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
  readonly relationshipBaskets: readonly KnowledgeBasket[];
  readonly relationshipItems: readonly KnowledgeItemListItem[];
  readonly rootPayload: KnowledgeJsonObject;
  readonly specifications: KnowledgeJsonValue | undefined;
}

/**
 * Pricing carries immutable IDs and compatibility metadata that are useful to
 * the editor but should never be exposed by conflict review. Keep this
 * projection intentionally allowlisted rather than recursively rendering an
 * open-ended Pricing payload.
 */
function pricingValues(
  payload: KnowledgeJsonObject,
  context: ProjectionContext
): readonly ConflictReviewValue[] {
  const values: ConflictReviewValue[] = [];
  const specifications = objectArray(payload.specifications);

  specifications.forEach((specification, index) => {
    const prefix = `Specification ${index + 1}`;
    const label = meaningfulText(specification.name);
    const description = meaningfulText(specification.description);
    if (label) {
      values.push({ label: `${prefix} · Specification name`, value: label });
    }
    if (description) {
      values.push({ label: `${prefix} · Brief description`, value: description });
    }
  });

  objectArray(payload.priceEntries).forEach((entry, index) => {
    const prefix = `Price ${index + 1}`;
    const operation = entry.operation === "append" || entry.operation === "reference"
      ? displayEnum(entry.operation)
      : null;
    if (operation) values.push({ label: `${prefix} · Operation`, value: operation });

    const resolvedVersion = entry.operation === "reference" && isJsonObject(entry.priceVersion)
      ? entry.priceVersion
      : null;
    const priceValues = resolvedVersion ?? entry;
    for (const key of PRICING_REVIEW_PRICE_KEYS) {
      const value = priceValues[key];
      if (!hasMeaningfulValue(value)) continue;
      const resolvedReference = resolveReference(key, value, context);
      values.push({
        label: `${prefix} · ${displayLabel(key)}`,
        value: resolvedReference ?? formatPrimitive(key, value as string | number | boolean)
      });
    }
  });

  return values;
}

const PRICING_REVIEW_PRICE_KEYS = [
  "specificationId",
  "modeId",
  "vendorId",
  "uomId",
  "versionNumber",
  "taxRuleId",
  "taxVersionId",
  "treatment",
  "inputAmountPaise",
  "baseAmountPaise",
  "taxAmountPaise",
  "totalAmountPaise",
  "effectiveFrom",
  "effectiveTo",
  "status",
  "reviewRequired"
] as const;

function meaningfulText(value: KnowledgeJsonValue | undefined): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function projectValues(
  payload: KnowledgeJsonObject,
  context: ProjectionContext,
  path: readonly string[] = []
): readonly ConflictReviewValue[] {
  const values: ConflictReviewValue[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (!hasMeaningfulValue(value) || isAlwaysInternalKey(key)) continue;

    const currentPath = [...path, displayLabel(key)];
    const resolvedReference = resolveReference(key, value, context);
    if (resolvedReference !== null) {
      values.push({ label: currentPath.join(" · "), value: resolvedReference });
      continue;
    }
    if (/Ids?$/u.test(key)) continue;

    if (Array.isArray(value)) {
      const primitives = value.filter(
        (entry): entry is string | number | boolean =>
          typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
      );
      if (primitives.length === value.length) {
        values.push({
          label: currentPath.join(" · "),
          value: primitives.map((entry) => formatPrimitive(key, entry)).join(", ")
        });
        continue;
      }
      value.forEach((entry, index) => {
        if (!isJsonObject(entry)) return;
        values.push(...projectValues(entry, context, [...currentPath, String(index + 1)]));
      });
      continue;
    }

    if (isJsonObject(value)) {
      values.push(...projectValues(value, context, currentPath));
      continue;
    }

    if (isJsonScalar(value)) {
      values.push({
        label: currentPath.join(" · "),
        value: formatPrimitive(key, value)
      });
    }
  }
  return values;
}

function resolveReference(
  key: string,
  value: KnowledgeJsonValue,
  context: ProjectionContext
): string | null {
  const masterType = MASTER_REFERENCE_KEYS[key];
  if (masterType) {
    return key.endsWith("Ids")
      ? resolveMasterList(value, context.masters[masterType])
      : resolveMaster(value, context.masters[masterType]);
  }

  if (key === "targetBasketId") {
    return resolveNamedValue(value, context.relationshipBaskets, (entry) => entry.id, (entry) => entry.name);
  }
  if (key === "targetMainLineId") {
    return resolveNamedValue(value, context.relationshipItems, (entry) => entry.mainLineId, (entry) => entry.mainLineName);
  }
  if (key === "specificationId") {
    const specifications = objectArray(context.specifications);
    return resolveNamedValue(
      value,
      specifications,
      (entry) => stringValue(entry.id),
      (entry) => meaningfulText(entry.name) ?? "Unnamed specification"
    );
  }
  if (key === "dependencyStepIds") {
    const steps = objectArray(context.rootPayload.steps);
    return resolveNamedList(value, steps, (entry) => stringValue(entry.id), (entry) => stringValue(entry.name) || "Unnamed step");
  }
  if (key === "taxVersionId") {
    const id = stringValue(value);
    if (!id) return "Not configured";
    for (const tax of context.masters.taxes ?? []) {
      const version = tax.taxVersions?.find((candidate) => candidate.id === id);
      if (version) {
        return `Version ${version.versionNumber} · ${formatKnowledgePercentage(version.rateBps)} · ${displayEnum(version.treatment)}`;
      }
    }
    return "Unavailable value";
  }
  return null;
}

const MASTER_REFERENCE_KEYS: Readonly<Record<string, KnowledgeMasterType>> = {
  uomId: "uoms",
  vendorId: "vendors",
  vendorIds: "vendors",
  taxRuleId: "taxes",
  priorityId: "priorities",
  surfaceId: "surfaces",
  surfaceIds: "surfaces",
  modeId: "modes",
  modeIds: "modes"
};

function resolveMaster(
  value: KnowledgeJsonValue | undefined,
  masters: readonly KnowledgeMaster[] | undefined,
  unavailableLabel = "Unavailable value"
): string {
  const id = stringValue(value);
  if (!id) return "Not configured";
  return masters?.find((master) => master.id === id)?.name ?? unavailableLabel;
}

function resolveMasterList(
  value: KnowledgeJsonValue | undefined,
  masters: readonly KnowledgeMaster[] | undefined
): string {
  return resolveNamedList(value, masters ?? [], (entry) => entry.id, (entry) => entry.name);
}

function resolveNamedValue<T>(
  value: KnowledgeJsonValue,
  entries: readonly T[],
  id: (entry: T) => string,
  label: (entry: T) => string
): string {
  const selectedId = stringValue(value);
  if (!selectedId) return "Not configured";
  const selected = entries.find((entry) => id(entry) === selectedId);
  return selected ? label(selected) : "Unavailable value";
}

function resolveNamedList<T>(
  value: KnowledgeJsonValue | undefined,
  entries: readonly T[],
  id: (entry: T) => string,
  label: (entry: T) => string
): string {
  const selectedIds = stringArray(value);
  if (!selectedIds.length) return "Not configured";
  return selectedIds
    .map((selectedId) => {
      const selected = entries.find((entry) => id(entry) === selectedId);
      return selected ? label(selected) : "Unavailable value";
    })
    .join(", ");
}

function formatPrimitive(key: string, value: string | number | boolean | null): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (key.endsWith("Paise") && Number.isSafeInteger(value) && value >= 0) {
      return formatKnowledgeMoney(value);
    }
    if (key.endsWith("Bps")) return formatKnowledgePercentage(value);
    return String(value);
  }
  if (typeof value === "string") {
    if ((key.endsWith("At") || key.endsWith("From") || key.endsWith("To")) && looksLikeDate(value)) {
      return formatKnowledgeDateTime(value);
    }
    return displayEnum(value);
  }
  return "Not configured";
}

function displayLabel(key: string): string {
  const known: Readonly<Record<string, string>> = {
    uomId: "Unit of measure (UOM)",
    uomIds: "Units of measure (UOM)",
    pmcMarkupBps: "PMC markup",
    taxRuleId: "Tax rule",
    taxVersionId: "Tax version",
    inputAmountPaise: "Input amount",
    baseAmountPaise: "Base amount",
    taxAmountPaise: "Tax amount",
    totalAmountPaise: "Total amount"
  };
  if (known[key]) return known[key];
  return key
    .replace(/Ids?$/u, "")
    .replace(/Bps$/u, "")
    .replace(/Paise$/u, "")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/^./u, (character) => character.toUpperCase());
}

function displayEnum(value: string): string {
  return value.replaceAll("_", " ").replace(/^./u, (character) => character.toUpperCase());
}

function isAlwaysInternalKey(key: string): boolean {
  return key === "id" || key === "priceEntryId" || key === "priceVersionId" || key === "sourceRevisionId" || /digest|token|secret/iu.test(key);
}

function hasMeaningfulValue(value: KnowledgeJsonValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (isJsonObject(value)) return Object.values(value).some(hasMeaningfulValue);
  return true;
}

function looksLikeDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/u.test(value) && !Number.isNaN(new Date(value).getTime());
}

function isJsonObject(value: KnowledgeJsonValue): value is KnowledgeJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonScalar(
  value: KnowledgeJsonValue
): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function objectArray(value: KnowledgeJsonValue | undefined): readonly KnowledgeJsonObject[] {
  return Array.isArray(value) ? value.filter(isJsonObject) : [];
}

function stringValue(value: KnowledgeJsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: KnowledgeJsonValue | undefined): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
