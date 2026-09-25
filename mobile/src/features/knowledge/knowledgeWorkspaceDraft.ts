import type { KnowledgeApi } from "../../../../shared/knowledge/knowledgeApi";
import type { KnowledgeJsonObject, KnowledgeSectionEnvelope, KnowledgeSectionKey, KnowledgeSectionMutationEnvelope } from "../../../../shared/knowledge/knowledgeTypes";
import { knowledgeSectionPayloadForUpdate } from "../../../../shared/knowledge/knowledgeSectionPayload";

export const MOBILE_SECTION_KEYS = ["overview", "advanced", "pricing", "recommendations"] as const;
export type MobileSectionKey = typeof MOBILE_SECTION_KEYS[number];
export interface KnowledgeSectionDraft { readonly base: KnowledgeSectionEnvelope; readonly payload: KnowledgeJsonObject }
export type KnowledgeDrafts = Partial<Record<MobileSectionKey, KnowledgeSectionDraft>>;

export function changedPayloadFields(draft: KnowledgeSectionDraft): readonly string[] {
  return [...new Set([...Object.keys(draft.base.payload), ...Object.keys(draft.payload)])].filter(key => JSON.stringify(draft.base.payload[key]) !== JSON.stringify(draft.payload[key]));
}

export function rebaseKnowledgeDraft(draft: KnowledgeSectionDraft, remote: KnowledgeSectionEnvelope): KnowledgeSectionDraft {
  const payload = { ...remote.payload };
  for (const key of changedPayloadFields(draft)) {
    if (Object.hasOwn(draft.payload, key)) payload[key] = draft.payload[key]!;
    else delete payload[key];
  }
  return { base: remote, payload };
}

/** A successful section is acknowledged immediately, even if a later write fails. */
export async function saveKnowledgeDrafts(input: {
  readonly api: Pick<KnowledgeApi, "updateKnowledgeSection">;
  readonly mainLineId: string;
  readonly revisionId: string;
  readonly aggregateVersion: number;
  readonly drafts: KnowledgeDrafts;
  readonly onSaved: (key: MobileSectionKey, result: KnowledgeSectionMutationEnvelope) => void;
  readonly onAttempt?: (key: MobileSectionKey) => void;
}): Promise<number> {
  let aggregateVersion = input.aggregateVersion;
  for (const key of MOBILE_SECTION_KEYS) {
    const draft = input.drafts[key];
    if (!draft || !changedPayloadFields(draft).length) continue;
    input.onAttempt?.(key);
    const result = await input.api.updateKnowledgeSection(input.mainLineId, input.revisionId, key satisfies KnowledgeSectionKey, {
      expectedVersion: draft.base.version,
      expectedAggregateVersion: aggregateVersion,
      applicability: key === "advanced" || (key === "overview" && changedPayloadFields(draft).includes("surfaceIds") && Array.isArray(draft.payload.surfaceIds) && draft.payload.surfaceIds.length > 0)
        ? "configured"
        : draft.base.applicability,
      payload: knowledgeSectionPayloadForUpdate(key, draft.payload)
    });
    aggregateVersion = result.aggregateVersion;
    input.onSaved(key, result);
  }
  return aggregateVersion;
}
