import { router, useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import type { PublicUser } from "../contracts/session";
import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { LisnoWordmark } from "../ui/brand";
import { BackButton } from "../ui/BackButton";
import { AppModalBackdrop } from "../ui/AppModalBackdrop";
import { ChromeSurface } from "../ui/ChromeSurface";
import { chrome, colors, fonts, radii, spacing } from "../ui/tokens";
import { GlassSelection } from "./GlassSelection";
import { NavigationIcon, RootTabIcon } from "./NavigationIcon";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfileMenu } from "./ProfileMenu";
import { ProcurementDrawer, ProcurementMenuContents } from "./ProcurementDrawer";
import { procurementNavigationColors as procurementColors } from "./procurementMenuModel";
import { DailyCriticalTasksControl } from "../features/notifications/DailyCriticalTasksControl";
import { rootTabsForAuthorization, type FeatureDestination, type FeatureId, type RootTab } from "./registry";
import { scaffoldNavigationMode } from "./scaffoldLayout";
import { useScreenBack } from "./useScreenBack";

function routeForTab(tab: RootTab): string {
  return tab.id === "more" ? "/more" : tab.destination?.path ?? "/";
}

interface ScaffoldNavigationGuardValue {
  setBlocked(value: boolean): void;
}

const ScaffoldNavigationGuardContext = createContext<{ setBlocked(owner: symbol, value: boolean): void } | null>(null);
const ScaffoldNavigationBlockedContext = createContext(false);
export function useScaffoldNavigationBlocked() { return useContext(ScaffoldNavigationBlockedContext); }
const ScaffoldBackContext = createContext<ReturnType<typeof useScreenBack> | null>(null);
/** Reuses the scaffold's Back registration for a screen-owned header. */
export function useScaffoldContentBack() { return useContext(ScaffoldBackContext); }

export function useScaffoldNavigationGuard(): ScaffoldNavigationGuardValue | null {
  const registry = useContext(ScaffoldNavigationGuardContext);
  const owner = useRef(Symbol("navigation-guard"));
  useEffect(() => () => registry?.setBlocked(owner.current, false), [registry]);
  return useMemo(() => registry ? { setBlocked: (value: boolean) => registry.setBlocked(owner.current, value) } : null, [registry]);
}

/** Screens with an illustrated header can place the same guarded Back control in their content. */
export function ScaffoldContentBack() {
  const back = useScaffoldContentBack();
  return back?.visible ? <BackButton onPress={back.onBack} disabled={back.disabled} /> : null;
}

function NavigationButton({ tab, selected, compact, disabled, user, onOpenProfile, onPress, expanded }: { readonly tab: RootTab; readonly selected: boolean; readonly compact: boolean; readonly disabled: boolean; readonly user: PublicUser; readonly onOpenProfile: () => void; readonly onPress?: () => void; readonly expanded?: boolean }) {
  const displayLabel = compact && tab.id === "landing" ? "Home" : tab.label;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={displayLabel}
      accessibilityState={{ disabled, selected, ...(expanded === undefined ? {} : { expanded }) }}
      disabled={disabled}
      onPress={() => onPress ? onPress() : tab.id === "profile" ? onOpenProfile() : router.replace(routeForTab(tab) as never)}
      style={({ pressed }) => [styles.navButton, compact ? styles.navButtonCompact : styles.navButtonRail, selected && !compact ? styles.navButtonSelected : null, pressed ? styles.pressed : null, disabled ? styles.disabled : null]}
    >
      {compact ? (
        <View style={styles.navGlassSlot}>
          {selected ? <GlassSelection radius={18} /> : null}
          {tab.id === "profile"
            ? <ProfileAvatar user={user} size={24} />
            : <RootTabIcon tab={tab} selected={selected} size={20} color={selected ? colors.primaryInk : chrome.muted} />}
        </View>
      ) : (
        <>
          <View style={styles.navIcon}>
            {tab.id === "profile"
              ? <ProfileAvatar user={user} size={24} />
              : <RootTabIcon tab={tab} selected={selected} color={selected ? colors.primaryInk : chrome.muted} />}
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
  profile = false,
  navigationRailBreakpoint = 600,
  immersiveBelowWidth,
  backPlacement = "scaffold",
  presentation = "standard",
  children
}: {
  readonly activeFeature?: FeatureId;
  readonly more?: boolean;
  /** Selects the Profile tab. */
  readonly profile?: boolean;
  readonly navigationRailBreakpoint?: number;
  readonly immersiveBelowWidth?: number;
  readonly backPlacement?: "scaffold" | "content";
  /** A screen-owned header and composer, with scaffold-owned safe-area clearance. */
  readonly presentation?: "standard" | "conversation";
  readonly children: ReactNode;
}) {
  const context = useConfiguredRuntime();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const [navigationBlocks, setNavigationBlocks] = useState<ReadonlySet<symbol>>(() => new Set());
  const navigationBlocked = navigationBlocks.size > 0;
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [procurementMenuOpen, setProcurementMenuOpen] = useState(false);
  const procurementMenuTrigger = useRef<View>(null);
  useEffect(() => { setProcurementMenuOpen(false); }, [activeFeature, more, profile, isFocused]);
  const back = useScreenBack({ blocked: navigationBlocked });
  const navigationGuard = useMemo(
    () => ({ setBlocked: (owner: symbol, value: boolean) => setNavigationBlocks((previous) => {
      if (previous.has(owner) === value) return previous;
      const next = new Set(previous);
      if (value) next.add(owner); else next.delete(owner);
      return next;
    }) }),
    []
  );
  const conversation = presentation === "conversation";
  const navigationMode = conversation ? "immersive" : scaffoldNavigationMode(
    width,
    navigationRailBreakpoint,
    immersiveBelowWidth
  );
  useEffect(() => { if (navigationMode !== "tabs") setProcurementMenuOpen(false); }, [navigationMode]);
  const authenticated = context.session.status === "authenticated" ? context.session.session : null;
  if (!authenticated) {
    router.replace("/sign-in");
    return null;
  }
  const tabs = rootTabsForAuthorization(authenticated.user.role, authenticated.authorization);
  const procurementShell = authenticated.user.role === "procurement";
  const drawerVisible = procurementShell && procurementMenuOpen && navigationMode === "tabs";
  const isProcurementRoute = activeFeature === "procurement" || activeFeature === "procurement-vendors" || activeFeature === "my-requests";
  const isSelected = (tab: RootTab) => more ? tab.id === "more" : profile ? tab.id === "profile" : tab.id === "domain" && authenticated.user.role === "procurement"
    ? isProcurementRoute
    : tab.destination?.id === activeFeature;
  const openProfileMenu = () => setProfileMenuOpen(true);
  const closeProcurementMenu = () => {
    setProcurementMenuOpen(false);
    const node = findNodeHandle(procurementMenuTrigger.current);
    if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
  };
  const navigateProcurement = (destination: FeatureDestination) => {
    if (navigationBlocked) return;
    setProcurementMenuOpen(false);
    if (destination.id !== activeFeature || more || profile) router.push(destination.path as never);
  };
  const procurementMenu = {
    session: authenticated, ...(activeFeature ? { activeFeature } : {}), disabled: navigationBlocked,
    onNavigate: navigateProcurement,
    onProfile: () => { if (!navigationBlocked) { setProcurementMenuOpen(false); router.push("/profile" as never); } },
    onMore: () => { if (!navigationBlocked) { setProcurementMenuOpen(false); router.push("/more"); } }
  };
  const topBar = <SafeAreaView edges={["top", "left", "right"]} testID="scaffold-top-inset">
    <View style={[styles.topBar, procurementShell ? styles.procurementTopBar : null]}>
      {procurementShell && navigationMode === "tabs" ? <Pressable ref={procurementMenuTrigger} accessibilityLabel="Open navigation" accessibilityRole="button" accessibilityState={{ expanded: procurementMenuOpen, disabled: navigationBlocked }} disabled={navigationBlocked} onPress={() => setProcurementMenuOpen(true)} style={styles.menuTrigger}>
        <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}><Path d="M3 6h18M3 12h18M3 18h12" stroke={procurementColors.ink} strokeWidth={1.7} strokeLinecap="round" /></Svg>
      </Pressable> : null}
      <View accessible accessibilityRole="image" accessibilityLabel="Lisno" style={styles.brand}><LisnoWordmark tone={procurementShell ? "dark" : "light"} width={procurementShell ? 86 : 104} /></View>
      {authenticated.user.role !== "client" && context.runtime.api?.authenticated ? <View style={procurementShell ? styles.procurementTasks : null}><DailyCriticalTasksControl session={authenticated} navigationBlocked={navigationBlocked} /></View> : null}
      <Pressable accessibilityLabel="Open notifications" accessibilityRole="button" accessibilityState={{ disabled: navigationBlocked }} disabled={navigationBlocked} onPress={() => router.push("/feature/notifications")} style={[styles.notificationButton, navigationBlocked ? styles.disabled : null]}>
        {({ pressed }) => <View testID="notification-circle" style={[styles.notificationCircle, pressed ? styles.notificationPressed : null]}>
          {!procurementShell ? <GlassSelection testID="notification-glass" radius={18} /> : null}
          <NavigationIcon name="notifications" color={procurementShell ? procurementColors.ink : chrome.ink} size={20} />
        </View>}
      </Pressable>
    </View>
  </SafeAreaView>;

  return (
    <AppModalBackdrop>
    <View style={[styles.safeArea, conversation && styles.conversation]}>
      {isFocused ? <StatusBar style={navigationMode === "immersive" || procurementShell ? "dark" : "light"} /> : null}
      {navigationMode !== "immersive" ? (procurementShell
        ? <View testID="procurement-top-bar" style={styles.procurementHeader} accessibilityElementsHidden={drawerVisible} importantForAccessibility={drawerVisible ? "no-hide-descendants" : "auto"}>{topBar}</View>
        : <ChromeSurface edge="top" testID="scaffold-top-chrome">{topBar}</ChromeSurface>) : null}
      <SafeAreaView edges={conversation ? ["top", "right", "bottom", "left"] : navigationMode === "immersive" ? [] : ["left", "right"]} style={[styles.body, conversation && styles.conversation, navigationMode !== "immersive" && !procurementShell ? styles.bodyRounded : null]} testID="scaffold-body-inset" accessibilityElementsHidden={drawerVisible} importantForAccessibility={drawerVisible ? "no-hide-descendants" : "auto"}>
        {navigationMode === "rail" ? (procurementShell
          ? <SafeAreaView edges={["bottom"]} style={styles.procurementRail} testID="procurement-navigation-rail"><ProcurementMenuContents {...procurementMenu} /></SafeAreaView>
          : <ChromeSurface edge="rail" style={styles.railSurface} testID="scaffold-rail-chrome">
            <SafeAreaView edges={["bottom"]} style={styles.rail} testID="scaffold-rail-inset">
              <View accessibilityRole="tablist" style={styles.railTabs}>
                {tabs.map(tab => <NavigationButton key={tab.id} tab={tab} compact={false} disabled={navigationBlocked} user={authenticated.user} onOpenProfile={openProfileMenu} selected={isSelected(tab)} />)}
              </View>
            </SafeAreaView>
          </ChromeSurface>) : null}
        <ScaffoldNavigationGuardContext.Provider value={navigationGuard}>
          <ScaffoldNavigationBlockedContext.Provider value={navigationBlocked}>
          <ScaffoldBackContext.Provider value={conversation || backPlacement === "content" ? back : null}>
          <SafeAreaView edges={navigationMode === "rail" ? ["bottom"] : []} style={[styles.content, conversation && styles.conversation]} testID="scaffold-content-inset">
            {back.visible && navigationMode !== "immersive" && backPlacement === "scaffold" ? (
              <View style={styles.backBar}><BackButton onPress={back.onBack} disabled={back.disabled} /></View>
            ) : null}
            {children}
          </SafeAreaView>
          </ScaffoldBackContext.Provider>
        </ScaffoldNavigationBlockedContext.Provider>
        </ScaffoldNavigationGuardContext.Provider>
      </SafeAreaView>
      {navigationMode === "tabs" ? (
        <SafeAreaView edges={["bottom", "left", "right"]} style={styles.bottomInset} testID="scaffold-bottom-inset" accessibilityElementsHidden={drawerVisible} importantForAccessibility={drawerVisible ? "no-hide-descendants" : "auto"}>
          <ChromeSurface edge="bottom" style={styles.dock} testID="scaffold-bottom-chrome">
            <View accessibilityRole="tablist" style={styles.bottomBar}>{tabs.map(tab => <NavigationButton key={tab.id} tab={tab} compact disabled={navigationBlocked} user={authenticated.user} onOpenProfile={openProfileMenu} selected={isSelected(tab)} />)}</View>
          </ChromeSurface>
        </SafeAreaView>
      ) : null}
      {navigationMode !== "immersive" ? <ProfileMenu visible={profileMenuOpen} placement={navigationMode} onRequestClose={() => setProfileMenuOpen(false)} /> : null}
      {procurementShell ? <ProcurementDrawer {...procurementMenu} visible={drawerVisible} onClose={closeProcurementMenu} /> : null}
      {navigationMode === "immersive" && !conversation && authenticated.user.role !== "client" && context.runtime.api?.authenticated ? (
        <View style={styles.immersiveTasks}><DailyCriticalTasksControl session={authenticated} navigationBlocked={navigationBlocked} /></View>
      ) : null}
    </View>
    </AppModalBackdrop>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.shell },
  conversation: { backgroundColor: "#FAF9F3" },
  procurementTasks: { backgroundColor: procurementColors.active, borderRadius: 4 },
  procurementHeader: { backgroundColor: procurementColors.header, borderBottomWidth: 1, borderBottomColor: procurementColors.border },
  procurementTopBar: { minHeight: 56, paddingHorizontal: 8, gap: 6 },
  menuTrigger: { minWidth: 44, minHeight: 48, alignItems: "center", justifyContent: "center" },
  procurementRail: { width: 252, backgroundColor: procurementColors.rail, borderRightWidth: 1, borderRightColor: procurementColors.border },
  topBar: { minHeight: 52, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  brand: { alignItems: "flex-start" },
  notificationButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  immersiveTasks: { position: "absolute", top: spacing.xl, right: spacing.md, zIndex: 20 },
  notificationCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  notificationPressed: { opacity: 0.8 },
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
