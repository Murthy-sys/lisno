import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

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

export function qualityEvidenceSummary(parameter: KnowledgeJsonObject): string {
  const value = parameter.evidence;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Not required";
  const evidence = value as KnowledgeJsonObject;
  const parts: string[] = [];
  if (evidence.photos === true) {
    const count = evidence.minPhotosPerSample;
    parts.push(typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= 100 ? `${count} photo${count === 1 ? "" : "s"} per checked unit` : "Photo count needed");
  }
  if (evidence.documents === true) parts.push("Documents");
  if (evidence.video === true) parts.push("Video");
  return parts.join(" + ") || "Not required";
}

export function qualityParameterKey(parameter: KnowledgeJsonObject, index: number): string {
  return typeof parameter.id === "string" && parameter.id ? parameter.id : `legacy-row-${index}`;
}
