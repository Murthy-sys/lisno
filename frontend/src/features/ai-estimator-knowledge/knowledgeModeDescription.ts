import type { KnowledgeModeConfiguration } from "./knowledgeModeConfiguration";
import type { KnowledgeJsonValue } from "./knowledgeTypes";
import { defaultPmcScopeItems, PMC_SCOPE_LISTS, type KnowledgePmcScopeList } from "./knowledgePmcScope";

export const MAX_MODE_DESCRIPTION_LENGTH = 4_000;

export function generateModeDescription(mainLineName: string, pmc: KnowledgeModeConfiguration | undefined) {
  const selectedNames = (list: "inclusions" | "exclusions") =>
    pmc?.[list]?.filter((item) => item.selected).map((item) => item.name).join(", ") || "none";
  return `Providing, Supplying, Fixing, testing and commissioning of ${mainLineName}, inclusions ${selectedNames("inclusions")} and exclusions ${selectedNames("exclusions")}.`;
}

/** Checklist values belong to their labelled list; other paragraph wording stays editable. */
export function syncModeDescription(
  text: string,
  pmc: KnowledgeModeConfiguration | undefined,
  previousPmc?: KnowledgeModeConfiguration
): string {
  const labels = [...text.matchAll(/\b(inclusions|exclusions)\b/giu)];
  const seen = new Set<KnowledgePmcScopeList>();
  let result = text.slice(0, labels[0]?.index ?? text.length);
  for (const [index, match] of labels.entries()) {
    const list = match[1]!.toLowerCase() as KnowledgePmcScopeList;
    const content = text.slice(match.index! + match[0].length, labels[index + 1]?.index ?? text.length);
    if (seen.has(list)) {
      result += match[0] + content;
      continue;
    }
    seen.add(list);
    const clause = syncScopeClause(content, list, pmc, previousPmc);
    result += match[0] + clause;
    if (labels[index + 1] && !/\s$/u.test(clause)) result += content.includes("\n") ? "\n" : " ";
  }
  for (const list of PMC_SCOPE_LISTS) {
    const names = selectedScopeNames(pmc, list);
    if (seen.has(list) || !names.length) continue;
    result = result.trimEnd();
    if (result) result += /[.!?]$/u.test(result) ? " " : ". ";
    result += `${list === "inclusions" ? "Inclusions" : "Exclusions"}: ${names.join(", ")}.`;
  }
  return result;
}

function selectedScopeNames(pmc: KnowledgeModeConfiguration | undefined, list: KnowledgePmcScopeList) {
  return pmc?.[list]?.filter((item) => item.selected).map((item) => item.name) ?? [];
}

function syncScopeClause(
  content: string,
  list: KnowledgePmcScopeList,
  pmc: KnowledgeModeConfiguration | undefined,
  previousPmc: KnowledgeModeConfiguration | undefined
) {
  const prefix = content.match(/^\s*:?\s*/u)![0];
  let remaining = content.slice(prefix.length);
  // Removed entries still need recognition to clear their values from an existing paragraph.
  const knownNames = [
    ...(pmc?.[list] ?? defaultPmcScopeItems(list)).map((item) => item.name),
    ...(previousPmc?.[list] ?? []).map((item) => item.name),
    "none"
  ]
    .filter((name) => name.trim());
  // Longest first prevents an item such as "Transport" consuming "Transport labour".
  const namesPattern = knownNames.sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|");
  const itemPattern = new RegExp(`^(?:${namesPattern})(?=$|[^\\p{L}\\p{N}])`, "iu");
  let removed = false;
  let item: RegExpMatchArray | null;
  while ((item = remaining.match(itemPattern))) {
    removed = true;
    remaining = remaining.slice(item[0].length);
    const separator = remaining.match(/^(?:\s*,\s*|\s+and\s+|\s*&\s*)/iu)?.[0];
    if (!separator || !itemPattern.test(remaining.slice(separator.length))) break;
    remaining = remaining.slice(separator.length);
  }
  const names = selectedScopeNames(pmc, list);
  if (!names.length && !removed) return content;
  const values = names.join(", ") || "none";
  const spacing = prefix ? (/\s$/u.test(prefix) ? prefix : `${prefix} `) : " ";
  // Preserve punctuation, connectors to the next label, and free wording after the list.
  const join = removed || !remaining.trim() || /^[,.;!?]/u.test(remaining) ? ""
    : /^and\s*$/iu.test(remaining) ? " " : ", ";
  return spacing + values + join + remaining;
}

export function modeDescriptionIssues(value: KnowledgeJsonValue | undefined) {
  if (value === undefined || value === null) return [];
  if (typeof value !== "string" || !value.trim() || value.length > MAX_MODE_DESCRIPTION_LENGTH) {
    return [{ path: "modeDescription", message: `Enter a Mode paragraph of 1–${MAX_MODE_DESCRIPTION_LENGTH} characters.` }];
  }
  return [];
}
