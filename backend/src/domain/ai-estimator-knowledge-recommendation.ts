export type KnowledgeBudgetAlterationTargetKind = "main_line" | "sub_basket";

export interface NormalizedKnowledgeBudgetAlterationTarget {
  readonly targetKind: KnowledgeBudgetAlterationTargetKind;
  readonly targetId: unknown;
}

/**
 * Reads the persisted recommendation discriminator without rewriting legacy
 * rows. An absent targetKind is the original Main-Line representation; an
 * unknown explicit value remains invalid instead of being coerced.
 */
export function normalizeKnowledgeBudgetAlterationTarget(
  row: Readonly<Record<string, unknown>>
): NormalizedKnowledgeBudgetAlterationTarget | null {
  const targetKind = row.targetKind === undefined ? "main_line" : row.targetKind;
  if (targetKind !== "main_line" && targetKind !== "sub_basket") return null;
  return {
    targetKind,
    targetId: targetKind === "sub_basket" ? row.targetSubBasketId : row.targetMainLineId
  };
}
