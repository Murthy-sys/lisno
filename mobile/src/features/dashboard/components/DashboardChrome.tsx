import { useId, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle
} from "react-native";

import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import type { DashboardPeriod } from "../data";
import {
  dashboardColors as color,
  dashboardRadii as radius,
  dashboardSpacing as space,
  dashboardSurfaceDepth,
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

export function OperationsHeader({
  period,
  comparisonEnabled,
  observedLabel,
  rangeLabel,
  qualityStatus,
  qualityDetail,
  refreshing,
  greeting,
  currentRangeLabel,
  previousRangeLabel,
  partialFinalDay = false,
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
  readonly greeting?: string;
  readonly currentRangeLabel?: string;
  readonly previousRangeLabel?: string;
  readonly partialFinalDay?: boolean;
  readonly onPeriodChange: (period: DashboardPeriod) => void;
  readonly onComparisonChange: (enabled: boolean) => void;
  readonly onRefresh: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 370 || fontScale >= 1.25;
  const heroId = useId().replace(/:/g, "");
  const timeBasis = `Times in UTC${partialFinalDay ? " · Final day is partial" : ""}`;

  return (
    <View style={styles.header}>
      <View style={styles.hero}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            accessible={false}
            resizeMode="cover"
            source={require("../../../../assets/brand/dashboard-interior.jpg")}
            style={styles.heroPhoto}
          />
          <Svg height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill} width="100%">
            <Defs>
              <LinearGradient id={`${heroId}-horizontal`} x1="0%" x2="100%" y1="0%" y2="0%">
                <Stop offset="0%" stopColor={color.canvas} stopOpacity={1} />
                <Stop offset="38%" stopColor={color.canvas} stopOpacity={0.97} />
                <Stop offset="65%" stopColor={color.canvas} stopOpacity={0.63} />
                <Stop offset="100%" stopColor={color.canvas} stopOpacity={0.02} />
              </LinearGradient>
              <LinearGradient id={`${heroId}-vertical`} x1="0%" x2="0%" y1="0%" y2="100%">
                <Stop offset="45%" stopColor={color.canvas} stopOpacity={0} />
                <Stop offset="100%" stopColor={color.canvas} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect fill={`url(#${heroId}-horizontal)`} height="100%" width="100%" />
            <Rect fill={`url(#${heroId}-vertical)`} height="100%" width="100%" />
          </Svg>
        </View>
        <View style={[styles.headerCopy, stacked ? styles.headerCopyStacked : null]}>
          {greeting ? <Text style={styles.greeting}>{greeting}</Text> : null}
          <Text accessibilityLabel="Executive dashboard" accessibilityRole="header" style={styles.title}>{"Executive\ndashboard"}</Text>
          <Text style={styles.subtitle}>Authorized project, finance and workforce signals.</Text>
        </View>
      </View>

      <View style={styles.reportingCard}>
        <View style={[styles.reportingRow, stacked ? styles.reportingRowStacked : null]} testID="dashboard-reporting-dates">
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
          <View style={[styles.dateGroup, stacked ? styles.dateGroupStacked : null]}>
            <Svg accessible={false} height={22} viewBox="0 0 24 24" width={22}>
              <Path d="M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1ZM4 10h16M8 3v4m8-4v4m-8 8 2 2 5-5" fill="none" stroke={color.text} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} />
            </Svg>
            <View style={styles.dateCopy}>
              <Text style={styles.currentRange}>{currentRangeLabel ?? rangeLabel}</Text>
              {comparisonEnabled && previousRangeLabel ? <Text style={styles.previousRange}>Prev: {previousRangeLabel}</Text> : null}
              <Text accessibilityLabel={`${statusCopy[qualityStatus]}. ${qualityDetail}. ${timeBasis}`} style={styles.timeBasis}>{timeBasis}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.reportingBottomRow, stacked ? styles.reportingRowStacked : null]} testID="dashboard-reporting-updates">
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
            <Text style={styles.compareText}>Compare periods</Text>
          </Pressable>
          <View style={[styles.updateGroup, stacked ? styles.updateGroupStacked : null]}>
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
                <Svg accessible={false} height={25} viewBox="0 0 24 24" width={25}>
                  <Path d="M19 8a8 8 0 1 1-6-4m0-2v5l4-3" fill="none" stroke={color.text} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} />
                </Svg>
              )}
            </Pressable>
            <View style={styles.updatedCopy}>
              <Text style={styles.updatedLabel}>Last updated</Text>
              <Text style={styles.observed}>{observedLabel}</Text>
            </View>
          </View>
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
  tone = "partial",
  actionLabel,
  onAction
}: {
  readonly title: string;
  readonly message: string;
  readonly tone?: "partial" | "unavailable";
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 370 || fontScale >= 1.25;

  return (
    <View accessibilityLiveRegion="polite" style={[styles.availability, stacked ? styles.availabilityStacked : null]}>
      <View style={styles.availabilityMain}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.availabilityMark, tone === "unavailable" ? styles.availabilityMarkUnavailable : null]}>
          <Text allowFontScaling={false} style={styles.availabilityGlyph}>!</Text>
        </View>
        <View style={styles.availabilityCopy}>
          <Text style={styles.availabilityTitle}>{title}</Text>
          <Text style={styles.availabilityMessage}>{message}</Text>
        </View>
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.availabilityAction, pressed ? styles.pressed : null]}>
          <Text style={styles.availabilityActionText}>{actionLabel}</Text>
          <Svg accessible={false} height={17} viewBox="0 0 24 24" width={17}>
            <Path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke={color.warning} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} />
          </Svg>
        </Pressable>
      ) : null}
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
  header: { gap: 0 },
  hero: {
    minHeight: 180,
    marginHorizontal: -16,
    overflow: "hidden",
    backgroundColor: color.canvas
  },
  heroPhoto: { position: "absolute", top: 0, right: 0, bottom: 0, width: "80%", height: "100%" },
  headerCopy: { gap: 4, paddingTop: 14, paddingBottom: 18, paddingHorizontal: 24, maxWidth: 360 },
  headerCopyStacked: { maxWidth: "100%" },
  greeting: { color: color.textMuted, fontFamily: type.displayItalic, fontSize: 14, lineHeight: 20 },
  title: { color: color.text, fontFamily: type.display, fontSize: 36, lineHeight: 38, letterSpacing: -0.8 },
  subtitle: { color: color.textMuted, fontFamily: type.display, fontSize: 16, lineHeight: 20, maxWidth: 260, marginTop: 1 },
  reportingCard: {
    ...dashboardSurfaceDepth,
    marginTop: -10,
    borderRadius: radius.surface,
    borderWidth: 1,
    borderColor: "rgba(217,220,207,0.65)",
    backgroundColor: "rgba(251,250,246,0.94)",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6
  },
  reportingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  reportingRowStacked: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  periodControl: {
    flexDirection: "row",
    alignSelf: "flex-start",
    minHeight: 48,
    padding: 1,
    borderRadius: radius.control,
    backgroundColor: color.stageRaised
  },
  periodButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.control, paddingHorizontal: 7, paddingVertical: 8 },
  periodButtonSelected: { backgroundColor: color.violet },
  periodText: { color: color.text, fontFamily: type.medium, fontSize: 13, lineHeight: 19 },
  periodTextSelected: { color: color.primaryInk },
  dateGroup: { minWidth: 0, flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.stageEdge, paddingLeft: 9 },
  dateGroupStacked: { flex: 0, borderLeftWidth: 0, paddingLeft: 3 },
  dateCopy: { flex: 1, minWidth: 0, gap: 1 },
  currentRange: { color: color.text, fontFamily: type.medium, fontSize: 11, lineHeight: 16 },
  previousRange: { color: color.textMuted, fontFamily: type.regular, fontSize: 10, lineHeight: 15 },
  reportingBottomRow: { marginTop: 3, paddingTop: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.stageEdge, flexDirection: "row", alignItems: "center", gap: 6 },
  compareControl: { minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 3 },
  compareText: { flexShrink: 1, color: color.text, fontFamily: type.regular, fontSize: 12, lineHeight: 18 },
  switchTrack: { width: 42, height: 24, borderRadius: 12, padding: 3, backgroundColor: color.unavailable },
  switchTrackSelected: { backgroundColor: color.violet },
  switchThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.primaryInk },
  switchThumbSelected: { alignSelf: "flex-end" },
  updateGroup: { minWidth: 0, flex: 1.15, flexDirection: "row", alignItems: "center", gap: 2, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.stageEdge },
  updateGroupStacked: { flex: 0, borderLeftWidth: 0 },
  refreshButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.control },
  updatedCopy: { minWidth: 0, flex: 1 },
  updatedLabel: { color: color.textMuted, fontFamily: type.regular, fontSize: 10, lineHeight: 15 },
  observed: { color: color.textMuted, fontFamily: type.regular, fontSize: 10, lineHeight: 15 },
  timeBasis: { color: color.textMuted, fontFamily: type.regular, fontSize: 9, lineHeight: 12 },
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
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radius.surface,
    borderColor: "rgba(200,170,124,0.35)",
    backgroundColor: color.goldSoft
  },
  availabilityStacked: { alignItems: "stretch", flexDirection: "column", gap: 4 },
  availabilityMain: { minWidth: 0, flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  availabilityMark: { width: 22, height: 22, borderRadius: 11, marginTop: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.warning },
  availabilityMarkUnavailable: { backgroundColor: color.unavailable },
  availabilityGlyph: { color: color.primaryInk, fontFamily: type.semibold, fontSize: 16, lineHeight: 21 },
  availabilityCopy: { minWidth: 0, flex: 1, gap: 2 },
  availabilityTitle: { color: color.text, fontFamily: type.medium, fontSize: 14, lineHeight: 20 },
  availabilityMessage: { color: color.textMuted, fontFamily: type.regular, fontSize: 11, lineHeight: 16 },
  availabilityAction: { minHeight: 48, alignSelf: "center", maxWidth: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 3 },
  availabilityActionText: { flexShrink: 1, color: color.warning, fontFamily: type.medium, fontSize: 11, lineHeight: 17 },
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
