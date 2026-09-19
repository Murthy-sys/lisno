import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { createClientMessageId, type PresentedMessage } from "./chatModel";
import { chatQueryKeys } from "./chatQueryKeys";

export type MessageIssueAction = "raise" | "escalate" | "resolve" | "reopen" | "lower" | "clear";

export interface MessageActionOption {
  readonly action: MessageIssueAction;
  readonly label: string;
  readonly destructive?: boolean;
}

export function messageIssueActions(message: PresentedMessage): readonly MessageActionOption[] {
  const actions: MessageActionOption[] = [];
  if (message.capabilities.canRaise && message.priority === "normal") {
    actions.push({ action: "raise", label: "Raise an issue" });
  }
  if (message.capabilities.canRaise && message.priority === "important" && message.issueStatus === "open") {
    actions.push({ action: "escalate", label: "Escalate to critical" });
  }
  if (message.capabilities.canResolve && message.issueStatus === "open") {
    actions.push({ action: "resolve", label: "Resolve issue" });
    if (message.priority === "critical") actions.push({ action: "lower", label: "Lower to important" });
    actions.push({ action: "clear", label: "Clear priority", destructive: true });
  }
  if (message.capabilities.canReopen && message.issueStatus === "resolved") {
    actions.push({ action: "reopen", label: "Reopen issue" });
  }
  return actions;
}

export function issueActionNeedsNote(action: MessageIssueAction): boolean {
  return ["resolve", "reopen", "lower", "clear"].includes(action);
}

function issueError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "This message changed. Its latest state has been refreshed; review it before trying again.";
  }
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "The issue update could not be saved.";
}

export function MessageActionSheet({
  projectId,
  message,
  session,
  canReply,
  visible,
  onClose,
  onReply,
  onRefresh,
  onDenied
}: {
  readonly projectId: string;
  readonly message: PresentedMessage | null;
  readonly session: AuthenticatedSession;
  readonly canReply: boolean;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onReply: (message: PresentedMessage) => void;
  readonly onRefresh: () => Promise<void> | void;
  readonly onDenied: () => Promise<void> | void;
}) {
  const context = useConfiguredRuntime();
  const queryClient = useQueryClient();
  const scope = useMemo(() => ({
    environmentId: context.environment.environment.id,
    userId: session.user.id
  }), [context.environment.environment.id, session.user.id]);
  const [action, setAction] = useState<MessageIssueAction | null>(null);
  const [priority, setPriority] = useState<"important" | "critical">("important");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const replyAvailable = canReply && session.authorization.permissions.includes("chat.send");
  const canIssue = session.authorization.permissions.includes("chat.issue");
  const issueActions = useMemo(
    () => message && canIssue ? messageIssueActions(message) : [],
    [canIssue, message]
  );

  useEffect(() => {
    if (!visible) {
      setAction(null);
      setPriority("important");
      setNote("");
      setError(null);
      attempt.current = null;
    }
  }, [visible]);

  useEffect(() => {
    if (action && !issueActions.some((option) => option.action === action)) {
      setAction(null);
    }
  }, [action, issueActions]);

  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!message || !action || !issueActions.some((option) => option.action === action)) {
        throw new Error("Choose an available issue action.");
      }
      if (issueActionNeedsNote(action) && !note.trim()) {
        throw new Error("Add a brief reason or resolution note.");
      }
      const actionInput = {
        action,
        expectedVersion: message.version,
        ...(action === "raise" ? { priority } : {}),
        ...(issueActionNeedsNote(action) ? { note: note.trim() } : {})
      };
      const fingerprint = JSON.stringify(actionInput);
      if (!attempt.current || attempt.current.payload !== fingerprint) {
        attempt.current = { payload: fingerprint, key: createClientMessageId() };
      }
      return context.runtime.api.authenticated.patch(
        `/projects/${encodeURIComponent(projectId)}/chat/messages/${encodeURIComponent(message.id)}/issue`,
        { ...actionInput, idempotencyKey: attempt.current.key }
      );
    },
    onSuccess: async () => {
      attempt.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.project(scope, projectId) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(scope) })
      ]);
      await onRefresh();
      onClose();
    },
    onError: async (cause) => {
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        setError("This conversation is unavailable.");
        await onDenied();
        return;
      }
      setError(issueError(cause));
      if (cause instanceof ApiError && cause.status === 409) await onRefresh();
    }
  });

  if (!message) return null;
  const selectedOption = issueActions.find((option) => option.action === action);
  const actionAvailable = Boolean(selectedOption);
  const dismiss = () => {
    if (mutation.isPending) return;
    if (action) {
      setAction(null);
      setError(null);
      return;
    }
    onClose();
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={dismiss}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable accessibilityLabel="Close message actions" accessibilityRole="button" onPress={dismiss} style={styles.backdrop} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>{selectedOption?.label ?? "Message actions"}</Text>
              <Text numberOfLines={2} style={styles.preview}>{message.author}: {message.body || "Attachment"}</Text>
            </View>
            {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
            {!action ? (
              <View style={styles.menu}>
                {replyAvailable ? (
                  <Pressable
                    accessibilityLabel="Reply"
                    accessibilityRole="button"
                    onPress={() => {
                      onReply(message);
                      onClose();
                    }}
                    style={({ pressed }) => [styles.menuAction, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.menuIcon}>↩</Text>
                    <Text style={styles.menuLabel}>Reply</Text>
                  </Pressable>
                ) : null}
                {issueActions.map((option) => (
                  <Pressable
                    key={option.action}
                    accessibilityRole="button"
                    onPress={() => {
                      setAction(option.action);
                      setError(null);
                    }}
                    style={({ pressed }) => [styles.menuAction, pressed ? styles.pressed : null]}
                  >
                    <Text style={[styles.menuIcon, option.destructive ? styles.danger : null]}>!</Text>
                    <Text style={[styles.menuLabel, option.destructive ? styles.danger : null]}>{option.label}</Text>
                  </Pressable>
                ))}
                {!replyAvailable && !issueActions.length ? <Text style={styles.empty}>No actions are available for this message.</Text> : null}
              </View>
            ) : (
              <View style={styles.form}>
                {action === "raise" ? (
                  <View accessibilityRole="radiogroup" style={styles.priorityRow}>
                    {(["important", "critical"] as const).map((value) => (
                      <Pressable
                        key={value}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: priority === value }}
                        onPress={() => {
                          setPriority(value);
                          setError(null);
                        }}
                        style={[styles.priorityChoice, priority === value ? styles.prioritySelected : null]}
                      >
                        <Text style={[styles.priorityLabel, priority === value ? styles.prioritySelectedLabel : null]}>{value}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {issueActionNeedsNote(action) ? (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{action === "resolve" ? "Resolution note" : "Reason"}</Text>
                    <TextInput
                      accessibilityLabel={action === "resolve" ? "Resolution note" : "Reason"}
                      multiline
                      maxLength={1000}
                      onChangeText={(value) => {
                        setNote(value);
                        setError(null);
                      }}
                      placeholder="Add a brief note"
                      placeholderTextColor={colors.inkMuted}
                      style={styles.input}
                      value={note}
                    />
                  </View>
                ) : null}
                <View style={styles.footer}>
                  <Pressable accessibilityRole="button" disabled={mutation.isPending} onPress={dismiss} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Back</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ busy: mutation.isPending, disabled: mutation.isPending || !actionAvailable || (issueActionNeedsNote(action) && !note.trim()) }}
                    disabled={mutation.isPending || !actionAvailable || (issueActionNeedsNote(action) && !note.trim())}
                    onPress={() => mutation.mutate()}
                    style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null, mutation.isPending ? styles.disabled : null]}
                  >
                    <Text style={styles.primaryButtonText}>{mutation.isPending ? "Saving…" : "Save update"}</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {!action ? (
              <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>Cancel</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(20, 16, 42, 0.46)" },
  sheet: {
    maxHeight: "84%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    paddingTop: spacing.xs
  },
  handle: { width: 42, height: 4, alignSelf: "center", borderRadius: 2, backgroundColor: colors.borderStrong },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  heading: { gap: 3 },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20 },
  preview: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  menu: { gap: 2 },
  menuAction: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuIcon: { width: 24, color: colors.violet, fontFamily: fonts.bold, fontSize: 18, textAlign: "center" },
  menuLabel: { flex: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 15 },
  danger: { color: colors.danger },
  empty: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, paddingVertical: spacing.md },
  form: { gap: spacing.md },
  priorityRow: { flexDirection: "row", gap: spacing.xs },
  priorityChoice: { minHeight: 48, flex: 1, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.control },
  prioritySelected: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  priorityLabel: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 12, textTransform: "capitalize" },
  prioritySelectedLabel: { color: colors.surface },
  field: { gap: 6 },
  fieldLabel: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13 },
  input: { minHeight: 88, maxHeight: 150, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.control, color: colors.ink, fontFamily: fonts.regular, fontSize: 14, padding: spacing.sm, textAlignVertical: "top" },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  footer: { flexDirection: "row", gap: spacing.sm },
  secondaryButton: { minHeight: 50, minWidth: 96, alignItems: "center", justifyContent: "center", borderRadius: radii.control, borderWidth: 1, borderColor: colors.midnight },
  secondaryButtonText: { color: colors.midnight, fontFamily: fonts.semibold, fontSize: 14 },
  primaryButton: { minHeight: 50, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radii.control, backgroundColor: colors.midnight },
  primaryButtonText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 14 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.78 },
  closeButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  closeButtonText: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 14 }
});
