import { createBudgetAlteration, recommendationTargetKind } from "./knowledgeBudgetAlterations";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

export const RECOMMENDATION_GROUPS = [
  { key: "mandatory", title: "Non-Negotiable Additions", description: "Related items required when this item is added to scope.", addLabel: "Add Mandatory Item" },
  { key: "probable", title: "Probable Additions", description: "Optional related items to consider when this item is added to scope.", addLabel: "Add Probable Item" },
  { key: "exclusions", title: "Exclusions", description: "Required or optional removals when this item is added to scope.", addLabel: "Add Exclusion" },
  { key: "other", title: "Other scope rules", description: "Guidance for removing this item from scope, plus rules that need review.", addLabel: "Add other scope rule" }
] as const;

export type RecommendationGroup = typeof RECOMMENDATION_GROUPS[number]["key"];

export function recommendationGroup(row: KnowledgeJsonObject): RecommendationGroup {
  if (row.trigger !== "added") return "other";
  if (row.action === "remove") return "exclusions";
  if (row.action === "add" && row.requirement === "must") return "mandatory";
  if (row.action === "add" && row.requirement === "can") return "probable";
  return "other";
}

export function newRecommendationRule(group: RecommendationGroup): KnowledgeJsonObject {
  return {
    ...createBudgetAlteration(),
    trigger: group === "other" ? "removed" : "added",
    action: group === "mandatory" || group === "probable" ? "add" : "remove",
    requirement: group === "probable" ? "can" : "must"
  };
}

export function recommendationAction(row: KnowledgeJsonObject): string {
  if (!["must", "can"].includes(String(row.requirement)) || !["add", "remove"].includes(String(row.action))) return "Needs review";
  return `${row.requirement === "must" ? "Required" : "Optional"} ${row.action === "add" ? "addition" : "removal"}`;
}

export function recommendationRemovalSummary(row: KnowledgeJsonObject, rows: readonly KnowledgeJsonObject[]): string {
  if (row.trigger !== "added" || row.action !== "add") return "—";
  const targetKind = recommendationTargetKind(row);
  const targetId = targetKind === "sub_basket" ? row.targetSubBasketId : row.targetMainLineId;
  const removals = rows.filter((candidate) => candidate.trigger === "removed" && candidate.action === "remove"
    && recommendationTargetKind(candidate) === targetKind && Boolean(targetId)
    && (targetKind === "sub_basket" ? candidate.targetSubBasketId : candidate.targetMainLineId) === targetId);
  if (!removals.length) return "Not configured";
  return removals.map((candidate) => `${recommendationAction(candidate)}${candidate.active === false ? " (disabled)" : ""}`).join("; ");
}
