import type { AssistantGeneratedResult } from "./project-chat-assistant.js";

/** Temporary Client context, not stored conversation history or trusted evidence. */
export interface AskLisnoRequest {
  projectId: string | null;
  contextProjectId?: string | null;
  choiceProjectId?: string | null;
  projectListPage?: { offset: number; version: string };
  message: string;
  history: Array<{ body: string; projectId?: string | null }>;
}

export interface AskLisnoProjectChoice { id: string; name: string; detail: string | null }
export interface AskLisnoProjectList {
  items: AskLisnoProjectChoice[];
  offset: number;
  nextOffset: number | null;
  /** Freshness marker only; never grants access to a project. */
  version: string;
}
export interface AskLisnoResolution {
  state: "resolved" | "clarification" | "account";
  project: { id: string; name: string } | null;
  question: string | null;
  choices: AskLisnoProjectChoice[];
}

export interface AskLisnoResponse {
  projectId: string | null;
  resolution?: AskLisnoResolution;
  projectList?: AskLisnoProjectList;
  checkedAt: string;
  answer: Omit<AssistantGeneratedResult, "freshness">;
}
