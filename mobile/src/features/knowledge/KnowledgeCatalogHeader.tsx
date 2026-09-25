import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { colors, fonts } from "../../ui/tokens";

type IconName = "back" | "bolt" | "down" | "search" | "filter" | "info" | "close" | "values" | "basket" | "add" | "item" | "temporary" | "next";
export type KnowledgeCatalogAction = "values" | "baskets" | "basket" | "item" | "temporary";
const actions: readonly { id: KnowledgeCatalogAction; title: string; description: string; icon: IconName; create?: boolean }[] = [
  { id: "values", title: "Manage reusable values", description: "Manage common values used across estimations.", icon: "values" },
  { id: "baskets", title: "Manage baskets", description: "View and manage estimation baskets.", icon: "basket" },
  { id: "basket", title: "Add main basket", description: "Create a new main basket for estimation.", icon: "add", create: true },
  { id: "item", title: "Add estimation item", description: "Add a new item with cost, time and quantity details.", icon: "item", create: true },
  { id: "temporary", title: "Add temporary item", description: "Add an item to complete its configuration later.", icon: "temporary", create: true }
];

function Icon({ name, size = 22, color = colors.ink }: { readonly name: IconName; readonly size?: number; readonly color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {name === "back" ? <Path d="m10 5-7 7 7 7M3 12h17" /> : null}
    {name === "bolt" ? <Path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z" /> : null}
    {name === "down" ? <Path d="m7 10 5 5 5-5" /> : null}
    {name === "next" ? <Path d="m9 6 6 6-6 6" /> : null}
    {name === "close" ? <Path d="m6 6 12 12M18 6 6 18" /> : null}
    {name === "search" ? <><Circle cx="10.5" cy="10.5" r="6.5" /><Path d="m16 16 4.5 4.5" /></> : null}
    {name === "filter" ? <Path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z" /> : null}
    {name === "info" ? <><Circle cx="12" cy="12" r="9" /><Path d="M12 11v6M12 7h.01" /></> : null}
    {name === "values" ? <><Ellipse cx="12" cy="5" rx="7.5" ry="3" /><Path d="M4.5 5v14c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" /></> : null}
    {name === "basket" ? <Path d="M3 9h18l-2 11H5L3 9Zm4 0 3-6m7 6-3-6M3 13h18" /> : null}
    {name === "add" ? <><Circle cx="12" cy="12" r="9" /><Path d="M12 7v10M7 12h10" /></> : null}
    {name === "item" ? <><Path d="M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M7 7h6M7 11h4M18 15v7M14.5 18.5h7" /></> : null}
    {name === "temporary" ? <><Path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6" /><Circle cx="17" cy="17" r="5" /><Path d="M17 14v3l2 1M7 7h6M7 11h3" /></> : null}
  </Svg>;
}

interface Props {
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly onSearch: () => void;
  readonly onFilters: () => void;
  readonly filterCount: number;
  readonly canCreate: boolean;
  readonly onAction: (action: KnowledgeCatalogAction) => void;
  readonly onBack: () => void;
  readonly backVisible: boolean;
  readonly backDisabled?: boolean;
}

/** Local presentation boundary: catalog state and action destinations stay in the workspace. */
export function KnowledgeCatalogHeader({ search, onSearchChange, onSearch, onFilters, filterCount, canCreate, onAction, onBack, backVisible, backDisabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const actionsButton = useRef<View>(null);
  const closeButton = useRef<View>(null);
  const pendingAction = useRef<KnowledgeCatalogAction | null>(null);
  const restoreFocus = useRef(false);
  useEffect(() => () => { pendingAction.current = null; restoreFocus.current = false; }, []);
  const insets = useSafeAreaInsets();
  function focus(target: View | null) {
    target?.focus?.();
    if (Platform.OS === "web") return;
    const handle = findNodeHandle(target);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }
  function close() {
    pendingAction.current = null;
    restoreFocus.current = Platform.OS === "ios";
    setOpen(false);
    if (Platform.OS !== "ios") requestAnimationFrame(() => focus(actionsButton.current));
  }
  function choose(action: KnowledgeCatalogAction) {
    restoreFocus.current = false;
    setOpen(false);
    // UIKit must finish dismissing this window before presenting the next editor.
    if (Platform.OS === "ios") pendingAction.current = action;
    else onAction(action);
  }
  function dismissed() {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) onAction(action);
    else if (restoreFocus.current) focus(actionsButton.current);
    restoreFocus.current = false;
  }
  function submit() { Keyboard.dismiss(); onSearch(); }
  return <View style={styles.header}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.leaves}>
      <Svg width="190" height="145" viewBox="0 0 190 145" fill="none">
        <Path d="M199 131C158 82 139 35 53-8" stroke="#e6e9dd" strokeWidth="3" />
        <Path d="M174 101C123 96 116 71 104 41c45 10 60 26 70 60Z" fill="#eaeddf" />
        <Path d="M148 58C145 19 154 3 174-14c14 34 4 59-26 72Z" fill="#e5e9db" />
        <Path d="M122 32C89 35 69 15 49-9c37-2 61 11 73 41Z" fill="#eff0e6" />
        <Path d="M192 134C168 109 165 94 170 72c23 22 27 39 22 62Z" fill="#f0f1e8" />
      </Svg>
    </View>
    <View style={styles.topRow}>
      {backVisible ? <Pressable accessibilityRole="button" accessibilityLabel="Back" accessibilityState={{ disabled: backDisabled }} disabled={backDisabled} onPress={onBack} style={[styles.back, backDisabled && styles.disabled]}>
        <View style={styles.backIcon}><Icon name="back" size={18} /></View><Text style={styles.navLabel}>Back</Text>
      </Pressable> : <View />}
      <Pressable ref={actionsButton} accessibilityRole="button" accessibilityLabel="Actions" accessibilityHint="Open Configuration actions" accessibilityState={{ expanded: open }} onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={({ pressed }) => [styles.actionsButton, pressed && styles.pressed]}>
        <Icon name="bolt" size={19} /><Text style={styles.navLabel}>Actions</Text><Icon name="down" size={16} />
      </Pressable>
    </View>
    <Text accessibilityRole="header" style={styles.title}>Configuration</Text>
    <Text style={styles.description}>Maintain cost, time, scope, quality and recommendation rules for future AI estimation.</Text>
    <View style={styles.notice}>
      <Icon name="info" size={22} color={colors.gold} />
      <Text style={styles.noticeText}>Knowledge-base changes do not modify current estimates or the existing Sales estimate builder.</Text>
    </View>
    <View style={styles.searchRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={submit} style={styles.searchAction}><Icon name="search" size={20} color={colors.inkMuted} /></Pressable>
      <TextInput accessibilityLabel="Search by basket or main line name" placeholder="Search by basket or main line name" placeholderTextColor={colors.inkMuted} value={search} onChangeText={onSearchChange} returnKeyType="search" onSubmitEditing={submit} style={styles.searchInput} />
      <View style={styles.searchDivider} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Filters${filterCount ? ` (${filterCount})` : ""}`} accessibilityHint="Filter Configuration items" onPress={() => { Keyboard.dismiss(); onFilters(); }} style={[styles.searchAction, filterCount > 0 && styles.activeFilter]}>
        <Icon name="filter" size={19} color={filterCount ? colors.primary : colors.inkMuted} />
        {filterCount ? <View style={styles.filterCount}><Text style={styles.filterCountText}>{filterCount}</Text></View> : null}
      </Pressable>
    </View>
    <Modal testID="configuration-actions-modal" visible={open} transparent animationType="none" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={close} onDismiss={dismissed} onShow={() => focus(closeButton.current)}>
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss Actions" style={styles.backdrop} onPress={close} />
        <View accessibilityViewIsModal accessibilityLabel="Configuration actions" style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View accessible={false} style={styles.handle} />
          <View style={styles.sheetHeader}><Text accessibilityRole="header" style={styles.sheetTitle}>Actions</Text><Pressable ref={closeButton} accessibilityRole="button" accessibilityLabel="Close Actions" onPress={close} style={styles.close}><View style={styles.closeIcon}><Icon name="close" size={17} /></View></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.actionList} contentContainerStyle={styles.actionContent}>
            {actions.filter(action => !action.create || canCreate).map((action, index) => <Pressable key={action.id} accessibilityRole="button" accessibilityLabel={action.title} accessibilityHint={action.description} onPress={() => choose(action.id)} style={({ pressed }) => [styles.action, index > 0 && styles.actionDivider, pressed && styles.pressed]}>
              <View style={styles.actionIcon}><Icon name={action.icon} size={27} /></View>
              <View style={styles.actionCopy}><Text style={styles.actionTitle}>{action.title}</Text><Text style={styles.actionDescription}>{action.description}</Text></View>
              <Icon name="next" size={16} color={colors.inkMuted} />
            </Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  header: { marginHorizontal: -16, marginTop: -16, paddingHorizontal: 22, paddingTop: 4, paddingBottom: 18, backgroundColor: colors.surface, overflow: "hidden" },
  leaves: { position: "absolute", right: -10, top: -8, opacity: .78 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 7, marginLeft: -7, marginRight: -6 },
  back: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 8 },
  backIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
  navLabel: { fontFamily: fonts.medium, color: colors.ink, fontSize: 12, lineHeight: 18 },
  actionsButton: { minHeight: 44, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.primary, borderRadius: 24, flexDirection: "row", gap: 9, alignItems: "center", backgroundColor: "rgba(251,250,246,0.72)" },
  title: { fontFamily: fonts.semibold, fontSize: 25, lineHeight: 33, letterSpacing: -.65, color: colors.ink },
  description: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.inkMuted, marginTop: 4 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 9, backgroundColor: colors.surfaceMuted, marginTop: 12, marginBottom: 15 },
  noticeText: { flex: 1, fontFamily: fonts.regular, fontSize: 10.5, lineHeight: 17, color: colors.inkMuted },
  searchRow: { minHeight: 44, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#b8b8bb", borderRadius: 12, backgroundColor: colors.surface },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 8, paddingHorizontal: 0, fontFamily: fonts.regular, fontSize: 11, color: colors.ink },
  searchAction: { width: 44, minHeight: 44, justifyContent: "center", alignItems: "center" },
  searchDivider: { width: 1, height: 20, backgroundColor: colors.border },
  activeFilter: { backgroundColor: colors.primarySoft, borderTopRightRadius: 11, borderBottomRightRadius: 11 },
  filterCount: { position: "absolute", right: 2, top: 2, minWidth: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },
  filterCountText: { color: colors.primaryInk, fontFamily: fonts.medium, fontSize: 9, lineHeight: 13 },
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(31,42,28,0.04)" },
  sheet: { width: "100%", maxWidth: 560, maxHeight: "52%", alignSelf: "center", backgroundColor: colors.surface, borderTopLeftRadius: 21, borderTopRightRadius: 21, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: "hidden" },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#c3c4c0", alignSelf: "center", marginTop: 9 },
  sheetHeader: { minHeight: 36, paddingLeft: 22, paddingRight: 62, justifyContent: "center" },
  sheetTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.ink },
  close: { position: "absolute", right: 9, top: -4, minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" },
  closeIcon: { width: 27, height: 27, borderRadius: 14, backgroundColor: colors.surfaceMuted, justifyContent: "center", alignItems: "center" },
  actionList: { flexShrink: 1 },
  actionContent: { paddingHorizontal: 22 },
  action: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 5 },
  actionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  actionIcon: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
  actionCopy: { flex: 1, gap: 1 },
  actionTitle: { fontFamily: fonts.medium, color: colors.ink, fontSize: 12, lineHeight: 16 },
  actionDescription: { fontFamily: fonts.regular, color: colors.inkMuted, fontSize: 10.5, lineHeight: 14 },
  pressed: { backgroundColor: colors.primarySoft },
  disabled: { opacity: .5 }
});
