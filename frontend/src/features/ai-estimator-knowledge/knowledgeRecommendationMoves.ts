import { recommendationTargetKind } from "./knowledgeBudgetAlterations";
import { RECOMMENDATION_GROUPS, recommendationGroup, type RecommendationGroup } from "./knowledgeRecommendationPresentation";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

export type RecommendationMoveResult =
  | { status: "changed"; rows: KnowledgeJsonObject[]; row: KnowledgeJsonObject }
  | { status: "unchanged" }
  | { status: "rejected"; message: string };

/** Check the source identity and semantics without repairing unsupported saved data. */
export function recommendationMoveBlockReason(rows: readonly KnowledgeJsonObject[], ruleId: unknown): string | undefined {
  if (typeof ruleId !== "string" || !ruleId.trim()) return "Review this rule's identity before moving it.";
  const matches = rows.filter((row) => row.id === ruleId);
  if (!matches.length) return "This rule is no longer available to move.";
  if (matches.length !== 1) return "Review the duplicate rule identities before moving this rule.";
  const row = matches[0];
  if ((row.trigger !== "added" && row.trigger !== "removed")
    || (row.action !== "add" && row.action !== "remove")
    || (row.requirement !== "must" && row.requirement !== "can")) {
    return "Review this rule's trigger and action before moving it.";
  }
  return undefined;
}

/** Move the latest row by stable ID; every unrelated row and field is retained. */
export function moveRecommendationRule(
  rows: readonly KnowledgeJsonObject[], ruleId: unknown, destination: RecommendationGroup
): RecommendationMoveResult {
  const message = recommendationMoveBlockReason(rows, ruleId);
  if (message) return { status: "rejected", message };
  if (!RECOMMENDATION_GROUPS.some((group) => group.key === destination)) {
    return { status: "rejected", message: "Choose a recommendation section to move this rule." };
  }
  const source = rows.find((row) => row.id === ruleId)!;
  if (recommendationGroup(source) === destination) return { status: "unchanged" };
  const row: KnowledgeJsonObject = {
    ...source,
    ...(source.targetKind === undefined ? { targetKind: recommendationTargetKind(source) } : {}),
    trigger: destination === "other" ? "removed" : "added",
    action: destination === "other" ? source.action : destination === "exclusions" ? "remove" : "add",
    requirement: destination === "mandatory" ? "must" : destination === "probable" ? "can" : source.requirement
  };
  const targetKind = recommendationTargetKind(row);
  const targetId = targetKind === "sub_basket" ? row.targetSubBasketId : row.targetMainLineId;
  const duplicate = row.active !== false && typeof targetId === "string" && Boolean(targetId)
    && rows.some((candidate) => candidate.id !== ruleId && candidate.active !== false
      && candidate.trigger === row.trigger && recommendationTargetKind(candidate) === targetKind
      && (targetKind === "sub_basket" ? candidate.targetSubBasketId : candidate.targetMainLineId) === targetId);
  if (duplicate) {
    return { status: "rejected", message: `An active rule already exists for this ${targetKind === "sub_basket" ? "Sub-Basket" : "item"} when the source item is ${row.trigger}. Edit or disable that rule before moving this one.` };
  }
  return { status: "changed", rows: [...rows.filter((candidate) => candidate.id !== ruleId), row], row };
}
