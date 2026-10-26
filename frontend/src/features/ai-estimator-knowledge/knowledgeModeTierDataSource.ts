import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { KnowledgeJsonObject, KnowledgeItemDetail, KnowledgeSectionEnvelope, KnowledgeSectionKey } from "./knowledgeTypes";
import type { KnowledgeSectionUpdate } from "./knowledgeApi";
import { liveKnowledgeEditorDataSource, type KnowledgeEditorDataSource } from "./knowledgeEditorDataSource";

const isModeSection = (section: KnowledgeSectionKey) => section === "advanced" || section === "pricing";

/** Tier projections have separate caches; shared Overview and catalogue references keep their existing owners. */
export function knowledgeModeTierDataSource(tier: KnowledgeModeTier, source: KnowledgeEditorDataSource = liveKnowledgeEditorDataSource): KnowledgeEditorDataSource {
  if (tier === "signature") return source;
  const sectionKey: KnowledgeEditorDataSource["sectionKey"] = (id, revision, section) => isModeSection(section)
    ? [...source.sectionKey(id, revision, section), "mode-tier", tier]
    : source.sectionKey(id, revision, section);
  const verify = <T extends KnowledgeSectionEnvelope<KnowledgeJsonObject>>(value: T, id: string, revision: string, section: KnowledgeSectionKey): T => {
    if (value.mainLineId !== id || value.revisionId !== revision || value.sectionKey !== section || value.modeTier !== tier) {
      throw new Error("The saved Mode tier could not be verified. Refresh this tier before editing.");
    }
    return value;
  };
  return {
    ...source,
    scopeKey: `${source.scopeKey}:mode-tier:${tier}`,
    modeTier: tier,
    supportsLiveConfigurationRequests: source.scopeKey === "live-configuration" || source.supportsLiveConfigurationRequests === true,
    sectionKey,
    getSection: async <T extends KnowledgeJsonObject>(id: string, revision: string, section: KnowledgeSectionKey) => {
      if (!isModeSection(section)) return source.getSection<T>(id, revision, section);
      return verify(await source.getSection<T>(id, revision, section, { modeTier: tier }), id, revision, section);
    },
    updateSection: async <T extends KnowledgeJsonObject>(id: string, revision: string, section: KnowledgeSectionKey, input: KnowledgeSectionUpdate<T>) => {
      if (!isModeSection(section)) return source.updateSection<T>(id, revision, section, input);
      return verify(await source.updateSection<T>(id, revision, section, { ...input, modeTier: tier }), id, revision, section);
    },
    commitSection: (client, section) => {
      if (!isModeSection(section.sectionKey)) { source.commitSection(client, section); return; }
      verify(section, section.mainLineId, section.revisionId, section.sectionKey);
      client.setQueryData(sectionKey(section.mainLineId, section.revisionId, section.sectionKey), section);
      client.setQueryData<KnowledgeItemDetail>(source.itemKey(section.mainLineId), current => current
        ? { ...current, version: section.aggregateVersion } : current);
      // A shared section version changed, but its Signature payload did not.
      void client.invalidateQueries({ queryKey: source.sectionKey(section.mainLineId, section.revisionId, section.sectionKey), exact: true });
    }
  };
}
