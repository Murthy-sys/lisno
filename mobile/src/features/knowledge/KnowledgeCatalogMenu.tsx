import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { colors, fonts } from "../../ui/tokens";

export interface KnowledgeMenuAnchor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly trigger?: View;
}
export interface KnowledgeMenuAction {
  readonly id: string;
  readonly label: string;
  readonly icon: "edit" | "add" | "temporary" | "delete" | "open";
  readonly onPress: () => void;
  readonly destructive?: boolean;
}

function focus(target?: View | null) {
  target?.focus?.();
  if (Platform.OS === "web" || !target) return;
  const handle = findNodeHandle(target);
  if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
}

function MenuIcon({ name, destructive }: { readonly name: KnowledgeMenuAction["icon"]; readonly destructive?: boolean }) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={destructive ? colors.danger : colors.primary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {name === "edit" ? <Path d="m4 15 11-11 5 5L9 20l-6 1 1-6Zm9-9 5 5M3 23h17" /> : null}
      {name === "add" ? <Path d="M15 7H3v14h14V9M7 3h14v13M6 14h8m-4-4v8" /> : null}
      {name === "temporary" ? <><Circle cx="12" cy="12" r="9" /><Path d="M12 6v6l4 2" /></> : null}
      {name === "delete" ? <Path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /> : null}
      {name === "open" ? <Path d="M14 3h7v7m0-7L10 14M10 5H4v16h16v-6" /> : null}
    </Svg>
  </View>;
}

/** Wait for UIKit dismissal before presenting an editor or the deletion confirmation. */
export function KnowledgeCatalogMenu({ name, anchor, actions, onClose }: {
  readonly name: string;
  readonly anchor: KnowledgeMenuAnchor;
  readonly actions: readonly KnowledgeMenuAction[];
  readonly onClose: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const pending = useRef<string | null>(null);
  const finished = useRef(false);
  const firstAction = useRef<View>(null);
  const latest = useRef({ actions, onClose });
  latest.current = { actions, onClose };
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menuWidth = Math.min(232, width - insets.left - insets.right - 16);
  const availableHeight = Math.max(44, height - insets.top - insets.bottom - 16);
  const rowHeight = Math.max(44, 36 * fontScale);
  const menuHeight = Math.min(availableHeight, actions.length * rowHeight + 10);
  const left = Math.max(insets.left + 8, Math.min(anchor.x + anchor.width - menuWidth, width - insets.right - menuWidth - 8));
  const below = anchor.y + anchor.height - 2;
  const top = Math.max(insets.top + 8, Math.min(below + menuHeight <= height - insets.bottom - 8 ? below : anchor.y - menuHeight + 2, height - insets.bottom - menuHeight - 8));

  useEffect(() => () => { finished.current = true; pending.current = null; }, []);
  function complete() {
    if (finished.current) return;
    finished.current = true;
    const selected = latest.current.actions.find(action => action.id === pending.current);
    pending.current = null;
    latest.current.onClose();
    if (selected) selected.onPress();
    else requestAnimationFrame(() => focus(anchor.trigger));
  }
  function dismiss(actionId: string | null = null) {
    if (!visible) return;
    pending.current = actionId;
    setVisible(false);
    if (Platform.OS !== "ios") complete();
  }
  return <Modal testID="configuration-context-menu" visible={visible} transparent animationType="none" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={() => dismiss()} onDismiss={complete} onShow={() => focus(firstAction.current)}>
    <View style={styles.overlay} accessibilityViewIsModal onAccessibilityEscape={() => dismiss()}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss actions for ${name}`} style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
      <View accessibilityRole="menu" accessibilityLabel={`Actions for ${name}`} style={[styles.menu, { left, top, width: menuWidth, maxHeight: Math.max(44, height - insets.bottom - top - 8) }]}>
        <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
          {actions.map((action, index) => <Pressable key={action.id} ref={index === 0 ? firstAction : undefined} accessibilityRole="menuitem" accessibilityLabel={action.label} onPress={() => dismiss(action.id)} style={({ pressed }) => [styles.action, { minHeight: rowHeight }, action.destructive && styles.destructiveRow, pressed && styles.pressed]}>
            <MenuIcon name={action.icon} {...(action.destructive ? { destructive: true } : {})} />
            <Text style={[styles.label, action.destructive && styles.danger]}>{action.label}</Text>
          </Pressable>)}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  menu: { position: "absolute", borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 4, backgroundColor: colors.surface, overflow: "hidden" },
  action: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 7 },
  label: { flex: 1, fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17, color: colors.ink },
  destructiveRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  danger: { color: colors.danger },
  pressed: { backgroundColor: colors.primarySoft }
});
