import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radii, spacing } from "../../ui/tokens";
import type { PresentedConversation } from "./chatModel";

export type ConversationSortMode = "recent" | "unread-first";

const SORT_OPTIONS: readonly { readonly value: ConversationSortMode; readonly label: string }[] = Object.freeze([
  { value: "recent", label: "Recent activity" },
  { value: "unread-first", label: "Unread first" }
]);

/**
 * "Recent activity" keeps the server order. "Unread first" is a stable client-side
 * reorder of the loaded conversations; it never changes paging or counts.
 */
export function sortConversations(
  conversations: readonly PresentedConversation[],
  mode: ConversationSortMode
): readonly PresentedConversation[] {
  if (mode === "recent") return conversations;
  return conversations
    .map((conversation, index) => ({ conversation, index }))
    .sort((left, right) =>
      Number(right.conversation.counts.unread > 0) - Number(left.conversation.counts.unread > 0) ||
      left.index - right.index
    )
    .map(({ conversation }) => conversation);
}

export interface ConversationSortMenuProps {
  readonly visible: boolean;
  readonly value: ConversationSortMode;
  readonly onChange: (mode: ConversationSortMode) => void;
  readonly onRequestClose: () => void;
}

export function ConversationSortMenu({ visible, value, onChange, onRequestClose }: ConversationSortMenuProps) {
  return (
    <Modal
      animationType="none"
      onRequestClose={onRequestClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close sort options"
          accessibilityRole="button"
          onPress={onRequestClose}
          style={styles.backdrop}
        />
        <View
          accessibilityLabel="Sort conversations"
          accessibilityViewIsModal
          style={styles.panel}
          testID="conversation-sort-menu"
        >
          <Text accessibilityRole="header" style={styles.title}>Sort conversations</Text>
          {SORT_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                accessibilityLabel={option.label}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, selected }}
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  onRequestClose();
                }}
                style={({ pressed }) => [styles.option, selected ? styles.optionSelected : null, pressed ? styles.optionPressed : null]}
              >
                <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>{option.label}</Text>
                <View style={[styles.radio, selected ? styles.radioSelected : null]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", paddingHorizontal: spacing.xs, paddingBottom: spacing.huge },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(31, 42, 28, 0.42)"
  },
  panel: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    gap: spacing.xxs,
    padding: spacing.sm,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12
  },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, paddingHorizontal: spacing.xs, paddingBottom: spacing.xxs },
  option: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.surface
  },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionPressed: { backgroundColor: colors.surfaceMuted },
  optionText: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  optionTextSelected: { color: colors.primary, fontFamily: fonts.semibold },
  radio: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.primary }
});
