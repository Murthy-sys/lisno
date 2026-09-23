import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LisnoWordmark } from "../../ui/brand";
import { colors, fonts, radii, spacing } from "../../ui/tokens";

export function AuthFrame({
  eyebrow,
  title,
  subtitle,
  back,
  children
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string;
  readonly back?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View accessibilityLabel="Lisno" style={styles.brand}>
            <LisnoWordmark tone="dark" width={154} />
            <Text style={styles.brandNote}>PROJECT OPERATIONS</Text>
          </View>
          <View style={styles.card}>
            {back}
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <View style={styles.body}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.authCanvas },
  keyboard: { flex: 1 },
  container: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.xxl
  },
  brand: { alignItems: "flex-start", gap: spacing.xs },
  brandNote: { color: colors.inkMuted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 2.2 },
  card: {
    borderRadius: radii.surface,
    backgroundColor: colors.authSurface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm
  },
  eyebrow: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.5 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 30, lineHeight: 34 },
  subtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  body: { gap: spacing.md, paddingTop: spacing.sm }
});
