import { createHash } from "node:crypto";
import type { DesignerSuggestion } from "../contracts/designer-assignment.js";
import { PROJECT_LANGUAGES, type ProjectLanguage } from "../contracts/project-initiation.js";

export function normalizeDesignerMatchText(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-IN") : "";
}

export function designerLanguage(value: unknown): ProjectLanguage | null {
  return typeof value === "string" && PROJECT_LANGUAGES.includes(value as ProjectLanguage) ? value as ProjectLanguage : null;
}

export function designerLanguageMatch(preference: unknown, preferred: unknown, known: readonly unknown[]): DesignerSuggestion["languageMatch"] {
  const wanted = designerLanguage(preference);
  const own = designerLanguage(preferred);
  const languages = known.map(designerLanguage).filter(Boolean);
  if (!wanted || !own && languages.length === 0) return "unknown";
  if (wanted === own) return "preferred";
  return languages.includes(wanted) ? "known" : "none";
}

export function designerLocationMatch(location: unknown, projectLocation: unknown, confirmedCity: unknown): DesignerSuggestion["locationMatch"] {
  const candidate = normalizeDesignerMatchText(location);
  const project = normalizeDesignerMatchText(projectLocation);
  const city = normalizeDesignerMatchText(confirmedCity);
  if (!candidate || !project && !city) return "unknown";
  if (project && candidate === project) return "same_location";
  if (city && (candidate === city || candidate.split(",").some(part => part.trim() === city))) return "city_text";
  return "none";
}

export function compareDesignerSuggestions(left: DesignerSuggestion, right: DesignerSuggestion): number {
  const languageRank = { preferred: 0, known: 1, none: 2, unknown: 2 };
  const locationRank = { same_location: 0, city_text: 1, none: 2, unknown: 2 };
  return left.activeProjectCount - right.activeProjectCount ||
    languageRank[left.languageMatch] - languageRank[right.languageMatch] ||
    locationRank[left.locationMatch] - locationRank[right.locationMatch] ||
    normalizeDesignerMatchText(left.name).localeCompare(normalizeDesignerMatchText(right.name), "en-IN") ||
    left.id.localeCompare(right.id, "en-IN");
}

/** Hash only explicit, ordered source fields. Never use this digest as authorization. */
export function designerAssignmentRevision(source: unknown): string {
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}
