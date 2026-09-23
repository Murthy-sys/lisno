import { router } from "expo-router";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ROLE_LABELS } from "../contracts/authorization";
import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { LisnoWordmark } from "../ui/brand";
import { BackButton } from "../ui/BackButton";
import { colors, fonts, radii, spacing } from "../ui/tokens";
import { NavigationIcon, RootTabIcon } from "./NavigationIcon";
import { rootTabsForAuthorization, type FeatureId, type RootTab } from "./registry";
import { scaffoldNavigationMode } from "./scaffoldLayout";
import { useScreenBack } from "./useScreenBack";

function routeForTab(tab: RootTab): string {
  return tab.id === "more" ? "/more" : tab.destination?.path ?? "/";
}

interface ScaffoldNavigationGuardValue {
  setBlocked(value: boolean): void;
}

const ScaffoldNavigationGuardContext = createContext<ScaffoldNavigationGuardValue | null>(null);

export function useScaffoldNavigationGuard(): ScaffoldNavigationGuardValue | null {
  return useContext(ScaffoldNavigationGuardContext);
}

function NavigationButton({ tab, selected, compact, disabled }: { readonly tab: RootTab; readonly selected: boolean; readonly compact: boolean; readonly disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={() => router.replace(routeForTab(tab) as never)}
      style={({ pressed }) => [styles.navButton, compact ? styles.navButtonCompact : styles.navButtonRail, selected && !compact ? styles.navButtonSelected : null, pressed ? styles.pressed : null, disabled ? styles.disabled : null]}
    >
      <View style={[styles.navIcon, compact && selected ? styles.navIconSelected : null]}>
        <RootTabIcon tab={tab} selected={selected} color={selected ? colors.shellInk : colors.shellMuted} />
      </View>
      {!compact ? <Text numberOfLines={2} style={[styles.navLabel, selected ? styles.navLabelSelected : null]}>{tab.label}</Text> : null}
    </Pressable>
  );
}

export function AdaptiveAppScaffold({
  activeFeature,
  more = false,
  navigationRailBreakpoint = 600,
  immersiveBelowWidth,
  children
}: {
  readonly activeFeature?: FeatureId;
  readonly more?: boolean;
  readonly navigationRailBreakpoint?: number;
  readonly immersiveBelowWidth?: number;
  readonly children: ReactNode;
}) {
  const context = useConfiguredRuntime();
  const { width } = useWindowDimensions();
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const back = useScreenBack({ blocked: navigationBlocked });
  const navigationGuard = useMemo(
    () => ({ setBlocked: setNavigationBlocked }),
    []
  );
  const navigationMode = scaffoldNavigationMode(
    width,
    navigationRailBreakpoint,
    immersiveBelowWidth
  );
  const authenticated = context.session.status === "authenticated" ? context.session.session : null;
  if (!authenticated) {
    router.replace("/sign-in");
    return null;
  }
  const tabs = rootTabsForAuthorization(authenticated.user.role, authenticated.authorization);

  return (
    <SafeAreaView
      edges={navigationMode === "immersive" ? [] : ["top", "left", "right", "bottom"]}
      style={styles.safeArea}
    >
      {navigationMode !== "immersive" ? (
        <View style={styles.topBar}>
          <LisnoWordmark tone="light" width={112} />
          <View style={styles.identity}>
            <View style={styles.identityCopy}>
              <Text numberOfLines={1} style={styles.userName}>{authenticated.user.name}</Text>
              <Text numberOfLines={1} style={styles.roleLabel}>{ROLE_LABELS[authenticated.user.role]}</Text>
            </View>
            <Pressable accessibilityLabel="Open notifications" accessibilityRole="button" accessibilityState={{ disabled: navigationBlocked }} disabled={navigationBlocked} onPress={() => router.push("/feature/notifications")} style={[styles.notificationButton, navigationBlocked ? styles.disabled : null]}>
              <NavigationIcon name="notifications" color={colors.shellInk} />
            </Pressable>
          </View>
        </View>
      ) : null}
      <View style={styles.body}>
        {navigationMode === "rail" ? (
          <View accessibilityRole="tablist" style={styles.rail}>
            {tabs.map((tab) => <NavigationButton key={tab.id} tab={tab} compact={false} disabled={navigationBlocked} selected={more ? tab.id === "more" : tab.destination?.id === activeFeature} />)}
          </View>
        ) : null}
        <ScaffoldNavigationGuardContext.Provider value={navigationGuard}>
          <View style={styles.content}>
            {back.visible && navigationMode !== "immersive" ? (
              <View style={styles.backBar}><BackButton onPress={back.onBack} disabled={back.disabled} /></View>
            ) : null}
            {children}
          </View>
        </ScaffoldNavigationGuardContext.Provider>
      </View>
      {navigationMode === "tabs" ? (
        <View accessibilityRole="tablist" style={styles.bottomBar}>
          {tabs.map((tab) => <NavigationButton key={tab.id} tab={tab} compact disabled={navigationBlocked} selected={more ? tab.id === "more" : tab.destination?.id === activeFeature} />)}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.shell },
  topBar: { minHeight: 70, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.shell, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  identity: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.sm, flex: 1 },
  identityCopy: { maxWidth: 180, alignItems: "flex-end" },
  userName: { color: colors.shellInk, fontFamily: fonts.semibold, fontSize: 13 },
  roleLabel: { color: colors.shellMuted, fontFamily: fonts.regular, fontSize: 11 },
  notificationButton: { minWidth: 48, minHeight: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center", backgroundColor: colors.shellRaised },
  body: { flex: 1, flexDirection: "row", backgroundColor: colors.canvas },
  rail: { width: 176, padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.shell },
  content: { flex: 1, backgroundColor: colors.canvas },
  backBar: { paddingHorizontal: spacing.xs, backgroundColor: colors.canvas },
  bottomBar: { minHeight: 64, flexDirection: "row", backgroundColor: colors.shell, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  navButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  navButtonCompact: { flex: 1, paddingHorizontal: spacing.xxs },
  navButtonRail: { flexDirection: "row", justifyContent: "flex-start", gap: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radii.control },
  navButtonSelected: { backgroundColor: colors.shellSelected },
  navIcon: { width: 48, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radii.control, borderWidth: 1, borderColor: "transparent" },
  navIconSelected: { backgroundColor: colors.shellSelected, borderColor: colors.accent },
  navLabel: { flex: 1, color: colors.shellMuted, fontFamily: fonts.medium, fontSize: 13, textAlign: "left" },
  navLabelSelected: { color: colors.shellInk, fontFamily: fonts.semibold },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 }
});
