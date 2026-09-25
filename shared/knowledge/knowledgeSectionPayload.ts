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
 * Keeps immutable references exact and serializes Budget drafts through the
 * business-only command. Server-owned identity, Tax mapping, lifecycle, Mode,
 * and calculated amounts must never cross this client boundary.
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
        Array.isArray(entry)
      ) {
        return entry;
      }

      if (entry.operation === "set_budget") {
        const command: Record<string, KnowledgeJsonObject[string]> = {
          operation: "set_budget"
        };
        if (typeof entry.sourcePriceVersionId === "string" && entry.sourcePriceVersionId.trim()) {
          command.sourcePriceVersionId = entry.sourcePriceVersionId;
        }
        for (const key of ["vendorId", "uomId", "effectiveFrom"] as const) {
          if (typeof entry[key] === "string") command[key] = entry[key];
        }
        if (typeof entry.inputAmountPaise === "number") {
          command.inputAmountPaise = entry.inputAmountPaise;
        }
        command.effectiveTo = typeof entry.effectiveTo === "string"
          ? entry.effectiveTo
          : null;
        return command;
      }

      if (entry.operation !== "reference") return entry;

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
