import { apiClient, ApiError } from "../../api/client";
import type { ChatAttachmentPolicy, ChatStagedAttachment, ChatConversationPage, ChatIssueInput, ChatMessage, ChatMessagePage, ChatMessageQuery, ChatParticipantInput, ChatParticipantOptions, ChatParticipantPage, ChatParticipantRevokeInput, ChatReadInput, ChatReadResult, ChatSendInput, ChatSummary } from "./projectChatTypes";

export const chatPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/chat`;
export const chatKeys = {
  root: (scope: string) => ["project-chat", scope] as const,
  project: (scope: string, projectId: string) => ["project-chat", scope, "project", projectId] as const,
  summary: (scope: string, projectId: string) => [...chatKeys.project(scope, projectId), "summary"] as const,
  participants: (scope: string, projectId: string) => [...chatKeys.project(scope, projectId), "participants"] as const,
  messages: (scope: string, projectId: string, filter: string, around?: string) => [...chatKeys.project(scope, projectId), "messages", filter, around ?? "latest"] as const,
  list: (scope: string) => [...chatKeys.root(scope), "conversations"] as const
};
const quiet = { showGlobalLoader: false };
function queryString(query: object) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)); });
  return params.toString();
}
export function isChatDenied(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}
export function chatErrorMessage(error: unknown) {
  if (isChatDenied(error)) return "This item is unavailable or your access has changed.";
  if (error instanceof ApiError && error.status === 409) return "This item changed. The latest information has been loaded; review it before trying again.";
  return error instanceof ApiError ? error.message : "Unable to connect. Please try again.";
}
export const projectChatApi = {
  attachmentPolicy: (id: string, signal?: AbortSignal) => apiClient.get<ChatAttachmentPolicy>(`${chatPath(id)}/attachment-policy`, { ...quiet, signal }),
  uploadAttachment: (id: string, uploadId: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal) => {
    const body = new FormData(); body.append("file", file);
    return apiClient.postMultipartWithProgress<ChatStagedAttachment>(`${chatPath(id)}/attachments?${queryString({ uploadId, sizeBytes: file.size })}`, body, onProgress, { ...quiet, signal, timeoutMs: 180_000 });
  },
  discardAttachment: (id: string, attachmentId: string, signal?: AbortSignal) => apiClient.delete<{ id: string; discarded: true }>(`${chatPath(id)}/attachments/${encodeURIComponent(attachmentId)}`, undefined, { ...quiet, signal }),
  attachmentBlob: (id: string, attachmentId: string, variant: "content" | "preview", signal: AbortSignal, maxBytes: number, onProgress?: (progress: { loadedBytes: number; totalBytes: number | null }) => void) => apiClient.getBlob(`${chatPath(id)}/attachments/${encodeURIComponent(attachmentId)}/${variant}`, { ...quiet, signal, maxBytes, onProgress }),
  summary: (id: string, signal?: AbortSignal) => apiClient.get<ChatSummary>(chatPath(id), { ...quiet, signal }),
  participants: (id: string, signal?: AbortSignal) => apiClient.get<ChatParticipantPage>(`${chatPath(id)}/participants`, { ...quiet, signal }),
  options: (id: string, search: string, signal?: AbortSignal) => apiClient.get<ChatParticipantOptions>(`${chatPath(id)}/participant-options?${queryString({ search, limit: 30 })}`, { ...quiet, signal }),
  messages: (id: string, query: ChatMessageQuery, signal?: AbortSignal) => apiClient.get<ChatMessagePage>(`${chatPath(id)}/messages?${queryString({ limit: 40, ...query })}`, { ...quiet, signal }),
  conversations: (offset: number, signal?: AbortSignal) => apiClient.get<ChatConversationPage>(`/project-messages?${queryString({ limit: 30, offset })}`, { ...quiet, signal }),
  send: (id: string, input: ChatSendInput, signal?: AbortSignal) => apiClient.post<ChatMessage>(`${chatPath(id)}/messages`, input, { ...quiet, signal }),
  issue: (id: string, messageId: string, input: ChatIssueInput, signal?: AbortSignal) => apiClient.patch<ChatMessage>(`${chatPath(id)}/messages/${encodeURIComponent(messageId)}/issue`, input, { ...quiet, signal }),
  selectParticipant: (id: string, input: ChatParticipantInput, signal?: AbortSignal) => apiClient.post<ChatParticipantPage>(`${chatPath(id)}/participants`, input, { ...quiet, signal }),
  revokeParticipant: (id: string, selectionId: string, input: ChatParticipantRevokeInput, signal?: AbortSignal) => apiClient.post<ChatParticipantPage>(`${chatPath(id)}/participants/${encodeURIComponent(selectionId)}/revoke`, input, { ...quiet, signal }),
  read: (id: string, input: ChatReadInput, signal?: AbortSignal) => apiClient.put<ChatReadResult>(`${chatPath(id)}/read`, input, { ...quiet, signal })
};
