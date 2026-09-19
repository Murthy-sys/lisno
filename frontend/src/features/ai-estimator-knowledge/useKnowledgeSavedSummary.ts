import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";

import { ApiError } from "../../api/client";
import { getKnowledgeBasketQuality, getKnowledgeItem, getKnowledgeSection, listKnowledgeSubBaskets } from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { projectKnowledgeSavedSummary } from "./knowledgeSavedSummary";
import {
  SAVED_SUMMARY_SECTION_KEYS,
  type SavedSummaryGroup,
  type SavedSummaryGroupKey,
  type SavedSummaryNotice,
  type SavedSummaryProjectionInput,
  type SavedSummarySectionKey
} from "./knowledgeSavedSummaryTypes";
import type { KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeJsonValue, KnowledgeMasterType } from "./knowledgeTypes";

interface ReferenceState {
  readonly status: "ready" | "loading" | "error";
  readonly denied?: boolean;
  readonly refreshErrorMessage?: string;
  readonly onRetry?: () => void;
}

export interface KnowledgeSavedSummaryInput extends Pick<SavedSummaryProjectionInput, "masters" | "baskets" | "items"> {
  readonly item: KnowledgeItemDetail;
  readonly revisionId?: string;
  readonly referenceStates?: {
    readonly masters?: Readonly<Partial<Record<KnowledgeMasterType, ReferenceState>>>;
    readonly relationships?: ReferenceState;
  };
}

const SOURCE_LABELS = { overview: "Overview", advanced: "Mode configuration", recommendations: "Recommendation & Exclusions" };

export function useKnowledgeSavedSummary(input: KnowledgeSavedSummaryInput): readonly SavedSummaryGroup[] {
  const { item, revisionId, referenceStates } = input;
  const sectionQueries = useQueries({
    queries: SAVED_SUMMARY_SECTION_KEYS.map((key) => ({
      queryKey: knowledgeQueryKeys.section(item.mainLineId, revisionId ?? "", key),
      queryFn: () => getKnowledgeSection<KnowledgeJsonObject>(item.mainLineId, revisionId!, key),
      enabled: Boolean(revisionId) && (key !== "recommendations" || item.itemType !== "temporary"),
      staleTime: 30_000
    }))
  });
  const qualityQuery = useQuery({
    queryKey: knowledgeQueryKeys.basketQuality(item.basketId),
    queryFn: () => getKnowledgeBasketQuality(item.basketId),
    enabled: Boolean(item.basketId),
    staleTime: 30_000
  });

  const sections: Partial<Record<SavedSummarySectionKey, KnowledgeJsonObject>> = {};
  const notices: Record<SavedSummaryGroupKey, SavedSummaryNotice[]> = { overview: [], mode: [], recommendations: [], quality: [] };
  for (const [index, key] of SAVED_SUMMARY_SECTION_KEYS.entries()) {
    if (!revisionId || (key === "recommendations" && item.itemType === "temporary")) continue;
    const query = sectionQueries[index]!;
    const group = key === "advanced" ? "mode" : key;
    const data = allowedData(query);
    const matches = data?.mainLineId === item.mainLineId && data.revisionId === revisionId && data.sectionKey === key;
    if (data && matches) sections[key] = data.payload;
    notices[group].push(...sourceNotices(key, SOURCE_LABELS[key], query, Boolean(matches), Boolean(data && !matches)));
  }
  const quality = allowedData(qualityQuery);
  const qualityMatches = quality?.basketId === item.basketId;
  notices.quality.push(...sourceNotices("quality", "Shared checklist", qualityQuery, Boolean(qualityMatches), Boolean(quality && !qualityMatches)));

  const rules = ["budgetAlterations", "recommendations", "exclusions"].flatMap((key) => objectRows(sections.recommendations?.[key]));
  const relationshipsDenied = Boolean(referenceStates?.relationships?.denied);
  const relationshipsReady = !relationshipsDenied && (!referenceStates?.relationships || referenceStates.relationships.status === "ready");
  const missingItemIds = [...new Set(rules.flatMap((rule) => typeof rule.targetMainLineId === "string"
    && rule.targetMainLineId && !input.items.some((entry) => entry.mainLineId === rule.targetMainLineId)
    ? [rule.targetMainLineId] : []))].sort();
  const relatedQueries = useQueries({ queries: missingItemIds.map((id) => ({
    queryKey: knowledgeQueryKeys.item(id), queryFn: () => getKnowledgeItem(id), enabled: relationshipsReady, staleTime: 30_000
  })) });
  const items = relationshipsDenied ? [] : [...input.items];
  relatedQueries.forEach((query, index) => {
    if (!relationshipsReady) return;
    const data = allowedData(query);
    const matches = data?.mainLineId === missingItemIds[index];
    if (data && matches) items.push(data);
    notices.recommendations.push(...sourceNotices(`related-${index}`, "Related Main Line", query, Boolean(matches), Boolean(data && !matches)));
  });
  const missingSubBasketParents = [...new Set(rules.flatMap((rule) => typeof rule.targetSubBasketId === "string" && rule.targetSubBasketId
    && typeof rule.targetBasketId === "string" && rule.targetBasketId
    && !items.some((entry) => entry.basketId === rule.targetBasketId && entry.subBasketId === rule.targetSubBasketId && entry.subBasketName?.trim())
    ? [rule.targetBasketId] : []))].sort();
  const subBasketQueries = useQueries({ queries: missingSubBasketParents.map((id) => ({
    queryKey: [...knowledgeQueryKeys.subBasketLists(id), "catalog"],
    queryFn: () => collectAllKnowledgeMasterPages((params) => listKnowledgeSubBaskets(id, params), "Sub-Basket"),
    enabled: relationshipsReady, staleTime: 30_000
  })) });
  const subBaskets = subBasketQueries.flatMap((query, index) => {
    if (!relationshipsReady) return [];
    const data = allowedData(query);
    notices.recommendations.push(...sourceNotices(`sub-baskets-${index}`, "Related Sub-Baskets", query, Boolean(data)));
    return data?.items.filter((entry) => entry.basketId === missingSubBasketParents[index]) ?? [];
  });

  const referenceKeys: Partial<Record<KnowledgeMasterType, readonly string[]>> = {
    uoms: ["uomId"], surfaces: ["surfaceIds"], modes: ["modeId"], priorities: ["priorityId"]
  };
  for (const [group, payload] of [["overview", sections.overview], ["mode", sections.advanced], ["recommendations", sections.recommendations]] as const) {
    for (const [masterType, keys] of Object.entries(referenceKeys)) {
      if (hasReference(payload, keys)) notices[group].push(...referenceNotices(masterType, `${masterType === "uoms" ? "UOM" : masterType} names`, referenceStates?.masters?.[masterType as KnowledgeMasterType]));
    }
  }
  if (rules.length) notices.recommendations.push(...referenceNotices("relationships", "Related item names", referenceStates?.relationships));

  const projected = projectKnowledgeSavedSummary({ sections, quality: qualityMatches ? quality : undefined,
    masters: Object.fromEntries(Object.entries(input.masters).filter(([type]) => !referenceStates?.masters?.[type as KnowledgeMasterType]?.denied)),
    baskets: relationshipsDenied ? [] : input.baskets, items, subBaskets });
  const labels = { overview: "Overview", mode: "Mode", recommendations: "Recommendation & Exclusions", quality: "Quality Parameters" };
  return (Object.keys(labels) as SavedSummaryGroupKey[]).map((key) => ({
    ...projected[key], key, label: labels[key], notices: notices[key],
    emptyMessage: key === "recommendations" && item.itemType === "temporary" ? "Not applicable"
      : key !== "quality" && !revisionId ? "No revision available"
        : !notices[key].length && !projected[key].details.length && !projected[key].preview.length ? "Not configured" : undefined
  }));
}

function denied(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function allowedData<T>(query: UseQueryResult<T, Error>): T | undefined {
  return denied(query.error) ? undefined : query.data;
}

function sourceNotices<T>(key: string, label: string, query: UseQueryResult<T, Error>, hasData: boolean, mismatched = false): SavedSummaryNotice[] {
  if (query.isError || mismatched) return [{ key, tone: hasData ? "warning" : "error",
    message: hasData ? `${label}: showing last saved data; refresh failed.` : `${label}: could not load saved data.`,
    onRetry: () => { void query.refetch(); } }];
  if (!hasData) return [{ key, tone: "neutral", message: `Loading ${label}…` }];
  return [];
}

function referenceNotices(key: string, label: string, state?: ReferenceState): SavedSummaryNotice[] {
  if (state?.denied) return [{ key, tone: "error", message: `${label}: access unavailable.`, onRetry: state.onRetry }];
  if (!state || state.status === "ready" && !state.refreshErrorMessage) return [];
  return [{ key, tone: state.status === "loading" ? "neutral" : "warning",
    message: state.status === "loading" ? `Loading ${label}…` : `${label} could not be refreshed.`, onRetry: state.onRetry }];
}

function objectRows(value: KnowledgeJsonValue | undefined): readonly KnowledgeJsonObject[] {
  return Array.isArray(value) ? value.filter((entry): entry is KnowledgeJsonObject => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function hasReference(value: KnowledgeJsonValue | undefined, keys: readonly string[]): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => hasReference(entry, keys));
  return Object.entries(value).some(([key, entry]) => keys.includes(key) && (typeof entry === "string" && Boolean(entry) || Array.isArray(entry) && entry.length > 0) || hasReference(entry, keys));
}
