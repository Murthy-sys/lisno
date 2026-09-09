import { BUDGET_ACTIONS } from "./knowledgeBudgetAlterations";
import {
  pairPendingRows,
  pendingObjectRows,
  pendingRowsReordered,
  pendingValuesEqual,
  type KnowledgePendingChangeEntry,
  type KnowledgePendingChangeField,
  type KnowledgePendingChangeGroup
} from "./knowledgePendingChanges";
import type {
  KnowledgeBasket,
  KnowledgeItemListItem,
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster,
  KnowledgeMasterType
} from "./knowledgeTypes";

export interface KnowledgeRecommendationPendingChangesInput {
  readonly baseline: KnowledgeJsonObject;
  readonly payload: KnowledgeJsonObject;
  readonly baskets: readonly KnowledgeBasket[];
  readonly items: readonly KnowledgeItemListItem[];
  readonly masters: Readonly<Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>>;
}

interface EditableField {
  readonly key: string;
  readonly label: string;
  readonly read: (row: KnowledgeJsonObject) => KnowledgeJsonValue;
  readonly display: (row: KnowledgeJsonObject) => string;
  readonly includeOnAdd?: (row: KnowledgeJsonObject) => boolean;
}

// These inputs render absent/null values as an empty string. Preserve entered
// whitespace and case; only the editor's own empty-value conventions normalize.
const text = (value: unknown): string => typeof value === "string" ? value : "";
const textField = (key: string, label: string): EditableField => ({
  key, label, read: (row) => text(row[key]), display: (row) => text(row[key])
});

const LEGACY_FIELDS = ["recommendations", "exclusions"] as const;
type LegacyField = typeof LEGACY_FIELDS[number];
interface LegacyTrackedRow {
  readonly actual: KnowledgeJsonObject;
  readonly identity: string;
}
interface RecommendationTrackerState {
  readonly rows: Readonly<Record<LegacyField, readonly LegacyTrackedRow[]>>;
  readonly nextIdentity: number;
}
const recommendationTracking = Symbol("recommendation-pending-change-tracking");

export interface KnowledgeRecommendationPendingChangesTracker {
  /** Presentation-only clones. Never pass these projections to a save request. */
  readonly projection: {
    readonly baseline: KnowledgeJsonObject;
    readonly payload: KnowledgeJsonObject;
  };
  readonly [recommendationTracking]: RecommendationTrackerState;
}

const persistedId = (row: KnowledgeJsonObject) => typeof row.id === "string" && row.id ? row.id : undefined;
function editableLegacyRow(field: LegacyField, row: KnowledgeJsonObject): KnowledgeJsonObject {
  return { name: text(row.name), reason: text(row.reason), ...(field === "recommendations" ? { priorityId: text(row.priorityId) } : {}) };
}

function advanceLegacyRows(field: LegacyField, actual: readonly KnowledgeJsonObject[], previous: readonly LegacyTrackedRow[], allocateIdentity: () => string): readonly LegacyTrackedRow[] {
  const used = new Set<number>();
  const matches = new Map<number, number>();
  const matchPass = (matchesRow: (old: KnowledgeJsonObject, next: KnowledgeJsonObject) => boolean) => {
    actual.forEach((row, nextIndex) => {
      if (matches.has(nextIndex)) return;
      const oldIndex = previous.findIndex((old, index) => !used.has(index) && matchesRow(old.actual, row));
      if (oldIndex >= 0) {
        used.add(oldIndex);
        matches.set(nextIndex, oldIndex);
      }
    });
  };
  matchPass((old, next) => Boolean(persistedId(next)) && persistedId(old) === persistedId(next));
  // Retain the exact untouched object before comparing equal-looking legacy
  // rows. Two identical names (or even identical rows) must not exchange their
  // presentation identities when only one of them is edited or removed.
  matchPass((old, next) => !persistedId(old) && !persistedId(next) && old === next);
  matchPass((old, next) => !persistedId(old) && !persistedId(next) && pendingValuesEqual(editableLegacyRow(field, old), editableLegacyRow(field, next)));
  const unmatchedBefore = previous.map((row, index) => ({ row, index })).filter(({ index }) => !used.has(index));
  const unmatchedAfter = actual.map((row, index) => ({ row, index })).filter(({ index }) => !matches.has(index));
  // Each editor onChange replaces one local row at a time. The only remaining
  // ID-less replacement is unambiguous after untouched rows have been retained.
  if (previous.length === actual.length && unmatchedBefore.length === 1 && unmatchedAfter.length === 1
    && !persistedId(unmatchedBefore[0]!.row.actual) && !persistedId(unmatchedAfter[0]!.row)) {
    matches.set(unmatchedAfter[0]!.index, unmatchedBefore[0]!.index);
  }
  return actual.map((row, index) => {
    const oldIndex = matches.get(index);
    return { actual: row, identity: oldIndex !== undefined ? previous[oldIndex]!.identity : persistedId(row) ? `saved:${persistedId(row)}` : allocateIdentity() };
  });
}

function advanceRecommendationTracking(payload: KnowledgeJsonObject, previous?: RecommendationTrackerState): RecommendationTrackerState {
  let nextIdentity = previous?.nextIdentity ?? 0;
  const allocateIdentity = () => `local:${nextIdentity++}`;
  return {
    rows: {
      recommendations: advanceLegacyRows("recommendations", pendingObjectRows(payload.recommendations), previous?.rows.recommendations ?? [], allocateIdentity),
      exclusions: advanceLegacyRows("exclusions", pendingObjectRows(payload.exclusions), previous?.rows.exclusions ?? [], allocateIdentity)
    },
    nextIdentity
  };
}

function trackedProjection(payload: KnowledgeJsonObject, tracking: RecommendationTrackerState): KnowledgeJsonObject {
  return {
    ...payload,
    ...Object.fromEntries(LEGACY_FIELDS.filter((field) => Array.isArray(payload[field])).map((field) => [field, tracking.rows[field].map((row) => ({ ...row.actual, id: row.identity }))]))
  };
}

/** Start a new preview baseline after load, confirmed save, or accepted discard. */
export function createRecommendationPendingChangesTracker(baselinePayload: KnowledgeJsonObject): KnowledgeRecommendationPendingChangesTracker {
  const tracking = advanceRecommendationTracking(baselinePayload);
  const baseline = trackedProjection(baselinePayload, tracking);
  return { projection: { baseline, payload: baseline }, [recommendationTracking]: tracking };
}

/** Advance on every editor onChange, using the real (unmodified) editor payload. */
export function advanceRecommendationPendingChangesTracker(tracker: KnowledgeRecommendationPendingChangesTracker, nextActualPayload: KnowledgeJsonObject): KnowledgeRecommendationPendingChangesTracker {
  const tracking = advanceRecommendationTracking(nextActualPayload, tracker[recommendationTracking]);
  return { projection: { baseline: tracker.projection.baseline, payload: trackedProjection(nextActualPayload, tracking) }, [recommendationTracking]: tracking };
}

/** Acknowledge only the submitted edits while retaining later session identities. */
export function acknowledgeRecommendationPendingChangesTracker(current: KnowledgeRecommendationPendingChangesTracker, submitted: KnowledgeRecommendationPendingChangesTracker): KnowledgeRecommendationPendingChangesTracker {
  return { projection: { baseline: submitted.projection.payload, payload: current.projection.payload }, [recommendationTracking]: current[recommendationTracking] };
}

function fieldsForChange(before: KnowledgeJsonObject | undefined, after: KnowledgeJsonObject, definitions: readonly EditableField[]): readonly KnowledgePendingChangeField[] {
  return definitions.flatMap((field) => {
    const value = field.read(after);
    if (before ? pendingValuesEqual(field.read(before), value) : field.includeOnAdd ? !field.includeOnAdd(after) : value === "") return [];
    const display = field.display(after);
    return [{ key: field.key, label: field.label, value: display, ...(value === "" ? { cleared: true } : {}) }];
  });
}

function projectRows(input: {
  readonly key: string;
  readonly label: string;
  readonly before: readonly KnowledgeJsonObject[];
  readonly after: readonly KnowledgeJsonObject[];
  readonly fields: readonly EditableField[];
  readonly title: (row: KnowledgeJsonObject, index: number) => string;
  readonly incomplete: (row: KnowledgeJsonObject) => boolean;
}): KnowledgePendingChangeGroup | undefined {
  // Legacy rows have no persistent identity. Match their editable projection,
  // so hidden metadata and the editor's own empty-value expansion do not
  // manufacture additions/removals. Restore original rows only by the matched
  // positions; never use presentation labels to join records.
  const comparable = (row: KnowledgeJsonObject): KnowledgeJsonObject => ({
    ...(typeof row.id === "string" && row.id ? { id: row.id } : {}),
    values: Object.fromEntries(input.fields.map((field) => [field.key, field.read(row)]))
  });
  const pairs = pairPendingRows(input.before.map(comparable), input.after.map(comparable)).map((pair) => ({
    ...pair,
    before: pair.beforeIndex !== undefined ? input.before[pair.beforeIndex] : undefined,
    after: pair.afterIndex !== undefined ? input.after[pair.afterIndex] : undefined
  }));
  const entries: KnowledgePendingChangeEntry[] = [];
  for (const pair of pairs) {
    if (!pair.after) {
      entries.push({ key: pair.key, title: input.title(pair.before!, pair.beforeIndex!), kind: "removed", fields: [] });
      continue;
    }
    const fields = fieldsForChange(pair.before, pair.after, input.fields);
    if (pair.before && !fields.length) continue;
    entries.push({ key: pair.key, title: input.title(pair.after, pair.afterIndex!), kind: pair.before ? "updated" : "added", fields,
      ...(input.incomplete(pair.after) ? { incomplete: true } : {}) });
  }
  if (pendingRowsReordered(pairs)) entries.push({ key: "order", title: `${input.label} order`, kind: "reordered", fields: [] });
  return entries.length ? { key: input.key, label: input.label, entries } : undefined;
}

/** A presentation-only projection of editable recommendation fields. */
export function projectRecommendationPendingChanges({ baseline, payload, baskets, items, masters }: KnowledgeRecommendationPendingChangesInput): readonly KnowledgePendingChangeGroup[] {
  const relatedItem = (row: KnowledgeJsonObject) => items.find((item) => item.mainLineId === text(row.targetMainLineId)
    && item.basketId === text(row.targetBasketId)
    && (row.targetType === "temporary" ? item.itemType === "temporary" : item.itemType !== "temporary")
    && (!text(row.targetSubBasketId) || item.subBasketId === row.targetSubBasketId));
  const budgetFields: readonly EditableField[] = [
    { key: "trigger", label: "Trigger", read: (row) => text(row.trigger), display: (row) => row.trigger === "added" ? "The item is added to scope" : row.trigger === "removed" ? "The item is removed from scope" : "" },
    { key: "scopeAction", label: "Scope action", read: (row) => [text(row.action), text(row.requirement)], display: (row) => BUDGET_ACTIONS.find((choice) => choice.action === row.action && choice.requirement === row.requirement)?.label ?? "Choose a scope action",
      includeOnAdd: (row) => Boolean(text(row.action) || text(row.requirement)) },
    { key: "targetType", label: "Item type", read: (row) => text(row.targetType), display: (row) => row.targetType === "temporary" ? "Temporary item" : row.targetType === "catalog" ? "Catalog item" : "" },
    { key: "targetBasketId", label: "Main Basket", read: (row) => text(row.targetBasketId), display: (row) => !text(row.targetBasketId) ? "" : baskets.find((basket) => basket.id === row.targetBasketId)?.name ?? "Selected Main Basket — details unavailable" },
    { key: "targetSubBasketId", label: "Sub Basket", read: (row) => text(row.targetSubBasketId), display: (row) => !text(row.targetSubBasketId) ? "" : relatedItem(row)?.subBasketName
      ?? items.find((item) => item.basketId === row.targetBasketId && item.subBasketId === row.targetSubBasketId)?.subBasketName
      ?? "Selected Sub Basket — details unavailable" },
    { key: "targetMainLineId", label: "Related item", read: (row) => text(row.targetMainLineId), display: (row) => !text(row.targetMainLineId) ? "" : relatedItem(row)?.mainLineName ?? "Selected related item — details unavailable" },
    textField("reason", "Reason"),
    { key: "active", label: "Enabled", read: (row) => row.active === true, display: (row) => row.active === true ? "Yes" : "No", includeOnAdd: (row) => row.active === false }
  ];
  const priority: EditableField = { key: "priorityId", label: "Priority", read: (row) => text(row.priorityId), display: (row) => !text(row.priorityId) ? "" : masters.priorities?.find((master) => master.id === row.priorityId)?.name ?? "Selected priority — details unavailable" };
  const groups = [
    projectRows({ key: "budgetAlterations", label: "Budget Alterations", before: pendingObjectRows(baseline.budgetAlterations), after: pendingObjectRows(payload.budgetAlterations), fields: budgetFields,
      title: (_row, index) => `Rule ${index + 1}`,
      incomplete: (row) => !["added", "removed"].includes(text(row.trigger)) || !BUDGET_ACTIONS.some((choice) => choice.action === row.action && choice.requirement === row.requirement)
        || !["catalog", "temporary"].includes(text(row.targetType)) || !text(row.targetBasketId).trim() || !text(row.targetMainLineId)
        || !text(row.reason).trim() || text(row.reason).length > 4000 || typeof row.active !== "boolean" }),
    projectRows({ key: "recommendations", label: "Recommendations", before: pendingObjectRows(baseline.recommendations), after: pendingObjectRows(payload.recommendations),
      fields: [textField("name", "Recommendation"), priority, textField("reason", "Reason")],
      title: (row, index) => text(row.name) || `Recommendation ${index + 1}`, incomplete: (row) => !text(row.name).trim() || !text(row.priorityId).trim() }),
    projectRows({ key: "exclusions", label: "Exclusions", before: pendingObjectRows(baseline.exclusions), after: pendingObjectRows(payload.exclusions),
      fields: [textField("name", "Exclusion"), textField("reason", "Reason")],
      title: (row, index) => text(row.name) || `Exclusion ${index + 1}`, incomplete: (row) => !text(row.name).trim() })
  ];
  return groups.filter((group): group is KnowledgePendingChangeGroup => group !== undefined);
}
