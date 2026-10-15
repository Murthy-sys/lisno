import { z } from "zod";
import { parseAssistantAnswer, type AssistantAnswer } from "../messages/assistantAnswerSchema";
import { ApiError, ApiProtocolError, ApiTimeoutError, AuthenticationRequiredError } from "../../core/http/apiClient";
import type { MobileRuntime } from "../../runtime/createRuntime";
import { presentChatSummary } from "../messages/chatModel";

export interface AskLisnoInput {
  projectId: string | null;
  contextProjectId?: string | null;
  choiceProjectId?: string | null;
  projectListPage?: { offset: number; version: string };
  message: string;
  history: Array<{ body: string; projectId?: string | null }>;
}
const id = z.string().trim().min(1).max(200);
const text = z.string().max(20_000);
const project = z.object({ id, name: z.string().trim().min(1).max(500) });
const choice = project.extend({ detail: z.string().max(1000).nullable() });
const schema = z.object({
  projectId: id.nullable(), checkedAt: z.string().datetime({ offset: true }),
  resolution: z.object({ state: z.enum(["resolved", "clarification", "account"]), project: project.nullable(), question: text.nullable(), choices: z.array(choice).max(100) }).optional(),
  projectList: z.object({ items: z.array(choice).max(100), offset: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative().nullable(), version: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
  answer: z.unknown()
});
export type AskLisnoResponse = Omit<z.infer<typeof schema>, "answer"> & { answer: AssistantAnswer };
export type AskLisnoProjectChoice = z.infer<typeof choice>;
const unique = (values: readonly string[]) => new Set(values).size === values.length;

export function parseAskLisnoResponse(value: unknown, input: AskLisnoInput): AskLisnoResponse {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiProtocolError();
  let answer: AssistantAnswer;
  try { answer = parseAssistantAnswer(parsed.data.answer); } catch { throw new ApiProtocolError(); }
  const data = { ...parsed.data, answer };
  const resolution = data.resolution;
  if ((resolution && (resolution.state === "resolved" ? !resolution.project || resolution.project.id !== data.projectId : resolution.project !== null || data.projectId !== null)) ||
    (resolution && !unique(resolution.choices.map(item => item.id))) ||
    (input.choiceProjectId && data.projectId && input.choiceProjectId !== data.projectId) ||
    (data.answer.projectPricing && !data.projectId)) throw new ApiProtocolError();
  const list = data.projectList;
  if (list && (data.projectId !== null || (!input.projectListPage && list.offset !== 0) || !unique(list.items.map(item => item.id)) || (list.nextOffset !== null && list.nextOffset <= list.offset))) throw new ApiProtocolError();
  if (input.projectListPage && (!list || list.offset !== input.projectListPage.offset || list.version !== input.projectListPage.version)) {
    throw new ApiError(409, "ASK_LISNO_PROJECT_LIST_CHANGED", "Projects changed");
  }
  return data;
}

/** Bounded request context contains user questions only, never previous model output. */
export function boundAskLisnoInput(input: AskLisnoInput): AskLisnoInput {
  const next = { ...input, history: input.history.slice(-15) };
  const bytes = () => Array.from(JSON.stringify(next)).reduce((total, char) => total + (char.codePointAt(0)! > 0xffff ? 4 : char.charCodeAt(0) > 0x7ff ? 3 : char.charCodeAt(0) > 0x7f ? 2 : 1), 0);
  while (next.history.length && bytes() > 32_768) next.history.shift();
  return next;
}

export function createAskLisnoApi(runtime: MobileRuntime) {
  return {
    async ask(input: AskLisnoInput, signal: AbortSignal) {
      const bounded = boundAskLisnoInput(input);
      const response = await runtime.api.authenticated.post("/client/ask-lisno", bounded, { signal, timeoutMs: 100_000, safeRetryCount: 0 });
      return parseAskLisnoResponse(response, bounded);
    },
    async verifyProject(projectId: string, signal: AbortSignal) {
      const path = `/projects/${encodeURIComponent(projectId)}`;
      const [detail, summary] = await Promise.all([
        runtime.api.authenticated.get(path, { signal }),
        runtime.api.authenticated.get(`${path}/chat`, { signal })
      ]);
      const parsed = z.object({ id }).safeParse(detail);
      if (!parsed.success || parsed.data.id !== projectId || !presentChatSummary(summary, projectId)) throw new ApiProtocolError();
    }
  };
}

export const isAskLisnoDenied = (error: unknown) => error instanceof AuthenticationRequiredError || (error instanceof ApiError && [401, 403, 404].includes(error.status));
export type AskLisnoFailureKind = "busy" | "usage_limit" | "timeout" | "invalid_answer" | "paused" | "unavailable";

/** Presentation categories are application-owned; never display provider error text. */
export function classifyAskLisnoFailure(error: unknown): AskLisnoFailureKind {
  if (error instanceof ApiTimeoutError || (error instanceof ApiError && error.code === "ASSISTANT_TIMEOUT")) return "timeout";
  if (error instanceof ApiError && error.code === "ASSISTANT_BUSY") return "busy";
  if (error instanceof ApiError && (error.status === 429 || ["ASSISTANT_RATE_LIMIT", "ASSISTANT_ADMISSION_LIMIT", "ASSISTANT_TOKEN_LIMIT"].includes(error.code))) return "usage_limit";
  if (error instanceof ApiProtocolError || (error instanceof ApiError && error.code === "ASSISTANT_SOURCE_CHANGED")) return "invalid_answer";
  return "unavailable";
}

export function askLisnoFailure(error: unknown): string {
  const kind = classifyAskLisnoFailure(error);
  if (kind === "timeout") return "Lisno AI took longer than expected. Your question is saved here. Try again or message your project team.";
  if (kind === "busy") return "Lisno AI is busy. Please try again shortly.";
  if (kind === "usage_limit") return "Lisno has reached its AI usage limit. Please try again later or message your project team.";
  if (error instanceof ApiError && error.code === "ASSISTANT_SOURCE_CHANGED") return "Your project information changed while Lisno was checking. Try again for the latest answer.";
  if (kind === "invalid_answer") return "This answer could not be verified. Please try again or message your project team.";
  return "Lisno AI is temporarily unavailable. Your question is saved here. Try again or message your project team.";
}
