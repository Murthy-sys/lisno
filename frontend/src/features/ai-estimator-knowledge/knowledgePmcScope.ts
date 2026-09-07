import type { KnowledgeJsonValue } from "./knowledgeTypes";

export interface KnowledgePmcScopeItem {
  readonly id: string;
  readonly name: string;
  readonly selected: boolean;
}

export const PMC_SCOPE_LISTS = ["inclusions", "exclusions"] as const;
export type KnowledgePmcScopeList = (typeof PMC_SCOPE_LISTS)[number];
export const MAX_PMC_SCOPE_ITEMS = 200;

const DEFAULT_SCOPE_ITEMS = [
  ["transport", "Transport"],
  ["shifting", "Shifting"],
  ["unloading", "Unloading"],
  ["esic-pf", "ESIC/ PF"],
  ["mathadi", "Mathadi"],
  ["damage-during", "Damage during"]
] as const;

let fallbackIdSequence = 0;

export function createPmcScopeItem(list: KnowledgePmcScopeList, name: string): KnowledgePmcScopeItem {
  const uniqueId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${++fallbackIdSequence}`;
  return { id: `pmc-${list}-${uniqueId}`, name: name.trim(), selected: false };
}

export function defaultPmcScopeItems(list: KnowledgePmcScopeList): readonly KnowledgePmcScopeItem[] {
  return DEFAULT_SCOPE_ITEMS.map(([key, name]) => ({ id: `pmc-${list}-${key}`, name, selected: false }));
}

export function normalizePmcScopeName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function parsePmcScopeItems(value: KnowledgeJsonValue, path: string) {
  const items: KnowledgePmcScopeItem[] = [];
  const issues: { path: string; message: string }[] = [];
  if (!Array.isArray(value)) return { items, issues: [{ path, message: "Inclusions and Exclusions must be lists." }] };
  if (value.length > MAX_PMC_SCOPE_ITEMS) issues.push({ path, message: `Each list supports at most ${MAX_PMC_SCOPE_ITEMS} items.` });
  const ids = new Set<string>();
  const names = new Set<string>();
  value.forEach((row, index) => {
    const rowPath = `${path}.${index}`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      issues.push({ path: rowPath, message: "Each Inclusion or Exclusion must be an item." });
      return;
    }
    for (const key of Object.keys(row)) {
      if (!["id", "name", "selected"].includes(key)) issues.push({ path: `${rowPath}.${key}`, message: "Unknown Inclusion or Exclusion property." });
    }
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.name === "string" ? row.name : "";
    if (!id.trim() || id !== id.trim() || id.length > 240) issues.push({ path: `${rowPath}.id`, message: "A valid item ID is required." });
    if (!name.trim() || name.length > 240) issues.push({ path: `${rowPath}.name`, message: "Enter an item name of up to 240 characters." });
    if (typeof row.selected !== "boolean") issues.push({ path: `${rowPath}.selected`, message: "An item must be checked or unchecked." });
    if (ids.has(id)) issues.push({ path: `${rowPath}.id`, message: "Item IDs must be unique within each list." });
    const normalizedName = normalizePmcScopeName(name);
    if (names.has(normalizedName)) issues.push({ path: `${rowPath}.name`, message: "Item names must be unique within each list." });
    ids.add(id);
    names.add(normalizedName);
    items.push({ id, name, selected: row.selected === true });
  });
  return { items, issues };
}
