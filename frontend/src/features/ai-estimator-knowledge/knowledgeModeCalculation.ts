import { formatPaiseForRupeeInput, parseRupeeInputToPaise } from "./knowledgePresentation";
import type { KnowledgePreviewRequest } from "./knowledgeApi";
import type { KnowledgeModeCalculationDraft } from "./KnowledgeModeCalculationTable";
import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

export type ModeCalculationSettings = NonNullable<KnowledgePreviewRequest["modeCalculation"]>;

export function parseModeQuantity(text: string, scale: number): string | undefined {
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(text.trim());
  if (!match || text.length > 64) return undefined;
  const fraction = (match[2] ?? "").replace(/0+$/u, "");
  if (fraction.length > scale) return undefined;
  return `${BigInt(match[1]!)}${fraction ? `.${fraction}` : ""}`;
}

export function modeCalculationIssues(value: KnowledgeJsonValue | undefined) {
  if (value == null) return [];
  const issue = (field: string, message: string) => ({ path: `modeCalculation${field ? `.${field}` : ""}`, message });
  if (typeof value !== "object" || Array.isArray(value)) return [issue("", "Review the calculation settings.")];
  const row = value as KnowledgeJsonObject;
  const issues: { path: string; message: string }[] = [];
  const keys = ["baseRatePaise", "lowQuantityLimit", "minimumMarkupBps", "startingMarkupBps"];
  for (const key of Object.keys(value)) if (!keys.includes(key)) issues.push(issue(key, "Unknown calculation setting."));
  for (const key of ["baseRatePaise", "minimumMarkupBps", "startingMarkupBps"] as const) {
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
  if (value == null || modeCalculationIssues(value).length) return { baseRate: "", lowQuantityLimit: "15", minimumRate: "25", startingRate: "35" };
  const settings = value as unknown as ModeCalculationSettings;
  return {
    baseRate: formatPaiseForRupeeInput(settings.baseRatePaise), lowQuantityLimit: settings.lowQuantityLimit,
    minimumRate: formatPaiseForRupeeInput(settings.minimumMarkupBps), startingRate: formatPaiseForRupeeInput(settings.startingMarkupBps)
  };
}

export function parseModeCalculationDraft(draft: KnowledgeModeCalculationDraft, scale: number) {
  const errors: Partial<Record<keyof KnowledgeModeCalculationDraft, string>> = {};
  const base = parseRupeeInputToPaise(draft.baseRate);
  const minimum = parseRupeeInputToPaise(draft.minimumRate);
  const starting = parseRupeeInputToPaise(draft.startingRate);
  const limit = parseModeQuantity(draft.lowQuantityLimit, scale);
  if (base.status !== "valid") errors.baseRate = "Enter a non-negative rupee rate with up to two decimal places.";
  for (const [field, parsed] of [["minimumRate", minimum], ["startingRate", starting]] as const) {
    if (parsed.status !== "valid" || parsed.paise > Number.MAX_SAFE_INTEGER - 10_000) errors[field] = "Enter a supported non-negative percentage with up to two decimal places.";
  }
  if (limit === undefined) errors.lowQuantityLimit = `Enter a non-negative limit with up to ${scale} decimal places.`;
  if (minimum.status === "valid" && starting.status === "valid" && starting.paise < minimum.paise) errors.startingRate = "Starting markup must be at least the minimum markup.";
  const settings: ModeCalculationSettings | undefined = Object.keys(errors).length || base.status !== "valid" || minimum.status !== "valid" || starting.status !== "valid" || limit === undefined
    ? undefined
    : { baseRatePaise: base.paise, lowQuantityLimit: limit, minimumMarkupBps: minimum.paise, startingMarkupBps: starting.paise };
  return { settings, errors };
}
