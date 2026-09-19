import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { colors } from "../../ui/tokens";
import { ChatThread } from "./ChatThread";
import { ConversationList } from "./ConversationList";
import { ConversationWelcome } from "./ConversationWelcome";
import { messagesLayout } from "./messagesLayout";

export interface MessagesWorkspaceProps {
  readonly session: AuthenticatedSession;
  readonly selectedProjectId?: string | null;
  readonly onSelectProject?: (projectId: string) => void;
  readonly compact?: boolean;
  readonly viewportWidth?: number;
}

export function MessagesWorkspace({
  session,
  selectedProjectId = null,
  onSelectProject,
  compact = false,
  viewportWidth
}: MessagesWorkspaceProps) {
  const window = useWindowDimensions();
  const layout = useMemo(
    () => messagesLayout(viewportWidth ?? window.width),
    [viewportWidth, window.width]
  );
  const [activeProjectId, setActiveProjectId] = useState<string | null>(selectedProjectId);
  const [threadSending, setThreadSending] = useState(false);

  useEffect(() => {
    setActiveProjectId(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (layout.mode !== "phone" || !activeProjectId || selectedProjectId) return;
    router.replace({
      pathname: "/record/[featureId]/[recordId]",
      params: { featureId: "messages", recordId: activeProjectId }
    });
  }, [activeProjectId, layout.mode, selectedProjectId]);

  const selectProject = useCallback((projectId: string) => {
    if (threadSending) return;
    if (onSelectProject) {
      onSelectProject(projectId);
    }
    if (layout.mode === "split") {
      setActiveProjectId(projectId);
      if (selectedProjectId) {
        router.setParams({ recordId: projectId });
      }
      return;
    }
    if (onSelectProject) return;
    router.push({
      pathname: "/record/[featureId]/[recordId]",
      params: { featureId: "messages", recordId: projectId }
    });
  }, [layout.mode, onSelectProject, selectedProjectId, threadSending]);

  const closeThread = useCallback(() => {
    if (layout.mode === "split") {
      if (selectedProjectId) {
        router.replace("/feature/messages");
        return;
      }
      setActiveProjectId(null);
      return;
    }
    router.replace("/feature/messages");
  }, [layout.mode]);

  if (layout.mode === "phone" && activeProjectId) {
    return (
      <ChatThread
        key={activeProjectId}
        compact
        onBack={closeThread}
        onSendingChange={setThreadSending}
        projectId={activeProjectId}
        session={session}
      />
    );
  }

  return (
    <View style={[styles.workspace, layout.mode === "split" ? styles.split : null]}>
      <View style={layout.mode === "split" ? [styles.conversationPane, { width: layout.conversationPaneWidth }] : styles.phoneList}>
        <ConversationList
          compact={compact || layout.mode === "split"}
          onSelectProject={selectProject}
          selectionDisabled={threadSending}
          selectedProjectId={activeProjectId}
          session={session}
        />
      </View>
      {layout.mode === "split" ? (
        <View style={styles.threadPane}>
          {activeProjectId ? (
            <ChatThread
              key={activeProjectId}
              compact={false}
              onSendingChange={setThreadSending}
              projectId={activeProjectId}
              session={session}
            />
          ) : <ConversationWelcome />}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1, minWidth: 0, backgroundColor: colors.canvas },
  split: { flexDirection: "row" },
  phoneList: { flex: 1, minWidth: 0 },
  conversationPane: {
    flexShrink: 0,
    minWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    backgroundColor: colors.surface
  },
  threadPane: { flex: 1, minWidth: 0, backgroundColor: colors.canvas }
});
