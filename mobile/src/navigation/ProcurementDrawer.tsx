import { useRef } from "react";
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { AuthenticatedSession } from "../contracts/session";
import { LisnoWordmark } from "../ui/brand";
import { fonts } from "../ui/tokens";
import { NavigationIcon } from "./NavigationIcon";
import { ProcurementNavigation } from "./ProcurementNavigation";
import { procurementNavigationColors as palette } from "./procurementMenuModel";
import type { FeatureDestination, FeatureId } from "./registry";

export function ProcurementMenuContents({ session, activeFeature, disabled, onNavigate, onProfile, onMore }: {
  readonly session: AuthenticatedSession;
  readonly activeFeature?: FeatureId;
  readonly disabled: boolean;
  readonly onNavigate: (destination: FeatureDestination) => void;
  readonly onProfile: () => void;
  readonly onMore: () => void;
}) {
  return <ScrollView contentContainerStyle={styles.menu} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>WORKSPACE</Text>
    <ProcurementNavigation session={session} {...(activeFeature ? { activeFeature } : {})} disabled={disabled} onNavigate={onNavigate} />
    <View style={styles.account}>
      <Text style={styles.eyebrow}>ACCOUNT & TOOLS</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Profile" accessibilityState={{ disabled }} disabled={disabled} onPress={onProfile} style={styles.accountRow}>
        <NavigationIcon name="person" color={palette.ink} size={22} /><Text style={styles.label}>Profile</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="More tools" accessibilityState={{ disabled }} disabled={disabled} onPress={onMore} style={styles.accountRow}>
        <NavigationIcon name="more" color={palette.ink} size={22} /><Text style={styles.label}>More tools</Text>
      </Pressable>
      <Text style={styles.accountName}>{session.user.name}</Text>
      <Text style={styles.accountRole}>Procurement</Text>
    </View>
  </ScrollView>;
}

export function ProcurementDrawer({ visible, onClose, ...menu }: React.ComponentProps<typeof ProcurementMenuContents> & {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const closeControl = useRef<View>(null);
  return <Modal visible={visible} transparent animationType="none" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={onClose}
    onShow={() => { const node = findNodeHandle(closeControl.current); if (node !== null) AccessibilityInfo.setAccessibilityFocus(node); }}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss navigation" onPress={onClose} style={styles.scrim} />
      <SafeAreaView edges={["top", "bottom", "left"]} accessibilityViewIsModal accessibilityLabel="Procurement navigation" style={styles.panel} testID="procurement-navigation-drawer">
        <View style={styles.header}>
          <LisnoWordmark tone="dark" width={100} />
          <Pressable ref={closeControl} accessibilityRole="button" accessibilityLabel="Close navigation" onPress={onClose} style={styles.close}><Text style={styles.closeLabel}>Close</Text></Pressable>
        </View>
        <ProcurementMenuContents {...menu} />
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row" },
  scrim: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(31,42,28,0.38)" },
  panel: { width: "90%", maxWidth: 360, backgroundColor: palette.rail, borderRightWidth: 1, borderRightColor: palette.border },
  header: { minHeight: 68, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: palette.border },
  close: { minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center" },
  closeLabel: { fontFamily: fonts.medium, fontSize: 13, color: palette.ink },
  menu: { flexGrow: 1, padding: 16, gap: 14 },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1.5, color: palette.muted },
  account: { marginTop: "auto", paddingTop: 24, borderTopWidth: 1, borderTopColor: palette.border, gap: 8 },
  accountRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 22, color: palette.ink, flexShrink: 1 },
  accountName: { paddingHorizontal: 12, paddingTop: 12, fontFamily: fonts.semibold, fontSize: 13, color: palette.ink },
  accountRole: { paddingHorizontal: 12, fontFamily: fonts.regular, fontSize: 12, color: palette.muted }
});
