import type { KnowledgeModeCalculationSettings } from "../contracts/ai-estimator-knowledge.js";
import { validateKnowledgeSectionPayload } from "./ai-estimator-knowledge-validation.js";

export interface KnowledgeInHouseComponent {
  id: string;
  basketId: string;
  subBasketId: string | null;
  inclusions: Array<{ id: string; name: string; selected: boolean }>;
  exclusions: Array<{ id: string; name: string; selected: boolean }>;
  labor: KnowledgeModeCalculationSettings | null;
  material: KnowledgeModeCalculationSettings | null;
}
export interface InHouseComponentRate {
  id: string;
  baseRatePaise: number | null;
  unavailableReason?: string | null;
}
export function hasInHouseComponents(payload: unknown): payload is Record<string, unknown> {
  return !!payload && typeof payload === "object" && !Array.isArray(payload) && Object.hasOwn(payload, "inHouseComponents");
}
/** Undefined is legacy. Null is invalid. An empty array deliberately has no costs. */
export function readInHouseComponents(payload: unknown): KnowledgeInHouseComponent[] | null | undefined {
  if (!hasInHouseComponents(payload)) return undefined;
  const value = payload.inHouseComponents;
  if (!Array.isArray(value) || validateKnowledgeSectionPayload("advanced", { inHouseComponents: value }).length) return null;
  return value as KnowledgeInHouseComponent[];
}
export function inHouseComponentBaseRate(component: KnowledgeInHouseComponent): number | null {
  if (!component.labor || !component.material) return null;
  const sum = component.labor.baseRatePaise + component.material.baseRatePaise;
  return Number.isSafeInteger(sum) && sum >= 0 ? sum : null;
}
export function selectedInHouseComponents<T extends { id: string }>(components: readonly T[] | null, selectedIds: unknown): T[] | null {
  if (!components || !Array.isArray(selectedIds) || !selectedIds.length || selectedIds.length > 50 ||
    selectedIds.some((id) => typeof id !== "string") || new Set(selectedIds).size !== selectedIds.length) return null;
  const byId = new Map(components.map((component) => [component.id, component]));
  if (byId.size !== components.length || selectedIds.some((id) => !byId.has(id))) return null;
  // Configuration ordering, rather than client ordering, makes calculation snapshots stable.
  const selected = new Set(selectedIds);
  return components.filter((component) => selected.has(component.id));
}
export function selectedInHouseBaseRate(components: readonly InHouseComponentRate[] | null, selectedIds: unknown): number | null {
  const selected = selectedInHouseComponents(components, selectedIds);
  if (!selected || selected.some((component) => component.baseRatePaise === null)) return null;
  const total = selected.reduce((sum, component) => sum + component.baseRatePaise!, 0);
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}
