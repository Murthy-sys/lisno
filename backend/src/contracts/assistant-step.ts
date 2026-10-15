import { z } from "zod";

/** Private, stateless Node/Python wire contract. Database authority stays in Node. */
export const assistantToolNames = ["resolve_project", "client_profile", "project_status", "project_execution", "project_estimate"] as const;
export const assistantClarificationCodes = ["project_required", "question_required", "estimate_unavailable", "quote_required", "unsupported_request", "scope_fixed", "privacy_required", "unclear_question", "source_unavailable"] as const;
const opaque = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const tool = z.enum(assistantToolNames);
const fact = z.object({ id: opaque, kind: z.enum(["project_stage", "progress", "task_state", "schedule", "help"]), text: z.string().min(1).max(500) }).strict();
const facts = z.object({ state: z.enum(["available", "unavailable"]), facts: z.array(fact).max(20) }).strict();
export const assistantToolCallSchema = z.discriminatedUnion("name", [
  z.object({ id: opaque, name: z.literal("resolve_project"), args: z.object({ name: z.string().min(1).max(120).nullable() }).strict() }).strict(),
  z.object({ id: opaque, name: z.literal("client_profile"), args: z.object({}).strict() }).strict(),
  z.object({ id: opaque, name: z.literal("project_status"), args: z.object({}).strict() }).strict(),
  z.object({ id: opaque, name: z.literal("project_execution"), args: z.object({}).strict() }).strict(),
  z.object({ id: opaque, name: z.literal("project_estimate"), args: z.object({ basis: z.enum(["current", "approved", "published"]) }).strict() }).strict(),
]);
const toolResult = z.discriminatedUnion("tool", [
  z.object({ callId: opaque, tool: z.literal("resolve_project"), result: z.object({ state: z.enum(["resolved", "choose_project", "no_projects", "not_found", "clarification_required"]), projectRef: opaque.nullable() }).strict() }).strict(),
  z.object({ callId: opaque, tool: z.literal("client_profile"), result: facts }).strict(),
  z.object({ callId: opaque, tool: z.literal("project_status"), result: facts }).strict(),
  z.object({ callId: opaque, tool: z.literal("project_execution"), result: facts }).strict(),
  z.object({ callId: opaque, tool: z.literal("project_estimate"), result: z.object({ reportRef: opaque.nullable(), state: z.enum(["published", "approved", "unavailable"]), fields: z.array(z.enum(["lines", "subtotal", "gst", "total"])).max(4) }).strict() }).strict(),
]);
export const assistantStepRequestSchema = z.object({
  protocolVersion: z.literal(1), requestId: opaque, step: z.number().int().min(0).max(3),
  surface: z.enum(["private", "project_messages"]), remainingMs: z.number().int().min(1).max(90_000),
  projectAvailable: z.boolean(),
  messages: z.array(z.object({ id: opaque, body: z.string().min(1).max(2_000), hasAttachments: z.boolean().optional() }).strict()).min(1).max(16),
  requiredMessageIds: z.array(opaque).max(16).optional(),
  allowedTools: z.array(tool).max(5), toolResults: z.array(toolResult).max(6),
}).strict().superRefine((value, ctx) => {
  const ids = new Set(value.messages.map((message) => message.id));
  if (ids.size !== value.messages.length || value.requiredMessageIds?.some((id) => !ids.has(id))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid message references" });
  if (new Set(value.allowedTools).size !== value.allowedTools.length || (value.surface === "project_messages" && value.allowedTools.some((name) => name === "resolve_project" || name === "client_profile"))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid surface capabilities" });
  if (new Set(value.toolResults.map((item) => item.callId)).size !== value.toolResults.length || value.toolResults.some((item) => !value.allowedTools.includes(item.tool))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid tool result references" });
});
export const assistantStepResultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tools"), calls: z.array(assistantToolCallSchema).min(1).max(6) }).strict(),
  z.object({ type: z.literal("final"), kind: z.enum(["status", "price", "clarification", "handoff", "no_answer"]), factIds: z.array(opaque).max(20), projectEstimateRef: opaque.nullable(), narrative: z.array(z.object({ text: z.string().min(1).max(1_000), factIds: z.array(opaque).max(20) }).strict()).max(4), clarificationCodes: z.array(z.enum(assistantClarificationCodes)).max(8) }).strict(),
]);
export const assistantStepResponseSchema = z.object({
  protocolVersion: z.literal(1), requestId: opaque, step: z.number().int().min(0).max(3),
  route: z.enum(["deterministic", "model"]),
  usage: z.object({ inputTokens: z.number().int().nonnegative().max(1_000_000), outputTokens: z.number().int().nonnegative().max(2_048) }).strict().nullable(),
  result: assistantStepResultSchema,
}).strict().superRefine((value, ctx) => {
  if (value.route === "deterministic" && (value.usage?.inputTokens !== 0 || value.usage?.outputTokens !== 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Deterministic routes require zero usage" });
  if (value.result.type === "final" && value.result.narrative.reduce((n, p) => n + p.text.length, 0) > 2_000) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Narrative exceeds limit" });
  if (value.result.type === "tools" && new Set(value.result.calls.map((call) => call.id)).size !== value.result.calls.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate calls" });
});
export type AssistantStepRequest = z.infer<typeof assistantStepRequestSchema>;
export type AssistantStepResponse = z.infer<typeof assistantStepResponseSchema>;
export type AssistantToolCall = z.infer<typeof assistantToolCallSchema>;
export type AssistantSafeToolResult = AssistantStepRequest["toolResults"][number];
