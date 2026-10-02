import { approvedEstimateLineItemKey } from "./estimate-line-item.js";
import { configuredEstimateParentIsValid } from "./estimate-client-review.js";
import { estimatePdfCatalogue } from "./estimate-pdf-catalogue.js";
import { rupeesToPaise } from "./project-finance.js";

export interface WorkflowEstimateLine {
  id?: string | null;
  source?: "legacy" | "configuration";
  itemType?: "main_line" | "temporary";
  catalogueId: string;
  roomId?: string;
  roomName: string;
  specification: string | null;
  unit: string;
  quantity: number;
  included: boolean;
  amount?: unknown;
  amountPaise?: unknown;
  mainBasketId?: string;
  subBasketId?: string | null;
  mainLineId?: string;
  mainBasketName?: string;
  subBasketName?: string | null;
  mainLineName?: string;
}
export interface WorkflowEstimateItem { id: string; name: string; catalogueId: string; specification: string; quantity: number; uom: string; measurementType: "count" | "dimensions" }
export interface WorkflowEstimateRoom { id: string; name: string; estimateDimensions?: { lengthFt: number; widthFt: number }; estimateItems: WorkflowEstimateItem[] }
export interface WorkflowEstimateRoomContext { estimateId: string; estimateVersion: number; rooms: WorkflowEstimateRoom[] }
export interface WorkflowEstimateApproval {
  id: string;
  estimateId: string;
  projectId: string | null;
  estimateVersion: number;
  status: string;
  decision: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  decisionSource: string | null;
  lineItems: WorkflowEstimateLine[];
}
export class WorkflowEstimateSourceError extends Error {}

export function approvedEstimateAmountPaiseIsActionable(amountPaise: number): boolean {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) throw new TypeError("The approved estimate line amount is invalid.");
  return amountPaise > 0;
}

/** A missing amount belongs to a legacy approved source; only an explicit zero is excluded. */
export function approvedEstimateLineIsActionable(line: { source?: string; amount?: unknown; amountPaise?: unknown }): boolean {
  if (line.source === "configuration") {
    if (typeof line.amountPaise !== "number") throw new TypeError("The approved configured estimate line amount is invalid.");
    return approvedEstimateAmountPaiseIsActionable(line.amountPaise);
  }
  if (line.amount === undefined) return true;
  if (typeof line.amount !== "number") throw new TypeError("The approved estimate line amount is invalid.");
  return approvedEstimateAmountPaiseIsActionable(rupeesToPaise(line.amount));
}

export function workflowApprovedLines(input: {
  projectId: string; estimateId: string; estimateVersion: number;
  reviewRoundId?: string | null; rounds: WorkflowEstimateApproval[]; legacyLines: WorkflowEstimateLine[];
}): WorkflowEstimateLine[] {
  const approved = input.rounds.filter((round) => round.status === "approved");
  if (!approved.length && !input.reviewRoundId) return input.legacyLines;
  const matching = approved.filter((round) => round.estimateVersion === input.estimateVersion);
  const round = matching.length === 1 ? matching[0] : undefined;
  if (!round || round.estimateId !== input.estimateId || round.projectId !== null && round.projectId !== input.projectId || input.reviewRoundId && round.id !== input.reviewRoundId || round.decision !== "approve" || !round.decidedById || !round.decidedAt || !Number.isFinite(Date.parse(round.decidedAt)) || !["client_portal", "admin_proof"].includes(round.decisionSource ?? "")) {
    throw new WorkflowEstimateSourceError("The approved estimate snapshot is ambiguous or does not match the project's approved source.");
  }
  return round.lineItems;
}

/** Only the approved line's explicit point unit determines count entry. */
export function workflowItemMeasurementType(unit: string): WorkflowEstimateItem["measurementType"] {
  const normalized = unit.normalize("NFKC").trim().toLowerCase().replace(/\.\s*$/, "").trim();
  return ["pt", "pts", "point", "points"].includes(normalized) ? "count" : "dimensions";
}

export function workflowEstimateRoomDimensions(room: { length?: unknown; width?: unknown }): Pick<WorkflowEstimateRoom, "estimateDimensions"> {
  return typeof room.length === "number" && Number.isFinite(room.length) && room.length > 0 && typeof room.width === "number" && Number.isFinite(room.width) && room.width > 0
    ? { estimateDimensions: { lengthFt: room.length, widthFt: room.width } }
    : {};
}

export function workflowEstimateRooms(estimateId: string, estimateVersion: number, rooms: Array<{ id: string; label: string; length?: unknown; width?: unknown }>, lines: WorkflowEstimateLine[], options: { includeZeroValueItems?: boolean } = {}): WorkflowEstimateRoom[] {
  if (rooms.some((room) => !room || typeof room.id !== "string" || typeof room.label !== "string")) throw new WorkflowEstimateSourceError("The approved estimate has invalid room details.");
  const result: WorkflowEstimateRoom[] = rooms.map((room) => ({
    id: room.id,
    name: room.label,
    ...workflowEstimateRoomDimensions(room),
    estimateItems: []
  }));
  if (result.some((room) => !room.id?.trim() || !room.name?.trim()) || new Set(result.map((room) => room.id)).size !== result.length) throw new WorkflowEstimateSourceError("The approved estimate has invalid or duplicate room identities. Correct its room source before continuing.");
  const ids = new Set<string>();
  lines.forEach((line, index) => {
    if (line.included !== true) return;
    if (!Number.isFinite(line.quantity) || line.quantity < 0) throw new WorkflowEstimateSourceError("The approved estimate has an invalid selected item quantity.");
    const matching = result.filter((room) => line.source === "configuration"
      ? room.id === line.roomId
      : room.name === line.roomName);
    if (matching.length !== 1) throw new WorkflowEstimateSourceError("Selected estimate items must match exactly one approved room. Correct missing or duplicate room labels before continuing.");
    let id: string;
    try { id = approvedEstimateLineItemKey({ id: line.id, estimateId, estimateVersion, index }); }
    catch { throw new WorkflowEstimateSourceError("The approved estimate has an invalid item identity."); }
    if (id.length > 500) throw new WorkflowEstimateSourceError("The approved estimate has an invalid item identity.");
    if (ids.has(id)) throw new WorkflowEstimateSourceError("The approved estimate has duplicate item identities.");
    ids.add(id);
    if (typeof line.catalogueId !== "string" || !line.catalogueId.trim() || line.source !== "configuration" && typeof line.specification !== "string" || typeof line.unit !== "string" || !line.unit.trim()) throw new WorkflowEstimateSourceError("The approved estimate is missing selected item details.");
    const catalogueId = line.catalogueId;
    if (line.source === "configuration" && (line.mainLineId !== catalogueId || !line.mainLineName?.trim() || !configuredEstimateParentIsValid(line) || !line.mainBasketName?.trim())) {
      throw new WorkflowEstimateSourceError("The approved configured estimate item is missing its saved identity or labels.");
    }
    const name = line.source === "configuration"
      ? [line.subBasketName ?? line.mainBasketName, line.mainLineName].join(" · ")
      : estimatePdfCatalogue.get(catalogueId.toUpperCase())?.description ?? (line.specification?.trim() ? `${catalogueId} — ${line.specification.trim()}` : catalogueId);
    let actionable: boolean;
    try { actionable = approvedEstimateLineIsActionable(line); }
    catch { throw new WorkflowEstimateSourceError("The approved estimate has an invalid selected item amount."); }
    if (!actionable && !options.includeZeroValueItems) return;
    matching[0]!.estimateItems.push({ id, name, catalogueId, specification: line.specification ?? "", quantity: line.quantity, uom: line.unit, measurementType: workflowItemMeasurementType(line.unit) });
  });
  return result;
}
