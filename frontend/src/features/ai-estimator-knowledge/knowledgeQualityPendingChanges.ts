import {
  pairPendingRows, pendingRowsReordered, pendingValuesEqual,
  type KnowledgePendingChangeEntry, type KnowledgePendingChangeField, type KnowledgePendingChangesSnapshot
} from "./knowledgePendingChanges";
import { QUALITY_PARAMETER_TYPES } from "./knowledgeQuality";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

const answerTypes: Readonly<Record<string, string>> = {
  boolean: "Yes / No", text: "Text", number: "Number", dropdown: "Single choice",
  multi_select: "Multiple choice", radio: "Single choice (radio)", checkbox: "Checkbox"
};
const fields = [
  ["label", "Question / check"], ["type", "Answer type"], ["allowedValues", "Answer options"],
  ["acceptanceCriteria", "Acceptance criteria"], ["photos", "Photo evidence"], ["photoCount", "Required photos"]
] as const;
const text = (value: unknown) => typeof value === "string" ? value : "";

/** Only current editable values participate; legacy metadata and fixed flags do not. */
function editableRow(row: KnowledgeJsonObject): KnowledgeJsonObject {
  const evidence = row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence) ? row.evidence as KnowledgeJsonObject : {};
  const photos = evidence.photos === true;
  return {
    ...(typeof row.id === "string" && row.id ? { id: row.id } : {}),
    label: text(row.label), type: text(row.type),
    allowedValues: Array.isArray(row.allowedValues) ? row.allowedValues : [],
    acceptanceCriteria: text(row.acceptanceCriteria), photos,
    photoCount: photos ? evidence.minPhotosPerSample ?? null : null
  };
}

export interface QualityPendingRowState {
  readonly rows: readonly { readonly value: KnowledgeJsonObject; readonly identity: string }[];
  readonly nextIdentity: number;
}

/** Preview identities follow unambiguous local edits without entering the saved payload. */
export function qualityPendingRowState(parameters: readonly KnowledgeJsonObject[], previous?: QualityPendingRowState): QualityPendingRowState {
  const values = parameters.map(editableRow);
  if (previous && previous.rows.length === values.length) {
    const changed = values.flatMap((value, index) => pendingValuesEqual(value, previous.rows[index]!.value) ? [] : [index]);
    // The editor changes one row at a time. Resolve that known position before
    // equal-content pairing, which could swap identical legacy rows after the
    // mandatory-flag normalizer clones every object. Distinct-row moves change
    // more than one position and continue through the reorder matcher below.
    if (changed.length === 1 && !values[changed[0]!]!.id && !previous.rows[changed[0]!]!.value.id) {
      return { rows: values.map((value, index) => ({ value, identity: previous.rows[index]!.identity })), nextIdentity: previous.nextIdentity };
    }
  }
  const pairs = pairPendingRows(previous?.rows.map(row => row.value) ?? [], values);
  let nextIdentity = previous?.nextIdentity ?? 0;
  return {
    rows: pairs.filter(pair => pair.after).map(pair => ({
      value: pair.after!,
      identity: pair.beforeIndex !== undefined && previous ? previous.rows[pair.beforeIndex]!.identity
        : typeof pair.after!.id === "string" ? `saved:${pair.after!.id}` : `local:${nextIdentity++}`
    })),
    nextIdentity
  };
}

function displayRow(row: KnowledgeJsonObject, baseline?: KnowledgeJsonObject): string {
  return text(row.label) || text(baseline?.label) || "New quality check";
}
function incomplete(row: KnowledgeJsonObject): boolean {
  if (!text(row.label).trim() || !QUALITY_PARAMETER_TYPES.includes(row.type as typeof QUALITY_PARAMETER_TYPES[number])) return true;
  if (["dropdown", "radio", "multi_select"].includes(text(row.type))) {
    const options = row.allowedValues as readonly unknown[];
    if (!options.length || options.some(option => typeof option !== "string" || !option.trim())) return true;
  }
  return row.photos === true && (typeof row.photoCount !== "number" || !Number.isInteger(row.photoCount) || row.photoCount < 1 || row.photoCount > 100);
}
function displayField(key: typeof fields[number][0], value: unknown): string {
  if (key === "type") return answerTypes[text(value)] ?? text(value);
  if (key === "photos") return value ? "Required" : "Not required";
  if (Array.isArray(value)) return value.map(text).join(", ");
  return value === null || value === undefined ? "" : String(value);
}

export function qualityPendingChanges({ sourceKey, basketId, basketName, baseline, parameters, baselineRows, parameterRows }: {
  readonly sourceKey: string;
  readonly basketId: string;
  readonly basketName: string;
  readonly baseline: readonly KnowledgeJsonObject[];
  readonly parameters: readonly KnowledgeJsonObject[];
  readonly baselineRows?: QualityPendingRowState;
  readonly parameterRows?: QualityPendingRowState;
}): KnowledgePendingChangesSnapshot {
  const before = baselineRows ? baselineRows.rows.map(row => ({ ...row.value, id: row.identity })) : baseline.map(editableRow);
  const after = parameterRows ? parameterRows.rows.map(row => ({ ...row.value, id: row.identity })) : parameters.map(editableRow);
  const pairs = pairPendingRows(before, after);
  const entries: KnowledgePendingChangeEntry[] = [];
  for (const pair of pairs) {
    if (!pair.after) {
      entries.push({ key: pair.key, title: displayRow(pair.before!), kind: "removed", fields: [] });
      continue;
    }
    const changedFields: KnowledgePendingChangeField[] = [];
    for (const [key, label] of fields) {
      const value = pair.after[key];
      if (pair.before && pendingValuesEqual(pair.before[key], value)) continue;
      // A new check needs entered content only, without unchecked/default scaffolding.
      if (!pair.before && (value === "" || value === null || value === false || Array.isArray(value) && !value.length)) continue;
      const formatted = displayField(key, value);
      changedFields.push({ key, label, value: formatted, ...(!formatted ? { cleared: true } : {}) });
    }
    if (!pair.before || changedFields.length) entries.push({ key: pair.key, title: displayRow(pair.after, pair.before), kind: pair.before ? "updated" : "added", fields: changedFields, incomplete: incomplete(pair.after) });
  }
  if (pendingRowsReordered(pairs)) entries.push({ key: "check-order", title: "Checklist order", kind: "reordered", fields: [] });
  return { sourceKey, groups: entries.length ? [{ key: `quality:${basketId}`, label: `Shared checklist · ${basketName}`, entries }] : [] };
}
