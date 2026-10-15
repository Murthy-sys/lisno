import { DESIGN_RULE_KEYS, readDesignRules, type DesignRules } from "../../../../shared/knowledge/designRules";
import type { KnowledgeSectionEnvelope } from "../../../../shared/knowledge/knowledgeTypes";

const stableId = (value: unknown): value is string => typeof value === "string" && value.length <= 128 && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u.test(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Never interpret malformed or mismatched saved data as legacy all-No rules. */
export function readMobileDesignSection(section: KnowledgeSectionEnvelope, mainLineId: string, revisionId: string): DesignRules {
  if (!section || section.mainLineId !== mainLineId || section.revisionId !== revisionId || section.sectionKey !== "design" || !Number.isSafeInteger(section.version) || section.version < 1) throw new Error("Design rules could not be verified for this revision. Reload the current configuration.");
  const rules = readDesignRules(section.payload);
  if (Object.keys(section.payload).some(key => !["itemNature", "answers", "details", "discussedVendorId", "poApprovalChecklist"].includes(key))) throw new Error("Saved Design rules contain unsupported fields. Reload the current configuration.");
  if (!record(rules.answers) || !record(rules.details) || Object.keys(rules.answers).some(key => !DESIGN_RULE_KEYS.includes(key as typeof DESIGN_RULE_KEYS[number])) || Object.entries(rules.details).some(([key, value]) => !DESIGN_RULE_KEYS.includes(key as typeof DESIGN_RULE_KEYS[number]) || typeof value !== "string" || value.length > 4000) || (rules.discussedVendorId !== null && !stableId(rules.discussedVendorId)) || rules.poApprovalChecklist.length > 50) throw new Error("Saved Design rules are incomplete. Reload the current configuration.");
  const ids = new Set<string>();
  for (const point of rules.poApprovalChecklist) {
    if (!record(point) || Object.keys(point).some(key => key !== "id" && key !== "text") || !stableId(point.id) || ids.has(point.id) || typeof point.text !== "string" || !point.text.trim() || point.text.length > 1000) throw new Error("Saved Designer approval points could not be read. Reload the current configuration.");
    ids.add(point.id);
  }
  return rules;
}

export function designRulesSaveProblem(rules: DesignRules): string {
  if (rules.answers.vendorPreDiscussed && (!rules.discussedVendorId || !rules.details.vendorPreDiscussed?.trim())) return "Select the discussed vendor and enter discussion notes.";
  if ((rules.answers.designerPoApproval && !rules.poApprovalChecklist.length) || rules.poApprovalChecklist.some(point => !point.text.trim())) return "Add at least one Designer PO approval checklist point and complete each point.";
  return "";
}

let pointSequence = 0;
export function newDesignApprovalPoint(): { id: string; text: string } {
  // A point keeps this identity through editing, reordering, reconciliation and retries.
  pointSequence += 1;
  return { id: `point-${Date.now().toString(36)}-${pointSequence.toString(36)}-${Math.random().toString(36).slice(2, 12)}`, text: "" };
}
