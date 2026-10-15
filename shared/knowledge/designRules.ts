/** Revision-owned Main Line rules. Missing legacy rules are all No. */
export const DESIGN_RULE_KEYS = [
  "vendorPreDiscussed", "designerPoApproval", "physicalSampleApproval", "stockCheck",
  "designerVendorSelection", "installationMethod", "siteMeasurementVerification", "tradeCoordination",
  "clientFinishApproval", "shopDrawingApproval", "mockupPrototype", "maintenanceAccess",
  "substrateFixing", "dimensionsClearances"
] as const;
export type DesignRuleKey = (typeof DESIGN_RULE_KEYS)[number];
export type DesignRules = {
  itemNature: "standard" | "custom";
  answers: Record<DesignRuleKey, boolean>;
  details: Partial<Record<DesignRuleKey, string>>;
  discussedVendorId: string | null;
  poApprovalChecklist: Array<{ id: string; text: string }>;
};
export const DESIGN_RULE_QUESTIONS: Record<DesignRuleKey, string> = {
  vendorPreDiscussed: "Is this item pre-discussed with any vendor?",
  designerPoApproval: "Does this item need exclusive Designer approval before vendor appointment?",
  physicalSampleApproval: "Does this item need a physical sample approval?",
  stockCheck: "Does designer need to check stock before selection?",
  designerVendorSelection: "Does designer need to be involved for vendor selection?",
  installationMethod: "Does this item have a specific installation method which must be captured in design?",
  siteMeasurementVerification: "Does this item require site measurement verification before design finalization?",
  tradeCoordination: "Does this item require coordination with another trade or item?",
  clientFinishApproval: "Does this item require client approval of finish, design, or specification?",
  shopDrawingApproval: "Does this item require a shop drawing or detailed drawing approval before production?",
  mockupPrototype: "Does this item require a mock-up or prototype before bulk production?",
  maintenanceAccess: "Does this item require special maintenance or access provisions?",
  substrateFixing: "Does this item require a particular substrate or fixing arrangement?",
  dimensionsClearances: "Does this item require special dimensions, tolerances or clearances?"
};
export const DESIGN_RULE_HELP: Record<DesignRuleKey, string> = {
  vendorPreDiscussed: "Record the vendor and discussion notes. This does not appoint the vendor.",
  designerPoApproval: "The assigned Designer must sign off every checklist point before a purchase order can be raised.",
  physicalSampleApproval: "Adds a Physical Selection Sheet approval. Complete it before docket submission or explicitly defer it to during-project selection.",
  stockCheck: "Adds an availability notice to the estimate and a Procurement stock check due four days after initial payment is confirmed.",
  designerVendorSelection: "Adds a Designer confirmation task. Custom items default to Yes; you may change it.",
  installationMethod: "Adds a critical Designer task which must be completed before docket submission.",
  siteMeasurementVerification: "Adds a critical measurement verification before design submission.",
  tradeCoordination: "Adds a critical trade coordination task for the Designer.",
  clientFinishApproval: "Adds a client decision to the Physical Selection Sheet. Approval or reasoned during-project deferral is required before docket submission.",
  shopDrawingApproval: "Adds a drawing approval to the Physical Selection Sheet. Approval or reasoned during-project deferral is required before docket submission.",
  mockupPrototype: "Adds a critical mock-up or prototype task for design and closure.",
  maintenanceAccess: "Adds a customer-visible estimate note and a critical Designer task.",
  substrateFixing: "Adds a customer-visible estimate note and a critical Designer task.",
  dimensionsClearances: "Adds a customer-visible estimate note and a critical Designer task."
};
export function defaultDesignRules(): DesignRules {
  return { itemNature: "standard", answers: Object.fromEntries(DESIGN_RULE_KEYS.map((key) => [key, false])) as DesignRules["answers"], details: {}, discussedVendorId: null, poApprovalChecklist: [] };
}
/** Normalize only the documented empty legacy section; malformed data must not become all No. */
export function readDesignRules(payload: unknown): DesignRules {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Design rules could not be read.");
  if (Object.keys(payload).length === 0) return defaultDesignRules();
  const rules = payload as DesignRules;
  if (!["standard", "custom"].includes(rules.itemNature) || !rules.answers || DESIGN_RULE_KEYS.some((key) => typeof rules.answers[key] !== "boolean") || !rules.details || !Array.isArray(rules.poApprovalChecklist)) throw new Error("Design rules are incomplete. Reload the current configuration.");
  return rules;
}
