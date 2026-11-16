/** Pure paragraph formatting shared by Configuration and catalogue readers. */
export interface ModeDescriptionScope {
  readonly inclusions?: readonly { readonly id?: string; readonly name: string; readonly selected: boolean }[];
  readonly exclusions?: readonly { readonly id?: string; readonly name: string; readonly selected: boolean }[];
}

const PMC_SCOPE_LISTS = ["inclusions", "exclusions"] as const;
type ModeDescriptionScopeList = (typeof PMC_SCOPE_LISTS)[number];

export const MAX_MODE_DESCRIPTION_LENGTH = 4_000;

export function generateModeDescription(
  mainLineName: string,
  pmc: ModeDescriptionScope | undefined,
  inHouse?: ModeDescriptionScope
) {
  const selectedNames = (list: "inclusions" | "exclusions") =>
    pmc?.[list]?.filter((item) => item.selected).map((item) => item.name).join(", ") || "none";
  const base = `Providing, Supplying, Fixing, testing and commissioning of ${mainLineName}, inclusions ${selectedNames("inclusions")} and exclusions ${selectedNames("exclusions")}.`;
  const inHouseClauses = PMC_SCOPE_LISTS.flatMap((list) => {
    const names = selectedScopeNames(inHouse, list);
    return names.length ? [`In-house ${list}: ${names.join(", ")}.`] : [];
  });
  return [base, ...inHouseClauses].join(" ");
}

/** Checklist values belong to their labelled list; other paragraph wording stays editable. */
export function syncModeDescription(
  text: string,
  pmc: ModeDescriptionScope | undefined,
  previousPmc?: ModeDescriptionScope,
  inHouse?: ModeDescriptionScope,
  previousInHouse?: ModeDescriptionScope
): string {
  // Clearing a description is intentional, even when scope checklists are selected.
  if (!text.trim()) return text;
  const labels = [...text.matchAll(/\b(?:(In-house)\s+)?(inclusions|exclusions)\b/giu)];
  const seen = new Set<string>();
  let result = text.slice(0, labels[0]?.index ?? text.length);
  for (const [index, match] of labels.entries()) {
    const source = match[1] ? "in_house" : "pmc";
    const list = match[2]!.toLowerCase() as ModeDescriptionScopeList;
    const key = `${source}:${list}`;
    const content = text.slice(match.index! + match[0].length, labels[index + 1]?.index ?? text.length);
    if (seen.has(key)) {
      result += match[0] + content;
      continue;
    }
    seen.add(key);
    const clause = source === "pmc"
      ? syncScopeClause(content, list, pmc, previousPmc)
      : syncScopeClause(content, list, inHouse, previousInHouse);
    result += match[0] + clause;
    if (labels[index + 1] && !/\s$/u.test(clause)) result += content.includes("\n") ? "\n" : " ";
  }
  for (const [source, configuration] of [["pmc", pmc], ["in_house", inHouse]] as const) {
    for (const list of PMC_SCOPE_LISTS) {
      const names = selectedScopeNames(configuration, list);
      if (seen.has(`${source}:${list}`) || !names.length) continue;
      result = result.trimEnd();
      if (result) result += /[.!?]$/u.test(result) ? " " : ". ";
      const label = `${source === "in_house" ? "In-house " : ""}${list === "inclusions" ? "Inclusions" : "Exclusions"}`;
      result += `${label}: ${names.join(", ")}.`;
    }
  }
  return result;
}

function selectedScopeNames(pmc: ModeDescriptionScope | undefined, list: ModeDescriptionScopeList) {
  return pmc?.[list]?.filter((item) => item.selected).map((item) => item.name) ?? [];
}

function syncScopeClause(
  content: string,
  list: ModeDescriptionScopeList,
  pmc: ModeDescriptionScope | undefined,
  previousPmc: ModeDescriptionScope | undefined
) {
  const prefix = content.match(/^\s*:?\s*/u)![0];
  let remaining = content.slice(prefix.length);
  // Removed entries still need recognition to clear their values from an existing paragraph.
  const knownNames = [
    ...(pmc?.[list] ?? []).map((item) => item.name),
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

