import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { KNOWLEDGE_MODE_TIERS } from "../../../../shared/knowledge/knowledgeModeTiers";
import { getEstimateTierComparison, type EstimateTierComparison, type EstimateTierComparisonRequest } from "../estimates/estimateTierComparisonApi";

export type EstimateTierSuggestionGroup = {
  key: string;
  request: EstimateTierComparisonRequest;
  /** All included IDs in this scope, including lines ineligible for the current read. */
  scopeMainLineIds?: readonly string[];
};
export type EstimateTierSuggestionState = (
  | { status: "loading" | "unavailable"; message?: string }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; comparison: EstimateTierComparison }
) & { selectionBlocked?: boolean };

const REQUEST_LIMIT = 1_000;
const CONCURRENT_READS = 4;
const DEBOUNCE_MS = 250;
let suggestionReadSequence = 0;
const unavailable = "Complete the current item details to compare tier prices.";
const invalidResponse = () => new Error("Tier comparison response is incomplete.");
const aborted = () => new DOMException("Tier comparison was cancelled.", "AbortError");
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const money = (value: unknown) => value === null || typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function validateComparison(value: unknown, request: EstimateTierComparisonRequest): EstimateTierComparison {
  const input = request.input;
  if (!record(value) || value.roomId !== input.roomId || value.mainBasketId !== input.mainBasketId ||
    value.subBasketId !== input.subBasketId || value.estimateVersion !== (input.expectedVersion ?? null) ||
    typeof value.roomName !== "string" || typeof value.mainBasketName !== "string" ||
    !(value.subBasketName === null || typeof value.subBasketName === "string") || !Array.isArray(value.tiers)) throw invalidResponse();
  const expectedTiers = new Set<string>(["current", ...KNOWLEDGE_MODE_TIERS]);
  const expectedLines = new Set(input.lines.map(line => line.mainLineId));
  const quantities = new Map(input.lines.map(line => [line.mainLineId, line.quantity]));
  if (value.tiers.length !== expectedTiers.size) throw invalidResponse();
  for (const tier of value.tiers) {
    if (!record(tier) || typeof tier.modeTier !== "string" || !expectedTiers.delete(tier.modeTier) ||
      typeof tier.label !== "string" || typeof tier.available !== "boolean" || !money(tier.subtotalPaise) ||
      !Array.isArray(tier.lines) || tier.lines.length !== expectedLines.size) throw invalidResponse();
    const remaining = new Set(expectedLines);
    for (const line of tier.lines) {
      if (!record(line) || typeof line.mainLineId !== "string" || !remaining.delete(line.mainLineId) ||
        typeof line.name !== "string" || typeof line.uomName !== "string" || !line.uomName.trim() ||
        typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0 ||
        line.quantity !== quantities.get(line.mainLineId) ||
        !money(line.ratePaise) || !money(line.amountPaise) ||
        !(line.unavailableReason === null || typeof line.unavailableReason === "string") ||
        line.unavailableReason !== null && line.amountPaise !== null) throw invalidResponse();
    }
  }
  return value as unknown as EstimateTierComparison;
}

/** Limit actual transport reads, including large groups split into API-sized chunks. */
function createReadQueue() {
  let active = 0;
  const pending: Array<() => void> = [];
  return (request: EstimateTierComparisonRequest, signal: AbortSignal): Promise<EstimateTierComparison> => new Promise((resolve, reject) => {
    let started = false;
    const cancel = () => {
      if (started) return;
      const index = pending.indexOf(start);
      if (index >= 0) pending.splice(index, 1);
      reject(aborted());
    };
    const start = () => {
      signal.removeEventListener("abort", cancel);
      if (signal.aborted) { reject(aborted()); return; }
      started = true;
      active += 1;
      void Promise.resolve().then(() => {
        if (signal.aborted) throw aborted();
        return getEstimateTierComparison(request, signal);
      }).then(value => {
        if (signal.aborted) throw aborted();
        resolve(validateComparison(value, request));
      }).catch(reject).finally(() => {
        active -= 1;
        pending.shift()?.();
      });
    };
    if (signal.aborted) { reject(aborted()); return; }
    if (active < CONCURRENT_READS) start();
    else { pending.push(start); signal.addEventListener("abort", cancel, { once: true }); }
  });
}

function normalizeRequest(request: EstimateTierComparisonRequest): EstimateTierComparisonRequest {
  return { ...request, input: { ...request.input, lines: request.input.lines.map(line => ({ ...line,
    ...(line.selectedInHouseComponentIds ? { selectedInHouseComponentIds: [...line.selectedInHouseComponentIds].sort() } : {})
  })).sort((a, b) => a.mainLineId.localeCompare(b.mainLineId)) } };
}

function validRequest(request: EstimateTierComparisonRequest) {
  const { target, input } = request;
  return Boolean(target.id && input.roomId && input.mainBasketId && input.lines.length &&
    (input.expectedVersion === undefined || Number.isSafeInteger(input.expectedVersion) && input.expectedVersion > 0) &&
    new Set(input.lines.map(line => line.mainLineId)).size === input.lines.length && input.lines.every(line =>
      line.mainLineId && line.revisionId && line.uomId && Number.isSafeInteger(line.itemVersion) && line.itemVersion > 0 &&
      Number.isSafeInteger(line.revisionVersion) && line.revisionVersion > 0 &&
      Number.isFinite(line.quantity) && line.quantity > 0 && line.quantity <= Number.MAX_SAFE_INTEGER));
}

async function readGroup(request: EstimateTierComparisonRequest, signal: AbortSignal, read: ReturnType<typeof createReadQueue>) {
  const chunks: EstimateTierComparison[] = [];
  for (let offset = 0; offset < request.input.lines.length; offset += REQUEST_LIMIT) {
    if (signal.aborted) throw aborted();
    chunks.push(await read({ ...request, input: { ...request.input, lines: request.input.lines.slice(offset, offset + REQUEST_LIMIT) } }, signal));
  }
  const first = chunks[0]!;
  if (chunks.length === 1) return first;
  return { ...first, tiers: first.tiers.map(tier => {
    const matching = chunks.map(chunk => chunk.tiers.find(value => value.modeTier === tier.modeTier)!);
    const sum = matching.reduce<number | null>((total, item) => total === null || item.subtotalPaise === null ||
      !Number.isSafeInteger(total + item.subtotalPaise) ? null : total + item.subtotalPaise, 0);
    return { ...tier, lines: matching.flatMap(item => item.lines), subtotalPaise: sum,
      available: matching.every(item => item.available) && sum !== null };
  }) };
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return "Tier prices are unavailable for this estimate.";
  if (error instanceof ApiError && error.status === 409) return "The estimate or Configuration changed. Refresh before comparing tier prices.";
  return "Tier prices could not be loaded. Try again.";
}

const blocksSelection = (error: unknown) => error instanceof ApiError && [401, 403, 404, 409].includes(error.status);

/** Current query identity owns readiness; old inputs never supply current prices. */
export function useEstimateTierSuggestions(context: string, groups: readonly EstimateTierSuggestionGroup[]): ReadonlyMap<string, EstimateTierSuggestionState> {
  const readQueue = useRef<ReturnType<typeof createReadQueue> | null>(null);
  readQueue.current ??= createReadQueue();
  const keyCounts = new Map<string, number>();
  for (const group of groups) keyCounts.set(group.key, (keyCounts.get(group.key) ?? 0) + 1);
  const prepared = [...new Map(groups.map(group => [group.key, group])).values()]
    .sort((a, b) => a.key.localeCompare(b.key)).map(group => {
      const request = normalizeRequest(group.request);
      const scopeMainLineIds = group.scopeMainLineIds === undefined ? undefined : [...new Set(group.scopeMainLineIds)].sort();
      return { ...group, request, scopeMainLineIds, identity: JSON.stringify([context, group.key, request, scopeMainLineIds]),
        targetIdentity: JSON.stringify([context, request.target]),
        scopeIdentity: JSON.stringify([context, request.target, group.key, request.input.roomId, request.input.mainBasketId, request.input.subBasketId]),
        valid: Boolean(context) && keyCounts.get(group.key) === 1 && validRequest(request) &&
          (scopeMainLineIds === undefined || scopeMainLineIds.every(id => typeof id === "string" && Boolean(id)) &&
            request.input.lines.every(line => scopeMainLineIds.includes(line.mainLineId))) };
    });
  const currentTargets = new Set(prepared.map(group => group.targetIdentity));
  const identities = JSON.stringify(prepared.map(group => [group.key, group.identity]));
  const [settled, setSettled] = useState<Record<string, string>>({});
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(Object.fromEntries(JSON.parse(identities) as Array<[string, string]>)), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [identities]);
  const queries = useQueries({ queries: prepared.map(group => ({
    queryKey: ["estimate-tier-suggestions", context, group.key, group.request,
      ...(group.scopeMainLineIds === undefined ? [] : [{ scopeMainLineIds: group.scopeMainLineIds }])],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const readSequence = ++suggestionReadSequence;
      const comparison = await readGroup(group.request, signal, readQueue.current!);
      if (signal.aborted) throw aborted();
      return { comparison, identity: group.identity, readSequence };
    },
    enabled: group.valid && settled[group.key] === group.identity,
    retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: true
  })) });
  // Changing quantity or temporarily hiding a group does not establish fresh access/prices.
  const blockedScopes = useRef(new Map<string, {
    context: string; targetIdentity: string; groupKey: string; readSequence: number; error: unknown; errorUpdatedAt: number;
    failedLineIds: Set<string>;
  }>());
  useEffect(() => {
    for (const [key, blocked] of blockedScopes.current) {
      if (blocked.context !== context || currentTargets.size > 0 && !currentTargets.has(blocked.targetIdentity)) blockedScopes.current.delete(key);
    }
    prepared.forEach((group, index) => {
      const query = queries[index]!;
      const blocked = blockedScopes.current.get(group.scopeIdentity);
      const requestedLineIds = group.request.input.lines.map(line => line.mainLineId);
      if (blocksSelection(query.error)) {
        if (!blocked || blocked.error !== query.error || blocked.errorUpdatedAt !== query.errorUpdatedAt ||
          requestedLineIds.some(id => !blocked.failedLineIds.has(id))) {
          blockedScopes.current.set(group.scopeIdentity, { context, targetIdentity: group.targetIdentity, groupKey: group.key,
            readSequence: suggestionReadSequence, error: query.error, errorUpdatedAt: query.errorUpdatedAt,
            failedLineIds: new Set([...(blocked?.failedLineIds ?? []), ...requestedLineIds]) });
        }
      } else if (group.valid && query.isSuccess && !query.isFetching && settled[group.key] === group.identity &&
        query.data?.identity === group.identity && blocked && query.data.readSequence > blocked.readSequence) {
        const remaining = new Set([...blocked.failedLineIds].filter(id => group.scopeMainLineIds === undefined || group.scopeMainLineIds.includes(id)));
        for (const id of requestedLineIds) remaining.delete(id);
        if (remaining.size) blockedScopes.current.set(group.scopeIdentity, { ...blocked, failedLineIds: remaining });
        else blockedScopes.current.delete(group.scopeIdentity);
      }
    });
  }, [context, identities, queries, settled]);
  const states = new Map<string, EstimateTierSuggestionState>(prepared.map((group, index) => {
    const query = queries[index]!;
    const blocked = blockedScopes.current.get(group.scopeIdentity);
    const freshSuccess = group.valid && query.isSuccess && !query.isFetching && settled[group.key] === group.identity &&
      query.data?.identity === group.identity && (!blocked || query.data.readSequence > blocked.readSequence);
    const requestedLineIds = new Set(group.request.input.lines.map(line => line.mainLineId));
    const hasUnverifiedLines = blocked && [...blocked.failedLineIds].some(id => !requestedLineIds.has(id) &&
      (group.scopeMainLineIds === undefined || group.scopeMainLineIds.includes(id)));
    const selectionBlocked = blocksSelection(query.error) || Boolean(blocked && (!freshSuccess || hasUnverifiedLines));
    const state: EstimateTierSuggestionState = !group.valid ? { status: "unavailable", message: unavailable }
      : settled[group.key] !== group.identity || query.isPending || query.isFetching ? { status: "loading" }
      : query.isError ? { status: "error", message: errorMessage(query.error), retry: () => { void query.refetch(); } }
      : query.data && freshSuccess ? { status: "ready", comparison: query.data.comparison }
      : selectionBlocked ? { status: "loading" }
      : { status: "unavailable", message: unavailable };
    return [group.key, { ...state, selectionBlocked }];
  }));
  // Closed scopes retain only the guard, never stale prices or an active read/retry.
  for (const blocked of blockedScopes.current.values()) {
    if (blocked.context === context && (currentTargets.size === 0 || currentTargets.has(blocked.targetIdentity)) &&
      !states.has(blocked.groupKey)) {
      states.set(blocked.groupKey, { status: "unavailable", message: errorMessage(blocked.error), selectionBlocked: true });
    }
  }
  return states;
}
