import { knowledgeRowId } from "./knowledgeId";
import type { KnowledgeItemListItem, KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

export type KnowledgeRecommendationTargetKind = "main_line" | "sub_basket";

/** Legacy rows predate targetKind and always represent a Main Line. */
export function recommendationTargetKind(row: KnowledgeJsonObject): KnowledgeRecommendationTargetKind {
  return row.targetKind === "sub_basket" ? "sub_basket" : "main_line";
}

/** Any edited row is rewritten using the explicit union discriminator. */
export function withExplicitRecommendationTargetKind(row: KnowledgeJsonObject): KnowledgeJsonObject {
  return { ...row, targetKind: recommendationTargetKind(row) };
}

/** A Sub-Basket remains incomplete until every available child is active, resolved catalog knowledge. */
export function recommendationItemRequiresCompletion(
  item: Pick<KnowledgeItemListItem, "activeRevisionId" | "itemType" | "status">
): boolean {
  return item.itemType === "temporary" || item.status !== "active" || !item.activeRevisionId;
}

export const BUDGET_ACTIONS = [
  { value: "must_remove", label: "Must be removed", action: "remove", requirement: "must" },
  { value: "can_remove", label: "Can be removed", action: "remove", requirement: "can" },
  { value: "must_add", label: "Must be added", action: "add", requirement: "must" },
  { value: "can_add", label: "Can be added", action: "add", requirement: "can" }
] as const;

export function budgetAlterationRows(value: KnowledgeJsonValue | undefined): KnowledgeJsonObject[] {
  return Array.isArray(value) ? value.filter((row): row is KnowledgeJsonObject => !!row && typeof row === "object" && !Array.isArray(row)) : [];
}

export function createBudgetAlteration(): KnowledgeJsonObject {
  return { id: knowledgeRowId(), trigger: "removed", action: "remove", requirement: "must", targetKind: "main_line", targetType: "catalog",
    targetBasketId: "", targetSubBasketId: null, targetMainLineId: null, reason: "", active: true };
}

export function budgetAlterationIssues(value: KnowledgeJsonValue | undefined, currentMainLineId?: string) {
  const issues: { path: string; message: string }[] = [];
  if (value === undefined) return issues;
  if (!Array.isArray(value)) return [{ path: "budgetAlterations", message: "Review the saved budget alteration rules." }];
  if (value.length > 100) issues.push({ path: "budgetAlterations", message: "Use at most 100 budget alteration rules." });
  const ids = new Set<string>();
  const targets = new Set<string>();
  value.forEach((entry, index) => {
    const path = `budgetAlterations.${index}`;
    const add = (field: string, message: string) => issues.push({ path: `${path}${field ? `.${field}` : ""}`, message });
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { add("", "Review this saved rule."); return; }
    const row = entry as KnowledgeJsonObject;
    if (typeof row.id !== "string" || !row.id || ids.has(row.id)) add("id", "Rule identities must be unique.");
    if (typeof row.id === "string") ids.add(row.id);
    if (!["added", "removed"].includes(String(row.trigger))) add("trigger", "Choose when this rule applies.");
    if (!["add", "remove"].includes(String(row.action)) || !["must", "can"].includes(String(row.requirement))) add("action", "Choose the related scope change.");
    if (row.targetKind !== undefined && !["main_line", "sub_basket"].includes(String(row.targetKind))) add("targetKind", "Choose a valid addition type.");
    const targetKind = recommendationTargetKind(row);
    if (typeof row.targetBasketId !== "string" || !row.targetBasketId.trim()) add("targetBasketId", "Choose a Main Basket.");
    if (targetKind === "sub_basket") {
      if (row.targetType !== null) add("targetType", "Whole Sub-Basket rules do not use an item type.");
      if (typeof row.targetSubBasketId !== "string" || !row.targetSubBasketId) add("targetSubBasketId", "Choose a Sub-Basket with at least one available item.");
      if (row.targetMainLineId !== null) add("targetMainLineId", "Whole Sub-Basket rules do not select one related item.");
    } else {
      if (!["catalog", "temporary"].includes(String(row.targetType))) add("targetType", "Select a catalog or temporary item.");
      if (row.targetSubBasketId !== null && (typeof row.targetSubBasketId !== "string" || !row.targetSubBasketId)) add("targetSubBasketId", "Choose a valid Sub-Basket.");
      if (typeof row.targetMainLineId !== "string" || !row.targetMainLineId) add("targetMainLineId", "Choose a related item.");
      if (row.targetMainLineId === currentMainLineId) add("targetMainLineId", "Choose a different item.");
    }
    if (typeof row.reason !== "string" || !row.reason.trim() || row.reason.length > 4000) add("reason", "Explain why this change is needed, using up to 4,000 characters.");
    if (typeof row.active !== "boolean") add("active", "Choose whether this rule is enabled.");
    const targetId = targetKind === "sub_basket" ? row.targetSubBasketId : row.targetMainLineId;
    if (row.active === false || typeof targetId !== "string" || !targetId) return;
    const key = JSON.stringify([row.trigger, targetKind, targetId]);
    if (targets.has(key)) add("", `Use one active rule per related ${targetKind === "sub_basket" ? "Sub-Basket" : "item"} and trigger; combine its explanation instead of adding conflicting actions.`);
    targets.add(key);
  });
  return issues;
}
