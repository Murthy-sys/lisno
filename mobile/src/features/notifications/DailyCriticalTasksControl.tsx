import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import type { CurrentCriticalTaskReview, DailyCriticalTaskItem } from "../../../../shared/chat/dailyCriticalTasks";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { resolveAuthorizedFeature } from "../../navigation/registry";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { colors, fonts, spacing } from "../../ui/tokens";

const consumed = new WeakMap<object, Set<string>>();
/** A successful automatic review occurs once per accepted runtime session. Manual reads always reauthorize. */
export function DailyCriticalTasksControl({ session, navigationBlocked = false }: { readonly session: AuthenticatedSession; readonly navigationBlocked?: boolean }) {
  const context = useConfiguredRuntime();
  if (session.user.role === "client" || !session.authorization.permissions.includes("chat.read")) return null;
  const identity = `${context.environment.generation}:${context.session.generation}:${session.user.id}`;
  return <CurrentTaskReview key={identity} identity={identity} session={session} navigationBlocked={navigationBlocked} />;
}
function CurrentTaskReview({ identity, session, navigationBlocked }: { identity: string; session: AuthenticatedSession; navigationBlocked: boolean }) {
  const context = useConfiguredRuntime(); const client = useQueryClient();
  const [review, setReview] = useState<CurrentCriticalTaskReview | null>(null); const [busy, setBusy] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const alive = useRef(false); const sequence = useRef(0); const controller = useRef<AbortController | null>(null); const ackLock = useRef(false);
  const scopeId = context.environment.environment.id;
  const key = privateQueryKey({ environmentId: scopeId, userId: session.user.id }, "notifications", "current-critical-review", identity);
  const read = useCallback(async (automatic: boolean) => {
    const request = ++sequence.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setReview(null);
    try {
      const data = await client.fetchQuery({ queryKey: privateQueryKey({ environmentId: scopeId, userId: session.user.id }, "notifications", "current-critical-review", identity), retry: false, staleTime: 0, queryFn: () => context.runtime.api.authenticated.get<CurrentCriticalTaskReview>("/daily-critical-tasks/current", { signal: abort.signal }) });
      if (!alive.current || request !== sequence.current || abort.signal.aborted) return;
      const sessions = consumed.get(context.runtime) ?? new Set<string>(); const won = !sessions.has(identity); sessions.add(identity); consumed.set(context.runtime, sessions);
      if (!automatic || won && data.items.length > 0) setReview(data);
    } catch {
      if (!alive.current || request !== sequence.current || abort.signal.aborted) return;
      client.removeQueries({ queryKey: privateQueryKey({ environmentId: scopeId, userId: session.user.id }, "notifications", "current-critical-review", identity) });
      setError("Current critical tasks could not be loaded. Retry to review your authorized work.");
    } finally { if (alive.current && request === sequence.current) setBusy(false); }
  }, [client, scopeId, session.user.id, identity, context.runtime]);
  useEffect(() => {
    alive.current = true;
    if (!consumed.get(context.runtime)?.has(identity)) void read(true);
    return () => { alive.current = false; sequence.current += 1; controller.current?.abort(); };
  }, [context.runtime, identity, read]);
  const requiresAcknowledgment = Boolean(review?.receipt && !review.receipt.acknowledgedAt);
  async function acknowledge() {
    if (!review || ackLock.current) return;
    if (!requiresAcknowledgment) { setReview(null); return; }
    ackLock.current = true; setSaving(true); setError("");
    try {
      await context.runtime.api.authenticated.put(`/daily-critical-tasks/${encodeURIComponent(review.receipt!.localDate)}/acknowledgment`, {});
      if (alive.current) { setReview(null); client.removeQueries({ queryKey: key }); }
    } catch (cause) {
      if (!alive.current) return;
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) { setReview(null); client.removeQueries({ queryKey: key }); }
      setError("Could not save your acknowledgment. Refresh the current list and try again.");
    } finally { ackLock.current = false; if (alive.current) setSaving(false); }
  }
  function openTask(item: DailyCriticalTaskItem) {
    if (requiresAcknowledgment || saving || navigationBlocked) return;
    const featureId = item.kind === "chat_action" ? "messages" : "projects";
    if (!resolveAuthorizedFeature(featureId, session.user.role, session.authorization)) return;
    setReview(null);
    router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId, recordId: item.projectId, ...(item.kind === "chat_action" ? { message: item.messageId } : { tab: item.kind === "design_requirement" ? "designs" : "tasks" }) } });
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={error ? "Retry critical tasks" : "Open my critical tasks"} accessibilityState={{ busy, disabled: busy || saving || navigationBlocked }} disabled={busy || saving || navigationBlocked} onPress={() => void read(false)} style={styles.topButton}><Text style={styles.topButtonText}>{busy ? "Loading tasks…" : error ? "Retry tasks" : "Tasks"}</Text></Pressable>
    {error && !review ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
    <Modal animationType="fade" transparent visible={Boolean(review)} onRequestClose={() => { if (!requiresAcknowledgment && !saving) setReview(null); }}><View style={styles.scrim}><View accessibilityViewIsModal style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>Critical task list</Text>
      <Text style={styles.subtitle}>Your current critical actions, design requirements and overdue assigned tasks. Reviewing this list does not complete the tasks.</Text>
      {review ? <Text style={styles.subtitle}>Checked {new Date(review.checkedAt).toLocaleString()}</Text> : null}
      <ScrollView contentContainerStyle={styles.list}>{review?.items.length ? review.items.map((item) => {
        const due = item.kind === "chat_action" ? item.dueDate : item.dueAt; const feature = item.kind === "chat_action" ? "messages" : "projects";
        return <View key={`${item.kind}:${item.projectId}:${item.id}`} style={styles.item}><Text style={styles.project}>{item.projectName}</Text><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.itemMeta}>{item.kind === "chat_action" ? "Critical chat action" : item.kind === "design_requirement" ? item.category === "stock" ? "Critical supply check" : "Design requirement" : "Overdue workflow task"}</Text>
          <Text style={styles.subtitle}>{due ? `Due ${item.kind === "chat_action" ? due : new Date(due).toLocaleString()}` : item.kind === "design_requirement" && item.category === "stock" ? "Deadline starts after initial payment confirmation" : item.kind === "design_requirement" && item.category === "po_approval" ? "Required before raising a purchase order" : "Required before Design submission"}</Text>
          {resolveAuthorizedFeature(feature, session.user.role, session.authorization) ? <Pressable accessibilityRole="button" disabled={requiresAcknowledgment || saving || navigationBlocked} accessibilityState={{ disabled: requiresAcknowledgment || saving || navigationBlocked }} onPress={() => openTask(item)} style={styles.topButton}><Text style={[styles.project, { color: colors.primary }]}>{item.kind === "chat_action" ? "Open conversation" : item.kind === "design_requirement" ? "Open Design checklist" : "Open project tasks"}</Text></Pressable> : null}
        </View>;
      }) : <Text style={styles.empty}>You have no open critical actions, design requirements or overdue assigned tasks.</Text>}</ScrollView>
      {requiresAcknowledgment ? <Text style={styles.subtitle}>Acknowledge this list before opening a task.</Text> : null}
      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityState={{ busy: saving, disabled: saving }} disabled={saving} onPress={() => void acknowledge()} style={styles.primaryButton}><Text style={styles.primaryText}>{saving ? "Saving…" : "I have reviewed my tasks"}</Text></Pressable></View>
    </View></View></Modal>
  </>;
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
