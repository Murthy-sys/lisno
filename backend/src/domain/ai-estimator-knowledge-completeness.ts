import type {
  KnowledgeCompletenessFinding,
  KnowledgeCompletenessSummary
} from "../contracts/ai-estimator-knowledge.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
  createKnowledgeContentDigest,
  type KnowledgeSectionApplicability,
  type KnowledgeSectionKey
} from "./ai-estimator-knowledge.js";

export interface KnowledgeCompletenessSectionInput {
  sectionKey: KnowledgeSectionKey;
  applicability: KnowledgeSectionApplicability;
  payload: unknown;
  validationFindings?: readonly Omit<KnowledgeCompletenessFinding, "sectionKey">[];
}

export interface KnowledgeCoreIdentityInput {
  basketId: string | null;
  mainLineId: string | null;
  uomId: string | null;
}

/*
 * Sections the configuration tool has no editor for. An author cannot fill them
 * in from any screen, so counting them would hold completeness below 100% for
 * every item forever and report warnings nobody can clear. Delete an entry here
 * when its editor ships.
 */
const AI_ESTIMATOR_KNOWLEDGE_UNCONFIGURABLE_SECTION_KEYS: ReadonlySet<KnowledgeSectionKey> =
  new Set<KnowledgeSectionKey>(["scope", "execution"]);

function hasConfiguredContent(payload: unknown): boolean {
  return payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.keys(payload as Record<string, unknown>).length > 0;
}

export function deriveKnowledgeCompleteness(input: {
  identity: KnowledgeCoreIdentityInput;
  sections: readonly KnowledgeCompletenessSectionInput[];
}): KnowledgeCompletenessSummary {
  const byKey = new Map(input.sections.map((section) => [section.sectionKey, section]));
  const sectionResults = AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => {
    const section = byKey.get(sectionKey);
    const findings: KnowledgeCompletenessFinding[] = (section?.validationFindings ?? []).map(
      (finding) => ({ ...finding, sectionKey })
    );
    if (sectionKey === "overview") {
      for (const [field, value] of Object.entries(input.identity)) {
        if (value === null || value.length === 0) {
          findings.push({
            code: `MISSING_${field.replace(/Id$/u, "").toUpperCase()}`,
            sectionKey,
            message: `${field} is required before activation.`,
            blocking: true
          });
        }
      }
    }
    if (
      section?.applicability === "not_applicable" ||
      AI_ESTIMATOR_KNOWLEDGE_UNCONFIGURABLE_SECTION_KEYS.has(sectionKey)
    ) {
      return { sectionKey, state: "not_applicable" as const, findings };
    }
    /* Content decides, not the stored flag. A section that holds real data is
       configured even if an older write left its applicability behind, so the
       percentage always reflects what the author can actually see saved. */
    if (!section || !hasConfiguredContent(section.payload)) {
      const optional = ["pricing", "recommendations", "quality", "execution"].includes(sectionKey);
      findings.push({
        code: "SECTION_NOT_CONFIGURED",
        sectionKey,
        message: `${sectionKey} is not configured.`,
        blocking: !optional && sectionKey === "overview"
      });
      return { sectionKey, state: "not_configured" as const, findings };
    }
    if (findings.length > 0) {
      return { sectionKey, state: "needs_attention" as const, findings };
    }
    return { sectionKey, state: "complete" as const, findings };
  });
  const applicable = sectionResults.filter((section) => section.state !== "not_applicable");
  const complete = applicable.filter((section) => section.state === "complete").length;
  const findings = sectionResults.flatMap((section) => section.findings);
  return {
    percentage: applicable.length === 0 ? 100 : Math.round((complete * 100) / applicable.length),
    sections: sectionResults,
    blockers: findings.filter((finding) => finding.blocking),
    warnings: findings.filter((finding) => !finding.blocking)
  };
}

export function createKnowledgeRevisionDigest(input: {
  mainLineId: string;
  revisionNumber: number;
  sections: readonly KnowledgeCompletenessSectionInput[];
}): string {
  const sections = [...input.sections]
    .sort(
      (left, right) =>
        AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.indexOf(left.sectionKey) -
        AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.indexOf(right.sectionKey)
    )
    .map(({ sectionKey, applicability, payload }) => ({
      sectionKey,
      applicability,
      payload
    }));
  return createKnowledgeContentDigest({
    digestVersion: "ai-estimator-knowledge-content-v1",
    mainLineId: input.mainLineId,
    revisionNumber: input.revisionNumber,
    sections
  });
}
