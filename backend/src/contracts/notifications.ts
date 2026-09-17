import type { ChatActor } from "./project-chat.js";
export interface ChatNotification {
  id: string;
  type: "chat.mention" | "chat.mention.oversight";
  projectId: string;
  projectName: string;
  messageId: string;
  actor: { id: string; name: string };
  excerpt: string;
  createdAt: string;
  readAt: string | null;
}
export interface NotificationPage {
  items: ChatNotification[];
  unreadCount: number;
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}
export interface NotificationService {
  list(actor: ChatActor, query: unknown): Promise<NotificationPage>;
  read(actor: ChatActor, id: string): Promise<ChatNotification>;
  /** Enqueues a fresh authorized snapshot only after its transaction successfully commits. */
  deliver(actor: ChatActor, enqueue: (page: NotificationPage) => void): Promise<void>;
}
