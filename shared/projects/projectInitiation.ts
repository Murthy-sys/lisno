// Keep runtime values inside the backend build root and share them with the UI.
export {
  PROJECT_LANGUAGES,
  PROJECT_LANGUAGE_OPTIONS,
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_OPTIONS,
  NATIVE_PLACE_MAX_LENGTH,
  TENTATIVE_BUDGET_MAX_LENGTH,
  DEFAULT_PROJECT_NEXT_ACTION,
  isProjectCalendarDate
} from "../../backend/src/contracts/project-initiation";
export type {
  ProjectLanguage,
  ProjectCategory,
  ProjectInitiationMetadata
} from "../../backend/src/contracts/project-initiation";
