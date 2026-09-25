import { useId, useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { ScaffoldContentBack } from "../../navigation/AdaptiveAppScaffold";
import { colors, fonts, spacing } from "../../ui/tokens";
import { statusColors } from "./ProjectCard";
import type {
  ProjectDetailGroup,
  ProjectDetailPerson,
  ProjectDetailPresentation,
  ProjectDetailRow,
  ProjectDetailSection,
  ProjectDetailTone
} from "./projectDetailModel";

/** Window width at which the page switches to a main column plus a side column. */
export const PROJECT_DETAIL_WIDE_MIN_WIDTH = 900;
/** Side column width in the two-column layout. */
export const PROJECT_DETAIL_SIDE_WIDTH = 300;

const ARTWORK = require("../../../assets/brand/project-detail-interior.jpg");
const HERO_PAPER = "#f2f0e8";
const ICON_CHIP = "#eaece1";
const PERSON_MARK = "#e9ecdf";
const RADIUS = 4;
const COLUMN_GAP = 16;
/** Minimum available width for detail groups (and wide-group rows) to sit two per row. */
const GROUP_COLUMNS_MIN_WIDTH = 600;

/**
 * Cream overlay stops, left to right. Text sits on the near-opaque left part; on compact
 * screens the copy spans the full hero, so the overlay stays near-opaque across it.
 */
const HERO_STOPS: readonly (readonly [number, number])[] = [[0, 1], [0.4, 0.96], [0.75, 0.6], [1, 0.15]];
const HERO_STOPS_COMPACT: readonly (readonly [number, number])[] = [[0, 0.98], [0.55, 0.95], [1, 0.9]];
const APPROVAL_TONE = { ink: colors.info, background: colors.infoSoft, dot: colors.info };

function toneColors(tone: ProjectDetailTone) {
  return tone === "approval" ? APPROVAL_TONE : statusColors[tone];
}

function useStackedRows(): boolean {
  const { width, fontScale } = useWindowDimensions();
  return fontScale > 1.3 || width < 340;
}

function rowLabel(row: ProjectDetailRow): string {
  return `${row.label}: ${row.value}${row.note ? `, ${row.note}` : ""}`;
}

function Decorative({ children, style }: { readonly children: ReactNode; readonly style?: StyleProp<ViewStyle> }) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={style}>{children}</View>;
}

export function ProjectDetailHero({ detail }: { readonly detail: ProjectDetailPresentation }) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.3;
  const roomy = width >= 600;
  const gradientId = `projectHero${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const tone = toneColors(detail.status.tone);
  return (
    <View testID="project-detail-hero" style={[styles.hero, roomy ? styles.heroRoomy : null]}>
      <Decorative style={StyleSheet.absoluteFill}>
        <Image source={ARTWORK} resizeMode="cover" style={[styles.heroArtwork, compact ? styles.heroArtworkCompact : null]} />
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              {(compact ? HERO_STOPS_COMPACT : HERO_STOPS).map(([offset, opacity]) => <Stop key={offset} offset={offset} stopColor={HERO_PAPER} stopOpacity={opacity} />)}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={100} height={100} fill={`url(#${gradientId})`} />
        </Svg>
      </Decorative>
      <View style={styles.heroBack}><ScaffoldContentBack /></View>
      <View style={[styles.heroCopy, compact ? styles.heroCopyCompact : null]}>
        <Text style={styles.eyebrow}>PROJECT</Text>
        <Text accessibilityRole="header" style={styles.title}>{detail.name}</Text>
        <Text style={styles.description}>{detail.description}</Text>
        <View style={[styles.metadata, roomy ? styles.metadataRoomy : null]}>
          <View accessible accessibilityLabel={`Status: ${detail.status.label}`} style={[styles.badge, { backgroundColor: tone.background }]}>
            <View style={[styles.badgeDot, { backgroundColor: tone.dot }]} />
            <Text style={[styles.badgeLabel, { color: tone.ink }]}>{detail.status.label}</Text>
          </View>
          {detail.id ? <Text selectable style={styles.metaText}>{`Project ID: ${detail.id}`}</Text> : null}
          <Text style={styles.metaText}>{detail.created.iso ? `Created ${detail.created.label}` : `Created: ${detail.created.label}`}</Text>
        </View>
      </View>
    </View>
  );
}

export function ProjectDetailFacts({ facts }: { readonly facts: readonly ProjectDetailRow[] }) {
  const { width, fontScale } = useWindowDimensions();
  // Phones keep two tiles per row (one per row with enlarged text); a lone last tile grows to the full row.
  const basis = width < 600 ? (fontScale > 1.3 ? "100%" : "46%") : width < 1200 ? "30%" : "18%";
  return (
    <View testID="project-detail-facts" accessibilityLabel="Project summary" style={styles.facts}>
      {facts.map((fact) => (
        <View key={fact.key} accessible accessibilityLabel={rowLabel(fact)} style={[styles.fact, { flexBasis: basis }]}>
          <Text style={styles.factLabel}>{fact.label}</Text>
          <Text style={styles.factValue}>{fact.value}</Text>
          {fact.note ? <Text style={styles.factNote}>{fact.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function SectionIcon({ kind }: { readonly kind: ProjectDetailSection["key"] }) {
  const stroke = { fill: "none", stroke: colors.primary, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" accessible={false}>
      {kind === "information" ? <>
        <Path d="M6 3H14L19 8V21H6Z" {...stroke} />
        <Path d="M14 3V8H19M9 12.5H16M9 16H14" {...stroke} />
      </> : kind === "assignment" ? <>
        <Circle cx={12} cy={8} r={4} {...stroke} />
        <Path d="M4.5 20.5C5.3 16.8 8.3 14.5 12 14.5C15.7 14.5 18.7 16.8 19.5 20.5" {...stroke} />
      </> : <>
        <Rect x={3.5} y={5} width={17} height={15.5} rx={1.5} {...stroke} />
        <Path d="M3.5 10H20.5M8 3V7M16 3V7" {...stroke} />
      </>}
    </Svg>
  );
}

function DetailRow({ row, stacked, style }: { readonly row: ProjectDetailRow; readonly stacked: boolean; readonly style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityLabel={rowLabel(row)} style={[styles.row, stacked ? styles.rowStacked : null, style]}>
      <Text style={[styles.rowLabel, stacked ? null : styles.rowLabelSide]}>{row.label}</Text>
      <View style={stacked ? null : styles.rowValueSide}>
        <Text selectable style={styles.rowValue}>{row.value}</Text>
        {row.note ? <Text style={styles.rowNote}>{row.note}</Text> : null}
      </View>
    </View>
  );
}

function DetailGroup({ group, twoColumn, stacked }: { readonly group: ProjectDetailGroup; readonly twoColumn: boolean; readonly stacked: boolean }) {
  const splitRows = twoColumn && group.wide;
  return (
    <View style={[styles.group, twoColumn ? (group.wide ? styles.groupFull : styles.groupHalf) : null]}>
      <Text accessibilityRole="header" style={styles.groupTitle}>{group.title}</Text>
      {group.rows.length === 0 ? (group.emptyText ? <Text style={styles.copy}>{group.emptyText}</Text> : null) : (
        <View style={[styles.rows, splitRows ? styles.rowsSplit : null]}>
          {group.rows.map((row) => <DetailRow key={row.key} row={row} stacked={stacked} style={splitRows ? styles.rowHalf : null} />)}
        </View>
      )}
    </View>
  );
}

function DetailSectionCard({ section, twoColumn, stacked }: { readonly section: ProjectDetailSection; readonly twoColumn: boolean; readonly stacked: boolean }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <View testID={`project-detail-section-${section.key}`} style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={section.title} accessibilityHint={section.subtitle}
        onPress={() => setExpanded((current) => !current)} style={({ pressed }) => [styles.sectionHeader, pressed ? styles.sectionHeaderPressed : null]}>
        <Decorative style={styles.iconChip}><SectionIcon kind={section.key} /></Decorative>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
        </View>
        <Svg accessible={false} width={18} height={18} viewBox="0 0 20 20">
          <Path d={expanded ? "M5 12.5L10 7.5L15 12.5" : "M5 7.5L10 12.5L15 7.5"} fill="none" stroke={colors.inkMuted} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
      {expanded ? (
        <View testID={`project-detail-section-${section.key}-body`} style={[styles.sectionBody, twoColumn ? styles.sectionBodyColumns : null]}>
          {section.groups.map((group) => <DetailGroup key={group.key} group={group} twoColumn={twoColumn} stacked={stacked} />)}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Collapsible detail cards, open by default. Groups sit two per row when the cards are at least
 * 600 wide: measured on layout, estimated from the window until the first layout event.
 */
export function ProjectDetailSections({ sections }: { readonly sections: readonly ProjectDetailSection[] }) {
  const { width } = useWindowDimensions();
  const stacked = useStackedRows();
  const [measured, setMeasured] = useState<number | null>(null);
  const estimated = width - 2 * spacing.lg - (width >= PROJECT_DETAIL_WIDE_MIN_WIDTH ? PROJECT_DETAIL_SIDE_WIDTH + COLUMN_GAP : 0);
  const twoColumn = (measured ?? estimated) >= GROUP_COLUMNS_MIN_WIDTH;
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasured((current) => current === next ? current : next);
  };
  return (
    <View testID="project-detail-sections" onLayout={onLayout} style={styles.sections}>
      {sections.map((section) => <DetailSectionCard key={section.key} section={section} twoColumn={twoColumn} stacked={stacked} />)}
    </View>
  );
}

export function ProjectDetailAside({ summary, people, showFigure }: {
  readonly summary: readonly ProjectDetailRow[];
  readonly people: readonly ProjectDetailPerson[];
  readonly showFigure: boolean;
}) {
  const stacked = useStackedRows();
  return (
    <View testID="project-detail-aside" style={styles.aside}>
      {showFigure ? (
        <View testID="project-detail-figure" style={styles.figure}>
          <View style={styles.figureCaption}>
            <Text style={styles.figureTitle}>Interior reference</Text>
            <Text style={styles.figureNote}>Illustrative artwork</Text>
          </View>
          <Decorative><Image source={ARTWORK} resizeMode="cover" style={styles.figureImage} /></Decorative>
        </View>
      ) : null}
      <View style={styles.asideCard}>
        <Text accessibilityRole="header" style={styles.asideTitle}>Quick summary</Text>
        <View>
          {summary.map((row, index) => (
            <View key={row.key} accessible accessibilityLabel={rowLabel(row)}
              style={[styles.summaryRow, stacked ? styles.summaryRowStacked : null, index > 0 ? styles.summaryDivider : null, index === 0 ? styles.summaryFirst : null, index === summary.length - 1 ? styles.summaryLast : null]}>
              <Text style={[styles.summaryLabel, stacked ? null : styles.summaryCell]}>{row.label}</Text>
              <Text style={[styles.summaryValue, stacked ? null : [styles.summaryCell, styles.summaryValueEnd]]}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>
      {people.length > 0 ? (
        <View testID="project-detail-team" style={styles.asideCard}>
          <Text accessibilityRole="header" style={styles.asideTitle}>Team members</Text>
          <View style={styles.people}>
            {people.map((person) => (
              <View key={person.key} accessible accessibilityLabel={`${person.role}: ${person.name}${person.detail ? `, ${person.detail}` : ""}`} style={styles.person}>
                <Decorative style={styles.personMark}><Text style={styles.personInitial}>{person.initial}</Text></Decorative>
                <View style={styles.personCopy}>
                  <Text style={styles.personRole}>{person.role}</Text>
                  <Text style={styles.personName}>{person.name}</Text>
                  {person.detail ? <Text style={styles.personDetail}>{person.detail}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Page composition. Below 900 wide: hero, facts, sections, quick summary / team, then `children`
 * (the operational content). At 900 and above: hero, then a main column (facts, sections,
 * `children`) beside a 300 wide side column (illustrative figure, quick summary, team). The main
 * column keeps the same tree position in both layouts, so operational state survives a resize.
 */
export function ProjectDetailLayout({ detail, children }: { readonly detail: ProjectDetailPresentation; readonly children?: ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= PROJECT_DETAIL_WIDE_MIN_WIDTH;
  const aside = <ProjectDetailAside summary={detail.summary} people={detail.people} showFigure={wide} />;
  return (
    <View testID={wide ? "project-detail-layout-two-column" : "project-detail-layout-single"} style={styles.page}>
      <ProjectDetailHero detail={detail} />
      <View style={[styles.columns, wide ? styles.columnsWide : null]}>
        <View testID="project-detail-main" style={[styles.main, wide ? styles.mainWide : null]}>
          <ProjectDetailFacts facts={detail.facts} />
          <ProjectDetailSections sections={detail.sections} />
          {wide ? null : aside}
          {children}
        </View>
        {wide ? <View testID="project-detail-side" style={styles.side}>{aside}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: COLUMN_GAP, minWidth: 0 },
  columns: { gap: COLUMN_GAP, minWidth: 0 },
  columnsWide: { flexDirection: "row", alignItems: "flex-start" },
  main: { minWidth: 0, gap: COLUMN_GAP },
  mainWide: { flex: 1 },
  side: { width: PROJECT_DETAIL_SIDE_WIDTH, flexShrink: 0 },
  hero: { position: "relative", minHeight: 200, overflow: "hidden", borderRadius: RADIUS, backgroundColor: HERO_PAPER, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 18 },
  heroRoomy: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 24 },
  heroArtwork: { position: "absolute", top: 0, right: 0, bottom: 0, width: "72%", height: "100%" },
  heroArtworkCompact: { width: "100%" },
  heroBack: { alignSelf: "flex-start", marginLeft: -10 },
  heroCopy: { flexGrow: 1, justifyContent: "center", gap: 6, width: "72%", maxWidth: 560, minWidth: 0, paddingTop: 4 },
  heroCopyCompact: { width: "100%" },
  eyebrow: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 10, lineHeight: 14, letterSpacing: 2 },
  title: { color: colors.ink, fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  description: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  metadata: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 8, columnGap: 8, marginTop: 4, minWidth: 0 },
  metadataRoomy: { columnGap: 14 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12, flexShrink: 1, maxWidth: "100%" },
  badgeDot: { height: 6, width: 6, borderRadius: 3 },
  badgeLabel: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 16, flexShrink: 1 },
  metaText: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, flexShrink: 1, maxWidth: "100%" },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 10, minWidth: 0 },
  fact: { flexGrow: 1, minWidth: 0, gap: 4, padding: 12, borderRadius: RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  factLabel: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 11, lineHeight: 16 },
  factValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, fontVariant: ["tabular-nums"] },
  factNote: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  sections: { gap: COLUMN_GAP, minWidth: 0 },
  card: { overflow: "hidden", borderRadius: RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sectionHeader: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  sectionHeaderPressed: { backgroundColor: colors.surfaceMuted },
  iconChip: { width: 28, height: 28, borderRadius: RADIUS, alignItems: "center", justifyContent: "center", backgroundColor: ICON_CHIP },
  sectionCopy: { flex: 1, minWidth: 0, gap: 2 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  sectionSubtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  sectionBody: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.border },
  sectionBodyColumns: { flexDirection: "row", flexWrap: "wrap", columnGap: 24 },
  group: { minWidth: 0, gap: 10, paddingTop: 15 },
  groupHalf: { flexGrow: 1, flexBasis: "45%" },
  groupFull: { flexGrow: 1, flexBasis: "100%" },
  groupTitle: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16, letterSpacing: 0.6, textTransform: "uppercase" },
  rows: { gap: 11, minWidth: 0 },
  rowsSplit: { flexDirection: "row", flexWrap: "wrap", columnGap: 24 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8, minWidth: 0 },
  rowStacked: { flexDirection: "column", gap: 2 },
  rowHalf: { flexGrow: 1, flexBasis: "45%" },
  rowLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 18 },
  rowLabelSide: { flex: 0.75, minWidth: 84 },
  rowValueSide: { flex: 1.25, minWidth: 0 },
  rowValue: { color: colors.ink, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  rowNote: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  aside: { gap: COLUMN_GAP, minWidth: 0 },
  figure: { overflow: "hidden", borderRadius: RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  figureCaption: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", rowGap: 4, columnGap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  figureTitle: { color: colors.ink, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  figureNote: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  figureImage: { width: "100%", aspectRatio: 1.65 },
  asideCard: { padding: 16, borderRadius: RADIUS, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  asideTitle: { marginBottom: 14, color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
  summaryRowStacked: { flexDirection: "column", gap: 2 },
  summaryDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  summaryFirst: { paddingTop: 0 },
  summaryLast: { paddingBottom: 0 },
  summaryCell: { flex: 1, minWidth: 0 },
  summaryLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 18 },
  summaryValue: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  summaryValueEnd: { textAlign: "right" },
  people: { gap: 15 },
  person: { flexDirection: "row", alignItems: "flex-start", gap: 10, minWidth: 0 },
  personMark: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: PERSON_MARK },
  personInitial: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  personCopy: { flex: 1, minWidth: 0, gap: 2 },
  personRole: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, letterSpacing: 0.4, textTransform: "uppercase" },
  personName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 19 },
  personDetail: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 }
});
