import { formatPaiseForRupeeInput, parseRupeeInputToPaise } from "./knowledgePresentation";
import type { KnowledgePreviewRequest } from "./knowledgeApi";
import type { KnowledgeModeCalculationDraft } from "./KnowledgeModeCalculationTable";
import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

export type ModeCalculationSettings = NonNullable<KnowledgePreviewRequest["modeCalculation"]>;
export const MODE_CALCULATION_SCOPES = ["pmc", "sub_vendor", "in_house_labor", "in_house_material"] as const;
export type ModeCalculationScope = (typeof MODE_CALCULATION_SCOPES)[number];
export const MODE_CALCULATION_LABELS: Readonly<Record<ModeCalculationScope, string>> = {
  pmc: "PMC", sub_vendor: "Sub-Vendor", in_house_labor: "Labor cost", in_house_material: "Material cost"
};

function calculationMap(payload: KnowledgeJsonObject): KnowledgeJsonObject | undefined {
  const value = payload.modeCalculations;
  return value && typeof value === "object" && !Array.isArray(value) ? value as KnowledgeJsonObject : undefined;
}

function hasInHouseCosts(map: KnowledgeJsonObject) {
  return Object.hasOwn(map, "in_house_labor") || Object.hasOwn(map, "in_house_material");
}

/** Legacy values seed each cost once; split costs never inherit subsequent legacy edits. */
export function modeCalculationsForPayload(payload: KnowledgeJsonObject): Record<ModeCalculationScope, KnowledgeJsonValue> {
  const scoped = calculationMap(payload);
  return Object.fromEntries(MODE_CALCULATION_SCOPES.map((scope) => {
    if (!Object.hasOwn(payload, "modeCalculations")) return [scope, payload.modeCalculation ?? null];
    if (!scoped) return [scope, null];
    const isInHouse = scope === "in_house_labor" || scope === "in_house_material";
    return [scope, isInHouse && !hasInHouseCosts(scoped) ? scoped.in_house ?? null : scoped[scope] ?? null];
  })) as Record<ModeCalculationScope, KnowledgeJsonValue>;
}

export function modeCalculationsForStorage(payload: KnowledgeJsonObject): KnowledgeJsonObject {
  const scoped = calculationMap(payload);
  return {
    ...(scoped && Object.hasOwn(scoped, "in_house") ? { in_house: scoped.in_house! } : {}),
    ...modeCalculationsForPayload(payload)
  };
}

export function withModeCalculation(payload: KnowledgeJsonObject, scope: ModeCalculationScope, settings: ModeCalculationSettings): KnowledgeJsonObject {
  return { ...payload, modeCalculations: { ...modeCalculationsForStorage(payload), [scope]: { ...settings } } };
}

export function modeCalculationsIssues(payload: KnowledgeJsonObject) {
  const issues = modeCalculationIssues(payload.modeCalculation);
  if (!Object.hasOwn(payload, "modeCalculations")) return issues;
  const scoped = calculationMap(payload);
  if (!scoped) {
    return [...issues, { path: "modeCalculations", message: "Review the Mode calculation settings." }];
  }
  for (const key of Object.keys(scoped)) {
    if (key !== "in_house" && !MODE_CALCULATION_SCOPES.includes(key as ModeCalculationScope)) issues.push({ path: `modeCalculations.${key}`, message: "Unknown calculation Mode." });
  }
  const required = hasInHouseCosts(scoped) ? MODE_CALCULATION_SCOPES : ["pmc", "sub_vendor", "in_house"] as const;
  for (const scope of required) {
    if (!Object.hasOwn(scoped, scope)) issues.push({ path: `modeCalculations.${scope}`, message: `${scope === "in_house" ? "In-house" : MODE_CALCULATION_LABELS[scope]} calculation settings are missing.` });
  }
  for (const scope of [...MODE_CALCULATION_SCOPES, "in_house"] as const) {
    if (Object.hasOwn(scoped, scope)) issues.push(...modeCalculationIssues(scoped[scope], `modeCalculations.${scope}`));
  }
  return issues;
}

export function calculationScopeForIssue(path: string): ModeCalculationScope | undefined {
  if (path === "modeCalculation" || path.startsWith("modeCalculation.") || path === "modeCalculations") return "pmc";
  if (path === "modeCalculations.in_house" || path.startsWith("modeCalculations.in_house.")) return "in_house_labor";
  return MODE_CALCULATION_SCOPES.find((scope) => path === `modeCalculations.${scope}` || path.startsWith(`modeCalculations.${scope}.`));
}

export function maximumModeDiscountBps(draft: Pick<KnowledgeModeCalculationDraft, "minimumRate" | "startingRate">): number | undefined {
  const minimum = parseRupeeInputToPaise(draft.minimumRate);
  const starting = parseRupeeInputToPaise(draft.startingRate);
  if (minimum.status !== "valid" || starting.status !== "valid"
    || minimum.paise > Number.MAX_SAFE_INTEGER - 10_000 || starting.paise > Number.MAX_SAFE_INTEGER - 10_000
    || starting.paise < minimum.paise) return undefined;
  // Percentage inputs use the same exact hundredths parser as rupee inputs.
  return starting.paise - minimum.paise;
}

export function parseModeQuantity(text: string, scale: number): string | undefined {
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(text.trim());
  if (!match || text.length > 64) return undefined;
  const fraction = (match[2] ?? "").replace(/0+$/u, "");
  if (fraction.length > scale) return undefined;
  return `${BigInt(match[1]!)}${fraction ? `.${fraction}` : ""}`;
}

export function modeCalculationIssues(value: KnowledgeJsonValue | undefined, rootPath = "modeCalculation") {
  if (value == null) return [];
  const issue = (field: string, message: string) => ({ path: `${rootPath}${field ? `.${field}` : ""}`, message });
  if (typeof value !== "object" || Array.isArray(value)) return [issue("", "Review the calculation settings.")];
  const row = value as KnowledgeJsonObject;
  const issues: { path: string; message: string }[] = [];
  const keys = ["baseRatePaise", "lowQuantityLimit", "minimumMarkupBps", "startingMarkupBps", "impactBps"];
  for (const key of Object.keys(value)) if (!keys.includes(key)) issues.push(issue(key, "Unknown calculation setting."));
  for (const key of ["baseRatePaise", "minimumMarkupBps", "startingMarkupBps", "impactBps"] as const) {
    if (key === "impactBps" && !Object.hasOwn(row, key)) continue;
    const number = row[key];
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0 || number > Number.MAX_SAFE_INTEGER - (key === "baseRatePaise" ? 0 : 10_000)) {
      issues.push(issue(key, "Enter a supported non-negative value."));
    }
  }
  if (typeof row.lowQuantityLimit !== "string" || !/^(0|[1-9]\d*)(?:\.\d+)?$/u.test(row.lowQuantityLimit) || row.lowQuantityLimit.length > 64) {
    issues.push(issue("lowQuantityLimit", "Enter a valid Low Quantity Limit."));
  }
  if (typeof row.startingMarkupBps === "number" && typeof row.minimumMarkupBps === "number" && row.startingMarkupBps < row.minimumMarkupBps) {
    issues.push(issue("startingMarkupBps", "Starting markup must be at least the minimum markup."));
  }
  return issues;
}

export function modeCalculationDraft(value: KnowledgeJsonValue | undefined): KnowledgeModeCalculationDraft {
  if (value == null || modeCalculationIssues(value).length) return { baseRate: "", lowQuantityLimit: "15", impactRate: "10", minimumRate: "25", startingRate: "35" };
  const settings = value as unknown as ModeCalculationSettings;
  return {
    baseRate: formatPaiseForRupeeInput(settings.baseRatePaise), lowQuantityLimit: settings.lowQuantityLimit,
    impactRate: formatPaiseForRupeeInput(settings.impactBps ?? 1_000),
    minimumRate: formatPaiseForRupeeInput(settings.minimumMarkupBps), startingRate: formatPaiseForRupeeInput(settings.startingMarkupBps)
  };
}

export function parseModeCalculationDraft(draft: KnowledgeModeCalculationDraft, scale: number) {
  const errors: Partial<Record<keyof KnowledgeModeCalculationDraft, string>> = {};
  const base = parseRupeeInputToPaise(draft.baseRate);
  const minimum = parseRupeeInputToPaise(draft.minimumRate);
  const starting = parseRupeeInputToPaise(draft.startingRate);
  const impact = parseRupeeInputToPaise(draft.impactRate);
  const limit = parseModeQuantity(draft.lowQuantityLimit, scale);
  if (base.status !== "valid") errors.baseRate = "Enter a non-negative rupee rate with up to two decimal places.";
  for (const [field, parsed] of [["minimumRate", minimum], ["startingRate", starting], ["impactRate", impact]] as const) {
    if (parsed.status !== "valid" || parsed.paise > Number.MAX_SAFE_INTEGER - 10_000) errors[field] = "Enter a supported non-negative percentage with up to two decimal places.";
  }
  if (limit === undefined) errors.lowQuantityLimit = `Enter a non-negative limit with up to ${scale} decimal places.`;
  if (minimum.status === "valid" && starting.status === "valid" && starting.paise < minimum.paise) errors.startingRate = "Starting markup must be at least the minimum markup.";
  const settings: ModeCalculationSettings | undefined = Object.keys(errors).length || base.status !== "valid" || minimum.status !== "valid" || starting.status !== "valid" || impact.status !== "valid" || limit === undefined
    ? undefined
    : { baseRatePaise: base.paise, lowQuantityLimit: limit, impactBps: impact.paise, minimumMarkupBps: minimum.paise, startingMarkupBps: starting.paise };
  return { settings, errors };
}
