export * from "../../../../shared/knowledge/knowledgeWorkspaceSections";

import { KNOWLEDGE_WORKSPACE_SECTION_LABELS } from "./knowledgePresentation";
import { KNOWLEDGE_WORKSPACE_SECTION_KEYS } from "../../../../shared/knowledge/knowledgeWorkspaceSections";
import { KNOWLEDGE_MODE_CONFIGURATION_LABELS, type KnowledgeModeConfigurationScope, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";

/** Web navigation includes sections with no configuration fields or API yet. */
export const KNOWLEDGE_WORKSPACE_TAB_KEYS = [
  ...KNOWLEDGE_WORKSPACE_SECTION_KEYS.flatMap(section => section === "mode" ? ["mode", "signature-mode", "premium-mode", "functional-mode"] as const : [section]),
  "design",
  "basket-closure-priority"
] as const;

export type KnowledgeWorkspaceTabKey = (typeof KNOWLEDGE_WORKSPACE_TAB_KEYS)[number];

export const KNOWLEDGE_WORKSPACE_TAB_LABELS = {
  ...KNOWLEDGE_WORKSPACE_SECTION_LABELS,
  mode: KNOWLEDGE_MODE_CONFIGURATION_LABELS.default,
  "signature-mode": KNOWLEDGE_MODE_CONFIGURATION_LABELS.signature,
  "premium-mode": KNOWLEDGE_MODE_CONFIGURATION_LABELS.premium,
  "functional-mode": KNOWLEDGE_MODE_CONFIGURATION_LABELS.functional,
  design: "Design",
  "basket-closure-priority": "Basket closure priority"
} as const satisfies Readonly<Record<KnowledgeWorkspaceTabKey, string>>;

export function knowledgeWorkspaceModeTier(section: KnowledgeWorkspaceTabKey): KnowledgeModeConfigurationScope | null {
  return section === "mode" ? "default" : section === "signature-mode" ? "signature" : section === "premium-mode" ? "premium" : section === "functional-mode" ? "functional" : null;
}

export function knowledgeWorkspaceSectionsForTiers(tiers: readonly KnowledgeModeTier[]): readonly KnowledgeWorkspaceTabKey[] {
  return KNOWLEDGE_WORKSPACE_TAB_KEYS.filter(section => {
    const tier = knowledgeWorkspaceModeTier(section);
    return tier === "default" || tier === null || tiers.includes(tier);
  });
}
