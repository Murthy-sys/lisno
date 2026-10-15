import { createKnowledgeApi, type KnowledgeApi } from "../../../../shared/knowledge/knowledgeApi";
import type { KnowledgeBasketQuality, KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeMaster, KnowledgeSectionEnvelope, KnowledgeSectionKey, KnowledgeSubBasket } from "../../../../shared/knowledge/knowledgeTypes";
import { ApiError } from "../../core/http/apiClient";
import type { KnowledgeMobileContext } from "../knowledge/knowledgeRuntime";
import { proposalDenied, proposalUncertain, type ProposalContext } from "./proposalRuntime";
import type { ProposalDetail, ProposalHierarchyNode, ProposalMasterResource, ProposalMutationResult, ProposalResource, ProposalSectionValue, ProposalSnapshot } from "./proposalTypes";

const page = <T,>(items: T[]) => ({ items, pagination: { total: items.length, limit: Math.max(1, items.length), offset: 0, hasMore: false } });
/** Native editors use the isolated proposal transport. No catalogue mutation falls through. */
export function proposalKnowledgeContext(input: { context: ProposalContext; snapshot: ProposalSnapshot; getDetail: () => ProposalDetail; getHierarchy: () => readonly ProposalHierarchyNode[]; onSaved: (value: ProposalMutationResult) => Promise<void>; onRead?: (detail: ProposalDetail) => void; onUnknownChange?: (unknown: boolean) => void; onAccessLost?: () => void; refresh: () => Promise<void> }): KnowledgeMobileContext {
  const { context, snapshot } = input; const api = context.api;
  const id = input.getDetail().id;
  let pending: { operation: string; work: () => Promise<ProposalMutationResult> } | null = null;
  async function write(operation: string, work: () => Promise<ProposalMutationResult>) {
    if (pending && pending.operation !== operation) throw new Error("Retry the unconfirmed save before changing another section.");
    const command = pending ?? { operation, work };
    try { const saved = await command.work(); pending = null; input.onUnknownChange?.(false); return saved; }
    catch (error) { pending = proposalUncertain(error) ? command : null; input.onUnknownChange?.(Boolean(pending)); if (proposalDenied(error)) input.onAccessLost?.(); throw error; }
  }
  function editable() { return snapshot === "current" && input.getDetail().capabilities.edit && context.canUpdate; }
  function item(node: ProposalHierarchyNode, detail = input.getDetail()): KnowledgeItemDetail {
    if (!node.editorItem) throw new Error("The saved Main Line cannot be edited. Reload the request.");
    return { ...node.editorItem, version: detail.version, allowedActions: snapshot === "current" && detail.capabilities.edit && context.canUpdate ? ["update_section"] : [] };
  }
  function node(lineId: string) { const result = input.getHierarchy().find(value => value.resourceId === lineId && value.kind === "main_line"); if (!result) throw new Error("The Main Line is no longer in this request."); return result; }
  function versions(expectedVersion: number) { if (!editable()) throw new ApiError(403, "FORBIDDEN", "This proposal is read-only."); const detail = input.getDetail(); return { expectedVersion, ...(context.scope === "admin" && detail.requestVersion !== null ? { expectedRequestVersion: detail.requestVersion } : {}) }; }
  function envelope(resource: ProposalResource<ProposalSectionValue>, lineId: string, revisionId: string): KnowledgeSectionEnvelope {
    if (resource.proposalId !== id || resource.parentId !== lineId || resource.kind !== "section") throw new Error("The saved section identity could not be verified.");
    return { id: resource.resourceId, mainLineId: lineId, revisionId, sectionKey: resource.payload.sectionKey, version: resource.version, payload: (resource.editorPayload ?? resource.payload.payload) as KnowledgeJsonObject, applicability: resource.payload.applicability, createdAt: resource.savedAt, updatedAt: resource.savedAt, createdById: resource.savedById, updatedById: resource.savedById };
  }
  async function quality(): Promise<KnowledgeBasketQuality> {
    const detail = await api.getProposal(context.scope, id, snapshot);
    if (detail.id !== id) throw new Error("The saved request identity could not be verified.");
    input.onRead?.(detail);
    if (detail.target?.kind === "new_sub_basket") return api.getProposalInheritedQuality(context.scope, id);
    const resource = detail.qualityResourceId ? await api.getProposalResource<{ parameters: KnowledgeJsonObject[] }>(context.scope, id, detail.qualityResourceId, snapshot) : null;
    return { basketId: detail.basketId, basketName: detail.name, basketStatus: "inactive", version: detail.version, revisionId: resource?.resourceId ?? null, revisionNumber: resource?.version ?? 0, contentDigest: resource?.digest ?? null, parameters: resource?.payload.parameters ?? [], updatedAt: resource?.savedAt ?? null };
  }
  const methods: Partial<KnowledgeApi> = {
    getKnowledgeItem: async lineId => {
      const own = input.getHierarchy().find(value => value.resourceId === lineId);
      if (own) {
        const [detail, nodes] = await Promise.all([api.getProposal(context.scope, id, snapshot), api.collectProposalPages(offset => api.getProposalHierarchy(context.scope, id, snapshot, offset))]);
        if (detail.id !== id) throw new Error("The saved request identity could not be verified.");
        const saved = nodes.find(value => value.resourceId === lineId && value.kind === "main_line");
        if (!saved) throw new Error("The Main Line is no longer in this request.");
        input.onRead?.(detail);
        return item(saved, detail);
      }
      const result = await api.getProposalReferences<KnowledgeItemDetail>(context.scope, "main-lines", 0, [lineId]);
      const found = result.items.find(value => value.mainLineId === lineId); if (!found) throw new Error("The referenced Main Line is unavailable."); return found;
    },
    getKnowledgeHistory: async lineId => page(item(node(lineId)).draftRevision ? [item(node(lineId)).draftRevision!] : []),
    getKnowledgeSection: async <T extends KnowledgeJsonObject>(lineId: string, revisionId: string, key: KnowledgeSectionKey) => {
      const sectionId = node(lineId).sections[key]; if (!sectionId) throw new Error("The saved section is unavailable. Reload the request.");
      return envelope(await api.getProposalResource<ProposalSectionValue>(context.scope, id, sectionId, snapshot), lineId, revisionId) as KnowledgeSectionEnvelope<T>;
    },
    updateKnowledgeSection: async <T extends KnowledgeJsonObject>(lineId: string, revisionId: string, key: KnowledgeSectionKey, value: { expectedVersion: number; expectedAggregateVersion?: number; applicability?: "configured" | "not_configured" | "not_applicable"; payload: T }) => {
      const command = { ...versions(value.expectedAggregateVersion ?? input.getDetail().version), applicability: value.applicability ?? "configured", payload: value.payload };
      const result = key === "design" ? await api.saveProposalSection(context.scope, id, lineId, key, command).catch(error => { if (proposalDenied(error)) input.onAccessLost?.(); throw error; }) : await write(`section:${lineId}:${key}`, () => api.saveProposalSection(context.scope, id, lineId, key, command));
      await input.onSaved(result);
      if (!result.resource) throw new Error("The saved section response is incomplete. Reload the request.");
      return { ...envelope(result.resource as ProposalResource<ProposalSectionValue>, lineId, revisionId), aggregateVersion: result.detail.version } as KnowledgeSectionEnvelope<T> & { aggregateVersion: number };
    },
    listKnowledgeMasters: async (type, params) => {
      if (type === "vendors") return context.scope === "admin" ? createKnowledgeApi(context.transport).listKnowledgeMasters(type, { ...params, includeArchived: true }) : page([]);
      const live = await api.collectProposalPages(offset => api.getProposalReferences<KnowledgeMaster>(context.scope, type, offset));
      if (type !== "uoms" && type !== "surfaces") return page(live);
      const own = await api.collectProposalPages(offset => api.getProposalMasters(context.scope, id, type, snapshot, offset));
      return page([...live, ...own.map((resource: ProposalMasterResource) => ({ id: resource.resourceId, masterType: type, ...resource.payload, status: "active" as const, displayOrder: 0, version: resource.version, createdAt: resource.savedAt, updatedAt: resource.savedAt, createdById: resource.savedById, updatedById: resource.savedById }))]);
    },
    listKnowledgeBaskets: async () => page(await api.collectProposalPages(offset => api.getProposalReferences(context.scope, "baskets", offset))),
    listKnowledgeItems: async () => page([...(await api.collectProposalPages(offset => api.getProposalReferences<KnowledgeItemDetail>(context.scope, "main-lines", offset))), ...input.getHierarchy().filter(value => value.kind === "main_line").map(value => item(value))]),
    listKnowledgeSubBaskets: async basketId => {
      const proposed = input.getHierarchy().filter(value => value.kind === "sub_basket").map(value => ({ id: value.resourceId, basketId: input.getDetail().basketId, name: value.payload.name, displayOrder: value.payload.displayOrder, version: value.version, createdAt: value.savedAt, updatedAt: value.savedAt, createdById: value.savedById, updatedById: value.savedById }));
      const live = await api.collectProposalPages(offset => api.getProposalReferences<KnowledgeSubBasket>(context.scope, "sub-baskets", offset));
      return page([...live, ...proposed].filter(value => value.basketId === basketId));
    },
    getKnowledgeBasketQuality: quality,
    updateKnowledgeBasketQuality: async (_basketId, value) => {
      if (input.getDetail().capabilities.editQuality === false || input.getDetail().target?.kind === "new_sub_basket") throw new ApiError(403, "FORBIDDEN", "Inherited Main Basket Quality is read-only.");
      const command = { ...versions(value.expectedVersion), parameters: [...value.parameters] };
      const result = await write("quality", () => api.saveProposalQuality(context.scope, id, command)); await input.onSaved(result); return quality();
    },
    listKnowledgeQualityControlOptions: async kind => ({ items: await api.collectProposalPages(offset => api.getProposalReferences(context.scope, kind === "frequency" ? "quality-frequencies" : "quality-performers", offset)) })
  };
  const isolatedApi = new Proxy(methods, { get(target, property) { return property in target ? target[property as keyof KnowledgeApi] : () => Promise.reject(new Error("This action is unavailable inside a saved request. Use Configuration after approval.")); } }) as KnowledgeApi;
  return { api: isolatedApi, get saveOutcomeUnknown() { return Boolean(pending); }, key: (...parts) => context.key("editor", id, snapshot, ...parts), scopeKey: `${context.scopeKey}:${id}:${snapshot}`, ready: context.ready, canRead: context.canRead, canCreate: false, canUpdate: editable(), canLifecycle: false, canCreateClassification: false, canCorrectBaseline: false, canCreateQualityOptions: false, readOnlyQuality: input.getDetail().capabilities.editQuality === false || input.getDetail().target?.kind === "new_sub_basket", supportsLegacyQuality: false, showDesign: context.scope === "admin", refresh: input.refresh };
}
