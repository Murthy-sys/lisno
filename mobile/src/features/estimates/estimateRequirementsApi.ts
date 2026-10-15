import { z } from "zod";
import type { RequestScope } from "../../contracts/http";
import { ApiProtocolError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import type { MobileRuntime } from "../../runtime/createRuntime";
const id = z.string().min(1);
const version = z.number().int().nonnegative();
const requirementSchema = z.object({ id, projectId: id, phase: z.enum(["pre", "post"]), mainBasketId: id, mainLineId: id.nullish(), roomId: id.nullable(), text: z.string(), authorId: id, version: z.number().int().positive(), status: z.enum(["open", "included", "declined", "superseded", "withdrawn"]), lineItemIds: z.array(id), reason: z.string(), supersededById: id.nullable(), createdAt: z.string(), updatedAt: z.string(), resolvedAt: z.string().nullable(), canEdit: z.boolean() });
const requirementsSchema = z.object({ projectId: id, requirementsVersion: version, estimateVersion: z.number().int().positive().nullable(), phase: z.enum(["pre", "post"]), editingAllowed: z.boolean(), editingBlockReason: z.enum(["review_pending", "closed"]).nullable(), canResolve: z.boolean(), requirements: z.array(requirementSchema), mainBaskets: z.array(z.object({ id, name: z.string() })), mainLines: z.array(z.object({ id, name: z.string(), mainBasketId: id, subBasketId: id.nullable(), subBasketName: z.string().nullable() })).optional(), rooms: z.array(z.object({ id, label: z.string() })), indicativeTotalPaise: z.number().int().safe().nonnegative().nullable(), pricingComplete: z.boolean() });
export type EstimateRequirements = z.infer<typeof requirementsSchema>;
export type EstimateRequirement = z.infer<typeof requirementSchema>;
export function parseEstimateRequirements(value: unknown, projectId: string): EstimateRequirements {
  const result = requirementsSchema.safeParse(value);
  if (!result.success || result.data.projectId !== projectId || result.data.requirements.some((row) => row.projectId !== projectId) || new Set(result.data.requirements.map((row) => row.id)).size !== result.data.requirements.length) throw new ApiProtocolError();
  return result.data;
}
export const estimateRequirementsKey = (scope: Pick<RequestScope, "environmentId" | "userId">, projectId: string) => privateQueryKey(scope, "estimates", "requirements", projectId);
const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/estimate-requirements`;
export async function getEstimateRequirements(runtime: MobileRuntime, projectId: string, signal?: AbortSignal) {
  return parseEstimateRequirements(await runtime.api.authenticated.get(path(projectId), { signal }), projectId);
}
export type RequirementCommand =
  | { action: "create"; input: { mainBasketId: string; mainLineId?: string | null; roomId: string | null; text: string; expectedRequirementsVersion: number; idempotencyKey: string } }
  | { action: "update"; id: string; input: { expectedRequirementsVersion: number; expectedVersion: number; mainBasketId?: string; mainLineId?: string | null; roomId?: string | null; text?: string; withdraw?: boolean } }
  | { action: "resolve"; id: string; input: { expectedRequirementsVersion: number; expectedVersion: number; status: "included" | "declined" | "superseded"; lineItemIds: string[]; reason: string; supersededById?: string } };
export async function submitRequirementCommand(runtime: MobileRuntime, projectId: string, command: RequirementCommand) {
  const response = command.action === "create" ? await runtime.api.authenticated.post(path(projectId), command.input)
    : command.action === "update" ? await runtime.api.authenticated.patch(`${path(projectId)}/${encodeURIComponent(command.id)}`, command.input)
    : await runtime.api.authenticated.post(`${path(projectId)}/${encodeURIComponent(command.id)}/resolve`, command.input);
  const detail = parseEstimateRequirements(response, projectId);
  if (detail.requirementsVersion <= command.input.expectedRequirementsVersion) throw new ApiProtocolError();
  if (command.action !== "create") {
    const changed = detail.requirements.find((row) => row.id === command.id);
    if (!changed || changed.version <= command.input.expectedVersion) throw new ApiProtocolError();
  }
  return detail;
}
