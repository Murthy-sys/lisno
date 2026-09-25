import type { KnowledgeJsonObject, KnowledgeJsonValue } from "../../../../shared/knowledge/knowledgeTypes";
import type { KnowledgeModeCalculationDraft } from "../../../../shared/knowledge/knowledgeCalculationTypes";
import { modeCalculationDraft, modeCalculationsForStorage, parseModeQuantity, type ModeCalculationScope } from "../../../../shared/knowledge/knowledgeModeCalculation";
import { formatPaiseForRupeeInput, parseRupeeInputToPaise } from "../../../../shared/knowledge/knowledgePresentation";

export const isKnowledgeObject = (value: KnowledgeJsonValue | undefined): value is KnowledgeJsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
export const knowledgeText = (value: KnowledgeJsonValue | undefined): string => typeof value === "string" ? value : "";
export const calculationFields = { baseRate: "baseRatePaise", lowQuantityLimit: "lowQuantityLimit", impactRate: "impactBps", minimumRate: "minimumMarkupBps", startingRate: "startingMarkupBps" } as const;

/** Retain incomplete native numeric input in the draft instead of reverting to defaults. */
export function nativeCalculationDraft(value: KnowledgeJsonValue | undefined): KnowledgeModeCalculationDraft {
  const defaults = modeCalculationDraft(value);
  if (!isKnowledgeObject(value)) return defaults;
  return Object.fromEntries(Object.entries(calculationFields).map(([field, property]) => {
    const stored = value[property];
    return [field, typeof stored === "string" ? stored : typeof stored === "number" && Number.isSafeInteger(stored) && stored >= 0
      ? formatPaiseForRupeeInput(stored) : defaults[field as keyof KnowledgeModeCalculationDraft]];
  })) as unknown as KnowledgeModeCalculationDraft;
}

export function nativePercentage(text: string): KnowledgeJsonValue {
  if (!text.trim()) return null;
  const parsed = parseRupeeInputToPaise(text);
  return parsed.status === "valid" ? parsed.paise : text;
}

export function nativeCalculationChange(payload: KnowledgeJsonObject, scope: ModeCalculationScope, draft: KnowledgeModeCalculationDraft, scale: number): KnowledgeJsonObject {
  const map = modeCalculationsForStorage(payload);
  // Preserve unrecognized saved keys so editing one control cannot silently discard data.
  const originalMap = isKnowledgeObject(payload.modeCalculations) ? payload.modeCalculations : {};
  const current = isKnowledgeObject(map[scope]) ? map[scope] : {};
  const settings = Object.fromEntries(Object.entries(calculationFields).map(([field, property]) => {
    const text = draft[field as keyof KnowledgeModeCalculationDraft];
    if (field === "lowQuantityLimit") return [property, parseModeQuantity(text, scale) ?? text];
    const parsed = parseRupeeInputToPaise(text);
    return [property, parsed.status === "valid" ? parsed.paise : text];
  }));
  return { ...payload, modeCalculations: { ...map, ...originalMap, [scope]: { ...current, ...settings } } };
}

/** Patch one stable row, preserving raw legacy/unknown sibling records and fields. */
export function patchKnowledgeRow(payload: KnowledgeJsonObject, key: string, id: string, patch: KnowledgeJsonObject): KnowledgeJsonObject {
  const rows = Array.isArray(payload[key]) ? payload[key] : [];
  return { ...payload, [key]: rows.map(row => isKnowledgeObject(row) && row.id === id ? { ...row, ...patch } : row) };
}
