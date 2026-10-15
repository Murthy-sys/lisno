import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { AuthenticatedSession } from "../contracts/session";
import { fonts } from "../ui/tokens";
import { NavigationIcon } from "./NavigationIcon";
import { procurementNavigationColors as palette, resolveProcurementNavigation, type ProcurementNavigationLink } from "./procurementMenuModel";
import type { FeatureDestination, FeatureId } from "./registry";

function ProcurementMenuIcon({ id, color }: { readonly id: FeatureId | "procurement-group"; readonly color: string }) {
  if (id === "work" || id === "execution") return <NavigationIcon name="home" color={color} />;
  if (id === "messages") return <NavigationIcon name="messages" color={color} />;
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {id === "procurement-group" ? <><Path d="M2 4h3l3 12h11l3-9H6M8 12h12" /><Circle cx={9} cy={20} r={1} /><Circle cx={18} cy={20} r={1} /></> : null}
    {id === "access-self" ? <><Circle cx={8} cy={8} r={5} /><Path d="m12 12 9 9M16 16l3-3M18 18l3-3M6 7l1-1" /></> : null}
    {id === "work-order-approvals" ? <Path d="M8 4H4v17h16V4h-4M8 3h8v4H8V3Zm0 11 3 3 6-6" /> : null}
  </Svg>;
}

function MenuLink({ item, disabled, nested, onNavigate }: {
  readonly item: ProcurementNavigationLink;
  readonly disabled: boolean;
  readonly nested?: boolean;
  readonly onNavigate: (destination: FeatureDestination) => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={nested ? `Procurement ${item.label}` : item.label}
    accessibilityState={{ selected: item.selected, disabled }} disabled={disabled}
    onPress={() => { if (!disabled) onNavigate(item.destination); }}
    style={({ pressed }) => [styles.link, nested ? styles.nestedLink : null, item.selected ? styles.selected : null, pressed ? styles.pressed : null, disabled ? styles.disabled : null]}>
    {!nested ? <ProcurementMenuIcon id={item.id} color={item.selected ? palette.activeInk : palette.ink} /> : null}
    <Text style={[styles.label, nested ? styles.childLabel : null, item.selected ? styles.selectedLabel : null]}>{item.label}</Text>
  </Pressable>;
}

/** The same authorized menu is shared by the phone drawer and tablet rail. */
export function ProcurementNavigation({ session, activeFeature, disabled = false, onNavigate }: {
  readonly session: AuthenticatedSession;
  readonly activeFeature?: FeatureId;
  readonly disabled?: boolean;
  readonly onNavigate: (destination: FeatureDestination) => void;
}) {
  const entries = resolveProcurementNavigation(session, activeFeature);
  const hasActiveGroup = entries.some((entry) => entry.kind === "group" && entry.selected);
  const [expanded, setExpanded] = useState(hasActiveGroup);
  useEffect(() => { if (hasActiveGroup) setExpanded(true); }, [activeFeature, hasActiveGroup]);
  if (!entries.length) return null;

  return <View testID="procurement-navigation" style={styles.menu}>
    {entries.map((entry) => {
      if (entry.kind === "link") return <MenuLink key={entry.id} item={entry} disabled={disabled} onNavigate={onNavigate} />;
      const selected = entry.selected && !expanded;
      return <View key={entry.id}>
        <Pressable accessibilityRole="button" accessibilityLabel={entry.label}
          accessibilityState={{ selected: entry.selected, expanded, disabled }} disabled={disabled}
          onPress={() => { if (!disabled) setExpanded((value) => !value); }}
          style={({ pressed }) => [styles.link, selected ? styles.selected : null, pressed ? styles.pressed : null, disabled ? styles.disabled : null]}>
          <ProcurementMenuIcon id={entry.id} color={selected ? palette.activeInk : palette.ink} />
          <Text style={[styles.label, selected ? styles.selectedLabel : null]}>{entry.label}</Text>
          <View style={expanded ? styles.chevronExpanded : undefined}>
            <NavigationIcon name="chevron" size={18} color={selected ? palette.activeInk : palette.ink} />
          </View>
        </Pressable>
        {expanded ? <View testID="procurement-navigation-children" style={styles.children}>
          {entry.children.map((child) => <MenuLink key={child.id} item={child} disabled={disabled} nested onNavigate={onNavigate} />)}
        </View> : null}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  menu: { gap: 8, backgroundColor: palette.rail },
  link: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 6 },
  nestedLink: { minHeight: 48, paddingVertical: 12, paddingLeft: 52 },
  label: { flex: 1, flexShrink: 1, color: palette.ink, fontFamily: fonts.medium, fontSize: 15, lineHeight: 23 },
  childLabel: { fontSize: 14, lineHeight: 21 },
  selected: { backgroundColor: palette.active },
  selectedLabel: { color: palette.activeInk, fontFamily: fonts.semibold },
  children: { gap: 2, paddingTop: 2 },
  chevronExpanded: { transform: [{ rotate: "90deg" }] },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 }
});
