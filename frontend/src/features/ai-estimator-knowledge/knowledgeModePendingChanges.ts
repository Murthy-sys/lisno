import { modeCalculationDraft, modeCalculationsForPayload, parseModeQuantity, MODE_CALCULATION_SCOPES, type ModeCalculationScope } from "./knowledgeModeCalculation";
import { generateModeDescription, syncModeDescription } from "./knowledgeModeDescription";
import { knowledgeModeFieldTypeLabel, parseKnowledgeModeConfigurations, partitionKnowledgeModeConfigurations, type KnowledgeModeConfiguration } from "./knowledgeModeConfiguration";
import { defaultPmcScopeItems, PMC_SCOPE_LISTS } from "./knowledgePmcScope";
import { pmcMarginIssues, subVendorMarginIssues } from "./knowledgePmcMargin";
import { formatKnowledgePercentage, parseRupeeInputToPaise } from "./knowledgePresentation";
import { pairPendingRows, pendingObjectRows, pendingRowsReordered, pendingText, pendingValuesEqual, type KnowledgePendingChangeEntry, type KnowledgePendingChangeField, type KnowledgePendingChangeGroup } from "./knowledgePendingChanges";
import type { KnowledgeModeCalculationDraft } from "./KnowledgeModeCalculationTable";
import type { KnowledgeJsonObject, KnowledgeMaster } from "./knowledgeTypes";

export interface KnowledgePendingCalculation {
  readonly draft: KnowledgeModeCalculationDraft;
  readonly baselineDraft?: KnowledgeModeCalculationDraft;
  readonly invalidFields: readonly (keyof KnowledgeModeCalculationDraft)[];
}
export interface KnowledgeModePendingChangesInput {
  readonly advancedBaseline: KnowledgeJsonObject | null;
  readonly advancedDraft: KnowledgeJsonObject;
  readonly pricingBaseline: KnowledgeJsonObject | null;
  readonly pricingDraft: KnowledgeJsonObject;
  readonly mainLineName: string;
  readonly modes?: readonly KnowledgeMaster[];
  readonly pendingDescription?: string | null;
  readonly pendingCalculations?: Readonly<Partial<Record<ModeCalculationScope, KnowledgePendingCalculation | null>>>;
  readonly uomLabel?: string;
}

const calculationLabels: Readonly<Record<ModeCalculationScope, string>> = {
  pmc: "PMC", sub_vendor: "Execution · Sub-Vendor", in_house_labor: "Execution · In-house · Labor cost", in_house_material: "Execution · In-house · Material cost"
};
const calculationFields = { baseRate: "Base Rate (₹)", lowQuantityLimit: "Low Quantity Limit", impactRate: "Impact (%)", minimumRate: "Minimum markup (%)", startingRate: "Starting markup (%)" } as const;

function field(key: string, label: string, value: unknown): KnowledgePendingChangeField {
  const text = pendingText(value);
  return { key, label, value: text, ...(text === "" ? { cleared: true } : {}) };
}

function rows(before: readonly KnowledgeJsonObject[], after: readonly KnowledgeJsonObject[], key: string, titleKey: string, fallback: string, labels: Readonly<Record<string, string>>, options: { required?: readonly string[]; normalize?: (row: KnowledgeJsonObject) => KnowledgeJsonObject; format?: (name: string, value: unknown) => unknown } = {}): KnowledgePendingChangeEntry[] {
  const pairs = pairPendingRows(before, after);
  const entries: KnowledgePendingChangeEntry[] = [];
  for (const pair of pairs) {
    const original = pair.before && (options.normalize?.(pair.before) ?? pair.before);
    const current = pair.after && (options.normalize?.(pair.after) ?? pair.after);
    const identity = pendingText(current?.[titleKey]) || pendingText(original?.[titleKey]) || fallback;
    if (!current) {
      entries.push({ key: `${key}:${pair.key}`, title: identity, kind: "removed", fields: [] });
      continue;
    }
    const fields = Object.entries(labels).flatMap(([name, label]) => {
      const value = current[name];
      if (original ? pendingValuesEqual(original[name], value) : value == null || value === "" || (Array.isArray(value) && value.length === 0)) return [];
      return [field(name, label, options.format?.(name, value) ?? value)];
    });
    if (!original || fields.length) entries.push({ key: `${key}:${pair.key}`, title: identity, kind: original ? "updated" : "added", fields,
      ...((options.required ?? []).some((name) => !pendingText(current[name]).trim()) ? { incomplete: true } : {}) });
  }
  if (pendingRowsReordered(pairs)) entries.push({ key: `${key}:order`, title: `${fallback} order`, kind: "reordered", fields: [] });
  return entries;
}

function configLabel(configuration: KnowledgeModeConfiguration) {
  return configuration.modeKind === "pmc" ? "PMC" : configuration.modeKind === "execution"
    ? configuration.executionSource === "sub_vendor" ? "Execution · Sub-Vendor" : configuration.executionSource === "in_house" ? "Execution · In-house" : "Execution · Source not set"
    : "Mode configuration · Details unavailable";
}
function description(payload: KnowledgeJsonObject, name: string, pmc?: KnowledgeModeConfiguration) {
  return typeof payload.modeDescription === "string" ? syncModeDescription(payload.modeDescription, pmc) : generateModeDescription(name, pmc);
}

/** Projects only editable display values. Saved payloads never reach the request card. */
export function projectKnowledgeModePendingChanges(input: KnowledgeModePendingChangesInput): readonly KnowledgePendingChangeGroup[] {
  const groups: KnowledgePendingChangeGroup[] = [];
  const add = (key: string, label: string, entries: readonly KnowledgePendingChangeEntry[]) => { if (entries.length) groups.push({ key, label, entries }); };
  const before = input.advancedBaseline;
  const after = input.advancedDraft;
  if (before) {
    const oldConfigs = parseKnowledgeModeConfigurations(before.modeConfigurations, input.modes).configurations;
    const configs = parseKnowledgeModeConfigurations(after.modeConfigurations, input.modes).configurations;
    const oldPmc = partitionKnowledgeModeConfigurations(oldConfigs).primary.pmc;
    const pmc = partitionKnowledgeModeConfigurations(configs).primary.pmc;
    for (const list of PMC_SCOPE_LISTS) {
      add(`pmc:${list}`, `PMC · ${list === "inclusions" ? "Inclusions" : "Exclusions"}`, rows(
        (oldPmc?.[list] ?? defaultPmcScopeItems(list)).map((row) => ({ ...row })),
        (pmc?.[list] ?? defaultPmcScopeItems(list)).map((row) => ({ ...row })), `pmc:${list}`, "name", list === "inclusions" ? "Inclusion" : "Exclusion",
        { name: "Name", selected: "State" }, { required: ["name"], format: (name, value) => name === "selected" ? value ? "Selected" : "Not selected" : value }
      ));
    }
    if (!pendingValuesEqual(before.pmcMarginBps ?? null, after.pmcMarginBps ?? null)) {
      add("pmc:margin", "PMC", [{ key: "pmc:margin", title: "PMC margin", kind: "updated", fields: [field("margin", "Margin", typeof after.pmcMarginBps === "number" ? formatKnowledgePercentage(after.pmcMarginBps) : after.pmcMarginBps)], ...(pmcMarginIssues(after.pmcMarginBps).length ? { incomplete: true } : {}) }]);
    }
    if (!pendingValuesEqual(before.subVendorMarginBps ?? null, after.subVendorMarginBps ?? null)) {
      add("sub_vendor:margin", "Execution · Sub-Vendor", [{ key: "sub_vendor:margin", title: "Sub-Vendor margin", kind: "updated", fields: [field("margin", "Margin", typeof after.subVendorMarginBps === "number" ? formatKnowledgePercentage(after.subVendorMarginBps) : after.subVendorMarginBps)], ...(subVendorMarginIssues(after.subVendorMarginBps).length ? { incomplete: true } : {}) }]);
    }
    // Configuration identities are retained, even when names or sources coincide.
    for (const pair of pairPendingRows(oldConfigs.map((row) => ({ id: row.id, modeKind: row.modeKind, executionSource: row.executionSource, fields: row.fields.map((value) => ({ ...value, options: [...value.options] })) })), configs.map((row) => ({ id: row.id, modeKind: row.modeKind, executionSource: row.executionSource, fields: row.fields.map((value) => ({ ...value, options: [...value.options] })) })))) {
      const oldConfig = oldConfigs.find((row) => row.id === pair.before?.id);
      const config = configs.find((row) => row.id === pair.after?.id);
      const identity = config ?? oldConfig;
      if (!identity) continue;
      const key = `configuration:${pair.key}`;
      if (!config) {
        // Shared scope removals are already represented by their individual list rows.
        if (oldConfig && (oldConfig.modeKind !== "pmc" || oldConfig.fields.length)) add(key, configLabel(oldConfig), [{ key, title: "Configuration", kind: "removed", fields: [] }]);
        continue;
      }
      const entries = rows(pendingObjectRows(pair.before?.fields), pendingObjectRows(pair.after?.fields), key, "label", "Component", { label: "Component", type: "Type", options: "Options", value: "Value" }, {
        required: ["label"], normalize: (row) => ({ ...row, value: row.value ?? null, options: row.options ?? [] }),
        format: (name, value) => name === "type" ? knowledgeModeFieldTypeLabel(value as Parameters<typeof knowledgeModeFieldTypeLabel>[0]) : value
      });
      if (oldConfig && (oldConfig.modeKind !== config.modeKind || oldConfig.executionSource !== config.executionSource)) entries.unshift({ key: `${key}:source`, title: "Configuration source", kind: "updated", fields: [field("source", "Source", configLabel(config))] });
      add(key, configLabel(config), entries);
    }
    // Generated/automatically synchronized paragraph clauses are derived from scope controls,
    // so only a user's paragraph wording change receives a separate entry.
    const expectedDescription = syncModeDescription(description(before, input.mainLineName, oldPmc), pmc, oldPmc);
    const currentDescription = input.pendingDescription ?? description(after, input.mainLineName, pmc);
    if (expectedDescription.trim() !== currentDescription.trim()) add("mode:paragraph", "Mode · Shared paragraph", [{ key: "mode:paragraph", title: "Mode paragraph", kind: "updated", fields: [field("paragraph", "Paragraph", currentDescription)], ...(!currentDescription.trim() ? { incomplete: true } : {}) }]);
    const oldCalculations = modeCalculationsForPayload(before);
    const calculations = modeCalculationsForPayload(after);
    for (const scope of MODE_CALCULATION_SCOPES) {
      const pending = input.pendingCalculations?.[scope];
      const baseline = pending?.baselineDraft ?? modeCalculationDraft(oldCalculations[scope]);
      const current = pending?.draft ?? modeCalculationDraft(calculations[scope]);
      const fields = (Object.keys(calculationFields) as (keyof KnowledgeModeCalculationDraft)[]).flatMap((name) => {
        const oldNumber = name === "lowQuantityLimit" ? parseModeQuantity(baseline[name], 64) : parseRupeeInputToPaise(baseline[name]);
        const currentNumber = name === "lowQuantityLimit" ? parseModeQuantity(current[name], 64) : parseRupeeInputToPaise(current[name]);
        const validEqual = typeof oldNumber === "string" && typeof currentNumber === "string" ? oldNumber === currentNumber
          : typeof oldNumber === "object" && typeof currentNumber === "object" && oldNumber.status === "valid" && currentNumber.status === "valid" && oldNumber.paise === currentNumber.paise;
        if (baseline[name] === current[name] || (!pending?.invalidFields.includes(name) && validEqual)) return [];
        const label = name === "lowQuantityLimit" && input.uomLabel && !["Unavailable", "Loading…", "Not set"].includes(input.uomLabel) ? `${calculationFields[name]} (${input.uomLabel})` : calculationFields[name];
        return [field(name, label, current[name])];
      });
      if (fields.length) add(`calculation:${scope}`, calculationLabels[scope], [{ key: `calculation:${scope}`, title: "Calculation inputs", kind: "updated", fields, ...(pending?.invalidFields.length ? { incomplete: true } : {}) }]);
    }
  }
  if (input.pricingBaseline) add("specifications", "Specifications · Shared", rows(pendingObjectRows(input.pricingBaseline.specifications), pendingObjectRows(input.pricingDraft.specifications), "specification", "name", "Specification", { name: "Name", description: "Description" }, { required: ["name"], normalize: (row) => ({ ...row, name: row.name ?? "", description: row.description ?? "" }) }));
  return groups;
}
