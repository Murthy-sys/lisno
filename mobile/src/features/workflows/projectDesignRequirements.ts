import { z } from "zod";
import { DESIGN_RULE_KEYS } from "../../../../shared/knowledge/designRules";
import { ApiProtocolError } from "../../core/http/apiClient";
import type { MobileRuntime } from "../../runtime/createRuntime";

const actionSchema = z.enum(["complete", "approve", "defer", "reopen"]);
const requirementsSchema = z.object({
  version: z.number().int().nonnegative(), sourceToken: z.string().min(1),
  canReadInternal: z.boolean(), blockers: z.array(z.string()),
  entries: z.array(z.object({
    id: z.string().min(1), lineItemId: z.string(), mainLineId: z.string(), lineName: z.string(),
    ruleKey: z.enum(DESIGN_RULE_KEYS), label: z.string(),
    category: z.enum(["selection", "critical", "stock", "po_approval"]),
    status: z.enum(["pending", "approved", "completed", "deferred"]),
    note: z.string().nullable(), details: z.string().nullable(),
    checklist: z.array(z.object({ id: z.string(), text: z.string() })), checkedPointIds: z.array(z.string()),
    completedAt: z.string().nullable(), completedById: z.string().nullable(),
    deferredReason: z.string().nullable(), dueAt: z.string().nullable(), availableActions: z.array(actionSchema)
  }))
});
export type DesignRequirementAction = z.infer<typeof actionSchema>;
export type DesignRequirements = z.infer<typeof requirementsSchema>;
export type DesignRequirement = DesignRequirements["entries"][number];
export interface DesignRequirementCommand {
  expectedVersion: number; sourceToken: string; entryId: string; action: DesignRequirementAction;
  note: string; checkedPointIds: string[]; idempotencyKey: string;
}
export const designRequirementsPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/design-requirements`;
export function parseDesignRequirements(value: unknown): DesignRequirements {
  const result = requirementsSchema.safeParse(value);
  if (!result.success) throw new ApiProtocolError();
  return result.data;
}
export async function getDesignRequirements(runtime: MobileRuntime, projectId: string, signal?: AbortSignal) {
  return parseDesignRequirements(await runtime.api.authenticated.get(designRequirementsPath(projectId), { signal }));
}
export async function actOnDesignRequirement(runtime: MobileRuntime, projectId: string, command: DesignRequirementCommand) {
  return parseDesignRequirements(await runtime.api.authenticated.post(`${designRequirementsPath(projectId)}/actions`, command));
}
export function requirementValidation(entry: DesignRequirement, action: DesignRequirementAction, note: string, checked: readonly string[]) {
  if (!entry.availableActions.includes(action)) return "This action is no longer available. Refresh the requirements.";
  if (!note.trim()) return action === "defer" ? "Explain why this selection will be completed during the project." : "Add an evidence or decision note.";
  if (action === "approve" && entry.category === "po_approval" && entry.checklist.some((point) => !checked.includes(point.id))) return "Confirm every Designer PO approval point.";
  return null;
}
