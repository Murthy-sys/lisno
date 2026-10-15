import { createKnowledgeContentDigest } from "./ai-estimator-knowledge.js";

export const DESIGN_RULE_KEYS = [
  "vendorPreDiscussed", "designerPoApproval", "physicalSampleApproval", "stockCheck",
  "designerVendorSelection", "installationMethod", "siteMeasurementVerification", "tradeCoordination",
  "clientFinishApproval", "shopDrawingApproval", "mockupPrototype", "maintenanceAccess",
  "substrateFixing", "dimensionsClearances"
] as const;
export type DesignRuleKey = (typeof DESIGN_RULE_KEYS)[number];

export interface DesignRules {
  itemNature: "standard" | "custom";
  answers: Record<DesignRuleKey, boolean>;
  details: Partial<Record<DesignRuleKey, string>>;
  discussedVendorId: string | null;
  poApprovalChecklist: { id: string; text: string }[];
}

type Issue = { path: string; code: string; message: string };
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const stableId = (value: unknown): value is string => typeof value === "string" &&
  value.length <= 128 && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u.test(value);

/** Empty historical sections introduce no new obligations. Validate untrusted input before normalizing. */
export function normalizeDesignRules(value?: unknown): DesignRules {
  const row = object(value) ?? {};
  const answers = object(row.answers) ?? {};
  const details = object(row.details) ?? {};
  const itemNature = row.itemNature === "custom" ? "custom" : "standard";
  return {
    itemNature,
    answers: Object.fromEntries(DESIGN_RULE_KEYS.map((key) => [key,
      answers[key] === true || (key === "designerVendorSelection" && itemNature === "custom" && answers[key] === undefined)
    ])) as Record<DesignRuleKey, boolean>,
    details: Object.fromEntries(DESIGN_RULE_KEYS.flatMap((key) =>
      typeof details[key] === "string" && details[key].trim() ? [[key, details[key].trim()]] : [])),
    discussedVendorId: typeof row.discussedVendorId === "string" ? row.discussedVendorId : null,
    poApprovalChecklist: Array.isArray(row.poApprovalChecklist) ? row.poApprovalChecklist.flatMap((point) => {
      const entry = object(point);
      return entry && typeof entry.id === "string" && typeof entry.text === "string"
        ? [{ id: entry.id, text: entry.text.trim() }] : [];
    }) : []
  };
}

export function validateDesignRules(value: unknown): Issue[] {
  const row = object(value);
  if (!row) return [{ path: "payload", code: "INVALID_PAYLOAD", message: "Design rules must be an object." }];
  const issues: Issue[] = [];
  const add = (path: string, message: string, code = "INVALID_DESIGN_RULE") => issues.push({ path, code, message });
  for (const key of Object.keys(row)) {
    if (!["itemNature", "answers", "details", "discussedVendorId", "poApprovalChecklist"].includes(key))
      add(`payload.${key}`, "Unknown Design field.", "UNKNOWN_FIELD");
  }
  if (row.itemNature !== undefined && row.itemNature !== "standard" && row.itemNature !== "custom")
    add("payload.itemNature", "Choose Standard or Custom.");
  for (const field of ["answers", "details"] as const) {
    if (row[field] === undefined) continue;
    const entries = object(row[field]);
    if (!entries) { add(`payload.${field}`, `${field} must be an object.`); continue; }
    for (const [key, entry] of Object.entries(entries)) {
      if (!DESIGN_RULE_KEYS.includes(key as DesignRuleKey)) add(`payload.${field}.${key}`, "Unknown Design question.", "UNKNOWN_FIELD");
      else if (field === "answers" && typeof entry !== "boolean") add(`payload.${field}.${key}`, "Choose Yes or No.");
      else if (field === "details" && (typeof entry !== "string" || entry.length > 4000))
        add(`payload.${field}.${key}`, "Details must contain at most 4000 characters.");
    }
  }
  if (row.discussedVendorId !== undefined && row.discussedVendorId !== null && !stableId(row.discussedVendorId))
    add("payload.discussedVendorId", "Select a valid vendor.");
  if (row.poApprovalChecklist !== undefined) {
    if (!Array.isArray(row.poApprovalChecklist) || row.poApprovalChecklist.length > 50)
      add("payload.poApprovalChecklist", "Use at most 50 approval points.");
    else {
      const ids = new Set<string>();
      row.poApprovalChecklist.forEach((value, index) => {
        const point = object(value);
        const path = `payload.poApprovalChecklist.${index}`;
        if (!point) { add(path, "Each approval point needs an id and text."); return; }
        if (Object.keys(point).some((key) => key !== "id" && key !== "text")) add(path, "Unknown approval point field.", "UNKNOWN_FIELD");
        if (!stableId(point.id) || ids.has(point.id)) add(`${path}.id`, "Approval point ids must be unique stable ids.");
        else ids.add(point.id);
        if (typeof point.text !== "string" || !point.text.trim() || point.text.length > 1000)
          add(`${path}.text`, "Enter approval text up to 1000 characters.");
      });
    }
  }
  const normalized = normalizeDesignRules(value);
  if (normalized.answers.vendorPreDiscussed) {
    if (!normalized.discussedVendorId) add("payload.discussedVendorId", "Select the pre-discussed vendor.", "REQUIRED");
    if (!normalized.details.vendorPreDiscussed) add("payload.details.vendorPreDiscussed", "Record the vendor discussion notes.", "REQUIRED");
  }
  if (normalized.answers.designerPoApproval && normalized.poApprovalChecklist.length === 0)
    add("payload.poApprovalChecklist", "Add at least one Designer PO approval point.", "REQUIRED");
  return issues;
}

export function designRulesDigest(value: unknown): string {
  return createKnowledgeContentDigest({ schema: "main-line-design-rules-v1", rules: normalizeDesignRules(value) });
}

/** Only these four explicitly customer-facing notes may leave the internal rules projection. */
export function designRuleEstimateNotes(value: unknown): string[] {
  const rules = normalizeDesignRules(value);
  const notes: string[] = [];
  if (rules.answers.stockCheck) notes.push("This item is subject to availability at the time of procurement.");
  const defaults = {
    maintenanceAccess: "This item requires special maintenance or access provisions.",
    substrateFixing: "This item requires a particular substrate or fixing arrangement.",
    dimensionsClearances: "This item requires special dimensions, tolerances or clearances."
  };
  for (const key of ["maintenanceAccess", "substrateFixing", "dimensionsClearances"] as const)
    if (rules.answers[key]) notes.push(rules.details[key] || defaults[key]);
  return notes;
}
