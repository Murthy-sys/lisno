import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.");

export const normalizedEmailSchema = emailSchema.transform((email) =>
  email.toLowerCase()
);

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
