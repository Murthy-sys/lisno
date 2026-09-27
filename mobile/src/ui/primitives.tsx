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

import { colors, fonts, radii, spacing, typography } from "./tokens";

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
  compact = false,
  labelMinHeight,
  ...props
}: TextInputProps & {
  readonly label: string;
  readonly error?: string | undefined;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly compact?: boolean;
  readonly labelMinHeight?: number;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, compact && styles.compactLabel, labelMinHeight !== undefined && { minHeight: labelMinHeight }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        keyboardType={keyboardType}
        placeholderTextColor={colors.inkMuted}
        style={[styles.field, compact && styles.compactField, error ? styles.fieldError : null]}
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
  accessibilityHint,
  size = "default"
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly variant?: "primary" | "secondary" | "danger" | "quiet";
  readonly accessibilityHint?: string;
  readonly size?: "default" | "compact";
}) {
  const inactive = disabled || loading;
  const foreground = variant === "primary" ? colors.primaryInk : variant === "danger" ? colors.danger : colors.primary;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === "compact" && styles.compactButton,
        styles[`${variant}Button`],
        pressed && !inactive ? styles[`${variant}ButtonPressed`] : null,
        inactive ? styles.buttonDisabled : null
      ]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : null}
      <Text style={[styles.buttonText, size === "compact" && styles.compactButtonText, styles[`${variant}ButtonText`]]}>{label}</Text>
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
  heading: { color: colors.ink, ...typography.pageTitle },
  subtitle: { color: colors.inkMuted, ...typography.body },
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
  compactLabel: { fontSize: 12, lineHeight: 17 },
  compactField: { minHeight: 44, fontSize: 14, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 5 },
  compactButton: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 5 },
  compactButtonText: { fontSize: 12, lineHeight: 17 },
  errorText: { color: colors.danger, fontFamily: fonts.regular, fontSize: 12 },
  button: {
    minHeight: 52,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
    borderWidth: 1
  },
  primaryButton: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondaryButton: { backgroundColor: colors.surface, borderColor: colors.primaryBorder },
  dangerButton: { backgroundColor: colors.surface, borderColor: colors.danger },
  quietButton: { backgroundColor: "transparent", borderColor: "transparent" },
  primaryButtonPressed: { backgroundColor: colors.primaryPressed, borderColor: colors.primaryPressed },
  secondaryButtonPressed: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  dangerButtonPressed: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerPressed },
  quietButtonPressed: { backgroundColor: colors.primarySoft },
  buttonDisabled: { opacity: 0.48 },
  buttonText: { ...typography.button, flexShrink: 1, textAlign: "center" },
  primaryButtonText: { color: colors.primaryInk },
  secondaryButtonText: { color: colors.ink },
  dangerButtonText: { color: colors.danger },
  quietButtonText: { color: colors.primary },
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
