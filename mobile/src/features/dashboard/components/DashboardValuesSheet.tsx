import { memo, useCallback, useMemo } from "react";
import { Modal, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { DashboardTimeBasis, DashboardValueUnit } from "../data";
import {
  dashboardColors as color,
  dashboardSpacing as space,
  dashboardTypography as type
} from "../dashboardTheme";

export interface DashboardValueRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly unit: DashboardValueUnit;
  readonly timeBasis: DashboardTimeBasis;
  readonly unavailable?: boolean;
}

export interface DashboardValueGroup {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly rows: readonly DashboardValueRow[];
}

interface DashboardValueSection extends DashboardValueGroup {
  readonly data: readonly DashboardValueRow[];
  readonly first: boolean;
}

const unitCopy: Readonly<Record<DashboardValueUnit, string>> = {
  count: "Count",
  paise: "Money · source unit paise",
  basis_points: "Rate · source unit basis points",
  days: "Days"
};

const timeBasisCopy: Readonly<Record<DashboardTimeBasis, string>> = {
  snapshot: "Current stored snapshot",
  current_state: "Current stored state",
  event_window: "Selected UTC event window",
  utc_day: "UTC calendar day"
};

function rowMetadata(row: DashboardValueRow): string {
  return `Unit: ${unitCopy[row.unit]} · Time basis: ${timeBasisCopy[row.timeBasis]}`;
}

const DashboardValueRowView = memo(function DashboardValueRowView({
  row,
  last
}: {
  readonly row: DashboardValueRow;
  readonly last: boolean;
}) {
  return (
    <View
      accessibilityLabel={`${row.label}: ${row.value}. ${rowMetadata(row)}${row.detail ? `. ${row.detail}` : ""}`}
      style={[styles.row, last ? styles.rowLast : null]}
    >
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{row.label}</Text>
        <Text style={styles.rowMetadata}>{rowMetadata(row)}</Text>
        {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
      </View>
      <Text style={[styles.rowValue, row.unavailable ? styles.rowValueUnavailable : null]}>
        {row.value}
      </Text>
    </View>
  );
});

function LedgerFootnote() {
  return (
    <Text style={styles.footnote}>
      Snapshot values describe the current stored state. Period activity uses the UTC ranges above. Money is calculated in paise and formatted only for display.
    </Text>
  );
}

export function DashboardValuesSheet({
  visible,
  observedLabel,
  rangeLabel,
  groups,
  onRequestClose
}: {
  readonly visible: boolean;
  readonly observedLabel: string;
  readonly rangeLabel: string;
  readonly groups: readonly DashboardValueGroup[];
  readonly onRequestClose: () => void;
}) {
  const sections: readonly DashboardValueSection[] = useMemo(
    () => groups.map((group, index) => ({
      ...group,
      data: group.rows,
      first: index === 0
    })),
    [groups]
  );
  const renderRow = useCallback(
    ({ item: row, index, section }: { readonly item: DashboardValueRow; readonly index: number; readonly section: DashboardValueSection }) => (
      <DashboardValueRowView last={index === section.data.length - 1} row={row} />
    ),
    []
  );
  const renderGroupHeader = useCallback(
    ({ section }: { readonly section: DashboardValueSection }) => (
      <View style={[styles.groupHeader, section.first ? styles.groupFirst : null]}>
        <Text accessibilityRole="header" style={styles.groupTitle}>{section.title}</Text>
        {section.description ? <Text style={styles.groupDescription}>{section.description}</Text> : null}
      </View>
    ),
    []
  );

  return (
    <Modal
      animationType="fade"
      onRequestClose={onRequestClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <SafeAreaView edges={["top", "right", "bottom", "left"]} style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close all dashboard values"
          accessibilityRole="button"
          onPress={onRequestClose}
          style={styles.backdrop}
        />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>VERIFIED VALUES</Text>
              <Text accessibilityRole="header" style={styles.title}>Dashboard ledger</Text>
              <Text style={styles.meta}>{observedLabel}</Text>
              <Text style={styles.range}>{rangeLabel}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close dashboard values"
              accessibilityRole="button"
              onPress={onRequestClose}
              style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
            >
              <Text accessibilityElementsHidden style={styles.closeGlyph}>×</Text>
            </Pressable>
          </View>
          <SectionList<DashboardValueRow, DashboardValueSection>
            contentContainerStyle={styles.content}
            initialNumToRender={18}
            keyExtractor={(row) => row.id}
            keyboardShouldPersistTaps="handled"
            maxToRenderPerBatch={18}
            renderItem={renderRow}
            renderSectionHeader={renderGroupHeader}
            sections={sections}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            ListFooterComponent={LedgerFootnote}
            windowSize={7}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "transparent" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: color.scrim },
  sheet: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "91%",
    alignSelf: "center",
    overflow: "hidden",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: color.stageEdge,
    backgroundColor: color.stage
  },
  handle: { width: 42, height: 4, alignSelf: "center", marginTop: 9, borderRadius: 2, backgroundColor: color.unavailable },
  header: {
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.stageLine
  },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { color: color.gold, fontFamily: type.semibold, fontSize: 9, letterSpacing: 1.8 },
  title: { color: color.text, fontFamily: type.semibold, fontSize: 24, lineHeight: 31, letterSpacing: -0.5 },
  meta: { color: color.textMuted, fontFamily: type.medium, fontSize: 11 },
  range: { color: color.textDim, fontFamily: type.regular, fontSize: 10, lineHeight: 15 },
  close: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 23,
    borderWidth: 1,
    borderColor: color.stageEdge
  },
  closeGlyph: { color: color.text, fontFamily: type.regular, fontSize: 30, lineHeight: 32 },
  content: { paddingHorizontal: space.lg, paddingBottom: space.huge },
  groupFirst: { borderTopWidth: 0 },
  groupHeader: {
    gap: 3,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.stageLine,
    backgroundColor: color.stage
  },
  groupTitle: { color: color.text, fontFamily: type.semibold, fontSize: 16 },
  groupDescription: { color: color.textMuted, fontFamily: type.regular, fontSize: 10, lineHeight: 15 },
  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.stageLine
  },
  rowLast: { borderBottomWidth: 0 },
  rowCopy: { flex: 1, paddingVertical: space.xs, gap: 2 },
  rowLabel: { color: color.textMuted, fontFamily: type.medium, fontSize: 11 },
  rowMetadata: { color: color.violetBright, fontFamily: type.medium, fontSize: 8, lineHeight: 13 },
  rowDetail: { color: color.textDim, fontFamily: type.regular, fontSize: 9, lineHeight: 14 },
  rowValue: { maxWidth: "45%", color: color.text, fontFamily: type.semibold, fontSize: 13, textAlign: "right" },
  rowValueUnavailable: { color: color.unavailable, fontFamily: type.medium, fontSize: 11 },
  footnote: { color: color.textDim, fontFamily: type.regular, fontSize: 9, lineHeight: 15, paddingTop: space.lg },
  pressed: { opacity: 0.68 }
});
