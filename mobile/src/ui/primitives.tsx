import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
  type ViewStyle
} from "react-native";
import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fonts, radii, spacing } from "./tokens";

export function Screen({
  children,
  scroll = true,
  style
}: {
  readonly children: ReactNode;
  readonly scroll?: boolean;
  readonly style?: ViewStyle;
}) {
  const content = <View style={[styles.screenContent, style]}>{children}</View>;
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Heading({
  eyebrow,
  title,
  subtitle
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: string;
}) {
  return (
    <View style={styles.headingBlock}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Field({
  label,
  error,
  keyboardType,
  ...props
}: TextInputProps & {
  readonly label: string;
  readonly error?: string | undefined;
  readonly keyboardType?: KeyboardTypeOptions;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        keyboardType={keyboardType}
        placeholderTextColor={colors.inkMuted}
        style={[styles.field, error ? styles.fieldError : null]}
        {...props}
      />
      {error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  accessibilityHint
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly variant?: "primary" | "secondary" | "danger" | "quiet";
  readonly accessibilityHint?: string;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`${variant}Button`],
        pressed && !inactive ? styles.buttonPressed : null,
        inactive ? styles.buttonDisabled : null
      ]}
    >
      {loading ? <ActivityIndicator color={variant === "primary" ? colors.surface : colors.midnight} /> : null}
      <Text style={[styles.buttonText, styles[`${variant}ButtonText`]]}>{label}</Text>
    </Pressable>
  );
}

export function StateView({
  title,
  message,
  actionLabel,
  onAction,
  tone = "neutral"
}: {
  readonly title: string;
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly tone?: "neutral" | "error" | "denied";
}) {
  return (
    <View accessibilityLiveRegion={tone === "error" ? "assertive" : "polite"} style={styles.state}>
      <View style={[styles.stateMark, tone === "error" ? styles.stateMarkError : null]} />
      <Text accessibilityRole="header" style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: { flexGrow: 1 },
  screenContent: {
    flex: 1,
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.xl
  },
  headingBlock: { gap: spacing.xs },
  eyebrow: {
    color: colors.violet,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  heading: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 28, lineHeight: 36 },
  subtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  fieldGroup: { gap: 6 },
  fieldLabel: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14 },
  field: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  fieldError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 },
  button: {
    minHeight: 50,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
    borderWidth: 1
  },
  primaryButton: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  secondaryButton: { backgroundColor: colors.surface, borderColor: colors.midnight },
  dangerButton: { backgroundColor: colors.danger, borderColor: colors.danger },
  quietButton: { backgroundColor: "transparent", borderColor: "transparent" },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.48 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 15 },
  primaryButtonText: { color: colors.surface },
  secondaryButtonText: { color: colors.midnight },
  dangerButtonText: { color: colors.surface },
  quietButtonText: { color: colors.midnight },
  state: {
    flex: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm
  },
  stateMark: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gold },
  stateMarkError: { backgroundColor: colors.danger },
  stateTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20, textAlign: "center" },
  stateMessage: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, textAlign: "center", maxWidth: 480 }
});
