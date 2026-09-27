import { router } from "expo-router";
import { useContext, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Platform, Pressable, StyleSheet, Text, View, findNodeHandle, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import type { AuthenticatedSession } from "../../contracts/session";
import { ScaffoldContentBack } from "../../navigation/AdaptiveAppScaffold";
import { resolveAuthorizedFeature } from "../../navigation/registry";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import { BotanicalAccent } from "../notifications/BotanicalAccent";
import { ProjectDetailGlyph, type ProjectDetailGlyphName } from "./projectDetailIcons";
import type { ProjectDetailPresentation } from "./projectDetailModel";
import { projectDetailTheme } from "./projectDetailTheme";

interface ProjectAction {
  readonly key: string;
  readonly label: string;
  readonly glyph: ProjectDetailGlyphName;
  readonly onSelect: () => void;
}

interface MenuAnchor { readonly top: number; readonly right: number }

/** Offset below the top inset used until (or unless) the ⋮ button can be measured. */
const FALLBACK_TOP = 56;
const MENU_GAP = 6;

function focus(target: View | null) {
  if (!target) return;
  if (Platform.OS === "web") { target.focus?.(); return; }
  const handle = findNodeHandle(target);
  if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
}

/**
 * Page header: content Back, the ⋮ overflow menu (refresh, and project messages when the role may
 * open Messages), the "Project Details" title and the role subtitle over decorative sage leaves.
 * Menu visibility is advisory; the backend stays authoritative.
 */
export function ProjectDetailHeader({ detail, session, onRefresh }: {
  readonly detail: ProjectDetailPresentation;
  readonly session: AuthenticatedSession;
  readonly onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const trigger = useRef<View>(null);
  const firstItem = useRef<View>(null);
  const restoreFocus = useRef(false);
  const { width } = useWindowDimensions();
  // Read the context directly so a missing SafeAreaProvider (tests, previews) falls back to zero insets.
  const insets = useContext(SafeAreaInsetsContext);
  const insetTop = insets?.top ?? 0;
  const insetRight = insets?.right ?? 0;

  function openMenu() {
    setAnchor(null);
    setOpen(true);
    trigger.current?.measureInWindow?.((x, y, buttonWidth, buttonHeight) => {
      if (![x, y, buttonWidth, buttonHeight].every(Number.isFinite) || buttonWidth <= 0) return;
      setAnchor({ top: y + buttonHeight + MENU_GAP, right: width - x - buttonWidth });
    });
  }
  function close() {
    setOpen(false);
    // iOS ignores focus requests until the modal has dismissed, so it restores focus from `onDismiss` instead.
    if (Platform.OS !== "ios") requestAnimationFrame(() => focus(trigger.current));
    else restoreFocus.current = true;
  }
  function dismissed() {
    if (restoreFocus.current) focus(trigger.current);
    restoreFocus.current = false;
  }

  const projectId = detail.id;
  const actions: ProjectAction[] = [
    { key: "refresh", label: "Refresh project", glyph: "refresh", onSelect: () => { close(); onRefresh(); } }
  ];
  if (projectId && resolveAuthorizedFeature("messages", session.user.role, session.authorization)) {
    actions.push({
      key: "messages",
      label: "Project messages",
      glyph: "message",
      onSelect: () => {
        setOpen(false);
        router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId: projectId } });
      }
    });
  }

  const panelTop = Math.max(insetTop + spacing.xs, anchor?.top ?? insetTop + FALLBACK_TOP);
  const panelRight = Math.max(insetRight + spacing.xs, anchor?.right ?? insetRight + spacing.md);

  return (
    <View testID="project-detail-header" style={styles.header}>
      <View testID="project-detail-leaves" pointerEvents="none" accessible={false} accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants" style={styles.leaves}>
        <BotanicalAccent />
      </View>
      <View style={styles.topRow}>
        <View style={styles.back}><ScaffoldContentBack /></View>
        <Pressable ref={trigger} testID="project-detail-actions-button" accessibilityRole="button" accessibilityLabel="More project actions"
          accessibilityState={{ expanded: open }} onPress={openMenu} style={({ pressed }) => [styles.kebab, pressed ? styles.kebabPressed : null]}>
          <ProjectDetailGlyph name="kebab" color={colors.ink} size={20} />
        </Pressable>
      </View>
      <Text accessibilityRole="header" style={styles.title}>Project Details</Text>
      <Text style={styles.subtitle}>{detail.subtitle}</Text>
      <Modal testID="project-actions-modal" transparent visible={open} animationType="none" presentationStyle="overFullScreen" statusBarTranslucent
        onRequestClose={close} onShow={() => focus(firstItem.current)} onDismiss={dismissed}>
        <View style={styles.overlay} onAccessibilityEscape={close}>
          <Pressable testID="project-actions-backdrop" accessibilityRole="button" accessibilityLabel="Close project actions" onPress={close} style={styles.backdrop} />
          <View testID="project-actions-menu" accessibilityRole="menu" accessibilityViewIsModal accessibilityLabel="Project actions"
            style={[styles.panel, { top: panelTop, right: panelRight }]}>
            {actions.map((action, index) => (
              <Pressable key={action.key} ref={index === 0 ? firstItem : undefined} testID={`project-action-${action.key}`} accessibilityRole="menuitem"
                accessibilityLabel={action.label} onPress={action.onSelect} style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}>
                <ProjectDetailGlyph name={action.glyph} size={projectDetailTheme.glyph} />
                <Text style={styles.itemLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { position: "relative", minWidth: 0, overflow: "visible", gap: 6 },
  leaves: { position: "absolute", top: -8, right: -16, width: 200, height: 150, overflow: "hidden", opacity: 0.55 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs, minHeight: projectDetailTheme.touch, minWidth: 0 },
  back: { marginLeft: -10, flexShrink: 1, minWidth: 0 },
  kebab: {
    width: projectDetailTheme.touch,
    height: projectDetailTheme.touch,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: projectDetailTheme.innerRadius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  kebabPressed: { backgroundColor: colors.surfaceMuted },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 28, lineHeight: 34 },
  subtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  overlay: { flex: 1 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(31, 42, 28, 0.16)" },
  panel: {
    position: "absolute",
    minWidth: 220,
    maxWidth: "90%",
    padding: spacing.xxs,
    borderRadius: projectDetailTheme.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8
  },
  item: { minHeight: projectDetailTheme.touch, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 10, borderRadius: radii.control },
  itemPressed: { backgroundColor: colors.surfaceMuted },
  itemLabel: { flexShrink: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 }
});
