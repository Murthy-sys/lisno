export * from "../../../../shared/knowledge/knowledgeWorkspaceSections";

import { KNOWLEDGE_WORKSPACE_SECTION_LABELS } from "./knowledgePresentation";
import { KNOWLEDGE_WORKSPACE_SECTION_KEYS } from "../../../../shared/knowledge/knowledgeWorkspaceSections";

/** Web navigation includes sections with no configuration fields or API yet. */
export const KNOWLEDGE_WORKSPACE_TAB_KEYS = [
  ...KNOWLEDGE_WORKSPACE_SECTION_KEYS,
  "design",
  "basket-closure-priority"
] as const;

export type KnowledgeWorkspaceTabKey = (typeof KNOWLEDGE_WORKSPACE_TAB_KEYS)[number];

export const KNOWLEDGE_WORKSPACE_TAB_LABELS = {
  ...KNOWLEDGE_WORKSPACE_SECTION_LABELS,
  design: "Design",
  "basket-closure-priority": "Basket closure priority"
} as const satisfies Readonly<Record<KnowledgeWorkspaceTabKey, string>>;
