const MAX_ESTIMATE_LINE_ITEM_ID_LENGTH = 500;

export function approvedEstimateLineItemKey(input: {
  id: unknown;
  estimateId: string;
  estimateVersion: number;
  index: number;
}): string {
  if (typeof input.id === "string" && input.id.trim()) {
    const id = input.id.trim();
    if (id.length > MAX_ESTIMATE_LINE_ITEM_ID_LENGTH) {
      throw new TypeError("Estimate line-item id is too long.");
    }
    return id;
  }
  if (
    !input.estimateId.trim() ||
    !Number.isSafeInteger(input.estimateVersion) ||
    input.estimateVersion < 1 ||
    !Number.isSafeInteger(input.index) ||
    input.index < 0
  ) {
    throw new TypeError("Legacy Estimate line-item identity is invalid.");
  }
  return `legacy-estimate-line:${input.estimateId}:${input.estimateVersion}:${input.index}`;
}
