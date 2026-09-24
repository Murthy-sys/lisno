import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as ReactNative from "react-native";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useReducedMotion } from "../features/onboarding/useReducedMotion";
import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { colors, fonts, radii, spacing } from "../ui/tokens";
import { NavigationIcon } from "./NavigationIcon";

export interface ProfileMenuProps {
  readonly visible: boolean;
  /** Bottom-bar menus rise above the dock; rail menus anchor beside the rail. */
  readonly placement: "tabs" | "rail";
  readonly onRequestClose: () => void;
}

export function ProfileMenu({ visible, placement, onRequestClose }: ProfileMenuProps) {
  const context = useConfiguredRuntime();
  const reducedMotion = useReducedMotion();
  const [signingOut, setSigningOut] = useState(false);
  const firstItem = useRef<View>(null);
  const focusRequest = useRef<number | null>(null);

  const focusFirstItem = useCallback(() => {
    if (focusRequest.current !== null) cancelAnimationFrame(focusRequest.current);
    focusRequest.current = requestAnimationFrame(() => {
      focusRequest.current = null;
      const handle = ReactNative.findNodeHandle(firstItem.current);
      if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }, []);

  useEffect(() => () => {
    if (focusRequest.current !== null) cancelAnimationFrame(focusRequest.current);
  }, []);

  const openProfile = () => {
    onRequestClose();
    router.push("/profile" as never);
  };

  const signOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    onRequestClose();
    void context.runtime.session.logout().then(() => router.replace("/sign-in")).catch(() => setSigningOut(false));
  };

  return (
    <Modal
      animationType={reducedMotion === false ? "fade" : "none"}
      onRequestClose={onRequestClose}
      onShow={focusFirstItem}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.overlay, placement === "rail" ? styles.overlayRail : styles.overlayTabs]}>
        <Pressable
          accessibilityLabel="Close profile menu"
          accessibilityRole="button"
          onPress={onRequestClose}
          style={styles.backdrop}
          testID="profile-menu-backdrop"
        />
        <View accessibilityLabel="Profile menu" accessibilityRole="menu" accessibilityViewIsModal style={styles.panel} testID="profile-menu">
          <Pressable ref={firstItem} accessibilityLabel="Profile" accessibilityRole="menuitem" onPress={openProfile} style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}>
            <NavigationIcon name="person" color={colors.ink} size={20} />
            <Text style={styles.itemLabel}>Profile</Text>
          </Pressable>
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.divider} testID="profile-menu-divider" />
          <Pressable
            accessibilityLabel="Sign out"
            accessibilityRole="menuitem"
            accessibilityState={{ busy: signingOut, disabled: signingOut }}
            disabled={signingOut}
            onPress={signOut}
            style={({ pressed }) => [styles.item, styles.signOut, pressed ? styles.signOutPressed : null]}
          >
            <NavigationIcon name="sign-out" color={signingOut ? colors.dangerPressed : colors.danger} size={20} />
            <Text style={[styles.itemLabel, styles.signOutLabel]}>Sign out</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  overlayTabs: { alignItems: "center", paddingHorizontal: spacing.xs, paddingBottom: 76 },
  overlayRail: { alignItems: "flex-start", paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(17, 27, 33, 0.42)" },
  panel: {
    width: "100%",
    maxWidth: 280,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xs,
    gap: spacing.xxs,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12
  },
  item: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radii.control, borderWidth: 1, borderColor: "transparent" },
  itemPressed: { backgroundColor: colors.surfaceMuted },
  itemLabel: { color: colors.ink, fontFamily: fonts.medium, fontSize: 15 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  signOut: { marginTop: spacing.xxs },
  signOutPressed: { backgroundColor: colors.dangerSoft },
  signOutLabel: { color: colors.danger, fontFamily: fonts.semibold }
});
