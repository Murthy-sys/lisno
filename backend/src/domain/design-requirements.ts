import { createHash } from "node:crypto";
import { z } from "zod";
import type { DesignRuleKey, DesignRules } from "./main-line-design-rules.js";

export type DesignRequirementAction = "complete" | "approve" | "defer" | "reopen";
export type DesignRequirementStatus = "pending" | "completed" | "approved" | "deferred";
export type DesignRequirementCategory = "selection" | "critical" | "stock" | "po_approval";
export interface DesignRequirementSourceLine {
  lineItemId: string; mainLineId: string; lineName: string; sourceDigest: string;
  designRules: DesignRules;
}
export interface DesignRequirementsSource {
  projectId: string; estimateId: string | null; estimateVersion: number | null;
  clientId: string | null; designerIds: string[]; procurementIds: string[]; poDesignerId?: string | null;
  initialPaymentAt: string | null; lines: DesignRequirementSourceLine[]; issues: string[];
}
export interface DesignRequirementEvent {
  id: string; entryId: string; sourceDigest: string; ruleKey: DesignRuleKey;
  lineItemId: string; mainLineId: string; action: DesignRequirementAction;
  actorId: string; actorRole: string; occurredAt: string; note: string;
  checkedPointIds: string[]; idempotencyKey: string; requestDigest: string;
}
export interface DesignRequirementsState {
  projectId: string; version: number; history: DesignRequirementEvent[];
}
export interface DesignRequirementEntry {
  id: string; lineItemId: string; mainLineId: string; lineName: string;
  ruleKey: DesignRuleKey; label: string; category: DesignRequirementCategory;
  status: DesignRequirementStatus; sourceDigest: string; note: string; details: string;
  checklist: Array<{ id: string; text: string }>; checkedPointIds: string[];
  completedAt: string | null; completedById: string | null;
  deferredReason: string | null; dueAt: string | null;
  availableActions: DesignRequirementAction[];
}
export const DESIGN_REQUIREMENT_LABELS: Record<Exclude<DesignRuleKey, "vendorPreDiscussed">, string> = {
  designerPoApproval: "Designer PO Approval Checklist",
  physicalSampleApproval: "Physical sample approval",
  stockCheck: "Stock availability confirmation",
  designerVendorSelection: "Designer vendor selection confirmation",
  installationMethod: "Installation method captured in design",
  siteMeasurementVerification: "Site measurement verification",
  tradeCoordination: "Trade and item coordination",
  clientFinishApproval: "Client approval of finish, design or specification",
  shopDrawingApproval: "Shop or detailed drawing approval",
  mockupPrototype: "Mock-up or prototype approval",
  maintenanceAccess: "Maintenance and access provisions",
  substrateFixing: "Substrate and fixing arrangement",
  dimensionsClearances: "Dimensions, tolerances and clearances"
};
export const DESIGN_SELECTION_KEYS = new Set<DesignRuleKey>(["physicalSampleApproval", "clientFinishApproval", "shopDrawingApproval"]);
export const designRequirementActionSchema = z.object({
  expectedVersion: z.number().int().min(0), sourceToken: z.string().regex(/^[a-f0-9]{64}$/u),
  entryId: z.string().min(1).max(200), action: z.enum(["complete", "approve", "defer", "reopen"]),
  note: z.string().trim().min(1).max(2000), checkedPointIds: z.array(z.string().min(1).max(200)).max(100).default([]),
  idempotencyKey: z.string().trim().min(8).max(200)
}).strict();
export type DesignRequirementActionInput = z.infer<typeof designRequirementActionSchema>;
export const designRequirementsDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const designRequirementsSourceToken = (source: DesignRequirementsSource) => designRequirementsDigest(source);

/** Deterministic projection. Reads never create work or mutate approval history. */
export function projectDesignRequirements(source: DesignRequirementsSource, state: DesignRequirementsState): DesignRequirementEntry[] {
  return source.lines.flatMap(line => Object.entries(DESIGN_REQUIREMENT_LABELS).flatMap(([key, label]) => {
    const ruleKey = key as Exclude<DesignRuleKey, "vendorPreDiscussed">;
    if (!line.designRules.answers[ruleKey]) return [];
    const id = `design-requirement-${designRequirementsDigest([source.estimateId, line.lineItemId, line.mainLineId, ruleKey]).slice(0, 40)}`;
    const sourceDigest = designRequirementsDigest([line.sourceDigest, ruleKey,
      ruleKey === "clientFinishApproval" ? source.clientId : ruleKey === "stockCheck" ? source.procurementIds : ruleKey === "designerPoApproval" ? source.poDesignerId ?? null : source.designerIds]);
    const event = [...state.history].reverse().find(row => row.entryId === id && row.sourceDigest === sourceDigest);
    const status = !event || event.action === "reopen" ? "pending" : event.action === "defer" ? "deferred" : event.action === "approve" ? "approved" : "completed";
    const category = DESIGN_SELECTION_KEYS.has(ruleKey) ? "selection" : ruleKey === "stockCheck" ? "stock" : ruleKey === "designerPoApproval" ? "po_approval" : "critical";
    return [{ id, lineItemId: line.lineItemId, mainLineId: line.mainLineId, lineName: line.lineName,
      ruleKey, label, category, status, sourceDigest, note: event?.note ?? "", details: line.designRules.details[ruleKey] ?? "",
      checklist: ruleKey === "designerPoApproval" ? line.designRules.poApprovalChecklist : [], checkedPointIds: event?.checkedPointIds ?? [],
      completedAt: status === "approved" || status === "completed" ? event!.occurredAt : null,
      completedById: status === "approved" || status === "completed" ? event!.actorId : null,
      deferredReason: status === "deferred" ? event!.note : null,
      dueAt: ruleKey === "stockCheck" && source.initialPaymentAt ? new Date(Date.parse(source.initialPaymentAt) + 4 * 86_400_000).toISOString() : null,
      availableActions: []
    } satisfies DesignRequirementEntry];
  }));
}

export function designRequirementsSubmissionBlockers(source: DesignRequirementsSource, entries: DesignRequirementEntry[]): string[] {
  return [...source.issues, ...entries.filter(entry =>
    entry.category !== "stock" && entry.category !== "po_approval" && entry.status === "pending"
  ).map(entry => `${entry.lineName}: ${entry.label} is required before Design plan submission.`)];
}
