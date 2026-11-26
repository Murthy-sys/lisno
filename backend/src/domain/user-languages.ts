import { z } from "zod";
import { PROJECT_LANGUAGES, type ProjectLanguage } from "../contracts/project-initiation.js";

export const userKnownLanguagesSchema = z.custom<ProjectLanguage[]>(
  (value) => Array.isArray(value) && value.length <= PROJECT_LANGUAGES.length &&
    value.every(language => typeof language === "string" && PROJECT_LANGUAGES.includes(language as ProjectLanguage)) &&
    new Set(value).size === value.length,
  "Select supported languages, with each language selected only once."
).transform(value => PROJECT_LANGUAGES.filter(language => value.includes(language)));

export const userPreferredLanguageSchema = z.enum(PROJECT_LANGUAGES).nullable();

export const userLanguageUpdateSchema = z.object({
  version: z.number().int().positive(),
  languagesKnown: userKnownLanguagesSchema,
  preferredLanguage: userPreferredLanguageSchema
}).strict();

export function normalizeUserKnownLanguages(value: unknown): ProjectLanguage[] {
  return userKnownLanguagesSchema.parse(value === undefined ? [] : value);
}

export function normalizeUserPreferredLanguage(value: unknown): ProjectLanguage | null {
  return userPreferredLanguageSchema.parse(value === undefined ? null : value);
}

export function readUserLanguages(value: { languagesKnown?: unknown; preferredLanguage?: unknown }) {
  return {
    languagesKnown: normalizeUserKnownLanguages(value.languagesKnown),
    preferredLanguage: normalizeUserPreferredLanguage(value.preferredLanguage)
  };
}

export function sameUserLanguages(left: ReturnType<typeof readUserLanguages>, right: ReturnType<typeof readUserLanguages>) {
  return left.preferredLanguage === right.preferredLanguage &&
    left.languagesKnown.length === right.languagesKnown.length &&
    left.languagesKnown.every((language, index) => language === right.languagesKnown[index]);
}
