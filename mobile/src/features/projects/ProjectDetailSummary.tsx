import { useState, type ReactNode } from "react";
import { Image, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, spacing } from "../../ui/tokens";
import { statusColors } from "./ProjectCard";
import { ProjectDetailGlyph } from "./projectDetailIcons";
import type { ProjectDetailPill, ProjectDetailPresentation, ProjectDetailRow, ProjectDetailTone, ProjectDetailValue } from "./projectDetailModel";
import { projectDetailTheme as theme } from "./projectDetailTheme";

const ARTWORK = require("../../../assets/brand/project-detail-interior.jpg");
const APPROVAL_TONE = { ink: colors.info, background: colors.infoSoft, dot: colors.info };
const THUMB_CHIP = "rgba(31,42,28,0.55)";
const PAD = 14;
const GAP = 12;
const VALUE_SIZE = 26;
const VALUE_MAX_SCALE = 1.5;
const PILL_SIZE = 13;
/** Grid cells keep the glyph beside the text, so it is a little smaller than the row glyph. */
const GRID_GLYPH = 16;
const FACT_LABEL_SIZE = 12;
const FACT_VALUE_SIZE = 14;
/** Grid cell width that is not text: column padding, glyph and gap. */
const FACT_CHROME = 8 + GRID_GLYPH + 6;
/** Thumbnail width when the facts sit below the thumbnail and name. */
const BELOW_THUMB = 88;
/** Conservative Poppins glyph advance, as a fraction of the font size, for keeping the value's words unbroken. */
const GLYPH_EM = 0.6;

function toneColors(tone: ProjectDetailTone) {
  return tone === "approval" ? APPROVAL_TONE : statusColors[tone];
}

function Decorative({ children, style, testID }: { readonly children: ReactNode; readonly style?: StyleProp<ViewStyle>; readonly testID?: string }) {
  return <View testID={testID} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={style}>{children}</View>;
}

/** Card content width: measured on layout, estimated from the window until the first layout event. */
function useCardInnerWidth() {
  const { width, fontScale } = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) setMeasured((current) => current === next ? current : next);
  };
  const estimated = Math.min(width, theme.pageMaxWidth) - 2 * spacing.lg;
  return { width, fontScale, inner: (measured ?? estimated) - 2 * (PAD + 1), onLayout };
}

function FactCell({ row, stacked, style }: { readonly row: ProjectDetailRow; readonly stacked: boolean; readonly style?: StyleProp<ViewStyle> }) {
  return (
    <View testID={`project-summary-fact-${row.key}`} accessible accessibilityLabel={`${row.label}: ${row.value}`} style={[styles.fact, stacked ? styles.factStacked : null, style]}>
      <View style={styles.factGlyph}><ProjectDetailGlyph name={row.icon} size={stacked ? theme.glyph : GRID_GLYPH} color={colors.inkMuted} /></View>
      <View style={styles.factCopy}>
        <Text style={styles.factLabel}>{row.label}</Text>
        <Text selectable style={styles.factValue}>{row.value}</Text>
      </View>
    </View>
  );
}

/** Estimated rendered width of one word; narrow punctuation counts as half an advance. */
function wordWidth(word: string, size: number): number {
  return Array.from(word).reduce((sum, character) => sum + (",.:;'".includes(character) ? GLYPH_EM / 2 : GLYPH_EM), 0) * size;
}

function longestWordWidth(text: string, size: number): number {
  return Math.max(0, ...text.split(/\s+/).map((word) => wordWidth(word, size)));
}

function FactGrid({ rows }: { readonly rows: readonly ProjectDetailRow[] }) {
  return (
    <View>
      {[rows.slice(0, 2), rows.slice(2, 4)].map((pair, rowIndex) => (
        <View key={pair.map((row) => row.key).join("-")} style={[styles.gridRow, rowIndex > 0 ? styles.factDivider : null]}>
          {pair.map((row, column) => (
            <FactCell key={row.key} row={row} stacked={false}
              style={[rowIndex === 0 ? styles.factTop : styles.factBottom, column === 0 ? styles.factStart : styles.factEnd]} />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Illustrative thumbnail, project name and the four overview facts. The 2×2 grid sits beside the thumbnail when
 * every word fits a cell, below the thumbnail and name when one would break mid-word, and becomes one fact per
 * row on narrow screens or with enlarged text.
 */
export function ProjectSummaryCard({ detail }: { readonly detail: ProjectDetailPresentation }) {
  const { width, fontScale, inner, onLayout } = useCardInnerWidth();
  const besideThumb = width >= 600 ? 200 : Math.min(200, Math.max(BELOW_THUMB, Math.round(inner * 0.28)));
  const longestWord = Math.max(0, ...detail.overview.flatMap((row) => [longestWordWidth(row.label, FACT_LABEL_SIZE), longestWordWidth(row.value, FACT_VALUE_SIZE)])) * fontScale;
  const layout = width < 360 || fontScale > 1.3 ? "stacked" : longestWord <= (inner - besideThumb - GAP) / 2 - FACT_CHROME ? "beside" : "below";
  const thumbnail = (
    <Decorative testID="project-summary-thumbnail" style={[styles.thumb, layout === "stacked" ? styles.thumbStacked : { width: layout === "beside" ? besideThumb : BELOW_THUMB }]}>
      <Image source={ARTWORK} resizeMode="cover" style={styles.thumbImage} />
      <View style={styles.thumbChip}><ProjectDetailGlyph name="image" size={16} color={colors.primaryInk} /></View>
    </Decorative>
  );
  const name = <Text accessibilityRole="header" style={styles.name}>{detail.name}</Text>;
  return (
    <View testID="project-summary-card" onLayout={onLayout} style={[styles.card, layout === "beside" ? styles.summary : styles.summaryStacked]}>
      {layout === "beside" ? (
        <>
          {thumbnail}
          <View style={[styles.info, styles.infoBeside]}>{name}<FactGrid rows={detail.overview} /></View>
        </>
      ) : layout === "below" ? (
        <>
          <View style={styles.summaryHead}>{thumbnail}<View style={styles.infoBeside}>{name}</View></View>
          <FactGrid rows={detail.overview} />
        </>
      ) : (
        <>
          {thumbnail}
          <View style={styles.info}>
            {name}
            <View>
              {detail.overview.map((row, index) => <FactCell key={row.key} row={row} stacked style={index > 0 ? styles.factDivider : null} />)}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function ValuePill({ pill, style }: { readonly pill: ProjectDetailPill; readonly style?: StyleProp<ViewStyle> }) {
  const tone = pill.approved ? null : toneColors(pill.tone);
  return (
    <View testID="project-value-pill" style={[styles.pill, { backgroundColor: tone ? tone.background : colors.primarySoft }, style]}>
      {tone ? <View style={[styles.pillDot, { backgroundColor: tone.dot }]} /> : (
        <View style={styles.pillCheck}><ProjectDetailGlyph name="check" size={12} color={colors.primaryInk} strokeWidth={2.4} /></View>
      )}
      <Text style={[styles.pillLabel, { color: tone ? tone.ink : colors.primary }]}>{pill.label}</Text>
    </View>
  );
}

/**
 * Estimate value with its status pill, announced as one element. The pill sits on the right when the value's
 * longest word fits beside it; otherwise it wraps below the value, and the icon chip moves up beside the label
 * when even that leaves too little room.
 */
export function ProjectValueCard({ value }: { readonly value: ProjectDetailValue }) {
  const { width, fontScale, inner, onLayout } = useCardInnerWidth();
  const { pill } = value;
  const valueWidth = longestWordWidth(value.value, VALUE_SIZE) * Math.min(fontScale, VALUE_MAX_SCALE);
  const pillWidth = pill ? (pill.approved ? 48 : 36) + Array.from(pill.label).length * PILL_SIZE * GLYPH_EM * fontScale + GAP : 0;
  const beside = inner - theme.iconChipSize - GAP;
  const layout = width >= 360 && fontScale <= 1.3 && valueWidth <= beside - pillWidth ? "row" : valueWidth <= beside ? "wrap" : "stack";
  const chip = (
    <Decorative style={styles.valueChip}>
      <ProjectDetailGlyph name={value.kind === "estimate" ? "coins" : "progress"} size={22} color={colors.primary} />
    </Decorative>
  );
  const label = <Text style={[styles.valueLabel, layout === "stack" ? styles.valueHeadLabel : null]}>{value.label}</Text>;
  const pillView = pill ? <ValuePill pill={pill} style={layout === "row" ? null : styles.pillBelow} /> : null;
  return (
    <View testID="project-value-card" accessible accessibilityLabel={`${value.label}: ${value.value}${pill ? `, ${pill.label}` : ""}`} onLayout={onLayout}
      style={[styles.valueCard, layout === "wrap" ? styles.valueCardWrap : layout === "stack" ? styles.valueCardStack : null]}>
      {layout === "stack" ? <View style={styles.valueHead}>{chip}{label}</View> : chip}
      <View style={[styles.valueCopy, layout === "stack" ? null : styles.valueCopyBeside]}>
        {layout === "stack" ? null : label}
        <Text maxFontSizeMultiplier={VALUE_MAX_SCALE} style={styles.amount}>{value.value}</Text>
        {layout === "row" ? null : pillView}
      </View>
      {layout === "row" ? pillView : null}
    </View>
  );
}

const hairline = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  card: { borderRadius: theme.cardRadius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: PAD, minWidth: 0 },
  summary: { flexDirection: "row", alignItems: "flex-start", gap: GAP },
  summaryStacked: { flexDirection: "column", alignItems: "stretch" },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: GAP, minWidth: 0 },
  thumb: { aspectRatio: 1.05, overflow: "hidden", borderRadius: theme.innerRadius, backgroundColor: colors.surfaceMuted },
  thumbStacked: { width: "100%", aspectRatio: 1.8 },
  thumbImage: { width: "100%", height: "100%" },
  thumbChip: { position: "absolute", left: 8, bottom: 8, width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: THUMB_CHIP },
  info: { minWidth: 0, gap: 10 },
  infoBeside: { flex: 1 },
  name: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26 },
  gridRow: { flexDirection: "row", minWidth: 0 },
  fact: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 6 },
  factStacked: { flex: 0, gap: 10, paddingVertical: 10 },
  factTop: { paddingBottom: 10 },
  factBottom: { paddingTop: 10 },
  factStart: { paddingRight: 8 },
  factEnd: { paddingLeft: 8, borderLeftWidth: hairline, borderLeftColor: colors.border },
  factDivider: { borderTopWidth: hairline, borderTopColor: colors.border },
  factGlyph: { flexShrink: 0, paddingTop: 1 },
  factCopy: { flex: 1, minWidth: 0, gap: 2 },
  factLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  factValue: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  valueCard: {
    flexDirection: "row", alignItems: "center", gap: GAP, minWidth: 0, padding: PAD,
    borderRadius: theme.cardRadius, borderWidth: 1, borderColor: theme.valueBorder, backgroundColor: theme.valueTint
  },
  valueCardWrap: { alignItems: "flex-start" },
  valueCardStack: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  valueHead: { flexDirection: "row", alignItems: "center", gap: GAP, minWidth: 0 },
  valueChip: { width: theme.iconChipSize, height: theme.iconChipSize, borderRadius: theme.innerRadius, alignItems: "center", justifyContent: "center", backgroundColor: theme.iconChip },
  valueCopy: { minWidth: 0, gap: 2 },
  valueCopyBeside: { flex: 1 },
  valueLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  valueHeadLabel: { flex: 1, minWidth: 0 },
  amount: { color: colors.primary, fontFamily: fonts.semibold, fontSize: VALUE_SIZE, lineHeight: 32, fontVariant: ["tabular-nums"] },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32, maxWidth: "100%", flexShrink: 1, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  pillBelow: { alignSelf: "flex-start", marginTop: 6 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillCheck: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  pillLabel: { flexShrink: 1, fontFamily: fonts.medium, fontSize: PILL_SIZE, lineHeight: 18 }
});
