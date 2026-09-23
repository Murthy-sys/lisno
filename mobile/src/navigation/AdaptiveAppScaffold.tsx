import { router, useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ROLE_LABELS } from "../contracts/authorization";
import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { LisnoWordmark } from "../ui/brand";
import { BackButton } from "../ui/BackButton";
import { AppModalBackdrop } from "../ui/AppModalBackdrop";
import { ChromeSurface } from "../ui/ChromeSurface";
import { chrome, colors, fonts, radii, spacing } from "../ui/tokens";
import { GlassSelection } from "./GlassSelection";
import { NavigationIcon, RootTabIcon } from "./NavigationIcon";
import { rootTabsForAuthorization, type FeatureId, type RootTab } from "./registry";
import { scaffoldNavigationMode } from "./scaffoldLayout";
import { useScreenBack } from "./useScreenBack";

function routeForTab(tab: RootTab): string {
  return tab.id === "more" ? "/more" : tab.destination?.path ?? "/";
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const initials = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return initials.map((part) => Array.from(part ?? "")[0] ?? "").join("").toLocaleUpperCase();
}

interface ScaffoldNavigationGuardValue {
  setBlocked(value: boolean): void;
}

const ScaffoldNavigationGuardContext = createContext<ScaffoldNavigationGuardValue | null>(null);
const ScaffoldBackContext = createContext<ReturnType<typeof useScreenBack> | null>(null);

export function useScaffoldNavigationGuard(): ScaffoldNavigationGuardValue | null {
  return useContext(ScaffoldNavigationGuardContext);
}

/** Screens with an illustrated header can place the same guarded Back control in their content. */
export function ScaffoldContentBack() {
  const back = useContext(ScaffoldBackContext);
  return back?.visible ? <BackButton onPress={back.onBack} disabled={back.disabled} /> : null;
}

function NavigationButton({ tab, selected, compact, disabled }: { readonly tab: RootTab; readonly selected: boolean; readonly compact: boolean; readonly disabled: boolean }) {
  const displayLabel = compact && tab.id === "landing" ? "Home" : tab.label;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={displayLabel}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={() => router.replace(routeForTab(tab) as never)}
      style={({ pressed }) => [styles.navButton, compact ? styles.navButtonCompact : styles.navButtonRail, selected && !compact ? styles.navButtonSelected : null, pressed ? styles.pressed : null, disabled ? styles.disabled : null]}
    >
      {compact ? (
        <View style={styles.navGlassSlot}>
          {selected ? <GlassSelection radius={18} /> : null}
          <RootTabIcon tab={tab} selected={selected} size={20} color={selected ? colors.primaryInk : chrome.muted} />
        </View>
      ) : (
        <>
          <View style={styles.navIcon}>
            <RootTabIcon tab={tab} selected={selected} color={selected ? colors.primaryInk : chrome.muted} />
          </View>
          <Text numberOfLines={2} adjustsFontSizeToFit={false} minimumFontScale={0.8} style={[styles.navLabel, styles.navLabelRail, selected ? styles.navLabelSelected : null]}>{displayLabel}</Text>
        </>
      )}
    </Pressable>
  );
}

export function AdaptiveAppScaffold({
  activeFeature,
  more = false,
  navigationRailBreakpoint = 600,
  immersiveBelowWidth,
  backPlacement = "scaffold",
  children
}: {
  readonly activeFeature?: FeatureId;
  readonly more?: boolean;
  readonly navigationRailBreakpoint?: number;
  readonly immersiveBelowWidth?: number;
  readonly backPlacement?: "scaffold" | "content";
  readonly children: ReactNode;
}) {
  const context = useConfiguredRuntime();
  const isFocused = useIsFocused();
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
    <AppModalBackdrop>
    <View style={styles.safeArea}>
      {isFocused ? <StatusBar style={navigationMode === "immersive" ? "dark" : "light"} /> : null}
      {navigationMode !== "immersive" ? (
        <ChromeSurface edge="top" testID="scaffold-top-chrome">
          <SafeAreaView edges={["top", "left", "right"]} testID="scaffold-top-inset">
            <View style={styles.topBar}>
              <View accessibilityLabel="Lisno. Plan, track, deliver." style={styles.brand}>
                <LisnoWordmark tone="light" width={104} />
                <Text style={styles.tagline}>PLAN · TRACK · DELIVER</Text>
              </View>
              <View style={styles.identity}>
                <View style={styles.identityCopy}>
                  <Text numberOfLines={1} style={styles.userName}>{authenticated.user.name}</Text>
                  <Text numberOfLines={1} style={styles.roleLabel}>{ROLE_LABELS[authenticated.user.role]}</Text>
                </View>
                <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialsForName(authenticated.user.name)}</Text>
                </View>
                <Pressable accessibilityLabel="Open notifications" accessibilityRole="button" accessibilityState={{ disabled: navigationBlocked }} disabled={navigationBlocked} onPress={() => router.push("/feature/notifications")} style={[styles.notificationButton, navigationBlocked ? styles.disabled : null]}>
                  <NavigationIcon name="notifications" color={chrome.ink} />
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </ChromeSurface>
      ) : null}
      <SafeAreaView edges={navigationMode === "immersive" ? [] : ["left", "right"]} style={[styles.body, navigationMode !== "immersive" ? styles.bodyRounded : null]} testID="scaffold-body-inset">
        {navigationMode === "rail" ? (
          <ChromeSurface edge="rail" style={styles.railSurface} testID="scaffold-rail-chrome">
            <SafeAreaView edges={["bottom"]} style={styles.rail} testID="scaffold-rail-inset">
              <View accessibilityRole="tablist" style={styles.railTabs}>
                {tabs.map((tab) => <NavigationButton key={tab.id} tab={tab} compact={false} disabled={navigationBlocked} selected={more ? tab.id === "more" : tab.destination?.id === activeFeature} />)}
              </View>
            </SafeAreaView>
          </ChromeSurface>
        ) : null}
        <ScaffoldNavigationGuardContext.Provider value={navigationGuard}>
          <ScaffoldBackContext.Provider value={backPlacement === "content" ? back : null}>
          <SafeAreaView edges={navigationMode === "rail" ? ["bottom"] : []} style={styles.content} testID="scaffold-content-inset">
            {back.visible && navigationMode !== "immersive" && backPlacement === "scaffold" ? (
              <View style={styles.backBar}><BackButton onPress={back.onBack} disabled={back.disabled} /></View>
            ) : null}
            {children}
          </SafeAreaView>
          </ScaffoldBackContext.Provider>
        </ScaffoldNavigationGuardContext.Provider>
      </SafeAreaView>
      {navigationMode === "tabs" ? (
        <SafeAreaView edges={["bottom", "left", "right"]} style={styles.bottomInset} testID="scaffold-bottom-inset">
          <ChromeSurface edge="bottom" style={styles.dock} testID="scaffold-bottom-chrome">
            <View accessibilityRole="tablist" style={styles.bottomBar}>
              {tabs.map((tab) => <NavigationButton key={tab.id} tab={tab} compact disabled={navigationBlocked} selected={more ? tab.id === "more" : tab.destination?.id === activeFeature} />)}
            </View>
          </ChromeSurface>
        </SafeAreaView>
      ) : null}
    </View>
    </AppModalBackdrop>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.shell },
  topBar: { minHeight: 66, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  brand: { alignItems: "flex-start", gap: spacing.xxs },
  tagline: { color: chrome.muted, fontFamily: fonts.medium, fontSize: 7, letterSpacing: 1.05 },
  identity: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.xs, flex: 1, minWidth: 0 },
  identityCopy: { maxWidth: 180, flexShrink: 1, alignItems: "flex-end" },
  userName: { color: chrome.ink, fontFamily: fonts.semibold, fontSize: 13 },
  roleLabel: { color: chrome.muted, fontFamily: fonts.regular, fontSize: 11 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: chrome.selected, borderWidth: 1, borderColor: chrome.selectedBorder, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.medium, fontSize: 12, color: chrome.ink },
  notificationButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, flexDirection: "row", backgroundColor: colors.canvas },
  bodyRounded: { borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: "hidden" },
  railSurface: { width: 176 },
  rail: { flex: 1 },
  railTabs: { padding: spacing.sm, gap: spacing.xs },
  content: { flex: 1, backgroundColor: colors.canvas },
  backBar: { paddingHorizontal: spacing.xs, backgroundColor: colors.canvas },
  bottomInset: { backgroundColor: colors.canvas, alignItems: "center" },
  dock: { alignSelf: "center", marginTop: 6, marginBottom: spacing.xs, borderRadius: 26, borderWidth: 1, borderColor: chrome.line, overflow: "hidden" },
  bottomBar: { flexDirection: "row", padding: 4, gap: 4 },
  navButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  navButtonCompact: { width: 44, height: 44, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  navGlassSlot: { position: "relative", width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  navButtonRail: { flexDirection: "row", justifyContent: "flex-start", gap: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radii.control, borderWidth: 1, borderColor: "transparent" },
  navButtonSelected: { backgroundColor: chrome.selected, borderColor: chrome.selectedBorder },
  navIcon: { width: 32, height: 26, alignItems: "center", justifyContent: "center" },
  navLabel: { color: chrome.muted, fontFamily: fonts.medium },
  navLabelRail: { flex: 1, fontSize: 13, textAlign: "left" },
  navLabelSelected: { color: colors.primaryInk, fontFamily: fonts.semibold },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 }
});
