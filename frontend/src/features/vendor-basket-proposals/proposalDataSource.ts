import type { KnowledgeEditorDataSource } from "../ai-estimator-knowledge/knowledgeEditorDataSource";
import type { KnowledgeBasketQuality, KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeQualityControlOptionSummary, KnowledgeSectionEnvelope, KnowledgeSectionKey, KnowledgeSectionMutationEnvelope, KnowledgeSubBasket } from "../ai-estimator-knowledge/knowledgeTypes";
import { collectProposalPages, getProposalHierarchy, getProposalInheritedQuality, getProposalReferences, getProposalResource, proposalKeys, saveProposalQuality, saveProposalSection } from "./proposalApi";
import type { ProposalDetail, ProposalHierarchyNode, ProposalMutationResult, ProposalResource, ProposalScope, ProposalSectionValue, ProposalSnapshot } from "./proposalTypes";

export function createProposalDataSource(options: {
  actorId: string; scope: ProposalScope; proposalId: string; snapshot: ProposalSnapshot;
  getDetail: () => ProposalDetail; getHierarchy: () => readonly ProposalHierarchyNode[];
  isCurrent: () => boolean;
  onSaved: (result: ProposalMutationResult) => void;
  onAccessDenied: (error: unknown) => void;
}): KnowledgeEditorDataSource {
  const { actorId, scope, proposalId, snapshot } = options;
  const root = [...proposalKeys.proposal(actorId, scope, proposalId), "editor", snapshot];
  const sectionKey = (id: string, revision: string, section: KnowledgeSectionKey) => [...root, "section", id, revision, section, options.getDetail().head.version];
  async function checked<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) { options.onAccessDenied(error); throw error; }
  }
  function node(id: string) {
    const current = options.getHierarchy().find(entry => entry.resourceId === id && entry.kind === "main_line");
    if (!current?.editorItem) throw new Error("The saved Main Line details are unavailable. Refresh the proposal.");
    return current;
  }
  function versions() {
    const detail = options.getDetail();
    if (!detail.capabilities.edit || snapshot !== "current") throw new Error("This saved proposal is read-only.");
    return { expectedVersion: detail.version, ...(scope === "admin" && detail.requestVersion !== null ? { expectedRequestVersion: detail.requestVersion } : {}) };
  }
  function envelope<T extends KnowledgeJsonObject>(resource: ProposalResource<ProposalSectionValue>, id: string, revision: string): KnowledgeSectionEnvelope<T> {
    return { id: resource.resourceId, version: resource.version, mainLineId: id, revisionId: revision,
      sectionKey: resource.payload.sectionKey, applicability: resource.payload.applicability, payload: (resource.editorPayload ?? resource.payload.payload) as T,
      createdById: resource.savedById, updatedById: resource.savedById, createdAt: resource.savedAt, updatedAt: resource.savedAt };
  }
  async function quality(): Promise<KnowledgeBasketQuality> {
    const detail = options.getDetail();
    if (detail.target?.kind === "new_sub_basket") return getProposalInheritedQuality(scope, proposalId);
    const resource = detail.qualityResourceId ? await getProposalResource<{ parameters: KnowledgeJsonObject[] }>(scope, proposalId, detail.qualityResourceId, snapshot) : null;
    return { basketId: detail.basketId, basketName: detail.name, basketStatus: "inactive", version: detail.version,
      revisionId: resource?.resourceId ?? null, revisionNumber: resource?.version ?? 0, contentDigest: resource?.digest ?? null,
      parameters: resource?.payload.parameters ?? [], updatedAt: resource?.savedAt ?? null };
  }
  const source: KnowledgeEditorDataSource = {
    scopeKey: JSON.stringify(root), supportsLegacyQuality: false,
    itemKey: id => [...root, "item", id, options.getDetail().head.version], sectionKey,
    basketQualityKey: id => [...root, "quality", id, options.getDetail().head.version],
    qualityControlOptionsKey: kind => [...proposalKeys.references(actorId, scope, kind === "frequency" ? "quality-frequencies" : "quality-performers")],
    subBasketCatalogKey: id => [...root, "sub-baskets", id, options.getDetail().head.version],
    getItem: id => checked(async () => {
      const own = options.getHierarchy().find(entry => entry.resourceId === id);
      if (own) {
        const latest = await collectProposalPages(offset => getProposalHierarchy(scope, proposalId, snapshot, offset));
        const result = latest.find(entry => entry.resourceId === id)?.editorItem;
        if (!result) throw new Error("The saved Main Line is no longer available. Refresh the proposal.");
        return result;
      }
      const page = await getProposalReferences<KnowledgeItemDetail>(scope, "main-lines", 0, [id]);
      const item = page.items.find(entry => entry.mainLineId === id);
      if (!item) throw new Error("This referenced Main Line is no longer available.");
      return item;
    }),
    getSection: <T extends KnowledgeJsonObject>(id: string, revision: string, section: KnowledgeSectionKey) => checked(async () => {
      const resourceId = node(id).sections[section];
      if (!resourceId) throw new Error("The saved section is unavailable. Refresh the proposal.");
      return envelope<T>(await getProposalResource<ProposalSectionValue>(scope, proposalId, resourceId, snapshot), id, revision);
    }),
    updateSection: <T extends KnowledgeJsonObject>(id: string, revision: string, section: KnowledgeSectionKey, input: { applicability?: "configured" | "not_configured" | "not_applicable"; payload: T; expectedAggregateVersion?: number; expectedVersion: number }) => checked(async () => {
      const result = await saveProposalSection(scope, proposalId, id, section, { ...versions(), ...(input.expectedAggregateVersion !== undefined ? { expectedVersion: input.expectedAggregateVersion } : {}), applicability: input.applicability ?? "configured", payload: input.payload });
      options.onSaved(result);
      if (!result.resource) throw new Error("The save completed without a section response. Refresh the proposal.");
      return { ...envelope<T>(result.resource as ProposalResource<ProposalSectionValue>, id, revision), aggregateVersion: result.detail.version } as KnowledgeSectionMutationEnvelope<T>;
    }),
    getBasketQuality: () => checked(quality),
    updateBasketQuality: (_id, input) => checked(async () => {
      if (options.getDetail().target?.kind === "new_sub_basket" || options.getDetail().capabilities.editQuality === false) throw new Error("Inherited Quality Parameters are read-only. Maintain the parent checklist in Configuration.");
      const result = await saveProposalQuality(scope, proposalId, { ...versions(), expectedVersion: input.expectedVersion, parameters: [...input.parameters] });
      options.onSaved(result);
      const resource = result.resource as ProposalResource<{ parameters: KnowledgeJsonObject[] }> | null;
      if (!resource) throw new Error("The save completed without a quality response. Refresh the proposal.");
      return { basketId: result.detail.basketId, basketName: result.detail.name, basketStatus: "inactive", version: result.detail.version,
        revisionId: resource.resourceId, revisionNumber: resource.version, contentDigest: resource.digest, parameters: resource.payload.parameters, updatedAt: resource.savedAt };
    }),
    listQualityControlOptions: kind => checked(async () => ({ items: await collectProposalPages(offset => getProposalReferences<KnowledgeQualityControlOptionSummary>(scope, kind === "frequency" ? "quality-frequencies" : "quality-performers", offset)) })),
    getSubBasketCatalog: id => checked(async () => {
      const detail = options.getDetail();
      const proposed: KnowledgeSubBasket[] = id === detail.basketId
        ? options.getHierarchy().filter(entry => entry.kind === "sub_basket").map(entry => ({ id: entry.resourceId, basketId: id, version: entry.version, name: entry.payload.name, displayOrder: entry.payload.displayOrder, createdAt: entry.savedAt, updatedAt: entry.savedAt, createdById: entry.savedById, updatedById: entry.savedById }))
        : [];
      const live = id !== detail.basketId || detail.target?.kind === "new_sub_basket"
        ? (await collectProposalPages(offset => getProposalReferences<KnowledgeSubBasket>(scope, "sub-baskets", offset))).filter(entry => entry.basketId === id)
        : [];
      const items = [...new Map([...live, ...proposed].map(entry => [entry.id, entry])).values()];
      return { items, pagination: { offset: 0, limit: items.length, total: items.length, hasMore: false } };
    }),
    commitSection: (client, section) => { if (!options.isCurrent()) return; client.setQueryData(source.sectionKey(section.mainLineId, section.revisionId, section.sectionKey), section); },
    invalidateSection: async client => { await client.invalidateQueries({ queryKey: proposalKeys.proposal(actorId, scope, proposalId) }); },
    commitQuality: (client, value) => { if (!options.isCurrent()) return; client.setQueryData(source.basketQualityKey(value.basketId), value); },
    invalidateQuality: async client => { await client.invalidateQueries({ queryKey: proposalKeys.proposal(actorId, scope, proposalId) }); }
  };
  return source;
}
