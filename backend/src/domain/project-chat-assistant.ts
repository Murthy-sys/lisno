import type { AssistantRun } from "../repositories/project-assistant.js";
export const ASSISTANT_DEFAULTS = {
  waitMs: 120_000, leaseMs: 180_000, heartbeatMs: 30_000, scanMs: 5_000, generationMs: 90_000,
  requestMs: 20_000, maxProviderAttempts: 4, maxWorkerAttempts: 2, maxToolRounds: 3, maxTools: 6,
  maxPayloadBytes: 32_768, maxOutputTokens: 2_048, maxContextMessages: 16,
  clientPerHour: 20, projectPerHour: 60, deploymentPerDay: 500, tokensPerDay: 1_000_000,
  concurrency: 2
} as const;
/** Deliberately narrow: implicit joins require a short standalone quantity, never a new question/topic. */
export function assistantQuantityFragment(body: string): boolean {
  const text = body.trim();
  if (!text || text.length > 160 || /[?\n\r]/u.test(text) || /\b(?:what|when|why|how|who|which|status|timeline|price|cost|estimate|design|payment|vendor|delivery|also|another|instead|cancel|replace)\b/iu.test(text)) return false;
  return /^(?:(?:quantity|qty|area|size|dimensions?)\s*[:=-]?\s*)?\d+(?:\.\d+)?\s*(?:(?:sq[\s.-]*ft|square feet|sq[\s.-]*m|rft|running feet|feet|ft|meters?|metres?|m|units?|nos?|pieces?)\b|[x×]\s*\d)/iu.test(text);
}
export function assistantEligibleAt(sourceAt: Date, _hasOwner: boolean, explicit: boolean): string {
  return new Date(sourceAt.getTime() + (explicit ? 0 : ASSISTANT_DEFAULTS.waitMs)).toISOString();
}
export const assistantTerminal = (status: AssistantRun["status"]) => !["ready", "waiting_for_human", "leased"].includes(status);
export class AssistantFailure extends Error {
  constructor(readonly code: string, readonly transient = false, readonly retryAfterMs = 0) { super(code); this.name = "AssistantFailure"; }
}
export const assistantFailureCode = (error: unknown): string => error instanceof AssistantFailure ? error.code : "ASSISTANT_UNAVAILABLE";
