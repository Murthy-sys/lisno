import type { KnowledgeSectionApplicability } from "./ai-estimator-knowledge.js";

export const KNOWLEDGE_MODE_TIERS = ["signature", "premium", "functional"] as const;
export type KnowledgeModeTier = (typeof KNOWLEDGE_MODE_TIERS)[number];
export const ADDITIONAL_KNOWLEDGE_MODE_TIERS = ["premium", "functional"] as const;
type Row = Record<string, any>;
const record = (value: unknown): Row => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

export function isKnowledgeModeTier(value: unknown): value is KnowledgeModeTier {
  return typeof value === "string" && KNOWLEDGE_MODE_TIERS.some(tier => tier === value);
}

export function isKnowledgeModeSection(sectionKey: unknown): boolean {
  return sectionKey === "advanced" || sectionKey === "pricing";
}

/** Existing root values are Signature. A missing additional tier is deliberately empty. */
export function knowledgeModeTierPayload(payload: unknown, modeTier: KnowledgeModeTier = "signature"): Row {
  const root = record(payload);
  if (modeTier !== "signature") return record(record(record(root.tierConfigurations)[modeTier]).payload);
  const { tierConfigurations: _tiers, ...signature } = root;
  return signature;
}

export function knowledgeModeTierPayloads(payload: unknown): Array<{ modeTier: KnowledgeModeTier; payload: Row }> {
  const root = record(payload);
  return [{ modeTier: "signature", payload: knowledgeModeTierPayload(root) }, ...ADDITIONAL_KNOWLEDGE_MODE_TIERS
    .filter(tier => Object.hasOwn(record(root.tierConfigurations), tier))
    .map(modeTier => ({ modeTier, payload: knowledgeModeTierPayload(root, modeTier) }))];
}

export function projectKnowledgeModeTierSection<T extends Row>(section: T, modeTier: KnowledgeModeTier = "signature"): T {
  if (!isKnowledgeModeSection(section.sectionKey)) return section;
  const storedTier = record(record(record(section.payload).tierConfigurations)[modeTier]);
  return { ...section, payload: knowledgeModeTierPayload(section.payload, modeTier),
    ...(modeTier === "signature" ? {} : { modeTier, applicability: storedTier.applicability ?? "not_configured" }) };
}

/** Called only after the selected payload is validated and the parent CAS is held. */
export function mergeKnowledgeModeTierPayload(previous: Row, modeTier: KnowledgeModeTier, payload: Row, applicability: KnowledgeSectionApplicability): Row {
  if (modeTier === "signature") return { ...payload, ...(Object.hasOwn(previous, "tierConfigurations") ? { tierConfigurations: structuredClone(previous.tierConfigurations) } : {}) };
  return { ...previous, tierConfigurations: { ...record(previous.tierConfigurations), [modeTier]: { applicability, payload } } };
}

/** Reference checks visit retained, including deselected, namespaces. Financial consumers do not use this. */
export function expandKnowledgeModeTierRows<T extends Row>(rows: readonly T[]): T[] {
  return rows.flatMap(row => isKnowledgeModeSection(row.sectionKey)
    ? knowledgeModeTierPayloads(row.payload).map(({ modeTier }) => projectKnowledgeModeTierSection(row, modeTier)) : [row]);
}
