import type { RequestScope } from "../../contracts/http";
import { privateQueryKey, type PrivateQueryKey } from "../../core/query/queryClient";
import { normalizeChatParticipantSearch } from "./chatParticipants";

type ChatQueryScope = Pick<RequestScope, "environmentId" | "userId">;

export type ConversationListFilter = "all" | "unread" | "critical" | "important";

export interface ConversationListView {
  readonly filter: ConversationListFilter;
  readonly search: string;
}

export const CONVERSATION_SEARCH_MAX_LENGTH = 100;

/** Trims and bounds the project-name search exactly as it is sent to the server. */
export function normalizeConversationSearch(search: string): string {
  return search.trim().slice(0, CONVERSATION_SEARCH_MAX_LENGTH).trim();
}

export const chatQueryKeys = {
  all(scope: ChatQueryScope): PrivateQueryKey {
    return privateQueryKey(scope, "chat");
  },
  /**
   * Without a view this is the family prefix used for invalidation; with a view it
   * identifies one filtered/searched list, which the prefix still matches.
   */
  conversations(scope: ChatQueryScope, view?: ConversationListView): PrivateQueryKey {
    return view
      ? privateQueryKey(scope, "chat", "conversations", view.filter, normalizeConversationSearch(view.search))
      : privateQueryKey(scope, "chat", "conversations");
  },
  project(scope: ChatQueryScope, projectId: string): PrivateQueryKey {
    return privateQueryKey(scope, "chat", "project", projectId);
  },
  summary(scope: ChatQueryScope, projectId: string): PrivateQueryKey {
    return privateQueryKey(scope, "chat", "project", projectId, "summary");
  },
  messages(scope: ChatQueryScope, projectId: string): PrivateQueryKey {
    return privateQueryKey(scope, "chat", "project", projectId, "messages");
  },
  participants(scope: ChatQueryScope, projectId: string): PrivateQueryKey {
    return privateQueryKey(scope, "chat", "project", projectId, "participants");
  },
  participantOptions(scope: ChatQueryScope, projectId: string, search: string): PrivateQueryKey {
    return privateQueryKey(
      scope,
      "chat",
      "project",
      projectId,
      "participant-options",
      normalizeChatParticipantSearch(search)
    );
  },
  attachmentPolicy(scope: ChatQueryScope, projectId: string): PrivateQueryKey {
    return privateQueryKey(scope, "chat", "project", projectId, "attachment-policy");
  }
} as const;
