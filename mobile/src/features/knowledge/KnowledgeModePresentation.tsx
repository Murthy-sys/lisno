import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, fonts } from "../../ui/tokens";
import { DetailIcon } from "./knowledgeDetailUi";

export function ModeSection({ title, kind, expanded, onToggle, children }: {
  readonly title: string;
  readonly kind: "pmc" | "execution" | "source";
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  return <View style={kind === "source" ? modeStyles.source : modeStyles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title}`} accessibilityState={{ expanded }} onPress={onToggle}
      style={[modeStyles.sectionHeading, kind === "pmc" ? modeStyles.pmcHeading : kind === "execution" ? modeStyles.executionHeading : modeStyles.sourceHeading]}>
      {kind !== "source" ? <ModeIcon kind={kind} /> : null}
      <Text style={kind === "source" ? modeStyles.sourceTitle : modeStyles.sectionTitle}>{title}</Text>
      <DetailIcon name={expanded ? "down" : "right"} size={16} />
    </Pressable>
    {expanded ? <View style={kind === "source" ? modeStyles.sourceBody : modeStyles.sectionBody}>{children}</View> : null}
  </View>;
}

function ModeIcon({ kind }: { readonly kind: "pmc" | "execution" }) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d={kind === "pmc" ? "M8 5H5v16h14V5h-3M8 3h8v5H8ZM8 12h8M8 16h6" : "M3 8h18v13H3ZM8 8V4h8v4M3 13h18M10 12v3h4v-3"} />
    </Svg>
  </View>;
}

export const modeStyles = StyleSheet.create({
  surface: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  setup: { padding: 12, gap: 10 },
  selectorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selector: { flex: 1, minWidth: 118 },
  description: { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 },
  section: { borderTopWidth: 1, borderTopColor: colors.border },
  sectionHeading: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, gap: 9 },
  pmcHeading: { backgroundColor: colors.primarySoft },
  executionHeading: { backgroundColor: colors.surfaceMuted },
  sectionTitle: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  sectionBody: { padding: 12, gap: 12 },
  source: { borderTopWidth: 1, borderTopColor: colors.border },
  sourceHeading: { paddingHorizontal: 0, minHeight: 46 },
  sourceTitle: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 19 },
  sourceBody: { gap: 14, paddingBottom: 4 },
  calculation: { gap: 10 },
  calculationHeading: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 12, lineHeight: 18 },
  calculationGroup: { gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  fieldRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8 },
  column: { flex: 1, minWidth: 118 },
  calculationAction: { alignSelf: "flex-start" },
  scopeList: { gap: 6 },
  scopeHeading: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  scopeHeadingLabel: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  scopeTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 12, lineHeight: 18 },
  scopeCount: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 16, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.surfaceMuted, borderRadius: 3 },
  scopeAdd: { minHeight: 44, minWidth: 56, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, paddingHorizontal: 2 },
  scopeAddLabel: { color: colors.primary, fontFamily: fonts.medium, fontSize: 11, lineHeight: 16 },
  scopeRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 4, backgroundColor: colors.surface },
  scopeRowSelected: { backgroundColor: colors.primarySoft, borderColor: colors.borderStrong },
  scopeRemove: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  scopeChoice: { flex: 1, minWidth: 0 }
});
