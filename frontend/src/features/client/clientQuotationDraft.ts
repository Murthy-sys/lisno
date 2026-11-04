import { calculateDimensionQuantity, type EstimateDimensions } from "../../../../shared/estimation/estimateDimensions";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { emptyEstimateDimensions } from "../leads/EstimateDimensionsFields";
import type { QuotationDetail, QuotationGroup, QuotationLine, QuotationLineOperation, QuotationOperation } from "./quotationApi";

export interface QuotationItemDraft {
  line: QuotationLine;
  kind: "add" | "update";
  quantity: string;
  modeTier: KnowledgeModeTier;
  components: string[];
  dimensions: EstimateDimensions;
  included: boolean;
}
export interface QuotationGroupDraft { group: QuotationGroup; label: string }
export interface QuotationDraft {
  version: number;
  items: Record<string, QuotationItemDraft>;
  groups: QuotationGroupDraft[];
}

export const draftQuotationItem = (line: QuotationLine, kind: QuotationItemDraft["kind"] = "update"): QuotationItemDraft => ({
  line, kind, quantity: String(line.quantity), modeTier: line.modeTier, components: line.selectedInHouseComponentIds ?? [],
  dimensions: line.dimensions ?? emptyEstimateDimensions(), included: line.included
});

export function quotationGroupContains(group: QuotationGroup, line: QuotationLine): boolean {
  return line.mainBasketId === group.mainBasketId && (group.subBasketId === null || line.subBasketId === group.subBasketId)
    && (group.roomId === null || line.roomId === group.roomId);
}

export function quotationGroupContainsScope(parent: QuotationGroup, child: QuotationGroup): boolean {
  return parent.mainBasketId === child.mainBasketId && (parent.subBasketId === null || parent.subBasketId === child.subBasketId)
    && (parent.roomId === null || parent.roomId === child.roomId);
}

export function quotationItemOperation(item: QuotationItemDraft): Exclude<QuotationLineOperation, { kind: "exclude_group" }> {
  const choice = item.line.choices.find(value => value.modeTier === item.modeTier);
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
    ...(item.line.dimensionsMandatory ? { dimensions: item.dimensions } : {}),
    ...(choice?.inHouseComponents ? { selectedInHouseComponentIds: item.components } : {}) };
  return item.kind === "add" ? { kind: "add", mainLineId: item.line.mainLineId, roomId: item.line.roomId, ...selection }
    : { kind: "update", lineItemId: item.line.id, included: item.included, ...selection };
}

export function quotationDraftOperations(draft: QuotationDraft): QuotationOperation[] {
  const groups: QuotationOperation[] = draft.groups.map(({ group }) => ({ kind: "exclude_group", mainBasketId: group.mainBasketId,
    subBasketId: group.subBasketId, roomId: group.roomId, sourceToken: group.sourceToken }));
  const items = Object.values(draft.items).filter(item => !draft.groups.some(({ group }) => quotationGroupContains(group, item.line))
    && (item.kind !== "add" || item.included)).map(quotationItemOperation);
  const operations = [...groups, ...items];
  if (operations.length > 100) throw new Error("Save up to 100 item changes at a time. Basket removals count as one change.");
  return operations;
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
      const prior = before.lines.filter(line => line.source && quotationGroupContains({ ...operation, includedCount: 0 }, line));
      return prior.length > 0 && current.excludedLines !== undefined && prior.every(line => rows.some(row => row.id === line.id && !row.included));
    }
    const line = operation.kind === "update" ? rows.find(row => row.id === operation.lineItemId)
      : rows.find(row => row.mainLineId === operation.mainLineId && row.roomId === operation.roomId);
    if (!line) return false;
    if (operation.kind === "update" && operation.included === false) return !line.included;
    if (!line.included || operation.quantity !== undefined && line.quantity !== operation.quantity || operation.modeTier !== undefined && line.modeTier !== operation.modeTier) return false;
    if (operation.dimensions && JSON.stringify(line.dimensions) !== JSON.stringify(operation.dimensions)) return false;
    if (operation.selectedInHouseComponentIds && JSON.stringify([...(line.selectedInHouseComponentIds ?? [])].sort()) !== JSON.stringify([...operation.selectedInHouseComponentIds].sort())) return false;
    return true;
  });
}
