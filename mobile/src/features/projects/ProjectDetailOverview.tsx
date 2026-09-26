import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, spacing } from "../../ui/tokens";
import { ProjectDetailGlyph, type ProjectDetailGlyphName } from "./projectDetailIcons";
import type { ProjectDetailEstimate, ProjectDetailGroup, ProjectDetailPerson, ProjectDetailRow, ProjectDetailSection } from "./projectDetailModel";
import { projectDetailTheme } from "./projectDetailTheme";

/** Minimum measured width of the section cards for detail groups (and wide-group rows) to sit two per row. */
const GROUP_COLUMNS_MIN_WIDTH = 600;
const CARD_PADDING = 16;
const CARD_GLYPH_SIZE = 22;
const CHEVRON_SIZE = 20;
const NO_TEAM_MEMBERS = "No team members are named on this project yet.";

const SECTION_GLYPHS: Readonly<Record<ProjectDetailSection["key"], ProjectDetailGlyphName>> = {
  information: "document",
  assignment: "person",
  schedule: "calendar"
};

/** Label above value (glyph stays left) on narrow screens or with enlarged text. */
function useStackedRows(): boolean {
  const { width, fontScale } = useWindowDimensions();
  return fontScale > 1.3 || width < 340;
}

function rowLabel(row: ProjectDetailRow): string {
  return `${row.label}: ${row.value}${row.note ? `, ${row.note}` : ""}`;
}

function personLabel(person: ProjectDetailPerson): string {
  return `${person.role}: ${person.name}${person.detail ? `, ${person.detail}` : ""}`;
}

function Decorative({ children, style }: { readonly children: ReactNode; readonly style?: StyleProp<ViewStyle> }) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={style}>{children}</View>;
}

/** Icon chip, title and subtitle shared by every card header. `header` gives the title the header role. */
function CardHeading({ glyph, title, subtitle, header = false }: {
  readonly glyph: ProjectDetailGlyphName;
  readonly title: string;
  readonly subtitle: string;
  readonly header?: boolean;
}) {
  return (
    <>
      <Decorative style={styles.iconChip}><ProjectDetailGlyph name={glyph} size={CARD_GLYPH_SIZE} color={colors.primary} /></Decorative>
      <View style={styles.headingCopy}>
        <Text accessibilityRole={header ? "header" : undefined} style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
    </>
  );
}

/** Static header row of a non-collapsible project detail card; the title carries the header role. */
export function ProjectCardHeader({ glyph, title, subtitle }: { readonly glyph: ProjectDetailGlyphName; readonly title: string; readonly subtitle: string }) {
  return <View style={styles.cardHeader}><CardHeading glyph={glyph} title={title} subtitle={subtitle} header /></View>;
}

/** One icon row, announced as a single element: "Label: value[, note]". */
function DetailRow({ row, stacked, style }: { readonly row: ProjectDetailRow; readonly stacked: boolean; readonly style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityLabel={rowLabel(row)} style={[styles.row, style]}>
      <Decorative style={styles.rowGlyph}>
        <ProjectDetailGlyph name={row.icon} size={projectDetailTheme.glyph} color={colors.inkMuted} />
      </Decorative>
      <View style={[styles.rowCopy, stacked ? styles.rowCopyStacked : null]}>
        <Text style={[styles.rowLabel, stacked ? null : styles.rowLabelSide]}>{row.label}</Text>
        <View style={stacked ? styles.rowValueStacked : styles.rowValueSide}>
          <Text selectable style={styles.rowValue}>{row.value}</Text>
          {row.note ? <Text style={styles.rowNote}>{row.note}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function pairs<T>(items: readonly T[]): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += 2) result.push(items.slice(index, index + 2));
  return result;
}

/**
 * Bordered row container with hairline dividers between rows. `split` lays rows out two per line
 * (odd last row keeps its column); an empty list shows `emptyText` inside the container.
 */
function RowList({ rows, emptyText, stacked, split }: {
  readonly rows: readonly ProjectDetailRow[];
  readonly emptyText: string | null;
  readonly stacked: boolean;
  readonly split: boolean;
}) {
  if (rows.length === 0) {
    return emptyText ? <View style={styles.rows}><Text style={styles.emptyText}>{emptyText}</Text></View> : null;
  }
  if (split && rows.length >= 2) {
    return (
      <View style={styles.rows}>
        {pairs(rows).map((pair, index) => (
          <View key={pair[0]?.key ?? index} style={[styles.rowPair, index > 0 ? styles.rowDivider : null]}>
            {pair.map((row) => <DetailRow key={row.key} row={row} stacked={stacked} style={styles.rowHalf} />)}
            {pair.length === 1 ? <View style={styles.rowHalf} /> : null}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.rows}>
      {rows.map((row, index) => <DetailRow key={row.key} row={row} stacked={stacked} style={index > 0 ? styles.rowDivider : null} />)}
    </View>
  );
}

function DetailGroup({ sectionKey, group, twoColumn, stacked }: {
  readonly sectionKey: ProjectDetailSection["key"];
  readonly group: ProjectDetailGroup;
  readonly twoColumn: boolean;
  readonly stacked: boolean;
}) {
  return (
    <View testID={`project-detail-section-${sectionKey}-group-${group.key}`}
      style={[styles.group, twoColumn ? (group.wide ? styles.groupFull : styles.groupHalf) : null]}>
      <Text accessibilityRole="header" style={styles.groupTitle}>{group.title}</Text>
      <RowList rows={group.rows} emptyText={group.emptyText} stacked={stacked} split={twoColumn && group.wide} />
    </View>
  );
}

function DetailSectionCard({ section, twoColumn, stacked }: { readonly section: ProjectDetailSection; readonly twoColumn: boolean; readonly stacked: boolean }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <View testID={`project-detail-section-${section.key}`} style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={section.title} accessibilityHint={section.subtitle}
        onPress={() => setExpanded((current) => !current)} style={({ pressed }) => [styles.cardHeader, pressed ? styles.cardHeaderPressed : null]}>
        <CardHeading glyph={SECTION_GLYPHS[section.key]} title={section.title} subtitle={section.subtitle} />
        <Decorative style={styles.chevron}>
          <ProjectDetailGlyph name={expanded ? "chevronUp" : "chevronDown"} size={CHEVRON_SIZE} color={colors.ink} />
        </Decorative>
      </Pressable>
      {expanded ? (
        <View testID={`project-detail-section-${section.key}-body`} style={[styles.cardBody, styles.groups, twoColumn ? styles.groupsColumns : null]}>
          {section.groups.map((group) => <DetailGroup key={group.key} sectionKey={section.key} group={group} twoColumn={twoColumn} stacked={stacked} />)}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Information tab: collapsible detail cards, open by default. Groups sit two per row when the cards
 * are at least 600 wide: measured on layout, estimated from the capped window width until then.
 */
export function ProjectDetailSections({ sections }: { readonly sections: readonly ProjectDetailSection[] }) {
  const { width } = useWindowDimensions();
  const stacked = useStackedRows();
  const [measured, setMeasured] = useState<number | null>(null);
  const estimated = Math.min(width, projectDetailTheme.pageMaxWidth) - 2 * spacing.lg;
  const twoColumn = (measured ?? estimated) >= GROUP_COLUMNS_MIN_WIDTH;
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    // A panel hidden with display "none" reports zero width; keep the last real measurement.
    if (next > 0) setMeasured((current) => current === next ? current : next);
  };
  return (
    <View testID="project-detail-sections" onLayout={onLayout} style={styles.sections}>
      {sections.map((section) => <DetailSectionCard key={section.key} section={section} twoColumn={twoColumn} stacked={stacked} />)}
    </View>
  );
}

/** Estimation tab (admin payload): the estimate rows, or the model's empty state when there is no estimate. */
export function ProjectEstimatePanel({ estimate }: { readonly estimate: ProjectDetailEstimate }) {
  const stacked = useStackedRows();
  const empty = estimate.rows.length === 0;
  return (
    <View testID="project-estimate-panel" style={styles.card}>
      <ProjectCardHeader glyph="calculator" title="Estimate" subtitle="Status, value and approved baseline" />
      {empty && !estimate.emptyText ? null : (
        <View style={styles.cardBody}>
          {empty
            ? <Text testID="project-estimate-empty" style={styles.emptyText}>{estimate.emptyText}</Text>
            : <RowList rows={estimate.rows} emptyText={null} stacked={stacked} split={false} />}
        </View>
      )}
    </View>
  );
}

/** Team tab: named people only (the model never includes people known only by ID). */
export function ProjectTeamPanel({ people }: { readonly people: readonly ProjectDetailPerson[] }) {
  return (
    <View testID="project-team-panel" style={styles.card}>
      <ProjectCardHeader glyph="users" title="Team members" subtitle="People named on this project" />
      <View style={[styles.cardBody, styles.people]}>
        {people.length === 0 ? <Text style={styles.emptyText}>{NO_TEAM_MEMBERS}</Text> : people.map((person) => (
          <View key={person.key} testID={`project-team-person-${person.key}`} accessible accessibilityLabel={personLabel(person)} style={styles.person}>
            <Decorative style={styles.personMark}>
              <Text maxFontSizeMultiplier={1.4} style={styles.personInitial}>{person.initial}</Text>
            </Decorative>
            <View style={styles.personCopy}>
              <Text style={styles.personRole}>{person.role}</Text>
              <Text style={styles.personName}>{person.name}</Text>
              {person.detail ? <Text style={styles.personDetail}>{person.detail}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sections: { gap: projectDetailTheme.blockGap, minWidth: 0 },
  card: { overflow: "hidden", minWidth: 0, borderRadius: projectDetailTheme.cardRadius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardHeader: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, padding: CARD_PADDING },
  cardHeaderPressed: { backgroundColor: colors.surfaceMuted },
  iconChip: {
    width: projectDetailTheme.iconChipSize,
    height: projectDetailTheme.iconChipSize,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: projectDetailTheme.innerRadius,
    backgroundColor: projectDetailTheme.iconChip
  },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  cardSubtitle: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  chevron: { flexShrink: 0 },
  cardBody: {
    minWidth: 0,
    paddingTop: CARD_PADDING,
    paddingBottom: CARD_PADDING,
    paddingHorizontal: CARD_PADDING,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  groups: { gap: 16 },
  groupsColumns: { flexDirection: "row", flexWrap: "wrap" },
  group: { minWidth: 0 },
  groupHalf: { flexGrow: 1, flexBasis: "45%" },
  groupFull: { flexGrow: 1, flexBasis: "100%" },
  groupTitle: { marginBottom: 8, color: colors.inkMuted, fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 1.2, textTransform: "uppercase" },
  rows: {
    minWidth: 0,
    paddingHorizontal: 14,
    borderRadius: projectDetailTheme.innerRadius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  rowPair: { flexDirection: "row", columnGap: 24, minWidth: 0 },
  rowHalf: { flex: 1, minWidth: 0 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, minWidth: 0 },
  // Centred on a one-line row (48 min height, 12 padding); stays top-aligned when the text wraps.
  rowGlyph: { alignSelf: "flex-start", marginTop: 3, flexShrink: 0 },
  rowCopy: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  rowCopyStacked: { flexDirection: "column", gap: 2 },
  rowLabel: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  rowLabelSide: { flex: 0.9, minWidth: 0 },
  rowValueSide: { flex: 1.1, minWidth: 0 },
  rowValueStacked: { minWidth: 0 },
  rowValue: { color: colors.ink, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  rowNote: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  emptyText: { paddingVertical: 12, color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  people: { gap: 14 },
  person: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  personMark: { width: 40, height: 40, borderRadius: 20, flexShrink: 0, alignItems: "center", justifyContent: "center", backgroundColor: projectDetailTheme.personMark },
  personInitial: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  personCopy: { flex: 1, minWidth: 0, gap: 2 },
  personRole: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, letterSpacing: 0.6, textTransform: "uppercase" },
  personName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  personDetail: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 }
});
