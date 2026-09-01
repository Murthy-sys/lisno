import type { KnowledgeSectionKey } from "./knowledgeTypes";

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
  mode: ["advanced", "pricing", "quantity-margin"],
  recommendations: ["recommendations"],
  quality: ["quality"]
} as const satisfies Readonly<
  Record<KnowledgeWorkspaceSectionKey, readonly KnowledgeSectionKey[]>
>;
