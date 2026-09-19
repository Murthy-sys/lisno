import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  BackHandler,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { AuthenticatedSession } from "../../contracts/session";
import { BrandLoader } from "../../ui/brand";
import { StateView } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { ChatComposer, type ChatComposerHandle } from "./ChatComposer";
import { ChatGroupInfo, type ChatGroupInfoHandle } from "./ChatGroupInfo";
import { ChatTimeline } from "./ChatTimeline";
import { MessageActionSheet } from "./MessageActionSheet";
import { projectInitials, type PresentedChatParticipantPage, type PresentedMessage } from "./chatModel";
import { useChatThread } from "./useChatThread";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { ChatIcon } from "./ChatIcon";
import { chatColors } from "./chatTheme";

export interface ChatThreadProps {
  readonly projectId: string;
  readonly session: AuthenticatedSession;
  readonly onBack?: (() => void) | undefined;
  readonly onSendingChange?: ((sending: boolean) => void) | undefined;
  readonly compact?: boolean | undefined;
}

interface OwnedReplyTarget {
  readonly ownerKey: string;
  readonly message: PresentedMessage;
}

export function ChatThread({ projectId, session, onBack, onSendingChange, compact: compactOverride }: ChatThreadProps) {
  const { width } = useWindowDimensions();
  const compact = compactOverride ?? width < 600;
  const thread = useChatThread(projectId, session);
  const navigationGuard = useScaffoldNavigationGuard();
  const [replyTarget, setReplyTarget] = useState<OwnedReplyTarget | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [composerOverlayOpen, setComposerOverlayOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [participantAnnouncement, setParticipantAnnouncement] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const composer = useRef<ChatComposerHandle | null>(null);
  const groupInfo = useRef<ChatGroupInfoHandle | null>(null);
  const headerIdentity = useRef<View>(null);
  const headerFocusRequest = useRef<number | null>(null);
  const actionOriginHandle = useRef<number | null>(null);
  const reply = replyTarget?.ownerKey === thread.ownerKey ? replyTarget.message : null;
  const selectedMessage = useMemo(
    () => thread.messages.find((message) => message.id === selectedMessageId) ?? null,
    [selectedMessageId, thread.messages]
  );
  const canSend = Boolean(
    thread.summary?.capabilities.canSend &&
    session.authorization.permissions.includes("chat.send")
  );
  const canManageParticipants = Boolean(
    thread.summary?.capabilities.canManageParticipants &&
    session.authorization.permissions.includes("chat.participants.manage")
  );
  const handleReply = useCallback((message: PresentedMessage) => {
    setReplyTarget({ ownerKey: thread.ownerKey, message });
  }, [thread.ownerKey]);
  const clearReply = useCallback(() => setReplyTarget(null), []);
  const openMessageActions = useCallback((message: PresentedMessage, originHandle: number | null) => {
    actionOriginHandle.current = originHandle;
    setSelectedMessageId(message.id);
  }, []);

  useEffect(() => {
    setReplyTarget(null);
    setSelectedMessageId(null);
    setHeaderMenuOpen(false);
    setGroupInfoOpen(false);
    setParticipantAnnouncement(null);
  }, [thread.ownerKey]);

  useEffect(() => {
    if (!canSend) clearReply();
  }, [canSend, clearReply]);

  useEffect(() => () => {
    if (headerFocusRequest.current !== null) cancelAnimationFrame(headerFocusRequest.current);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setAppActive(state === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!participantAnnouncement) return;
    const timeout = setTimeout(() => setParticipantAnnouncement(null), 5_000);
    return () => clearTimeout(timeout);
  }, [participantAnnouncement]);

  useEffect(() => {
    thread.setReadActive(appActive && !selectedMessageId && !composerOverlayOpen && !headerMenuOpen && !groupInfoOpen);
  }, [appActive, composerOverlayOpen, groupInfoOpen, headerMenuOpen, selectedMessageId, thread.setReadActive]);

  useEffect(() => {
    navigationGuard?.setBlocked(sending);
    onSendingChange?.(sending);
    return () => {
      navigationGuard?.setBlocked(false);
      onSendingChange?.(false);
    };
  }, [navigationGuard, onSendingChange, sending]);

  const handleBack = useCallback(() => {
    if (groupInfo.current?.dismissTransientState()) return true;
    if (sending) return true;
    if (headerMenuOpen) {
      setHeaderMenuOpen(false);
      return true;
    }
    if (composer.current?.dismissTransientState()) return true;
    if (reply) {
      clearReply();
      return true;
    }
    if (onBack) {
      onBack();
      return true;
    }
    return false;
  }, [clearReply, headerMenuOpen, onBack, reply, sending]);

  useEffect(() => {
    if (!reply && !onBack && !canSend && !groupInfoOpen && !headerMenuOpen && !selectedMessageId) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => subscription.remove();
  }, [canSend, groupInfoOpen, handleBack, headerMenuOpen, onBack, reply, selectedMessageId]);

  const openGroupInfo = useCallback(() => {
    setHeaderMenuOpen(false);
    setGroupInfoOpen(true);
  }, []);

  const restoreHeaderFocus = useCallback(() => {
    if (headerFocusRequest.current !== null) cancelAnimationFrame(headerFocusRequest.current);
    headerFocusRequest.current = requestAnimationFrame(() => {
      headerFocusRequest.current = null;
      const handle = findNodeHandle(headerIdentity.current);
      if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }, []);

  const handleParticipantsChanged = useCallback((page: PresentedChatParticipantPage) => {
    return thread.refreshParticipantContext(page.items.length);
  }, [thread.refreshParticipantContext]);

  const handleParticipantDenied = useCallback(() => {
    setGroupInfoOpen(false);
    void thread.revokeAccess();
  }, [thread.revokeAccess]);

  const closeMessageActions = useCallback(() => {
    setSelectedMessageId(null);
    const handle = actionOriginHandle.current;
    actionOriginHandle.current = null;
    if (handle !== null) {
      requestAnimationFrame(() => AccessibilityInfo.setAccessibilityFocus(handle));
    }
  }, []);

  if (thread.denied) {
    return (
      <SafeAreaView edges={compact ? ["top", "bottom"] : []} style={styles.safeArea}>
        <ThreadHeader compact={compact} initials="" name="Conversation" participantCount={null} openCritical={0} onBack={onBack ? handleBack : undefined} onOpenMenu={() => void thread.refresh()} refreshing={false} />
        <StateView tone="denied" title="This conversation is unavailable" message="It may be outside your project scope or no longer available." />
      </SafeAreaView>
    );
  }

  if (thread.loading && !thread.summary) {
    return (
      <SafeAreaView edges={compact ? ["top", "bottom"] : []} style={styles.safeArea}>
        <View style={styles.loading}><BrandLoader label="Loading conversation" tone="dark" /></View>
      </SafeAreaView>
    );
  }

  if (thread.error && !thread.summary) {
    return (
      <SafeAreaView edges={compact ? ["top", "bottom"] : []} style={styles.safeArea}>
        <ThreadHeader compact={compact} initials="" name="Conversation" participantCount={null} openCritical={0} onBack={onBack ? handleBack : undefined} onOpenMenu={() => void thread.refresh()} refreshing={false} />
        <StateView tone="error" title="Conversation could not be loaded" message={thread.error} actionLabel="Retry" onAction={() => void thread.refresh()} />
      </SafeAreaView>
    );
  }

  const summary = thread.summary;
  const projectName = summary?.project.name ?? "Project conversation";
  return (
    <SafeAreaView edges={compact ? ["top", "bottom"] : []} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
        style={styles.keyboard}
      >
        <ThreadHeader
          compact={compact}
          identityRef={headerIdentity}
          initials={projectInitials(projectName)}
          name={projectName}
          participantCount={summary?.participantCount ?? null}
          openCritical={summary?.counts.openCritical ?? 0}
          onBack={onBack ? handleBack : undefined}
          onOpenGroupInfo={openGroupInfo}
          onOpenMenu={() => setHeaderMenuOpen(true)}
          refreshing={thread.refreshing}
        />
        {participantAnnouncement ? (
          <View style={styles.successNotice}>
            <Text accessibilityLiveRegion="polite" style={styles.successNoticeText}>{participantAnnouncement}</Text>
          </View>
        ) : null}
        {thread.error ? (
          <Pressable accessibilityRole="button" onPress={() => void thread.refresh()} style={styles.warning}>
            <Text accessibilityLiveRegion="polite" style={styles.warningText}>{thread.error} · Retry</Text>
          </Pressable>
        ) : null}
        {thread.readError ? (
          <Pressable accessibilityRole="button" onPress={thread.retryRead} style={styles.readWarning}>
            <Text accessibilityLiveRegion="polite" style={styles.readWarningText}>{thread.readError}</Text>
          </Pressable>
        ) : null}
        <ChatTimeline
          key={thread.ownerKey}
          messages={thread.messages}
          currentUserId={session.user.id}
          lastReadSequence={summary?.lastReadSequence ?? 0}
          compact={compact}
          hasOlderHistory={thread.hasOlderHistory}
          loadingOlder={thread.loadingOlder}
          olderError={thread.olderError}
          newMessagesAvailable={thread.newMessagesAvailable}
          scrollToEndRequest={thread.scrollToEndRequest}
          onLoadOlder={() => void thread.loadOlder()}
          onOpenActions={openMessageActions}
          onReply={canSend ? handleReply : undefined}
          onNearBottomChange={thread.setNearBottom}
          onClearNewMessages={thread.clearNewMessages}
          onVisibleMessagesChange={thread.acknowledgeVisible}
          onDenied={thread.revokeAccess}
        />
        {canSend ? (
          <ChatComposer
            ref={composer}
            compact={compact}
            projectId={projectId}
            session={session}
            reply={reply}
            onCancelReply={clearReply}
            onDenied={() => void thread.revokeAccess()}
            onSent={async () => {
              await thread.refresh();
              thread.clearNewMessages();
            }}
            onSendingChange={setSending}
            onOverlayChange={setComposerOverlayOpen}
          />
        ) : (
          <View accessibilityRole="text" style={styles.readOnly}>
            <Text style={styles.readOnlyText}>You can read this conversation, but sending is unavailable for your project access.</Text>
          </View>
        )}
        <MessageActionSheet
          projectId={projectId}
          message={selectedMessage}
          session={session}
          visible={Boolean(selectedMessage)}
          canReply={canSend}
          onClose={closeMessageActions}
          onReply={handleReply}
          onRefresh={thread.refresh}
          onDenied={thread.revokeAccess}
        />
        <ChatGroupInfo
          ref={groupInfo}
          visible={groupInfoOpen}
          compact={compact}
          projectId={projectId}
          projectName={projectName}
          participantCount={summary?.participantCount ?? 0}
          session={session}
          canManage={canManageParticipants}
          onRequestClose={() => setGroupInfoOpen(false)}
          onDenied={handleParticipantDenied}
          onParticipantsChanged={handleParticipantsChanged}
          onParticipantAdded={(name) => {
            const announcement = `${name} was added to the conversation.`;
            setParticipantAnnouncement(announcement);
            AccessibilityInfo.announceForAccessibility(announcement);
          }}
          onRestoreFocus={restoreHeaderFocus}
        />
        <Modal animationType="fade" onRequestClose={() => setHeaderMenuOpen(false)} transparent visible={headerMenuOpen}>
          <View style={styles.menuOverlay}>
            <Pressable accessibilityLabel="Close conversation options" accessibilityRole="button" onPress={() => setHeaderMenuOpen(false)} style={styles.menuBackdrop} />
            <View accessibilityViewIsModal style={styles.menuSheet}>
              <Text accessibilityRole="header" style={styles.menuTitle}>Conversation options</Text>
              <Pressable
                accessibilityLabel="Group info"
                accessibilityRole="button"
                onPress={openGroupInfo}
                style={({ pressed }) => [styles.menuAction, pressed ? styles.pressed : null]}
              >
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.menuInfoIcon}>
                  <Text style={styles.menuInfoIconText}>i</Text>
                </View>
                <Text style={styles.menuActionText}>Group info</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: thread.refreshing }}
                disabled={thread.refreshing}
                onPress={() => {
                  setHeaderMenuOpen(false);
                  void thread.refresh();
                }}
                style={({ pressed }) => [styles.menuAction, pressed ? styles.pressed : null]}
              >
                <ChatIcon color={chatColors.green} name="refresh" size={20} />
                <Text style={styles.menuActionText}>Refresh conversation</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ThreadHeader({ compact, identityRef, initials, name, participantCount, openCritical, onBack, onOpenGroupInfo, onOpenMenu, refreshing }: {
  readonly compact: boolean;
  readonly identityRef?: RefObject<View | null> | undefined;
  readonly initials: string;
  readonly name: string;
  readonly participantCount: number | null;
  readonly openCritical: number;
  readonly onBack?: (() => void) | undefined;
  readonly onOpenGroupInfo?: (() => void) | undefined;
  readonly onOpenMenu: () => void;
  readonly refreshing: boolean;
}) {
  const subtitle = participantCount === null ? "Project conversation" : `${participantCount} participant${participantCount === 1 ? "" : "s"}`;
  const identity = (
    <>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.avatar}><Text style={styles.avatarText}>{initials || "L"}</Text></View>
      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.name}>{name}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
      </View>
    </>
  );
  return (
    <View style={[styles.header, compact ? styles.compactHeader : null]}>
      {onBack ? <Pressable accessibilityLabel="Back to conversations" accessibilityRole="button" hitSlop={4} onPress={onBack} style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}><ChatIcon name="back" size={25} /></Pressable> : null}
      {onOpenGroupInfo ? (
        <Pressable
          ref={identityRef}
          accessibilityHint="Shows project participants"
          accessibilityLabel={`Open group info, ${name}, ${subtitle}`}
          accessibilityRole="button"
          onPress={onOpenGroupInfo}
          style={({ pressed }) => [styles.headerIdentity, pressed ? styles.pressed : null]}
        >
          {identity}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`${name}, ${subtitle}`} style={styles.headerIdentity}>{identity}</View>
      )}
      {openCritical > 0 ? <View style={styles.criticalPill}><Text style={styles.critical}>{`Critical ${openCritical}`}</Text></View> : null}
      <Pressable accessibilityLabel={refreshing ? "Refreshing conversation" : "Open conversation options"} accessibilityRole="button" accessibilityState={{ busy: refreshing }} disabled={refreshing} hitSlop={4} onPress={onOpenMenu} style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}>{refreshing ? <ActivityIndicator color={chatColors.green} size="small" /> : <ChatIcon name="more" size={23} />}</Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, minHeight: 0, backgroundColor: chatColors.canvas },
  keyboard: { flex: 1, minHeight: 0 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: chatColors.border, backgroundColor: chatColors.header, zIndex: 2 },
  compactHeader: { minHeight: 64, paddingHorizontal: spacing.xs },
  headerButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.pill },
  headerIdentity: { minHeight: 48, flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radii.control },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: chatColors.avatar },
  avatarText: { color: chatColors.avatarInk, fontFamily: fonts.semibold, fontSize: 15, letterSpacing: 0.2 },
  headerCopy: { flex: 1, minWidth: 0, gap: 1 },
  name: { color: chatColors.ink, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21 },
  subtitle: { flexShrink: 1, color: chatColors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  criticalPill: { minHeight: 34, justifyContent: "center", borderRadius: 17, backgroundColor: chatColors.criticalSoft, paddingHorizontal: 10 },
  critical: { color: chatColors.critical, fontFamily: fonts.semibold, fontSize: 11 },
  warning: { minHeight: 38, justifyContent: "center", backgroundColor: colors.warningSoft, paddingHorizontal: spacing.md },
  warningText: { color: colors.warning, fontFamily: fonts.medium, fontSize: 11 },
  successNotice: { minHeight: 38, justifyContent: "center", backgroundColor: colors.successSoft, paddingHorizontal: spacing.md },
  successNoticeText: { color: chatColors.greenStrong, fontFamily: fonts.medium, fontSize: 11 },
  readWarning: { minHeight: 38, justifyContent: "center", backgroundColor: colors.dangerSoft, paddingHorizontal: spacing.md },
  readWarningText: { color: colors.danger, fontFamily: fonts.medium, fontSize: 11 },
  readOnly: { minHeight: 52, justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  readOnlyText: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17 },
  menuOverlay: { flex: 1, alignItems: "flex-end", justifyContent: "flex-start", paddingTop: 72, paddingRight: spacing.sm },
  menuBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(11,20,26,0.18)" },
  menuSheet: { width: 236, borderRadius: 8, backgroundColor: colors.surface, paddingVertical: spacing.xs, elevation: 8, shadowColor: "#0B141A", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  menuTitle: { color: chatColors.muted, fontFamily: fonts.medium, fontSize: 11, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: 4 },
  menuAction: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  menuInfoIcon: { width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1.5, borderColor: chatColors.green },
  menuInfoIconText: { color: chatColors.green, fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
  menuActionText: { color: chatColors.ink, fontFamily: fonts.medium, fontSize: 13 },
  pressed: { opacity: 0.72 }
});
