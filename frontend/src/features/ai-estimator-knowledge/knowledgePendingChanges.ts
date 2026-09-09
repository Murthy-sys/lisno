import type { KnowledgeJsonObject } from "./knowledgeTypes";

export interface KnowledgePendingChangeField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly cleared?: boolean;
}

export interface KnowledgePendingChangeEntry {
  readonly key: string;
  readonly title: string;
  readonly kind: "added" | "updated" | "removed" | "reordered";
  readonly fields: readonly KnowledgePendingChangeField[];
  readonly incomplete?: boolean;
}

export interface KnowledgePendingChangeGroup {
  readonly key: string;
  readonly label: string;
  readonly entries: readonly KnowledgePendingChangeEntry[];
}

/** A view of local changes, never a writable or persisted draft. */
export interface KnowledgePendingChangesSnapshot {
  readonly sourceKey: string;
  readonly groups: readonly KnowledgePendingChangeGroup[];
}

export type KnowledgePendingChangesCallback = (snapshot: KnowledgePendingChangesSnapshot) => void;

/** Object key order is metadata; array ordering and false/zero values are meaningful. */
export function pendingValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => pendingValuesEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  const other = Object.keys(b).filter((key) => b[key] !== undefined);
  return keys.length === other.length && keys.every((key) => Object.hasOwn(b, key) && pendingValuesEqual(a[key], b[key]));
}

export function pendingObjectRows(value: unknown): readonly KnowledgeJsonObject[] {
  return Array.isArray(value) ? value.filter((row): row is KnowledgeJsonObject => Boolean(row && typeof row === "object" && !Array.isArray(row))) : [];
}

export function pendingText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(pendingText).filter(Boolean).join(", ");
  return "";
}

export interface PendingRowPair {
  readonly key: string;
  readonly before?: KnowledgeJsonObject;
  readonly after?: KnowledgeJsonObject;
  readonly beforeIndex?: number;
  readonly afterIndex?: number;
}

/** Match IDs first, retained legacy objects second. Never use labels as identity. */
export function pairPendingRows(before: readonly KnowledgeJsonObject[], after: readonly KnowledgeJsonObject[]): readonly PendingRowPair[] {
  const used = new Set<number>();
  const pairs: PendingRowPair[] = after.map((row, index) => {
    const id = typeof row.id === "string" && row.id ? row.id : undefined;
    let match = before.findIndex((candidate, position) => !used.has(position) && (id
      ? candidate.id === id
      : !candidate.id && (candidate === row || pendingValuesEqual(candidate, row))));
    if (match >= 0) used.add(match);
    return { key: id ? `id:${id}` : `local:${index}`, before: match >= 0 ? before[match] : undefined,
      after: row, beforeIndex: match >= 0 ? match : undefined, afterIndex: index };
  });
  // A single replaced ID-less row is unambiguous after retaining all other rows.
  const unmatchedBefore = before.map((row, index) => ({ row, index })).filter(({ index }) => !used.has(index));
  const unmatchedAfter = pairs.filter((pair) => !pair.before && !pair.after?.id);
  if (unmatchedBefore.length === 1 && !unmatchedBefore[0]!.row.id && unmatchedAfter.length === 1 && before.length === after.length) {
    const old = unmatchedBefore[0]!;
    const pair = unmatchedAfter[0]!;
    const pairIndex = pairs.indexOf(pair);
    pairs[pairIndex] = { ...pair, before: old.row, beforeIndex: old.index };
    used.add(old.index);
  }
  before.forEach((row, index) => {
    if (!used.has(index)) pairs.push({ key: typeof row.id === "string" && row.id ? `id:${row.id}` : `removed:${index}`, before: row, beforeIndex: index });
  });
  return pairs;
}

/** Add/remove shifts do not count as reordering the retained records. */
export function pendingRowsReordered(pairs: readonly PendingRowPair[]): boolean {
  const retained = pairs.filter((pair) => pair.beforeIndex !== undefined && pair.afterIndex !== undefined);
  return retained.some((pair, index) => index > 0 && pair.beforeIndex! < retained[index - 1]!.beforeIndex!);
}
