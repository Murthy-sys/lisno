import { calculateDimensionQuantity } from "../../../../shared/estimation/estimateDimensions";
import { KNOWLEDGE_MODE_TIERS, type KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import type { EstimateTierComparisonInput } from "../estimates/estimateTierComparisonApi";
import { draftQuotationItem, quotationItemChoices, type QuotationDraft, type QuotationItemDraft } from "./clientQuotationDraft";
import type { QuotationGroup, QuotationLine, QuotationTierGroupOperation } from "./quotationApi";

export type SubBasketMode = "mode" | KnowledgeModeTier;
export interface QuotationModeSelection {
  value: KnowledgeModeTier;
  originals: Record<string, { modeTier: KnowledgeModeTier; components: string[] }>;
  group?: QuotationGroup;
}
export const quotationModeScopeKey = (roomId: string, mainBasketId?: string, subBasketId?: string | null) => JSON.stringify([roomId, mainBasketId ?? null, subBasketId ?? null]);

export function quotationGroupModeOptions(items: readonly QuotationItemDraft[]) {
  return KNOWLEDGE_MODE_TIERS.filter(tier => items.some(item => quotationItemChoices(item).some(choice => choice.modeTier === tier))).map(tier => {
    const unavailable = items.filter(item => !item.line.source || !quotationItemChoices(item).some(choice => choice.modeTier === tier && choice.available && choice.source));
    return { tier, available: items.length > 0 && unavailable.length === 0,
      reason: unavailable.length ? `${unavailable.length} ${unavailable.length === 1 ? "item is" : "items are"} unavailable in this mode.` : null };
  });
}

/** Restore only tier/component selections, preserving quantities, measurements and inclusion edits. */
export function stageQuotationGroupMode(draft: QuotationDraft | null, lines: readonly QuotationLine[], version: number,
  value: SubBasketMode, previous?: QuotationModeSelection, group?: QuotationGroup): { draft: QuotationDraft | null; selection?: QuotationModeSelection } {
  const items = { ...draft?.items };
  const originals = { ...previous?.originals };
  for (const line of lines) {
    const prior = items[line.id] ?? draftQuotationItem(line);
    const item = { ...prior, line: { ...prior.line, source: line.source, choices: line.choices, pricingModeChoices: line.pricingModeChoices } };
    if (!originals[line.id]) originals[line.id] = { modeTier: item.modeTier, components: [...item.components] };
    const original = originals[line.id]!;
    const next = value === "mode" ? { ...item, modeTier: original.modeTier, components: [...original.components] }
      : { ...item, modeTier: value, components: item.modeTier === value ? item.components : [] };
    if (value === "mode" && JSON.stringify(next) === JSON.stringify(draftQuotationItem(line))) delete items[line.id]; else items[line.id] = next;
  }
  const groups = draft?.groups ?? [];
  return { draft: Object.keys(items).length || groups.length ? { version: draft?.version ?? version, groups, items } : null,
    ...(value === "mode" ? {} : { selection: { value, originals, ...(group ? { group } : {}) } }) };
}

export function quotationModeOperations(selections: Readonly<Record<string, QuotationModeSelection>>, draft: QuotationDraft | null): QuotationTierGroupOperation[] {
  return Object.values(selections).flatMap(selection => {
    const group = selection.group;
    if (!group?.roomId || !draft) return [];
    const members = Object.values(draft.items).filter(item => item.kind === "update" && item.included &&
      item.line.roomId === group.roomId && item.line.mainBasketId === group.mainBasketId && item.line.subBasketId === group.subBasketId);
    if (!members.length || members.some(item => item.modeTier !== selection.value)) return [];
    const componentSelections = members.filter(item => quotationItemChoices(item).find(choice => choice.modeTier === item.modeTier)?.inHouseComponents)
      .map(item => ({ lineItemId: item.line.id, selectedInHouseComponentIds: item.components }));
    return [{ kind: "set_group_tier", mainBasketId: group.mainBasketId, subBasketId: group.subBasketId, roomId: group.roomId,
      sourceToken: group.sourceToken, modeTier: selection.value, ...(componentSelections.length ? { componentSelections } : {}) }];
  });
}

export function quotationGroupComparison(items: readonly QuotationItemDraft[], expectedVersion: number | null,
  scope: { mainBasketId?: string; subBasketId?: string | null; roomId: string }, configuredLineIds?: ReadonlySet<string>): EstimateTierComparisonInput | undefined {
  if (!scope.mainBasketId || !items.length || items.some(item => !item.line.source || !item.pricingMode)) return undefined;
  return { ...(expectedVersion === null ? {} : { expectedVersion }), mainBasketId: scope.mainBasketId,
    subBasketId: scope.subBasketId ?? null, roomId: scope.roomId,
    lines: items.map(item => ({ mainLineId: item.line.mainLineId, ...(item.kind === "update" ? { lineItemId: item.line.id } : {}),
      ...item.line.source!, quantity: item.line.dimensionsMandatory ? calculateDimensionQuantity(item.line.dimensionRule, item.dimensions)?.quantity ?? Number(item.quantity) : Number(item.quantity), pricingMode: item.pricingMode!, modeTier: item.modeTier,
      selectedInHouseComponentIds: item.components, ...(configuredLineIds?.has(item.line.id) ? { rateSource: "configuration" as const } : {}),
      ...(item.line.dimensionsMandatory ? { dimensions: item.dimensions, ...(item.line.dimensionRule ? { expectedDimensionRule: item.line.dimensionRule } : {}) } : {}) })) };
}
