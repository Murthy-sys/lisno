import type { KnowledgeJsonObject } from "./knowledgeTypes";

export const KNOWLEDGE_MODE_TIERS = ["signature", "premium", "functional"] as const;
export type KnowledgeModeTier = (typeof KNOWLEDGE_MODE_TIERS)[number];

export const KNOWLEDGE_MODE_TIER_LABELS: Readonly<Record<KnowledgeModeTier, string>> = {
  signature: "Signature",
  premium: "Premium",
  functional: "Functional"
};

export function isKnowledgeModeTier(value: unknown): value is KnowledgeModeTier {
  return typeof value === "string" && KNOWLEDGE_MODE_TIERS.some(tier => tier === value);
}

/** Legacy Overview data belongs to Signature. An explicit empty selection stays empty. */
export function applicableKnowledgeTiers(payload: KnowledgeJsonObject): readonly KnowledgeModeTier[] {
  if (!Object.hasOwn(payload, "applicableTiers")) return ["signature"];
  if (!Array.isArray(payload.applicableTiers)) return [];
  return KNOWLEDGE_MODE_TIERS.filter(tier => (payload.applicableTiers as readonly unknown[]).includes(tier));
}
