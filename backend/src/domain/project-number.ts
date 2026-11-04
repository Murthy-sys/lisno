import { ApiError } from "../middleware/errors.js";

export function projectNumberStateConflict(): ApiError {
  return new ApiError(409, "PROJECT_NUMBER_STATE_CONFLICT", "Project numbering requires an administrator to resolve inconsistent stored data.");
}

export function formatProjectNumber(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) throw projectNumberStateConflict();
  return `Lisno${String(value).padStart(6, "0")}`;
}

export function parseProjectNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "string" || !/^Lisno\d{6,16}$/.test(value)) throw projectNumberStateConflict();
  const suffix = Number(value.slice(5));
  if (!Number.isSafeInteger(suffix) || suffix < 1 || formatProjectNumber(suffix) !== value) throw projectNumberStateConflict();
  return suffix;
}

export function readProjectNumber(value: unknown): string | null {
  const suffix = parseProjectNumber(value);
  return suffix === null ? null : formatProjectNumber(suffix);
}

/** Resolve only the projects already authorized by the calling read operation. */
export function projectNumbersForProjectIds(
  projectIds: readonly string[],
  leads: readonly { projectId: string | null; projectNumber?: unknown }[]
): Map<string, string | null> {
  const result = new Map<string, string | null>(projectIds.map(id => [id, null]));
  const linkedCounts = new Map<string, number>();
  const numberOwners = new Map<string, string>();
  for (const lead of leads) {
    if (lead.projectId === null || !result.has(lead.projectId)) continue;
    const number = readProjectNumber(lead.projectNumber);
    const count = (linkedCounts.get(lead.projectId) ?? 0) + 1;
    linkedCounts.set(lead.projectId, count);
    if (count > 1 && (number !== null || result.get(lead.projectId) !== null)) {
      throw projectNumberStateConflict();
    }
    if (number !== null) {
      const owner = numberOwners.get(number);
      if (owner !== undefined && owner !== lead.projectId) throw projectNumberStateConflict();
      numberOwners.set(number, lead.projectId);
      result.set(lead.projectId, number);
    }
  }
  return result;
}
