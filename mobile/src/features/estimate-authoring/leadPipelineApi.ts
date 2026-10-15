import { z } from "zod";
import { ApiProtocolError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import type { RequestScope } from "../../contracts/http";
import type { MobileRuntime } from "../../runtime/createRuntime";
import { leadSchema } from "./staffEstimateApi";
import type { LeadStage } from "./types";
export const leadStageLabels: Record<LeadStage, string> = { new_lead: "New lead", contacted: "Contacted", site_visit: "Site visit", design_meeting: "Design meeting", estimate_in_progress: "Estimate in progress", estimate_sent: "Estimate sent", negotiation: "Negotiation", won: "Won", lost: "Lost" };
export const leadActivityTypes = ["call", "whatsapp", "meeting", "email", "note"] as const;
export type LeadActivityType = typeof leadActivityTypes[number];
type Scope = Pick<RequestScope, "environmentId" | "userId">;
export const leadPipelineKey = (scope: Scope, search: string, stage: string, offset: number) => privateQueryKey(scope, "leads", "pipeline", search, stage, offset);
export const leadActivitiesKey = (scope: Scope, leadId: string) => privateQueryKey(scope, "leads", "activities", leadId);
const pagination = z.object({ offset: z.number().int().nonnegative(), limit: z.number().int().positive(), total: z.number().int().nonnegative(), hasMore: z.boolean() });
const activitySchema = z.object({ id: z.string().min(1), leadId: z.string().min(1), actorId: z.string().min(1), type: z.enum(leadActivityTypes), note: z.string(), occurredAt: z.string(), createdAt: z.string() });
export type LeadActivity = z.infer<typeof activitySchema>;
export async function getPipelinePage(runtime: MobileRuntime, search: string, stage: LeadStage | "all", offset: number, signal?: AbortSignal) {
 const query = new URLSearchParams({ limit: "20", offset: String(offset) }); if (search.trim()) query.set("search", search.trim()); if (stage !== "all") query.set("stage", stage);
 const result = z.object({ items: z.array(leadSchema), pagination }).safeParse(await runtime.api.authenticated.get(`/leads?${query}`, { signal }));
 if (!result.success || result.data.pagination.offset !== offset || new Set(result.data.items.map(row => row.id)).size !== result.data.items.length || (stage !== "all" && result.data.items.some(row => row.stage !== stage))) throw new ApiProtocolError(); return result.data;
}
export async function getLeadActivityPage(runtime: MobileRuntime, leadId: string, offset: number, signal?: AbortSignal) {
 const result = z.object({ items: z.array(activitySchema), pagination }).safeParse(await runtime.api.authenticated.get(`/leads/${encodeURIComponent(leadId)}/activities?limit=50&offset=${offset}`, { signal }));
 if (!result.success || result.data.pagination.offset !== offset || result.data.items.some(item => item.leadId !== leadId) || new Set(result.data.items.map(item => item.id)).size !== result.data.items.length) throw new ApiProtocolError(); return result.data;
}
export async function updateLeadStage(runtime: MobileRuntime, leadId: string, stage: LeadStage) {
 const result = leadSchema.safeParse(await runtime.api.authenticated.patch(`/leads/${encodeURIComponent(leadId)}`, { stage })); if (!result.success || result.data.id !== leadId || result.data.stage !== stage) throw new ApiProtocolError(); return result.data;
}
export async function createLeadActivity(runtime: MobileRuntime, leadId: string, actorId: string, input: { type: LeadActivityType; note: string; occurredAt: string }) {
 const result = activitySchema.safeParse(await runtime.api.authenticated.post(`/leads/${encodeURIComponent(leadId)}/activities`, input));
 if (!result.success || result.data.leadId !== leadId || result.data.actorId !== actorId || result.data.type !== input.type || result.data.note !== input.note || result.data.occurredAt !== input.occurredAt) throw new ApiProtocolError(); return result.data;
}
