import { apiClient, ApiError, type Pagination } from "../../api/client";

export interface ProjectNotification {
  id: string;
  type: "chat.mention" | "chat.mention.oversight" | "chat.assistant.route";
  routing?: { priority: "important" | "critical"; messageVersion: number; lastAlertAt: string };
  projectId: string;
  projectName: string;
  messageId: string;
  actor: { id: string; name: string };
  excerpt: string;
  createdAt: string;
  readAt: string | null;
}
export interface NotificationPage {
  items: ProjectNotification[];
  unreadCount: number;
  pagination: Pagination;
}
export const notificationKeys = {
  root: (scope: string) => ["notifications", scope] as const,
  page: (scope: string, offset = 0) => ["notifications", scope, offset] as const
};
export const notificationApi = {
  list: (offset = 0, signal?: AbortSignal) => apiClient.get<NotificationPage>(`/notifications?limit=20&offset=${offset}`, { signal, showGlobalLoader: false }),
  read: (id: string, routingMessageVersion?: number, signal?: AbortSignal) => apiClient.put<ProjectNotification>(`/notifications/${encodeURIComponent(id)}/read`, routingMessageVersion === undefined ? {} : { routingMessageVersion }, { signal, showGlobalLoader: false })
};
export const notificationDenied = (error: unknown) => error instanceof ApiError && [401, 403].includes(error.status);
export const notificationPath = (item: ProjectNotification) => `/projects/${encodeURIComponent(item.projectId)}/messages?message=${encodeURIComponent(item.messageId)}`;
export const notificationTitle = (item: ProjectNotification) => item.type === "chat.assistant.route" || item.routing
  ? `Client ${item.routing?.priority ?? "priority"} request in ${item.projectName}`
  : `${item.actor.name} mentioned ${item.type === "chat.mention.oversight" ? "someone" : "you"} in ${item.projectName}`;
