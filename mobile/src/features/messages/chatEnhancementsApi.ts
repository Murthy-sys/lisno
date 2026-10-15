import { z } from "zod";
import { ApiProtocolError } from "../../core/http/apiClient";
import type { MobileRuntime } from "../../runtime/createRuntime";
import { presentChatSummary } from "./chatModel";
const id = z.string().min(1);
const actionTypeSchema = z.object({ id, name: z.string().min(1), priority: z.enum(["important", "critical"]), builtIn: z.boolean() });
const actionTypesSchema = z.object({ items: z.array(actionTypeSchema), canCreate: z.boolean() });
export type ChatActionType = z.infer<typeof actionTypeSchema>;
export type ChatActionTypes = z.infer<typeof actionTypesSchema>;
export const chatPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/chat`;
export async function getChatActionTypes(runtime: MobileRuntime, projectId: string, signal?: AbortSignal) {
 const result = actionTypesSchema.safeParse(await runtime.api.authenticated.get(`${chatPath(projectId)}/action-types`, { signal }));
 if (!result.success || new Set(result.data.items.map(item => item.id)).size !== result.data.items.length) throw new ApiProtocolError(); return result.data;
}
export async function createChatActionType(runtime: MobileRuntime, projectId: string, input: { name: string; idempotencyKey: string }) {
 const result = actionTypeSchema.safeParse(await runtime.api.authenticated.post(`${chatPath(projectId)}/action-types`, input));
 if (!result.success) throw new ApiProtocolError(); return result.data;
}
export async function renameChatProject(runtime: MobileRuntime, projectId: string, input: { name: string; expectedVersion: number; idempotencyKey: string }) {
 const result = presentChatSummary(await runtime.api.authenticated.patch(`${chatPath(projectId)}/project-name`, input), projectId);
 if (!result || result.project.nameVersion === undefined || result.project.nameVersion <= input.expectedVersion || result.project.name !== input.name) throw new ApiProtocolError(); return result;
}
const typingSchema = z.object({ projectId: id, serverTime: z.string(), participants: z.array(z.object({ userId: id, name: z.string().min(1).max(200), expiresAt: z.string() })).max(100) });
export function parseTypingSnapshot(value: unknown, projectId: string, userId: string, now = Date.now()) {
 const result = typingSchema.safeParse(value); if (!result.success || result.data.projectId !== projectId) return [];
 const serverTime = Date.parse(result.data.serverTime); if (!Number.isFinite(serverTime)) return [];
 const unique = new Map<string, { userId: string; name: string; expiresAt: number }>();
 for (const participant of result.data.participants) {
  const lease = Date.parse(participant.expiresAt) - serverTime;
  if (participant.userId !== userId && Number.isFinite(lease) && lease > 0) unique.set(participant.userId, { userId: participant.userId, name: participant.name, expiresAt: now + Math.min(lease, 8000) });
 }
 return [...unique.values()];
}
