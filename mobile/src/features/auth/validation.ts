import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter the email address on your Lisno account.").email("That email address doesn’t look right."),
  password: z.string().min(1, "Enter your password.")
});

export const recoverySchema = z.object({
  email: z.string().trim().email("Enter a valid email address.")
});

export const PASSWORD_HINT = "Use at least 12 characters and at most 72 UTF-8 bytes (up to 72 ASCII characters; fewer with accents or emoji).";
const PASSWORD_TOO_LONG = "Password must be at most 72 UTF-8 bytes. Accented characters and emoji use more than one byte.";

// Hermes environments need not provide TextEncoder. Iteration handles paired
// surrogates; unpaired surrogates encode as the three-byte replacement character.
function utf8ByteLength(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return length;
}

export const newPasswordSchema = z
  .object({
    password: z.string().min(12, "Password must be at least 12 characters.").refine((value) => utf8ByteLength(value) <= 72, PASSWORD_TOO_LONG),
    passwordConfirmation: z.string()
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match."
  });

export function firstIssue(
  result: z.ZodSafeParseResult<unknown>,
  field: string
): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}
