import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { AskLisnoMark } from "./AskLisnoIcons";
import { askLisnoStyles as styles } from "./askLisnoStyles";
import type { AskLisnoTurn } from "./useAskLisno";

function messageTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function AskLisnoAssistantMessage({ children, createdAt }: { readonly children: ReactNode; readonly createdAt?: string }) {
  return <View style={styles.assistantRow}>
    <View style={styles.avatar}><AskLisnoMark size={26} /></View>
    <View style={styles.assistantColumn}>
      <View style={styles.bubble}><View accessible={false} pointerEvents="none" style={styles.bubbleTail} />{children}</View>
      {createdAt ? <Text style={styles.messageTime}>{messageTime(createdAt)}</Text> : null}
    </View>
  </View>;
}

export function AskLisnoUserMessage({ turn }: { readonly turn: AskLisnoTurn }) {
  return <View style={styles.question}>
    <Text accessibilityLabel={`You: ${turn.message}`} style={styles.questionBody}>{turn.message}</Text>
    <View style={styles.questionMeta}>
      <Text style={styles.questionTime}>{messageTime(turn.createdAt)}</Text>
      {turn.response ? <Text style={styles.answered}>Answered</Text> : null}
    </View>
  </View>;
}

export function AskLisnoError({ turn, canRetry, disabled, onRetry }: { readonly turn: AskLisnoTurn; readonly canRetry: boolean; readonly disabled: boolean; readonly onRetry: () => void }) {
  const titles = {
    busy: "Lisno is receiving too many requests.",
    usage_limit: "Lisno has reached its usage limit.",
    timeout: "Lisno needs a little more time.",
    invalid_answer: "Lisno could not verify this answer.",
    paused: "Your answer was paused.",
    unavailable: "Lisno could not answer right now."
  } as const;
  const helper = turn.errorKind === "busy" ? "Please try again shortly." : turn.errorKind === "usage_limit" ? "Please try again later." : turn.errorKind === "paused" ? "Retry when you are ready." : turn.error;
  return <View style={styles.errorCard}>
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.errorBadge}><Text style={styles.errorMark}>!</Text></View>
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorCopy}>
      <Text style={styles.errorTitle}>{titles[turn.errorKind ?? "unavailable"]}</Text>
      <Text style={styles.errorHelper}>{helper}</Text>
    </View>
    {canRetry ? <Pressable accessibilityRole="button" accessibilityLabel="Retry" accessibilityHint="Retry your unanswered question" accessibilityState={{ disabled }} disabled={disabled} onPress={onRetry} style={({ pressed }) => [styles.retry, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={styles.retryLabel}>Retry</Text></Pressable> : null}
  </View>;
}
