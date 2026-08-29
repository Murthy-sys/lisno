import type { ClientSession, Model } from "mongoose";

import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../models/AiEstimatorKnowledgeDisplayOrderSequence.js";

export const AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE =
  "baskets" as const;

export const AI_ESTIMATOR_KNOWLEDGE_DISPLAY_ORDER_MASTER_TYPES = [
  "uoms",
  "vendors",
  "taxes",
  "priorities",
  "surfaces",
  "modes"
] as const;

export type AiEstimatorKnowledgeDisplayOrderMasterType =
  (typeof AI_ESTIMATOR_KNOWLEDGE_DISPLAY_ORDER_MASTER_TYPES)[number];

export type AiEstimatorKnowledgeDisplayOrderScope =
  | typeof AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE
  | `main-lines:${string}`
  | `masters:${AiEstimatorKnowledgeDisplayOrderMasterType}`;

type DisplayOrderResourceModel = Model<any>;
type DisplayOrderResourceFilter = Readonly<Record<string, unknown>>;

export interface AiEstimatorKnowledgeDisplayOrderTarget {
  readonly scope: AiEstimatorKnowledgeDisplayOrderScope;
  readonly resourceModel: DisplayOrderResourceModel;
  /**
   * The complete ordering-scope filter. It must not constrain lifecycle status:
   * baskets and master families use {}, while Main Lines use { basketId }.
   */
  readonly resourceFilter: DisplayOrderResourceFilter;
  readonly session: ClientSession;
}

export interface ObserveExplicitAiEstimatorKnowledgeDisplayOrderInput
  extends AiEstimatorKnowledgeDisplayOrderTarget {
  readonly displayOrder: number;
}

interface ParsedDisplayOrderScope {
  readonly kind: "baskets" | "main-lines" | "masters";
  readonly value: string | null;
}

interface DisplayOrderRow {
  readonly displayOrder?: unknown;
}

interface DisplayOrderSequenceRow {
  readonly highWaterOrder?: unknown;
}

/**
 * Creates the stable sequence scope for Main Lines belonging to one Basket.
 */
export function createAiEstimatorKnowledgeMainLineDisplayOrderScope(
  basketId: string
): `main-lines:${string}` {
  const normalizedBasketId = requireScopeValue(basketId, "Basket ID");
  return `main-lines:${normalizedBasketId}`;
}

/**
 * Creates the stable sequence scope for one reusable-value family.
 */
export function createAiEstimatorKnowledgeMasterDisplayOrderScope(
  masterType: AiEstimatorKnowledgeDisplayOrderMasterType
): `masters:${AiEstimatorKnowledgeDisplayOrderMasterType}` {
  if (!isDisplayOrderMasterType(masterType)) {
    throw new TypeError("Knowledge master type is not a valid display-order scope.");
  }
  return `masters:${masterType}`;
}

/**
 * Allocates the next append-only order in the caller's active Mongo transaction.
 *
 * The first allocation observes the persisted resource maximum across every
 * lifecycle status. An empty scope starts at 0. The sequence write is the common
 * transactional conflict point that makes a retried concurrent allocation move
 * on to the following value.
 */
export async function allocateAiEstimatorKnowledgeDisplayOrder(
  target: AiEstimatorKnowledgeDisplayOrderTarget
): Promise<number> {
  const parsedScope = validateTarget(target);
  const persistedMaximum = await findPersistedMaximum(target);
  const sequenceHighWater = await findSequenceHighWater(target.scope, target.session);
  const highWater = Math.max(persistedMaximum ?? -1, sequenceHighWater ?? -1);

  if (highWater === Number.MAX_SAFE_INTEGER) {
    throw displayOrderExhausted();
  }

  const sequence = await updateSequenceHighWater({
    scope: target.scope,
    observedMaximum: persistedMaximum ?? -1,
    mode: "allocate",
    session: target.session
  });
  const allocatedOrder = requireStoredDisplayOrder(
    sequence.highWaterOrder,
    "Knowledge display-order sequence"
  );

  // The pre-read is an exhaustion guard. Within an active transaction the
  // pipeline must produce exactly one greater than that transaction's snapshot;
  // a concurrent writer causes the surrounding transaction callback to retry.
  if (allocatedOrder !== highWater + 1) {
    throw new Error(
      `Knowledge display-order allocation was inconsistent for ${parsedScope.kind}.`
    );
  }
  return allocatedOrder;
}

/**
 * Observes a backward-compatible explicit order without ever lowering a scope's
 * high-water mark. The write remains inside the resource transaction so explicit
 * and automatic same-scope creates share the same conflict point.
 */
export async function observeExplicitAiEstimatorKnowledgeDisplayOrder(
  input: ObserveExplicitAiEstimatorKnowledgeDisplayOrderInput
): Promise<void> {
  validateTarget(input);
  requireDisplayOrder(input.displayOrder, "Explicit display order");
  const persistedMaximum = await findPersistedMaximum(input);
  const sequence = await updateSequenceHighWater({
    scope: input.scope,
    observedMaximum: Math.max(persistedMaximum ?? -1, input.displayOrder),
    mode: "observe",
    session: input.session
  });
  requireStoredDisplayOrder(
    sequence.highWaterOrder,
    "Knowledge display-order sequence"
  );
}

function validateTarget(
  target: AiEstimatorKnowledgeDisplayOrderTarget
): ParsedDisplayOrderScope {
  requireTransactionalSession(target.session);
  const parsedScope = parseDisplayOrderScope(target.scope);
  validateResourceFilter(parsedScope, target.resourceFilter);
  if (!target.resourceModel || typeof target.resourceModel.findOne !== "function") {
    throw new TypeError("A resource model is required for display-order allocation.");
  }
  return parsedScope;
}

function parseDisplayOrderScope(scope: string): ParsedDisplayOrderScope {
  if (scope === AI_ESTIMATOR_KNOWLEDGE_BASKET_DISPLAY_ORDER_SCOPE) {
    return { kind: "baskets", value: null };
  }
  if (scope.startsWith("main-lines:")) {
    const basketId = scope.slice("main-lines:".length);
    requireScopeValue(basketId, "Basket ID");
    return { kind: "main-lines", value: basketId };
  }
  if (scope.startsWith("masters:")) {
    const masterType = scope.slice("masters:".length);
    if (!isDisplayOrderMasterType(masterType)) {
      throw new TypeError("Knowledge master display-order scope is invalid.");
    }
    return { kind: "masters", value: masterType };
  }
  throw new TypeError("Knowledge display-order scope is invalid.");
}

function validateResourceFilter(
  scope: ParsedDisplayOrderScope,
  resourceFilter: DisplayOrderResourceFilter
): void {
  if (!isPlainObject(resourceFilter)) {
    throw new TypeError("Display-order resource filter must be a plain object.");
  }
  const keys = Object.keys(resourceFilter);
  if (scope.kind === "main-lines") {
    if (
      keys.length !== 1 ||
      keys[0] !== "basketId" ||
      resourceFilter.basketId !== scope.value
    ) {
      throw new TypeError(
        "Main Line display-order filters must contain only the scope Basket ID."
      );
    }
    return;
  }
  if (keys.length !== 0) {
    throw new TypeError(
      "Basket and master display-order filters must include every lifecycle status."
    );
  }
}

async function findPersistedMaximum(
  target: AiEstimatorKnowledgeDisplayOrderTarget
): Promise<number | null> {
  const row = (await target.resourceModel
    .findOne(target.resourceFilter)
    .sort({ displayOrder: -1, _id: 1 })
    .select({ displayOrder: 1, _id: 0 })
    .session(target.session)
    .lean()
    .exec()) as DisplayOrderRow | null;

  if (!row) return null;
  return requireStoredDisplayOrder(row.displayOrder, "Persisted display order");
}

async function findSequenceHighWater(
  scope: AiEstimatorKnowledgeDisplayOrderScope,
  session: ClientSession
): Promise<number | null> {
  const row = (await AiEstimatorKnowledgeDisplayOrderSequenceModel.findById(scope)
    .select({ highWaterOrder: 1, _id: 0 })
    .session(session)
    .lean()
    .exec()) as DisplayOrderSequenceRow | null;
  if (!row) return null;
  return requireStoredDisplayOrder(
    row.highWaterOrder,
    "Knowledge display-order sequence"
  );
}

async function updateSequenceHighWater(input: {
  readonly scope: AiEstimatorKnowledgeDisplayOrderScope;
  readonly observedMaximum: number;
  readonly mode: "allocate" | "observe";
  readonly session: ClientSession;
}): Promise<{ readonly highWaterOrder: unknown }> {
  if (
    !Number.isSafeInteger(input.observedMaximum) ||
    input.observedMaximum < -1
  ) {
    throw new Error("Observed display-order maximum is invalid.");
  }

  const currentHighWater = {
    $max: [
      { $ifNull: ["$highWaterOrder", -1] },
      input.observedMaximum
    ]
  };
  const highWaterOrder =
    input.mode === "allocate"
      ? { $add: [currentHighWater, 1] }
      : currentHighWater;
  const query = AiEstimatorKnowledgeDisplayOrderSequenceModel.findOneAndUpdate(
    { _id: input.scope },
    [{ $set: { highWaterOrder } }],
    {
      upsert: true,
      returnDocument: "after",
      updatePipeline: true
    }
  );
  query.session(input.session);
  const sequence = (await query.lean().exec()) as DisplayOrderSequenceRow | null;
  if (!sequence) {
    throw new Error("Knowledge display-order sequence update failed.");
  }
  return { highWaterOrder: sequence.highWaterOrder };
}

function requireTransactionalSession(session: ClientSession | null | undefined): void {
  if (
    !session ||
    session.hasEnded ||
    typeof session.inTransaction !== "function" ||
    !session.inTransaction()
  ) {
    throw new Error(
      "Knowledge display-order operations require an active Mongo transaction."
    );
  }
}

function requireDisplayOrder(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer.`);
  }
  return value as number;
}

function requireStoredDisplayOrder(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} is not a nonnegative safe integer.`);
  }
  return value as number;
}

function requireScopeValue(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.includes("\0")
  ) {
    throw new TypeError(`${label} is invalid for a display-order scope.`);
  }
  return value;
}

function isDisplayOrderMasterType(
  value: unknown
): value is AiEstimatorKnowledgeDisplayOrderMasterType {
  return (
    typeof value === "string" &&
    (AI_ESTIMATOR_KNOWLEDGE_DISPLAY_ORDER_MASTER_TYPES as readonly string[]).includes(
      value
    )
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function displayOrderExhausted(): ApiError {
  return new ApiError(
    409,
    "DISPLAY_ORDER_EXHAUSTED",
    "No additional display order is available for this configuration scope."
  );
}
