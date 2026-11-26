import { PROJECT_LANGUAGES, PROJECT_LANGUAGE_OPTIONS, type ProjectLanguage } from "../../../../shared/projects/projectInitiation";

export function normalizeUserLanguages(languages: readonly ProjectLanguage[] = []): ProjectLanguage[] {
  return [...languages].sort((left, right) => PROJECT_LANGUAGES.indexOf(left) - PROJECT_LANGUAGES.indexOf(right));
}

export function userLanguageLabel(language: ProjectLanguage | null | undefined): string {
  return language ? PROJECT_LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ?? language : "Not set";
}
