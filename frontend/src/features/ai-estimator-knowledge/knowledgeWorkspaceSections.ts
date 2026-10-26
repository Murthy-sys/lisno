export * from "../../../../shared/knowledge/knowledgeWorkspaceSections";

import { KNOWLEDGE_WORKSPACE_SECTION_LABELS } from "./knowledgePresentation";
import { KNOWLEDGE_WORKSPACE_SECTION_KEYS } from "../../../../shared/knowledge/knowledgeWorkspaceSections";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";

/** Web navigation includes sections with no configuration fields or API yet. */
export const KNOWLEDGE_WORKSPACE_TAB_KEYS = [
  ...KNOWLEDGE_WORKSPACE_SECTION_KEYS.flatMap(section => section === "mode" ? ["mode", "premium-mode", "functional-mode"] as const : [section]),
  "design",
  "basket-closure-priority"
] as const;

export type KnowledgeWorkspaceTabKey = (typeof KNOWLEDGE_WORKSPACE_TAB_KEYS)[number];

export const KNOWLEDGE_WORKSPACE_TAB_LABELS = {
  ...KNOWLEDGE_WORKSPACE_SECTION_LABELS,
  mode: "Signature mode",
  "premium-mode": "Premium mode",
  "functional-mode": "Functional mode",
  design: "Design",
  "basket-closure-priority": "Basket closure priority"
} as const satisfies Readonly<Record<KnowledgeWorkspaceTabKey, string>>;

export function knowledgeWorkspaceModeTier(section: KnowledgeWorkspaceTabKey): KnowledgeModeTier | null {
  return section === "mode" ? "signature" : section === "premium-mode" ? "premium" : section === "functional-mode" ? "functional" : null;
}

export function knowledgeWorkspaceSectionsForTiers(tiers: readonly KnowledgeModeTier[]): readonly KnowledgeWorkspaceTabKey[] {
  return KNOWLEDGE_WORKSPACE_TAB_KEYS.filter(section => {
    const tier = knowledgeWorkspaceModeTier(section);
    return tier === null || tiers.includes(tier);
  });
}
