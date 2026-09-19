import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LisnoWordmark } from "../../ui/brand";
import { colors, fonts, radii, spacing } from "../../ui/tokens";

export function AuthFrame({
  eyebrow,
  title,
  subtitle,
  children
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.backgroundAccent} />
        <View style={styles.container}>
          <View accessibilityLabel="Lisno" style={styles.brand}>
            <LisnoWordmark tone="light" width={154} />
            <Text style={styles.brandNote}>PROJECT OPERATIONS</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <View style={styles.body}>{children}</View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.midnight },
  keyboard: { flex: 1 },
  backgroundAccent: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    right: -190,
    top: -80,
    backgroundColor: colors.midnightRaised,
    opacity: 0.8
  },
  container: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.xxl
  },
  brand: { alignItems: "flex-start", gap: spacing.xs },
  brandNote: { color: colors.gold, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 2.2 },
  card: {
    borderRadius: radii.surface,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.sm,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8
  },
  eyebrow: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.5 },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 27, lineHeight: 34 },
  subtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  body: { gap: spacing.md, paddingTop: spacing.sm }
});
