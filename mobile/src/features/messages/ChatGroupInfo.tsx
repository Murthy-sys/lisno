import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import * as ReactNative from "react-native";
import {
  AccessibilityInfo,
  ActivityIndicator,
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
import { SafeAreaView } from "react-native-safe-area-context";

import { ROLE_LABELS } from "../../contracts/authorization";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import {
  buildChatParticipantOptionsPath,
  buildChatParticipantsPath,
  requireChatParticipantOptions,
  requireChatParticipantPage
} from "./chatParticipants";
import {
  createClientMessageId,
  projectInitials,
  type PresentedChatParticipant,
  type PresentedChatParticipantPage
} from "./chatModel";
import { chatQueryKeys } from "./chatQueryKeys";
import { ChatIcon } from "./ChatIcon";
import { chatColors } from "./chatTheme";

const PARTICIPANT_SEARCH_DELAY_MS = 250;
const MAX_REASON_LENGTH = 1_000;

function isDenied(cause: unknown): cause is ApiError {
  return cause instanceof ApiError && [401, 403, 404].includes(cause.status);
}

function queryErrorMessage(cause: unknown): string {
  return cause instanceof ApiProtocolError
    ? "Participant information is temporarily unavailable."
    : "Participants could not be loaded. Check your connection and try again.";
}

function addErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 409) {
    return "Participant access changed. Review the refreshed people before trying again.";
  }
  if (cause instanceof ApiProtocolError) {
    return "The participant update returned an invalid response. Try again after refreshing.";
  }
  return "The participant could not be added. Your selection and reason are ready to retry.";
}

export interface ChatGroupInfoProps {
  readonly visible: boolean;
  readonly compact: boolean;
  readonly projectId: string;
  readonly projectName: string;
  readonly participantCount: number;
  readonly session: AuthenticatedSession;
  readonly canManage: boolean;
  readonly onRequestClose: () => void;
  readonly onDenied: () => Promise<void> | void;
  readonly onParticipantsChanged: (page: PresentedChatParticipantPage) => Promise<void> | void;
  readonly onParticipantAdded: (name: string) => Promise<void> | void;
  readonly onRestoreFocus?: (() => void) | undefined;
}

export interface ChatGroupInfoHandle {
  hasTransientState(): boolean;
  dismissTransientState(): boolean;
}

interface AddOperation {
  readonly ownerKey: string;
  readonly epoch: number;
  readonly userId: string;
  readonly participantName: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export const ChatGroupInfo = forwardRef<ChatGroupInfoHandle, ChatGroupInfoProps>(function ChatGroupInfo({
  visible,
  compact,
  projectId,
  projectName,
  participantCount,
  session,
  canManage,
  onRequestClose,
  onDenied,
  onParticipantsChanged,
  onParticipantAdded,
  onRestoreFocus
}, ref) {
  const context = useConfiguredRuntime();
  const queryClient = useQueryClient();
  const scope = useMemo(() => ({
    environmentId: context.environment.environment.id,
    userId: session.user.id
  }), [context.environment.environment.id, session.user.id]);
  const ownerKey = `${scope.environmentId}\u0000${scope.userId}\u0000${projectId}`;
  const participantKey = useMemo(
    () => chatQueryKeys.participants(scope, projectId),
    [projectId, scope]
  );
  const optionPrefix = useMemo(
    () => chatQueryKeys.participantOptions(scope, projectId, "").slice(0, -1),
    [projectId, scope]
  );

  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const closeButton = useRef<View>(null);
  const searchInput = useRef<TextInput>(null);
  const focusRequest = useRef<number | null>(null);
  const wasVisible = useRef(visible);
  const visibleRef = useRef(visible);
  const ownerKeyRef = useRef(ownerKey);
  const previousOwnerKey = useRef(ownerKey);
  const onRequestCloseRef = useRef(onRequestClose);
  const epochRef = useRef(0);
  const pendingRef = useRef(false);
  const addController = useRef<AbortController | null>(null);
  const attempt = useRef<{ readonly fingerprint: string; readonly idempotencyKey: string } | null>(null);
  const deniedOwner = useRef<string | null>(null);
  visibleRef.current = visible;
  ownerKeyRef.current = ownerKey;
  onRequestCloseRef.current = onRequestClose;

  const scheduleFocus = useCallback((target: React.RefObject<View | TextInput | null>) => {
    if (focusRequest.current !== null) cancelAnimationFrame(focusRequest.current);
    focusRequest.current = requestAnimationFrame(() => {
      focusRequest.current = null;
      const handle = ReactNative.findNodeHandle(target.current);
      if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }, []);

  const resetAdd = useCallback(() => {
    setAdding(false);
    setSearch("");
    setDebouncedSearch("");
    setSelectedUserId("");
    setReason("");
    setFormError(null);
    setSubmitting(false);
    pendingRef.current = false;
    attempt.current = null;
    addController.current?.abort();
    addController.current = null;
  }, []);

  useEffect(() => {
    const ownerChanged = previousOwnerKey.current !== ownerKey;
    previousOwnerKey.current = ownerKey;
    epochRef.current += 1;
    deniedOwner.current = null;
    setAccessDenied(false);
    setSuccessMessage(null);
    resetAdd();
    if (ownerChanged && visibleRef.current) onRequestCloseRef.current();
  }, [ownerKey, resetAdd]);

  useEffect(() => {
    const restore = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (restore) onRestoreFocus?.();
    if (visible) {
      deniedOwner.current = null;
      setAccessDenied(false);
      return;
    }
    epochRef.current += 1;
    resetAdd();
    void queryClient.cancelQueries({ queryKey: participantKey });
    void queryClient.cancelQueries({ queryKey: optionPrefix });
  }, [onRestoreFocus, optionPrefix, participantKey, queryClient, resetAdd, visible]);

  useEffect(() => () => {
    epochRef.current += 1;
    pendingRef.current = false;
    addController.current?.abort();
    addController.current = null;
    if (focusRequest.current !== null) cancelAnimationFrame(focusRequest.current);
    void queryClient.cancelQueries({ queryKey: participantKey });
    void queryClient.cancelQueries({ queryKey: optionPrefix });
  }, [optionPrefix, participantKey, queryClient]);

  useEffect(() => {
    if (!visible || !adding) return;
    const timer = setTimeout(() => setDebouncedSearch(search.trim().slice(0, 100)), PARTICIPANT_SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [adding, search, visible]);

  useEffect(() => {
    if (!canManage && adding) resetAdd();
  }, [adding, canManage, resetAdd]);

  useEffect(() => {
    if (!attempt.current) return;
    const fingerprint = selectedUserId && reason.trim()
      ? JSON.stringify({ userId: selectedUserId, reason: reason.trim() })
      : null;
    if (attempt.current.fingerprint !== fingerprint) attempt.current = null;
  }, [reason, selectedUserId]);

  const participants = useQuery({
    queryKey: participantKey,
    queryFn: async ({ signal }) => requireChatParticipantPage(
      await context.runtime.api.authenticated.get<unknown>(buildChatParticipantsPath(projectId), { signal })
    ),
    enabled: visible && !accessDenied,
    retry: false,
    staleTime: 15_000
  });

  const options = useQuery({
    queryKey: chatQueryKeys.participantOptions(scope, projectId, debouncedSearch),
    queryFn: async ({ signal }) => requireChatParticipantOptions(
      await context.runtime.api.authenticated.get<unknown>(
        buildChatParticipantOptionsPath(projectId, debouncedSearch),
        { signal }
      )
    ),
    enabled: visible && adding && canManage && !accessDenied,
    retry: false,
    staleTime: 10_000
  });

  const denyAccess = useCallback(async () => {
    if (deniedOwner.current === ownerKey) return;
    deniedOwner.current = ownerKey;
    epochRef.current += 1;
    setAccessDenied(true);
    resetAdd();
    await Promise.all([
      queryClient.cancelQueries({ queryKey: participantKey }),
      queryClient.cancelQueries({ queryKey: optionPrefix })
    ]);
    queryClient.removeQueries({ queryKey: participantKey });
    queryClient.removeQueries({ queryKey: optionPrefix });
    await onDenied();
  }, [onDenied, optionPrefix, ownerKey, participantKey, queryClient, resetAdd]);

  useEffect(() => {
    if (isDenied(participants.error) || isDenied(options.error)) void denyAccess();
  }, [denyAccess, options.error, participants.error]);

  const mutation = useMutation({
    retry: false,
    mutationFn: async (operation: AddOperation) => {
      const controller = new AbortController();
      addController.current?.abort();
      addController.current = controller;
      const value = await context.runtime.api.authenticated.post<unknown>(
        buildChatParticipantsPath(projectId),
        {
          userId: operation.userId,
          reason: operation.reason,
          idempotencyKey: operation.idempotencyKey
        },
        { signal: controller.signal }
      );
      return requireChatParticipantPage(value);
    },
    onSuccess: async (page, operation) => {
      if (
        operation.ownerKey !== ownerKeyRef.current ||
        operation.epoch !== epochRef.current ||
        !visibleRef.current
      ) return;
      attempt.current = null;
      queryClient.setQueryData(participantKey, page);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: participantKey }),
        queryClient.invalidateQueries({ queryKey: optionPrefix })
      ]);
      if (
        operation.ownerKey !== ownerKeyRef.current ||
        operation.epoch !== epochRef.current ||
        !visibleRef.current
      ) return;
      await onParticipantsChanged(page);
      setAdding(false);
      setSearch("");
      setDebouncedSearch("");
      setSelectedUserId("");
      setReason("");
      setFormError(null);
      const message = `${operation.participantName} was added to the conversation.`;
      setSuccessMessage(message);
      await onParticipantAdded(operation.participantName);
    },
    onError: async (cause, operation) => {
      if (
        operation.ownerKey !== ownerKeyRef.current ||
        operation.epoch !== epochRef.current ||
        !visibleRef.current
      ) return;
      if (isDenied(cause)) {
        await denyAccess();
        return;
      }
      setFormError(addErrorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) {
        await Promise.all([participants.refetch(), options.refetch()]);
      }
    },
    onSettled: (_page, _cause, operation) => {
      if (addController.current?.signal.aborted === false) addController.current = null;
      if (operation.ownerKey !== ownerKeyRef.current || operation.epoch !== epochRef.current) return;
      pendingRef.current = false;
      setSubmitting(false);
    }
  });

  const selectedPerson = options.data?.items.find((person) => person.id === selectedUserId) ?? null;

  const submit = useCallback(() => {
    if (!canManage || pendingRef.current || mutation.isPending || !selectedPerson) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setFormError("Enter a reason for access.");
      return;
    }
    if (trimmedReason.length > MAX_REASON_LENGTH) {
      setFormError("Reason for access must be 1,000 characters or fewer.");
      return;
    }
    const fingerprint = JSON.stringify({ userId: selectedPerson.id, reason: trimmedReason });
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, idempotencyKey: createClientMessageId() };
    }
    const operation: AddOperation = {
      ownerKey,
      epoch: epochRef.current,
      userId: selectedPerson.id,
      participantName: selectedPerson.name,
      reason: trimmedReason,
      idempotencyKey: attempt.current.idempotencyKey
    };
    pendingRef.current = true;
    setSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);
    mutation.mutate(operation);
  }, [canManage, mutation, ownerKey, reason, selectedPerson]);

  const closeAdd = useCallback(() => {
    if (pendingRef.current) return;
    resetAdd();
    void queryClient.cancelQueries({ queryKey: optionPrefix });
    scheduleFocus(closeButton);
  }, [optionPrefix, queryClient, resetAdd, scheduleFocus]);

  const dismissTransientState = useCallback(() => {
    if (pendingRef.current) return true;
    if (adding) {
      closeAdd();
      return true;
    }
    if (visible) {
      onRequestClose();
      return true;
    }
    return false;
  }, [adding, closeAdd, onRequestClose, visible]);

  useImperativeHandle(ref, () => ({
    hasTransientState: () => visible || pendingRef.current,
    dismissTransientState
  }), [dismissTransientState, visible]);

  useEffect(() => {
    if (visible && !compact && !adding) scheduleFocus(closeButton);
  }, [adding, compact, scheduleFocus, visible]);

  useEffect(() => {
    if (visible && adding) scheduleFocus(searchInput);
  }, [adding, scheduleFocus, visible]);

  if (!visible) return null;

  const displayCount = participants.data?.items.length ?? participantCount;
  const closeLabel = adding ? "Back to group info" : "Close group info";
  const content = (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.surface}
      testID="chat-group-info-panel"
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting }}
          disabled={submitting}
          onPress={dismissTransientState}
          ref={closeButton}
          style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}
        >
          <ChatIcon name="back" size={24} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>
          {adding ? "Add participant" : "Group info"}
        </Text>
      </View>

      {adding ? (
        <ScrollView
          contentContainerStyle={styles.addContent}
          keyboardShouldPersistTaps="handled"
          testID="chat-group-add-content"
        >
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Search eligible people</Text>
            <TextInput
              accessibilityLabel="Search eligible people"
              autoCapitalize="none"
              maxLength={100}
              onChangeText={(value) => {
                setSearch(value);
                setSelectedUserId("");
                setFormError(null);
              }}
              placeholder="Name or role"
              placeholderTextColor={colors.inkMuted}
              ref={searchInput}
              style={styles.input}
              value={search}
            />
          </View>

          {options.isPending ? (
            <View accessibilityLabel="Loading eligible people" accessibilityRole="progressbar" style={styles.inlineState}>
              <ActivityIndicator color={chatColors.green} />
              <Text style={styles.muted}>Loading eligible people…</Text>
            </View>
          ) : options.isError ? (
            <View style={styles.inlineState}>
              <Text accessibilityLiveRegion="assertive" style={styles.error}>{queryErrorMessage(options.error)}</Text>
              {!isDenied(options.error) ? (
                <Pressable accessibilityRole="button" onPress={() => void options.refetch()} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Retry search</Text>
                </Pressable>
              ) : null}
            </View>
          ) : options.data?.items.length ? (
            <View accessibilityRole="radiogroup" style={styles.optionList}>
              {options.data.items.map((person) => {
                const selected = selectedUserId === person.id;
                const roleLabel = ROLE_LABELS[person.role];
                return (
                  <Pressable
                    accessibilityLabel={`${person.name}, ${roleLabel}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    key={person.id}
                    onPress={() => {
                      setSelectedUserId(person.id);
                      setFormError(null);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      selected ? styles.optionSelected : null,
                      pressed ? styles.pressed : null
                    ]}
                  >
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.optionAvatar}>
                      <Text style={styles.optionAvatarText}>{projectInitials(person.name)}</Text>
                    </View>
                    <View style={styles.rowCopy}>
                      <Text numberOfLines={1} style={styles.rowName}>{person.name}</Text>
                      <Text numberOfLines={1} style={styles.rowRole}>{roleLabel}</Text>
                    </View>
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.radioMark, selected ? styles.radioMarkSelected : null]} />
                  </Pressable>
                );
              })}
              {options.data.hasMore ? (
                <Text accessibilityLiveRegion="polite" style={styles.hint}>More people match. Refine your search.</Text>
              ) : null}
            </View>
          ) : (
            <Text accessibilityLiveRegion="polite" style={styles.emptyOptions}>
              No eligible active project participants match this search.
            </Text>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Reason for access</Text>
            <TextInput
              accessibilityLabel="Reason for access"
              editable={!submitting}
              maxLength={MAX_REASON_LENGTH}
              multiline
              onChangeText={(value) => {
                setReason(value);
                setFormError(null);
              }}
              placeholder="Why should this person join the conversation?"
              placeholderTextColor={colors.inkMuted}
              style={[styles.input, styles.reasonInput]}
              textAlignVertical="top"
              value={reason}
            />
            <Text style={styles.counter}>{reason.length}/{MAX_REASON_LENGTH}</Text>
          </View>

          {formError ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{formError}</Text> : null}
          <View style={styles.formActions}>
            <Pressable
              accessibilityLabel="Cancel add participant"
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              disabled={submitting}
              onPress={closeAdd}
              style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Add participant"
              accessibilityRole="button"
              accessibilityState={{ busy: submitting, disabled: submitting || !selectedPerson || !reason.trim() }}
              disabled={submitting || !selectedPerson || !reason.trim()}
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                submitting || !selectedPerson || !reason.trim() ? styles.disabled : null,
                pressed ? styles.pressed : null
              ]}
            >
              {submitting ? <ActivityIndicator color={colors.surface} size="small" /> : null}
              <Text style={styles.primaryButtonText}>Add participant</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} testID="chat-group-info-content">
          <View
            accessible
            accessibilityLabel={`${projectName}, ${displayCount} participant${displayCount === 1 ? "" : "s"}`}
            style={styles.identity}
          >
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.projectAvatar}>
              <Text style={styles.projectAvatarText}>{projectInitials(projectName) || "L"}</Text>
            </View>
            <Text numberOfLines={2} style={styles.projectName}>{projectName}</Text>
            <Text style={styles.participantCount}>{displayCount} participant{displayCount === 1 ? "" : "s"}</Text>
          </View>
          <Text style={styles.notice}>
            Shared with the client and project team. New participants can read the conversation history.
          </Text>

          {canManage ? (
            <Pressable
              accessibilityLabel="Add participant"
              accessibilityRole="button"
              onPress={() => {
                setAdding(true);
                setSuccessMessage(null);
                setFormError(null);
              }}
              style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.addButtonMark}>+</Text>
              <Text style={styles.addButtonText}>Add participant</Text>
            </Pressable>
          ) : null}

          {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

          {accessDenied ? (
            <View style={styles.state}>
              <Text accessibilityRole="header" style={styles.stateTitle}>Conversation unavailable</Text>
              <Text style={styles.muted}>This item is unavailable or your access has changed.</Text>
            </View>
          ) : participants.isPending ? (
            <View accessibilityLabel="Loading participants" accessibilityRole="progressbar" style={styles.state}>
              <ActivityIndicator color={chatColors.green} />
              <Text style={styles.muted}>Loading participants…</Text>
            </View>
          ) : participants.isError && !participants.data ? (
            <View style={styles.state}>
              <Text accessibilityLiveRegion="assertive" style={styles.error}>{queryErrorMessage(participants.error)}</Text>
              {!isDenied(participants.error) ? (
                <Pressable accessibilityRole="button" onPress={() => void participants.refetch()} style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Retry</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.participantSection}>
              {participants.isFetching ? (
                <Text accessibilityLiveRegion="polite" style={styles.refreshing}>Refreshing participants…</Text>
              ) : null}
              {participants.isError ? (
                <Pressable accessibilityRole="button" onPress={() => void participants.refetch()} style={styles.refreshWarning}>
                  <Text accessibilityLiveRegion="polite" style={styles.error}>Participants could not be refreshed. Retry</Text>
                </Pressable>
              ) : null}
              {participants.data?.setupWarnings.map((warning, index) => (
                <Text accessibilityLiveRegion="polite" key={`${index}-${warning}`} style={styles.warning}>{warning}</Text>
              ))}
              {participants.data?.items.length ? (
                <View accessibilityLabel="Participants" style={styles.participantList}>
                  {participants.data.items.map((person) => <ParticipantRow key={person.id} participant={person} />)}
                </View>
              ) : (
                <Text accessibilityLiveRegion="polite" style={styles.emptyParticipants}>No participants are currently available.</Text>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );

  if (!compact) {
    return (
      <View accessibilityViewIsModal={false} style={styles.expanded} testID="chat-group-info-expanded">
        {content}
      </View>
    );
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={dismissTransientState}
      onShow={() => scheduleFocus(closeButton)}
      presentationStyle="fullScreen"
      visible
    >
      <SafeAreaView accessibilityViewIsModal edges={["top", "bottom"]} style={styles.safeArea}>
        {content}
      </SafeAreaView>
    </Modal>
  );
});

function ParticipantRow({ participant }: { readonly participant: PresentedChatParticipant }) {
  const roleLabel = ROLE_LABELS[participant.role];
  return (
    <View
      accessible
      accessibilityLabel={`${participant.name}, ${roleLabel}`}
      style={styles.participantRow}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.participantAvatar}>
        <Text style={styles.participantAvatarText}>{projectInitials(participant.name)}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowName}>{participant.name}</Text>
        <Text numberOfLines={1} style={styles.rowRole}>{roleLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.surface },
  expanded: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    width: "100%",
    maxWidth: 800,
    alignSelf: "stretch",
    backgroundColor: colors.surface
  },
  surface: { flex: 1, minHeight: 0, backgroundColor: colors.surface },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: chatColors.border,
    backgroundColor: chatColors.header
  },
  headerButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.pill },
  headerTitle: { flex: 1, color: chatColors.ink, fontFamily: fonts.semibold, fontSize: 18 },
  content: { flexGrow: 1, paddingBottom: spacing.xxl },
  identity: { alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
  projectAvatar: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: chatColors.avatar },
  projectAvatarText: { color: chatColors.avatarInk, fontFamily: fonts.semibold, fontSize: 26 },
  projectName: { marginTop: spacing.sm, color: chatColors.ink, fontFamily: fonts.semibold, fontSize: 22, textAlign: "center" },
  participantCount: { marginTop: spacing.xxs, color: chatColors.muted, fontFamily: fonts.regular, fontSize: 14 },
  notice: { color: chatColors.muted, backgroundColor: colors.surfaceMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  addButton: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: chatColors.border },
  addButtonMark: { width: 36, height: 36, borderRadius: 18, color: colors.surface, backgroundColor: chatColors.green, fontFamily: fonts.medium, fontSize: 25, lineHeight: 36, textAlign: "center" },
  addButtonText: { color: chatColors.greenStrong, fontFamily: fonts.semibold, fontSize: 15 },
  success: { color: colors.success, backgroundColor: colors.successSoft, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  state: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  stateTitle: { color: chatColors.ink, fontFamily: fonts.semibold, fontSize: 18, textAlign: "center" },
  muted: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, textAlign: "center" },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  warning: { color: colors.warning, backgroundColor: colors.warningSoft, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  refreshing: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 12, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  refreshWarning: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.lg, backgroundColor: colors.dangerSoft },
  participantSection: { flex: 1 },
  participantList: { width: "100%" },
  participantRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: chatColors.border },
  participantAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: chatColors.avatar },
  participantAvatarText: { color: chatColors.avatarInk, fontFamily: fonts.semibold, fontSize: 15 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowName: { color: chatColors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  rowRole: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  emptyParticipants: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 13, padding: spacing.xl, textAlign: "center" },
  inlineState: { minHeight: 64, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  inlineButton: { minWidth: 80, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radii.control, borderWidth: 1, borderColor: colors.borderStrong },
  inlineButtonText: { color: colors.midnight, fontFamily: fonts.semibold, fontSize: 13 },
  addContent: { flexGrow: 1, gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxl },
  fieldGroup: { gap: 6 },
  fieldLabel: { color: chatColors.ink, fontFamily: fonts.medium, fontSize: 13 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.control, backgroundColor: colors.surface, color: chatColors.ink, fontFamily: fonts.regular, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  reasonInput: { minHeight: 104 },
  counter: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 11, textAlign: "right" },
  optionList: { borderWidth: StyleSheet.hairlineWidth, borderColor: chatColors.border, borderRadius: radii.control, overflow: "hidden" },
  option: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: chatColors.border },
  optionSelected: { backgroundColor: colors.successSoft },
  optionAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: chatColors.avatar },
  optionAvatarText: { color: chatColors.avatarInk, fontFamily: fonts.semibold, fontSize: 13 },
  radioMark: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong },
  radioMarkSelected: { borderWidth: 6, borderColor: chatColors.green },
  hint: { color: colors.info, backgroundColor: colors.infoSoft, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  emptyOptions: { color: chatColors.muted, backgroundColor: colors.surfaceMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, padding: spacing.md, borderRadius: radii.control },
  formActions: { flexDirection: "row", gap: spacing.sm, marginTop: "auto" },
  secondaryButton: { minHeight: 50, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.midnight, borderRadius: radii.control },
  secondaryButtonText: { color: colors.midnight, fontFamily: fonts.semibold, fontSize: 14 },
  primaryButton: { minHeight: 50, flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: colors.midnight, borderWidth: 1, borderColor: colors.midnight, borderRadius: radii.control },
  primaryButtonText: { color: colors.surface, fontFamily: fonts.semibold, fontSize: 14 },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.76 }
});
