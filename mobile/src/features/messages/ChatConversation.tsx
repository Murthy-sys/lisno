import type { AuthenticatedSession } from "../../contracts/session";
import { ChatThread } from "./ChatThread";

/** Compatibility entry point for callers that previously supplied generic detail data. */
export function ChatConversation({
  projectId,
  session,
  onBack
}: {
  readonly projectId: string;
  readonly data?: unknown;
  readonly session: AuthenticatedSession;
  readonly onRefresh?: (() => void) | undefined;
  readonly refreshing?: boolean | undefined;
  readonly onBack?: (() => void) | undefined;
}) {
  return <ChatThread projectId={projectId} session={session} onBack={onBack} />;
}
