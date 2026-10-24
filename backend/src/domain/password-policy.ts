import { z } from "zod";

// bcrypt authenticates at most 72 UTF-8 bytes. Reject new passwords beyond that
// boundary instead of silently accepting credentials with identical prefixes.
export const newPasswordSchema = z.string()
  .min(12, "Password must be at least 12 characters.")
  .max(128, "Password must be at most 128 characters.")
  .refine(password => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be at most 72 UTF-8 bytes. Use fewer characters, especially emoji or accented characters."
  });
