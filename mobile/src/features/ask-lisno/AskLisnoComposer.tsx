import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AskLisnoIcon, type AskLisnoIconName } from "./AskLisnoIcons";
import { askLisnoColors, askLisnoStyles as styles } from "./askLisnoStyles";

const prompts: readonly { label: string; question: string; icon: AskLisnoIconName }[] = [
  { label: "My projects", question: "Show my projects", icon: "folder" },
  { label: "Project progress", question: "Show my project progress", icon: "progress" },
  { label: "Published estimate", question: "Show my estimate", icon: "costs" }
];

export function AskLisnoComposer({ draft, disabled, busy, canMessage, messageDisabled, onChange, onSend, onPrompt, onMessage }: {
  readonly draft: string; readonly disabled: boolean; readonly busy: boolean; readonly canMessage: boolean; readonly messageDisabled: boolean;
  readonly onChange: (value: string) => void; readonly onSend: () => void; readonly onPrompt: (question: string) => void; readonly onMessage: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const minimumHeight = Math.max(28, Math.ceil(28 * fontScale));
  const maximumHeight = Math.max(100, minimumHeight);
  const [inputHeight, setInputHeight] = useState(28);
  const boundedHeight = Math.min(maximumHeight, Math.max(minimumHeight, inputHeight));
  const sendDisabled = disabled || !draft.trim();
  return <View style={styles.controls}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.promptRow}>
      {prompts.map(prompt => <Pressable key={prompt.label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => onPrompt(prompt.question)} style={({ pressed }) => [styles.prompt, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><AskLisnoIcon name={prompt.icon} size={17} /><Text style={styles.promptLabel}>{prompt.label}</Text></Pressable>)}
      {canMessage ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: messageDisabled }} disabled={messageDisabled} onPress={onMessage} style={({ pressed }) => [styles.prompt, messageDisabled && styles.disabled, pressed && !messageDisabled && styles.pressed]}><AskLisnoIcon name="team" size={17} /><Text style={styles.promptLabel}>Message your team</Text></Pressable> : null}
    </ScrollView>
    <View style={styles.composer}>
      <TextInput accessibilityLabel="Your question" placeholder="Ask about your project..." placeholderTextColor={askLisnoColors.muted} style={[styles.input, { minHeight: minimumHeight, maxHeight: maximumHeight, height: draft ? boundedHeight : minimumHeight }]} multiline maxLength={2000} value={draft} onChangeText={onChange} onContentSizeChange={({ nativeEvent }) => setInputHeight(Math.min(maximumHeight, Math.max(minimumHeight, nativeEvent.contentSize.height)))} editable={!disabled} />
      <View style={styles.actions}>
        <Pressable disabled accessibilityRole="button" accessibilityLabel="Attach file, not available yet" accessibilityHint="File attachments are not available yet" accessibilityState={{ disabled: true }} style={styles.attachment}><AskLisnoIcon name="paperclip" color={askLisnoColors.muted} /></Pressable>
        <View accessible={false} style={styles.attachmentSeparator} />
        <Pressable disabled accessibilityRole="button" accessibilityLabel="Add photo, not available yet" accessibilityHint="Photo attachments are not available yet" accessibilityState={{ disabled: true }} style={styles.attachment}><AskLisnoIcon name="photo" color={askLisnoColors.muted} /></Pressable>
        <Text accessibilityLabel="File and photo attachments: Not available yet" style={styles.unavailableHint}>Not available yet</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Send question" accessibilityState={{ disabled: sendDisabled, busy }} disabled={sendDisabled} onPress={onSend} style={({ pressed }) => [styles.send, sendDisabled && styles.disabled, pressed && !sendDisabled && styles.pressed]}><View style={styles.sendCircle}><AskLisnoIcon name="send" size={23} color={askLisnoColors.canvas} /></View></Pressable>
      </View>
    </View>
  </View>;
}
