import type {
  KnowledgeExecutionSource,
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster,
  KnowledgeModeKind
} from "./knowledgeTypes";

export const KNOWLEDGE_MODE_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "radio",
  "dropdown",
  "checkbox"
] as const;

export type KnowledgeModeFieldType =
  (typeof KNOWLEDGE_MODE_FIELD_TYPES)[number];

export const KNOWLEDGE_MODE_OPTIONS = [
  { modeKind: "pmc", label: "PMC" },
  { modeKind: "execution", label: "Execution" }
] as const satisfies readonly {
  readonly modeKind: KnowledgeModeKind;
  readonly label: "PMC" | "Execution";
}[];

export const KNOWLEDGE_EXECUTION_SOURCE_OPTIONS = [
  { executionSource: "sub_vendor", label: "Sub-Vendor" },
  { executionSource: "in_house", label: "In-house" }
] as const satisfies readonly {
  readonly executionSource: KnowledgeExecutionSource;
  readonly label: "Sub-Vendor" | "In-house";
}[];

export type { KnowledgeExecutionSource, KnowledgeModeKind } from "./knowledgeTypes";

export interface KnowledgeModeConfigurationField {
  readonly id: string;
  readonly type: KnowledgeModeFieldType;
  readonly label: string;
  readonly options: readonly string[];
  /** Compatibility-only historical answer, never rendered or serialized. */
  readonly legacyValue?: KnowledgeJsonValue;
}

export interface KnowledgeModeConfiguration {
  readonly id: string;
  readonly modeKind: KnowledgeModeKind | null;
  readonly executionSource: KnowledgeExecutionSource | null;
  /** Present only when this configuration was read from the legacy shape. */
  readonly legacyModeId: string | null;
  readonly fields: readonly KnowledgeModeConfigurationField[];
}

export interface KnowledgeModeConfigurationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ParsedKnowledgeModeConfigurations {
  readonly configurations: readonly KnowledgeModeConfiguration[];
  readonly issues: readonly KnowledgeModeConfigurationIssue[];
}

export interface KnowledgeModeFieldSummary {
  readonly id: string;
  readonly label: string;
  readonly type: KnowledgeModeFieldType;
  readonly options: readonly string[];
}

export interface KnowledgeModeLegacyMasterEvidence {
  readonly id: string;
  readonly code?: string;
  readonly status: KnowledgeMaster["status"];
}

export type KnowledgeModeConfigurationRecoveryReason =
  | "unresolved"
  | "legacy_reference"
  | "unscoped_execution"
  | "collision"
  | "invalid_source";

export interface KnowledgeModeConfigurationRecovery {
  readonly configuration: KnowledgeModeConfiguration;
  readonly reason: KnowledgeModeConfigurationRecoveryReason;
  readonly modeKind: KnowledgeModeKind | null;
  readonly executionSource: KnowledgeExecutionSource | null;
}

export interface PartitionedKnowledgeModeConfigurations {
  readonly primary: {
    readonly pmc?: KnowledgeModeConfiguration;
    readonly execution: Readonly<
      Partial<Record<KnowledgeExecutionSource, KnowledgeModeConfiguration>>
    >;
  };
  readonly recovery: readonly KnowledgeModeConfigurationRecovery[];
}

const MAX_SHORT_TEXT = 240;
const MAX_FIELDS = 50;
const MAX_OPTIONS = 50;
let fallbackIdCounter = 0;

export function parseKnowledgeModeConfigurations(
  value: KnowledgeJsonValue | undefined,
  legacyModes: readonly KnowledgeModeLegacyMasterEvidence[] = []
): ParsedKnowledgeModeConfigurations {
  if (value === undefined) return { configurations: [], issues: [] };
  if (!Array.isArray(value)) {
    return {
      configurations: [],
      issues: [{ path: "modeConfigurations", message: "Mode configurations must be a list." }]
    };
  }

  const configurations: KnowledgeModeConfiguration[] = [];
  const issues: KnowledgeModeConfigurationIssue[] = [];
  value.forEach((entry, configurationIndex) => {
    const path = `modeConfigurations.${configurationIndex}`;
    if (!isObject(entry)) {
      issues.push({ path, message: "Mode configuration must be an object." });
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!["id", "modeKind", "modeId", "executionSource", "fields"].includes(key)) {
        issues.push({ path: `${path}.${key}`, message: "Unknown Mode configuration property." });
      }
    }

    const id = stringValue(entry.id);
    const modeKind = isKnowledgeModeKind(entry.modeKind) ? entry.modeKind : null;
    const legacyModeId = stringValue(entry.modeId) || null;
    const executionSource = isKnowledgeExecutionSource(entry.executionSource)
      ? entry.executionSource
      : null;
    const hasModeKind = Object.hasOwn(entry, "modeKind");
    const hasModeId = Object.hasOwn(entry, "modeId");
    const hasExecutionSource = Object.hasOwn(entry, "executionSource");

    if (!id) issues.push({ path: `${path}.id`, message: "Configuration ID is required." });
    if (hasModeKind === hasModeId) {
      issues.push({
        path,
        message: hasModeKind
          ? "Choose either Mode kind or the legacy Mode reference, not both."
          : "Mode kind is required."
      });
    }
    if (hasModeKind && !modeKind) {
      issues.push({ path: `${path}.modeKind`, message: "Mode kind must be PMC or Execution." });
    }
    if (hasModeId && !legacyModeId) {
      issues.push({ path: `${path}.modeId`, message: "Legacy Mode reference is required." });
    }
    if (hasExecutionSource && !executionSource) {
      issues.push({
        path: `${path}.executionSource`,
        message: "Execution source must be Sub-Vendor or In-house."
      });
    }
    if (!Array.isArray(entry.fields)) {
      issues.push({ path: `${path}.fields`, message: "Components must be a list." });
    }
    if (
      !id ||
      hasModeKind === hasModeId ||
      (hasModeKind && !modeKind) ||
      (hasModeId && !legacyModeId) ||
      !Array.isArray(entry.fields)
    ) return;

    const resolvedModeKind = modeKind ?? resolveLegacyKnowledgeModeKind(
      legacyModeId!,
      legacyModes
    );
    if (resolvedModeKind === "pmc" && hasExecutionSource) {
      issues.push({
        path: `${path}.executionSource`,
        message: "PMC must not contain an Execution source."
      });
    }

    const fields: KnowledgeModeConfigurationField[] = [];
    entry.fields.forEach((fieldEntry, fieldIndex) => {
      const fieldPath = `${path}.fields.${fieldIndex}`;
      if (!isObject(fieldEntry)) {
        issues.push({ path: fieldPath, message: "Component must be an object." });
        return;
      }
      for (const key of Object.keys(fieldEntry)) {
        if (!["id", "type", "label", "options", "value"].includes(key)) {
          issues.push({ path: `${fieldPath}.${key}`, message: "Unknown component property." });
        }
      }
      const fieldId = stringValue(fieldEntry.id);
      const type = isKnowledgeModeFieldType(fieldEntry.type)
        ? fieldEntry.type
        : null;
      const label = typeof fieldEntry.label === "string" ? fieldEntry.label : "";
      const options = Array.isArray(fieldEntry.options)
        ? fieldEntry.options.filter((option): option is string => typeof option === "string")
        : [];
      if (!fieldId) issues.push({ path: `${fieldPath}.id`, message: "Component ID is required." });
      if (!type) issues.push({ path: `${fieldPath}.type`, message: "Choose a supported component type." });
      if (!Array.isArray(fieldEntry.options)) {
        issues.push({ path: `${fieldPath}.options`, message: "Component options must be a list." });
      } else if (options.length !== fieldEntry.options.length) {
        issues.push({ path: `${fieldPath}.options`, message: "Every component option must be text." });
      }
      if (fieldId && type) {
        fields.push({
          id: fieldId,
          type,
          label,
          options,
          ...(Object.hasOwn(fieldEntry, "value")
            ? { legacyValue: fieldEntry.value }
            : {})
        });
      }
    });
    configurations.push({
      id,
      modeKind: resolvedModeKind,
      executionSource,
      legacyModeId,
      fields
    });
  });

  return {
    configurations,
    issues: [...issues, ...validateKnowledgeModeConfigurations(configurations)]
  };
}

export function validateKnowledgeModeConfigurations(
  configurations: readonly KnowledgeModeConfiguration[]
): readonly KnowledgeModeConfigurationIssue[] {
  const issues: KnowledgeModeConfigurationIssue[] = [];
  const configurationIds = new Set<string>();
  const canonicalIdentities = new Set<string>();
  const legacyModeIds = new Set<string>();

  configurations.forEach((configuration, configurationIndex) => {
    const path = `modeConfigurations.${configurationIndex}`;
    validateStableId(configuration.id, `${path}.id`, "Configuration ID", issues);
    if (configurationIds.has(configuration.id)) {
      issues.push({ path: `${path}.id`, message: "Configuration IDs must be unique." });
    }
    configurationIds.add(configuration.id);

    if (configuration.legacyModeId !== null) {
      validateStableId(configuration.legacyModeId, `${path}.modeId`, "Legacy Mode reference", issues);
      if (legacyModeIds.has(configuration.legacyModeId)) {
        issues.push({ path: `${path}.modeId`, message: "Each legacy Mode can have only one configuration." });
      }
      legacyModeIds.add(configuration.legacyModeId);
    }

    const identity = canonicalIdentity(configuration);
    if (identity) {
      if (canonicalIdentities.has(identity)) {
        issues.push({
          path: configuration.modeKind === "execution"
            ? `${path}.executionSource`
            : `${path}.modeKind`,
          message: configuration.modeKind === "execution"
            ? "Each Execution source can have only one configuration."
            : "PMC can have only one configuration."
        });
      }
      canonicalIdentities.add(identity);
      validateConfigurationFields(configuration, path, issues);
    }
  });

  return issues;
}

function validateConfigurationFields(
  configuration: KnowledgeModeConfiguration,
  path: string,
  issues: KnowledgeModeConfigurationIssue[]
) {
  if (configuration.fields.length > MAX_FIELDS) {
    issues.push({
      path: `${path}.fields`,
      message: `A configuration can contain at most ${MAX_FIELDS} components.`
    });
  }
  const fieldIds = new Set<string>();
  const labels = new Set<string>();
  configuration.fields.forEach((field, fieldIndex) => {
    const fieldPath = `${path}.fields.${fieldIndex}`;
    validateStableId(field.id, `${fieldPath}.id`, "Component ID", issues);
    if (fieldIds.has(field.id)) {
      issues.push({
        path: `${fieldPath}.id`,
        message: "Component IDs must be unique within this configuration."
      });
    }
    fieldIds.add(field.id);

    const normalizedLabel = normalizeComparable(field.label);
    if (!normalizedLabel) {
      issues.push({ path: `${fieldPath}.label`, message: "Component label is required." });
    } else if (field.label.length > MAX_SHORT_TEXT) {
      issues.push({
        path: `${fieldPath}.label`,
        message: `Component label must be ${MAX_SHORT_TEXT} characters or fewer.`
      });
    } else if (labels.has(normalizedLabel)) {
      issues.push({
        path: `${fieldPath}.label`,
        message: "Component labels must be unique within this configuration."
      });
    }
    if (normalizedLabel) labels.add(normalizedLabel);

    const choice = isChoiceField(field.type);
    if (!choice && field.options.length > 0) {
      issues.push({
        path: `${fieldPath}.options`,
        message: "This component type cannot contain allowed options."
      });
    }
    if (choice) {
      if (field.options.length === 0) {
        issues.push({ path: `${fieldPath}.options`, message: "Add at least one allowed option." });
      }
      if (field.options.length > MAX_OPTIONS) {
        issues.push({
          path: `${fieldPath}.options`,
          message: `A choice component can contain at most ${MAX_OPTIONS} options.`
        });
      }
      const normalizedOptions = new Set<string>();
      field.options.forEach((option, optionIndex) => {
        const optionPath = `${fieldPath}.options.${optionIndex}`;
        const normalized = normalizeComparable(option);
        if (!normalized) {
          issues.push({ path: optionPath, message: "Allowed options cannot be empty." });
        } else if (option !== option.trim()) {
          issues.push({ path: optionPath, message: "Remove spaces before or after this option." });
        } else if (option.length > MAX_SHORT_TEXT) {
          issues.push({
            path: optionPath,
            message: `Options must be ${MAX_SHORT_TEXT} characters or fewer.`
          });
        } else if (normalizedOptions.has(normalized)) {
          issues.push({ path: optionPath, message: "Allowed options must be unique." });
        }
        normalizedOptions.add(normalized);
      });
    }
  });
}

export function resolveLegacyKnowledgeModeKind(
  modeId: string,
  masters: readonly KnowledgeModeLegacyMasterEvidence[]
): KnowledgeModeKind | null {
  for (const option of KNOWLEDGE_MODE_OPTIONS) {
    const matches = masters.filter(
      (master) =>
        master.status === "active" &&
        typeof master.code === "string" &&
        normalizeKnowledgeModeIdentity(master.code) === option.modeKind
    );
    if (matches.length === 1 && matches[0]!.id === modeId) return option.modeKind;
  }
  return null;
}

export function partitionKnowledgeModeConfigurations(
  configurations: readonly KnowledgeModeConfiguration[]
): PartitionedKnowledgeModeConfigurations {
  let pmc: KnowledgeModeConfiguration | undefined;
  const execution: Partial<
    Record<KnowledgeExecutionSource, KnowledgeModeConfiguration>
  > = {};
  const recovery: KnowledgeModeConfigurationRecovery[] = [];

  for (const configuration of configurations) {
    if (configuration.legacyModeId !== null) {
      recovery.push({
        configuration,
        reason: configuration.modeKind === null ? "unresolved" : "legacy_reference",
        modeKind: configuration.modeKind,
        executionSource: configuration.executionSource
      });
      continue;
    }
    if (configuration.modeKind === "pmc") {
      if (configuration.executionSource !== null) {
        recovery.push({
          configuration,
          reason: "invalid_source",
          modeKind: "pmc",
          executionSource: configuration.executionSource
        });
      } else if (!pmc) {
        pmc = configuration;
      } else {
        recovery.push({
          configuration,
          reason: "collision",
          modeKind: "pmc",
          executionSource: null
        });
      }
      continue;
    }
    if (configuration.modeKind === "execution") {
      if (configuration.executionSource === null) {
        recovery.push({
          configuration,
          reason: "unscoped_execution",
          modeKind: "execution",
          executionSource: null
        });
      } else if (!execution[configuration.executionSource]) {
        execution[configuration.executionSource] = configuration;
      } else {
        recovery.push({
          configuration,
          reason: "collision",
          modeKind: "execution",
          executionSource: configuration.executionSource
        });
      }
      continue;
    }
    recovery.push({
      configuration,
      reason: "unresolved",
      modeKind: null,
      executionSource: null
    });
  }

  return { primary: { ...(pmc ? { pmc } : {}), execution }, recovery };
}

export function withKnowledgeModeConfigurations(
  payload: KnowledgeJsonObject,
  configurations: readonly KnowledgeModeConfiguration[]
): KnowledgeJsonObject {
  return {
    ...payload,
    modeConfigurations: configurations.map((configuration) => ({
      id: configuration.id,
      ...(configuration.legacyModeId !== null
        ? { modeId: configuration.legacyModeId }
        : configuration.modeKind !== null
          ? {
              modeKind: configuration.modeKind,
              ...(configuration.executionSource !== null
                ? { executionSource: configuration.executionSource }
                : {})
            }
          : {}),
      fields: configuration.fields.map((field) => ({
        id: field.id,
        type: field.type,
        label: field.label,
        options: [...field.options]
      }))
    }))
  };
}

export function createKnowledgeModeConfiguration(
  modeKind: KnowledgeModeKind,
  executionSource: KnowledgeExecutionSource | null = null
): KnowledgeModeConfiguration {
  return {
    id: createStableKnowledgeId("configuration"),
    modeKind,
    executionSource: modeKind === "execution" ? executionSource : null,
    legacyModeId: null,
    fields: []
  };
}

export function createKnowledgeModeField(): KnowledgeModeConfigurationField {
  return {
    id: createStableKnowledgeId("field"),
    type: "text",
    label: "",
    options: []
  };
}

export function isChoiceField(type: KnowledgeModeFieldType): boolean {
  return type === "radio" || type === "dropdown";
}

export function projectKnowledgeModeFieldSummaries(
  configurations: readonly KnowledgeModeConfiguration[],
  modeKind: KnowledgeModeKind,
  executionSource?: KnowledgeExecutionSource
): readonly KnowledgeModeFieldSummary[] {
  const primary = partitionKnowledgeModeConfigurations(configurations).primary;
  const configuration = modeKind === "pmc"
    ? primary.pmc
    : executionSource
      ? primary.execution[executionSource]
      : undefined;
  return configuration
    ? projectKnowledgeModeConfigurationFieldSummaries(configuration)
    : [];
}

export function projectKnowledgeModeConfigurationFieldSummaries(
  configuration: KnowledgeModeConfiguration
): readonly KnowledgeModeFieldSummary[] {
  return configuration.fields.flatMap((field) => {
    const label = field.label.trim();
    if (!label) return [];
    return [{
      id: field.id,
      label,
      type: field.type,
      options: [...field.options]
    }];
  });
}

export function knowledgeModeFieldTypeLabel(type: KnowledgeModeFieldType): string {
  const labels: Readonly<Record<KnowledgeModeFieldType, string>> = {
    text: "Text field",
    textarea: "Text area",
    number: "Number field",
    radio: "Radio buttons",
    dropdown: "Dropdown",
    checkbox: "Checkbox"
  };
  return labels[type];
}

function canonicalIdentity(
  configuration: KnowledgeModeConfiguration
): string | null {
  if (configuration.legacyModeId !== null) return null;
  if (configuration.modeKind === "pmc" && configuration.executionSource === null) {
    return "pmc";
  }
  if (configuration.modeKind === "execution" && configuration.executionSource !== null) {
    return `execution:${configuration.executionSource}`;
  }
  return null;
}

function validateStableId(
  value: string,
  path: string,
  label: string,
  issues: KnowledgeModeConfigurationIssue[]
) {
  if (!value.trim()) issues.push({ path, message: `${label} is required.` });
  else if (value !== value.trim() || value.length > MAX_SHORT_TEXT) {
    issues.push({ path, message: `${label} must be a bounded stable ID.` });
  }
}

function createStableKnowledgeId(kind: "configuration" | "field"): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `knowledge-mode-${kind}-${random}`;
  fallbackIdCounter += 1;
  return `knowledge-mode-${kind}-${Date.now().toString(36)}-${fallbackIdCounter}`;
}

function isKnowledgeModeFieldType(
  value: KnowledgeJsonValue | undefined
): value is KnowledgeModeFieldType {
  return typeof value === "string" &&
    (KNOWLEDGE_MODE_FIELD_TYPES as readonly string[]).includes(value);
}

function isKnowledgeModeKind(
  value: KnowledgeJsonValue | undefined
): value is KnowledgeModeKind {
  return value === "pmc" || value === "execution";
}

function isKnowledgeExecutionSource(
  value: KnowledgeJsonValue | undefined
): value is KnowledgeExecutionSource {
  return value === "sub_vendor" || value === "in_house";
}

export function normalizeKnowledgeModeIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

function normalizeComparable(value: string): string {
  return normalizeKnowledgeModeIdentity(value);
}

function stringValue(value: KnowledgeJsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function isObject(value: KnowledgeJsonValue): value is KnowledgeJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
