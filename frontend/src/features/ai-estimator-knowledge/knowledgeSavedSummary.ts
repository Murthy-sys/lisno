import { BUDGET_ACTIONS, budgetAlterationIssues } from "./knowledgeBudgetAlterations";
import { MODE_CALCULATION_LABELS, MODE_CALCULATION_SCOPES, modeCalculationIssues, modeCalculationsIssues } from "./knowledgeModeCalculation";
import {
  knowledgeModeFieldTypeLabel,
  parseKnowledgeModeConfigurations,
  partitionKnowledgeModeConfigurations
} from "./knowledgeModeConfiguration";
import { pmcMarginIssues, subVendorMarginRangeIssues } from "./knowledgePmcMargin";
import { formatKnowledgeMoney, formatKnowledgePercentage } from "./knowledgePresentation";
import { validateQualityParameters } from "./knowledgeQuality";
import { parseKnowledgeSpecifications } from "./knowledgeSpecificationConfiguration";
import type { KnowledgeJsonObject, KnowledgeJsonValue, KnowledgeMasterType } from "./knowledgeTypes";
import type {
  SavedSummaryContent,
  SavedSummaryProjection,
  SavedSummaryProjectionInput,
  SavedSummaryRow
} from "./knowledgeSavedSummaryTypes";

const NOT_CONFIGURED = "Not configured";
const NAME_UNAVAILABLE = "Name unavailable";
const NEEDS_REVIEW = "Saved configuration needs review";

function object(value: KnowledgeJsonValue | undefined): value is KnowledgeJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: KnowledgeJsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function present(value: KnowledgeJsonValue | undefined): boolean {
  return value !== undefined && value !== null && value !== "";
}

function scalar(value: KnowledgeJsonValue | undefined): string {
  if (!present(value)) return NOT_CONFIGURED;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : NEEDS_REVIEW;
  if (typeof value === "string") return value.trim() || NOT_CONFIGURED;
  if (Array.isArray(value)) return value.length ? value.map(scalar).join(", ") : NOT_CONFIGURED;
  return NEEDS_REVIEW;
}

function financial(value: KnowledgeJsonValue | undefined, money = false): string {
  if (!present(value)) return NOT_CONFIGURED;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return NEEDS_REVIEW;
  return money ? formatKnowledgeMoney(value) : formatKnowledgePercentage(value);
}

function row(key: string, label: string, value: string): SavedSummaryRow {
  return { key, label, value };
}

function add(rows: SavedSummaryRow[], key: string, label: string, value: KnowledgeJsonValue | undefined) {
  if (present(value)) rows.push(row(key, label, scalar(value)));
}

function review(rows: SavedSummaryRow[], key: string, label: string, legacy = false) {
  rows.push(row(key, label, legacy ? "Legacy saved configuration needs review" : NEEDS_REVIEW));
}

function concise(value: string): string {
  return value.length > 160 ? `${value.slice(0, 157).trimEnd()}…` : value;
}

function namesPreview(names: readonly string[]): string {
  return concise(`${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3} more` : ""}`);
}

function content(details: readonly SavedSummaryRow[], previews: readonly SavedSummaryRow[] = details): SavedSummaryContent {
  return { details, preview: previews.slice(0, 3).map(item => ({ ...item, value: concise(item.value) })) };
}

function masterName(input: SavedSummaryProjectionInput, type: KnowledgeMasterType, id: KnowledgeJsonValue | undefined): string {
  if (!present(id)) return NOT_CONFIGURED;
  return input.masters[type]?.find(master => master.id === id)?.name.trim() || NAME_UNAVAILABLE;
}

/** Invalid saved rows stay visible without echoing internal IDs or arbitrary JSON. */
function objectRows(value: KnowledgeJsonValue | undefined, rows: SavedSummaryRow[], key: string, label: string): KnowledgeJsonObject[] {
  if (!present(value)) return [];
  if (!Array.isArray(value)) {
    review(rows, `${key}-review`, label);
    return [];
  }
  const valid = value.filter(object);
  if (valid.length !== value.length) review(rows, `${key}-review`, label);
  return valid;
}

function overview(input: SavedSummaryProjectionInput): SavedSummaryContent {
  const payload = input.sections.overview;
  if (!payload) return content([]);
  const details: SavedSummaryRow[] = [];
  if (present(payload.uomId)) details.push(row("uom", "UOM", masterName(input, "uoms", payload.uomId)));
  if (present(payload.surfaceIds)) {
    if (!Array.isArray(payload.surfaceIds)) review(details, "surfaces-review", "Surfaces");
    else payload.surfaceIds.forEach((id, index) => {
      const name = text(id) ? masterName(input, "surfaces", id) : NAME_UNAVAILABLE;
      details.push(row(`surface-${index}`, `Surface ${index + 1}`, name));
      if (!text(id)) review(details, `surface-${index}-review`, `Surface ${index + 1}`);
      const surface = input.masters.surfaces?.find(item => item.id === id);
      add(details, `surface-${index}-description`, `${name} · Examples`, surface?.description);
    });
  }
  const preview: SavedSummaryRow[] = details.filter(item => item.key === "uom");
  const surfaces = details.filter(item => /^surface-\d+$/u.test(item.key));
  if (surfaces.length) preview.push(row("surfaces", "Surfaces", namesPreview(surfaces.map(item => item.value))));
  preview.push(...details.filter(item => item.key.endsWith("-review")));
  if (Object.keys(payload).some(key => present(payload[key]) && !["uomId", "surfaceIds"].includes(key) && (!Array.isArray(payload[key]) || payload[key].length > 0))) {
    review(details, "overview-review", "Overview", true);
    preview.push(details[details.length - 1]!);
  }
  return content(details, preview);
}

function mode(input: SavedSummaryProjectionInput): SavedSummaryContent {
  const payload = input.sections.advanced;
  const pricing = input.sections.pricing;
  const details: SavedSummaryRow[] = [];
  const configuredNames: string[] = [];
  const rateHighlights: string[] = [];
  const marginHighlights: string[] = [];
  if (payload) {
    const parsed = parseKnowledgeModeConfigurations(payload.modeConfigurations, input.masters.modes ?? []);
    const partitioned = partitionKnowledgeModeConfigurations(parsed.configurations);
    parsed.configurations.forEach((configuration, index) => {
      const key = `configuration-${index}`;
      const name = configuration.legacyModeId
        ? masterName(input, "modes", configuration.legacyModeId)
        : configuration.modeKind === "pmc" ? "PMC"
          : configuration.executionSource === "sub_vendor" ? "Execution · Sub-Vendor"
            : configuration.executionSource === "in_house" ? "Execution · In-house" : "Execution";
      configuredNames.push(name);
      details.push(row(key, "Configured mode", name));
      for (const list of ["inclusions", "exclusions"] as const) {
        const selected = configuration[list]?.filter(item => item.selected);
        if (selected?.length) details.push(row(`${key}-${list}`, `Sub-Vendor ${list}`, selected.map(item => item.name.trim() || NAME_UNAVAILABLE).join(", ")));
      }
      configuration.fields.forEach((field, fieldIndex) => {
        const fieldKey = `${key}-component-${fieldIndex}`;
        const label = `${name} · ${field.label.trim() || NAME_UNAVAILABLE}`;
        details.push(row(fieldKey, label, scalar(field.value)));
        details.push(row(`${fieldKey}-type`, `${label} · Type`, knowledgeModeFieldTypeLabel(field.type)));
        if (field.options.length) details.push(row(`${fieldKey}-options`, `${label} · Options`, field.options.join(", ")));
      });
    });
    if (parsed.issues.length || partitioned.recovery.length) review(details, "configurations-review", "Mode components", partitioned.recovery.length > 0);
    add(details, "description", "Shared description", payload.modeDescription);

    // Do not use modeCalculationDraft or modeCalculationsForPayload here: both
    // intentionally seed editor defaults / legacy values into multiple scopes.
    const calculations = object(payload.modeCalculations) ? payload.modeCalculations : undefined;
    const calculationEntries: [string, string, KnowledgeJsonValue | undefined][] = calculations
      ? MODE_CALCULATION_SCOPES.filter(scope => present(calculations[scope])).map(scope => [scope, MODE_CALCULATION_LABELS[scope], calculations[scope]])
      : [];
    if (calculations && present(calculations.in_house)) calculationEntries.push(["in_house", "In-house (legacy)", calculations.in_house]);
    if (present(payload.modeCalculation)) calculationEntries.push(["legacy", "Shared calculation (legacy)", payload.modeCalculation]);
    if (modeCalculationsIssues(payload).some(issue => issue.path === "modeCalculations" || issue.path.startsWith("modeCalculations."))) {
      review(details, "calculations-review", "Calculation settings");
    }
    for (const [scope, label, settings] of calculationEntries) {
      if (!object(settings)) { review(details, `calculation-${scope}-review`, label); continue; }
      if (present(settings.baseRatePaise)) {
        const formatted = financial(settings.baseRatePaise, true);
        details.push(row(`${scope}-base`, `${label} · Base Rate`, formatted));
        rateHighlights.push(`${label} ${formatted}`);
      }
      add(details, `${scope}-limit`, `${label} · Low Quantity Limit`, settings.lowQuantityLimit);
      if (present(settings.impactBps)) details.push(row(`${scope}-impact`, `${label} · Impact`, financial(settings.impactBps)));
      if (scope !== "pmc" && scope !== "sub_vendor") {
        if (present(settings.minimumMarkupBps)) details.push(row(`${scope}-minimum`, `${label} · Min. Gross Margin Markup`, financial(settings.minimumMarkupBps)));
        if (present(settings.startingMarkupBps)) details.push(row(`${scope}-starting`, `${label} · Starting Gross Margin Markup`, financial(settings.startingMarkupBps)));
      }
      if (modeCalculationIssues(settings).length || scope === "legacy" || scope === "in_house") review(details, `calculation-${scope}-review`, `${label} settings`, scope === "legacy" || scope === "in_house");
    }
    const margins = [
      ["pmcMarginBps", "PMC Margin"],
      ["subVendorMinimumMarginBps", "Sub-Vendor · Min. Lisno Margin"],
      ["subVendorMarginBps", "Sub-Vendor · Max. Lisno Margin"]
    ] as const;
    for (const [field, label] of margins) {
      if (!present(payload[field])) continue;
      const value = financial(payload[field]);
      details.push(row(field, label, value));
      marginHighlights.push(`${label} ${value}`);
    }
    if (present(payload.subVendorMarginBps) && !Object.hasOwn(payload, "subVendorMinimumMarginBps")) review(details, "margin-legacy", "Lisno margin", true);
    if (pmcMarginIssues(payload.pmcMarginBps).length || subVendorMarginRangeIssues(payload).length) review(details, "margin-review", "Margins");
    const supported = ["modeConfigurations", "modeDescription", "modeCalculations", "modeCalculation", ...margins.map(([field]) => field)];
    if (Object.keys(payload).some(key => !supported.includes(key) && present(payload[key]) && (!Array.isArray(payload[key]) || payload[key].length > 0))) review(details, "advanced-legacy", "Other Mode settings", true);
  }
  const specifications = parseKnowledgeSpecifications(pricing?.specifications);
  specifications.specifications.forEach((specification, index) => {
    const name = specification.name.trim() || NAME_UNAVAILABLE;
    details.push(row(`specification-${index}`, "Specification", name));
    add(details, `specification-${index}-description`, `${name} · Description`, specification.description);
    if (specification.hiddenTypedFields) review(details, `specification-${index}-legacy`, name, true);
  });
  if (specifications.issues.length) review(details, "specifications-review", "Specifications");
  const previews: SavedSummaryRow[] = [];
  if (configuredNames.length) previews.push(row("modes", "Modes", namesPreview(configuredNames)));
  if (rateHighlights.length || marginHighlights.length) previews.push(row("rates", "Saved rates / margins", namesPreview([
    ...rateHighlights.slice(0, 1), ...marginHighlights, ...rateHighlights.slice(1)
  ])));
  if (specifications.specifications.length) previews.push(row("specifications", `Specifications (${specifications.specifications.length})`, namesPreview(specifications.specifications.map(item => item.name.trim() || NAME_UNAVAILABLE))));
  const calculationReview = details.find(item => item.key === "calculations-review");
  if (calculationReview && previews.length < 3) previews.push(calculationReview);
  if (!previews.length) previews.push(...details);
  return content(details, previews);
}

function targetRows(input: SavedSummaryProjectionInput, value: KnowledgeJsonObject, key: string): SavedSummaryRow[] {
  const rows: SavedSummaryRow[] = [];
  if (present(value.targetBasketId)) rows.push(row(`${key}-basket`, "Related Main Basket", input.baskets.find(item => item.id === value.targetBasketId)?.name.trim() || NAME_UNAVAILABLE));
  if (present(value.targetSubBasketId)) {
    const matchesBasket = (basketId: string) => !present(value.targetBasketId) || basketId === value.targetBasketId;
    const namedSubBasket = input.subBaskets.find(item => item.id === value.targetSubBasketId && matchesBasket(item.basketId))?.name.trim();
    const namedItem = input.items.find(item => item.subBasketId === value.targetSubBasketId && matchesBasket(item.basketId) && item.subBasketName?.trim())?.subBasketName?.trim();
    rows.push(row(`${key}-sub-basket`, "Related Sub-Basket", namedSubBasket || namedItem || NAME_UNAVAILABLE));
  }
  if (present(value.targetMainLineId)) rows.push(row(`${key}-main-line`, "Related Main Line", input.items.find(item => item.mainLineId === value.targetMainLineId && (!present(value.targetBasketId) || item.basketId === value.targetBasketId))?.mainLineName.trim() || NAME_UNAVAILABLE));
  return rows;
}

function recommendations(input: SavedSummaryProjectionInput): SavedSummaryContent {
  const payload = input.sections.recommendations;
  if (!payload) return content([]);
  const details: SavedSummaryRow[] = [];
  const previews: SavedSummaryRow[] = [];
  const rules = objectRows(payload.budgetAlterations, details, "rules", "Related scope rules");
  rules.forEach((rule, index) => {
    const key = `rule-${index}`;
    const label = `Rule ${index + 1}${rule.active === false ? " · Inactive" : ""}`;
    const targets = targetRows(input, rule, key);
    const target = targets.find(item => item.key.endsWith("-main-line"))?.value || NOT_CONFIGURED;
    const action = BUDGET_ACTIONS.find(item => item.action === rule.action && item.requirement === rule.requirement)?.label || (present(rule.action) || present(rule.requirement) ? NEEDS_REVIEW : NOT_CONFIGURED);
    details.push(row(key, label, `${target} · ${action}`));
    details.push(row(`${key}-trigger`, `${label} · Trigger`, rule.trigger === "added" ? "When this Main Line is added" : rule.trigger === "removed" ? "When this Main Line is removed" : present(rule.trigger) ? NEEDS_REVIEW : NOT_CONFIGURED));
    details.push(...targets.map(item => ({ ...item, label: `${label} · ${item.label}` })));
    add(details, `${key}-reason`, `${label} · Reason`, rule.reason);
    add(details, `${key}-enabled`, `${label} · Enabled`, rule.active);
    if (present(rule.targetType)) details.push(row(`${key}-target-type`, `${label} · Target type`, rule.targetType === "catalog" ? "Catalog Main Line" : rule.targetType === "temporary" ? "Temporary Main Line" : NEEDS_REVIEW));
    if (Object.keys(rule).some(field => !["id", "trigger", "action", "requirement", "targetType", "targetBasketId", "targetSubBasketId", "targetMainLineId", "reason", "active"].includes(field))) review(details, `${key}-review`, label, true);
    previews.push(row(key, label, `${target} · ${action}`));
  });
  if (budgetAlterationIssues(payload.budgetAlterations).length && !details.some(item => item.key === "rules-review")) review(details, "rules-review", "Related scope rules");
  for (const list of ["recommendations", "exclusions"] as const) {
    const records = objectRows(payload[list], details, list, list === "recommendations" ? "Recommendations" : "Exclusions");
    records.forEach((record, index) => {
      const key = `${list}-${index}`;
      const name = text(record.name) || NAME_UNAVAILABLE;
      const label = `${list === "recommendations" ? "Recommendation" : "Exclusion"} ${index + 1}${record.active === false ? " · Inactive" : ""}`;
      details.push(row(key, label, name));
      add(details, `${key}-reason`, `${name} · Reason`, record.reason);
      add(details, `${key}-enabled`, `${name} · Enabled`, record.active);
      if (list === "recommendations") {
        if (present(record.priorityId)) details.push(row(`${key}-priority`, `${name} · Priority`, masterName(input, "priorities", record.priorityId)));
        add(details, `${key}-dependency`, `${name} · Dependency`, record.dependency);
      }
      details.push(...targetRows(input, record, key).map(item => ({ ...item, label: `${name} · ${item.label}` })));
      previews.push(row(key, label, name));
      const invalidFlag = ["active", "dependency"].some(field => present(record[field]) && typeof record[field] !== "boolean");
      if (!text(record.name) || invalidFlag || Object.keys(record).some(field => !["id", "name", "reason", "active", "priorityId", "dependency", "targetBasketId", "targetSubBasketId", "targetMainLineId"].includes(field))) review(details, `${key}-review`, name, true);
    });
  }
  if (Object.keys(payload).some(key => !["budgetAlterations", "recommendations", "exclusions"].includes(key) && present(payload[key]))) review(details, "recommendations-legacy", "Other recommendation settings", true);
  return content(details, previews.length ? previews : details);
}

const QUALITY_TYPES: Readonly<Record<string, string>> = {
  boolean: "Yes / No", text: "Text", number: "Number", dropdown: "Single choice",
  multi_select: "Multiple choice", radio: "Single choice (radio)", checkbox: "Checkbox"
};

const QUALITY_METHODS: Readonly<Record<string, string>> = {
  visual: "Visual", measurement: "Measurement", functional_test: "Functional test", document_review: "Document review"
};

function quality(input: SavedSummaryProjectionInput): SavedSummaryContent {
  if (!input.quality) return content([]);
  const details: SavedSummaryRow[] = [];
  const parameters = objectRows(input.quality.parameters, details, "quality", "Quality parameters");
  const fields = [
    ["unit", "Unit"], ["allowedValues", "Options"], ["minimum", "Minimum"], ["maximum", "Maximum"],
    ["defaultValue", "Default answer"], ["required", "Required"], ["category", "Category"],
    ["instructions", "Instructions"], ["acceptanceCriteria", "Acceptance criteria"], ["stage", "Stage"],
    ["responsibleRole", "Responsible role"], ["failureAction", "Failure action"]
  ] as const;
  parameters.forEach((parameter, index) => {
    const key = `parameter-${index}`;
    const name = text(parameter.label) || NAME_UNAVAILABLE;
    const label = `Question ${index + 1}${parameter.active === false ? " · Inactive" : ""}`;
    details.push(row(key, label, name));
    details.push(row(`${key}-type`, `${name} · Answer type`, QUALITY_TYPES[text(parameter.type) ?? ""] || (present(parameter.type) ? NEEDS_REVIEW : NOT_CONFIGURED)));
    for (const [field, fieldLabel] of fields) add(details, `${key}-${field}`, `${name} · ${fieldLabel}`, parameter[field]);
    add(details, `${key}-enabled`, `${name} · Enabled`, parameter.active);
    if (present(parameter.checkMethod)) details.push(row(`${key}-method`, `${name} · Check method`, QUALITY_METHODS[text(parameter.checkMethod) ?? ""] || NEEDS_REVIEW));
    if (present(parameter.severity)) details.push(row(`${key}-severity`, `${name} · Severity`, ({ critical: "Critical", major: "Major", minor: "Minor" } as Record<string, string>)[text(parameter.severity) ?? ""] || NEEDS_REVIEW));
    if (present(parameter.sampling)) {
      if (object(parameter.sampling)) {
        const sampling = parameter.sampling;
        const methods: Record<string, string> = { all: "All units", percentage: "Percentage", fixed_count: "Fixed count" };
        details.push(row(`${key}-sampling-method`, `${name} · Sampling`, methods[text(sampling.method) ?? ""] || (present(sampling.method) ? NEEDS_REVIEW : NOT_CONFIGURED)));
        add(details, `${key}-sampling-value`, `${name} · Sample ${sampling.method === "percentage" ? "percentage (%)" : "count"}`, sampling.value);
        add(details, `${key}-sampling-unit`, `${name} · Sample unit`, sampling.unit);
      } else review(details, `${key}-sampling-review`, `${name} · Sampling`);
    }
    if (present(parameter.evidence)) {
      if (object(parameter.evidence)) {
        for (const [field, fieldLabel] of [["photos", "Photo evidence"], ["documents", "Document evidence"], ["video", "Video evidence"], ["minPhotosPerSample", "Required photos per checked unit"], ["instructions", "Evidence instructions"]] as const) {
          add(details, `${key}-evidence-${field}`, `${name} · ${fieldLabel}`, parameter.evidence[field]);
        }
      } else review(details, `${key}-evidence-review`, `${name} · Evidence`);
    }
  });
  if (validateQualityParameters(input.quality.parameters).length && !details.some(item => item.key === "quality-review")) review(details, "quality-review", "Quality parameters");
  const preview = parameters.length ? [
    row("parameters", `Parameters (${parameters.length})`, namesPreview(parameters.map(parameter => `${text(parameter.label) || NAME_UNAVAILABLE}${parameter.active === false ? " (Inactive)" : ""}`)))
  ] : [...details];
  const criteria = parameters.find(parameter => text(parameter.acceptanceCriteria));
  if (criteria) preview.push(row("criteria", "Acceptance criteria", `${text(criteria.label) || NAME_UNAVAILABLE}: ${text(criteria.acceptanceCriteria)}`));
  return content(details, preview);
}

/** Only confirmed query payloads belong here; no local buffers or previews. */
export function projectKnowledgeSavedSummary(input: SavedSummaryProjectionInput): SavedSummaryProjection {
  return { overview: overview(input), mode: mode(input), recommendations: recommendations(input), quality: quality(input) };
}
