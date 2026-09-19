import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter the email address on your Lisno account.").email("That email address doesn’t look right."),
  password: z.string().min(1, "Enter your password.")
});

export const recoverySchema = z.object({
  email: z.string().trim().email("Enter a valid email address.")
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(12, "Password must be at least 12 characters.").max(128),
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
