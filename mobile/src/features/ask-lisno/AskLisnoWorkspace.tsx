import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { useScaffoldNavigationBlocked } from "../../navigation/AdaptiveAppScaffold";
import { colors } from "../../ui/tokens";
import { AskLisnoAnswer } from "./AskLisnoAnswer";
import { AskLisnoComposer } from "./AskLisnoComposer";
import { AskLisnoHeader } from "./AskLisnoHeader";
import { AskLisnoAssistantMessage, AskLisnoError, AskLisnoUserMessage } from "./AskLisnoMessage";
import { askLisnoStyles as styles } from "./askLisnoStyles";
import { useAskLisno } from "./useAskLisno";

export const canUseAskLisno = (session: AuthenticatedSession) => session.user.role === "client" && canPerformOperation(session, "POST /client/ask-lisno");

export function AskLisnoEntry({ session, projectId }: { readonly session: AuthenticatedSession; readonly projectId?: string }) {
  const blocked = useScaffoldNavigationBlocked();
  if (!canUseAskLisno(session)) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Ask Lisno" accessibilityHint="Open your private project assistant" disabled={blocked} accessibilityState={{ disabled: blocked }} style={({ pressed }) => [styles.entry, pressed && !blocked && styles.entryPressed, blocked && styles.disabled]} onPress={() => {
    if (!blocked) router.push(projectId ? `/feature/ask-lisno?projectId=${encodeURIComponent(projectId)}` : "/feature/ask-lisno");
  }}>
    <Svg width={28} height={28} viewBox="0 0 24 24" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M7 4.5h10a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H9l-5 3v-5.4a4 4 0 0 1-1-2.6v-5a4 4 0 0 1 4-4Z" fill="none" stroke={colors.primaryInk} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={8.5} cy={10} r={1.1} fill={colors.primaryInk} />
      <Circle cx={15.5} cy={10} r={1.1} fill={colors.primaryInk} />
      <Path d="M8.5 13.5c1.8 1.5 5.2 1.5 7 0" fill="none" stroke={colors.primaryInk} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  </Pressable>;
}

export function AskLisnoWorkspace({ session, initialProjectId }: { readonly session: AuthenticatedSession; readonly initialProjectId?: string }) {
  const context = useConfiguredRuntime();
  if (!canUseAskLisno(session) || context.session.status !== "authenticated" || !context.session.session || context.session.session.user.id !== session.user.id || !canUseAskLisno(context.session.session)) return <View style={styles.screen}><AskLisnoHeader /><View style={styles.content}><Text accessibilityRole="alert" style={styles.body}>Ask Lisno is unavailable for your current account.</Text></View></View>;
  return <Conversation key={`${context.environment.environment.id}:${context.environment.generation}:${context.session.generation}:${session.user.id}:${initialProjectId ?? "account"}`} session={session} {...(initialProjectId ? { initialProjectId } : {})} />;
}

function Conversation({ session, initialProjectId }: { readonly session: AuthenticatedSession; readonly initialProjectId?: string }) {
  const context = useConfiguredRuntime();
  const insets = useSafeAreaInsets();
  const state = useAskLisno(context.runtime, initialProjectId);
  const blocked = useScaffoldNavigationBlocked();
  const scroll = useRef<ScrollView>(null);
  const followLatest = useRef(true);
  const [welcomeCreatedAt] = useState(() => new Date().toISOString());
  const unavailable = state.access !== "ready";
  const disabled = blocked || unavailable || state.busy || state.pagingId !== null;
  const canMessage = canPerformOperation(session, "GET /projects/:projectId/chat");
  const firstName = session.user.name.trim().split(/\s+/)[0] || "there";
  const send = (options?: Parameters<typeof state.send>[0]) => {
    if (disabled) return;
    followLatest.current = true;
    void state.send(options);
  };
  function followConversation() {
    if (followLatest.current) scroll.current?.scrollToEnd({ animated: false });
  }
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}>
    <AskLisnoHeader />
    <ScrollView ref={scroll} testID="ask-lisno-transcript" style={styles.transcript} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content} onContentSizeChange={followConversation} onLayout={followConversation} scrollEventThrottle={32} onScroll={({ nativeEvent }) => {
      followLatest.current = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y <= 72;
    }}>
      {state.notice ? <Text accessibilityRole="alert" style={styles.error}>{state.notice}</Text> : null}
      {unavailable ? <AskLisnoAssistantMessage><Text accessibilityLiveRegion="polite" style={styles.body}>{state.access === "error" ? "Your conversation access could not be checked." : "Checking access to your conversation…"}</Text>{state.access === "error" ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked }} disabled={blocked} style={({ pressed }) => [styles.option, blocked && styles.disabled, pressed && !blocked && styles.pressed]} onPress={() => { if (!blocked) void state.verify(); }}><Text style={styles.body}>Retry conversation</Text></Pressable> : null}</AskLisnoAssistantMessage> : <>
        <AskLisnoAssistantMessage createdAt={welcomeCreatedAt}><Text style={styles.greeting}>Hi {firstName} <Text accessibilityLabel="waving hand">👋</Text></Text><Text style={styles.body}>Ask about your projects, progress, timelines or published estimates. This conversation stays private and is not posted in Project messages.</Text></AskLisnoAssistantMessage>
        {state.turns.map((turn, index) => <View key={turn.id} style={styles.stack}>
          <AskLisnoUserMessage turn={turn} />
          {turn.response ? <AskLisnoAssistantMessage><AskLisnoAnswer turn={turn} disabled={disabled} canChoose={index === state.turns.length - 1} paging={state.pagingId === turn.id} onRefreshPrice={() => send({ suggestion: turn.message, ...(turn.response?.projectId ? { choiceProjectId: turn.response.projectId } : {}) })} onChoose={id => send({ retry: turn, choiceProjectId: id })} onProject={id => send({ choiceProjectId: id, suggestion: "Show my project progress" })} onLoad={refresh => { if (!disabled) void state.loadProjects(turn, refresh); }} /></AskLisnoAssistantMessage> : null}
          {turn.error ? <AskLisnoError turn={turn} disabled={disabled} canRetry={index === state.turns.length - 1} onRetry={() => send({ retry: turn })} /> : null}
        </View>)}
      </>}
      {state.busy && !unavailable ? <AskLisnoAssistantMessage><Text accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={styles.body}>Lisno is checking your request…</Text></AskLisnoAssistantMessage> : null}
    </ScrollView>
    <AskLisnoComposer draft={unavailable ? "" : state.draft} disabled={disabled} busy={state.busy} canMessage={canMessage} messageDisabled={blocked || unavailable} onChange={state.setDraft} onSend={() => send()} onPrompt={suggestion => send({ suggestion })} onMessage={() => {
      if (!blocked && !unavailable) router.push(state.contextProjectId ? { pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId: state.contextProjectId } } : "/feature/messages");
    }} />
  </KeyboardAvoidingView>;
}
