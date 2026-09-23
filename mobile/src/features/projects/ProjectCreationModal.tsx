import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { AccessibilityInfo, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { useModalBackdrop } from "../../ui/AppModalBackdrop";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { useReducedMotion } from "../onboarding/useReducedMotion";

interface ProjectCreationModalProps {
  readonly visible: boolean;
  readonly title: string;
  readonly description: string;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly triggerRef: RefObject<View | null>;
  readonly children: ReactNode;
  readonly footer: ReactNode;
}

/** The scaffold owns the blur target so Android can blur within its own window. */
export function ProjectCreationModal({ visible, title, description, busy, onClose, triggerRef, children, footer }: ProjectCreationModalProps) {
  useModalBackdrop(visible);
  const navigationGuard = useScaffoldNavigationGuard();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height, width, fontScale } = useWindowDimensions();
  const closeRef = useRef<View>(null);
  const wasVisible = useRef(false);
  const focusFrame = useRef<number | null>(null);

  const focus = useCallback((target: RefObject<View | null>) => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (target.current) AccessibilityInfo.sendAccessibilityEvent(target.current, "focus");
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    navigationGuard?.setBlocked(true);
    return () => navigationGuard?.setBlocked(false);
  }, [navigationGuard, visible]);

  useEffect(() => {
    if (wasVisible.current && !visible) {
      Keyboard.dismiss();
      if (Platform.OS !== "ios") focus(triggerRef);
    }
    wasVisible.current = visible;
  }, [focus, triggerRef, visible]);

  useEffect(() => () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
  }, []);

  const requestClose = () => { if (!busy) onClose(); };
  const horizontalInset = width >= 600 ? spacing.xl : spacing.md;
  const availableHeight = Math.max(0, height - insets.top - insets.bottom - spacing.xl * 2);

  return (
    <Modal
      animationType={reducedMotion === false ? "fade" : "none"}
      onDismiss={() => { if (!visible) focus(triggerRef); }}
      onRequestClose={requestClose}
      onShow={() => focus(closeRef)}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      transparent
      visible={visible}
      testID="project-creation-modal"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <Pressable
          accessibilityLabel="Dismiss project form"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={requestClose}
          style={StyleSheet.absoluteFill}
          testID="project-creation-backdrop"
        />
        <View
          pointerEvents="box-none"
          style={[styles.position, {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
            paddingLeft: insets.left + horizontalInset,
            paddingRight: insets.right + horizontalInset
          }]}
        >
          <View
            accessibilityViewIsModal
            style={[styles.panel, { maxHeight: Math.min(height * 0.86, availableHeight) }]}
            testID="project-creation-panel"
          >
            <View style={styles.header}>
              <View style={styles.heading}>
                <Text accessibilityRole="header" style={[styles.title, fontScale >= 1.5 ? styles.titleLargeText : null]}>{title}</Text>
                <Text style={styles.description}>{description}</Text>
              </View>
              <Pressable
                accessibilityLabel="Close project form"
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={requestClose}
                ref={closeRef}
                style={({ pressed }) => [styles.close, pressed ? styles.closePressed : null]}
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false}>
                  <Path d="m6 6 12 12M18 6 6 18" fill="none" stroke={colors.ink} strokeWidth={1.6} strokeLinecap="round" />
                </Svg>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.fields}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              style={styles.scroll}
              testID="project-creation-fields"
            >
              {children}
            </ScrollView>
            <View style={styles.footer}>{footer}</View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  position: { flex: 1, alignItems: "center", justifyContent: "center" },
  panel: { width: "100%", maxWidth: 560, flexShrink: 1, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: radii.surface, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "flex-start", paddingLeft: spacing.lg, paddingVertical: spacing.md, paddingRight: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  heading: { flex: 1, gap: spacing.xs, paddingTop: spacing.xs },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 27, lineHeight: 34 },
  titleLargeText: { fontSize: 22, lineHeight: 29 },
  description: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  close: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.control },
  closePressed: { backgroundColor: colors.primarySoft },
  scroll: { flexShrink: 1 },
  fields: { padding: spacing.lg, gap: spacing.md },
  footer: { gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.canvas }
});
