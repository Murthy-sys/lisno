import { useEffect, useState, type Ref } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { ChatIcon } from "./ChatIcon";
import { CONVERSATION_SEARCH_MAX_LENGTH } from "./chatQueryKeys";

export const CONVERSATION_SEARCH_DEBOUNCE_MS = 300;

/** Returns `value` once it has stayed unchanged for `delayMs`; an empty value applies immediately. */
export function useDebouncedSearch(value: string, delayMs = CONVERSATION_SEARCH_DEBOUNCE_MS): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (!value.trim()) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

export interface ConversationSearchFieldProps {
  readonly value: string;
  readonly editable?: boolean;
  readonly inputRef?: Ref<TextInput>;
  readonly onChangeText: (value: string) => void;
  readonly onClear: () => void;
}

export function ConversationSearchField({
  value,
  editable = true,
  inputRef,
  onChangeText,
  onClear
}: ConversationSearchFieldProps) {
  return (
    <View style={[styles.field, !editable ? styles.fieldDisabled : null]} testID="conversation-search-field">
      <ChatIcon color={colors.inkMuted} name="search" size={19} />
      <TextInput
        accessibilityHint="Filters project conversations by project name"
        accessibilityLabel="Search messages"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        editable={editable}
        maxLength={CONVERSATION_SEARCH_MAX_LENGTH}
        onChangeText={onChangeText}
        placeholder="Search messages"
        placeholderTextColor={colors.inkMuted}
        ref={inputRef}
        returnKeyType="search"
        style={styles.input}
        value={value}
      />
      {value ? (
        <Pressable
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClear}
          style={({ pressed }) => [styles.clear, pressed ? styles.clearPressed : null]}
        >
          <ChatIcon color={colors.inkMuted} name="close" size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xxs,
    borderRadius: radii.surface,
    backgroundColor: colors.surfaceMuted
  },
  fieldDisabled: { opacity: 0.6 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: spacing.xs,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 14
  },
  clear: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill
  },
  clearPressed: { backgroundColor: colors.border }
});
