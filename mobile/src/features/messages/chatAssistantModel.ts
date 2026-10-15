import { z } from "zod";
import { assistantId, parseAssistantAnswer } from "./assistantAnswerSchema";
import { ApiProtocolError } from "../../core/http/apiClient";
const id = assistantId;
export const assistantStateSchema = z.object({ stateVersion: z.number().int().nonnegative().optional(), runId: id, generation: z.number().int().nonnegative(), status: z.enum(["waiting_for_human", "ready", "leased", "answered", "needs_clarification", "no_answer", "suppressed", "failed"]), eligibleAt: z.string(), resultId: id.nullable(), checkedAt: z.string().nullable(), notified: z.object({ id, name: z.string(), role: z.string() }).nullable(), routing: z.enum(["not_required", "notified", "unroutable"]), canRequest: z.boolean(), failureCode: z.string().nullable() });
export type ChatAssistantState = z.infer<typeof assistantStateSchema>;
const result = z.object({ id, projectId: id, messageId: id, checkedAt: z.string().datetime({ offset: true }), stale: z.boolean(), commercialAccess: z.enum(["allowed", "restricted", "none"]) });
export function parseAssistantResult(value: unknown, projectId: string, resultId: string) {
 try {
  const metadata = result.parse(value);
  if (metadata.id !== resultId || metadata.projectId !== projectId) throw new Error();
  const raw = { ...(value as Record<string, unknown>) };
  for (const key of Object.keys(metadata)) delete raw[key];
  const answer = parseAssistantAnswer(raw);
  if (answer.projectPricing && (metadata.stale || metadata.commercialAccess !== "allowed")) throw new Error();
  return { ...metadata, ...answer };
 } catch { throw new ApiProtocolError(); }
}
