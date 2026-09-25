import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";
import {
  QUALITY_FREQUENCY_OPTIONS, QUALITY_PERFORMER_OPTIONS, QUALITY_SEVERITY_OPTIONS,
  isQualityControlOptionReference, qualityControlOptionByReference,
  qualityFrequencyFromSampling, qualityFrequencySelectionFromSampling,
  qualityPerformer, qualityPerformerSelection, qualitySeverity,
  type QualityControlOptionCatalog
} from "./knowledgeQuality";

export const QUALITY_STAGE_OPTIONS = [
  { key: "material", label: "Material" },
  { key: "pre-installation", label: "Pre-Installation" },
  { key: "during-installation", label: "During Installation" },
  { key: "pre-closure", label: "Pre-Closure" },
  { key: "final-finish", label: "Final Finish" }
] as const;
export type QualityStageFilter = "all" | typeof QUALITY_STAGE_OPTIONS[number]["key"] | "other" | "unassigned";
export const QUALITY_TYPE_LABELS: Readonly<Record<string, string>> = { boolean: "Yes / No", text: "Text", number: "Number", dropdown: "Single choice", multi_select: "Multiple choice", radio: "Single choice (radio)", checkbox: "Checkbox" };
export const QUALITY_METHOD_LABELS: Readonly<Record<string, string>> = { visual: "Visual Check", measurement: "Measurement", functional_test: "Functional Test", document_review: "Document Review" };
export const qualityText = (value: KnowledgeJsonValue | undefined): string => typeof value === "string" ? value : "";
const optionLabel = <T extends string>(options: readonly { readonly value: T; readonly label: string }[], value: T | null) => options.find(option => option.value === value)?.label;

export function qualitySeverityPresentation(value: KnowledgeJsonValue | undefined): { label: string; meaning?: string; canonical: boolean } {
  const key = qualitySeverity(value);
  const option = QUALITY_SEVERITY_OPTIONS.find(candidate => candidate.value === key);
  return option ? { label: option.label, meaning: option.meaning, canonical: true } : { label: "Not configured", canonical: false };
}

export function qualityPerformerPresentation(value: KnowledgeJsonValue | undefined, catalog?: QualityControlOptionCatalog): { label: string; canonical: boolean } {
  const key = qualityPerformer(value);
  if (key) return { label: optionLabel(QUALITY_PERFORMER_OPTIONS, key)!, canonical: true };
  const selection = qualityPerformerSelection(value);
  if (selection && isQualityControlOptionReference(selection)) {
    const custom = qualityControlOptionByReference(catalog, "performer", selection);
    return custom ? { label: custom.name, canonical: true } : { label: "Unavailable performed-by value", canonical: false };
  }
  const legacy = qualityText(value).trim();
  return legacy ? { label: `Legacy responsible role: ${legacy}`, canonical: false } : { label: "Not configured", canonical: false };
}

export function qualityFrequencyPresentation(value: KnowledgeJsonValue | undefined, catalog?: QualityControlOptionCatalog): { label: string; scopeLabel: string; canonical: boolean } {
  const key = qualityFrequencyFromSampling(value);
  if (key) {
    const label = optionLabel(QUALITY_FREQUENCY_OPTIONS, key)!;
    return { label, scopeLabel: label === "Once per project" ? "project" : label.replace(/^Per /u, ""), canonical: true };
  }
  const selection = qualityFrequencySelectionFromSampling(value);
  if (selection && isQualityControlOptionReference(selection)) {
    const custom = qualityControlOptionByReference(catalog, "frequency", selection);
    return custom
      ? { label: custom.name, scopeLabel: custom.name, canonical: true }
      : { label: "Unavailable frequency value", scopeLabel: "scope", canonical: false };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sampling = value as KnowledgeJsonObject;
    const method = qualityText(sampling.method).replaceAll("_", " ") || "custom";
    const unit = qualityText(sampling.unit).trim();
    const count = typeof sampling.value === "number" ? ` ${sampling.value}` : "";
    return { label: `Legacy custom frequency: ${method}${count}${unit ? ` · ${unit}` : ""}`, scopeLabel: unit || "unit", canonical: false };
  }
  return { label: "Not configured", scopeLabel: "unit", canonical: false };
}

export function qualityPassRange(parameter: KnowledgeJsonObject): string | null {
  if (parameter.type !== "number") return null;
  const minimum = qualityText(parameter.minimum).trim();
  const maximum = qualityText(parameter.maximum).trim();
  const unit = qualityText(parameter.unit).trim();
  return minimum && maximum && unit ? `${minimum}–${maximum} ${unit}` : "Not configured";
}

/** This is a view classification only. Original stage text is never rewritten. */
export function qualityStage(value: KnowledgeJsonValue | undefined): { key: QualityStageFilter; label: string } {
  const stage = qualityText(value).trim();
  if (!stage) return { key: "unassigned", label: "Unassigned" };
  const normalized = stage.toLocaleLowerCase("en").replace(/[\s_-]+/gu, "-");
  const canonical = QUALITY_STAGE_OPTIONS.find(option => option.key === normalized);
  return canonical ?? { key: "other", label: stage };
}

export function qualityStageCounts(parameters: readonly KnowledgeJsonObject[]) {
  const counts: Record<QualityStageFilter, number> = { all: parameters.length, material: 0, "pre-installation": 0, "during-installation": 0, "pre-closure": 0, "final-finish": 0, other: 0, unassigned: 0 };
  for (const parameter of parameters) counts[qualityStage(parameter.stage).key] += 1;
  return counts;
}

export function qualityEvidenceSummary(parameter: KnowledgeJsonObject, catalog?: QualityControlOptionCatalog): string {
  const value = parameter.evidence;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Not required";
  const evidence = value as KnowledgeJsonObject;
  const parts: string[] = [];
  if (evidence.photos === true) {
    const count = evidence.minPhotosPerSample;
    const scope = qualityFrequencyPresentation(parameter.sampling, catalog).scopeLabel;
    parts.push(typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= 100 ? `${count} photo${count === 1 ? "" : "s"} per checked ${scope}` : "Photo count needed");
  }
  if (evidence.documents === true) parts.push("Documents");
  if (evidence.video === true) parts.push("Video");
  return parts.join(" + ") || "Not required";
}

export function qualityParameterKey(parameter: KnowledgeJsonObject, index: number): string {
  return typeof parameter.id === "string" && parameter.id ? parameter.id : `legacy-row-${index}`;
}
