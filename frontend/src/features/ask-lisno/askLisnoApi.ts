import { z } from "zod";
import { assistantId, parseAssistantAnswer } from "../messages/assistantAnswerSchema";
import { ApiError, apiClient } from "../../api/client";
import type { PageData, Project } from "../../api/types";
import type { AssistantGeneratedResult } from "../messages/projectChatAssistantTypes";
import { projectChatApi } from "../messages/projectChatApi";

export interface AskLisnoInput {
  projectId: string | null;
  contextProjectId?: string | null;
  choiceProjectId?: string | null;
  projectListPage?: { offset: number; version: string };
  message: string;
  history: Array<{ body: string; projectId?: string | null }>;
}
export interface AskLisnoResolution {
  state: "resolved" | "clarification" | "account";
  project: { id: string; name: string } | null;
  question: string | null;
  choices: Array<{ id: string; name: string; detail: string | null }>;
}
export interface AskLisnoResponse {
  projectId: string | null;
  resolution?: AskLisnoResolution;
  projectList?: AskLisnoProjectList;
  checkedAt: string;
  answer: Omit<AssistantGeneratedResult, "freshness">;
}
export interface AskLisnoProjectList {
  items: Array<{ id: string; name: string; detail: string | null }>;
  offset: number;
  nextOffset: number | null;
  version: string;
}


const projectSchema = z.object({ id: assistantId, name: z.string().min(1).max(500) }).strict();
const choiceSchema = projectSchema.extend({ detail: z.string().max(1000).nullable() });
const responseSchema = z.object({
  projectId: assistantId.nullable(), checkedAt: z.string().datetime({ offset: true }), answer: z.unknown(),
  resolution: z.object({ state: z.enum(["resolved", "clarification", "account"]), project: projectSchema.nullable(), question: z.string().max(20_000).nullable(), choices: z.array(choiceSchema).max(100) }).strict().optional(),
  projectList: z.object({ items: z.array(choiceSchema).max(100), offset: z.number().int().safe().nonnegative(), nextOffset: z.number().int().safe().nonnegative().nullable(), version: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional()
}).strict();
export function parseAskLisnoResponse(value: unknown, input: AskLisnoInput): AskLisnoResponse {
  let data;
  try {
    const parsed = responseSchema.parse(value);
    data = { ...parsed, answer: parseAssistantAnswer(parsed.answer) };
    const resolution = data.resolution;
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    if ((resolution && (resolution.state === "resolved" ? !resolution.project || resolution.project.id !== data.projectId : resolution.project !== null || data.projectId !== null)) ||
      (resolution && !unique(resolution.choices.map(item => item.id))) || (input.choiceProjectId && data.projectId && input.choiceProjectId !== data.projectId) ||
      (data.answer.projectPricing && !data.projectId)) throw new Error();
    const list = data.projectList;
    if (list && (data.projectId !== null || (!input.projectListPage && list.offset !== 0) || !unique(list.items.map(item => item.id)) || (list.nextOffset !== null && list.nextOffset <= list.offset))) throw new Error();
  } catch { throw new ApiError(502, "ASSISTANT_INVALID_RESPONSE", "This answer could not be verified."); }
  if (input.projectListPage && (!data.projectList || data.projectList.offset !== input.projectListPage.offset || data.projectList.version !== input.projectListPage.version)) throw new ApiError(409, "ASK_LISNO_PROJECT_LIST_CHANGED", "Projects changed");
  return data;
}

// Leave room for the server's 90-second generation budget and its response.
export const ASK_LISNO_DEADLINE_MS = 100_000;

async function ask(input: AskLisnoInput, signal: AbortSignal): Promise<AskLisnoResponse> {
  if (signal.aborted) throw new DOMException("Request cancelled.", "AbortError");
  const controller = new AbortController();
  let cancel = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new DOMException("Request cancelled.", "AbortError"));
      controller.abort();
    };
    signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      reject(new ApiError(408, "ASSISTANT_TIMEOUT", "The AI request timed out."));
      controller.abort();
    }, ASK_LISNO_DEADLINE_MS);
  });
  try {
    // A failed private POST is retried only by an explicit user action. The
    // deadline covers the whole response, including reading its JSON body.
    const response = await Promise.race([
      apiClient.post<AskLisnoResponse>("/client/ask-lisno", input, { signal: controller.signal, showGlobalLoader: false }),
      interrupted
    ]);
    return parseAskLisnoResponse(response, input);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

export const askLisnoApi = {
  verifyProject: async (id: string, signal: AbortSignal): Promise<void> => {
    await Promise.all([
      apiClient.get(`/projects/${encodeURIComponent(id)}`, {signal, showGlobalLoader: false}),
      projectChatApi.summary(id, signal)
    ]);
  },
  ask,
  projects: async (signal: AbortSignal): Promise<Array<Pick<Project, "id" | "name">>> => {
    const items: Array<Pick<Project, "id" | "name">> = [];
    let offset = 0;
    while (true) {
      const page = await apiClient.get<PageData<Project>>(`/projects?limit=100&offset=${offset}`, { signal, showGlobalLoader: false });
      items.push(...page.items.map(({ id, name }) => ({ id, name })));
      if (!page.pagination.hasMore) return items;
      offset = page.pagination.offset + page.pagination.limit;
    }
  }
};
