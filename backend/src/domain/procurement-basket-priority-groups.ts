import type { ProcurementBasketDisplayMode } from "./procurement-basket-mode-groups.js";
import type { ProcurementBasketDetailDto, ProcurementBasketLineDto } from "./procurement-basket-projection.js";

export type ProcurementClosurePriority = "P1" | "P2" | "P3";
export type ProcurementPriorityGroupKey = ProcurementClosurePriority | "unassigned";
export interface ProcurementPriorityResolution {
  state: "resolved" | "unset" | "unavailable" | "invalid" | "legacy";
  value: ProcurementClosurePriority | null;
  revision: { id: string; status: "draft" | "active"; version: number } | null;
}
export interface ProcurementPriorityItem {
  sourceLineItemKey: string;
  basketId: string;
  basketName: string;
  mainLineId: string | null;
  mainLineName: string | null;
  roomId: string | null;
  roomName: string;
  subBasketId: string | null;
  subBasketName: string | null;
  mode: ProcurementBasketDisplayMode;
  scope: "included" | "commitment_only";
  resolution: ProcurementPriorityResolution;
}
export interface ProcurementBasketPriorityGroup {
  priority: ProcurementPriorityGroupKey;
  lineCount: number;
  items: ProcurementPriorityItem[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Validate ownership before exposing any selected revision metadata. */
export function resolveProcurementPriority(mainLineId: string,
  selected: { id: string; status: "draft" | "active" } | null,
  revision: unknown, overview: unknown): ProcurementPriorityResolution {
  const unavailable: ProcurementPriorityResolution = { state: "unavailable", value: null, revision: null };
  const invalid: ProcurementPriorityResolution = { state: "invalid", value: null, revision: null };
  if (!selected || !revision) return unavailable;
  if (!record(revision) || revision._id !== selected.id || revision.mainLineId !== mainLineId ||
    revision.status !== selected.status || !Number.isSafeInteger(revision.version) || Number(revision.version) < 1) return invalid;
  const verified = { id: selected.id, status: selected.status, version: Number(revision.version) };
  if (!overview) return { ...unavailable, revision: verified };
  if (!record(overview) || overview.mainLineId !== mainLineId || overview.revisionId !== selected.id ||
    overview.sectionKey !== "overview") return invalid;
  if (!record(overview.payload)) return { ...invalid, revision: verified };
  const value = overview.payload.closurePriority;
  if (value === undefined) return { state: "unset", value: null, revision: verified };
  if (value !== "P1" && value !== "P2" && value !== "P3") return { ...invalid, revision: verified };
  return { state: "resolved", value, revision: verified };
}

export function procurementPriorityItemIncluded(line: ProcurementBasketLineDto): boolean {
  return line.included && line.approvedAmountPaise !== null && line.approvedAmountPaise > 0;
}

/** Display-only source partition. Canonical basket actions must not receive these subsets. */
export function projectProcurementBasketPriorityGroups(baskets: readonly ProcurementBasketDetailDto[],
  resolutions: ReadonlyMap<string, ProcurementPriorityResolution>,
  committedBySourceLine: ReadonlyMap<string, number> = new Map()): ProcurementBasketPriorityGroup[] {
  const groups = new Map<ProcurementPriorityGroupKey, ProcurementPriorityItem[]>(
    (["P1", "P2", "P3", "unassigned"] as const).map(priority => [priority, []]));
  const seen = new Set<string>();
  for (const basket of baskets) for (const line of basket.lines) {
    const included = procurementPriorityItemIncluded(line);
    if (!included && !(Number(committedBySourceLine.get(line.sourceLineItemKey) ?? 0) > 0)) continue;
    if (seen.has(line.sourceLineItemKey)) throw new Error("An approved source line belongs to more than one priority item.");
    seen.add(line.sourceLineItemKey);
    const resolution: ProcurementPriorityResolution = line.source !== "configuration" || !line.mainLineId
      ? { state: "legacy", value: null, revision: null }
      : resolutions.get(line.mainLineId) ?? { state: "unavailable", value: null, revision: null };
    const policy = line.mode?.executionPolicy;
    const saved = line.mode?.decision?.mode;
    const mode: ProcurementBasketDisplayMode = policy?.intent === "pmc" ? "pmc"
      : policy?.intent === "execution" ? saved === "sub_vendor" || saved === "in_house" ? saved : "execution_pending"
        : "unrecorded";
    groups.get(resolution.state === "resolved" ? resolution.value! : "unassigned")!.push({
      sourceLineItemKey: line.sourceLineItemKey, basketId: basket.id, basketName: basket.name,
      mainLineId: line.mainLineId, mainLineName: line.mainLineName, roomId: line.roomId, roomName: line.roomName,
      subBasketId: line.subBasketId, subBasketName: line.subBasketName, mode,
      scope: included ? "included" : "commitment_only", resolution
    });
  }
  return [...groups].filter(([, items]) => items.length > 0)
    .map(([priority, items]) => ({ priority, lineCount: items.length, items }));
}
