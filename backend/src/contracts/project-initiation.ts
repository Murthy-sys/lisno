/** Dependency-free intake values shared by the API and initiation form. */
export const PROJECT_LANGUAGES = [
  "assamese", "bengali", "bodo", "dogri", "english", "gujarati", "hindi",
  "kannada", "kashmiri", "konkani", "maithili", "malayalam", "manipuri",
  "marathi", "nepali", "odia", "punjabi", "sanskrit", "santali", "sindhi",
  "tamil", "telugu", "urdu"
] as const;

export type ProjectLanguage = (typeof PROJECT_LANGUAGES)[number];
export const PROJECT_LANGUAGE_OPTIONS = PROJECT_LANGUAGES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1)
}));

export const PROJECT_CATEGORIES = ["self_use", "rental"] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export const PROJECT_CATEGORY_OPTIONS = [
  { value: "self_use", label: "Self use" },
  { value: "rental", label: "Rental" }
] as const;

export const NATIVE_PLACE_MAX_LENGTH = 120;
export const TENTATIVE_BUDGET_MAX_LENGTH = 200;
export const DEFAULT_PROJECT_NEXT_ACTION = "Estimation";

/** Optional properties keep historical records and older clients compatible. */
export interface ProjectInitiationMetadata {
  nativePlace?: string | null;
  tentativeBudget?: string | null;
  closureTentativeDate?: string | null;
  category?: ProjectCategory | null;
  languagesKnown?: ProjectLanguage[];
  preferredLanguage?: ProjectLanguage | null;
}

/** Validate a calendar date without interpreting it as a timestamp. */
export function isProjectCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}
