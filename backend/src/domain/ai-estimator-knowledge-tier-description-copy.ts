import type { KnowledgeSectionApplicability } from "./ai-estimator-knowledge.js";
import { projectEstimatorTierDescription } from "./estimator-tier-description.js";
import {
  KNOWLEDGE_MODE_TIERS,
  isKnowledgeModeTier,
  knowledgeModeTierPayload,
  type KnowledgeModeConfigurationScope,
  type KnowledgeModeTier
} from "./ai-estimator-knowledge-mode-tiers.js";

type Payload = Record<string, unknown>;
const isRecord = (value: unknown): value is Payload => value !== null && typeof value === "object" && !Array.isArray(value);

interface CopyInput {
  readonly previousPayload: Payload;
  readonly payload: Payload;
  readonly rootApplicability: KnowledgeSectionApplicability;
  readonly sourceApplicability: KnowledgeSectionApplicability;
  readonly modeTier: KnowledgeModeConfigurationScope;
  readonly overviewPayload: Payload;
  readonly initializeSavedDescription?: boolean;
}

/** Initialize sibling descriptions after the selected payload has been validated and merged. */
export function copyUninitializedTierDescriptions(input: CopyInput): {
  payload: Payload;
  rootApplicability: KnowledgeSectionApplicability;
  copiedTiers: KnowledgeModeTier[];
} {
  let { payload, rootApplicability } = input;
  const copiedTiers: KnowledgeModeTier[] = [];
  const unchanged = { payload, rootApplicability, copiedTiers };
  const enabled = Object.hasOwn(input.overviewPayload, "applicableTiers")
    ? input.overviewPayload.applicableTiers : ["signature"];
  const text = knowledgeModeTierPayload(payload, input.modeTier).modeDescription;
  if (!isKnowledgeModeTier(input.modeTier) || !Array.isArray(enabled) || !enabled.includes(input.modeTier)
    || input.sourceApplicability !== "configured" || typeof text !== "string" || !text.trim()
    || (!input.initializeSavedDescription && text === knowledgeModeTierPayload(input.previousPayload, input.modeTier).modeDescription)) return unchanged;

  // Malformed namespaces remain visible to the existing whole-section validator.
  if (Object.hasOwn(payload, "tierConfigurations") && !isRecord(payload.tierConfigurations)) return unchanged;
  for (const tier of KNOWLEDGE_MODE_TIERS) {
    if (tier === input.modeTier || !enabled.includes(tier)) continue;
    const namespaces = isRecord(payload.tierConfigurations) ? payload.tierConfigurations : {};
    const branch = namespaces[tier];
    if (tier !== "signature" && Object.hasOwn(namespaces, tier)
      && (!isRecord(branch) || !isRecord(branch.payload)
        || (branch.applicability !== "configured" && branch.applicability !== "not_configured"))) continue;
    if (tier === "signature" && rootApplicability === "not_applicable") continue;

    const destination = knowledgeModeTierPayload(payload, tier);
    // An empty string is a deliberate clear, not an invitation to copy again.
    if (Object.hasOwn(destination, "modeDescription") && destination.modeDescription !== null) continue;
    if (tier === "signature") {
      payload = { ...payload, modeDescription: text };
      rootApplicability = "configured";
    } else {
      payload = { ...payload, tierConfigurations: { ...namespaces, [tier]: {
        ...(isRecord(branch) ? branch : {}), applicability: "configured",
        payload: { ...destination, modeDescription: text }
      } } };
    }
    copiedTiers.push(tier);
  }
  return { payload, rootApplicability, copiedTiers };
}

/** Saved source priority is deterministic; opening an editor never supplies paragraph text. */
export function initializeSavedTierDescriptions(input: {
  readonly payload: Payload;
  readonly rootApplicability: KnowledgeSectionApplicability;
  readonly overviewPayload: Payload;
}): ReturnType<typeof copyUninitializedTierDescriptions> & { sourceTier: KnowledgeModeTier | null } {
  const enabled = Object.hasOwn(input.overviewPayload, "applicableTiers")
    ? input.overviewPayload.applicableTiers : ["signature"];
  if (Array.isArray(enabled)) for (const tier of KNOWLEDGE_MODE_TIERS) {
    if (!enabled.includes(tier)) continue;
    const text = projectEstimatorTierDescription({ sectionKey: "advanced", payload: input.payload,
      applicability: input.rootApplicability }, tier, "");
    if (!text) continue;
    const copied = copyUninitializedTierDescriptions({ ...input, previousPayload: input.payload,
      sourceApplicability: "configured", modeTier: tier, initializeSavedDescription: true });
    return { ...copied, sourceTier: copied.copiedTiers.length ? tier : null };
  }
  return { payload: input.payload, rootApplicability: input.rootApplicability, copiedTiers: [], sourceTier: null };
}
