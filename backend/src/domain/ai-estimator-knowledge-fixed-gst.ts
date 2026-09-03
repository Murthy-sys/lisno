import { normalizeKnowledgeIdentity } from "./ai-estimator-knowledge.js";

export const AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY = Object.freeze({
  rule: Object.freeze({
    id: "knowledge-tax-bootstrap-gst-18",
    code: "GST_18",
    name: "GST 18%",
    displayOrder: 0,
    status: "active" as const
  }),
  version: Object.freeze({
    id: "knowledge-tax-version-bootstrap-gst-18-v1",
    versionNumber: 1,
    rateBps: 1_800,
    treatment: "exclusive" as const,
    applicability: "Interior estimation",
    effectiveFrom: "2026-08-28T00:00:00.000Z",
    effectiveTo: null,
    status: "active" as const
  })
});

/**
 * The actor recorded against the canonical GST rows, whether they were written
 * by the provisioning operation or materialised on first use. Both paths write
 * the same identity so a row cannot be told apart by its origin.
 */
export const AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_SYSTEM_ACTOR_ID =
  "system-ai-estimator-knowledge-gst-provision-v1" as const;

export type FixedGstRow = Readonly<Record<string, unknown>>;

export function fixedGstRuleDocument(
  timestamp: Date
): Record<string, unknown> {
  const rule = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule;
  return {
    _id: rule.id,
    code: rule.code,
    codeNormalized: normalizeKnowledgeIdentity(rule.code),
    name: rule.name,
    nameNormalized: normalizeKnowledgeIdentity(rule.name),
    description: null,
    displayOrder: rule.displayOrder,
    status: rule.status,
    version: 1,
    dependencyEpoch: 0,
    createdById: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_SYSTEM_ACTOR_ID,
    updatedById: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_SYSTEM_ACTOR_ID,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    archivedById: null
  };
}

export function fixedGstVersionDocument(
  timestamp: Date
): Record<string, unknown> {
  const policy = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY;
  return {
    _id: policy.version.id,
    taxRuleId: policy.rule.id,
    versionNumber: policy.version.versionNumber,
    rateBps: policy.version.rateBps,
    treatment: policy.version.treatment,
    applicability: policy.version.applicability,
    effectiveFrom: new Date(policy.version.effectiveFrom),
    effectiveTo: null,
    status: policy.version.status,
    version: 1,
    createdById: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_SYSTEM_ACTOR_ID,
    updatedById: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_SYSTEM_ACTOR_ID,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function isExactFixedGstRule(row: FixedGstRow | null | undefined): boolean {
  const policy = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule;
  return row?._id === policy.id &&
    row.code === policy.code &&
    row.codeNormalized === normalizeKnowledgeIdentity(policy.code) &&
    row.name === policy.name &&
    row.nameNormalized === normalizeKnowledgeIdentity(policy.name) &&
    row.displayOrder === policy.displayOrder &&
    row.status === policy.status;
}

export function isExactFixedGstVersion(row: FixedGstRow | null | undefined): boolean {
  const policy = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY;
  const effectiveFrom = normalizePolicyDate(row?.effectiveFrom);
  return row?._id === policy.version.id &&
    row.taxRuleId === policy.rule.id &&
    row.versionNumber === policy.version.versionNumber &&
    row.rateBps === policy.version.rateBps &&
    row.treatment === policy.version.treatment &&
    row.applicability === policy.version.applicability &&
    effectiveFrom === policy.version.effectiveFrom &&
    row.effectiveTo === policy.version.effectiveTo &&
    row.status === policy.version.status;
}

function normalizePolicyDate(value: unknown): string | null {
  const date = value instanceof Date
    ? value
    : typeof value === "string"
      ? new Date(value)
      : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function isFixedGstRuleId(value: unknown): value is typeof AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.id {
  return value === AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.id;
}

export function isFixedGstVersionId(value: unknown): value is typeof AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id {
  return value === AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id;
}
