import { apiClient } from "../../api/client";
import type { KnowledgeBasketQuality, KnowledgeSectionKey } from "../ai-estimator-knowledge/knowledgeTypes";
import type { ProposalChange, ProposalCreateInput, ProposalDecisionInput, ProposalDecisionResult, ProposalDetail, ProposalHierarchyNode, ProposalIntakeInput, ProposalMetadataInput, ProposalMasterInput, ProposalMasterKind, ProposalMasterResource, ProposalMutationResult, ProposalPage, ProposalQualityInput, ProposalReadiness, ProposalReferenceKind, ProposalResource, ProposalScope, ProposalSectionInput, ProposalSnapshot, ProposalStatus, ProposalSubmitInput, ProposalSummary, ProposalVersionInput } from "./proposalTypes";

const segment = encodeURIComponent;
const base = (scope: ProposalScope) => scope === "admin" ? "/admin/ai-estimator-knowledge/basket-proposals" : "/procurement/vendor-basket-proposals";
const path = (scope: ProposalScope, id: string) => `${base(scope)}/${segment(id)}`;
const query = (values: Record<string, string | number | undefined>) => new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string | number] => entry[1] !== undefined).map(([key, value]) => [key, String(value)])).toString();

export const proposalKeys = {
  root: ["vendor-basket-proposals"] as const,
  actor: (actor: string) => ["vendor-basket-proposals", actor] as const,
  mine: (actor: string) => ["vendor-basket-proposals", actor, "mine"] as const,
  proposal: (actor: string, scope: ProposalScope, id: string) => ["vendor-basket-proposals", actor, scope, id] as const,
  detail: (actor: string, scope: ProposalScope, id: string, snapshot: ProposalSnapshot = "current") => [...proposalKeys.proposal(actor, scope, id), "detail", snapshot] as const,
  masters: (actor: string, scope: ProposalScope, id: string, snapshot: ProposalSnapshot, headVersion: number | undefined) => [...proposalKeys.proposal(actor, scope, id), "masters", snapshot, headVersion] as const,
  references: (actor: string, scope: ProposalScope, kind: ProposalReferenceKind) => ["vendor-basket-proposals", actor, scope, "references", kind] as const
};

export const createProposal = (input: ProposalCreateInput): Promise<ProposalDetail> => apiClient.post(base("procurement"), input);
export const listOwnProposals = (status: ProposalStatus | "", offset = 0, limit = 20, signal?: AbortSignal): Promise<ProposalPage<ProposalSummary>> => apiClient.get(`${base("procurement")}/mine?${query({ status: status || undefined, limit, offset })}`, { signal });
export const getProposal = (scope: ProposalScope, id: string, snapshot: ProposalSnapshot = "current", signal?: AbortSignal): Promise<ProposalDetail> => apiClient.get(`${path(scope, id)}?${query({ snapshot })}`, { signal });
export const getProposalHierarchy = (scope: ProposalScope, id: string, snapshot: ProposalSnapshot = "current", offset = 0, signal?: AbortSignal): Promise<ProposalPage<ProposalHierarchyNode>> => apiClient.get(`${path(scope, id)}/hierarchy?${query({ snapshot, limit: 100, offset })}`, { signal });
export const getProposalResource = <T,>(scope: ProposalScope, id: string, resourceId: string, snapshot: ProposalSnapshot = "current", signal?: AbortSignal): Promise<ProposalResource<T>> => apiClient.get(`${path(scope, id)}/resources/${segment(resourceId)}?${query({ snapshot })}`, { signal });
export const getProposalReadiness = (scope: ProposalScope, id: string, signal?: AbortSignal): Promise<ProposalReadiness> => apiClient.get(`${path(scope, id)}/readiness`, { signal });
export const getProposalChanges = (id: string, offset = 0, signal?: AbortSignal): Promise<ProposalPage<ProposalChange>> => apiClient.get(`${path("admin", id)}/changes?${query({ limit: 100, offset })}`, { signal });
export const getProposalReferences = <T,>(scope: ProposalScope, kind: ProposalReferenceKind, offset = 0, ids?: readonly string[], signal?: AbortSignal): Promise<ProposalPage<T>> => apiClient.get(`${base(scope)}/references?${query({ kind, limit: 100, offset, ids: ids?.join(",") })}`, { signal });
export const getProposalMasters = (scope: ProposalScope, id: string, kind: ProposalMasterKind, snapshot: ProposalSnapshot = "current", offset = 0, signal?: AbortSignal): Promise<ProposalPage<ProposalMasterResource>> => apiClient.get(`${path(scope, id)}/masters/${kind}?${query({ snapshot, limit: 100, offset })}`, { signal });
export const addProposalMaster = (scope: ProposalScope, id: string, kind: ProposalMasterKind, input: ProposalMasterInput): Promise<ProposalMutationResult> => apiClient.post(`${path(scope, id)}/masters/${kind}`, input);
export const saveProposalMaster = (scope: ProposalScope, id: string, kind: ProposalMasterKind, resourceId: string, input: ProposalMasterInput): Promise<ProposalMutationResult> => apiClient.patch(`${path(scope, id)}/masters/${kind}/${segment(resourceId)}`, input);
export const removeProposalMaster = (scope: ProposalScope, id: string, kind: ProposalMasterKind, resourceId: string, input: ProposalVersionInput): Promise<ProposalMutationResult> => apiClient.delete(`${path(scope, id)}/masters/${kind}/${segment(resourceId)}`, input);
export const saveProposalBasket = (scope: ProposalScope, id: string, input: ProposalMetadataInput): Promise<ProposalMutationResult> => apiClient.patch(`${path(scope, id)}/basket`, input);
export const addProposalSubBasket = (scope: ProposalScope, id: string, input: ProposalMetadataInput): Promise<ProposalMutationResult> => apiClient.post(`${path(scope, id)}/sub-baskets`, input);
export const saveProposalSubBasket = (scope: ProposalScope, id: string, subId: string, input: ProposalMetadataInput): Promise<ProposalMutationResult> => apiClient.patch(`${path(scope, id)}/sub-baskets/${segment(subId)}`, input);
export const removeProposalSubBasket = (scope: ProposalScope, id: string, subId: string, input: ProposalVersionInput): Promise<ProposalMutationResult> => apiClient.delete(`${path(scope, id)}/sub-baskets/${segment(subId)}`, input);
export const addProposalMainLine = (scope: ProposalScope, id: string, subId: string, input: ProposalMetadataInput): Promise<ProposalMutationResult> => apiClient.post(`${path(scope, id)}/sub-baskets/${segment(subId)}/main-lines`, input);
export const saveProposalMainLine = (scope: ProposalScope, id: string, lineId: string, input: ProposalMetadataInput): Promise<ProposalMutationResult> => apiClient.patch(`${path(scope, id)}/main-lines/${segment(lineId)}`, input);
export const removeProposalMainLine = (scope: ProposalScope, id: string, lineId: string, input: ProposalVersionInput): Promise<ProposalMutationResult> => apiClient.delete(`${path(scope, id)}/main-lines/${segment(lineId)}`, input);
export const saveProposalSection = (scope: ProposalScope, id: string, lineId: string, section: KnowledgeSectionKey, input: ProposalSectionInput): Promise<ProposalMutationResult> => apiClient.put(`${path(scope, id)}/main-lines/${segment(lineId)}/sections/${segment(section)}`, input);
export const saveProposalQuality = (scope: ProposalScope, id: string, input: ProposalQualityInput): Promise<ProposalMutationResult> => apiClient.put(`${path(scope, id)}/quality`, input);
export const saveProposalIntake = (scope: ProposalScope, id: string, input: ProposalIntakeInput): Promise<ProposalDetail> => apiClient.put(`${path(scope, id)}/intake`, input);
export const submitProposal = (id: string, input: ProposalSubmitInput): Promise<ProposalDetail> => apiClient.post(`${path("procurement", id)}/submit`, input);
export const reviseProposal = (id: string, input: ProposalSubmitInput): Promise<ProposalDetail> => apiClient.post(`${path("procurement", id)}/revise`, input);
export const decideProposal = (id: string, input: ProposalDecisionInput): Promise<ProposalDecisionResult> => apiClient.post(`${path("admin", id)}/decision`, input);

export async function collectProposalPages<T>(fetch: (offset: number) => Promise<ProposalPage<T>>): Promise<T[]> {
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

export const getProposalInheritedQuality = (scope: ProposalScope, id: string, signal?: AbortSignal): Promise<KnowledgeBasketQuality> => apiClient.get(`${path(scope, id)}/inherited-quality`, { signal });
