import type { KnowledgeModeConfiguration } from "./knowledgeModeConfiguration";
import type { KnowledgeJsonValue } from "./knowledgeTypes";

export const MAX_MODE_DESCRIPTION_LENGTH = 4_000;

export function generateModeDescription(mainLineName: string, pmc: KnowledgeModeConfiguration | undefined) {
  const selectedNames = (list: "inclusions" | "exclusions") =>
    pmc?.[list]?.filter((item) => item.selected).map((item) => item.name).join(", ") || "none";
  return `Providing, Supplying, Fixing, testing and commissioning of ${mainLineName}, inclusions ${selectedNames("inclusions")} and exclusions ${selectedNames("exclusions")}.`;
}

export function modeDescriptionIssues(value: KnowledgeJsonValue | undefined) {
  if (value === undefined || value === null) return [];
  if (typeof value !== "string" || !value.trim() || value.length > MAX_MODE_DESCRIPTION_LENGTH) {
    return [{ path: "modeDescription", message: `Enter a Mode paragraph of 1–${MAX_MODE_DESCRIPTION_LENGTH} characters.` }];
  }
  return [];
}
