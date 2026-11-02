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
