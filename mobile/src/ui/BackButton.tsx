import { Pressable, StyleSheet, Text } from "react-native";
import Svg, { Path } from "react-native-svg";

import { colors, fonts, spacing } from "./tokens";

export function BackButton({ onPress, disabled = false, accessibilityLabel = "Back", accessibilityHint }: {
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled ? styles.disabled : null]}>
      <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
        <Path d="M15 5l-7 7 7 7M8 12h13" fill="none" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <Text style={styles.label}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: 48, minHeight: 48, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start" },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, flexShrink: 1 },
  disabled: { opacity: 0.45 }
});
