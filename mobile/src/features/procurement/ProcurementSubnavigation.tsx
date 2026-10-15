import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { useScaffoldNavigationBlocked } from "../../navigation/AdaptiveAppScaffold";
import { procurementNavigationColors as palette, resolveProcurementNavigation } from "../../navigation/procurementMenuModel";
import { fonts } from "../../ui/tokens";

type ProcurementChild = "dashboard" | "vendors" | "requests";
const featureForChild = { dashboard: "procurement", vendors: "procurement-vendors", requests: "my-requests" } as const;

/** Scrollable flat sections keep the current workspace visible on compact screens. */
export function ProcurementSubnavigation({ session, active, railBreakpoint = 600 }: {
  readonly session: AuthenticatedSession;
  readonly active: ProcurementChild;
  readonly railBreakpoint?: number;
}) {
  const { width } = useWindowDimensions();
  const blocked = useScaffoldNavigationBlocked();
  if (width >= railBreakpoint) return null;
  const group = resolveProcurementNavigation(session, featureForChild[active]).find((entry) => entry.kind === "group");
  if (!group || group.kind !== "group") return null;

  return <View accessibilityRole="tablist" accessibilityLabel="Procurement sections" style={styles.group}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {group.children.map((child) => <Pressable key={child.id} accessibilityRole="tab" accessibilityLabel={child.label}
        accessibilityState={{ selected: child.selected, disabled: blocked }} disabled={blocked}
        onPress={() => { if (!child.selected && !blocked) router.push(child.destination.path as never); }}
        style={({ pressed }) => [styles.tab, child.selected ? styles.selected : null, blocked ? styles.disabled : null, pressed ? styles.pressed : null]}>
        <Text style={[styles.label, child.selected ? styles.selectedLabel : null]}>{child.label}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  group: { borderBottomWidth: 1, borderBottomColor: palette.border },
  tabs: { gap: 4, paddingBottom: 8 },
  tab: { minHeight: 48, minWidth: 96, maxWidth: 240, justifyContent: "center", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 6 },
  selected: { backgroundColor: palette.active },
  label: { color: palette.muted, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, textAlign: "center", flexShrink: 1 },
  selectedLabel: { color: palette.activeInk, fontFamily: fonts.semibold },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 }
});
