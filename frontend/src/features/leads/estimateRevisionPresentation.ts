import type { EstimateClientReviewSnapshot } from "../../api/types";
import type { EstimateRevisionSummary } from "./estimateRevisionsApi";

export type RevisionLine = EstimateClientReviewSnapshot["lineItems"][number];
export interface RevisionRoom { id: string; label: string }
export interface RevisionLineEntry { line: RevisionLine; index: number }

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const savedText = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;

/** Formatting recorded money only; no current rates or quantity calculations. */
export function revisionMoney(paise: number | null | undefined, rupees?: number | null): string {
  if (paise !== undefined) return typeof paise === "number" && Number.isSafeInteger(paise) && paise >= 0 ? currency.format(paise / 100) : "Not recorded";
  return typeof rupees === "number" && Number.isFinite(rupees) && rupees >= 0 && rupees <= Number.MAX_SAFE_INTEGER / 100 ? currency.format(rupees) : "Not recorded";
}

export function revisionDate(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? date.format(parsed) : "Date unavailable";
}

export const revisionStatus: Record<EstimateRevisionSummary["status"], string> = {
  pending: "Awaiting approval", approved: "Approved", changes_requested: "Changes requested", superseded: "Superseded"
};

export function revisionRooms(snapshot: EstimateClientReviewSnapshot): RevisionRoom[] {
  const rooms = new Map<string, RevisionRoom>();
  for (const room of snapshot.rooms ?? []) {
    if (!room || typeof room !== "object") continue;
    const id = savedText(room.id);
    if (id && !rooms.has(id)) rooms.set(id, { id, label: savedText(room.label) ?? "Room name not recorded" });
  }
  for (const line of snapshot.lineItems) {
    const id = savedText(line.roomId);
    if (id && !rooms.has(id)) rooms.set(id, { id, label: savedText(line.roomName) ?? "Room name not recorded" });
  }
  return [...rooms.values()];
}

export function revisionGroups(entries: readonly RevisionLineEntry[]) {
  const groups = new Map<string | null, {
    id: string | null; name: string;
    sections: Map<string | null, { id: string | null; name: string; entries: RevisionLineEntry[] }>;
  }>();
  for (const entry of entries) {
    const line = entry.line;
    const basketId = savedText(line.mainBasketId);
    const group = groups.get(basketId) ?? { id: basketId,
      name: basketId ? savedText(line.mainBasketName) ?? "Basket name not recorded" : "Ungrouped saved items",
      sections: new Map() };
    // A Sub Basket without its parent identity is not a trustworthy join key.
    const subId = basketId ? savedText(line.subBasketId) : null;
    const section = group.sections.get(subId) ?? { id: subId,
      name: subId ? savedText(line.subBasketName) ?? "Sub-basket name not recorded" : "Saved items", entries: [] };
    section.entries.push(entry);
    group.sections.set(subId, section);
    groups.set(basketId, group);
  }
  return [...groups.values()].map(group => ({ ...group, sections: [...group.sections.values()] }));
}
