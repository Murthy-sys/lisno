import { apiClient } from "../../api/client";
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
export const askLisnoApi = {
  verifyProject: async (id: string, signal: AbortSignal): Promise<void> => {
    await Promise.all([
      apiClient.get(`/projects/${encodeURIComponent(id)}`, {signal, showGlobalLoader: false}),
      projectChatApi.summary(id, signal)
    ]);
  },
  ask: (input: AskLisnoInput, signal: AbortSignal) => apiClient.post<AskLisnoResponse>("/client/ask-lisno", input, { signal, showGlobalLoader: false }),
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
