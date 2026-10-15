import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import Svg, { Path } from "react-native-svg";

import { colors, fonts, spacing } from "../../ui/tokens";
import { formatDashboardPaise } from "../dashboard/data/formatters";
import { procurementSourceLabels, procurementStatusLabels, type ProcurementGalleryProject } from "./procurementDashboardModel";

// Bundled representative interiors, identical to the web gallery. Never customer imagery.
const projectCovers: readonly ImageSourcePropType[] = [
  require("../../../assets/procurement-projects/living-room.webp"),
  require("../../../assets/procurement-projects/bedroom.webp"),
  require("../../../assets/procurement-projects/kitchen.webp")
];

export function procurementProjectCover(projectId: string): ImageSourcePropType {
  let hash = 2166136261;
  for (let index = 0; index < projectId.length; index += 1) hash = Math.imul(hash ^ projectId.charCodeAt(index), 16777619) >>> 0;
  return projectCovers[((hash ^ (hash >>> 16)) >>> 0) % projectCovers.length]!;
}

export function ProcurementGalleryCard({ entry, preparationKnown, wide, canOpen, onOpen }: {
  readonly entry: ProcurementGalleryProject;
  readonly preparationKnown: boolean;
  readonly wide: boolean;
  readonly canOpen: boolean;
  readonly onOpen: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const prepared = entry.kind === "prepared" ? entry.project : null;
  const assigned = entry.kind === "assigned" ? entry.project : null;
  const name = prepared?.projectName ?? assigned?.name ?? "Project";
  const preparationLabel = prepared ? procurementSourceLabels[prepared.sourceKind]
    : preparationKnown ? "Awaiting procurement preparation" : "Preparation status unavailable";
  const selectedSections = prepared ? `${prepared.selectedSectionCount} selected Estimate ${prepared.selectedSectionCount === 1 ? "section" : "sections"}` : null;
  const accessibleDescription = prepared
    ? `${name}. ${procurementStatusLabels[prepared.taskStatus]}. ${preparationLabel}. Estimate version ${prepared.estimateVersion}. ${selectedSections}. Selected estimate value ${formatDashboardPaise(prepared.selectedValuePaise)}. Recorded spend ${formatDashboardPaise(prepared.recordedSpendPaise)}. Remaining selected value ${formatDashboardPaise(prepared.remainingValuePaise)}.`
    : `${name}. ${preparationLabel}. ${assigned?.subtitle ?? ""}`;

  return <Pressable testID={`procurement-project-${entry.id}`} accessibilityRole={canOpen ? "button" : "text"}
    accessibilityLabel={`${canOpen ? "Open " : ""}${accessibleDescription}`}
    accessibilityState={{ disabled: !canOpen }} disabled={!canOpen} onPress={onOpen}
    style={({ pressed }) => [styles.card, wide ? styles.cardWide : null, pressed ? styles.pressed : null]}>
    <View style={[styles.cover, wide ? styles.coverWide : null]}>
      {imageFailed ? <View testID={`procurement-cover-fallback-${entry.id}`} style={styles.coverFallback} accessible={false}>
        <Svg width={80} height={56} viewBox="0 0 80 56" accessible={false}><Path d="M5 49V23L27 8l22 15v26M17 49V29h20v20M49 49V19l25 16v14M2 49h76" fill="none" stroke={colors.primary} strokeWidth={1.4} /></Svg>
      </View> : <Image testID={`procurement-cover-${entry.id}`} source={procurementProjectCover(entry.id)} style={styles.image} resizeMode="cover"
        accessible={false} accessibilityIgnoresInvertColors onError={() => setImageFailed(true)} />}
      <Text style={styles.representative}>REPRESENTATIVE INTERIOR</Text>
    </View>
    <View style={styles.body}>
      <View style={styles.metadata}>
        <Text style={styles.version}>{prepared ? `ESTIMATE V${prepared.estimateVersion}` : "ASSIGNED PROJECT"}</Text>
        {prepared ? <Text style={styles.status}>{procurementStatusLabels[prepared.taskStatus]}</Text> : null}
      </View>
      <Text style={styles.projectName}>{name}</Text>
      {prepared?.clientName || prepared?.openedDate || assigned?.subtitle ? <Text style={styles.details}>
        {[prepared?.clientName, prepared?.openedDate ? `Opened ${prepared.openedDate}` : null, assigned?.subtitle].filter(Boolean).join(" · ")}
      </Text> : null}
      <Text style={styles.source}>{preparationLabel}</Text>
      {prepared ? <>
        <Text style={styles.sections}>{selectedSections}</Text>
        <View style={styles.selectedValue}>
          <Text style={styles.amountLabel}>Selected estimate value</Text>
          <Text style={styles.primaryAmount}>{formatDashboardPaise(prepared.selectedValuePaise)}</Text>
        </View>
        <View style={styles.secondaryAmounts}>
          <Amount label="Recorded spend" amount={prepared.recordedSpendPaise} />
          <Amount label="Remaining selected value" amount={prepared.remainingValuePaise} />
        </View>
      </> : <Text style={styles.assignedHint}>Project details are available to your assigned team. Procurement amounts appear when preparation is available.</Text>}
      <View style={styles.action}>
        <Text style={styles.actionText}>{canOpen ? "View project" : "Project details unavailable"}</Text>
        {canOpen ? <Svg accessible={false} width={18} height={18} viewBox="0 0 24 24"><Path d="M7 17 17 7M7 7h10v10" fill="none" stroke={colors.primary} strokeWidth={1.6} /></Svg> : null}
      </View>
    </View>
  </Pressable>;
}

function Amount({ label, amount }: { readonly label: string; readonly amount: number }) {
  return <View style={styles.secondaryAmount}>
    <Text style={styles.amountLabel}>{label}</Text>
    <Text style={styles.amountValue}>{formatDashboardPaise(amount)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 4 },
  cardWide: { flexDirection: "row" },
  pressed: { opacity: 0.78 },
  cover: { aspectRatio: 2.3, width: "100%", backgroundColor: colors.surfaceMuted },
  coverWide: { width: "36%", aspectRatio: undefined, minHeight: 300 },
  image: { width: "100%", height: "100%" },
  coverFallback: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 140 },
  representative: { position: "absolute", bottom: 0, left: 0, color: colors.inkMuted, backgroundColor: colors.canvas, paddingHorizontal: 10, paddingVertical: 5, fontFamily: fonts.medium, fontSize: 8, letterSpacing: 1 },
  body: { flex: 1, padding: spacing.md, gap: 7 },
  metadata: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 6 },
  version: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.2 },
  status: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 10 },
  projectName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28 },
  details: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 18 },
  source: { color: colors.primary, fontFamily: fonts.medium, fontSize: 11, lineHeight: 18 },
  sections: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 16 },
  selectedValue: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, marginTop: 4, gap: 4 },
  primaryAmount: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 22, lineHeight: 30, fontVariant: ["tabular-nums"] },
  secondaryAmounts: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 10, paddingTop: 3 },
  secondaryAmount: { flexGrow: 1, flexBasis: 130, minWidth: 0, gap: 4 },
  amountLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 16 },
  amountValue: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14, lineHeight: 22, fontVariant: ["tabular-nums"] },
  assignedHint: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, marginTop: 5 },
  action: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12, marginTop: 6, borderTopWidth: 1, borderColor: colors.border },
  actionText: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 12, lineHeight: 20, flexShrink: 1 }
});
