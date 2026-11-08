import { calculateDimensionQuantity, type EstimateDimensions } from "../../../../shared/estimation/estimateDimensions";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { emptyEstimateDimensions } from "../leads/EstimateDimensionsFields";
import type { EstimatePricingMode } from "../leads/leadsApi";
import type { EstimateTierSource } from "./estimateTiersApi";
import type { QuotationDetail, QuotationGroup, QuotationLine, QuotationLineOperation, QuotationOperation, QuotationTierGroupOperation } from "./quotationApi";

export interface QuotationItemDraft {
  line: QuotationLine;
  kind: "add" | "update";
  quantity: string;
  modeTier: KnowledgeModeTier;
  pricingMode: EstimatePricingMode | null;
  components: string[];
  dimensions: EstimateDimensions;
  included: boolean;
  /** Omitted means preserve server-owned origins, including any non-visible source. */
  recommendationSourceMainLineIds?: string[];
}
export interface QuotationGroupDraft { group: QuotationGroup; label: string }
export interface QuotationDraft {
  version: number;
  items: Record<string, QuotationItemDraft>;
  groups: QuotationGroupDraft[];
}

export const draftQuotationItem = (line: QuotationLine, kind: QuotationItemDraft["kind"] = "update"): QuotationItemDraft => ({
  line, kind, quantity: String(line.quantity), modeTier: line.modeTier, pricingMode: line.pricingMode, components: line.selectedInHouseComponentIds ?? [],
  dimensions: line.dimensions ?? emptyEstimateDimensions(), included: line.included
});

/** Legacy choices describe only the saved mode, never an alternate mode's price. */
export function quotationItemChoices(item: QuotationItemDraft) {
  return item.pricingMode === item.line.pricingMode ? item.line.choices
    : item.line.pricingModeChoices?.find(option => option.pricingMode === item.pricingMode)?.choices ?? [];
}

/** Only explicitly assigned local origins are safe to cascade, including restored saved items. */
export function prunePendingQuotationRecommendations(draft: QuotationDraft, savedRows: readonly QuotationLine[]): QuotationDraft {
  let items = draft.items;
  let changed: boolean;
  do {
    changed = false;
    const rows = new Map([...savedRows, ...Object.values(items).map(item => item.line)].map(line => [line.id, line]));
    const included = new Set([...rows.values()].filter(line => (items[line.id]?.included ?? line.included) &&
      !draft.groups.some(({ group }) => quotationGroupContains(group, line))).map(line => JSON.stringify([line.roomId, line.mainLineId])));
    for (const [id, item] of Object.entries(items)) {
      if (!item.included || !item.recommendationSourceMainLineIds?.length) continue;
      const origins = item.recommendationSourceMainLineIds.filter(sourceId => included.has(JSON.stringify([item.line.roomId, sourceId])));
      if (origins.length !== item.recommendationSourceMainLineIds.length) {
        items = { ...items, [id]: { ...item, included: origins.length > 0, recommendationSourceMainLineIds: origins } };
        changed = true;
      }
    }
  } while (changed);
  return items === draft.items ? draft : { ...draft, items };
}

export function quotationGroupContains(group: Pick<QuotationGroup, "mainBasketId" | "subBasketId" | "roomId">, line: QuotationLine): boolean {
  return line.mainBasketId === group.mainBasketId && (group.subBasketId === null || line.subBasketId === group.subBasketId)
    && (group.roomId === null || line.roomId === group.roomId);
}

export function quotationGroupContainsScope(parent: Pick<QuotationGroup, "mainBasketId" | "subBasketId" | "roomId">, child: Pick<QuotationGroup, "mainBasketId" | "subBasketId" | "roomId">): boolean {
  return parent.mainBasketId === child.mainBasketId && (parent.subBasketId === null || parent.subBasketId === child.subBasketId)
    && (parent.roomId === null || parent.roomId === child.roomId);
}

/** A null tier scope means Direct items; removal scopes use null as a basket wildcard. */
function quotationTierGroupContains(group: Pick<QuotationTierGroupOperation, "mainBasketId" | "subBasketId" | "roomId">, line: QuotationLine): boolean {
  return line.mainBasketId === group.mainBasketId && line.subBasketId === group.subBasketId && line.roomId === group.roomId;
}

export function quotationItemOperation(item: QuotationItemDraft): Exclude<QuotationLineOperation, { kind: "exclude_group" }> {
  const choice = quotationItemChoices(item).find(value => value.modeTier === item.modeTier);
  if (!item.line.source || item.included && (!choice?.available || !choice.source)) throw new Error(`Refresh the configured options for ${item.line.mainLineName}.`);
  let quantity = Number(item.quantity);
  if (item.included && item.line.dimensionsMandatory) {
    const measured = calculateDimensionQuantity(item.line.dimensionRule, item.dimensions);
    if (!measured) throw new Error(`Enter valid dimensions for ${item.line.mainLineName}.`);
    quantity = measured.quantity;
  }
  if (item.included && (!item.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0)) throw new Error(`Enter a positive quantity for ${item.line.mainLineName}.`);
  if (item.included && choice?.inHouseComponents && (!item.components.length || item.components.some(id => !choice.inHouseComponents!.some(component => component.id === id && component.available)))) {
    throw new Error(`Select available components for ${item.line.mainLineName}.`);
  }
  const source = choice?.source ?? item.line.source;
  if (!item.included && item.kind === "update") return { kind: "update", lineItemId: item.line.id, source, included: false };
  const selection = { source, quantity, modeTier: item.modeTier,
    ...(item.pricingMode !== null && item.pricingMode !== item.line.pricingMode ? { pricingMode: item.pricingMode } : {}),
    ...(item.line.dimensionsMandatory ? { dimensions: item.dimensions } : {}),
    ...(choice?.inHouseComponents ? { selectedInHouseComponentIds: item.components } : {}),
    ...(item.recommendationSourceMainLineIds !== undefined ? { recommendationSourceMainLineIds: item.recommendationSourceMainLineIds } : {}) };
  return item.kind === "add" ? { kind: "add", mainLineId: item.line.mainLineId, roomId: item.line.roomId, ...selection }
    : { kind: "update", lineItemId: item.line.id, included: item.included, ...selection };
}

export function quotationDraftOperations(draft: QuotationDraft, tierGroups: readonly QuotationTierGroupOperation[] = []): QuotationOperation[] {
  const groups: QuotationOperation[] = draft.groups.map(({ group }) => ({ kind: "exclude_group", mainBasketId: group.mainBasketId,
    subBasketId: group.subBasketId, roomId: group.roomId, sourceToken: group.sourceToken }));
  const activeGroups = tierGroups.filter(group => !draft.groups.some(removal => quotationGroupContainsScope(removal.group, group)));
  const items = Object.values(draft.items).filter(item => !draft.groups.some(({ group }) => quotationGroupContains(group, item.line))
    && (item.kind !== "add" || item.included)).flatMap(item => {
      // Validate every selected row before compressing pure tier edits into one atomic group command.
      const operation = quotationItemOperation(item);
      const grouped = item.kind === "update" && item.included && activeGroups.some(group =>
        quotationTierGroupContains(group, item.line) && group.modeTier === item.modeTier);
      const pureTierEdit = item.included === item.line.included && item.quantity === String(item.line.quantity) &&
        item.pricingMode === item.line.pricingMode && item.recommendationSourceMainLineIds === undefined &&
        JSON.stringify(item.dimensions) === JSON.stringify(item.line.dimensions ?? emptyEstimateDimensions());
      return grouped && pureTierEdit ? [] : [operation];
    });
  const operations = [...groups, ...activeGroups, ...items];
  if (operations.length > 100) throw new Error("Save up to 100 item changes at a time. Basket removals count as one change.");
  return operations;
}

/** Current choices contain server-calculated selling prices for the saved quantity and components. */
function quotationConfiguredPriceMatches(line: QuotationLine, source: EstimateTierSource | null | undefined): boolean {
  const choice = line.choices.find(value => value.modeTier === line.modeTier);
  return Boolean(source && choice?.available && choice.source &&
    source.revisionId === choice.source.revisionId && source.itemVersion === choice.source.itemVersion &&
    source.revisionVersion === choice.source.revisionVersion && source.uomId === choice.source.uomId &&
    choice.amountPaise !== null && line.ratePaise === choice.ratePaise && line.amountPaise === choice.amountPaise);
}

/** A lost response requires the exact next-version choices, or an unchanged setup-only no-op. */
export function quotationSaveIsConfirmed(before: QuotationDetail, current: QuotationDetail, operations: readonly QuotationOperation[]): boolean {
  if (before.estimateVersion === null || current.projectId !== before.projectId || current.estimateId !== before.estimateId) return false;
  const setupNoOp = operations.length === 1 && operations[0].kind === "configure" && current.estimateVersion === before.estimateVersion;
  if (!setupNoOp && current.estimateVersion !== before.estimateVersion + 1) return false;
  const rows = [...current.lines, ...(current.excludedLines ?? [])];
  return operations.every(operation => {
    if (operation.kind === "configure") {
      const setup = current.setup;
      if (!setup || setup.propertyType !== operation.propertyType || setup.bedroomCount !== operation.bedroomCount) return false;
      const ids = (values: readonly string[]) => [...values].sort();
      if (JSON.stringify(ids(setup.selectedMainBasketIds)) !== JSON.stringify(ids(operation.selectedMainBasketIds))) return false;
      if (setup.rooms.length !== operation.rooms.length) return false;
      return operation.rooms.every(room => setup.rooms.some(saved => saved.id === room.id && saved.typeId === room.typeId &&
        saved.label === room.label && saved.length === room.length && saved.width === room.width));
    }
    if (operation.kind === "exclude_group") {
      const prior = before.lines.filter(line => line.source && quotationGroupContains(operation, line));
      return prior.length > 0 && current.excludedLines !== undefined && prior.every(line => rows.some(row => row.id === line.id && !row.included));
    }
    if (operation.kind === "set_group_tier") {
      const members = before.lines.filter(line => line.included && line.source && quotationTierGroupContains(operation, line));
      return members.length > 0 && members.every(prior => {
        const removed = operations.some(change => change.kind === "update" && change.lineItemId === prior.id && change.included === false);
        const line = rows.find(row => row.id === prior.id);
        if (removed) return line?.included === false;
        const update = operations.find(change => change.kind === "update" && change.lineItemId === prior.id);
        const components = operation.componentSelections?.find(selection => selection.lineItemId === prior.id)?.selectedInHouseComponentIds;
        return line?.included === true && line.modeTier === operation.modeTier &&
          line.pricingMode === (update?.kind === "update" ? update.pricingMode ?? prior.pricingMode : prior.pricingMode) &&
          quotationConfiguredPriceMatches(line, prior.source) && (components === undefined ||
          JSON.stringify([...(line.selectedInHouseComponentIds ?? [])].sort()) === JSON.stringify([...components].sort()));
      });
    }
    const line = operation.kind === "update" ? rows.find(row => row.id === operation.lineItemId)
      : rows.find(row => row.mainLineId === operation.mainLineId && row.roomId === operation.roomId);
    if (!line) return false;
    if (operation.kind === "update" && operation.included === false) return !line.included;
    if (!line.included || operation.quantity !== undefined && line.quantity !== operation.quantity || operation.modeTier !== undefined && line.modeTier !== operation.modeTier ||
      operation.pricingMode !== undefined && line.pricingMode !== operation.pricingMode) return false;
    if (!quotationConfiguredPriceMatches(line, operation.source)) return false;
    if (operation.dimensions && JSON.stringify(line.dimensions) !== JSON.stringify(operation.dimensions)) return false;
    if (operation.selectedInHouseComponentIds && JSON.stringify([...(line.selectedInHouseComponentIds ?? [])].sort()) !== JSON.stringify([...operation.selectedInHouseComponentIds].sort())) return false;
    if (operation.recommendationSourceMainLineIds !== undefined && (line.recommendationSourceMainLineIds === undefined ||
      JSON.stringify([...line.recommendationSourceMainLineIds].sort()) !== JSON.stringify([...operation.recommendationSourceMainLineIds].sort()))) return false;
    return true;
  });
}
