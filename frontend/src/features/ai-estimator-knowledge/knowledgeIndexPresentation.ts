import type {
  KnowledgeCompleteness,
  KnowledgeMaster,
  KnowledgePrioritySemanticTier
} from "./knowledgeTypes";

export type CatalogState = "loading" | "ready" | "error";
export type PriorityTone = "high" | "medium" | "low" | "none" | "unavailable";

const LOADING_LABEL = "…";

const PRIORITY_TIER_TONES = {
  non_negotiable: "high",
  high: "high",
  medium: "medium",
  low: "low"
} as const satisfies Readonly<Record<KnowledgePrioritySemanticTier, PriorityTone>>;

export function sectionSummary(
  completeness: KnowledgeCompleteness
): { complete: number; applicable: number } | null {
  const applicable = completeness.sections.filter(({ state }) => state !== "not_applicable");
  if (applicable.length === 0) return null;
  return {
    complete: applicable.filter(({ state }) => state === "complete").length,
    applicable: applicable.length
  };
}

export function unitLabel(
  uomId: string | null,
  uoms: readonly KnowledgeMaster[],
  state: CatalogState
): string {
  if (uomId === null) return "No unit";
  if (state === "loading") return LOADING_LABEL;
  return uoms.find(({ id }) => id === uomId)?.name ?? "Unit unavailable";
}

export function priorityDisplay(
  priorityId: string | null,
  priorities: readonly KnowledgeMaster[],
  state: CatalogState
): { label: string; tone: PriorityTone } {
  if (priorityId === null) return { label: "No priority", tone: "none" };
  if (state === "loading") return { label: LOADING_LABEL, tone: "unavailable" };
  const priority = priorities.find(({ id }) => id === priorityId);
  if (!priority) return { label: "Priority unavailable", tone: "unavailable" };
  return {
    label: priority.name,
    tone: priority.semanticTier ? PRIORITY_TIER_TONES[priority.semanticTier] : "none"
  };
}
