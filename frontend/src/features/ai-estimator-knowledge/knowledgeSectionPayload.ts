import type { KnowledgeJsonObject, KnowledgeSectionKey } from "./knowledgeTypes";

export type KnowledgeOverviewEditableField = "uomId" | "surfaceIds" | "priorityId";

/**
 * Rebases only locally edited Overview controls onto the latest server
 * payload. This prevents a conflict retry from overwriting hidden or untouched
 * values with the stale copy that was loaded before the conflict.
 */
export function knowledgeOverviewPayloadForUpdate(
  latestPayload: KnowledgeJsonObject,
  localPayload: KnowledgeJsonObject,
  editedFields: ReadonlySet<KnowledgeOverviewEditableField>
): KnowledgeJsonObject {
  const next = { ...latestPayload } as Record<string, KnowledgeJsonObject[string]>;

  for (const field of editedFields) {
    if (Object.prototype.hasOwnProperty.call(localPayload, field)) {
      next[field] = localPayload[field]!;
    } else {
      delete next[field];
    }
  }

  return next;
}

/**
 * Removes server-enriched pricing details before sending immutable references
 * back through the section update contract.
 */
export function knowledgeSectionPayloadForUpdate(
  sectionKey: KnowledgeSectionKey,
  payload: KnowledgeJsonObject
): KnowledgeJsonObject {
  if (sectionKey !== "pricing" || !Array.isArray(payload.priceEntries)) return payload;

  return {
    ...payload,
    priceEntries: payload.priceEntries.map((entry) => {
      if (
        entry === null ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        entry.operation !== "reference"
      ) {
        return entry;
      }

      return {
        operation: "reference",
        priceEntryId:
          typeof entry.priceEntryId === "string" ? entry.priceEntryId : "",
        priceVersionId:
          typeof entry.priceVersionId === "string" ? entry.priceVersionId : ""
      };
    })
  };
}
