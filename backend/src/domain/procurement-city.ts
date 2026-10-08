import { z } from "zod";

export const cityNameSchema = z.string().trim().min(2).max(120)
  .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value), "City contains invalid characters.");

/** A confirmed city is a separate authority; an address is never parsed into one. */
export function confirmedCity(value: string | null | undefined): { name: string; key: string } | null {
  if (value == null) return null;
  const name = cityNameSchema.parse(value.normalize("NFKC").replace(/\s+/gu, " "));
  return { name, key: name.toLocaleLowerCase("en-IN") };
}
