import type { KnowledgeJsonObject, KnowledgeJsonValue } from "./knowledgeTypes";

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
  return { id: crypto.randomUUID(), trigger: "removed", action: "remove", requirement: "must", targetType: "catalog",
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
    if (!["catalog", "temporary"].includes(String(row.targetType))) add("targetType", "Select a catalog or temporary item.");
    if (typeof row.targetBasketId !== "string" || !row.targetBasketId.trim()) add("targetBasketId", "Choose a Main Basket.");
    if (row.targetSubBasketId !== null && (typeof row.targetSubBasketId !== "string" || !row.targetSubBasketId)) add("targetSubBasketId", "Choose a valid Sub Basket.");
    if (typeof row.targetMainLineId !== "string" || !row.targetMainLineId) add("targetMainLineId", "Choose a related item.");
    if (row.targetMainLineId === currentMainLineId) add("targetMainLineId", "Choose a different item.");
    if (typeof row.reason !== "string" || !row.reason.trim() || row.reason.length > 4000) add("reason", "Explain why this change is needed, using up to 4,000 characters.");
    if (typeof row.active !== "boolean") add("active", "Choose whether this rule is enabled.");
    if (row.active === false || !row.targetMainLineId) return;
    const key = JSON.stringify([row.trigger, row.targetMainLineId]);
    if (targets.has(key)) add("", "Use one active rule per related item and trigger; combine its explanation instead of adding conflicting actions.");
    targets.add(key);
  });
  return issues;
}
