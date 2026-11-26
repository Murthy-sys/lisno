import { z } from "zod";

export const USER_LOCATION_MAX_LENGTH = 120;
const controlCharacters = /[\u0000-\u001F\u007F-\u009F]/u;

/** Optional profile metadata; never inferred from an address or project. */
export const userLocationSchema = z.string()
  .refine((value) => !controlCharacters.test(value), "Location cannot contain control characters.")
  .transform((value) => value.trim())
  .pipe(z.string().max(USER_LOCATION_MAX_LENGTH, "Location must be 120 characters or fewer."))
  .transform((value) => value || null)
  .nullable();

export function normalizeUserLocation(value: unknown): string | null {
  return userLocationSchema.parse(value === undefined ? null : value);
}
