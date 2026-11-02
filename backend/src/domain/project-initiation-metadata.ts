import { z } from "zod";
import {
  DEFAULT_PROJECT_NEXT_ACTION,
  NATIVE_PLACE_MAX_LENGTH,
  PROJECT_CATEGORIES,
  PROJECT_LANGUAGES,
  TENTATIVE_BUDGET_MAX_LENGTH,
  isProjectCalendarDate,
  type ProjectInitiationMetadata,
  type ProjectLanguage
} from "../contracts/project-initiation.js";
import { ApiError } from "../middleware/errors.js";

const optionalText = (max: number) => z.string().trim().max(max)
  .transform(value => value || null).nullable().optional();

export const projectInitiationMetadataShape = {
  nativePlace: optionalText(NATIVE_PLACE_MAX_LENGTH),
  tentativeBudget: optionalText(TENTATIVE_BUDGET_MAX_LENGTH),
  closureTentativeDate: z.string().refine(isProjectCalendarDate, "Enter a valid calendar date (YYYY-MM-DD).")
    .nullable().optional(),
  category: z.enum(PROJECT_CATEGORIES).nullable().optional(),
  languagesKnown: z.array(z.string()).max(PROJECT_LANGUAGES.length)
    .refine(values => values.every(value => PROJECT_LANGUAGES.includes(value as ProjectLanguage)), "Select supported languages.")
    .refine(values => new Set(values).size === values.length, "Select each language only once.")
    .transform(values => values as ProjectLanguage[]).optional(),
  preferredLanguage: z.enum(PROJECT_LANGUAGES).nullable().optional()
};

export const projectInitiationNextActionSchema = z.string().trim().min(1).optional();
const intakeSchema = z.object({ ...projectInitiationMetadataShape, nextAction: projectInitiationNextActionSchema });

/** Project and Lead response projections share the same historical defaults. */
export function readProjectInitiationMetadata(input?: ProjectInitiationMetadata | null): Required<ProjectInitiationMetadata> {
  return {
    nativePlace: input?.nativePlace ?? null,
    tentativeBudget: input?.tentativeBudget ?? null,
    closureTentativeDate: input?.closureTentativeDate ?? null,
    category: input?.category ?? null,
    languagesKnown: [...(input?.languagesKnown ?? [])],
    preferredLanguage: input?.preferredLanguage ?? null
  };
}

/** Validate again at the service boundary for callers that do not use HTTP. */
export function validateProjectInitiationIntake(input: ProjectInitiationMetadata & { nextAction?: string }) {
  const parsed = intakeSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      fields[field] ??= issue.message;
    }
    throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", fields);
  }
  return {
    metadata: readProjectInitiationMetadata(parsed.data),
    nextAction: parsed.data.nextAction ?? DEFAULT_PROJECT_NEXT_ACTION
  };
}
