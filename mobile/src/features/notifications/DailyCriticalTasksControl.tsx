import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { DailyCriticalTasks } from "../../../../shared/chat/dailyCriticalTasks";
import type { AuthenticatedSession } from "../../contracts/session";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { colors, fonts, spacing } from "../../ui/tokens";

/** The receipt stays pending until the recipient views and acknowledges the list. */
export function DailyCriticalTasksControl({ session }: { readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const queryClient = useQueryClient();
  const key = ["daily-critical-tasks", context.environment.environment.id, session.user.id] as const;
  const [opened, setOpened] = useState(false);
  const [opening, setOpening] = useState(false);
  const query = useQuery({
    queryKey: key,
    queryFn: () => context.runtime.api.authenticated.get<DailyCriticalTasks | null>("/daily-critical-tasks"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true
  });
  const digest = query.data;
  const requiresAcknowledgment = Boolean(digest && !digest.acknowledgedAt);
  const acknowledge = useMutation({
    mutationFn: (localDate: string) => context.runtime.api.authenticated.put(
      `/daily-critical-tasks/${encodeURIComponent(localDate)}/acknowledgment`
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
      setOpened(false);
    }
  });
  const canAcknowledge = !query.isError && !query.isFetching && !acknowledge.isPending;
  const listCurrent = !query.isError && !query.isFetching;

  const openCurrentList = async () => {
    setOpening(true);
    try {
      const result = await query.refetch();
      if (result.isSuccess && result.data) setOpened(true);
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void query.refetch();
    });
    return () => subscription.remove();
  }, [query.refetch]);

  useEffect(() => {
    if (!context.runtime.realtime?.createStream) return;
    const stream = context.runtime.realtime.createStream({
      path: "/notifications/events",
      onEvent: (event) => {
        if (event.event === "daily-critical-tasks") void query.refetch();
      },
      onResync: () => void query.refetch(),
      heartbeatTimeoutMs: 45_000
    });
    stream.start();
    return () => stream.stop();
  }, [context.runtime.realtime, query.refetch]);

  const visible = opened || requiresAcknowledgment;
  const close = () => {
    if (!requiresAcknowledgment && !acknowledge.isPending) setOpened(false);
  };

  return (
    <>
      {query.isError ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry critical tasks" onPress={() => void query.refetch()} style={styles.topButton}>
          <Text style={styles.topButtonText}>Retry tasks</Text>
        </Pressable>
      ) : digest ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Open my critical tasks" accessibilityState={{ busy: opening }} disabled={opening} onPress={() => { void openCurrentList(); }} style={styles.topButton}>
          <Text style={styles.topButtonText}>Tasks</Text>
        </Pressable>
      ) : null}
      <Modal animationType="fade" onRequestClose={close} transparent visible={visible}>
        <View style={styles.scrim}>
          <View accessibilityViewIsModal style={styles.panel}>
            <Text accessibilityRole="header" style={styles.title}>Critical task list</Text>
            <Text style={styles.subtitle}>{digest?.localDate ? `${digest.localDate} · ` : ""}Your open critical chat actions and overdue assigned tasks</Text>
            {query.isError ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Retry critical task list" onPress={() => void query.refetch()}>
                <Text accessibilityLiveRegion="polite" style={styles.error}>This list may be out of date. Retry to review the latest tasks.</Text>
              </Pressable>
            ) : null}
            {query.isFetching ? <Text accessibilityLiveRegion="polite" style={styles.subtitle}>Refreshing assigned tasks…</Text> : null}
            <ScrollView contentContainerStyle={styles.list}>
              {!listCurrent ? null : digest?.items.length ? digest.items.map((item) => (
                <View key={`${item.kind}:${item.projectId}:${item.id}`} style={styles.item}>
                  <Text style={styles.project}>{item.projectName}</Text>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemMeta}>{item.kind === "chat_action" ? "Critical chat action" : "Overdue workflow task"}</Text>
                </View>
              )) : <Text style={styles.empty}>You have no open critical actions or overdue assigned tasks.</Text>}
            </ScrollView>
            {acknowledge.isError ? <Text accessibilityLiveRegion="polite" style={styles.error}>Could not save your acknowledgment. Please retry.</Text> : null}
            <View style={styles.actions}>
              {requiresAcknowledgment && digest ? (
                <Pressable accessibilityRole="button" accessibilityState={{ busy: acknowledge.isPending, disabled: !canAcknowledge }} disabled={!canAcknowledge} onPress={() => acknowledge.mutate(digest.localDate)} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>{acknowledge.isPending ? "Saving…" : "I have reviewed my tasks"}</Text>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" onPress={close} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>Close</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  topButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.shellMuted },
  topButtonText: { color: colors.shellInk, fontFamily: fonts.semibold, fontSize: 13 },
  scrim: { flex: 1, justifyContent: "center", padding: spacing.md, backgroundColor: "rgba(22,31,21,0.68)" },
  panel: { maxHeight: "85%", backgroundColor: colors.surface, borderColor: colors.borderStrong, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 22 },
  subtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13 },
  list: { gap: spacing.sm, paddingVertical: spacing.sm },
  item: { borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.sm, gap: 2 },
  project: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 12 },
  itemTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  itemMeta: { color: colors.warning, fontFamily: fonts.regular, fontSize: 12 },
  empty: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14 },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 13 },
  actions: { paddingTop: spacing.sm },
  primaryButton: { minHeight: 48, justifyContent: "center", alignItems: "center", backgroundColor: colors.primary, paddingHorizontal: spacing.md },
  primaryText: { color: colors.primaryInk, fontFamily: fonts.semibold, fontSize: 14 }
});
