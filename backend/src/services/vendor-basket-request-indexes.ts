import type { mongo } from "mongoose";
import { ApiError } from "../middleware/errors.js";

export const PENDING_REQUEST_INDEXES = [
  { oldName: "vendorKey_1_proposedNameNormalized_1", name: "vendor_basket_request_pending_vendor_target", oldKey: { vendorKey: 1, proposedNameNormalized: 1 }, key: { vendorKey: 1, targetParentBasketId: 1, proposedNameNormalized: 1 } },
  { oldName: "vendorNameNormalized_1_proposedNameNormalized_1", name: "vendor_basket_request_pending_name_target", oldKey: { vendorNameNormalized: 1, proposedNameNormalized: 1 }, key: { vendorNameNormalized: 1, targetParentBasketId: 1, proposedNameNormalized: 1 } }
] as const;
export const PENDING_REQUEST_FILTER = { status: "pending" } as const;
export function exactPendingIndex(index: mongo.IndexDescriptionInfo, key: object): boolean {
  return JSON.stringify(index.key) === JSON.stringify(key) && index.unique === true
    && JSON.stringify(index.partialFilterExpression) === JSON.stringify(PENDING_REQUEST_FILTER)
    && !index.sparse && !index.hidden && !index.collation && index.expireAfterSeconds === undefined;
}
export function requestIndexConflicts(indexes: mongo.IndexDescriptionInfo[]): string[] {
  const conflicts: string[] = [];
  const recognized = new Set<string>(PENDING_REQUEST_INDEXES.flatMap((definition) => [definition.oldName, definition.name]));
  for (const index of indexes) {
    if (index.unique && !recognized.has(String(index.name)) && index.key.proposedNameNormalized !== undefined
      && (index.key.vendorKey !== undefined || index.key.vendorNameNormalized !== undefined)) {
      conflicts.push(`Unrecognized request-name uniqueness index: ${index.name}`);
    }
  }
  for (const definition of PENDING_REQUEST_INDEXES) for (const index of indexes) {
    const oldKey = JSON.stringify(index.key) === JSON.stringify(definition.oldKey);
    const newKey = JSON.stringify(index.key) === JSON.stringify(definition.key);
    if (index.name === definition.oldName && !exactPendingIndex(index, definition.oldKey)
      || index.name === definition.name && !exactPendingIndex(index, definition.key)
      || oldKey && index.name !== definition.oldName || newKey && index.name !== definition.name) {
      conflicts.push(`Unexpected pending request index definition: ${index.name}`);
    }
  }
  return [...new Set(conflicts)];
}
/** The new target flow stays unavailable until an explicitly coordinated index transition. */
export async function requireTargetRequestIndexes(collection: Pick<mongo.Collection, "listIndexes">): Promise<void> {
  const indexes = await collection.listIndexes().toArray().catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === 26) return [];
    throw error;
  });
  if (requestIndexConflicts(indexes).length || PENDING_REQUEST_INDEXES.some((definition) =>
    indexes.some((index) => index.name === definition.oldName)
      || !indexes.some((index) => index.name === definition.name && exactPendingIndex(index, definition.key)))) {
    throw new ApiError(409, "PROPOSAL_TARGET_SETUP_UNAVAILABLE", "Sub-Basket requests are temporarily unavailable until setup is complete. Your existing requests are preserved.");
  }
}
