import { approvedEstimateLineItemKey } from "./estimate-line-item.js";
import { estimatePdfCatalogue } from "./estimate-pdf-catalogue.js";

export interface WorkflowEstimateLine {
  id?: string | null;
  catalogueId: string;
  roomName: string;
  specification: string;
  unit: string;
  quantity: number;
  included: boolean;
}
export interface WorkflowEstimateItem { id: string; name: string; catalogueId: string; specification: string; quantity: number; uom: string; measurementType: "count" | "dimensions" }
export interface WorkflowEstimateRoom { id: string; name: string; estimateItems: WorkflowEstimateItem[] }
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

export function workflowEstimateRooms(estimateId: string, estimateVersion: number, rooms: Array<{ id: string; label: string }>, lines: WorkflowEstimateLine[]): WorkflowEstimateRoom[] {
  if (rooms.some((room) => !room || typeof room.id !== "string" || typeof room.label !== "string")) throw new WorkflowEstimateSourceError("The approved estimate has invalid room details.");
  const result = rooms.map((room) => ({ id: room.id, name: room.label, estimateItems: [] as WorkflowEstimateItem[] }));
  if (result.some((room) => !room.id?.trim() || !room.name?.trim()) || new Set(result.map((room) => room.id)).size !== result.length) throw new WorkflowEstimateSourceError("The approved estimate has invalid or duplicate room identities. Correct its room source before continuing.");
  const ids = new Set<string>();
  lines.forEach((line, index) => {
    if (line.included !== true) return;
    if (!Number.isFinite(line.quantity) || line.quantity < 0) throw new WorkflowEstimateSourceError("The approved estimate has an invalid selected item quantity.");
    const matching = result.filter((room) => room.name === line.roomName);
    if (matching.length !== 1) throw new WorkflowEstimateSourceError("Selected estimate items must match exactly one approved room. Correct missing or duplicate room labels before continuing.");
    let id: string;
    try { id = approvedEstimateLineItemKey({ id: line.id, estimateId, estimateVersion, index }); }
    catch { throw new WorkflowEstimateSourceError("The approved estimate has an invalid item identity."); }
    if (id.length > 500) throw new WorkflowEstimateSourceError("The approved estimate has an invalid item identity.");
    if (ids.has(id)) throw new WorkflowEstimateSourceError("The approved estimate has duplicate item identities.");
    ids.add(id);
    if (typeof line.catalogueId !== "string" || !line.catalogueId.trim() || typeof line.specification !== "string" || typeof line.unit !== "string" || !line.unit.trim()) throw new WorkflowEstimateSourceError("The approved estimate is missing selected item details.");
    const catalogueId = line.catalogueId;
    const name = estimatePdfCatalogue.get(catalogueId.toUpperCase())?.description ?? (line.specification.trim() ? `${catalogueId} — ${line.specification.trim()}` : catalogueId);
    matching[0]!.estimateItems.push({ id, name, catalogueId, specification: line.specification, quantity: line.quantity, uom: line.unit, measurementType: workflowItemMeasurementType(line.unit) });
  });
  return result;
}
