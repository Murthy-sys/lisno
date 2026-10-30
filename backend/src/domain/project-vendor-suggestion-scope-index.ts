import mongoose, { type ClientSession, type mongo } from "mongoose";
import type { PMWriteAvailability } from "../contracts/project-manager-estimates.js";
import { ApiError } from "../middleware/errors.js";

export const VENDOR_SUGGESTION_COLLECTION = "projectVendorSuggestions";
export const VENDOR_SUGGESTION_OLD_INDEX_NAME = "project_vendor_suggestion_source_unique";
export const VENDOR_SUGGESTION_PROJECT_INDEX_NAME = "project_vendor_suggestion_project_source_unique_v2";
export const VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME = "project_vendor_suggestion_main_line_source_unique_v2";
export const VENDOR_SUGGESTION_REQUEST_INDEX_NAME = "project_vendor_suggestion_request_unique";
export const VENDOR_SUGGESTION_PROJECT_INDEX_KEY = {
  projectId: 1, estimateId: 1, estimateVersion: 1, designPlanVersion: 1, vendorId: 1
} as const;
export const VENDOR_SUGGESTION_OLD_INDEX_KEY = VENDOR_SUGGESTION_PROJECT_INDEX_KEY;
export const VENDOR_SUGGESTION_MAIN_LINE_INDEX_KEY = {
  projectId: 1, estimateId: 1, estimateVersion: 1, estimateReviewRoundId: 1,
  designPlanVersion: 1, mainLineId: 1, vendorId: 1
} as const;
export const VENDOR_SUGGESTION_REQUEST_INDEX_KEY = { createdById: 1, idempotencyKey: 1 } as const;
export const VENDOR_SUGGESTION_PROJECT_INDEX_FILTER = { mainLineId: null } as const;
export const VENDOR_SUGGESTION_MAIN_LINE_INDEX_FILTER = { mainLineId: { $type: "string" } } as const;

type Index = mongo.IndexDescriptionInfo;
type IndexDefinition = { name: string; key: Record<string, number>; filter?: Record<string, unknown> };
export const VENDOR_SUGGESTION_INDEX_DEFINITIONS: readonly IndexDefinition[] = [
  { name: VENDOR_SUGGESTION_OLD_INDEX_NAME, key: VENDOR_SUGGESTION_OLD_INDEX_KEY },
  { name: VENDOR_SUGGESTION_PROJECT_INDEX_NAME, key: VENDOR_SUGGESTION_PROJECT_INDEX_KEY, filter: VENDOR_SUGGESTION_PROJECT_INDEX_FILTER },
  { name: VENDOR_SUGGESTION_MAIN_LINE_INDEX_NAME, key: VENDOR_SUGGESTION_MAIN_LINE_INDEX_KEY, filter: VENDOR_SUGGESTION_MAIN_LINE_INDEX_FILTER },
  { name: VENDOR_SUGGESTION_REQUEST_INDEX_NAME, key: VENDOR_SUGGESTION_REQUEST_INDEX_KEY }
];

function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
}

export function matchesVendorSuggestionIndex(index: Index, definition: IndexDefinition): boolean {
  // Compound-key ordering matters; partial-filter object ordering does not.
  return JSON.stringify(index.key) === JSON.stringify(definition.key) && index.unique === true &&
    canonical(index.partialFilterExpression) === canonical(definition.filter) &&
    !index.sparse && !index.collation && !index.hidden && index.expireAfterSeconds === undefined &&
    index.prepareUnique !== true;
}

export function vendorSuggestionIndexConflicts(indexes: Index[]): string[] {
  const conflicts: string[] = [];
  for (const index of indexes) {
    if (index.name === "_id_") continue;
    const definition = VENDOR_SUGGESTION_INDEX_DEFINITIONS.find(({ name }) => name === index.name);
    if (definition && !matchesVendorSuggestionIndex(index, definition)) conflicts.push(`Unexpected definition for ${definition.name}`);
    else if (!definition && (index.unique || index.prepareUnique === true)) conflicts.push(`Unknown unique index ${index.name}`);
  }
  return conflicts;
}

export function vendorSuggestionIndexesReady(indexes: Index[]): boolean {
  return !vendorSuggestionIndexConflicts(indexes).length &&
    !indexes.some(({ name }) => name === VENDOR_SUGGESTION_OLD_INDEX_NAME) &&
    VENDOR_SUGGESTION_INDEX_DEFINITIONS.filter(({ name }) => name !== VENDOR_SUGGESTION_OLD_INDEX_NAME)
      .every(definition => indexes.some(index => index.name === definition.name && matchesVendorSuggestionIndex(index, definition)));
}

export function isMissingVendorSuggestionCollection(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === 26;
}

const unavailableReason = "Main Line suggestions are unavailable until database preparation is verified. Contact an administrator.";

/** Native metadata read only. Index commands cannot join a multi-document transaction. */
export async function readVendorSuggestionWriteAvailability(_session?: ClientSession): Promise<PMWriteAvailability> {
  if (!mongoose.connection.db) return { available: false, reason: unavailableReason };
  try {
    // Do not use Model.init/syncIndexes or cache a successful check across writes.
    // Operational cutover must quiesce writers; indexes themselves are not snapshot data.
    const indexes = await mongoose.connection.db.collection(VENDOR_SUGGESTION_COLLECTION).listIndexes().toArray();
    return vendorSuggestionIndexesReady(indexes)
      ? { available: true, reason: null }
      : { available: false, reason: unavailableReason };
  } catch {
    // Missing collection, insufficient metadata privileges and database outages all fail closed.
    return { available: false, reason: unavailableReason };
  }
}

export async function assertVendorSuggestionIndexesReady(session?: ClientSession): Promise<void> {
  const availability = await readVendorSuggestionWriteAvailability(session);
  if (!availability.available) throw new ApiError(503, "PM_VENDOR_SUGGESTION_INDEXES_UNAVAILABLE", availability.reason!);
}
