import type { KnowledgeTransport } from "../../../../shared/knowledge/knowledgeApi";
import type { KnowledgeBasketQuality, KnowledgeSectionKey } from "../../../../shared/knowledge/knowledgeTypes";
import type { ProposalChange, ProposalCreateInput, ProposalDecisionInput, ProposalDecisionResult, ProposalDetail, ProposalHierarchyNode, ProposalIntakeInput, ProposalMetadataInput, ProposalMasterInput, ProposalMasterKind, ProposalMasterResource, ProposalMutationResult, ProposalPage, ProposalQualityInput, ProposalReadiness, ProposalReferenceKind, ProposalResource, ProposalScope, ProposalSectionInput, ProposalSnapshot, ProposalStatus, ProposalSubmitInput, ProposalSummary, ProposalVersionInput } from "./proposalTypes";

const segment = encodeURIComponent;
const base = (scope: ProposalScope) => scope === "admin" ? "/admin/ai-estimator-knowledge/basket-proposals" : "/procurement/vendor-basket-proposals";
const path = (scope: ProposalScope, id: string) => `${base(scope)}/${segment(id)}`;
const query = (values: Record<string, string | number | undefined>) => new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string | number] => entry[1] !== undefined).map(([key, value]) => [key, String(value)])).toString();

export function createProposalApi(apiClient: KnowledgeTransport) {
const createProposal = (input: ProposalCreateInput): Promise<ProposalDetail> => apiClient.post(base("procurement"), input);
const listOwnProposals = (status: ProposalStatus | "", offset = 0, limit = 20, signal?: AbortSignal): Promise<ProposalPage<ProposalSummary>> => apiClient.get(`${base("procurement")}/mine?${query({ status: status || undefined, limit, offset })}`, signal ? { signal } : undefined);
const getProposal = (scope: ProposalScope, id: string, snapshot: ProposalSnapshot = "current", signal?: AbortSignal): Promise<ProposalDetail> => apiClient.get(`${path(scope, id)}?${query({ snapshot })}`, signal ? { signal } : undefined);
const getProposalHierarchy = (scope: ProposalScope, id: string, snapshot: ProposalSnapshot = "current", offset = 0, signal?: AbortSignal): Promise<ProposalPage<ProposalHierarchyNode>> => apiClient.get(`${path(scope, id)}/hierarchy?${query({ snapshot, limit: 100, offset })}`, signal ? { signal } : undefined);
const getProposalResource = <T,>(scope: ProposalScope, id: string, resourceId: string, snapshot: ProposalSnapshot = "current", signal?: AbortSignal): Promise<ProposalResource<T>> => apiClient.get(`${path(scope, id)}/resources/${segment(resourceId)}?${query({ snapshot })}`, signal ? { signal } : undefined);
const getProposalReadiness = (scope: ProposalScope, id: string, signal?: AbortSignal): Promise<ProposalReadiness> => apiClient.get(`${path(scope, id)}/readiness`, signal ? { signal } : undefined);
const getProposalChanges = (id: string, offset = 0, signal?: AbortSignal): Promise<ProposalPage<ProposalChange>> => apiClient.get(`${path("admin", id)}/changes?${query({ limit: 100, offset })}`, signal ? { signal } : undefined);
const getProposalReferences = <T,>(scope: ProposalScope, kind: ProposalReferenceKind, offset = 0, ids?: readonly string[], signal?: AbortSignal): Promise<ProposalPage<T>> => apiClient.get(`${base(scope)}/references?${query({ kind, limit: 100, offset, ids: ids?.join(",") })}`, signal ? { signal } : undefined);
const getProposalMasters = (scope: ProposalScope, id: string, kind: ProposalMasterKind, snapshot: ProposalSnapshot = "current", offset = 0, signal?: AbortSignal): Promise<ProposalPage<ProposalMasterResource>> => apiClient.get(`${path(scope, id)}/masters/${kind}?${query({ snapshot, limit: 100, offset })}`, signal ? { signal } : undefined);
const addProposalMaster = (scope: ProposalScope, id: string, kind: ProposalMasterKind, input: ProposalMasterInput): Promise<ProposalMutationResult> => apiClient.post(`${path(scope, id)}/masters/${kind}`, input);
const saveProposalMaster = (scope: ProposalScope, id: string, kind: ProposalMasterKind, resourceId: string, input: ProposalMasterInput): Promise<ProposalMutationResult> => apiClient.patch(`${path(scope, id)}/masters/${kind}/${segment(resourceId)}`, input);
const removeProposalMaster = (scope: ProposalScope, id: string, kind: ProposalMasterKind, resourceId: string, input: ProposalVersionInput): Promise<ProposalMutationResult> => apiClient.delete(`${path(scope, id)}/masters/${kind}/${segment(resourceId)}`, input);
const saveProposalBasket = (scope: ProposalScope, id: string, input: ProposalMetadataInput): Promise<ProposalMutationResult> => apiClient.patch(`${path(scope, id)}/basket`, input);
const addProposalSubBasket = (scope: ProposalScope, id: string, input: ProposalMetadataInput): Promise<ProposalMutationResult> => apiClient.post(`${path(scope, id)}/sub-baskets`, input);
const saveProposalSubBasket = (scope: ProposalScope, id: string, subId: string, input: ProposalMetadataInput): Promise<ProposalMutationResult> => apiClient.patch(`${path(scope, id)}/sub-baskets/${segment(subId)}`, input);
const removeProposalSubBasket = (scope: ProposalScope, id: string, subId: string, input: ProposalVersionInput): Promise<ProposalMutationResult> => apiClient.delete(`${path(scope, id)}/sub-baskets/${segment(subId)}`, input);
const addProposalMainLine = (scope: ProposalScope, id: string, subId: string, input: ProposalMetadataInput): Promise<ProposalMutationResult> => apiClient.post(`${path(scope, id)}/sub-baskets/${segment(subId)}/main-lines`, input);
const saveProposalMainLine = (scope: ProposalScope, id: string, lineId: string, input: ProposalMetadataInput): Promise<ProposalMutationResult> => apiClient.patch(`${path(scope, id)}/main-lines/${segment(lineId)}`, input);
const removeProposalMainLine = (scope: ProposalScope, id: string, lineId: string, input: ProposalVersionInput): Promise<ProposalMutationResult> => apiClient.delete(`${path(scope, id)}/main-lines/${segment(lineId)}`, input);
const saveProposalSection = (scope: ProposalScope, id: string, lineId: string, section: KnowledgeSectionKey, input: ProposalSectionInput): Promise<ProposalMutationResult> => apiClient.put(`${path(scope, id)}/main-lines/${segment(lineId)}/sections/${segment(section)}`, input);
const saveProposalQuality = (scope: ProposalScope, id: string, input: ProposalQualityInput): Promise<ProposalMutationResult> => apiClient.put(`${path(scope, id)}/quality`, input);
const saveProposalIntake = (scope: ProposalScope, id: string, input: ProposalIntakeInput): Promise<ProposalDetail> => apiClient.put(`${path(scope, id)}/intake`, input);
const submitProposal = (id: string, input: ProposalSubmitInput): Promise<ProposalDetail> => apiClient.post(`${path("procurement", id)}/submit`, input);
const reviseProposal = (id: string, input: ProposalSubmitInput): Promise<ProposalDetail> => apiClient.post(`${path("procurement", id)}/revise`, input);
const decideProposal = (id: string, input: ProposalDecisionInput): Promise<ProposalDecisionResult> => apiClient.post(`${path("admin", id)}/decision`, input);

async function collectProposalPages<T>(fetch: (offset: number) => Promise<ProposalPage<T>>): Promise<T[]> {
  const result: T[] = [];
  let offset = 0;
  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    const page = await fetch(offset);
    result.push(...page.items);
    if (!page.pagination.hasMore) return result;
    if (!page.items.length || page.pagination.offset !== offset) throw new Error("The saved catalog could not be fully loaded. Refresh and retry.");
    offset += page.items.length;
  }
  throw new Error("The saved catalog could not be fully loaded. Refresh and retry.");
}

const getProposalInheritedQuality = (scope: ProposalScope, id: string, signal?: AbortSignal): Promise<KnowledgeBasketQuality> => apiClient.get(`${path(scope, id)}/inherited-quality`, signal ? { signal } : undefined);

const listReview = (status = "pending", offset = 0): Promise<ProposalPage<BasketRequest>> => apiClient.get(`/admin/ai-estimator-knowledge/basket-requests?${query({ status: status || undefined, offset, limit: 20 })}`);
const listOwnRequests = (status = "", offset = 0): Promise<ProposalPage<BasketRequest>> => apiClient.get(`/procurement/vendor-basket-requests/mine?${query({ status: status || undefined, offset, limit: 20 })}`);
const decideLegacy = (id: string, input: { decision: "fulfill" | "reject"; expectedVersion: number; idempotencyKey: string; reason?: string; configuration?: { subBasketName: string; mainLineName: string } }): Promise<BasketRequest> => apiClient.post(`/admin/ai-estimator-knowledge/basket-requests/${segment(id)}/decision`, input);
return { createProposal, listOwnProposals, getProposal, getProposalHierarchy, getProposalResource, getProposalReadiness, getProposalChanges, getProposalReferences, getProposalMasters, addProposalMaster, saveProposalMaster, removeProposalMaster, saveProposalBasket, addProposalSubBasket, saveProposalSubBasket, removeProposalSubBasket, addProposalMainLine, saveProposalMainLine, removeProposalMainLine, saveProposalSection, saveProposalQuality, saveProposalIntake, submitProposal, reviseProposal, decideProposal, collectProposalPages, getProposalInheritedQuality, listReview, listOwnRequests, decideLegacy };
}
export type ProposalApi = ReturnType<typeof createProposalApi>;
export interface BasketRequest { id: string; proposalId?: string | null; kind?: "configuration_proposal" | "name_only"; requestMode?: "hierarchy_intake" | "full_configuration"; proposedName: string; status: "pending" | "fulfilled" | "rejected"; version: number; reason: string | null; vendorName: string | null; targetParentName?: string | null; target?: { kind: "new_main_basket" } | { kind: "new_sub_basket"; basketId: string }; }
