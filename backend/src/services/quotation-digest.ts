import { sha256Hex } from "../domain/estimate-client-review.js";

/** Mongo may reorder object fields; approval identity covers values, not insertion order. */
export function quotationSnapshotDigest(snapshot: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") return Object.fromEntries(
      Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)])
    );
    return value;
  };
  return sha256Hex(JSON.stringify(canonical(snapshot)));
}
