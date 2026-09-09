import { ApiError } from "../../api/client";
import { getKnowledgeItem, listKnowledgeMainLines, listKnowledgeSubBaskets } from "./knowledgeApi";
import { collectAllKnowledgeMasterPages } from "./knowledgeMasterPagination";
import type { KnowledgeItemDetail } from "./knowledgeTypes";

export interface RelatedItemCreationInput {
  readonly basketId: string;
  readonly subBasketName: string;
  readonly name: string;
  readonly itemType: "main_line" | "temporary";
  readonly excludeMainLineId?: string;
}

export type RelatedItemReconciliation =
  | { readonly kind: "absent" }
  | { readonly kind: "conflict"; readonly message: string }
  | { readonly kind: "match"; readonly item: KnowledgeItemDetail };

function normalizeIdentity(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function requiresRelatedItemReconciliation(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status < 400 || error.status >= 500 || error.status === 408 || error.status === 409;
}

/** Complete server reads are required: a partial catalog cannot prove absence. */
export async function reconcileRelatedItemCreation(input: RelatedItemCreationInput): Promise<RelatedItemReconciliation> {
  const [mainLines, subBaskets] = await Promise.all([
    collectAllKnowledgeMasterPages((page) => listKnowledgeMainLines(input.basketId, { ...page, includeArchived: true }), "Related items"),
    collectAllKnowledgeMasterPages((page) => listKnowledgeSubBaskets(input.basketId, page), "Sub Basket")
  ]);
  const sameName = mainLines.items.filter((item) => item.basketId === input.basketId && normalizeIdentity(item.name) === normalizeIdentity(input.name));
  if (sameName.length === 0) return { kind: "absent" };

  const subBasketName = normalizeIdentity(input.subBasketName);
  const subBasketId = subBasketName
    ? subBaskets.items.find((basket) => basket.basketId === input.basketId && normalizeIdentity(basket.name) === subBasketName)?.id
    : null;
  const eligible = sameName.filter((item) =>
    item.id !== input.excludeMainLineId &&
    (item.status === "active" || item.status === "draft") &&
    (item.itemType ?? "main_line") === input.itemType &&
    subBasketId !== undefined && (item.subBasketId ?? null) === subBasketId
  );
  if (eligible.length !== 1) {
    return {
      kind: "conflict",
      message: "This name is already used in this Main Basket. The item is unavailable, is the source item, or has a different Sub Basket or item type. Choose a different name or correct the classification."
    };
  }

  const item = await getKnowledgeItem(eligible[0].id);
  if (item.mainLineId !== eligible[0].id || item.mainLineId === input.excludeMainLineId ||
    item.basketId !== input.basketId || normalizeIdentity(item.mainLineName) !== normalizeIdentity(input.name) ||
    (item.itemType ?? "main_line") !== input.itemType || (item.subBasketId ?? null) !== subBasketId ||
    (item.status !== "active" && item.status !== "draft")) {
    return { kind: "conflict", message: "The matching item changed or is no longer available for this rule. Check its classification or use a different name." };
  }
  return { kind: "match", item };
}
