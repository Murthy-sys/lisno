import type { KnowledgeCompleteness, KnowledgeSectionKey } from "./knowledgeTypes";

/**
 * First-level sections presented in the item workspace.
 *
 * These keys are a frontend navigation contract. In particular, `mode` is a
 * presentation group and must never be sent to the knowledge-section API.
 */
export const KNOWLEDGE_WORKSPACE_SECTION_KEYS = [
  "overview",
  "mode",
  "recommendations",
  "quality"
] as const;

export type KnowledgeWorkspaceSectionKey =
  (typeof KNOWLEDGE_WORKSPACE_SECTION_KEYS)[number];

/** Backend-owned sections read or edited by each visible workspace section. */
export const KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS = {
  overview: ["overview"],
  mode: ["advanced", "pricing"],
  recommendations: ["recommendations"],
  quality: ["quality"]
} as const satisfies Readonly<
  Record<KnowledgeWorkspaceSectionKey, readonly KnowledgeSectionKey[]>
>;

export interface KnowledgeWorkspaceTabProgress {
  readonly configured: number;
  readonly total: number;
  readonly percentage: number;
}

/** Count first-level workspace tabs from saved backend section states. */
export function countConfiguredWorkspaceTabs(
  sections: KnowledgeCompleteness["sections"],
  registry: Readonly<Record<string, readonly KnowledgeSectionKey[]>> = KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS
): KnowledgeWorkspaceTabProgress {
  const states = new Map(sections.map(({ sectionKey, state }) => [sectionKey, state]));
  const tabs = Object.values(registry);
  const configured = tabs.filter((backing) => backing.some((sectionKey) => states.get(sectionKey) === "complete")).length;
  const total = tabs.length;
  return { configured, total, percentage: total ? Math.round(configured * 100 / total) : 100 };
}
