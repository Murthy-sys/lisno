/** Pure label rules shared by the catalog reader and Configuration editor. */
export const SPECIFICATION_ITEM_NAME_MAX_LENGTH = 240;

export interface SpecificationItemName {
  readonly name: string;
}

export function normalizeSpecificationItemName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function sanitizeSpecificationItemName(value: unknown): string | null {
  if (typeof value !== "string" || value.length > SPECIFICATION_ITEM_NAME_MAX_LENGTH) return null;
  const name = value.trim().replace(/\s+/gu, " ");
  return name && normalizeSpecificationItemName(name) ? name : null;
}

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

/** Stable spelling independent of database order; this never rewrites source rows. */
export function collectSpecificationItemNames(values: readonly unknown[]): SpecificationItemName[] {
  const names = new Map<string, string>();
  for (const value of values) {
    const name = sanitizeSpecificationItemName(value);
    if (!name) continue;
    const key = normalizeSpecificationItemName(name);
    const previous = names.get(key);
    if (previous === undefined || compare(name, previous) < 0) names.set(key, name);
  }
  return [...names].sort(([left], [right]) => compare(left, right)).map(([, name]) => ({ name }));
}

function boundedDistance(left: string[], right: string[], limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = new Array<number>(right.length + 1).fill(limit + 1);
    current[0] = row;
    const first = Math.max(1, row - limit);
    const last = Math.min(right.length, row + limit);
    let minimum = current[0];
    for (let column = first; column <= last; column += 1) {
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
      minimum = Math.min(minimum, current[column]);
    }
    if (minimum > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

export function matchSpecificationItemNames(
  items: readonly SpecificationItemName[],
  candidate: string
): { exactMatch: SpecificationItemName | null; similarItems: SpecificationItemName[] } {
  const key = normalizeSpecificationItemName(candidate);
  const letters = [...key];
  const limit = letters.length < 4 ? 0 : letters.length < 8 ? 1 : 2;
  let exactMatch: SpecificationItemName | null = null;
  const similar: Array<{ item: SpecificationItemName; key: string; distance: number }> = [];
  for (const item of items) {
    const itemKey = normalizeSpecificationItemName(item.name);
    if (itemKey === key) { exactMatch = item; continue; }
    if (!limit) continue;
    const distance = boundedDistance(letters, [...itemKey], limit);
    if (distance <= limit) similar.push({ item, key: itemKey, distance });
  }
  similar.sort((left, right) => left.distance - right.distance || compare(left.key, right.key));
  return { exactMatch, similarItems: similar.slice(0, 5).map(({ item }) => item) };
}
