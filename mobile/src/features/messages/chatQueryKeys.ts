import type { RequestScope } from "../../contracts/http";
import { privateQueryKey, type PrivateQueryKey } from "../../core/query/queryClient";
import { normalizeChatParticipantSearch } from "./chatParticipants";

type ChatQueryScope = Pick<RequestScope, "environmentId" | "userId">;

export const chatQueryKeys = {
  all(scope: ChatQueryScope): PrivateQueryKey {
    return privateQueryKey(scope, "chat");
  },
  conversations(scope: ChatQueryScope): PrivateQueryKey {
    return privateQueryKey(scope, "chat", "conversations");
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
