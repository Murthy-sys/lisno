import { createHash } from "node:crypto";
import type { AskLisnoProjectChoice, AskLisnoProjectList } from "../contracts/ask-lisno.js";
import type { ChatActor } from "../contracts/project-chat.js";
import { ApiError } from "../middleware/errors.js";

export const PROJECT_LIST_PAGE_SIZE = 20;

/** Match directory requests only, never comparisons, named-project questions or edits. */
export function isProjectListRequest(message: string): boolean {
  const normalized = message.normalize("NFKC").toLowerCase().trim()
    .replace(/[.,!?]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^(?:hi|hello|hey)(?: lisno)?\s+/, "")
    .replace(/^please\s+/, "")
    .replace(/^cn(?=\s+(?:i|you)\b)/, "can")
    .replace(/^(?:(?:can|could|would|will) you\s+)?(?:please\s+)?/, "")
    .replace(/\s+(?:please|thanks|thank you)$/, "");
  return /^(?:show|list|display|get)(?: me)? (?:a list of )?(?:all(?: of)?(?: (?:my|the))?|my|the)?\s*projects(?: (?:for me|that i have|i have))?$/.test(normalized)
    || /^(?:i (?:would like|want) to (?:see|get)|let me (?:see|get)|(?:can|could|may) i (?:please )?(?:see|get|have)) (?:all(?: of)?(?: my)?|my) projects$/.test(normalized)
    || /^(?:which|what) projects (?:do i have|are mine|are available to me)$/.test(normalized);
}

export function orderedProjectList(projects: AskLisnoProjectChoice[]): AskLisnoProjectChoice[] {
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return [...new Map(projects.map(project => [project.id, project])).values()]
    .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
}

export function projectListChanged(): never {
  throw new ApiError(409, "ASK_LISNO_PROJECT_LIST_CHANGED", "Your project list has changed. Please refresh it to see your current projects.");
}

/** Public freshness marker of authorized name metadata only; it grants no access. */
export function projectListPage(actor: Pick<ChatActor, "id" | "sessionVersion">, projects: AskLisnoProjectChoice[], continuation?: {offset: number; version: string}): AskLisnoProjectList {
  const version = createHash("sha256").update(JSON.stringify(["ask-lisno-project-list-v1", actor.id, actor.sessionVersion, projects])).digest("hex");
  const offset = continuation?.offset ?? 0;
  if (continuation && (continuation.version !== version || (offset > 0 && offset >= projects.length))) projectListChanged();
  return {items: projects.slice(offset, offset + PROJECT_LIST_PAGE_SIZE), offset,
    nextOffset: offset + PROJECT_LIST_PAGE_SIZE < projects.length ? offset + PROJECT_LIST_PAGE_SIZE : null, version};
}
