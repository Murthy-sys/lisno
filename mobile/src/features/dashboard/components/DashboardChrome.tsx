import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";

import type { DashboardPeriod } from "../data";
import {
  dashboardColors as color,
  dashboardRadii as radius,
  dashboardSpacing as space,
  dashboardTypography as type
} from "../dashboardTheme";

export type DashboardQualityStatus = "complete" | "partial" | "unavailable";

export interface DashboardSelectorItem<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly shortLabel?: string;
  readonly available?: boolean;
}

export interface DashboardFact {
  readonly label: string;
  readonly value: string;
  readonly tone?: "default" | "positive" | "warning" | "danger" | "unavailable";
}

const statusCopy: Record<DashboardQualityStatus, string> = {
  complete: "Verified sources",
  partial: "Partial coverage",
  unavailable: "Sources unavailable"
};

const statusColor: Record<DashboardQualityStatus, string> = {
  complete: color.success,
  partial: color.warning,
  unavailable: color.unavailable
};

export function OperationsHeader({
  period,
  comparisonEnabled,
  observedLabel,
  rangeLabel,
  qualityStatus,
  qualityDetail,
  refreshing,
  onPeriodChange,
  onComparisonChange,
  onRefresh
}: {
  readonly period: DashboardPeriod;
  readonly comparisonEnabled: boolean;
  readonly observedLabel: string;
  readonly rangeLabel: string;
  readonly qualityStatus: DashboardQualityStatus;
  readonly qualityDetail: string;
  readonly refreshing: boolean;
  readonly onPeriodChange: (period: DashboardPeriod) => void;
  readonly onComparisonChange: (enabled: boolean) => void;
  readonly onRefresh: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTopline}>
        <View style={styles.liveLabel}>
          <View style={styles.liveMark} />
          <Text style={styles.eyebrow}>PORTFOLIO CONTROL</Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh dashboard"
          accessibilityRole="button"
          accessibilityState={{ busy: refreshing, disabled: refreshing }}
          disabled={refreshing}
          onPress={onRefresh}
          style={({ pressed }) => [styles.refreshButton, pressed ? styles.pressed : null]}
        >
          {refreshing ? (
            <ActivityIndicator color={color.text} size="small" />
          ) : (
            <Text accessibilityElementsHidden allowFontScaling={false} style={styles.refreshGlyph}>↻</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" style={styles.title}>Executive dashboard</Text>
        <Text style={styles.subtitle}>Authorized project, finance and workforce signals.</Text>
      </View>

      <View style={styles.periodRow}>
        <View accessibilityLabel="Reporting period" accessibilityRole="tablist" style={styles.periodControl}>
          {([7, 30, 90] as const).map((value) => {
            const selected = value === period;
            return (
              <Pressable
                key={value}
                accessibilityLabel={`${value} days`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => onPeriodChange(value)}
                style={({ pressed }) => [
                  styles.periodButton,
                  selected ? styles.periodButtonSelected : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={[styles.periodText, selected ? styles.periodTextSelected : null]}>{value}D</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityLabel="Compare with previous period"
          accessibilityRole="switch"
          accessibilityState={{ checked: comparisonEnabled }}
          onPress={() => onComparisonChange(!comparisonEnabled)}
          style={({ pressed }) => [styles.compareControl, pressed ? styles.pressed : null]}
        >
          <View style={[styles.switchTrack, comparisonEnabled ? styles.switchTrackSelected : null]}>
            <View style={[styles.switchThumb, comparisonEnabled ? styles.switchThumbSelected : null]} />
          </View>
          <Text style={styles.compareText}>Compare</Text>
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaCopy}>
          <Text style={styles.observed}>{observedLabel}</Text>
          <Text style={styles.range}>{rangeLabel}</Text>
        </View>
        <View
          accessibilityLabel={`${statusCopy[qualityStatus]}. ${qualityDetail}`}
          style={styles.quality}
        >
          <View style={[styles.qualityDot, { backgroundColor: statusColor[qualityStatus] }]} />
          <Text style={styles.qualityText}>{statusCopy[qualityStatus]}</Text>
        </View>
      </View>
    </View>
  );
}

export function FactRail({
  title,
  headline,
  headlineLabel,
  facts,
  style
}: {
  readonly title: string;
  readonly headline: string;
  readonly headlineLabel: string;
  readonly facts: readonly DashboardFact[];
  readonly accent?: "violet" | "cyan";
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.factRail, style]}>
      <View style={styles.factHeader}>
        <Text style={styles.factTitle}>{title.toUpperCase()}</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.factHeadline}>{headline}</Text>
        <Text style={styles.factHeadlineLabel}>{headlineLabel}</Text>
      </View>
      <View style={styles.factList}>
        {facts.map((fact) => (
          <View key={fact.label} style={styles.factItem}>
            <Text style={styles.factItemLabel}>{fact.label}</Text>
            <Text style={[styles.factItemValue, factToneStyle(fact.tone)]}>{fact.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function factToneStyle(tone: DashboardFact["tone"]) {
  if (tone === "positive") return styles.factPositive;
  if (tone === "warning") return styles.factWarning;
  if (tone === "danger") return styles.factDanger;
  if (tone === "unavailable") return styles.factUnavailable;
  return null;
}

export function DashboardSelector<T extends string>({
  accessibilityLabel,
  items,
  selected,
  onSelect,
  compact = false
}: {
  readonly accessibilityLabel: string;
  readonly items: readonly DashboardSelectorItem<T>[];
  readonly selected: T;
  readonly onSelect: (id: T) => void;
  readonly compact?: boolean;
}) {
  return (
    <ScrollView
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      contentContainerStyle={styles.selectorContent}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={styles.selector}
    >
      {items.map((item) => {
        const active = item.id === selected;
        const available = item.available !== false;
        return (
          <Pressable
            key={item.id}
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ disabled: false, selected: active }}
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => [
              styles.selectorButton,
              compact ? styles.selectorButtonCompact : null,
              active ? styles.selectorButtonSelected : null,
              !available ? styles.selectorButtonDisabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={[styles.selectorText, active ? styles.selectorTextSelected : null]}>
              {compact && item.shortLabel ? item.shortLabel : item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SceneFrame({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  footer,
  compact = false,
  testID,
  style
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly compact?: boolean;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.scene, compact ? styles.sceneCompact : null, style]} testID={testID}>
      <View style={styles.sceneHeader}>
        <View style={styles.sceneCopy}>
          <Text style={styles.sceneEyebrow}>{eyebrow}</Text>
          <Text accessibilityRole="header" style={styles.sceneTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sceneSubtitle}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={styles.sceneActions}>{actions}</View> : null}
      </View>
      <View style={styles.sceneBody}>{children}</View>
      {footer ? <View style={styles.sceneFooter}>{footer}</View> : null}
    </View>
  );
}

export function AvailabilityBanner({
  title,
  message,
  tone = "partial"
}: {
  readonly title: string;
  readonly message: string;
  readonly tone?: "partial" | "unavailable";
}) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.availability}>
      <View style={[styles.availabilityMark, tone === "unavailable" ? styles.availabilityMarkUnavailable : null]} />
      <View style={styles.availabilityCopy}>
        <Text style={styles.availabilityTitle}>{title}</Text>
        <Text style={styles.availabilityMessage}>{message}</Text>
      </View>
    </View>
  );
}

export function DashboardSkeleton() {
  return (
    <View accessibilityLabel="Loading dashboard" accessibilityRole="progressbar" style={styles.skeleton}>
      <View style={styles.skeletonHeader} />
      <View style={styles.skeletonMeta} />
      <View style={styles.skeletonFacts}>
        {Array.from({ length: 5 }, (_, index) => (
          <View
            key={index}
            style={[styles.skeletonFact, index === 4 ? styles.skeletonFactWide : null]}
          />
        ))}
      </View>
      <View style={styles.skeletonStage}>
        <View style={styles.skeletonPanelTitle} />
        <View style={[styles.skeletonBar, { width: "42%" }]} />
        <View style={[styles.skeletonBar, { width: "68%" }]} />
        <View style={[styles.skeletonBar, { width: "34%" }]} />
        <View style={[styles.skeletonBar, { width: "76%" }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space.md,
    paddingTop: space.md,
    paddingBottom: space.lg
  },
  headerTopline: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveMark: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.violet },
  eyebrow: { color: color.warning, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.5 },
  refreshButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.stageEdge,
    backgroundColor: color.stage
  },
  refreshGlyph: { color: color.text, fontFamily: type.medium, fontSize: 24, lineHeight: 28 },
  headerCopy: { gap: 5, maxWidth: 620 },
  title: { color: color.text, ...type.pageTitle },
  subtitle: { color: color.textMuted, ...type.body },
  periodRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  periodControl: {
    flexDirection: "row",
    minHeight: 48,
    padding: 3,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.stageEdge,
    backgroundColor: color.stage
  },
  periodButton: { minWidth: 54, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.control, paddingHorizontal: 8, paddingVertical: 8 },
  periodButtonSelected: { backgroundColor: color.violet },
  periodText: { color: color.textMuted, ...type.button },
  periodTextSelected: { color: color.primaryInk },
  compareControl: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 4 },
  compareText: { color: color.textMuted, ...type.button },
  switchTrack: { width: 42, height: 24, borderRadius: 12, padding: 3, backgroundColor: color.unavailable },
  switchTrackSelected: { backgroundColor: color.violet },
  switchThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.textMuted },
  switchThumbSelected: { alignSelf: "flex-end", backgroundColor: color.primaryInk },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: space.sm },
  metaCopy: { flex: 1, minWidth: 180, gap: 2 },
  observed: { color: color.text, ...type.metadata, fontFamily: type.medium },
  range: { color: color.textDim, fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  quality: {
    minHeight: 34,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.stageEdge,
    backgroundColor: color.stage
  },
  qualityDot: { width: 7, height: 7, borderRadius: 4 },
  qualityText: { flexShrink: 1, color: color.textMuted, fontFamily: type.medium, fontSize: 12, lineHeight: 18 },
  factRail: {
    minWidth: 0,
    flex: 1,
    position: "relative",
    flexDirection: "row",
    gap: space.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.stageEdge
  },
  factHeader: { minWidth: 96, flex: 0.9, gap: 2 },
  factTitle: { color: color.textDim, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.5 },
  factHeadline: { color: color.text, ...type.pageTitle },
  factHeadlineLabel: { color: color.textMuted, fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  factList: { minWidth: 72, flex: 1, justifyContent: "space-between", gap: 6 },
  factItem: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 5 },
  factItemLabel: { flexGrow: 1, flexShrink: 1, color: color.textDim, ...type.metadata },
  factItemValue: { flexShrink: 1, color: color.text, ...type.body, fontFamily: type.semibold },
  factPositive: { color: color.success },
  factWarning: { color: color.warning },
  factDanger: { color: color.dangerInk },
  factUnavailable: { color: color.textMuted },
  selector: { flexGrow: 0, marginHorizontal: -space.lg },
  selectorContent: { paddingHorizontal: space.lg, gap: 8 },
  selectorButton: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 15,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.stageEdge,
    backgroundColor: color.stage
  },
  selectorButtonCompact: { paddingHorizontal: 13 },
  selectorButtonSelected: { borderColor: color.violet, backgroundColor: color.violetDeep },
  selectorButtonDisabled: { backgroundColor: color.stageRaised },
  selectorText: { color: color.textMuted, ...type.button, fontFamily: type.medium },
  selectorTextSelected: { color: color.violetBright, fontFamily: type.semibold },
  scene: {
    position: "relative",
    overflow: "hidden",
    gap: space.md,
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: color.stageEdge,
    backgroundColor: color.stage,
    paddingTop: space.xl
  },
  sceneCompact: { borderRadius: radius.surface },
  sceneHeader: { paddingHorizontal: space.lg, flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  sceneCopy: { flex: 1, gap: 3 },
  sceneEyebrow: { color: color.warning, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.5 },
  sceneTitle: { color: color.text, ...type.sectionTitle },
  sceneSubtitle: { color: color.textMuted, ...type.body, maxWidth: 620 },
  sceneActions: { alignItems: "flex-end" },
  sceneBody: { minHeight: 40 },
  sceneFooter: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.stageLine,
    backgroundColor: color.stageRaised
  },
  availability: {
    flexDirection: "row",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.control,
    borderColor: color.stageEdge,
    backgroundColor: color.goldSoft
  },
  availabilityMark: { width: 5, height: 5, borderRadius: 3, marginTop: 7, backgroundColor: color.warning },
  availabilityMarkUnavailable: { backgroundColor: color.unavailable },
  availabilityCopy: { flex: 1, gap: 2 },
  availabilityTitle: { color: color.text, ...type.body, fontFamily: type.semibold },
  availabilityMessage: { color: color.textMuted, ...type.metadata },
  skeleton: { gap: space.lg, paddingTop: space.xl },
  skeletonHeader: { width: "64%", height: 42, borderRadius: 8, backgroundColor: color.stageRaised },
  skeletonMeta: { width: "46%", height: 14, borderRadius: 7, backgroundColor: color.stage },
  skeletonFacts: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  skeletonFact: { flexBasis: "47%", flexGrow: 1, height: 112, borderRadius: radius.surface, backgroundColor: color.stage },
  skeletonFactWide: { flexBasis: "100%" },
  skeletonStage: {
    height: 250,
    position: "relative",
    overflow: "hidden",
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: color.stageEdge,
    backgroundColor: color.stage
  },
  skeletonPanelTitle: { width: "44%", height: 20, margin: 20, borderRadius: 10, backgroundColor: color.canvasDeep },
  skeletonBar: { height: 20, marginLeft: 20, marginBottom: 14, borderRadius: 6, backgroundColor: color.sageSoft },
  pressed: { opacity: 0.72 }
});
