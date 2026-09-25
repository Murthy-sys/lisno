import { budgetAlterationRows, recommendationTargetKind } from "../../../../shared/knowledge/knowledgeBudgetAlterations";
import type { KnowledgeItemListItem, KnowledgeJsonObject, KnowledgeJsonValue } from "../../../../shared/knowledge/knowledgeTypes";

export const knowledgeText = (value: KnowledgeJsonValue | undefined): string => typeof value === "string" ? value : "";
export const knowledgeObject = (value: KnowledgeJsonValue | undefined): KnowledgeJsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as KnowledgeJsonObject : {};

export function nativeRecommendationCatalogIssues(value: KnowledgeJsonValue | undefined, items: readonly KnowledgeItemListItem[], mainLineId: string): readonly string[] {
  return budgetAlterationRows(value).flatMap((row, index) => {
    if (row.active === false) return [];
    const candidates = items.filter(item => item.mainLineId !== mainLineId && ["active", "draft"].includes(item.status) && item.basketId === row.targetBasketId);
    const available = recommendationTargetKind(row) === "sub_basket"
      ? candidates.some(item => item.subBasketId === row.targetSubBasketId)
      : candidates.some(item => item.mainLineId === row.targetMainLineId && (item.subBasketId ?? null) === (row.targetSubBasketId ?? null) && (item.itemType === "temporary" ? "temporary" : "catalog") === row.targetType);
    return available ? [] : [`Rule ${index + 1}: choose an available related item or Sub-Basket with at least one available child, or disable/remove the rule.`];
  });
}

export function nativeRuleTarget(row: KnowledgeJsonObject, target: KnowledgeItemListItem): KnowledgeJsonObject {
  return { ...row, targetKind: "main_line", targetBasketId: target.basketId, targetSubBasketId: target.subBasketId ?? null, targetMainLineId: target.mainLineId, targetType: target.itemType === "temporary" ? "temporary" : "catalog" };
}

export function nativeRuleTargetKind(row: KnowledgeJsonObject, kind: "main_line" | "sub_basket"): KnowledgeJsonObject {
  return { ...row, targetKind: kind, targetSubBasketId: null, targetMainLineId: null, targetType: kind === "sub_basket" ? null : "catalog" };
}
