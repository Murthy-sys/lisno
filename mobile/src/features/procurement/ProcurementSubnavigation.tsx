import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { resolveAuthorizedFeature } from "../../navigation/registry";
import { colors, fonts, radii, spacing } from "../../ui/tokens";

type ProcurementChild = "dashboard" | "vendors";

/** The compact counterpart to the expandable Procurement children in the tablet rail. */
export function ProcurementSubnavigation({ session, active, railBreakpoint = 600 }: {
  readonly session: AuthenticatedSession;
  readonly active: ProcurementChild;
  readonly railBreakpoint?: number;
}) {
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(true);
  if (width >= railBreakpoint || session.user.role !== "procurement") return null;

  const children = ([
    { id: "dashboard", featureId: "procurement", label: "Dashboard" },
    { id: "vendors", featureId: "procurement-vendors", label: "Vendors" }
  ] as const).flatMap((item) => {
    const destination = resolveAuthorizedFeature(item.featureId, session.user.role, session.authorization);
    return destination ? [{ ...item, path: destination.path }] : [];
  });
  if (children.length === 0) return null;

  return <View style={styles.group}>
    <Pressable accessibilityRole="button" accessibilityLabel="Procurement sections" accessibilityState={{ expanded }}
      onPress={() => setExpanded((value) => !value)} style={styles.parent}>
      <Text style={styles.parentText}>Procurement</Text>
      <Text accessibilityElementsHidden style={styles.parentChevron}>{expanded ? "⌃" : "⌄"}</Text>
    </Pressable>
    {expanded ? <View style={styles.children}>
      {children.map((child) => {
        const selected = active === child.id;
        return <Pressable key={child.id} accessibilityRole="button" accessibilityLabel={`Procurement ${child.label}`}
          accessibilityState={{ selected }} onPress={() => {
            if (!selected) router.push(child.path as never);
          }} style={({ pressed }) => [styles.child, selected ? styles.childSelected : null, pressed ? styles.pressed : null]}>
          <Text style={[styles.childText, selected ? styles.childTextSelected : null]}>{child.label}</Text>
        </Pressable>;
      })}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  parent: { minHeight: 48, borderRadius: radii.control, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md },
  parentText: { color: colors.primaryInk, fontFamily: fonts.semibold, fontSize: 15 },
  parentChevron: { color: colors.primaryInk, fontFamily: fonts.semibold, fontSize: 20, lineHeight: 24 },
  children: { gap: spacing.xxs, marginLeft: spacing.md },
  child: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radii.control },
  childSelected: { backgroundColor: colors.primarySoft },
  childText: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 14 },
  childTextSelected: { color: colors.primary, fontFamily: fonts.semibold },
  pressed: { opacity: 0.72 }
});
