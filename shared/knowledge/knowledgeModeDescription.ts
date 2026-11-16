import type { KnowledgeJsonValue } from "./knowledgeTypes";
import { MAX_MODE_DESCRIPTION_LENGTH } from "../../backend/src/domain/knowledge-mode-description";

// Keep one pure implementation inside the backend build root for both consumers.
export { MAX_MODE_DESCRIPTION_LENGTH, generateModeDescription, syncModeDescription } from "../../backend/src/domain/knowledge-mode-description";

export function modeDescriptionIssues(value: KnowledgeJsonValue | undefined) {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string" || !value.trim() || value.length > MAX_MODE_DESCRIPTION_LENGTH) {
    return [{ path: "modeDescription", message: `Enter a Mode paragraph up to ${MAX_MODE_DESCRIPTION_LENGTH} characters, or leave it empty.` }];
  }
  return [];
}
