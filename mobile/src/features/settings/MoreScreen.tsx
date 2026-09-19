import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AdaptiveAppScaffold } from "../../navigation/AdaptiveAppScaffold";
import { destinationsForAuthorization, rootTabsForAuthorization } from "../../navigation/registry";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { Button } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";

export function MoreScreen() {
  const context = useConfiguredRuntime();
  const authenticated = context.session.status === "authenticated" ? context.session.session : null;
  if (!authenticated) {
    router.replace("/sign-in");
    return null;
  }
  const tabs = rootTabsForAuthorization(authenticated.user.role, authenticated.authorization);
  const tabFeatures = new Set(tabs.flatMap((tab) => tab.destination ? [tab.destination.id] : []));
  const additional = destinationsForAuthorization(authenticated.user.role, authenticated.authorization)
    .filter((destination) => !tabFeatures.has(destination.id));

  return (
    <AdaptiveAppScaffold more>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>ACCOUNT & TOOLS</Text>
          <Text accessibilityRole="header" style={styles.title}>More</Text>
          <Text style={styles.subtitle}>Additional workspaces are shown only when your current authorization policy permits them.</Text>
        </View>
        {additional.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Workspaces</Text>
            {additional.map((destination) => (
              <Pressable key={`${destination.id}-${destination.permission}`} accessibilityRole="button" onPress={() => router.push(destination.path as never)} style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
                <View style={styles.rowMark} />
                <Text style={styles.rowLabel}>{destination.label}</Text>
                <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.accountCard}>
            <Text style={styles.accountName}>{authenticated.user.name}</Text>
            <Text style={styles.accountEmail}>{authenticated.user.email}</Text>
          </View>
          <Button label="Sign out" variant="secondary" onPress={() => void context.runtime.session.logout().then(() => router.replace("/sign-in"))} />
        </View>
      </ScrollView>
    </AdaptiveAppScaffold>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, width: "100%", maxWidth: 860, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.xl },
  heading: { gap: spacing.xs },
  eyebrow: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4 },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 28 },
  subtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.inkMuted, fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" },
  row: { minHeight: 62, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm },
  pressed: { opacity: 0.7 },
  rowMark: { width: 8, height: 28, borderRadius: 4, backgroundColor: colors.violet },
  rowLabel: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  chevron: { color: colors.violet, fontSize: 26 },
  accountCard: { borderRadius: radii.control, backgroundColor: colors.surfaceMuted, padding: spacing.md, gap: 4 },
  accountName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  accountEmail: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12 }
});
