export * from "../../../../shared/knowledge/knowledgeModeConfiguration";

import { parseKnowledgeModeConfigurations } from "../../../../shared/knowledge/knowledgeModeConfiguration";
import type { KnowledgeJsonObject, KnowledgeJsonValue, KnowledgeMaster } from "./knowledgeTypes";

function obsoleteInHouseScope(value: KnowledgeJsonValue): value is KnowledgeJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (value as KnowledgeJsonObject).modeKind === "execution" && (value as KnowledgeJsonObject).executionSource === "in_house";
}

/** Validate the retained records in place, leaving their old checklists inert once components own scope. */
export function currentModeConfigurationIssues(payload: KnowledgeJsonObject, modes: readonly KnowledgeMaster[] = []) {
  const value = payload.modeConfigurations;
  if (!Object.hasOwn(payload, "inHouseComponents") || !Array.isArray(value)) return parseKnowledgeModeConfigurations(value, modes).issues;
  const validationValue = value.map((row) => {
    if (!obsoleteInHouseScope(row)) return row;
    const { inclusions: _inclusions, exclusions: _exclusions, ...record } = row;
    return record;
  });
  return parseKnowledgeModeConfigurations(validationValue, modes).issues;
}

/** Editing another Mode must not normalize or erase the preserved obsolete checklist values. */
export function retainObsoleteInHouseScope(previous: KnowledgeJsonObject, next: KnowledgeJsonObject): KnowledgeJsonObject {
  if (!Object.hasOwn(previous, "inHouseComponents") || !Array.isArray(previous.modeConfigurations) || !Array.isArray(next.modeConfigurations)) return next;
  const records = previous.modeConfigurations;
  return { ...next, modeConfigurations: next.modeConfigurations.map((row) => {
    if (!obsoleteInHouseScope(row)) return row;
    const original = records.find((record) => obsoleteInHouseScope(record) && record.id === row.id);
    if (!original || !obsoleteInHouseScope(original)) return row;
    return { ...row, ...(Object.hasOwn(original, "inclusions") ? { inclusions: original.inclusions! } : {}),
      ...(Object.hasOwn(original, "exclusions") ? { exclusions: original.exclusions! } : {}) };
  }) };
}
