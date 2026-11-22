import type { MarginEditField } from "../../../../shared/knowledge/knowledgeSubBasketMarginTypes";
import type { KnowledgeApi } from "../../../../shared/knowledge/knowledgeApi";
import type { KnowledgeJsonObject, KnowledgeSectionEnvelope, KnowledgeSectionKey, KnowledgeSectionMutationEnvelope } from "../../../../shared/knowledge/knowledgeTypes";
import { modeCalculationsForPayload } from "../../../../shared/knowledge/knowledgeModeCalculation";
import { pmcMarginRange, subVendorMarginRange } from "../../../../shared/knowledge/knowledgePmcMargin";
import { nativeCalculationDraft, nativePercentage } from "./knowledgeModeNativeModel";
import { knowledgeSectionPayloadForUpdate } from "../../../../shared/knowledge/knowledgeSectionPayload";

export const MOBILE_SECTION_KEYS = ["overview", "advanced", "pricing", "recommendations"] as const;
export type MobileSectionKey = typeof MOBILE_SECTION_KEYS[number];
export interface KnowledgeSectionDraft {
  readonly base: KnowledgeSectionEnvelope;
  readonly payload: KnowledgeJsonObject;
  readonly marginEdits?: readonly MarginEditField[];
}
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
  return { ...draft, base: remote, payload };
}

// The native Mode editor currently edits Signature. Component lists are read-only here,
// so the editable In-house percentages always belong to the Main Line's own component.
function nativeMarginValue(payload: KnowledgeJsonObject, field: MarginEditField) {
  const minimum = field.bound === "minimumBps";
  if (field.mode === "in_house") {
    const cost = modeCalculationsForPayload(payload)[field.key === "labor" ? "in_house_labor" : "in_house_material"];
    const value = nativeCalculationDraft(cost);
    return nativePercentage(minimum ? value.minimumRate : value.startingRate);
  }
  const range = field.mode === "pmc" ? pmcMarginRange(payload) : subVendorMarginRange(payload);
  return minimum ? range.minimum : range.maximum;
}

export function nativeMarginEdits(current: readonly MarginEditField[], field: MarginEditField): readonly MarginEditField[] {
  const alreadyEdited = current.some(edit => edit.mode === field.mode && edit.key === field.key && edit.bound === field.bound
    && edit.component?.basketId === field.component?.basketId && edit.component?.subBasketId === field.component?.subBasketId);
  return alreadyEdited ? current : [...current, field];
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
      ...(key === "advanced" ? { marginEdits: (draft.marginEdits ?? []).filter(field =>
        nativeMarginValue(draft.base.payload, field) !== nativeMarginValue(draft.payload, field)) } : {}),
      payload: knowledgeSectionPayloadForUpdate(key, draft.payload)
    });
    aggregateVersion = result.aggregateVersion;
    input.onSaved(key, result);
  }
  return aggregateVersion;
}
